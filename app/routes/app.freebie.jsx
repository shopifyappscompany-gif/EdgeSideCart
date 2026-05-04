import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.cartSettings.findUnique({ where: { shop: session.shop } });
  return { settings };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "createFreebieProduct") {
    const sourceTitle = String(form.get("sourceTitle") || "Free Gift");
    const sourceImageUrl = form.get("sourceImageUrl") ? String(form.get("sourceImageUrl")) : null;

    try {
    // Step 0: Find the Online Store publication ID so we can publish the product to storefront
    let onlineStorePubId = null;
    try {
      const pubRes = await admin.graphql(`#graphql
        query getPublications { publications(first: 20) { nodes { id name } } }`);
      const pubJson = await pubRes.json();
      const pubs = pubJson.data?.publications?.nodes || [];
      const osPub = pubs.find((p) => p.name === "Online Store") || pubs[0];
      onlineStorePubId = osPub?.id || null;
    } catch (_) {}

    // Step 1: Create the product
    const createRes = await admin.graphql(
      `#graphql
      mutation createFreebieProduct($input: ProductCreateInput!) {
        productCreate(product: $input) {
          product {
            id
            variants(first: 1) { edges { node { id } } }
            featuredImage { url }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            title: `${sourceTitle} — Free Gift`,
            status: "ACTIVE",
            // edge-cart-hidden lets merchants use Search & Discovery app to exclude this tag
            tags: ["edge-cart-freebie", "edge-cart-hidden", "noindex"],
          },
        },
      }
    );

    const createJson = await createRes.json();
    const createErrors = createJson.data?.productCreate?.userErrors;
    if (createErrors?.length) return { error: createErrors[0].message };

    const product = createJson.data?.productCreate?.product;
    const variantId = product?.variants?.edges?.[0]?.node?.id;
    const productId = product?.id;
    let imageUrl = sourceImageUrl || null;

    if (!variantId || !productId) return { error: "Failed to create freebie product." };

    // Step 1b: Attach source image to the new product so it shows in cart line items
    if (sourceImageUrl) {
      try {
        const mediaRes = await admin.graphql(
          `#graphql
          mutation attachFreebieImage($productId: ID!, $media: [CreateMediaInput!]!) {
            productCreateMedia(productId: $productId, media: $media) {
              media {
                ... on MediaImage {
                  image { url }
                }
              }
              mediaUserErrors { field message }
            }
          }`,
          {
            variables: {
              productId,
              media: [{ mediaContentType: "IMAGE", originalSource: sourceImageUrl, alt: sourceTitle + " — Free Gift" }],
            },
          }
        );
        const mediaJson = await mediaRes.json();
        const attachedUrl = mediaJson.data?.productCreateMedia?.media?.[0]?.image?.url;
        if (attachedUrl) imageUrl = attachedUrl;
      } catch (_) {}
    }

    // Step 2: Set variant price to $0.00 + always allow purchase (inventoryPolicy: CONTINUE)
    const updateRes = await admin.graphql(
      `#graphql
      mutation updateFreebieVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id price }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          productId,
          variants: [{ id: variantId, price: "0.00", inventoryPolicy: "CONTINUE" }],
        },
      }
    );
    const updateJson = await updateRes.json();
    const updateErrors = updateJson.data?.productVariantsBulkUpdate?.userErrors;
    if (updateErrors?.length) return { error: updateErrors[0].message };

    // Step 3: Publish to Online Store so the storefront /cart/add.js can add it
    if (onlineStorePubId) {
      try {
        await admin.graphql(
          `#graphql
          mutation publishFreebie($id: ID!, $input: PublishablePublishInput!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { field message }
            }
          }`,
          { variables: { id: productId, input: { publicationIds: [onlineStorePubId] } } }
        );
      } catch (_) {}
    }

    // Step 4: Set seo.hidden metafield — Shopify OS 2.0 standard to noindex the product
    // page and exclude it from Search & Discovery / Google Shopping results.
    try {
      await admin.graphql(
        `#graphql
        mutation setFreebieMetafields($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
        {
          variables: {
            metafields: [
              {
                ownerId: productId,
                namespace: "seo",
                key: "hidden",
                value: "1",
                type: "number_integer",
              },
            ],
          },
        }
      );
    } catch (_) {}

    await prisma.cartSettings.upsert({
      where: { shop },
      create: { shop, freebieProductVariantId: variantId, freebieProductTitle: sourceTitle, freebieProductImageUrl: imageUrl },
      update: { freebieProductVariantId: variantId, freebieProductTitle: sourceTitle, freebieProductImageUrl: imageUrl },
    });

    return {
      success: true,
      message: "Free gift product created and saved!",
      freebieVariantId: variantId,
      freebieProductTitle: sourceTitle,
      freebieProductImageUrl: imageUrl,
    };
    } catch (err) {
      console.error("[EdgeCart] Freebie creation error:", err);
      const msg = String(err?.message || "");
      if (msg.includes("access token") || msg.includes("Missing access token")) {
        return {
          error:
            "Session expired — please refresh the page and try again. If the error persists, re-install the app from your Shopify Partner Dashboard.",
        };
      }
      return { error: msg || "Failed to create freebie product. Please try again." };
    }
  }

  // Save freebie settings
  const freebieTriggerType = String(form.get("freebieTriggerType") || "cartValue");

  const maxCartRaw = form.get("freebieMaxCartValue");
  const freebieMaxCartValue = maxCartRaw && String(maxCartRaw).trim() !== "" ? parseFloat(maxCartRaw) : null;

  const maxQtyRaw = form.get("freebieMaxQuantity");
  const freebieMaxQuantity = maxQtyRaw && String(maxQtyRaw).trim() !== "" ? parseInt(maxQtyRaw, 10) : null;

  const freebieConditionLogic = String(form.get("freebieConditionLogic") || "AND");
  const freebieTriggerCollectionIdsRaw = String(form.get("freebieTriggerCollectionIds") || "[]");
  const triggerCollections = safeJSON(freebieTriggerCollectionIdsRaw, []);

  let triggerProductsArr = safeJSON(String(form.get("freebieTriggerProductIds") || "[]"), []);

  // Resolve collection product IDs and merge — works for all trigger types
  if (triggerCollections.length > 0) {
    for (const col of triggerCollections) {
      try {
        const colRes = await admin.graphql(
          `#graphql
          query GetCollectionProducts($id: ID!) {
            collection(id: $id) {
              products(first: 250) { nodes { id title } }
            }
          }`,
          { variables: { id: col.id } }
        );
        const colJson = await colRes.json();
        const colProducts = colJson.data?.collection?.products?.nodes || [];
        for (const p of colProducts) {
          if (!triggerProductsArr.find((e) => e.id === p.id)) {
            triggerProductsArr.push({ id: p.id, title: p.title });
          }
        }
      } catch (_) {}
    }
  }

  const data = {
    freebieEnabled: form.get("freebieEnabled") === "true",
    freebieTitle: String(form.get("freebieTitle") || "🎁 You've earned a free gift!"),
    freebieTriggerType,
    freebieMinCartValue: parseFloat(form.get("freebieMinCartValue") || "100"),
    freebieMaxCartValue,
    freebieMinQuantity: parseInt(form.get("freebieMinQuantity") || "3", 10),
    freebieMaxQuantity,
    freebieConditionLogic,
    freebieTriggerProductIds: JSON.stringify(triggerProductsArr),
    freebieTriggerCollectionIds: freebieTriggerCollectionIdsRaw,
    freebieConfettiEnabled: form.get("freebieConfettiEnabled") === "true",
  };

  const fvId = form.get("freebieProductVariantId");
  const fvTitle = form.get("freebieProductTitle");
  const fvImage = form.get("freebieProductImageUrl");
  data.freebieProductVariantId = fvId ? String(fvId) : null;
  data.freebieProductTitle = fvTitle ? String(fvTitle) : null;
  data.freebieProductImageUrl = fvImage ? String(fvImage) : null;

  await prisma.cartSettings.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });

  return { success: true, message: "Freebie settings saved!" };
};

export default function FreebieSettings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const s = settings || {};

  const [enabled, setEnabled] = useState(s.freebieEnabled ?? false);
  const [title, setTitle] = useState(s.freebieTitle ?? "🎁 You've earned a free gift!");
  const [triggerType, setTriggerType] = useState(s.freebieTriggerType ?? "cartValue");
  const [minCartValue, setMinCartValue] = useState(s.freebieMinCartValue ?? 100);
  const [maxCartValue, setMaxCartValue] = useState(s.freebieMaxCartValue ?? "");
  const [minQty, setMinQty] = useState(s.freebieMinQuantity ?? 3);
  const [maxQty, setMaxQty] = useState(s.freebieMaxQuantity ?? "");
  const [conditionLogic, setConditionLogic] = useState(s.freebieConditionLogic ?? "AND");
  const [triggerProducts, setTriggerProducts] = useState(() => safeJSON(s.freebieTriggerProductIds, []));
  const [triggerCollections, setTriggerCollections] = useState(() => safeJSON(s.freebieTriggerCollectionIds, []));
  const hasProductCondition = triggerProducts.length > 0 || triggerCollections.length > 0;
  const [freebieVariantId, setFreebieVariantId] = useState(s.freebieProductVariantId ?? "");
  const [freebieProductTitle, setFreebieProductTitle] = useState(s.freebieProductTitle ?? "");
  const [freebieProductImage, setFreebieProductImage] = useState(s.freebieProductImageUrl ?? "");
  const [confettiEnabled, setConfettiEnabled] = useState(s.freebieConfettiEnabled ?? true);
  const [creating, setCreating] = useState(false);

  /* Sync state when React Router revalidates the loader after an action */
  useEffect(() => {
    setEnabled(s.freebieEnabled ?? false);
    setTitle(s.freebieTitle ?? "🎁 You've earned a free gift!");
    setTriggerType(s.freebieTriggerType ?? "cartValue");
    setMinCartValue(s.freebieMinCartValue ?? 100);
    setMaxCartValue(s.freebieMaxCartValue ?? "");
    setMinQty(s.freebieMinQuantity ?? 3);
    setMaxQty(s.freebieMaxQuantity ?? "");
    setConditionLogic(s.freebieConditionLogic ?? "AND");
    setTriggerProducts(safeJSON(s.freebieTriggerProductIds, []));
    setTriggerCollections(safeJSON(s.freebieTriggerCollectionIds, []));
    setFreebieVariantId(s.freebieProductVariantId ?? "");
    setFreebieProductTitle(s.freebieProductTitle ?? "");
    setFreebieProductImage(s.freebieProductImageUrl ?? "");
    setConfettiEnabled(s.freebieConfettiEnabled ?? true);
  }, [settings]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Saved!");
      if (fetcher.data.freebieVariantId) {
        setFreebieVariantId(fetcher.data.freebieVariantId);
        setFreebieProductTitle(fetcher.data.freebieProductTitle || "");
        setFreebieProductImage(fetcher.data.freebieProductImageUrl || "");
      }
      setCreating(false);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
      setCreating(false);
    }
  }, [fetcher.data]);

  async function pickAndCreateFreebieProduct() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false, action: "select" });
    if (!selected || !selected.length) return;
    const p = selected[0];
    // Try every possible field name the App Bridge SDK might use for the image URL
    const imgUrl =
      p.featuredImage?.url ||
      p.featuredImage?.originalSrc ||
      p.images?.[0]?.url ||
      p.images?.[0]?.originalSrc ||
      p.images?.[0]?.src ||
      "";
    setCreating(true);
    fetcher.submit(
      {
        intent: "createFreebieProduct",
        sourceTitle: p.title,
        sourceImageUrl: imgUrl,
      },
      { method: "POST" }
    );
  }

  async function pickTriggerProducts() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: 10, action: "select" });
    if (selected && selected.length > 0) {
      setTriggerProducts(selected.map((p) => ({ id: p.id, title: p.title })));
    }
  }

  async function pickTriggerCollections() {
    const selected = await shopify.resourcePicker({ type: "collection", multiple: true, action: "select" });
    if (selected && selected.length > 0) {
      setTriggerCollections(selected.map((c) => ({ id: c.id, title: c.title })));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    fetcher.submit(
      {
        freebieEnabled: String(enabled),
        freebieTitle: title,
        freebieTriggerType: triggerType,
        freebieMinCartValue: String(minCartValue),
        freebieMaxCartValue: maxCartValue !== "" && maxCartValue !== null ? String(maxCartValue) : "",
        freebieMinQuantity: String(minQty),
        freebieMaxQuantity: maxQty !== "" && maxQty !== null ? String(maxQty) : "",
        freebieConditionLogic: conditionLogic,
        freebieTriggerProductIds: JSON.stringify(triggerProducts),
        freebieTriggerCollectionIds: JSON.stringify(triggerCollections),
        freebieProductVariantId: freebieVariantId,
        freebieProductTitle: freebieProductTitle,
        freebieProductImageUrl: freebieProductImage,
        freebieConfettiEnabled: String(confettiEnabled),
      },
      { method: "POST" }
    );
  }

  const hasFreebieProduct = !!freebieVariantId;

  return (
    <s-page heading="Free Gift (Freebie) Settings">
      <s-button
        slot="primary-action"
        onClick={handleSubmit}
        variant="primary"
        loading={saving && !creating ? true : undefined}
      >
        Save Freebie Settings
      </s-button>

      {/* Enable toggle */}
      <s-section heading="Free Gift Feature">
        <s-stack direction="block" gap="base">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <strong style={{ fontSize: 14 }}>Enable Free Gift</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Offer a free product when customers reach a spending or quantity threshold.
              </p>
            </div>
            <ToggleSwitch value={enabled} onChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <div>
                <label style={labelStyle}>Gift Banner Text</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="🎁 You've earned a free gift!"
                />
                <p style={helpText}>Shown inside the side cart when the gift is unlocked.</p>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong style={{ fontSize: 14 }}>Confetti Animation</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                    Show a confetti burst when the free gift is added to cart.
                  </p>
                </div>
                <ToggleSwitch value={confettiEnabled} onChange={setConfettiEnabled} />
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* Trigger condition */}
      {enabled && (
        <s-section heading="Unlock Gift When…">
          <s-stack direction="block" gap="base">

            {/* ── Primary trigger type ── */}
            <div>
              <label style={labelStyle}>Primary Condition</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} style={selectStyle}>
                <option value="cartValue">Cart value (set min and optional max)</option>
                <option value="quantity">Item quantity (set min and optional max)</option>
                <option value="product">Specific products or collections only</option>
              </select>
            </div>

            {/* ── Cart value fields ── */}
            {triggerType === "cartValue" && (
              <>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <label style={labelStyle}>Minimum ($)</label>
                    <input type="number" min="0" step="0.01" value={minCartValue}
                      onChange={(e) => setMinCartValue(e.target.value)}
                      style={{ ...inputStyle, width: 150 }} />
                    <p style={helpText}>Gift unlocks at or above this total.</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Maximum ($) <span style={{ fontWeight: 400, color: "#aaa" }}>optional</span></label>
                    <input type="number" min="0" step="0.01" value={maxCartValue}
                      onChange={(e) => setMaxCartValue(e.target.value)}
                      placeholder="No limit"
                      style={{ ...inputStyle, width: 150 }} />
                    <p style={helpText}>Gift stops above this total.</p>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#1773b0", margin: 0 }}>
                  Cart total is the discounted amount (after applied discount codes).
                </p>
              </>
            )}

            {/* ── Quantity fields ── */}
            {triggerType === "quantity" && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <label style={labelStyle}>Minimum items</label>
                  <input type="number" min="1" value={minQty}
                    onChange={(e) => setMinQty(e.target.value)}
                    style={{ ...inputStyle, width: 130 }} />
                  <p style={helpText}>Gift unlocks at or above this quantity.</p>
                </div>
                <div>
                  <label style={labelStyle}>Maximum items <span style={{ fontWeight: 400, color: "#aaa" }}>optional</span></label>
                  <input type="number" min="1" value={maxQty}
                    onChange={(e) => setMaxQty(e.target.value)}
                    placeholder="No limit"
                    style={{ ...inputStyle, width: 130 }} />
                  <p style={helpText}>Gift stops above this quantity.</p>
                </div>
              </div>
            )}

            {/* ── Product/Collection condition ──
                For "product" trigger: this IS the condition.
                For cartValue/quantity: this is an optional AND/OR second condition. */}
            {triggerType !== "product" && (
              <div style={{ borderTop: "1px solid #ebebeb", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <select value={conditionLogic} onChange={(e) => setConditionLogic(e.target.value)}
                    style={{ ...selectStyle, width: "auto", padding: "7px 12px", fontWeight: 700, color: conditionLogic === "AND" ? "#008060" : "#c05717" }}>
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                  <div>
                    <strong style={{ fontSize: 13 }}>Also require products or collections</strong>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>
                      {conditionLogic === "AND"
                        ? "Both the primary condition AND a matching product/collection must be met."
                        : "The gift unlocks when EITHER the primary condition OR a matching product/collection is met."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Product + Collection pickers (shown for all trigger types) */}
            {(triggerType === "product" || triggerType !== "product") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14,
                ...(triggerType !== "product" ? { background: "#f9f9fb", borderRadius: 10, padding: "14px 16px", border: "1px solid #ebebeb" } : {}) }}>

                {triggerType === "product" && (
                  <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                    Gift unlocks when the cart contains any product from the selected products or collections.
                  </p>
                )}

                <div>
                  <label style={labelStyle}>Specific Products</label>
                  <button type="button" onClick={pickTriggerProducts} style={pickerBtn}>+ Select Products</button>
                  {triggerProducts.length > 0 && (
                    <ProductChips products={triggerProducts}
                      onRemove={(id) => setTriggerProducts(triggerProducts.filter((p) => p.id !== id))} />
                  )}
                  {triggerProducts.length === 0 && (
                    <p style={{ ...helpText, marginTop: 8 }}>No products selected.</p>
                  )}
                </div>

                <div style={{ borderTop: "1px solid #ebebeb", paddingTop: 14 }}>
                  <label style={labelStyle}>Collections</label>
                  <p style={{ ...helpText, marginBottom: 10 }}>
                    Matches any product in these collections. List is resolved when you save.
                  </p>
                  <button type="button" onClick={pickTriggerCollections} style={pickerBtn}>+ Select Collections</button>
                  {triggerCollections.length > 0 && (
                    <ProductChips products={triggerCollections}
                      onRemove={(id) => setTriggerCollections(triggerCollections.filter((c) => c.id !== id))} />
                  )}
                  {triggerCollections.length === 0 && (
                    <p style={{ ...helpText, marginTop: 8 }}>No collections selected.</p>
                  )}
                </div>

                {triggerType !== "product" && !hasProductCondition && (
                  <p style={{ margin: 0, fontSize: 12, color: "#aaa" }}>
                    Leave empty to use only the primary condition above.
                  </p>
                )}
              </div>
            )}

          </s-stack>
        </s-section>
      )}

      {/* Free gift product selection */}
      {enabled && (
        <s-section heading="Free Gift Product">
          <s-stack direction="block" gap="base">
            {creating ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "#555" }}>
                <p style={{ margin: 0, fontSize: 14 }}>Creating free gift product on Shopify…</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#999" }}>This takes a few seconds.</p>
              </div>
            ) : hasFreebieProduct ? (
              <div style={productCard}>
                {freebieProductImage && (
                  <img
                    src={freebieProductImage}
                    alt={freebieProductTitle}
                    style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{freebieProductTitle}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#008060", fontWeight: 600 }}>
                    ✓ Free gift product ready ($0.00)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFreebieVariantId("");
                    setFreebieProductTitle("");
                    setFreebieProductImage("");
                  }}
                  style={removeBtn}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
                  Select any product from your store. EdgeCart will automatically create a{" "}
                  <strong>$0.00 copy</strong> of it that gets added to customers' carts as the free gift.
                </p>
                <button type="button" onClick={pickAndCreateFreebieProduct} style={pickerBtn}>
                  + Select Free Gift Product
                </button>
              </>
            )}
          </s-stack>
        </s-section>
      )}

      <s-section slot="aside" heading="Free Gift Tips">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            The free gift creates a{" "}
            <s-text fontWeight="bold">progress bar</s-text> in the side cart showing customers how
            close they are to unlocking the reward.
          </s-paragraph>
          <s-paragraph>
            Once unlocked, a one-tap{" "}
            <s-text fontWeight="bold">"Add Free Gift"</s-text> button appears.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Tip:</s-text> Set the threshold slightly above your average
            order value to encourage higher spending.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function ToggleSwitch({ value, onChange }) {
  return (
    <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: "none" }}
      />
      <span
        style={{
          display: "inline-flex",
          width: 44,
          height: 24,
          borderRadius: 12,
          padding: 2,
          background: value ? "#008060" : "#ccc",
          transition: "background 0.2s",
          alignItems: "center",
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
            transition: "transform 0.2s",
            transform: value ? "translateX(20px)" : "translateX(2px)",
            display: "block",
          }}
        />
      </span>
    </label>
  );
}

function ProductChips({ products, onRemove }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {products.map((p) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            background: "#f0f4ff",
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {p.title}
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#666", padding: 0, fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 };
const helpText = { margin: "6px 0 0", fontSize: 12, color: "#888" };
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1.5px solid #e0e0e0",
  borderRadius: 8,
  fontSize: 14,
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
  background: "#fafafa",
};
const selectStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1.5px solid #e0e0e0",
  borderRadius: 8,
  fontSize: 14,
  color: "#111",
  background: "#fafafa",
  outline: "none",
  cursor: "pointer",
};
const pickerBtn = {
  padding: "9px 16px",
  border: "1.5px dashed #008060",
  borderRadius: 8,
  background: "#f0faf5",
  color: "#008060",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const productCard = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  border: "1.5px solid #e8e8e8",
  borderRadius: 10,
  background: "#fafafa",
};
const removeBtn = {
  background: "none",
  border: "1px solid #ddd",
  cursor: "pointer",
  color: "#555",
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 6,
  fontWeight: 500,
};

function safeJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
