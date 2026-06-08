import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isPremiumLocked } from "../trial.server";

/* In-memory Storefront token cache — persists for the life of the server process.
   Avoids an extra REST round-trip on every cart-settings call once token is known. */
const _sfTokenCache = new Map();

const DEFAULT_SETTINGS = {
  enabled: true,
  headerText: "Your Cart",
  primaryColor: "#000000",
  bannerEnabled: true,
  bannerText: "🎉 Free shipping on orders over $50!",
  bannerBgColor: "#1a1a1a",
  bannerTextColor: "#ffffff",
  discountEnabled: true,
  autoDiscountEnabled: false,
  autoDiscountCode: "",
  autoDiscountMode: "exact",
  configuredDiscounts: [],
  offersEnabled: false,
  orderNotesEnabled: false,
  showVariantTitle: true,
  scarcityEnabled: false,
  scarcityText: "⏰ Offer ends in:",
  scarcityMinutes: 15,
  scarcityBgColor: "#e53e3e",
  scarcityTextColor: "#ffffff",
  tieredRewardsEnabled: false,
  tieredRewards: [],
  aiUpsellEnabled: false,
  aiUpsellTitle: "Customers Also Bought",
  aiUpsellIntent: "related",
  aiUpsellLimit: 4,
  customCss: "",
  customJs: "",
  freebieConfettiEnabled: true,
  upsellEnabled: false,
  upsellSliderEnabled: true,
  upsellTitle: "You might also like",
  upsellTriggerType: "cartValue",
  upsellMinCartValue: 50,
  upsellMinQuantity: 2,
  upsellProducts: [],
  upsellTriggerProductIds: [],
  freebieEnabled: false,
  freebieTitle: "🎁 You've earned a free gift!",
  freebieTriggerType: "cartValue",
  freebieMinCartValue: 100,
  freebieMinQuantity: 3,
  freebieProductVariantId: null,
  freebieProductTitle: null,
  freebieProductImageUrl: null,
  freebieTriggerProductIds: [],
  freebieTriggerCollectionIds: [],
  freebieMaxCartValue: null,
  freebieMaxQuantity: null,
  freebieConditionLogic: "AND",
  freebieOffers: [],
  freebieShowAtTop: false,
  freebieProgressBarEnabled: true,
  blockCartPage: false,
  upsellTriggerCollectionIds: [],
  scrollableItems: true,
  showLineItemProperties: false,
  customCartIconSelector: "",
  clickableLineItems: true,
  addToCartBehavior: "drawer",
  addToCartToastSeconds: 3,
  orderSummaryEnabled: true,
  ocuEnabled: false,
  ocuHeading: "Complete your order",
  ocuLabel: "Add to your order",
  ocuHideWhenInCart: true,
  ocuProductVariantId: "",
  ocuProductTitle: "",
  ocuProductImageUrl: "",
  ocuProductPrice: 0,

  freeShippingBarEnabled: false,
  freeShippingThreshold: 50,
  freeShippingText: "Add {{amount}} more for FREE shipping!",
  freeShippingUnlockedText: "You've unlocked free shipping!",

  trustBadgesEnabled: false,
  trustBadges: [
    { id: "1", icon: "🔒", text: "Secure Checkout", enabled: true },
    { id: "2", icon: "↩️", text: "Free Returns", enabled: true },
    { id: "3", icon: "✅", text: "Money-Back Guarantee", enabled: true },
    { id: "4", icon: "💬", text: "24/7 Support", enabled: true },
  ],

  stickyAtcEnabled: false,
  stickyAtcText: "Add to Cart",

  expressCheckoutEnabled: false,
  expressCheckoutShopPay: true,
  expressCheckoutApplePay: true,
  expressCheckoutGooglePay: false,

  volumeDiscountEnabled: false,
  volumeDiscountTitle: "Buy more, save more!",
  volumeDiscounts: [],

  giftWrapEnabled: false,
  giftWrapHeading: "Gift Options",
  giftWrapLabel: "Add gift wrap",
  giftWrapHideWhenInCart: true,
  giftWrapProductVariantId: "",
  giftWrapProductTitle: "",
  giftWrapProductImageUrl: "",
  giftWrapPrice: 0,

  stockScarcityEnabled: false,
  stockScarcityThreshold: 5,
  stockScarcityText: "Only {{count}} left!",

  recentlyViewedEnabled: false,
  recentlyViewedTitle: "You might also like",
  recentlyViewedLimit: 4,

  cartShareEnabled: false,
  cartShareText: "Share your cart",

  currencyCode:   "USD",
  currencySymbol: "$",
  locale:         "en-US",

  cartRecoveryEnabled: false,
  cartRecoveryWhatsApp: "",
  cartRecoveryMessage: "Check out my cart: {{url}}",
  cartRecoveryLabel: "💬 Send cart link via WhatsApp",

  deliveryEstimatorEnabled: false,
  deliveryMinDays: 3,
  deliveryMaxDays: 7,
  deliveryMessage: "Estimated delivery: {{date_range}}",
  deliveryCutoffHour: 14,

  announcementsEnabled: false,
  announcements: [],
  announcementInterval: 4,

  productPageSocialProofEnabled: false,
  productPageSocialProofText: "🔥 {{count}} people bought this today",
  productPageSocialProofMin: 5,
  productPageSocialProofMax: 30,
  productPageSocialProofInterval: 8,

  productPageScarcityEnabled: false,
  productPageVolumeTableEnabled: false,
  productPageFreebieTeaser: false,

  productPageUpsellEnabled: false,
  productPageUpsellTitle: "Customers Also Bought",
  productPageUpsellLimit: 3,
  productPageUpsellProducts: [],
};

