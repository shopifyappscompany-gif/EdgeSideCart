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
    enabled:              form.get("enabled") === "true",
    headerText:           String(form.get("headerText") || "Your Cart"),
    primaryColor:         String(form.get("primaryColor") || "#000000"),
    bannerEnabled:        form.get("bannerEnabled") === "true",
    bannerText:           String(form.get("bannerText") || ""),
    bannerBgColor:        String(form.get("bannerBgColor") || "#1a1a1a"),
    bannerTextColor:      String(form.get("bannerTextColor") || "#ffffff"),
    discountEnabled:      form.get("discountEnabled") === "true",
    autoDiscountEnabled:  form.get("autoDiscountEnabled") === "true",
    autoDiscountCode:     String(form.get("autoDiscountCode") || ""),
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
  };

  await prisma.cartSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
};

export default function GeneralSettings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const s = settings || {};

  // ── State ────────────────────────────────────────────────
  const [enabled,              setEnabled]              = useState(s.enabled ?? true);
  const [headerText,           setHeaderText]           = useState(s.headerText ?? "Your Cart");
  const [primaryColor,         setPrimaryColor]         = useState(s.primaryColor ?? "#000000");
  const [bannerEnabled,        setBannerEnabled]        = useState(s.bannerEnabled ?? true);
  const [bannerText,           setBannerText]           = useState(s.bannerText ?? "🎉 Free shipping on orders over $50!");
  const [bannerBgColor,        setBannerBgColor]        = useState(s.bannerBgColor ?? "#1a1a1a");
  const [bannerTextColor,      setBannerTextColor]      = useState(s.bannerTextColor ?? "#ffffff");
  const [discountEnabled,      setDiscountEnabled]      = useState(s.discountEnabled ?? true);
  const [autoDiscountEnabled,  setAutoDiscountEnabled]  = useState(s.autoDiscountEnabled ?? false);
  const [autoDiscountCode,     setAutoDiscountCode]     = useState(s.autoDiscountCode ?? "");
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
      discountEnabled, autoDiscountEnabled, autoDiscountCode,
      orderNotesEnabled, showVariantTitle,
      scarcityEnabled, scarcityText, scarcityMinutes, scarcityBgColor, scarcityTextColor,
      tieredRewardsEnabled, tieredRewards,
      scrollableItems, showLineItemProperties, blockCartPage,
      customCss, customJs, customCartIconSelector,
      clickableLineItems, addToCartBehavior, addToCartToastSeconds,
      orderSummaryEnabled, ocuEnabled, ocuHeading, ocuLabel, ocuHideWhenInCart, ocuProduct,
    });
  }
  const savedSnap = useRef(snap());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(snap() !== savedSnap.current);
  }, [enabled, headerText, primaryColor, bannerEnabled, bannerText, bannerBgColor, bannerTextColor,
      discountEnabled, autoDiscountEnabled, autoDiscountCode, orderNotesEnabled, showVariantTitle,
      scarcityEnabled, scarcityText, scarcityMinutes, scarcityBgColor, scarcityTextColor,
      tieredRewardsEnabled, tieredRewards, scrollableItems, showLineItemProperties, blockCartPage,
      customCss, customJs, customCartIconSelector, clickableLineItems, addToCartBehavior,
      addToCartToastSeconds, orderSummaryEnabled, ocuEnabled, ocuHeading, ocuLabel, ocuHideWhenInCart, ocuProduct]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved!");
      savedSnap.current = snap();
      setIsDirty(false);
    }
  }, [fetcher.data]);

  function handleDiscard() {
    setEnabled(s.enabled ?? true);
    setHeaderText(s.headerText ?? "Your Cart");
    setPrimaryColor(s.primaryColor ?? "#000000");
    setBannerEnabled(s.bannerEnabled ?? true);
    setBannerText(s.bannerText ?? "🎉 Free shipping on orders over $50!");
    setBannerBgColor(s.bannerBgColor ?? "#1a1a1a");
    setBannerTextColor(s.bannerTextColor ?? "#ffffff");
    setDiscountEnabled(s.discountEnabled ?? true);
    setAutoDiscountEnabled(s.autoDiscountEnabled ?? false);
    setAutoDiscountCode(s.autoDiscountCode ?? "");
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
        discountEnabled:      String(discountEnabled),
        autoDiscountEnabled:  String(autoDiscountEnabled),
        autoDiscountCode,
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
      },
      { method: "POST" }
    );
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
  };

  return (
    <s-page heading="General Settings">
      {isDirty && (
        <SaveBar onSave={handleSubmit} onDiscard={handleDiscard} saving={saving} />
      )}

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
                        <option value="cartValue">Cart Value ($)</option>
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

      {/* ── Auto-Discount ── */}
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
    </s-page>
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

  const fmt = (cents) => "$" + (cents / 100).toFixed(2);

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
function OcuSection({ shopify, ocuEnabled, setOcuEnabled, ocuHeading, setOcuHeading, ocuLabel, setOcuLabel, ocuHideWhenInCart, setOcuHideWhenInCart, ocuProduct, setOcuProduct }) {
  async function pickProduct() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    if (!selected || selected.length === 0) return;
    const p = selected[0];
    const variant = p.variants?.[0];
    setOcuProduct({
      variantId: variant?.id || "",
      title: p.title || "",
      imageUrl: p.images?.[0]?.originalSrc || "",
      price: variant?.price ? Math.round(parseFloat(variant.price) * 100) : 0,
    });
  }

  const fmt = (cents) => "$" + (cents / 100).toFixed(2);

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
