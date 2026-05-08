import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

const GQL_QUERY = `
  query validateDiscount($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          __typename
          title
          status
          usageLimit
          asyncUsageCount
          startsAt
          endsAt
          appliesOncePerCustomer
          minimumRequirement {
            ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
            ... on DiscountMinimumSubtotal {
              greaterThanOrEqualToSubtotal { amount currencyCode }
            }
          }
          customerGets {
            value {
              ... on DiscountPercentage { percentage }
              ... on DiscountAmount {
                amount { amount currencyCode }
                appliesOnEachItem
              }
            }
            items {
              ... on AllDiscountItems { allItems }
              ... on DiscountProducts {
                products(first: 100) { nodes { id } }
                productVariants(first: 100) { nodes { id } }
              }
              ... on DiscountCollections {
                collections(first: 50) { nodes { id } }
              }
            }
          }
        }
        ... on DiscountCodeBxgy {
          __typename
          title
          status
          usageLimit
          asyncUsageCount
          startsAt
          endsAt
          appliesOncePerCustomer
          customerBuys {
            value { ... on DiscountQuantity { quantity } }
            items {
              ... on AllDiscountItems { allItems }
              ... on DiscountProducts { products(first: 100) { nodes { id } } }
              ... on DiscountCollections { collections(first: 50) { nodes { id } } }
            }
          }
          customerGets {
            value {
              ... on DiscountQuantity { quantity }
              ... on DiscountPercentage { percentage }
            }
            items {
              ... on AllDiscountItems { allItems }
              ... on DiscountProducts { products(first: 100) { nodes { id } } }
              ... on DiscountCollections { collections(first: 50) { nodes { id } } }
            }
          }
        }
        ... on DiscountCodeFreeShipping {
          __typename
          title
          status
          usageLimit
          asyncUsageCount
          startsAt
          endsAt
          minimumRequirement {
            ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
            ... on DiscountMinimumSubtotal {
              greaterThanOrEqualToSubtotal { amount currencyCode }
            }
          }
        }
      }
    }
  }
`;

/* Refreshes an expired access token using the stored refresh token.
   Returns the new access token string, or null if refresh fails. */
async function tryRefreshToken(session) {
  if (!session.refreshToken) return null;
  try {
    const res = await fetch("https://shopify.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;

    await prisma.session.update({
      where: { id: session.id },
      data: {
        accessToken: data.access_token,
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
        ...(data.expires_in
          ? { expires: new Date(Date.now() + data.expires_in * 1000) }
          : {}),
      },
    });
    return data.access_token;
  } catch (e) {
    console.error("[EdgeCart] Token refresh failed:", e?.message);
    return null;
  }
}

/* Gets shop + a valid access token, refreshing if expired. */
async function getShopAndToken(request) {
  let shop = null;

  // Get shop from app proxy auth (validates Shopify HMAC)
  try {
    const { session } = await authenticate.public.appProxy(request);
    if (session?.shop) shop = session.shop;
  } catch (_) {}

  // Fallback: shop from URL params (always present in Shopify proxy requests)
  if (!shop) {
    const url = new URL(request.url);
    shop = url.searchParams.get("shop");
  }

  if (!shop) return null;

  // Look up the offline session for this shop
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { id: "asc" },
  });

  if (!session?.accessToken) return null;

  // If token is not expired, use it directly
  const isExpired = session.expires && new Date(session.expires) < new Date();
  if (!isExpired) {
    return { shop, token: session.accessToken };
  }

  // Token expired — try to refresh
  const newToken = await tryRefreshToken(session);
  return { shop, token: newToken || session.accessToken };
}

