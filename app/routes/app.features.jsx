import { useEffect, useRef, useState } from "react";
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
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const data = {
    freeShippingBarEnabled:   form.get("freeShippingBarEnabled") === "true",
    freeShippingThreshold:    parseFloat(form.get("freeShippingThreshold") || "50"),
    freeShippingText:         String(form.get("freeShippingText") || "Add {{amount}} more for FREE shipping!"),
    freeShippingUnlockedText: String(form.get("freeShippingUnlockedText") || "You've unlocked free shipping!"),

    trustBadgesEnabled: form.get("trustBadgesEnabled") === "true",
    trustBadges:        String(form.get("trustBadges") || "[]"),

    stickyAtcEnabled: form.get("stickyAtcEnabled") === "true",
    stickyAtcText:    String(form.get("stickyAtcText") || "Add to Cart"),

    expressCheckoutEnabled:   form.get("expressCheckoutEnabled") === "true",
    expressCheckoutShopPay:   form.get("expressCheckoutShopPay") === "true",
    expressCheckoutApplePay:  form.get("expressCheckoutApplePay") === "true",
    expressCheckoutGooglePay: form.get("expressCheckoutGooglePay") === "true",

    volumeDiscountEnabled: form.get("volumeDiscountEnabled") === "true",
    volumeDiscountTitle:   String(form.get("volumeDiscountTitle") || "Buy more, save more!"),
    volumeDiscounts:       String(form.get("volumeDiscounts") || "[]"),

    giftWrapEnabled:          form.get("giftWrapEnabled") === "true",
    giftWrapHeading:          String(form.get("giftWrapHeading") || "Gift Options"),
    giftWrapLabel:            String(form.get("giftWrapLabel") || "Add gift wrap"),
    giftWrapHideWhenInCart:   form.get("giftWrapHideWhenInCart") === "true",
    giftWrapProductVariantId: String(form.get("giftWrapProductVariantId") || ""),
    giftWrapProductTitle:     String(form.get("giftWrapProductTitle") || ""),
    giftWrapProductImageUrl:  String(form.get("giftWrapProductImageUrl") || ""),
    giftWrapPrice:            parseInt(form.get("giftWrapPrice") || "0", 10),

    stockScarcityEnabled:   form.get("stockScarcityEnabled") === "true",
    stockScarcityThreshold: parseInt(form.get("stockScarcityThreshold") || "5", 10),
    stockScarcityText:      String(form.get("stockScarcityText") || "Only {{count}} left!"),

    recentlyViewedEnabled: form.get("recentlyViewedEnabled") === "true",
    recentlyViewedTitle:   String(form.get("recentlyViewedTitle") || "You might also like"),
    recentlyViewedLimit:   Math.min(6, Math.max(2, parseInt(form.get("recentlyViewedLimit") || "4", 10))),

    cartShareEnabled: form.get("cartShareEnabled") === "true",
    cartShareText:    String(form.get("cartShareText") || "Share your cart"),
  };

  await prisma.cartSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
};

const DEFAULT_BADGES = [
  { id: "1", icon: "🔒", text: "Secure Checkout", enabled: true },
  { id: "2", icon: "↩️", text: "Free Returns", enabled: true },
  { id: "3", icon: "✅", text: "Money-Back Guarantee", enabled: true },
  { id: "4", icon: "💬", text: "24/7 Support", enabled: true },
];

