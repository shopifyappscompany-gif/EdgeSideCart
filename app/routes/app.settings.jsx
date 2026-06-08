import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

const CURRENCY_SYMBOLS = { USD:"$",EUR:"€",GBP:"£",INR:"₹",AUD:"A$",CAD:"C$",JPY:"¥",AED:"د.إ",SGD:"S$",ZAR:"R",BRL:"R$",MXN:"$",SEK:"kr",NOK:"kr",DKK:"kr",CHF:"Fr",PLN:"zł",TRY:"₺",SAR:"﷼",HKD:"HK$",NZD:"NZ$",KWD:"KD",QAR:"﷼",EGP:"E£",PKR:"₨",BDT:"৳",NGN:"₦",KES:"KSh",THB:"฿",IDR:"Rp",MYR:"RM",PHP:"₱",VND:"₫",TWD:"NT$",KRW:"₩",CNY:"¥",CZK:"Kč",HUF:"Ft",RON:"lei",UAH:"₴",ILS:"₪",MAD:"د.م." };

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const settings = await prisma.cartSettings.findUnique({ where: { shop: session.shop } });

  let shopCurrencyCode = settings?.currencyCode || "USD";
  let shopCurrencySymbol = settings?.currencySymbol || "$";
  try {
    const gqlRes = await admin.graphql(`#graphql
      query { shop { currencyCode } }
    `);
    const gqlData = await gqlRes.json();
    const code = gqlData?.data?.shop?.currencyCode;
    console.log("[Currency] detected:", code);
    if (code) {
      const symbol = CURRENCY_SYMBOLS[code] || code;
      shopCurrencyCode = code;
      shopCurrencySymbol = symbol;
      /* Auto-persist to DB so side cart also picks up the correct currency */
      if (settings && (settings.currencyCode !== code || settings.currencySymbol !== symbol)) {
        await prisma.cartSettings.update({
          where: { shop: session.shop },
          data: { currencyCode: code, currencySymbol: symbol },
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[Currency] GraphQL failed:", e?.message);
  }

  return { settings, shopCurrencyCode, shopCurrencySymbol };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const data = {
    enabled:              form.get("enabled") === "true",
    headerText:           String(form.get("headerText") || "Your Cart"),
    primaryColor:         String(form.get("primaryColor") || "#000000"),
    bannerEnabled:        form.get("bannerEnabled") === "true",
    bannerText:           String(form.get("bannerText") || ""),
    bannerBgColor:        String(form.get("bannerBgColor") || "#1a1a1a"),
    bannerTextColor:      String(form.get("bannerTextColor") || "#ffffff"),
    announcementsEnabled: form.get("announcementsEnabled") === "true",
    announcements:        String(form.get("announcements") || "[]"),
    announcementInterval: parseInt(form.get("announcementInterval") || "4", 10),
    discountEnabled:      form.get("discountEnabled") === "true",
    autoDiscountEnabled:  form.get("autoDiscountEnabled") === "true",
    autoDiscountCode:     String(form.get("autoDiscountCode") || ""),
    offersEnabled:        form.get("offersEnabled") === "true",
    configuredDiscounts:  String(form.get("configuredDiscounts") || "[]"),
    orderNotesEnabled:    form.get("orderNotesEnabled") === "true",
    showVariantTitle:     form.get("showVariantTitle") === "true",
    scarcityEnabled:      form.get("scarcityEnabled") === "true",
    scarcityText:         String(form.get("scarcityText") || "⏰ Offer ends in:"),
    scarcityMinutes:      parseInt(form.get("scarcityMinutes") || "15", 10),
    scarcityBgColor:      String(form.get("scarcityBgColor") || "#e53e3e"),
    scarcityTextColor:    String(form.get("scarcityTextColor") || "#ffffff"),
    tieredRewardsEnabled:    form.get("tieredRewardsEnabled") === "true",
    tieredRewards:           String(form.get("tieredRewards") || "[]"),
    scrollableItems:         form.get("scrollableItems") === "true",
    showLineItemProperties:  form.get("showLineItemProperties") === "true",
    blockCartPage:           form.get("blockCartPage") === "true",
    customCss:               String(form.get("customCss") || ""),
    customJs:                String(form.get("customJs")  || ""),
    customCartIconSelector:  String(form.get("customCartIconSelector") || ""),
    clickableLineItems:      form.get("clickableLineItems") === "true",
    addToCartBehavior:       String(form.get("addToCartBehavior") || "drawer"),
    addToCartToastSeconds:   parseInt(form.get("addToCartToastSeconds") || "3", 10),
    orderSummaryEnabled:     form.get("orderSummaryEnabled") === "true",
    ocuEnabled:              form.get("ocuEnabled") === "true",
    ocuHeading:              String(form.get("ocuHeading") || "Complete your order"),
    ocuLabel:                String(form.get("ocuLabel") || "Add to your order"),
    ocuHideWhenInCart:       form.get("ocuHideWhenInCart") === "true",
    ocuProductVariantId:     String(form.get("ocuProductVariantId") || ""),
    ocuProductTitle:         String(form.get("ocuProductTitle") || ""),
    ocuProductImageUrl:      String(form.get("ocuProductImageUrl") || ""),
    ocuProductPrice:         parseInt(form.get("ocuProductPrice") || "0", 10),
    currencyCode:            String(form.get("currencyCode") || "USD"),
    currencySymbol:          String(form.get("currencySymbol") || "$"),
    locale:                  String(form.get("locale") || "en-US"),
  };

  await prisma.cartSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
};

export default function GeneralSettings() {
  const { settings, shopCurrencyCode, shopCurrencySymbol } = useLoaderData();
  const fetcher = useFetcher();
  const analyticsF = useFetcher({ key: "analytics-tab" });
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const [activeTab, setActiveTab] = useState("settings");
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const s = settings || {};

  // ── State ────────────────────────────────────────────────
  const [enabled,              setEnabled]              = useState(s.enabled ?? true);
  const [headerText,           setHeaderText]           = useState(s.headerText ?? "Your Cart");
  const [primaryColor,         setPrimaryColor]         = useState(s.primaryColor ?? "#000000");
  const [bannerEnabled,        setBannerEnabled]        = useState(s.bannerEnabled ?? true);
  const [bannerText,           setBannerText]           = useState(s.bannerText ?? "🎉 Free shipping on orders over $50!");
  const [bannerBgColor,        setBannerBgColor]        = useState(s.bannerBgColor ?? "#1a1a1a");
  const [bannerTextColor,      setBannerTextColor]      = useState(s.bannerTextColor ?? "#ffffff");
  const [announcementsEnabled, setAnnouncementsEnabled] = useState(s.announcementsEnabled ?? false);
  const [announcementInterval, setAnnouncementInterval] = useState(s.announcementInterval ?? 4);
  const [announcements, setAnnouncements] = useState(() => {
    try { return JSON.parse(s.announcements || "[]"); } catch { return []; }
  });
  const [discountEnabled,      setDiscountEnabled]      = useState(s.discountEnabled ?? true);
  const [autoDiscountEnabled,  setAutoDiscountEnabled]  = useState(s.autoDiscountEnabled ?? false);
  const [autoDiscountCode,     setAutoDiscountCode]     = useState(s.autoDiscountCode ?? "");
  const [offersEnabled,        setOffersEnabled]        = useState(s.offersEnabled ?? false);
  const [configuredDiscounts,  setConfiguredDiscounts]  = useState(() => {
    try { return JSON.parse(s.configuredDiscounts || "[]"); } catch { return []; }
  });
  const [orderNotesEnabled,    setOrderNotesEnabled]    = useState(s.orderNotesEnabled ?? false);
  const [showVariantTitle,     setShowVariantTitle]     = useState(s.showVariantTitle ?? true);
  const [scarcityEnabled,      setScarcityEnabled]      = useState(s.scarcityEnabled ?? false);
  const [scarcityText,         setScarcityText]         = useState(s.scarcityText ?? "⏰ Offer ends in:");
  const [scarcityMinutes,      setScarcityMinutes]      = useState(s.scarcityMinutes ?? 15);
  const [scarcityBgColor,      setScarcityBgColor]      = useState(s.scarcityBgColor ?? "#e53e3e");
  const [scarcityTextColor,    setScarcityTextColor]    = useState(s.scarcityTextColor ?? "#ffffff");
  const [tieredRewardsEnabled,    setTieredRewardsEnabled]    = useState(s.tieredRewardsEnabled ?? false);
  const [scrollableItems,         setScrollableItems]         = useState(s.scrollableItems ?? true);
  const [showLineItemProperties,  setShowLineItemProperties]  = useState(s.showLineItemProperties ?? false);
  const [blockCartPage,           setBlockCartPage]           = useState(s.blockCartPage ?? false);
  const [customCss,               setCustomCss]               = useState(s.customCss ?? "");
  const [customJs,                setCustomJs]                = useState(s.customJs  ?? "");
  const [customCartIconSelector,  setCustomCartIconSelector]  = useState(s.customCartIconSelector ?? "");
  const [clickableLineItems,      setClickableLineItems]      = useState(s.clickableLineItems ?? true);
  const [addToCartBehavior,       setAddToCartBehavior]       = useState(s.addToCartBehavior ?? "drawer");
  const [addToCartToastSeconds,   setAddToCartToastSeconds]   = useState(s.addToCartToastSeconds ?? 3);
  const [orderSummaryEnabled,     setOrderSummaryEnabled]     = useState(s.orderSummaryEnabled ?? true);
  const [tieredRewards,           setTieredRewards]           = useState(() => {
    try { return JSON.parse(s.tieredRewards || "[]"); } catch { return []; }
  });
  const [ocuEnabled,         setOcuEnabled]         = useState(s.ocuEnabled ?? false);
  const [ocuHeading,         setOcuHeading]         = useState(s.ocuHeading ?? "Complete your order");
  const [ocuLabel,           setOcuLabel]           = useState(s.ocuLabel ?? "Add to your order");
  const [ocuHideWhenInCart,  setOcuHideWhenInCart]  = useState(s.ocuHideWhenInCart ?? true);
  const [locale,             setLocale]             = useState(s.locale ?? "en-US");
  const [ocuProduct,         setOcuProduct]         = useState(
    s.ocuProductVariantId ? {
      variantId: s.ocuProductVariantId,
      title: s.ocuProductTitle || "",
      imageUrl: s.ocuProductImageUrl || "",
      price: s.ocuProductPrice || 0,
    } : null
  );

  // ── Dirty tracking (Strict Mode safe) ──────────────────
  function snap() {
    return JSON.stringify({
      enabled, headerText, primaryColor,
      bannerEnabled, bannerText, bannerBgColor, bannerTextColor,
      announcementsEnabled, announcements, announcementInterval,
      discountEnabled, autoDiscountEnabled, autoDiscountCode,
      offersEnabled, configuredDiscounts,
      orderNotesEnabled, showVariantTitle,
      scarcityEnabled, scarcityText, scarcityMinutes, scarcityBgColor, scarcityTextColor,
      tieredRewardsEnabled, tieredRewards,
      scrollableItems, showLineItemProperties, blockCartPage,
      customCss, customJs, customCartIconSelector,
      clickableLineItems, addToCartBehavior, addToCartToastSeconds,
      orderSummaryEnabled, ocuEnabled, ocuHeading, ocuLabel, ocuHideWhenInCart, ocuProduct,
      locale,
    });
  }
  const savedSnap = useRef(snap());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(snap() !== savedSnap.current);
  }, [enabled, headerText, primaryColor, bannerEnabled, bannerText, bannerBgColor, bannerTextColor,
      announcementsEnabled, announcements, announcementInterval,
      discountEnabled, autoDiscountEnabled, autoDiscountCode, offersEnabled, configuredDiscounts,
      orderNotesEnabled, showVariantTitle,
      scarcityEnabled, scarcityText, scarcityMinutes, scarcityBgColor, scarcityTextColor,
      tieredRewardsEnabled, tieredRewards, scrollableItems, showLineItemProperties, blockCartPage,
      customCss, customJs, customCartIconSelector, clickableLineItems, addToCartBehavior,
      addToCartToastSeconds, orderSummaryEnabled, ocuEnabled, ocuHeading, ocuLabel, ocuHideWhenInCart, ocuProduct,
      locale]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved!");
      savedSnap.current = snap();
      setIsDirty(false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (activeTab === "analytics") {
      analyticsF.load("/app/analytics?days=" + analyticsDays);
    }
  }, [activeTab, analyticsDays]);

  function handleDiscard() {
    setEnabled(s.enabled ?? true);
    setHeaderText(s.headerText ?? "Your Cart");
    setPrimaryColor(s.primaryColor ?? "#000000");
    setBannerEnabled(s.bannerEnabled ?? true);
    setBannerText(s.bannerText ?? "🎉 Free shipping on orders over $50!");
    setBannerBgColor(s.bannerBgColor ?? "#1a1a1a");
    setBannerTextColor(s.bannerTextColor ?? "#ffffff");
    setAnnouncementsEnabled(s.announcementsEnabled ?? false);
    setAnnouncementInterval(s.announcementInterval ?? 4);
    setAnnouncements(() => { try { return JSON.parse(s.announcements || "[]"); } catch { return []; } });
    setDiscountEnabled(s.discountEnabled ?? true);
    setAutoDiscountEnabled(s.autoDiscountEnabled ?? false);
    setAutoDiscountCode(s.autoDiscountCode ?? "");
    setOffersEnabled(s.offersEnabled ?? false);
    setConfiguredDiscounts(() => { try { return JSON.parse(s.configuredDiscounts || "[]"); } catch { return []; } });
    setOrderNotesEnabled(s.orderNotesEnabled ?? false);
    setShowVariantTitle(s.showVariantTitle ?? true);
    setScarcityEnabled(s.scarcityEnabled ?? false);
    setScarcityText(s.scarcityText ?? "⏰ Offer ends in:");
    setScarcityMinutes(s.scarcityMinutes ?? 15);
    setScarcityBgColor(s.scarcityBgColor ?? "#e53e3e");
    setScarcityTextColor(s.scarcityTextColor ?? "#ffffff");
    setTieredRewardsEnabled(s.tieredRewardsEnabled ?? false);
    setTieredRewards(() => { try { return JSON.parse(s.tieredRewards || "[]"); } catch { return []; } });
    setScrollableItems(s.scrollableItems ?? true);
    setShowLineItemProperties(s.showLineItemProperties ?? false);
    setBlockCartPage(s.blockCartPage ?? false);
    setCustomCss(s.customCss ?? "");
    setCustomJs(s.customJs ?? "");
    setCustomCartIconSelector(s.customCartIconSelector ?? "");
    setClickableLineItems(s.clickableLineItems ?? true);
    setAddToCartBehavior(s.addToCartBehavior ?? "drawer");
    setAddToCartToastSeconds(s.addToCartToastSeconds ?? 3);
    setOrderSummaryEnabled(s.orderSummaryEnabled ?? true);
    setOcuEnabled(s.ocuEnabled ?? false);
    setOcuHeading(s.ocuHeading ?? "Complete your order");
    setOcuLabel(s.ocuLabel ?? "Add to your order");
    setOcuHideWhenInCart(s.ocuHideWhenInCart ?? true);
    setOcuProduct(s.ocuProductVariantId ? {
      variantId: s.ocuProductVariantId,
      title: s.ocuProductTitle || "",
      imageUrl: s.ocuProductImageUrl || "",
      price: s.ocuProductPrice || 0,
    } : null);
    setLocale(s.locale ?? "en-US");
  }

  function handleSubmit(e) {
    e?.preventDefault();
    fetcher.submit(
      {
        enabled:              String(enabled),
        headerText,
        primaryColor,
        bannerEnabled:        String(bannerEnabled),
        bannerText,
        bannerBgColor,
        bannerTextColor,
        announcementsEnabled: String(announcementsEnabled),
        announcements:        JSON.stringify(announcements),
        announcementInterval: String(announcementInterval),
        discountEnabled:      String(discountEnabled),
        autoDiscountEnabled:  String(autoDiscountEnabled),
        autoDiscountCode,
        offersEnabled:        String(offersEnabled),
        configuredDiscounts:  JSON.stringify(configuredDiscounts),
        orderNotesEnabled:    String(orderNotesEnabled),
        showVariantTitle:     String(showVariantTitle),
        scarcityEnabled:      String(scarcityEnabled),
        scarcityText,
        scarcityMinutes:      String(scarcityMinutes),
        scarcityBgColor,
        scarcityTextColor,
        tieredRewardsEnabled:   String(tieredRewardsEnabled),
        tieredRewards:          JSON.stringify(tieredRewards),
        scrollableItems:        String(scrollableItems),
        showLineItemProperties: String(showLineItemProperties),
        blockCartPage:          String(blockCartPage),
        customCss,
        customJs,
        customCartIconSelector,
        clickableLineItems:      String(clickableLineItems),
        addToCartBehavior,
        addToCartToastSeconds:   String(addToCartToastSeconds),
        orderSummaryEnabled:     String(orderSummaryEnabled),
        ocuEnabled:              String(ocuEnabled),
        ocuHeading,
        ocuLabel,
        ocuHideWhenInCart:       String(ocuHideWhenInCart),
        ocuProductVariantId:     ocuProduct?.variantId || "",
        ocuProductTitle:         ocuProduct?.title || "",
        ocuProductImageUrl:      ocuProduct?.imageUrl || "",
        ocuProductPrice:         String(ocuProduct?.price || 0),
        currencyCode:            shopCurrencyCode,
        currencySymbol:          shopCurrencySymbol,
        locale,
      },
      { method: "POST" }
    );
  }

  // ── Banner condition product/collection pickers ──────────
  async function pickAnnouncementProducts(idx) {
    const selected = await shopify.resourcePicker({ type: "product", multiple: 10 });
    if (!selected) return;
    const ids = selected.map(p => ({ id: p.id, title: p.title }));
    setAnnouncements(prev => prev.map((a, i) => i === idx ? { ...a, productIds: ids } : a));
  }
  async function pickAnnouncementCollections(idx) {
    const selected = await shopify.resourcePicker({ type: "collection", multiple: 10 });
    if (!selected) return;
    const cols = selected.map(c => ({ id: c.id, handle: c.handle, title: c.title }));
    setAnnouncements(prev => prev.map((a, i) => i === idx ? { ...a, collectionIds: cols } : a));
  }

  // ── Tier helpers ─────────────────────────────────────────
  function addTier() {
    setTieredRewards([...tieredRewards, {
      id: "tr_" + Date.now(),
      thresholdType: "cartValue",
      threshold: 50,
      label: "Spend {{amount}} more to unlock a reward",
      unlockedLabel: "🎉 Reward unlocked!",
      confettiEnabled: true,
    }]);
  }

  function updateTier(id, field, value) {
    setTieredRewards(tieredRewards.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  function removeTier(id) {
    setTieredRewards(tieredRewards.filter(t => t.id !== id));
  }

  // Current preview settings object
  const preview = {
    enabled, headerText, primaryColor,
    bannerEnabled, bannerText, bannerBgColor, bannerTextColor,
    scarcityEnabled, scarcityText, scarcityMinutes, scarcityBgColor, scarcityTextColor,
    tieredRewardsEnabled, tieredRewards,
    discountEnabled, autoDiscountEnabled, autoDiscountCode,
    orderNotesEnabled, showVariantTitle, showLineItemProperties,
    currencySymbol: shopCurrencySymbol,
  };

  return (
    <s-page heading="Cart Drawer">
      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #e5e7eb" }}>
        {[{ id: "settings", label: "Settings" }, { id: "features", label: "Features" }, { id: "productpage", label: "Product Page" }, { id: "analytics", label: "Analytics" }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "12px 24px", border: "none", background: "none",
              fontSize: 14, fontWeight: 600,
              color: activeTab === tab.id ? "#111" : "#6b7280",
              borderBottom: activeTab === tab.id ? "2px solid #111" : "2px solid transparent",
              marginBottom: -2, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "settings" && (
        <>
          {isDirty && (
            <SaveBar onSave={handleSubmit} onDiscard={handleDiscard} saving={saving} />
          )}

          {/* ── Localization ── */}
      <s-section heading="Localization">
        <s-stack direction="block" gap="base">
          <div>
            <label style={labelStyle}>Store Currency</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8, background: "#f9fafb", fontSize: 14, color: "#111" }}>
              <span style={{ fontWeight: 700 }}>{shopCurrencyCode}</span>
              <span style={{ color: "#bbb" }}>—</span>
              <span style={{ fontWeight: 600 }}>{shopCurrencySymbol}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>Auto-detected from your Shopify store</span>
            </div>
            <p style={helpText}>Read from Shopify Admin → Settings → Store details → Store currency. To change it, update your store settings in Shopify.</p>
          </div>
          <div>
            <label style={labelStyle}>Language / Locale</label>
            <select value={locale} onChange={e => setLocale(e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }}>
              {[["en-US","English – United States"],["en-GB","English – United Kingdom"],["en-AU","English – Australia"],["en-IN","English – India"],["fr-FR","French – France"],["de-DE","German – Germany"],["es-ES","Spanish – Spain"],["es-MX","Spanish – Mexico"],["it-IT","Italian – Italy"],["pt-BR","Portuguese – Brazil"],["pt-PT","Portuguese – Portugal"],["nl-NL","Dutch"],["sv-SE","Swedish"],["pl-PL","Polish"],["tr-TR","Turkish"],["ja-JP","Japanese"],["ko-KR","Korean"],["zh-CN","Chinese – Simplified"],["ar-SA","Arabic"],["hi-IN","Hindi"]].map(([c,l]) => (
                <option key={c} value={c}>{c} – {l}</option>
              ))}
            </select>
            <p style={helpText}>Controls how prices are formatted (decimal separators, symbol position).</p>
          </div>
        </s-stack>
      </s-section>

          {/* ── Side Cart ── */}
      <s-section heading="Side Cart">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Side Cart"
            desc="Slide-in cart drawer instead of redirecting to /cart."
            checked={enabled}
            onChange={setEnabled}
          />
          <div>
            <label style={labelStyle}>Cart Header Text</label>
            <input type="text" value={headerText} onChange={e => setHeaderText(e.target.value)}
              style={inputStyle} placeholder="Your Cart" />
          </div>
          <div>
            <label style={labelStyle}>Primary / Checkout Button Color</label>
            <ColorPicker value={primaryColor} onChange={setPrimaryColor} />
            <p style={helpText}>Used for checkout button, upsell add buttons, and accents.</p>
          </div>
          <ToggleRow
            label="Show Variant Title"
            desc="Show size, color, etc. below the product name on each cart line item."
            checked={showVariantTitle}
            onChange={setShowVariantTitle}
          />
          <ToggleRow
            label="Show Line Item Properties"
            desc="Display custom properties (e.g. engraving, gift message) under each product in the cart."
            checked={showLineItemProperties}
            onChange={setShowLineItemProperties}
          />
          <ToggleRow
            label="Clickable Product Titles"
            desc="Make product names in the cart clickable links that open the product page."
            checked={clickableLineItems}
            onChange={setClickableLineItems}
          />
          <ToggleRow
            label="Scrollable Line Items"
            desc="Keep items in a fixed-height scrollable area so the checkout button is always visible, even with many products."
            checked={scrollableItems}
            onChange={setScrollableItems}
          />
          <ToggleRow
            label="Block /cart Page"
            desc="Redirect customers away from the /cart page and open your side cart instead. Customers who land on /cart are sent back to the previous page with the side cart open."
            checked={blockCartPage}
            onChange={setBlockCartPage}
          />
        </s-stack>
      </s-section>

      {/* ── Announcement Banner ── */}
      <s-section heading="Announcement Banner">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Show Banner"
            desc="Promotional text at the top of the side cart."
            checked={bannerEnabled}
            onChange={setBannerEnabled}
          />
          {bannerEnabled && (
            <>
              <div style={{ padding: "12px 16px", background: bannerBgColor, color: bannerTextColor, borderRadius: 8, textAlign: "center", fontSize: 14, fontWeight: 500 }}>
                {bannerText || "Banner preview"}
              </div>
              <div>
                <label style={labelStyle}>Banner Text</label>
                <input type="text" value={bannerText} onChange={e => setBannerText(e.target.value)}
                  style={inputStyle} placeholder="🎉 Free shipping on orders over $50!" />
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <label style={labelStyle}>Background Color</label>
                  <ColorPicker value={bannerBgColor} onChange={setBannerBgColor} small />
                </div>
                <div>
                  <label style={labelStyle}>Text Color</label>
                  <ColorPicker value={bannerTextColor} onChange={setBannerTextColor} small />
                </div>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* ── Rotating Announcements ── */}
      <s-section heading="Rotating Announcements">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Rotating Announcements"
            desc="Cycle through multiple promotional messages in the banner area. Overrides the single banner above when enabled."
            checked={announcementsEnabled}
            onChange={setAnnouncementsEnabled}
          />
          {announcementsEnabled && (
            <>
              <div>
                <label style={labelStyle}>Rotation Interval (seconds)</label>
                <input type="number" value={announcementInterval} min="1" max="30"
                  onChange={e => setAnnouncementInterval(Math.max(1, parseInt(e.target.value) || 4))}
                  style={{ ...inputStyle, width: 100 }} />
                <p style={helpText}>How long each message shows before switching to the next one.</p>
              </div>
              {announcements.map((ann, idx) => (
                <div key={ann.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Message {idx + 1}</strong>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <ToggleInline checked={ann.enabled !== false} onChange={v => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, enabled: v } : a))} />
                      <button onClick={() => setAnnouncements(announcements.filter((_, i) => i !== idx))}
                        style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                    </div>
                  </div>
                  <div style={{ padding: "10px 14px", background: ann.bgColor || "#1a1a1a", color: ann.textColor || "#fff", borderRadius: 8, textAlign: "center", fontSize: 14, fontWeight: 500, marginBottom: 10 }}>
                    {ann.text || "Message preview"}
                  </div>
                  <div>
                    <label style={labelStyle}>Text</label>
                    <input type="text" value={ann.text || ""} style={inputStyle}
                      onChange={e => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, text: e.target.value } : a))}
                      placeholder="🎉 Free shipping on orders over $50!" />
                  </div>
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10 }}>
                    <div>
                      <label style={labelStyle}>Background</label>
                      <ColorPicker value={ann.bgColor || "#1a1a1a"} onChange={v => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, bgColor: v } : a))} small />
                    </div>
                    <div>
                      <label style={labelStyle}>Text Color</label>
                      <ColorPicker value={ann.textColor || "#ffffff"} onChange={v => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, textColor: v } : a))} small />
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={labelStyle}>Show this banner when</label>
                    <select value={ann.conditionType || "always"} style={inputStyle}
                      onChange={e => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, conditionType: e.target.value } : a))}>
                      <option value="always">Always</option>
                      <option value="cartValue">Cart value is at least…</option>
                      <option value="quantity">Cart quantity is at least…</option>
                      <option value="product">Cart contains specific product(s)</option>
                      <option value="collection">Cart contains product from collection(s)</option>
                    </select>
                    {ann.conditionType === "cartValue" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="number" min="0" value={ann.minCartValue ?? ""} style={inputStyle}
                          placeholder="Min cart value (e.g. 0)"
                          onChange={e => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, minCartValue: e.target.value } : a))} />
                        <input type="number" min="0" value={ann.maxCartValue ?? ""} style={inputStyle}
                          placeholder="Max (optional, e.g. 1000)"
                          onChange={e => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, maxCartValue: e.target.value } : a))} />
                      </div>
                    )}
                    {ann.conditionType === "quantity" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input type="number" min="0" value={ann.minQuantity ?? ""} style={inputStyle}
                          placeholder="Min quantity (e.g. 1)"
                          onChange={e => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, minQuantity: e.target.value } : a))} />
                        <input type="number" min="0" value={ann.maxQuantity ?? ""} style={inputStyle}
                          placeholder="Max (optional, e.g. 5)"
                          onChange={e => setAnnouncements(announcements.map((a, i) => i === idx ? { ...a, maxQuantity: e.target.value } : a))} />
                      </div>
                    )}
                    {ann.conditionType === "product" && (
                      <div style={{ marginTop: 8 }}>
                        <button onClick={() => pickAnnouncementProducts(idx)}
                          style={{ padding: "8px 14px", border: "1.5px solid #d0d0d0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Select products{(ann.productIds || []).length ? ` (${ann.productIds.length})` : ""}
                        </button>
                        {(ann.productIds || []).length > 0 && (
                          <p style={helpText}>{ann.productIds.map(p => p.title).join(", ")}</p>
                        )}
                      </div>
                    )}
                    {ann.conditionType === "collection" && (
                      <div style={{ marginTop: 8 }}>
                        <button onClick={() => pickAnnouncementCollections(idx)}
                          style={{ padding: "8px 14px", border: "1.5px solid #d0d0d0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Select collections{(ann.collectionIds || []).length ? ` (${ann.collectionIds.length})` : ""}
                        </button>
                        {(ann.collectionIds || []).length > 0 && (
                          <p style={helpText}>{ann.collectionIds.map(c => c.title).join(", ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => setAnnouncements([...announcements, { id: "ann_" + Date.now(), text: "", bgColor: "#1a1a1a", textColor: "#ffffff", enabled: true }])}
                style={{ width: "100%", padding: "10px 16px", border: "1.5px dashed #ccc", borderRadius: 8, background: "none", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Add Message
              </button>
            </>
          )}
        </s-stack>
      </s-section>

      {/* ── Scarcity Timer ── */}
      <s-section heading="Scarcity Countdown Timer">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Countdown Timer"
            desc="Show a countdown banner to create urgency. Timer resets on new browser sessions."
            checked={scarcityEnabled}
            onChange={setScarcityEnabled}
          />
          {scarcityEnabled && (
            <>
              <div style={{ padding: "12px 16px", background: scarcityBgColor, color: scarcityTextColor, borderRadius: 8, textAlign: "center", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span>{scarcityText}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: "monospace", fontSize: 16 }}>
                  {String(Math.floor(scarcityMinutes / 60)).padStart(2, "0")}:{String(scarcityMinutes % 60).padStart(2, "0")}:00
                </span>
              </div>
              <div>
                <label style={labelStyle}>Timer Label</label>
                <input type="text" value={scarcityText} onChange={e => setScarcityText(e.target.value)}
                  style={inputStyle} placeholder="⏰ Offer ends in:" />
              </div>
              <div>
                <label style={labelStyle}>Countdown Duration (minutes)</label>
                <input type="number" value={scarcityMinutes} onChange={e => setScarcityMinutes(Math.max(1, parseInt(e.target.value) || 15))}
                  style={{ ...inputStyle, width: 120 }} min="1" max="1440" />
                <p style={helpText}>Timer resets for each new browser session.</p>
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <label style={labelStyle}>Background Color</label>
                  <ColorPicker value={scarcityBgColor} onChange={setScarcityBgColor} small />
                </div>
                <div>
                  <label style={labelStyle}>Text Color</label>
                  <ColorPicker value={scarcityTextColor} onChange={setScarcityTextColor} small />
                </div>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* ── Tiered Rewards ── */}
      <s-section heading="Tiered Rewards">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Tiered Rewards"
            desc="Show a progress bar with multiple reward milestones. Displays just below the banner."
            checked={tieredRewardsEnabled}
            onChange={setTieredRewardsEnabled}
          />
          {tieredRewardsEnabled && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                Add reward tiers in ascending order. Use <code style={{ background: "#f5f5f5", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>{"{{amount}}"}</code> in your label to show the remaining amount dynamically.
              </p>
              {tieredRewards.map((tier, idx) => (
                <div key={tier.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 16, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <strong style={{ fontSize: 13 }}>Tier {idx + 1}</strong>
                    <button onClick={() => removeTier(tier.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <div style={{ flex: "0 0 140px" }}>
                      <label style={labelStyle}>Type</label>
                      <select value={tier.thresholdType} onChange={e => updateTier(tier.id, "thresholdType", e.target.value)}
                        style={{ ...inputStyle, width: "100%" }}>
                        <option value="cartValue">Cart Value ({s.currencySymbol || "$"})</option>
                        <option value="quantity">Item Quantity</option>
                      </select>
                    </div>
                    <div style={{ flex: "0 0 100px" }}>
                      <label style={labelStyle}>Threshold</label>
                      <input type="number" value={tier.threshold}
                        onChange={e => updateTier(tier.id, "threshold", parseFloat(e.target.value) || 0)}
                        style={{ ...inputStyle, width: "100%" }} min="0" />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Locked Message</label>
                    <input type="text" value={tier.label}
                      onChange={e => updateTier(tier.id, "label", e.target.value)}
                      style={inputStyle} placeholder="Spend {{amount}} more to unlock free shipping" />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Unlocked Message</label>
                    <input type="text" value={tier.unlockedLabel}
                      onChange={e => updateTier(tier.id, "unlockedLabel", e.target.value)}
                      style={inputStyle} placeholder="🚚 Free shipping unlocked!" />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", background: "#f0faf5", borderRadius: 8, border: "1px solid #d4f0e5" }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>Confetti on Unlock</strong>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#555" }}>Show confetti burst when this tier is reached.</p>
                    </div>
                    <label style={toggleWrap}>
                      <input type="checkbox" checked={tier.confettiEnabled !== false}
                        onChange={e => updateTier(tier.id, "confettiEnabled", e.target.checked)}
                        style={{ display: "none" }} />
                      <span style={{ ...toggleTrack, background: tier.confettiEnabled !== false ? "#008060" : "#ccc" }}>
                        <span style={{ ...toggleThumb, transform: tier.confettiEnabled !== false ? "translateX(20px)" : "translateX(2px)" }} />
                      </span>
                    </label>
                  </div>
                </div>
              ))}
              <button onClick={addTier} style={{ ...outlineBtn, width: "100%" }}>
                + Add Reward Tier
              </button>
            </>
          )}
        </s-stack>
      </s-section>

      {/* ── Discount Code ── */}
      <div>
        <s-section heading="Discount Code">
          <s-stack direction="block" gap="base">
            <ToggleRow
              label="Show Discount Code Field"
              desc="Let customers enter a manual discount code. Validated against Shopify and applied at checkout."
              checked={discountEnabled}
              onChange={setDiscountEnabled}
            />
          </s-stack>
        </s-section>

        <s-section heading="View All Offers (Coupon List)">
          <s-stack direction="block" gap="base">
            <ToggleRow
              label="Enable View All Offers"
              desc="Adds a 'View All Offers' link under the discount field. Customers see your codes (e.g. JACK5) and apply with one tap."
              checked={offersEnabled}
              onChange={setOffersEnabled}
            />
            {offersEnabled && (
              <>
                {configuredDiscounts.map((c, idx) => (
                  <div key={c.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <strong style={{ fontSize: 13 }}>Coupon {idx + 1}</strong>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <ToggleInline checked={c.enabled !== false} onChange={v => setConfiguredDiscounts(configuredDiscounts.map((x, i) => i === idx ? { ...x, enabled: v } : x))} />
                        <button onClick={() => setConfiguredDiscounts(configuredDiscounts.filter((_, i) => i !== idx))}
                          style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Discount Code</label>
                      <input type="text" value={c.code || ""} style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: 1 }}
                        onChange={e => setConfiguredDiscounts(configuredDiscounts.map((x, i) => i === idx ? { ...x, code: e.target.value.toUpperCase() } : x))}
                        placeholder="SAVE10" />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={labelStyle}>Description</label>
                      <input type="text" value={c.description || ""} style={inputStyle}
                        onChange={e => setConfiguredDiscounts(configuredDiscounts.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                        placeholder="10% off on orders above $50" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>Show as one-click coupon</strong>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#666" }}>Display this coupon directly in the cart (with Apply) without opening "View all coupons".</p>
                      </div>
                      <ToggleInline checked={!!c.oneClick} onChange={v => setConfiguredDiscounts(configuredDiscounts.map((x, i) => i === idx ? { ...x, oneClick: v } : x))} />
                    </div>
                  </div>
                ))}
                <button onClick={() => setConfiguredDiscounts([...configuredDiscounts, { id: "cpn_" + Date.now(), code: "", description: "", enabled: true }])}
                  style={{ width: "100%", padding: "10px 16px", border: "1.5px dashed #ccc", borderRadius: 8, background: "none", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  + Add Coupon
                </button>
                <p style={helpText}>
                  Each code must be a real, active discount created in Shopify Admin → Discounts.
                  Shopify validates eligibility when the customer applies it.
                </p>
              </>
            )}
          </s-stack>
        </s-section>

        <s-section heading="Auto-Apply Discount">
          <s-stack direction="block" gap="base">
            <ToggleRow
              label="Enable Auto-Apply Discount"
              desc="Pre-fill a discount code in the cart so customers just click Apply — no typing required."
              checked={autoDiscountEnabled}
              onChange={setAutoDiscountEnabled}
            />
            {autoDiscountEnabled && (
              <div>
                <label style={labelStyle}>Discount Code</label>
                <input
                  type="text"
                  value={autoDiscountCode}
                  onChange={e => setAutoDiscountCode(e.target.value.toUpperCase())}
                  style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: 1 }}
                  placeholder="SAVE10"
                />
                <p style={helpText}>
                  Must be an active discount code created in Shopify Admin → Discounts.
                  The code will be pre-validated and savings shown automatically.
                </p>
              </div>
            )}
          </s-stack>
        </s-section>
      </div>

      {/* ── Order Notes ── */}
      <s-section heading="Order Notes">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Order Notes"
            desc="Add a notes textarea in the side cart for customers to add special instructions."
            checked={orderNotesEnabled}
            onChange={setOrderNotesEnabled}
          />
        </s-stack>
      </s-section>

      {/* ── Order Summary ── */}
      <s-section heading="Order Summary">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Show Order Summary"
            desc="Display a collapsible price breakdown (MRP, discounts, total) just above the checkout button."
            checked={orderSummaryEnabled}
            onChange={setOrderSummaryEnabled}
          />
        </s-stack>
      </s-section>

      {/* ── Add-to-Cart Behavior ── */}
      <s-section heading="Add-to-Cart Behavior">
        <s-stack direction="block" gap="base">
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Choose what happens when a customer clicks an Add-to-Cart button on your storefront.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { value: "drawer", label: "Open Side Cart", desc: "Slide open EdgeCart immediately after adding a product (default)." },
              { value: "toast", label: "Show Toast Notification", desc: "Display a small popup confirming the product was added without opening the cart." },
            ].map(opt => (
              <label key={opt.value} style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px",
                border: "1.5px solid " + (addToCartBehavior === opt.value ? "#008060" : "#e0e0e0"),
                borderRadius: 10, background: addToCartBehavior === opt.value ? "#f0faf5" : "#fff",
                cursor: "pointer", transition: "border-color 0.15s",
              }}>
                <input type="radio" name="addToCartBehavior" value={opt.value}
                  checked={addToCartBehavior === opt.value}
                  onChange={() => setAddToCartBehavior(opt.value)}
                  style={{ marginTop: 2, accentColor: "#008060" }} />
                <div>
                  <strong style={{ fontSize: 13, display: "block", marginBottom: 2 }}>{opt.label}</strong>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
          {addToCartBehavior === "toast" && (
            <div>
              <label style={labelStyle}>Toast Duration (seconds)</label>
              <input type="number" value={addToCartToastSeconds}
                onChange={e => setAddToCartToastSeconds(Math.min(10, Math.max(1, parseInt(e.target.value) || 3)))}
                style={{ ...inputStyle, width: 100 }} min="1" max="10" />
              <p style={helpText}>How long the "Added to cart" popup stays visible (1–10 seconds).</p>
            </div>
          )}
        </s-stack>
      </s-section>

      {/* ── One-Click Upsell ── */}
      <OcuSection
        shopify={shopify}
        ocuEnabled={ocuEnabled} setOcuEnabled={setOcuEnabled}
        ocuHeading={ocuHeading} setOcuHeading={setOcuHeading}
        ocuLabel={ocuLabel} setOcuLabel={setOcuLabel}
        ocuHideWhenInCart={ocuHideWhenInCart} setOcuHideWhenInCart={setOcuHideWhenInCart}
        ocuProduct={ocuProduct} setOcuProduct={setOcuProduct}
        currencySymbol={shopCurrencySymbol}
      />

      {/* ── Custom Code ── */}
      <s-section heading="Custom CSS &amp; JavaScript">
        <s-stack direction="block" gap="base">
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            Inject custom styles and scripts into your side cart. Use this to override
            colours, fonts, layout, or add any DOM manipulation — exactly like other
            side-cart apps. Changes apply to every customer on your store.
          </p>

          {/* Cart Icon Selector */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#374151" }}>
              Custom Cart Icon Selector
            </label>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
              EdgeCart automatically detects Horizon, Tinker, Savor, Dawn, and other popular themes.
              If your theme uses a different cart icon, paste its CSS selector here
              (right-click the cart icon → Inspect → copy the unique class or ID).
              Example: <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 }}>.my-theme__cart-btn</code>
            </p>
            <input
              type="text"
              value={customCartIconSelector}
              onChange={e => setCustomCartIconSelector(e.target.value)}
              placeholder="Leave blank to use automatic theme detection"
              style={{
                width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
                borderRadius: 6, fontSize: 13, fontFamily: "monospace",
                boxSizing: "border-box", outline: "none", color: "#111827",
              }}
            />
          </div>

          {/* Custom CSS */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#374151" }}>
              Custom CSS
            </label>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
              Target any side-cart element. Example: <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 }}>.ec-checkout-btn {"{ background: #e63946; }"}</code>
            </p>
            <textarea
              value={customCss}
              onChange={e => setCustomCss(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={`/* Custom CSS — targets your side cart */\n.ec-checkout-btn {\n  background: #e63946;\n  border-radius: 4px;\n}\n\n.ec-cart {\n  font-family: 'Your Font', sans-serif;\n}`}
              style={{
                width: "100%", display: "block", fontFamily: "monospace", fontSize: 12,
                padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6,
                background: "#1e1e2e", color: "#cdd6f4", lineHeight: 1.6,
                resize: "vertical", boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          {/* Custom JS */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#374151" }}>
              Custom JavaScript
            </label>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 8px" }}>
              Runs once after the side cart initialises. Access <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 }}>document</code>, <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 }}>window</code>, and any global library already on the page.
            </p>
            <textarea
              value={customJs}
              onChange={e => setCustomJs(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={`// Custom JavaScript — runs after EdgeCart loads\n\n// Example: log when cart opens\ndocument.addEventListener('EdgeCart:open', function() {\n  console.log('Cart opened');\n});\n\n// Example: change button text\nvar btn = document.querySelector('.ec-checkout-btn');\nif (btn) btn.textContent = 'Buy Now';`}
              style={{
                width: "100%", display: "block", fontFamily: "monospace", fontSize: 12,
                padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6,
                background: "#1e1e2e", color: "#cdd6f4", lineHeight: 1.6,
                resize: "vertical", boxSizing: "border-box", outline: "none",
              }}
            />
          </div>

          <p style={{ fontSize: 11, color: "#d97706", margin: 0 }}>
            ⚠ Custom code runs on your live storefront. Test thoroughly before saving.
          </p>
        </s-stack>
      </s-section>

          {/* ── Preview ── */}
          <s-section slot="aside" heading="Live Cart Preview">
            <CartPreview settings={preview} />
          </s-section>
        </>
      )}

      {activeTab === "features" && <FeaturesTab settings={s} shopify={shopify} />}

      {activeTab === "productpage" && <ProductPageTab settings={s} shopify={shopify} />}

      {activeTab === "analytics" && (
        <AnalyticsTab
          data={analyticsF.data}
          loading={analyticsF.state !== "idle"}
          days={analyticsDays}
          setDays={setAnalyticsDays}
        />
      )}
    </s-page>
  );
}

// ── Features Tab ───────────────────────────────────────────
const DEFAULT_BADGES = [
  { id: "1", icon: "🔒", text: "Secure Checkout", enabled: true },
  { id: "2", icon: "↩️", text: "Free Returns", enabled: true },
  { id: "3", icon: "✅", text: "Money-Back Guarantee", enabled: true },
  { id: "4", icon: "💬", text: "24/7 Support", enabled: true },
];

function FeaturesTab({ settings: s, shopify }) {
  const featF = useFetcher();
  const saving = featF.state !== "idle";
  const fmt = (cents) => (s.currencySymbol || "$") + (cents / 100).toFixed(2);
  function parseBadges(raw) { try { return JSON.parse(raw || "[]"); } catch { return []; } }
  function parseTiers(raw) { try { return JSON.parse(raw || "[]"); } catch { return []; } }

  const [freeShippingBarEnabled,   setFreeShippingBarEnabled]   = useState(s.freeShippingBarEnabled ?? false);
  const [freeShippingThreshold,    setFreeShippingThreshold]    = useState(s.freeShippingThreshold ?? 50);
  const [freeShippingText,         setFreeShippingText]         = useState(s.freeShippingText ?? "Add {{amount}} more for FREE shipping!");
  const [freeShippingUnlockedText, setFreeShippingUnlockedText] = useState(s.freeShippingUnlockedText ?? "You've unlocked free shipping!");
  const [trustBadgesEnabled, setTrustBadgesEnabled] = useState(s.trustBadgesEnabled ?? false);
  const [trustBadges, setTrustBadges] = useState(() => { const p = parseBadges(s.trustBadges); return p.length > 0 ? p : DEFAULT_BADGES; });
  const [stickyAtcEnabled, setStickyAtcEnabled] = useState(s.stickyAtcEnabled ?? false);
  const [stickyAtcText,    setStickyAtcText]    = useState(s.stickyAtcText ?? "Add to Cart");
  const [expressCheckoutEnabled,   setExpressCheckoutEnabled]   = useState(s.expressCheckoutEnabled ?? false);
  const [expressCheckoutShopPay,   setExpressCheckoutShopPay]   = useState(s.expressCheckoutShopPay ?? true);
  const [expressCheckoutApplePay,  setExpressCheckoutApplePay]  = useState(s.expressCheckoutApplePay ?? true);
  const [expressCheckoutGooglePay, setExpressCheckoutGooglePay] = useState(s.expressCheckoutGooglePay ?? false);
  const [volumeDiscountEnabled, setVolumeDiscountEnabled] = useState(s.volumeDiscountEnabled ?? false);
  const [volumeDiscountTitle,   setVolumeDiscountTitle]   = useState(s.volumeDiscountTitle ?? "Buy more, save more!");
  const [volumeDiscounts, setVolumeDiscounts] = useState(() => parseTiers(s.volumeDiscounts));
  const [giftWrapEnabled,        setGiftWrapEnabled]        = useState(s.giftWrapEnabled ?? false);
  const [giftWrapHeading,        setGiftWrapHeading]        = useState(s.giftWrapHeading ?? "Gift Options");
  const [giftWrapLabel,          setGiftWrapLabel]          = useState(s.giftWrapLabel ?? "Add gift wrap");
  const [giftWrapHideWhenInCart, setGiftWrapHideWhenInCart] = useState(s.giftWrapHideWhenInCart ?? true);
  const [giftWrapProduct,        setGiftWrapProduct]        = useState(
    s.giftWrapProductVariantId ? { variantId: s.giftWrapProductVariantId, title: s.giftWrapProductTitle || "", imageUrl: s.giftWrapProductImageUrl || "", price: s.giftWrapPrice || 0 } : null
  );
  const [stockScarcityEnabled,   setStockScarcityEnabled]   = useState(s.stockScarcityEnabled ?? false);
  const [stockScarcityThreshold, setStockScarcityThreshold] = useState(s.stockScarcityThreshold ?? 5);
  const [stockScarcityText,      setStockScarcityText]      = useState(s.stockScarcityText ?? "Only {{count}} left!");
  const [recentlyViewedEnabled, setRecentlyViewedEnabled] = useState(s.recentlyViewedEnabled ?? false);
  const [recentlyViewedTitle,   setRecentlyViewedTitle]   = useState(s.recentlyViewedTitle ?? "You might also like");
  const [recentlyViewedLimit,   setRecentlyViewedLimit]   = useState(s.recentlyViewedLimit ?? 4);
  const [cartShareEnabled, setCartShareEnabled] = useState(s.cartShareEnabled ?? false);
  const [cartShareText,    setCartShareText]    = useState(s.cartShareText ?? "Share your cart");
  const [cartRecoveryEnabled,  setCartRecoveryEnabled]  = useState(s.cartRecoveryEnabled ?? false);
  const [cartRecoveryLabel,    setCartRecoveryLabel]    = useState(s.cartRecoveryLabel ?? "💬 Send cart link via WhatsApp");
  const [cartRecoveryMessage,  setCartRecoveryMessage]  = useState(s.cartRecoveryMessage ?? "Check out my cart: {{url}}");
  const [deliveryEstimatorEnabled, setDeliveryEstimatorEnabled] = useState(s.deliveryEstimatorEnabled ?? false);
  const [deliveryMinDays,          setDeliveryMinDays]          = useState(s.deliveryMinDays ?? 3);
  const [deliveryMaxDays,          setDeliveryMaxDays]          = useState(s.deliveryMaxDays ?? 7);
  const [deliveryMessage,          setDeliveryMessage]          = useState(s.deliveryMessage ?? "Estimated delivery: {{date_range}}");
  const [deliveryCutoffHour,       setDeliveryCutoffHour]       = useState(s.deliveryCutoffHour ?? 14);

  function snap() {
    return JSON.stringify({
      freeShippingBarEnabled, freeShippingThreshold, freeShippingText, freeShippingUnlockedText,
      trustBadgesEnabled, trustBadges, stickyAtcEnabled, stickyAtcText,
      expressCheckoutEnabled, expressCheckoutShopPay, expressCheckoutApplePay, expressCheckoutGooglePay,
      volumeDiscountEnabled, volumeDiscountTitle, volumeDiscounts,
      giftWrapEnabled, giftWrapHeading, giftWrapLabel, giftWrapHideWhenInCart, giftWrapProduct,
      stockScarcityEnabled, stockScarcityThreshold, stockScarcityText,
      recentlyViewedEnabled, recentlyViewedTitle, recentlyViewedLimit,
      cartShareEnabled, cartShareText,
      cartRecoveryEnabled, cartRecoveryLabel, cartRecoveryMessage,
      deliveryEstimatorEnabled, deliveryMinDays, deliveryMaxDays, deliveryMessage, deliveryCutoffHour,
    });
  }
  const savedSnap = useRef(snap());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { setIsDirty(snap() !== savedSnap.current); }, [
    freeShippingBarEnabled, freeShippingThreshold, freeShippingText, freeShippingUnlockedText,
    trustBadgesEnabled, trustBadges, stickyAtcEnabled, stickyAtcText,
    expressCheckoutEnabled, expressCheckoutShopPay, expressCheckoutApplePay, expressCheckoutGooglePay,
    volumeDiscountEnabled, volumeDiscountTitle, volumeDiscounts,
    giftWrapEnabled, giftWrapHeading, giftWrapLabel, giftWrapHideWhenInCart, giftWrapProduct,
    stockScarcityEnabled, stockScarcityThreshold, stockScarcityText,
    recentlyViewedEnabled, recentlyViewedTitle, recentlyViewedLimit,
    cartShareEnabled, cartShareText,
    cartRecoveryEnabled, cartRecoveryLabel, cartRecoveryMessage,
    deliveryEstimatorEnabled, deliveryMinDays, deliveryMaxDays, deliveryMessage, deliveryCutoffHour,
  ]);

  useEffect(() => {
    if (featF.data?.success) { shopify.toast.show("Settings saved!"); savedSnap.current = snap(); setIsDirty(false); }
  }, [featF.data]);

  function handleDiscard() {
    setFreeShippingBarEnabled(s.freeShippingBarEnabled ?? false);
    setFreeShippingThreshold(s.freeShippingThreshold ?? 50);
    setFreeShippingText(s.freeShippingText ?? "Add {{amount}} more for FREE shipping!");
    setFreeShippingUnlockedText(s.freeShippingUnlockedText ?? "You've unlocked free shipping!");
    setTrustBadgesEnabled(s.trustBadgesEnabled ?? false);
    setTrustBadges(() => { const p = parseBadges(s.trustBadges); return p.length > 0 ? p : DEFAULT_BADGES; });
    setStickyAtcEnabled(s.stickyAtcEnabled ?? false); setStickyAtcText(s.stickyAtcText ?? "Add to Cart");
    setExpressCheckoutEnabled(s.expressCheckoutEnabled ?? false); setExpressCheckoutShopPay(s.expressCheckoutShopPay ?? true);
    setExpressCheckoutApplePay(s.expressCheckoutApplePay ?? true); setExpressCheckoutGooglePay(s.expressCheckoutGooglePay ?? false);
    setVolumeDiscountEnabled(s.volumeDiscountEnabled ?? false); setVolumeDiscountTitle(s.volumeDiscountTitle ?? "Buy more, save more!");
    setVolumeDiscounts(() => parseTiers(s.volumeDiscounts));
    setGiftWrapEnabled(s.giftWrapEnabled ?? false); setGiftWrapHeading(s.giftWrapHeading ?? "Gift Options");
    setGiftWrapLabel(s.giftWrapLabel ?? "Add gift wrap"); setGiftWrapHideWhenInCart(s.giftWrapHideWhenInCart ?? true);
    setGiftWrapProduct(s.giftWrapProductVariantId ? { variantId: s.giftWrapProductVariantId, title: s.giftWrapProductTitle || "", imageUrl: s.giftWrapProductImageUrl || "", price: s.giftWrapPrice || 0 } : null);
    setStockScarcityEnabled(s.stockScarcityEnabled ?? false); setStockScarcityThreshold(s.stockScarcityThreshold ?? 5); setStockScarcityText(s.stockScarcityText ?? "Only {{count}} left!");
    setRecentlyViewedEnabled(s.recentlyViewedEnabled ?? false); setRecentlyViewedTitle(s.recentlyViewedTitle ?? "You might also like"); setRecentlyViewedLimit(s.recentlyViewedLimit ?? 4);
    setCartShareEnabled(s.cartShareEnabled ?? false); setCartShareText(s.cartShareText ?? "Share your cart");
    setCartRecoveryEnabled(s.cartRecoveryEnabled ?? false); setCartRecoveryLabel(s.cartRecoveryLabel ?? "💬 Send cart link via WhatsApp"); setCartRecoveryMessage(s.cartRecoveryMessage ?? "Check out my cart: {{url}}");
    setDeliveryEstimatorEnabled(s.deliveryEstimatorEnabled ?? false); setDeliveryMinDays(s.deliveryMinDays ?? 3); setDeliveryMaxDays(s.deliveryMaxDays ?? 7);
    setDeliveryMessage(s.deliveryMessage ?? "Estimated delivery: {{date_range}}"); setDeliveryCutoffHour(s.deliveryCutoffHour ?? 14);
  }

  function handleSubmit() {
    featF.submit({
      freeShippingBarEnabled: String(freeShippingBarEnabled), freeShippingThreshold: String(freeShippingThreshold),
      freeShippingText, freeShippingUnlockedText,
      trustBadgesEnabled: String(trustBadgesEnabled), trustBadges: JSON.stringify(trustBadges),
      stickyAtcEnabled: String(stickyAtcEnabled), stickyAtcText,
      expressCheckoutEnabled: String(expressCheckoutEnabled), expressCheckoutShopPay: String(expressCheckoutShopPay),
      expressCheckoutApplePay: String(expressCheckoutApplePay), expressCheckoutGooglePay: String(expressCheckoutGooglePay),
      volumeDiscountEnabled: String(volumeDiscountEnabled), volumeDiscountTitle, volumeDiscounts: JSON.stringify(volumeDiscounts),
      giftWrapEnabled: String(giftWrapEnabled), giftWrapHeading, giftWrapLabel, giftWrapHideWhenInCart: String(giftWrapHideWhenInCart),
      giftWrapProductVariantId: giftWrapProduct?.variantId || "", giftWrapProductTitle: giftWrapProduct?.title || "",
      giftWrapProductImageUrl: giftWrapProduct?.imageUrl || "", giftWrapPrice: String(giftWrapProduct?.price || 0),
      stockScarcityEnabled: String(stockScarcityEnabled), stockScarcityThreshold: String(stockScarcityThreshold), stockScarcityText,
      recentlyViewedEnabled: String(recentlyViewedEnabled), recentlyViewedTitle, recentlyViewedLimit: String(recentlyViewedLimit),
      cartShareEnabled: String(cartShareEnabled), cartShareText,
      cartRecoveryEnabled: String(cartRecoveryEnabled), cartRecoveryLabel, cartRecoveryMessage,
      deliveryEstimatorEnabled: String(deliveryEstimatorEnabled), deliveryMinDays: String(deliveryMinDays), deliveryMaxDays: String(deliveryMaxDays),
      deliveryMessage, deliveryCutoffHour: String(deliveryCutoffHour),
    }, { method: "POST", action: "/app/features" });
  }

  function addBadge() { setTrustBadges([...trustBadges, { id: "b_" + Date.now(), icon: "⭐", text: "New Badge", enabled: true }]); }
  function updateBadge(id, field, value) { setTrustBadges(trustBadges.map(b => b.id === id ? { ...b, [field]: value } : b)); }
  function removeBadge(id) { setTrustBadges(trustBadges.filter(b => b.id !== id)); }
  function addVdTier() { setVolumeDiscounts([...volumeDiscounts, { id: "vd_" + Date.now(), qty: 2, pct: 10 }]); }
  function updateVdTier(id, field, value) { setVolumeDiscounts(volumeDiscounts.map(t => t.id === id ? { ...t, [field]: value } : t)); }
  function removeVdTier(id) { setVolumeDiscounts(volumeDiscounts.filter(t => t.id !== id)); }

  async function pickGiftWrapProduct() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    if (!selected || selected.length === 0) return;
    const p = selected[0]; const variant = p.variants?.[0];
    setGiftWrapProduct({ variantId: variant?.id || "", title: p.title || "", imageUrl: p.images?.[0]?.originalSrc || "", price: variant?.price ? Math.round(parseFloat(variant.price) * 100) : 0 });
  }

  const codeStyle = { background: "#f5f5f5", padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "monospace" };

  return (
    <>
      {isDirty && <SaveBar onSave={handleSubmit} onDiscard={handleDiscard} saving={saving} />}

      {/* Free Shipping Progress Bar */}
      <s-section heading="Free Shipping Progress Bar">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Free Shipping Bar" desc="Show a progress bar at the top of the cart tracking how close the customer is to free shipping." checked={freeShippingBarEnabled} onChange={setFreeShippingBarEnabled} />
          {freeShippingBarEnabled && (<>
            <div>
              <label style={labelStyle}>Free Shipping Threshold ({s.currencySymbol || "$"})</label>
              <input type="number" value={freeShippingThreshold} onChange={e => setFreeShippingThreshold(parseFloat(e.target.value) || 50)} style={{ ...inputStyle, width: 120 }} min="0" step="0.01" />
              <p style={helpText}>Cart total required to unlock free shipping.</p>
            </div>
            <div>
              <label style={labelStyle}>Locked Message</label>
              <input type="text" value={freeShippingText} onChange={e => setFreeShippingText(e.target.value)} style={inputStyle} placeholder="Add {{amount}} more for FREE shipping!" />
              <p style={helpText}>Use <code style={codeStyle}>{"{{amount}}"}</code> to show the remaining amount dynamically.</p>
            </div>
            <div>
              <label style={labelStyle}>Unlocked Message</label>
              <input type="text" value={freeShippingUnlockedText} onChange={e => setFreeShippingUnlockedText(e.target.value)} style={inputStyle} placeholder="You've unlocked free shipping!" />
            </div>
          </>)}
        </s-stack>
      </s-section>

      {/* Trust Badges */}
      <s-section heading="Trust Badges">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Trust Badges" desc="Show security and trust icons below the checkout button to boost conversion." checked={trustBadgesEnabled} onChange={setTrustBadgesEnabled} />
          {trustBadgesEnabled && (<>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "12px 14px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              {trustBadges.filter(b => b.enabled).map(b => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}>
                  <span>{b.icon}</span><span style={{ fontWeight: 500, color: "#374151" }}>{b.text}</span>
                </div>
              ))}
            </div>
            {trustBadges.map((badge, idx) => (
              <div key={badge.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>Badge {idx + 1}</strong>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label style={toggleWrap}>
                      <input type="checkbox" checked={badge.enabled} onChange={e => updateBadge(badge.id, "enabled", e.target.checked)} style={{ display: "none" }} />
                      <span style={{ ...toggleTrack, background: badge.enabled ? "#008060" : "#ccc" }}><span style={{ ...toggleThumb, transform: badge.enabled ? "translateX(20px)" : "translateX(2px)" }} /></span>
                    </label>
                    <button onClick={() => removeBadge(badge.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: "0 0 70px" }}>
                    <label style={labelStyle}>Icon</label>
                    <input type="text" value={badge.icon} onChange={e => updateBadge(badge.id, "icon", e.target.value)} style={{ ...inputStyle, textAlign: "center", fontSize: 18 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Text</label>
                    <input type="text" value={badge.text} onChange={e => updateBadge(badge.id, "text", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addBadge} style={{ ...outlineBtn, width: "100%" }}>+ Add Badge</button>
          </>)}
        </s-stack>
      </s-section>

      {/* Sticky Add-to-Cart */}
      <s-section heading="Sticky Add-to-Cart">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Sticky Add-to-Cart" desc="On product pages, show a fixed bottom bar when the main ATC button scrolls out of view." checked={stickyAtcEnabled} onChange={setStickyAtcEnabled} />
          {stickyAtcEnabled && (
            <div>
              <label style={labelStyle}>Button Text</label>
              <input type="text" value={stickyAtcText} onChange={e => setStickyAtcText(e.target.value)} style={inputStyle} placeholder="Add to Cart" />
            </div>
          )}
        </s-stack>
      </s-section>

      {/* Express Checkout */}
      <s-section heading="Express Checkout Buttons">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Express Checkout" desc="Show quick payment method buttons below the main checkout button (Shop Pay, Apple Pay, Google Pay)." checked={expressCheckoutEnabled} onChange={setExpressCheckoutEnabled} />
          {expressCheckoutEnabled && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { key: "shopPay", val: expressCheckoutShopPay, set: setExpressCheckoutShopPay, label: "Shop Pay", color: "#5a31f4", desc: "Shopify's accelerated checkout" },
                { key: "applePay", val: expressCheckoutApplePay, set: setExpressCheckoutApplePay, label: "Apple Pay", color: "#000", desc: "Available on Safari and iOS" },
                { key: "googlePay", val: expressCheckoutGooglePay, set: setExpressCheckoutGooglePay, label: "Google Pay", color: "#4285f4", desc: "Available on Chrome and Android" },
              ].map(opt => (
                <div key={opt.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fafafa" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: opt.color }} />
                    <div><strong style={{ fontSize: 13 }}>{opt.label}</strong><p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{opt.desc}</p></div>
                  </div>
                  <label style={toggleWrap}>
                    <input type="checkbox" checked={opt.val} onChange={e => opt.set(e.target.checked)} style={{ display: "none" }} />
                    <span style={{ ...toggleTrack, background: opt.val ? "#008060" : "#ccc" }}><span style={{ ...toggleThumb, transform: opt.val ? "translateX(20px)" : "translateX(2px)" }} /></span>
                  </label>
                </div>
              ))}
            </div>
          </>)}
        </s-stack>
      </s-section>

      {/* Volume Discounts */}
      <s-section heading="Volume Discounts">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Volume Discounts" desc="Show a discount tier table in the cart. Create matching discounts in Shopify Admin." checked={volumeDiscountEnabled} onChange={setVolumeDiscountEnabled} />
          {volumeDiscountEnabled && (<>
            <div>
              <label style={labelStyle}>Section Title</label>
              <input type="text" value={volumeDiscountTitle} onChange={e => setVolumeDiscountTitle(e.target.value)} style={inputStyle} placeholder="Buy more, save more!" />
            </div>
            {volumeDiscounts.map((tier, idx) => (
              <div key={tier.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>Tier {idx + 1}</strong>
                  <button onClick={() => removeVdTier(tier.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Min Quantity</label><input type="number" value={tier.qty} min="1" onChange={e => updateVdTier(tier.id, "qty", parseInt(e.target.value) || 1)} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><label style={labelStyle}>Discount %</label><input type="number" value={tier.pct} min="1" max="99" onChange={e => updateVdTier(tier.id, "pct", parseInt(e.target.value) || 10)} style={inputStyle} /></div>
                </div>
              </div>
            ))}
            <button onClick={addVdTier} style={{ ...outlineBtn, width: "100%" }}>+ Add Tier</button>
          </>)}
        </s-stack>
      </s-section>

      {/* Gift Wrap */}
      <s-section heading="Gift Wrap">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Gift Wrap" desc="Show a checkbox in the cart to let customers add gift wrapping." checked={giftWrapEnabled} onChange={setGiftWrapEnabled} />
          {giftWrapEnabled && (<>
            <div><label style={labelStyle}>Section Heading</label><input type="text" value={giftWrapHeading} onChange={e => setGiftWrapHeading(e.target.value)} style={inputStyle} placeholder="Gift Options" /></div>
            <div><label style={labelStyle}>Checkbox Label</label><input type="text" value={giftWrapLabel} onChange={e => setGiftWrapLabel(e.target.value)} style={inputStyle} placeholder="Add gift wrap" /></div>
            <ToggleRow label="Hide when product is already in cart" desc="Once gift wrap is added, the checkbox disappears." checked={giftWrapHideWhenInCart} onChange={setGiftWrapHideWhenInCart} />
            <div>
              <label style={labelStyle}>Gift Wrap Product</label>
              {giftWrapProduct ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fafafa" }}>
                  {giftWrapProduct.imageUrl && <img src={giftWrapProduct.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{giftWrapProduct.title}</p><p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{fmt(giftWrapProduct.price)}</p></div>
                  <button onClick={pickGiftWrapProduct} style={{ ...outlineBtn, padding: "7px 14px", fontSize: 12 }}>Change</button>
                  <button onClick={() => setGiftWrapProduct(null)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                </div>
              ) : (
                <button onClick={pickGiftWrapProduct} style={{ ...outlineBtn, width: "100%" }}>+ Select Gift Wrap Product</button>
              )}
            </div>
          </>)}
        </s-stack>
      </s-section>

      {/* Stock Scarcity Badges */}
      <s-section heading="Stock Scarcity Badges">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Stock Scarcity Badges" desc="Show a low-stock warning badge on line items when inventory falls below the threshold." checked={stockScarcityEnabled} onChange={setStockScarcityEnabled} />
          {stockScarcityEnabled && (<>
            <div>
              <label style={labelStyle}>Low Stock Threshold</label>
              <input type="number" value={stockScarcityThreshold} min="1" max="50" onChange={e => setStockScarcityThreshold(parseInt(e.target.value) || 5)} style={{ ...inputStyle, width: 100 }} />
              <p style={helpText}>Show the badge when inventory is at or below this number.</p>
            </div>
            <div>
              <label style={labelStyle}>Badge Text</label>
              <input type="text" value={stockScarcityText} onChange={e => setStockScarcityText(e.target.value)} style={inputStyle} placeholder="Only {{count}} left!" />
              <p style={helpText}>Use <code style={codeStyle}>{"{{count}}"}</code> to show the actual inventory count.</p>
            </div>
          </>)}
        </s-stack>
      </s-section>

      {/* Recently Viewed */}
      <s-section heading="Recently Viewed (Empty Cart)">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Recently Viewed" desc="When the cart is empty, show a grid of recently viewed products." checked={recentlyViewedEnabled} onChange={setRecentlyViewedEnabled} />
          {recentlyViewedEnabled && (<>
            <div><label style={labelStyle}>Section Title</label><input type="text" value={recentlyViewedTitle} onChange={e => setRecentlyViewedTitle(e.target.value)} style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Max Products to Show (2–6)</label>
              <input type="number" value={recentlyViewedLimit} min="2" max="6" onChange={e => setRecentlyViewedLimit(Math.min(6, Math.max(2, parseInt(e.target.value) || 4)))} style={{ ...inputStyle, width: 100 }} />
            </div>
          </>)}
        </s-stack>
      </s-section>

      {/* Cart Share Link */}
      <s-section heading="Cart Share Link">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Cart Share" desc="Add a 'Share cart' link that copies a permalink to the customer's current cart contents." checked={cartShareEnabled} onChange={setCartShareEnabled} />
          {cartShareEnabled && (<div><label style={labelStyle}>Link Text</label><input type="text" value={cartShareText} onChange={e => setCartShareText(e.target.value)} style={inputStyle} /></div>)}
        </s-stack>
      </s-section>

      {/* Cart Recovery / WhatsApp */}
      <s-section heading="Cart Recovery & WhatsApp Share">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Cart Recovery" desc="Show a WhatsApp share button so customers can send their cart link to themselves or a friend." checked={cartRecoveryEnabled} onChange={setCartRecoveryEnabled} />
          {cartRecoveryEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>Section Label</label>
                <input type="text" value={cartRecoveryLabel} onChange={e => setCartRecoveryLabel(e.target.value)} style={inputStyle} placeholder="💬 Send cart link via WhatsApp" />
                <p style={helpText}>This text appears above the phone input in the side cart.</p>
              </div>
              <div>
                <label style={labelStyle}>Message Template</label>
                <input type="text" value={cartRecoveryMessage} onChange={e => setCartRecoveryMessage(e.target.value)} style={inputStyle} placeholder="Check out my cart: {{url}}" />
                <p style={helpText}>Use <code style={codeStyle}>{"{{url}}"}</code> to insert the cart permalink automatically. Customers enter their own phone number in the side cart.</p>
              </div>
            </div>
          )}
        </s-stack>
      </s-section>

      {/* Delivery Date Estimator */}
      <s-section heading="Delivery Date Estimator">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Delivery Estimator" desc="Show an estimated delivery date range above the checkout button." checked={deliveryEstimatorEnabled} onChange={setDeliveryEstimatorEnabled} />
          {deliveryEstimatorEnabled && (<>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Min Days</label><input type="number" value={deliveryMinDays} min="1" max="30" onChange={e => setDeliveryMinDays(parseInt(e.target.value) || 3)} style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Max Days</label><input type="number" value={deliveryMaxDays} min="1" max="60" onChange={e => setDeliveryMaxDays(parseInt(e.target.value) || 7)} style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Cutoff Hour (24h)</label><input type="number" value={deliveryCutoffHour} min="0" max="23" onChange={e => setDeliveryCutoffHour(parseInt(e.target.value) || 14)} style={inputStyle} /><p style={helpText}>Orders after this hour ship next day.</p></div>
            </div>
            <div>
              <label style={labelStyle}>Message Template</label>
              <input type="text" value={deliveryMessage} onChange={e => setDeliveryMessage(e.target.value)} style={inputStyle} placeholder="Estimated delivery: {{date_range}}" />
              <p style={helpText}>Use <code style={codeStyle}>{"{{date_range}}"}</code> for the computed date range.</p>
            </div>
          </>)}
        </s-stack>
      </s-section>
    </>
  );
}

// ── Product Page Tab ────────────────────────────────────────
function ProductPageTab({ settings: s, shopify }) {
  const ppF = useFetcher();
  const saving = ppF.state !== "idle";
  const fmt = (cents) => (s.currencySymbol || "$") + (cents / 100).toFixed(2);
  function parseProducts(raw) { try { return JSON.parse(raw || "[]"); } catch { return []; } }

  const [socialProofEnabled,  setSocialProofEnabled]  = useState(s.productPageSocialProofEnabled ?? false);
  const [socialProofText,     setSocialProofText]     = useState(s.productPageSocialProofText ?? "🔥 {{count}} people bought this today");
  const [socialProofMin,      setSocialProofMin]      = useState(s.productPageSocialProofMin ?? 5);
  const [socialProofMax,      setSocialProofMax]      = useState(s.productPageSocialProofMax ?? 30);
  const [socialProofInterval, setSocialProofInterval] = useState(s.productPageSocialProofInterval ?? 8);
  const [scarcityEnabled,    setScarcityEnabled]    = useState(s.productPageScarcityEnabled ?? false);
  const [volumeTableEnabled, setVolumeTableEnabled] = useState(s.productPageVolumeTableEnabled ?? false);
  const [freebieTeaser,      setFreebieTeaser]      = useState(s.productPageFreebieTeaser ?? false);
  const [upsellEnabled,  setUpsellEnabled]  = useState(s.productPageUpsellEnabled ?? false);
  const [upsellTitle,    setUpsellTitle]    = useState(s.productPageUpsellTitle ?? "Customers Also Bought");
  const [upsellLimit,    setUpsellLimit]    = useState(s.productPageUpsellLimit ?? 3);
  const [upsellProducts, setUpsellProducts] = useState(() => parseProducts(s.productPageUpsellProducts));

  function snap() {
    return JSON.stringify({ socialProofEnabled, socialProofText, socialProofMin, socialProofMax, socialProofInterval, scarcityEnabled, volumeTableEnabled, freebieTeaser, upsellEnabled, upsellTitle, upsellLimit, upsellProducts });
  }
  const savedSnap = useRef(snap());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => { setIsDirty(snap() !== savedSnap.current); }, [
    socialProofEnabled, socialProofText, socialProofMin, socialProofMax, socialProofInterval,
    scarcityEnabled, volumeTableEnabled, freebieTeaser, upsellEnabled, upsellTitle, upsellLimit, upsellProducts,
  ]);

  useEffect(() => {
    if (ppF.data?.success) { shopify.toast.show("Settings saved!"); savedSnap.current = snap(); setIsDirty(false); }
  }, [ppF.data]);

  function handleDiscard() {
    setSocialProofEnabled(s.productPageSocialProofEnabled ?? false);
    setSocialProofText(s.productPageSocialProofText ?? "🔥 {{count}} people bought this today");
    setSocialProofMin(s.productPageSocialProofMin ?? 5); setSocialProofMax(s.productPageSocialProofMax ?? 30); setSocialProofInterval(s.productPageSocialProofInterval ?? 8);
    setScarcityEnabled(s.productPageScarcityEnabled ?? false); setVolumeTableEnabled(s.productPageVolumeTableEnabled ?? false); setFreebieTeaser(s.productPageFreebieTeaser ?? false);
    setUpsellEnabled(s.productPageUpsellEnabled ?? false); setUpsellTitle(s.productPageUpsellTitle ?? "Customers Also Bought"); setUpsellLimit(s.productPageUpsellLimit ?? 3);
    setUpsellProducts(() => parseProducts(s.productPageUpsellProducts));
  }

  function handleSubmit() {
    ppF.submit({
      productPageSocialProofEnabled: String(socialProofEnabled), productPageSocialProofText: socialProofText,
      productPageSocialProofMin: String(socialProofMin), productPageSocialProofMax: String(socialProofMax), productPageSocialProofInterval: String(socialProofInterval),
      productPageScarcityEnabled: String(scarcityEnabled), productPageVolumeTableEnabled: String(volumeTableEnabled), productPageFreebieTeaser: String(freebieTeaser),
      productPageUpsellEnabled: String(upsellEnabled), productPageUpsellTitle: upsellTitle, productPageUpsellLimit: String(upsellLimit), productPageUpsellProducts: JSON.stringify(upsellProducts),
    }, { method: "POST", action: "/app/productpage" });
  }

  async function pickUpsellProducts() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: 6 });
    if (!selected || selected.length === 0) return;
    setUpsellProducts(selected.map(p => ({
      id: p.id, title: p.title, handle: p.handle, imageUrl: p.images?.[0]?.originalSrc || "",
      variantId: p.variants?.[0]?.id || "",
      price: p.variants?.[0]?.price ? Math.round(parseFloat(p.variants[0].price) * 100) : 0,
      comparePrice: p.variants?.[0]?.compareAtPrice ? Math.round(parseFloat(p.variants[0].compareAtPrice) * 100) : 0,
    })));
  }

  const codeStyle = { background: "#f5f5f5", padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "monospace" };

  return (
    <>
      {isDirty && <SaveBar onSave={handleSubmit} onDiscard={handleDiscard} saving={saving} />}

      <s-section>
        <div style={{ padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, fontSize: 13, color: "#1e40af" }}>
          <strong>How it works:</strong> These widgets inject automatically into any Shopify product page where EdgeCart is installed via the App Embed. They work across all themes — Dawn, Debut, Horizon, Minimal, and more.
        </div>
      </s-section>

      {/* Social Proof */}
      <s-section heading="Social Proof Notifications">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Social Proof" desc="Show a floating notification on product pages — e.g. '🔥 14 people bought this today' — to create urgency and trust." checked={socialProofEnabled} onChange={setSocialProofEnabled} />
          {socialProofEnabled && (<>
            <div>
              <label style={labelStyle}>Message Template</label>
              <input type="text" value={socialProofText} onChange={e => setSocialProofText(e.target.value)} style={inputStyle} placeholder="🔥 {{count}} people bought this today" />
              <p style={helpText}>Use <code style={codeStyle}>{"{{count}}"}</code> for the random number. Try "👀 {"{{count}}"} people are viewing this right now".</p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><label style={labelStyle}>Min Count</label><input type="number" value={socialProofMin} min="1" onChange={e => setSocialProofMin(parseInt(e.target.value) || 5)} style={inputStyle} /></div>
              <div style={{ flex: 1 }}><label style={labelStyle}>Max Count</label><input type="number" value={socialProofMax} min="1" onChange={e => setSocialProofMax(parseInt(e.target.value) || 30)} style={inputStyle} /></div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Interval (seconds)</label>
                <input type="number" value={socialProofInterval} min="5" max="60" onChange={e => setSocialProofInterval(parseInt(e.target.value) || 8)} style={inputStyle} />
                <p style={helpText}>How often a new notification appears.</p>
              </div>
            </div>
            <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 13, fontWeight: 600, color: "#111" }}>
                {socialProofText.replace("{{count}}", String(Math.floor((socialProofMin + socialProofMax) / 2)))}
              </div>
            </div>
          </>)}
        </s-stack>
      </s-section>

      {/* Stock Scarcity Badge */}
      <s-section heading="Stock Scarcity Badge">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Show Scarcity Badge on Product Pages" desc="Displays a low-stock warning below the Add to Cart button when inventory is low." checked={scarcityEnabled} onChange={setScarcityEnabled} />
          {scarcityEnabled && (
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Badge text and threshold are configured in the <strong>Features</strong> tab → Stock Scarcity Badges.</p>
          )}
        </s-stack>
      </s-section>

      {/* Volume Discount Table */}
      <s-section heading="Volume Discount Table">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Show Volume Discounts on Product Pages" desc="Display your buy-more-save-more tier table on every product page above the Add to Cart button." checked={volumeTableEnabled} onChange={setVolumeTableEnabled} />
          {volumeTableEnabled && (
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Discount tiers are configured in the <strong>Features</strong> tab → Volume Discounts.</p>
          )}
        </s-stack>
      </s-section>

      {/* Free Gift Teaser */}
      <s-section heading="Free Gift Teaser">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Show Free Gift Teaser on Product Pages" desc="Displays 'Add this item and you're $X away from a free gift!' below the ATC button to motivate customers." checked={freebieTeaser} onChange={setFreebieTeaser} />
          {freebieTeaser && (
            <>
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <div style={{ padding: "10px 14px", background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                  🎁 Add $20 more to unlock a free gift!
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>The amount shown is calculated live from the customer's cart vs your free gift threshold (configured in the Freebie page).</p>
            </>
          )}
        </s-stack>
      </s-section>

      {/* Product Page Upsell */}
      <s-section heading="Product Page Upsell">
        <s-stack direction="block" gap="base">
          <ToggleRow label="Enable Product Page Upsell" desc="Show a 'Customers Also Bought' product grid below the Add to Cart button. Uses Shopify AI recommendations by default." checked={upsellEnabled} onChange={setUpsellEnabled} />
          {upsellEnabled && (<>
            <div><label style={labelStyle}>Section Title</label><input type="text" value={upsellTitle} onChange={e => setUpsellTitle(e.target.value)} style={inputStyle} placeholder="Customers Also Bought" /></div>
            <div>
              <label style={labelStyle}>Max Products to Show (1–6)</label>
              <input type="number" value={upsellLimit} min="1" max="6" onChange={e => setUpsellLimit(Math.min(6, Math.max(1, parseInt(e.target.value) || 3)))} style={{ ...inputStyle, width: 100 }} />
            </div>
            <div style={{ padding: "12px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#111" }}>Product Source</p>
              {upsellProducts.length === 0 ? (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>Using <strong>Shopify AI Recommendations</strong> (automatically picks related products for each product page).</p>
              ) : (
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>Using <strong>{upsellProducts.length} manually selected product{upsellProducts.length > 1 ? "s" : ""}</strong>.</p>
              )}
              <button onClick={pickUpsellProducts} style={{ ...outlineBtn, marginRight: 10 }}>{upsellProducts.length > 0 ? "Change Products" : "Pick Manual Products"}</button>
              {upsellProducts.length > 0 && (
                <button onClick={() => setUpsellProducts([])} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Use AI Instead</button>
              )}
            </div>
            {upsellProducts.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {upsellProducts.slice(0, upsellLimit).map(p => (
                  <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                    {p.imageUrl && <img src={p.imageUrl} alt={p.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />}
                    <div style={{ padding: "8px 10px" }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{fmt(p.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </s-stack>
      </s-section>
    </>
  );
}

// ── Analytics Tab ──────────────────────────────────────────
function money(cents, sym) {
  return (sym || "$") + (cents / 100).toFixed(2);
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 14,
      padding: "20px 22px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: color || "#111", letterSpacing: "-0.5px" }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "#6b7280" }}>{sub}</span>}
    </div>
  );
}

function BarChart({ data, days }) {
  const max = Math.max(...data.map((d) => d.rev), 1);
  const showEvery = days <= 7 ? 1 : days <= 14 ? 2 : 7;
  return (
    <div style={{ padding: "0 0 8px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
        {data.map((d) => {
          const pct = Math.max((d.rev / max) * 100, d.rev > 0 ? 4 : 0);
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div title={d.date + ": " + money(d.rev)} style={{
                width: "100%", height: pct + "%",
                background: d.rev > 0 ? "linear-gradient(180deg, #6366f1, #818cf8)" : "#f3f4f6",
                borderRadius: "4px 4px 2px 2px", minHeight: 3, transition: "height 0.3s ease",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {data.map((d, i) => {
          const show = i % showEvery === 0 || i === data.length - 1;
          return (
            <div key={d.date} style={{ flex: 1, fontSize: 9, color: "#9ca3af", textAlign: "center", overflow: "hidden" }}>
              {show ? d.date.slice(5) : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsTab({ data, loading, days, setDays }) {
  const periods = [
    { label: "7 days", value: 7 },
    { label: "30 days", value: 30 },
    { label: "90 days", value: 90 },
  ];

  if (loading || !data) {
    return (
      <s-section>
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <p style={{ fontSize: 14, margin: 0 }}>Loading analytics…</p>
        </div>
      </s-section>
    );
  }

  return (
    <>
      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => setDays(p.value)}ð
            style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              border: "none", cursor: "pointer",
              background: days === p.value ? "#111" : "#f3f4f6",
              color: days === p.value ? "#fff" : "#374151",
              transition: "all 0.15s",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!data.hasData ? (
        <s-section>
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>No data yet</p>
            <p style={{ fontSize: 14, margin: 0 }}>Analytics will appear here once customers start using your cart.</p>
          </div>
        </s-section>
      ) : (
        <>
          <s-section title="Cart Revenue">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <MetricCard label="Total Cart Value" value={money(data.totalCartValue ?? data.totalRevenue ?? 0)} sub={`${data.checkouts} carts reached checkout`} color="#111" />
              <MetricCard label="Avg Cart Value" value={money(data.avgCartValue ?? data.aov ?? 0)} sub="per checkout" color="#6366f1" />
              <MetricCard label="Upsell Cart Impact" value={money(data.upsellCartImpact ?? data.upsellRevenue ?? 0)} sub={`${data.upsellAdds} upsells added`} color="#059669" />
              <MetricCard label="Conversion Rate" value={data.conversionRate + "%"} sub={`${data.checkouts} of ${data.cartOpens} cart opens`} color="#d97706" />
            </div>
            <div style={{ background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 14, padding: "20px 22px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#374151" }}>
                Cart Value at Checkout — last {data.days} days
              </p>
              <p style={{ margin: "0 0 16px", fontSize: 11, color: "#9ca3af" }}>Cart value when customer clicked Checkout</p>
              <BarChart data={data.dailyRevenue} days={data.days} />
            </div>
          </s-section>

          <s-section title="Engagement">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              <MetricCard label="Cart Opens" value={data.cartOpens.toLocaleString()} sub={`last ${data.days} days`} />
              <MetricCard label="Reached Checkout" value={data.checkouts.toLocaleString()} sub="clicked checkout" color="#6366f1" />
              <MetricCard label="Upsells Added" value={data.upsellAdds.toLocaleString()} sub="by customers" color="#059669" />
              <MetricCard label="Free Gifts Claimed" value={data.freebieAdds.toLocaleString()} sub="freebies auto-added" color="#ec4899" />
            </div>
          </s-section>

          {data.topUpsells && data.topUpsells.length > 0 && (
            <s-section title="Top Upsell Products">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.topUpsells.map((u, i) => {
                  const rankColors = ["#fbbf24", "#9ca3af", "#cd7c54"];
                  const displayName = u.productTitle
                    ? (u.variantTitle && u.variantTitle !== "Default Title" ? `${u.productTitle} — ${u.variantTitle}` : u.productTitle)
                    : `Variant #${u.vid}`;
                  return (
                    <div key={u.vid} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                      background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 10,
                    }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: rankColors[i] || "#e5e7eb",
                        color: i < 3 ? "#fff" : "#374151", fontSize: 11, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{displayName}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
                        {u.count} add{u.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </s-section>
          )}
        </>
      )}

      <s-section>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          📌 Tracks: cart opens, checkouts (with cart value at that moment), upsell adds, and freebie claims. "Cart value at checkout" is what was in the cart when the customer clicked Checkout — actual collected revenue may differ due to discounts or abandoned carts.
        </p>
      </s-section>
    </>
  );
}

// ── Cart Preview Component ──────────────────────────────────
function CartPreview({ settings }) {
  const {
    headerText, primaryColor,
    bannerEnabled, bannerText, bannerBgColor, bannerTextColor,
    scarcityEnabled, scarcityText, scarcityMinutes, scarcityBgColor, scarcityTextColor,
    tieredRewardsEnabled, tieredRewards,
    discountEnabled, autoDiscountEnabled, autoDiscountCode,
    orderNotesEnabled, showVariantTitle, showLineItemProperties,
  } = settings;

  const sampleItems = [
    { title: "Premium T-Shirt", variant: "Size: M / Black", price: 2999, qty: 1 },
    { title: "Classic Sneakers", variant: "Size: 10 / White", price: 8999, qty: 1 },
  ];
  const cartTotal = sampleItems.reduce((s, i) => s + i.price * i.qty, 0);

  const fmt = (cents) => (settings.currencySymbol || "$") + (cents / 100).toFixed(2);

  // Tiered rewards progress
  const sortedTiers = [...(Array.isArray(tieredRewards) ? tieredRewards : [])].sort((a, b) => a.threshold - b.threshold);
  const cartValue = cartTotal / 100;

  const previewStyle = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 12,
    overflow: "hidden",
    fontSize: 13,
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    maxWidth: 340,
  };

  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888", textAlign: "center" }}>
        Live preview updates as you change settings
      </p>
      <div style={previewStyle}>
        {/* Banner */}
        {bannerEnabled && bannerText && (
          <div style={{ padding: "9px 14px", background: bannerBgColor, color: bannerTextColor, textAlign: "center", fontSize: 12, fontWeight: 600 }}>
            {bannerText}
          </div>
        )}

        {/* Scarcity Timer */}
        {scarcityEnabled && (
          <div style={{ padding: "8px 14px", background: scarcityBgColor, color: scarcityTextColor, textAlign: "center", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>{scarcityText}</span>
            <span style={{ fontFamily: "monospace", fontSize: 13 }}>
              {String(Math.floor(scarcityMinutes / 60)).padStart(2, "0")}:{String(scarcityMinutes % 60).padStart(2, "0")}:00
            </span>
          </div>
        )}

        {/* Tiered Rewards */}
        {tieredRewardsEnabled && sortedTiers.length > 0 && (
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0", background: "#fffbeb" }}>
            {sortedTiers.map((tier, i) => {
              const unlocked = tier.thresholdType === "cartValue"
                ? cartValue >= tier.threshold
                : cartTotal >= tier.threshold;
              const prev = i === 0 ? 0 : sortedTiers[i - 1].threshold;
              const pct = unlocked ? 100 : Math.min(100, Math.round(((cartValue - prev) / (tier.threshold - prev)) * 100));
              return (
                <div key={tier.id} style={{ marginBottom: i < sortedTiers.length - 1 ? 8 : 0 }}>
                  <p style={{ margin: "0 0 5px", fontSize: 11, fontWeight: 600, color: unlocked ? "#166534" : "#92400e" }}>
                    {unlocked ? tier.unlockedLabel : (tier.label || "").replace("{{amount}}", fmt(Math.max(0, tier.threshold * 100 - cartTotal)))}
                  </p>
                  <div style={{ height: 6, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct + "%", background: "linear-gradient(90deg,#f472b6,#dc2626)", borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px", borderBottom: "1px solid #f0f0f0" }}>
          <strong style={{ fontSize: 14, color: "#111" }}>{headerText || "Your Cart"}</strong>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", fontSize: 14 }}>✕</div>
        </div>

        {/* Items */}
        <div>
          {sampleItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f8f8f8" }}>
              <div style={{ width: 52, height: 52, borderRadius: 8, background: "linear-gradient(135deg,#f0f0f0,#e0e0e0)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111" }}>{item.title}</p>
                  <span style={{ fontSize: 12, color: "#e53e3e", cursor: "pointer" }}>✕</span>
                </div>
                {showVariantTitle && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>{item.variant}</p>}
                {showLineItemProperties && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#aaa" }}>Gift message: Happy Birthday!</p>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid #e0e0e0", borderRadius: 6, overflow: "hidden", background: "#fafafa" }}>
                    <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#444" }}>−</span>
                    <span style={{ padding: "0 6px", fontSize: 12, fontWeight: 700, color: "#111" }}>{item.qty}</span>
                    <span style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#444" }}>+</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{fmt(item.price * item.qty)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #f0f0f0" }}>
          {/* Discount */}
          {discountEnabled && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input readOnly value={autoDiscountEnabled ? autoDiscountCode : ""} placeholder="Discount code"
                  style={{ flex: 1, padding: "7px 10px", border: "1.5px solid #e0e0e0", borderRadius: 7, fontSize: 12, background: "#fafafa", color: "#111", outline: "none" }} />
                <button style={{ padding: "7px 12px", background: "#111", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Apply</button>
              </div>
            </div>
          )}

          {/* Order Notes */}
          {orderNotesEnabled && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f5f5f5" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 }}>Order Notes</label>
              <textarea readOnly rows={2} placeholder="Add a note to your order…"
                style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #e0e0e0", borderRadius: 7, fontSize: 12, resize: "none", boxSizing: "border-box", background: "#fafafa", color: "#888", outline: "none" }} />
            </div>
          )}

          {/* Summary */}
          <div style={{ padding: "10px 14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#555" }}>Subtotal</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{fmt(cartTotal)}</span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#aaa", textAlign: "right" }}>Taxes & shipping at checkout</p>
          </div>
          <div style={{ padding: "10px 14px 14px" }}>
            <div style={{ padding: "13px", background: primaryColor, color: "#fff", textAlign: "center", borderRadius: 8, fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>
              Checkout · {fmt(cartTotal)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SaveBar ─────────────────────────────────────────────────
function SaveBar({ onSave, onDiscard, saving }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#fff",
      borderBottom: "1px solid #e5e7eb",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 28px",
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>Unsaved changes</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={onDiscard}
          disabled={saving}
          style={{
            padding: "8px 18px", borderRadius: 7,
            border: "1.5px solid #d1d5db",
            background: "#fff", color: "#374151",
            fontSize: 13, fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.5 : 1,
          }}
        >
          Discard
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "8px 22px", borderRadius: 7, border: "none",
            background: saving ? "#374151" : "#111827",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.75 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── One-Click Upsell Section ─────────────────────────────────
function OcuSection({ shopify, ocuEnabled, setOcuEnabled, ocuHeading, setOcuHeading, ocuLabel, setOcuLabel, ocuHideWhenInCart, setOcuHideWhenInCart, ocuProduct, setOcuProduct, currencySymbol }) {
  async function pickProduct() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    if (!selected || selected.length === 0) return;
    const p = selected[0];
    const variant = p.variants?.[0];
    setOcuProduct({
      variantId: variant?.id || "",
      title: p.title || "",
      imageUrl: p.images?.[0]?.originalSrc || p.images?.[0]?.src || "",
      price: variant?.price ? Math.round(parseFloat(variant.price) * 100) : 0,
    });
  }

  const fmt = (cents) => (currencySymbol || "$") + (cents / 100).toFixed(2);

  return (
    <s-section heading="One-Click Upsell">
      <s-stack direction="block" gap="base">
        <ToggleRow
          label="Enable One-Click Upsell"
          desc="Show a checkbox below cart items. When checked, the selected product is added to the cart instantly."
          checked={ocuEnabled}
          onChange={setOcuEnabled}
        />
        {ocuEnabled && (
          <>
            <div>
              <label style={labelStyle}>Section Heading</label>
              <input
                type="text"
                value={ocuHeading}
                onChange={e => setOcuHeading(e.target.value)}
                style={inputStyle}
                placeholder="Complete your order"
              />
              <p style={helpText}>Title shown above the upsell checkbox in the cart.</p>
            </div>

            <div>
              <label style={labelStyle}>Checkbox Label</label>
              <input
                type="text"
                value={ocuLabel}
                onChange={e => setOcuLabel(e.target.value)}
                style={inputStyle}
                placeholder="Add to your order"
              />
              <p style={helpText}>Shown next to the product image inside the checkbox row.</p>
            </div>

            <ToggleRow
              label="Hide when product is already in cart"
              desc="Once the customer adds the upsell product, the checkbox disappears. Turn off to always show it."
              checked={ocuHideWhenInCart}
              onChange={setOcuHideWhenInCart}
            />

            <div>
              <label style={labelStyle}>Upsell Product</label>
              {ocuProduct ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fafafa",
                }}>
                  {ocuProduct.imageUrl && (
                    <img src={ocuProduct.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ocuProduct.title}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{fmt(ocuProduct.price)}</p>
                  </div>
                  <button onClick={pickProduct} style={{ ...outlineBtn, padding: "7px 14px", fontSize: 12 }}>Change</button>
                  <button onClick={() => setOcuProduct(null)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                </div>
              ) : (
                <button onClick={pickProduct} style={{ ...outlineBtn, width: "100%" }}>
                  + Select Product
                </button>
              )}
            </div>

            <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#111" }}>{ocuHeading || "Complete your order"}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff", borderRadius: 8, border: "1.5px solid #e5e7eb" }}>
                <input type="checkbox" style={{ accentColor: "#008060", width: 18, height: 18, flexShrink: 0 }} readOnly />
                {ocuProduct?.imageUrl && (
                  <img src={ocuProduct.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 7, border: "1px solid #f0f0f0" }} />
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111" }}>{ocuLabel || "Add to your order"}</p>
                  {ocuProduct && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{ocuProduct.title} · {fmt(ocuProduct.price)}</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </s-stack>
    </s-section>
  );
}

// ── Shared sub-components ───────────────────────────────────
function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div>
        <strong style={{ fontSize: 14 }}>{label}</strong>
        {desc && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>{desc}</p>}
      </div>
      <label style={toggleWrap}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: "none" }} />
        <span style={{ ...toggleTrack, background: checked ? "#008060" : "#ccc" }}>
          <span style={{ ...toggleThumb, transform: checked ? "translateX(20px)" : "translateX(2px)" }} />
        </span>
      </label>
    </div>
  );
}

function ToggleInline({ checked, onChange }) {
  return (
    <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: "none" }} />
      <span style={{ display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2, transition: "background 0.2s", alignItems: "center", background: checked ? "#008060" : "#ccc" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s", display: "block", transform: checked ? "translateX(20px)" : "translateX(2px)" }} />
      </span>
    </label>
  );
}

function ColorPicker({ value, onChange, small }) {
  return (
    <div style={{ display: "flex", gap: small ? 6 : 10, alignItems: "center" }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 40, height: 40, border: "1.5px solid #e0e0e0", borderRadius: 8, cursor: "pointer", padding: 2 }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, width: small ? 90 : 110 }} placeholder="#000000" />
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────
const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 };
const helpText   = { margin: "6px 0 0", fontSize: 12, color: "#888" };
const inputStyle = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8,
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box", background: "#fafafa",
};
const outlineBtn = {
  padding: "10px 16px", border: "1.5px dashed #ccc", borderRadius: 8, background: "none",
  color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center",
};
const toggleWrap  = { display: "inline-flex", cursor: "pointer", flexShrink: 0 };
const toggleTrack = { display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2, transition: "background 0.2s", alignItems: "center" };
const toggleThumb = { width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s", display: "block" };

export const headers = (headersArgs) => boundary.headers(headersArgs);