/* Calls Shopify Admin GraphQL. Returns parsed JSON or throws. */
async function callShopifyGQL(shop, token, code) {
  const res = await fetch(
    `https://${shop}/admin/api/2025-10/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: GQL_QUERY, variables: { code } }),
    }
  );

  if (res.status === 401) {
    throw Object.assign(new Error("Token expired or invalid"), { code: 401 });
  }
  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status}`);
  }

  return res.json();
}

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const rawCode = (url.searchParams.get("code") || "").trim();

    if (!rawCode) {
      return respond({ valid: false, reason: "No discount code provided" });
    }

    const ctx = await getShopAndToken(request);
    if (!ctx) {
      return respond({ valid: false, reason: "Shop session not found. Please reload the page." });
    }

    let { shop, token } = ctx;
    let gqlJson;

    try {
      gqlJson = await callShopifyGQL(shop, token, rawCode);
    } catch (err) {
      if (err.code === 401) {
        // Token was expired and refresh either wasn't attempted or failed.
        // Try one more time with the raw session token as last resort.
        console.warn("[EdgeCart] 401 on discount lookup — session may need re-auth");
        return respond({ valid: false, reason: "Session expired. Please reload the page and try again." });
      }
      throw err;
    }

    if (gqlJson.errors?.length) {
      const msg = gqlJson.errors[0]?.message || "";
      console.warn("[EdgeCart] GraphQL error:", msg);
      if (/access denied|forbidden|read_discounts/i.test(msg)) {
        return respond({ valid: false, reason: "Missing read_discounts scope — please reinstall the app." });
      }
      return respond({ valid: false, reason: "Could not validate discount code. Please try again." });
    }

    const node = gqlJson.data?.codeDiscountNodeByCode;
    if (!node) {
      return respond({ valid: false, reason: "Discount code not found" });
    }

    const d = node.codeDiscount;
    if (!d) {
      return respond({ valid: false, reason: "Invalid discount code" });
    }

    const now = new Date();
    if (d.status === "EXPIRED" || (d.endsAt && new Date(d.endsAt) < now)) {
      return respond({ valid: false, reason: "This discount code has expired" });
    }
    if (d.status === "SCHEDULED" || (d.startsAt && new Date(d.startsAt) > now)) {
      return respond({ valid: false, reason: "This discount code is not yet active" });
    }
    if (d.status !== "ACTIVE") {
      return respond({ valid: false, reason: "This discount code is not active" });
    }
    if (d.usageLimit != null && (d.asyncUsageCount ?? 0) >= d.usageLimit) {
      return respond({ valid: false, reason: "This discount code has reached its usage limit" });
    }

    let minimumRequirement = null;
    if (d.minimumRequirement) {
      const mr = d.minimumRequirement;
      if (mr.greaterThanOrEqualToQuantity !== undefined) {
        minimumRequirement = { type: "quantity", quantity: parseInt(mr.greaterThanOrEqualToQuantity, 10) };
      } else if (mr.greaterThanOrEqualToSubtotal?.amount !== undefined) {
        minimumRequirement = {
          type: "subtotal",
          subtotal: parseFloat(mr.greaterThanOrEqualToSubtotal.amount),
          currencyCode: mr.greaterThanOrEqualToSubtotal.currencyCode || "USD",
        };
      }
    }

    const typeName = d.__typename;
    let type = "free_shipping";
    let value = 0;
    let appliesToAll = true;
    let productIds = [];
    let variantIds = [];
    let collectionIds = [];
    let appliesOnEachItem = false;
    let description = "";

    if (typeName === "DiscountCodeBasic") {
      const val   = d.customerGets?.value;
      const items = d.customerGets?.items;
      if (val?.percentage !== undefined) {
        type        = "percentage";
        value       = val.percentage;
        description = `${Math.round(val.percentage * 100)}% off`;
      } else if (val?.amount?.amount !== undefined) {
        type              = "fixed_amount";
        value             = Math.round(parseFloat(val.amount.amount) * 100);
        appliesOnEachItem = val.appliesOnEachItem ?? false;
        description       = `$${parseFloat(val.amount.amount).toFixed(2)} off${appliesOnEachItem ? " each item" : ""}`;
      }
      if (items?.allItems) {
        appliesToAll = true;
        description += " your order";
      } else if (items?.products) {
        appliesToAll = false;
        productIds   = (items.products.nodes ?? []).map((n) => n.id);
        variantIds   = (items.productVariants?.nodes ?? []).map((n) => n.id);
        description += " on select items";
      } else if (items?.collections) {
        appliesToAll  = false;
        collectionIds = (items.collections.nodes ?? []).map((n) => n.id);
        description  += " on select collections";
      } else {
        appliesToAll = true;
        description += " your order";
      }
    } else if (typeName === "DiscountCodeBxgy") {
      type         = "bxgy";
      appliesToAll = false;
      const buyQty = d.customerBuys?.value?.quantity;
      const getQty = d.customerGets?.value?.quantity;
      const getPct = d.customerGets?.value?.percentage;
      description  = buyQty && getQty
        ? `Buy ${buyQty} Get ${getQty}${getPct ? ` (${Math.round(getPct * 100)}% off)` : " Free"}`
        : "Buy X Get Y discount";
      if (d.customerBuys?.items?.products) {
        productIds = (d.customerBuys.items.products.nodes ?? []).map((n) => n.id);
      }
    } else {
      type        = "free_shipping";
      description = "Free shipping";
    }

    return respond({
      valid: true,
      type,
      value,
      appliesToAll,
      productIds,
      variantIds,
      collectionIds,
      appliesOnEachItem,
      minimumRequirement,
      title: d.title || rawCode.toUpperCase(),
      description,
      endsAt: d.endsAt ?? null,
      usageLimit: d.usageLimit ?? null,
      asyncUsageCount: d.asyncUsageCount ?? 0,
      appliesOncePerCustomer: d.appliesOncePerCustomer ?? false,
    });

  } catch (err) {
    console.error("[EdgeCart] Discount validation error:", err?.message || err);
    return respond({ valid: false, reason: "Could not validate discount code. Please try again." });
  }
};
