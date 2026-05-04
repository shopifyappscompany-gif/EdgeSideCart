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
  upsellTriggerCollectionIds: [],
  scrollableItems: true,
  showLineItemProperties: false,
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
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