export default function FeaturesPage() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const s = settings || {};

  function parseBadges(raw) {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
  }
  function parseDiscounts(raw) {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
  }

  const [freeShippingBarEnabled,   setFreeShippingBarEnabled]   = useState(s.freeShippingBarEnabled ?? false);
  const [freeShippingThreshold,    setFreeShippingThreshold]    = useState(s.freeShippingThreshold ?? 50);
  const [freeShippingText,         setFreeShippingText]         = useState(s.freeShippingText ?? "Add {{amount}} more for FREE shipping!");
  const [freeShippingUnlockedText, setFreeShippingUnlockedText] = useState(s.freeShippingUnlockedText ?? "You've unlocked free shipping!");

  const [trustBadgesEnabled, setTrustBadgesEnabled] = useState(s.trustBadgesEnabled ?? false);
  const [trustBadges, setTrustBadges] = useState(() => {
    const parsed = parseBadges(s.trustBadges);
    return parsed.length > 0 ? parsed : DEFAULT_BADGES;
  });

  const [stickyAtcEnabled, setStickyAtcEnabled] = useState(s.stickyAtcEnabled ?? false);
  const [stickyAtcText,    setStickyAtcText]    = useState(s.stickyAtcText ?? "Add to Cart");

  const [expressCheckoutEnabled,   setExpressCheckoutEnabled]   = useState(s.expressCheckoutEnabled ?? false);
  const [expressCheckoutShopPay,   setExpressCheckoutShopPay]   = useState(s.expressCheckoutShopPay ?? true);
  const [expressCheckoutApplePay,  setExpressCheckoutApplePay]  = useState(s.expressCheckoutApplePay ?? true);
  const [expressCheckoutGooglePay, setExpressCheckoutGooglePay] = useState(s.expressCheckoutGooglePay ?? false);

  const [volumeDiscountEnabled, setVolumeDiscountEnabled] = useState(s.volumeDiscountEnabled ?? false);
  const [volumeDiscountTitle,   setVolumeDiscountTitle]   = useState(s.volumeDiscountTitle ?? "Buy more, save more!");
  const [volumeDiscounts, setVolumeDiscounts] = useState(() => parseDiscounts(s.volumeDiscounts));

  const [giftWrapEnabled,          setGiftWrapEnabled]          = useState(s.giftWrapEnabled ?? false);
  const [giftWrapHeading,          setGiftWrapHeading]          = useState(s.giftWrapHeading ?? "Gift Options");
  const [giftWrapLabel,            setGiftWrapLabel]            = useState(s.giftWrapLabel ?? "Add gift wrap");
  const [giftWrapHideWhenInCart,   setGiftWrapHideWhenInCart]   = useState(s.giftWrapHideWhenInCart ?? true);
  const [giftWrapProduct,          setGiftWrapProduct]          = useState(
    s.giftWrapProductVariantId ? {
      variantId: s.giftWrapProductVariantId,
      title:     s.giftWrapProductTitle || "",
      imageUrl:  s.giftWrapProductImageUrl || "",
      price:     s.giftWrapPrice || 0,
    } : null
  );

  const [stockScarcityEnabled,   setStockScarcityEnabled]   = useState(s.stockScarcityEnabled ?? false);
  const [stockScarcityThreshold, setStockScarcityThreshold] = useState(s.stockScarcityThreshold ?? 5);
  const [stockScarcityText,      setStockScarcityText]      = useState(s.stockScarcityText ?? "Only {{count}} left!");

  const [recentlyViewedEnabled, setRecentlyViewedEnabled] = useState(s.recentlyViewedEnabled ?? false);
  const [recentlyViewedTitle,   setRecentlyViewedTitle]   = useState(s.recentlyViewedTitle ?? "You might also like");
  const [recentlyViewedLimit,   setRecentlyViewedLimit]   = useState(s.recentlyViewedLimit ?? 4);

  const [cartShareEnabled, setCartShareEnabled] = useState(s.cartShareEnabled ?? false);
  const [cartShareText,    setCartShareText]    = useState(s.cartShareText ?? "Share your cart");

  function snap() {
    return JSON.stringify({
      freeShippingBarEnabled, freeShippingThreshold, freeShippingText, freeShippingUnlockedText,
      trustBadgesEnabled, trustBadges,
      stickyAtcEnabled, stickyAtcText,
      expressCheckoutEnabled, expressCheckoutShopPay, expressCheckoutApplePay, expressCheckoutGooglePay,
      volumeDiscountEnabled, volumeDiscountTitle, volumeDiscounts,
      giftWrapEnabled, giftWrapHeading, giftWrapLabel, giftWrapHideWhenInCart, giftWrapProduct,
      stockScarcityEnabled, stockScarcityThreshold, stockScarcityText,
      recentlyViewedEnabled, recentlyViewedTitle, recentlyViewedLimit,
      cartShareEnabled, cartShareText,
    });
  }

  const savedSnap = useRef(snap());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(snap() !== savedSnap.current);
  }, [
    freeShippingBarEnabled, freeShippingThreshold, freeShippingText, freeShippingUnlockedText,
    trustBadgesEnabled, trustBadges,
    stickyAtcEnabled, stickyAtcText,
    expressCheckoutEnabled, expressCheckoutShopPay, expressCheckoutApplePay, expressCheckoutGooglePay,
    volumeDiscountEnabled, volumeDiscountTitle, volumeDiscounts,
    giftWrapEnabled, giftWrapHeading, giftWrapLabel, giftWrapHideWhenInCart, giftWrapProduct,
    stockScarcityEnabled, stockScarcityThreshold, stockScarcityText,
    recentlyViewedEnabled, recentlyViewedTitle, recentlyViewedLimit,
    cartShareEnabled, cartShareText,
  ]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved!");
      savedSnap.current = snap();
      setIsDirty(false);
    }
  }, [fetcher.data]);

  function handleDiscard() {
    setFreeShippingBarEnabled(s.freeShippingBarEnabled ?? false);
    setFreeShippingThreshold(s.freeShippingThreshold ?? 50);
    setFreeShippingText(s.freeShippingText ?? "Add {{amount}} more for FREE shipping!");
    setFreeShippingUnlockedText(s.freeShippingUnlockedText ?? "You've unlocked free shipping!");

    setTrustBadgesEnabled(s.trustBadgesEnabled ?? false);
    setTrustBadges(() => { const p = parseBadges(s.trustBadges); return p.length > 0 ? p : DEFAULT_BADGES; });

    setStickyAtcEnabled(s.stickyAtcEnabled ?? false);
    setStickyAtcText(s.stickyAtcText ?? "Add to Cart");

    setExpressCheckoutEnabled(s.expressCheckoutEnabled ?? false);
    setExpressCheckoutShopPay(s.expressCheckoutShopPay ?? true);
    setExpressCheckoutApplePay(s.expressCheckoutApplePay ?? true);
    setExpressCheckoutGooglePay(s.expressCheckoutGooglePay ?? false);

    setVolumeDiscountEnabled(s.volumeDiscountEnabled ?? false);
    setVolumeDiscountTitle(s.volumeDiscountTitle ?? "Buy more, save more!");
    setVolumeDiscounts(() => parseDiscounts(s.volumeDiscounts));

    setGiftWrapEnabled(s.giftWrapEnabled ?? false);
    setGiftWrapHeading(s.giftWrapHeading ?? "Gift Options");
    setGiftWrapLabel(s.giftWrapLabel ?? "Add gift wrap");
    setGiftWrapHideWhenInCart(s.giftWrapHideWhenInCart ?? true);
    setGiftWrapProduct(s.giftWrapProductVariantId ? {
      variantId: s.giftWrapProductVariantId,
      title:     s.giftWrapProductTitle || "",
      imageUrl:  s.giftWrapProductImageUrl || "",
      price:     s.giftWrapPrice || 0,
    } : null);

    setStockScarcityEnabled(s.stockScarcityEnabled ?? false);
    setStockScarcityThreshold(s.stockScarcityThreshold ?? 5);
    setStockScarcityText(s.stockScarcityText ?? "Only {{count}} left!");

    setRecentlyViewedEnabled(s.recentlyViewedEnabled ?? false);
    setRecentlyViewedTitle(s.recentlyViewedTitle ?? "You might also like");
    setRecentlyViewedLimit(s.recentlyViewedLimit ?? 4);

    setCartShareEnabled(s.cartShareEnabled ?? false);
    setCartShareText(s.cartShareText ?? "Share your cart");
  }

  function handleSubmit(e) {
    e?.preventDefault();
    fetcher.submit(
      {
        freeShippingBarEnabled:   String(freeShippingBarEnabled),
        freeShippingThreshold:    String(freeShippingThreshold),
        freeShippingText,
        freeShippingUnlockedText,

        trustBadgesEnabled: String(trustBadgesEnabled),
        trustBadges:        JSON.stringify(trustBadges),

        stickyAtcEnabled: String(stickyAtcEnabled),
        stickyAtcText,

        expressCheckoutEnabled:   String(expressCheckoutEnabled),
        expressCheckoutShopPay:   String(expressCheckoutShopPay),
        expressCheckoutApplePay:  String(expressCheckoutApplePay),
        expressCheckoutGooglePay: String(expressCheckoutGooglePay),

        volumeDiscountEnabled: String(volumeDiscountEnabled),
        volumeDiscountTitle,
        volumeDiscounts:       JSON.stringify(volumeDiscounts),

        giftWrapEnabled:          String(giftWrapEnabled),
        giftWrapHeading,
        giftWrapLabel,
        giftWrapHideWhenInCart:   String(giftWrapHideWhenInCart),
        giftWrapProductVariantId: giftWrapProduct?.variantId || "",
        giftWrapProductTitle:     giftWrapProduct?.title || "",
        giftWrapProductImageUrl:  giftWrapProduct?.imageUrl || "",
        giftWrapPrice:            String(giftWrapProduct?.price || 0),

        stockScarcityEnabled:   String(stockScarcityEnabled),
        stockScarcityThreshold: String(stockScarcityThreshold),
        stockScarcityText,

        recentlyViewedEnabled: String(recentlyViewedEnabled),
        recentlyViewedTitle,
        recentlyViewedLimit:   String(recentlyViewedLimit),

        cartShareEnabled: String(cartShareEnabled),
        cartShareText,
      },
      { method: "POST" }
    );
  }

  function addBadge() {
    setTrustBadges([...trustBadges, { id: "b_" + Date.now(), icon: "⭐", text: "New Badge", enabled: true }]);
  }
  function updateBadge(id, field, value) {
    setTrustBadges(trustBadges.map(b => b.id === id ? { ...b, [field]: value } : b));
  }
  function removeBadge(id) {
    setTrustBadges(trustBadges.filter(b => b.id !== id));
  }

  function addTier() {
    setVolumeDiscounts([...volumeDiscounts, { id: "vd_" + Date.now(), qty: 2, pct: 10 }]);
  }
  function updateTier(id, field, value) {
    setVolumeDiscounts(volumeDiscounts.map(t => t.id === id ? { ...t, [field]: value } : t));
  }
  function removeTier(id) {
    setVolumeDiscounts(volumeDiscounts.filter(t => t.id !== id));
  }

  async function pickGiftWrapProduct() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    if (!selected || selected.length === 0) return;
    const p = selected[0];
    const variant = p.variants?.[0];
    setGiftWrapProduct({
      variantId: variant?.id || "",
      title:     p.title || "",
      imageUrl:  p.images?.[0]?.originalSrc || "",
      price:     variant?.price ? Math.round(parseFloat(variant.price) * 100) : 0,
    });
  }

  const fmt = (cents) => "$" + (cents / 100).toFixed(2);

  return (
    <s-page heading="Features">
      {isDirty && (
        <SaveBar onSave={handleSubmit} onDiscard={handleDiscard} saving={saving} />
      )}

      {/* 1. Free Shipping Progress Bar */}
      <s-section heading="Free Shipping Progress Bar">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Free Shipping Bar"
            desc="Show a progress bar at the top of the cart tracking how close the customer is to free shipping."
            checked={freeShippingBarEnabled}
            onChange={setFreeShippingBarEnabled}
          />
          {freeShippingBarEnabled && (
            <>
              <div>
                <label style={labelStyle}>Free Shipping Threshold ($)</label>
                <input type="number" value={freeShippingThreshold}
                  onChange={e => setFreeShippingThreshold(parseFloat(e.target.value) || 50)}
                  style={{ ...inputStyle, width: 120 }} min="0" step="0.01" />
                <p style={helpText}>Cart total required to unlock free shipping.</p>
              </div>
              <div>
                <label style={labelStyle}>Locked Message</label>
                <input type="text" value={freeShippingText}
                  onChange={e => setFreeShippingText(e.target.value)}
                  style={inputStyle} placeholder="Add {{amount}} more for FREE shipping!" />
                <p style={helpText}>Use <code style={codeStyle}>{"{{amount}}"}</code> to show the remaining amount dynamically.</p>
              </div>
              <div>
                <label style={labelStyle}>Unlocked Message</label>
                <input type="text" value={freeShippingUnlockedText}
                  onChange={e => setFreeShippingUnlockedText(e.target.value)}
                  style={inputStyle} placeholder="You've unlocked free shipping!" />
              </div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 14 }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#166534" }}>
                  {freeShippingText.replace("{{amount}}", "$" + Math.max(0, freeShippingThreshold - 35).toFixed(2))}
                </p>
                <div style={{ height: 8, background: "#dcfce7", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "70%", background: "linear-gradient(90deg,#22c55e,#16a34a)", borderRadius: 4 }} />
                </div>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 2. Trust Badges */}
      <s-section heading="Trust Badges">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Trust Badges"
            desc="Show security and trust icons below the checkout button to boost conversion."
            checked={trustBadgesEnabled}
            onChange={setTrustBadgesEnabled}
          />
          {trustBadgesEnabled && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "12px 14px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                {trustBadges.filter(b => b.enabled).map(b => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}>
                    <span>{b.icon}</span>
                    <span style={{ fontWeight: 500, color: "#374151" }}>{b.text}</span>
                  </div>
                ))}
              </div>
              {trustBadges.map((badge, idx) => (
                <div key={badge.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Badge {idx + 1}</strong>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <label style={toggleWrap}>
                        <input type="checkbox" checked={badge.enabled}
                          onChange={e => updateBadge(badge.id, "enabled", e.target.checked)}
                          style={{ display: "none" }} />
                        <span style={{ ...toggleTrack, background: badge.enabled ? "#008060" : "#ccc" }}>
                          <span style={{ ...toggleThumb, transform: badge.enabled ? "translateX(20px)" : "translateX(2px)" }} />
                        </span>
                      </label>
                      <button onClick={() => removeBadge(badge.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: "0 0 70px" }}>
                      <label style={labelStyle}>Icon</label>
                      <input type="text" value={badge.icon}
                        onChange={e => updateBadge(badge.id, "icon", e.target.value)}
                        style={{ ...inputStyle, textAlign: "center", fontSize: 18 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Text</label>
                      <input type="text" value={badge.text}
                        onChange={e => updateBadge(badge.id, "text", e.target.value)}
                        style={inputStyle} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addBadge} style={{ ...outlineBtn, width: "100%" }}>+ Add Badge</button>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 3. Sticky Add-to-Cart */}
      <s-section heading="Sticky Add-to-Cart">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Sticky Add-to-Cart"
            desc="On product pages, show a fixed bottom bar when the main ATC button scrolls out of view. Clicking it adds the product and opens the cart."
            checked={stickyAtcEnabled}
            onChange={setStickyAtcEnabled}
          />
          {stickyAtcEnabled && (
            <div>
              <label style={labelStyle}>Button Text</label>
              <input type="text" value={stickyAtcText}
                onChange={e => setStickyAtcText(e.target.value)}
                style={inputStyle} placeholder="Add to Cart" />
            </div>
          )}
        </s-stack>
      </s-section>

      {/* 4. Express Checkout */}
      <s-section heading="Express Checkout Buttons">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Express Checkout"
            desc="Show quick payment method buttons below the main checkout button (Shop Pay, Apple Pay, Google Pay)."
            checked={expressCheckoutEnabled}
            onChange={setExpressCheckoutEnabled}
          />
          {expressCheckoutEnabled && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                Select which payment methods to display. These link directly to checkout.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "expressCheckoutShopPay", val: expressCheckoutShopPay, set: setExpressCheckoutShopPay, label: "Shop Pay", color: "#5a31f4", desc: "Shopify's accelerated checkout" },
                  { key: "expressCheckoutApplePay", val: expressCheckoutApplePay, set: setExpressCheckoutApplePay, label: "Apple Pay", color: "#000", desc: "Available on Safari and iOS" },
                  { key: "expressCheckoutGooglePay", val: expressCheckoutGooglePay, set: setExpressCheckoutGooglePay, label: "Google Pay", color: "#4285f4", desc: "Available on Chrome and Android" },
                ].map(opt => (
                  <div key={opt.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fafafa" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: opt.color }} />
                      <div>
                        <strong style={{ fontSize: 13 }}>{opt.label}</strong>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{opt.desc}</p>
                      </div>
                    </div>
                    <label style={toggleWrap}>
                      <input type="checkbox" checked={opt.val}
                        onChange={e => opt.set(e.target.checked)}
                        style={{ display: "none" }} />
                      <span style={{ ...toggleTrack, background: opt.val ? "#008060" : "#ccc" }}>
                        <span style={{ ...toggleThumb, transform: opt.val ? "translateX(20px)" : "translateX(2px)" }} />
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "#9ca3af", textAlign: "center" }}>— or pay with —</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {expressCheckoutShopPay && (
                    <div style={{ flex: 1, padding: "10px", background: "#5a31f4", borderRadius: 8, textAlign: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>Shop Pay</div>
                  )}
                  {expressCheckoutApplePay && (
                    <div style={{ flex: 1, padding: "10px", background: "#000", borderRadius: 8, textAlign: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>Apple Pay</div>
                  )}
                  {expressCheckoutGooglePay && (
                    <div style={{ flex: 1, padding: "10px", background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 8, textAlign: "center", color: "#111", fontSize: 12, fontWeight: 700 }}>Google Pay</div>
                  )}
                </div>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 5. Volume Discounts */}
      <s-section heading="Volume Discounts">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Volume Discounts"
            desc="Show a discount tier table in the cart. Informational only — create matching discounts in Shopify Admin."
            checked={volumeDiscountEnabled}
            onChange={setVolumeDiscountEnabled}
          />
          {volumeDiscountEnabled && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                Create the actual discount in <strong>Shopify Admin → Discounts</strong> to match these tiers. This table is display-only.
              </p>
              <div>
                <label style={labelStyle}>Section Title</label>
                <input type="text" value={volumeDiscountTitle}
                  onChange={e => setVolumeDiscountTitle(e.target.value)}
                  style={inputStyle} placeholder="Buy more, save more!" />
              </div>
              {volumeDiscounts.map((tier, idx) => (
                <div key={tier.id} style={{ border: "1.5px solid #e0e0e0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Tier {idx + 1}</strong>
                    <button onClick={() => removeTier(tier.id)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Min Quantity</label>
                      <input type="number" value={tier.qty} min="1"
                        onChange={e => updateTier(tier.id, "qty", parseInt(e.target.value) || 1)}
                        style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Discount %</label>
                      <input type="number" value={tier.pct} min="1" max="99"
                        onChange={e => updateTier(tier.id, "pct", parseInt(e.target.value) || 10)}
                        style={inputStyle} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addTier} style={{ ...outlineBtn, width: "100%" }}>+ Add Tier</button>
              {volumeDiscounts.length > 0 && (
                <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#111" }}>{volumeDiscountTitle}</p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Quantity</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Discount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volumeDiscounts.map(t => (
                        <tr key={t.id}>
                          <td style={{ padding: "6px 10px", color: "#374151" }}>Buy {t.qty}+</td>
                          <td style={{ padding: "6px 10px", color: "#059669", fontWeight: 600 }}>{t.pct}% off</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </s-stack>
      </s-section>

      {/* 6. Gift Wrap */}
      <s-section heading="Gift Wrap">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Gift Wrap"
            desc="Show a checkbox in the cart to let customers add gift wrapping to their order."
            checked={giftWrapEnabled}
            onChange={setGiftWrapEnabled}
          />
          {giftWrapEnabled && (
            <>
              <div>
                <label style={labelStyle}>Section Heading</label>
                <input type="text" value={giftWrapHeading}
                  onChange={e => setGiftWrapHeading(e.target.value)}
                  style={inputStyle} placeholder="Gift Options" />
              </div>
              <div>
                <label style={labelStyle}>Checkbox Label</label>
                <input type="text" value={giftWrapLabel}
                  onChange={e => setGiftWrapLabel(e.target.value)}
                  style={inputStyle} placeholder="Add gift wrap" />
              </div>
              <ToggleRow
                label="Hide when product is already in cart"
                desc="Once gift wrap is added, the checkbox disappears."
                checked={giftWrapHideWhenInCart}
                onChange={setGiftWrapHideWhenInCart}
              />
              <div>
                <label style={labelStyle}>Gift Wrap Product</label>
                <p style={helpText}>Select the product that represents gift wrapping (must be a purchasable product in your store).</p>
                {giftWrapProduct ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fafafa" }}>
                    {giftWrapProduct.imageUrl && (
                      <img src={giftWrapProduct.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111" }}>{giftWrapProduct.title}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{fmt(giftWrapProduct.price)}</p>
                    </div>
                    <button onClick={pickGiftWrapProduct} style={{ ...outlineBtn, padding: "7px 14px", fontSize: 12 }}>Change</button>
                    <button onClick={() => setGiftWrapProduct(null)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Remove</button>
                  </div>
                ) : (
                  <button onClick={pickGiftWrapProduct} style={{ ...outlineBtn, width: "100%" }}>+ Select Gift Wrap Product</button>
                )}
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.5px" }}>{giftWrapHeading || "Gift Options"}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff", borderRadius: 8, border: "1.5px solid #e5e7eb" }}>
                  <input type="checkbox" readOnly style={{ accentColor: "#008060", width: 18, height: 18 }} />
                  {giftWrapProduct?.imageUrl && (
                    <img src={giftWrapProduct.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 7, border: "1px solid #f0f0f0" }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111" }}>🎁 {giftWrapLabel || "Add gift wrap"}</p>
                    {giftWrapProduct && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{giftWrapProduct.title} · {fmt(giftWrapProduct.price)}</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 7. Stock Scarcity on Line Items */}
      <s-section heading="Stock Scarcity Badges">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Stock Scarcity Badges"
            desc="Show a low-stock warning badge on line items when inventory falls below the threshold."
            checked={stockScarcityEnabled}
            onChange={setStockScarcityEnabled}
          />
          {stockScarcityEnabled && (
            <>
              <div>
                <label style={labelStyle}>Low Stock Threshold</label>
                <input type="number" value={stockScarcityThreshold} min="1" max="50"
                  onChange={e => setStockScarcityThreshold(parseInt(e.target.value) || 5)}
                  style={{ ...inputStyle, width: 100 }} />
                <p style={helpText}>Show the badge when inventory is at or below this number.</p>
              </div>
              <div>
                <label style={labelStyle}>Badge Text</label>
                <input type="text" value={stockScarcityText}
                  onChange={e => setStockScarcityText(e.target.value)}
                  style={inputStyle} placeholder="Only {{count}} left!" />
                <p style={helpText}>Use <code style={codeStyle}>{"{{count}}"}</code> to show the actual inventory count.</p>
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <span style={{ display: "inline-block", padding: "2px 8px", background: "#fff3cd", color: "#856404", border: "1px solid #ffc107", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                  {stockScarcityText.replace("{{count}}", String(stockScarcityThreshold))}
                </span>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 8. Recently Viewed */}
      <s-section heading="Recently Viewed (Empty Cart)">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Recently Viewed"
            desc="When the cart is empty, show a grid of recently viewed products to re-engage customers."
            checked={recentlyViewedEnabled}
            onChange={setRecentlyViewedEnabled}
          />
          {recentlyViewedEnabled && (
            <>
              <div>
                <label style={labelStyle}>Section Title</label>
                <input type="text" value={recentlyViewedTitle}
                  onChange={e => setRecentlyViewedTitle(e.target.value)}
                  style={inputStyle} placeholder="You might also like" />
              </div>
              <div>
                <label style={labelStyle}>Max Products to Show (2–6)</label>
                <input type="number" value={recentlyViewedLimit} min="2" max="6"
                  onChange={e => setRecentlyViewedLimit(Math.min(6, Math.max(2, parseInt(e.target.value) || 4)))}
                  style={{ ...inputStyle, width: 100 }} />
                <p style={helpText}>Products are tracked from product pages visited in the same browser.</p>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 9. Cart Share Link */}
      <s-section heading="Cart Share Link">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Cart Share"
            desc="Add a 'Share cart' link that copies a permalink to the customer's current cart contents."
            checked={cartShareEnabled}
            onChange={setCartShareEnabled}
          />
          {cartShareEnabled && (
            <div>
              <label style={labelStyle}>Link Text</label>
              <input type="text" value={cartShareText}
                onChange={e => setCartShareText(e.target.value)}
                style={inputStyle} placeholder="Share your cart" />
              <p style={helpText}>Clicking copies a URL like <code style={codeStyle}>/cart/VARIANT_ID:QTY,...</code> to the clipboard.</p>
            </div>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

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

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 };
const helpText   = { margin: "6px 0 0", fontSize: 12, color: "#888" };
const codeStyle  = { background: "#f5f5f5", padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "monospace" };
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