export const loader = async ({ request }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify this is a legit app proxy request from Shopify
    const { session } = await authenticate.public.appProxy(request);
    const shop = session?.shop;

    if (!shop) {
      return new Response(JSON.stringify(DEFAULT_SETTINGS), {
        status: 200,
        headers: corsHeaders,
      });
    }

    let settings = await prisma.cartSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      return new Response(JSON.stringify(DEFAULT_SETTINGS), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Get a Storefront API token for client-side discount validation.
    // Cached in memory so we only hit the REST API once per server restart per shop.
    let storefrontToken = _sfTokenCache.get(shop) || null;
    if (!storefrontToken) {
      try {
        const offlineSession = await prisma.session.findFirst({
          where: { shop, isOnline: false },
          select: { accessToken: true },
        });
        const accessToken = offlineSession?.accessToken;
        if (accessToken) {
          storefrontToken = await getOrCreateStorefrontToken(shop, accessToken);
          if (storefrontToken) {
            _sfTokenCache.set(shop, storefrontToken);
            console.log(`[EdgeCart] storefront token cached for ${shop}`);
          }
        }
      } catch (err) {
        console.error(`[EdgeCart] storefront token error for ${shop}:`, err.message);
      }
    }

    const payload = {
      ...DEFAULT_SETTINGS,
      ...settings,
      storefrontToken: storefrontToken || null,
      shop,
      configuredDiscounts: safeParseJSON(settings.configuredDiscounts, []),
      upsellProducts: safeParseJSON(settings.upsellProducts, []),
      upsellTriggerProductIds: safeParseJSON(settings.upsellTriggerProductIds, []),
      freebieTriggerProductIds: safeParseJSON(settings.freebieTriggerProductIds, []),
      freebieTriggerCollectionIds: safeParseJSON(settings.freebieTriggerCollectionIds, []),
      upsellTriggerCollectionIds: safeParseJSON(settings.upsellTriggerCollectionIds, []),
      tieredRewards: safeParseJSON(settings.tieredRewards, []),
      freebieOffers: buildFreebieOffers(settings),
      freebieShowAtTop: settings.freebieShowAtTop ?? false,
      trustBadges: safeParseJSON(settings.trustBadges, DEFAULT_SETTINGS.trustBadges),
      volumeDiscounts: safeParseJSON(settings.volumeDiscounts, []),
      announcements: safeParseJSON(settings.announcements, []),
      productPageUpsellProducts: safeParseJSON(settings.productPageUpsellProducts, []),
    };

    /* Free-plan trial gate: once the trial ends, premium features (Freebie, Upsell,
       AI Upsell) are turned off on the storefront regardless of saved config. */
    if (isPremiumLocked(settings)) {
      payload.freebieEnabled  = false;
      payload.freebieOffers   = [];
      payload.upsellEnabled   = false;
      payload.aiUpsellEnabled = false;
      payload.premiumLocked   = true;
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    // Fallback: return defaults so the cart still loads
    return new Response(JSON.stringify(DEFAULT_SETTINGS), {
      status: 200,
      headers: corsHeaders,
    });
  }
};

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

async function getOrCreateStorefrontToken(shop, accessToken) {
  const base = `https://${shop}/admin/api/2025-07`;
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": accessToken,
  };

  // Reuse an existing token titled "edge-cart" to stay within the 100-token limit
  const listRes = await fetch(`${base}/storefront_access_tokens.json`, { headers });
  if (listRes.ok) {
    const listData = await listRes.json();
    const existing = (listData?.storefront_access_tokens || []).find((t) => t.title === "edge-cart");
    if (existing) {
      console.log(`[EdgeCart] reusing storefront token for ${shop}`);
      return existing.access_token;
    }
  } else {
    console.warn(`[EdgeCart] list storefront tokens failed for ${shop}: ${listRes.status}`);
  }

  // Create a new token
  const createRes = await fetch(`${base}/storefront_access_tokens.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ storefront_access_token: { title: "edge-cart" } }),
  });
  if (createRes.ok) {
    const createData = await createRes.json();
    const token = createData?.storefront_access_token?.access_token || null;
    if (token) console.log(`[EdgeCart] created storefront token for ${shop}`);
    return token;
  }
  console.warn(`[EdgeCart] create storefront token failed for ${shop}: ${createRes.status} ${await createRes.text()}`);
  return null;
}

function buildFreebieOffers(s) {
  const offers = safeParseJSON(s.freebieOffers, []);
  if (offers.length > 0) return offers;
  // Backwards compat: migrate old single-offer fields into the array format
  if (!s.freebieProductVariantId) return [];
  return [{
    id: "legacy",
    enabled: s.freebieEnabled ?? true,
    title: s.freebieTitle ?? "🎁 You've earned a free gift!",
    triggerType: s.freebieTriggerType ?? "cartValue",
    minCartValue: s.freebieMinCartValue ?? 100,
    maxCartValue: s.freebieMaxCartValue ?? null,
    minQuantity: s.freebieMinQuantity ?? 3,
    maxQuantity: s.freebieMaxQuantity ?? null,
    conditionLogic: s.freebieConditionLogic ?? "AND",
    triggerProductIds: safeParseJSON(s.freebieTriggerProductIds, []),
    triggerCollectionIds: safeParseJSON(s.freebieTriggerCollectionIds, []),
    productVariantId: s.freebieProductVariantId,
    productTitle: s.freebieProductTitle,
    productImageUrl: s.freebieProductImageUrl,
    confettiEnabled: s.freebieConfettiEnabled ?? true,
  }];
}
