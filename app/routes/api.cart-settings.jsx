import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

    const settings = await prisma.cartSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      return new Response(JSON.stringify(DEFAULT_SETTINGS), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const payload = {
      ...DEFAULT_SETTINGS,
      ...settings,
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
