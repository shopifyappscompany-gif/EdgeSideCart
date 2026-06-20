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
    productPageSocialProofEnabled:  form.get("productPageSocialProofEnabled") === "true",
    productPageSocialProofText:     String(form.get("productPageSocialProofText") || "🔥 {{count}} people bought this today"),
    productPageSocialProofMin:      parseInt(form.get("productPageSocialProofMin") || "5", 10),
    productPageSocialProofMax:      parseInt(form.get("productPageSocialProofMax") || "30", 10),
    productPageSocialProofInterval: parseInt(form.get("productPageSocialProofInterval") || "8", 10),

    productPageScarcityEnabled:    form.get("productPageScarcityEnabled") === "true",
    productPageVolumeTableEnabled: form.get("productPageVolumeTableEnabled") === "true",
    productPageFreebieTeaser:      form.get("productPageFreebieTeaser") === "true",

    productPageUpsellEnabled:  form.get("productPageUpsellEnabled") === "true",
    productPageUpsellTitle:    String(form.get("productPageUpsellTitle") || "Customers Also Bought"),
    productPageUpsellLimit:    Math.min(6, Math.max(1, parseInt(form.get("productPageUpsellLimit") || "3", 10))),
    productPageUpsellProducts: String(form.get("productPageUpsellProducts") || "[]"),
  };

  await prisma.cartSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return { success: true };
};

export default function ProductPageSettings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const s = settings || {};

  function parseProducts(raw) {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
  }

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
    return JSON.stringify({
      socialProofEnabled, socialProofText, socialProofMin, socialProofMax, socialProofInterval,
      scarcityEnabled, volumeTableEnabled, freebieTeaser,
      upsellEnabled, upsellTitle, upsellLimit, upsellProducts,
    });
  }

  const savedSnap = useRef(snap());
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(snap() !== savedSnap.current);
  }, [socialProofEnabled, socialProofText, socialProofMin, socialProofMax, socialProofInterval,
      scarcityEnabled, volumeTableEnabled, freebieTeaser,
      upsellEnabled, upsellTitle, upsellLimit, upsellProducts]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved!");
      savedSnap.current = snap();
      setIsDirty(false);
    }
  }, [fetcher.data]);

  function handleDiscard() {
    setSocialProofEnabled(s.productPageSocialProofEnabled ?? false);
    setSocialProofText(s.productPageSocialProofText ?? "🔥 {{count}} people bought this today");
    setSocialProofMin(s.productPageSocialProofMin ?? 5);
    setSocialProofMax(s.productPageSocialProofMax ?? 30);
    setSocialProofInterval(s.productPageSocialProofInterval ?? 8);
    setScarcityEnabled(s.productPageScarcityEnabled ?? false);
    setVolumeTableEnabled(s.productPageVolumeTableEnabled ?? false);
    setFreebieTeaser(s.productPageFreebieTeaser ?? false);
    setUpsellEnabled(s.productPageUpsellEnabled ?? false);
    setUpsellTitle(s.productPageUpsellTitle ?? "Customers Also Bought");
    setUpsellLimit(s.productPageUpsellLimit ?? 3);
    setUpsellProducts(() => parseProducts(s.productPageUpsellProducts));
  }

  function handleSubmit(e) {
    e?.preventDefault();
    fetcher.submit(
      {
        productPageSocialProofEnabled:  String(socialProofEnabled),
        productPageSocialProofText:     socialProofText,
        productPageSocialProofMin:      String(socialProofMin),
        productPageSocialProofMax:      String(socialProofMax),
        productPageSocialProofInterval: String(socialProofInterval),
        productPageScarcityEnabled:     String(scarcityEnabled),
        productPageVolumeTableEnabled:  String(volumeTableEnabled),
        productPageFreebieTeaser:       String(freebieTeaser),
        productPageUpsellEnabled:       String(upsellEnabled),
        productPageUpsellTitle:         upsellTitle,
        productPageUpsellLimit:         String(upsellLimit),
        productPageUpsellProducts:      JSON.stringify(upsellProducts),
      },
      { method: "POST" }
    );
  }

  async function pickUpsellProducts() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: 6 });
    if (!selected || selected.length === 0) return;
    const products = selected.map(p => {
      const img = p.images?.[0];
      const imageUrl = typeof img === "string" ? img : (img?.url || img?.originalSrc || img?.src || "");
      const rawVid = p.variants?.[0]?.id || "";
      const variantId = rawVid.replace(/^gid:\/\/shopify\/ProductVariant\//, "");
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        imageUrl,
        variantId,
        variantTitle: p.variants?.[0]?.title || "",
        price: p.variants?.[0]?.price ? Math.round(parseFloat(p.variants[0].price) * 100) : 0,
      };
    });
    setUpsellProducts(products);
  }

  const fmt = (cents) => "$" + (cents / 100).toFixed(2);

  const prereqNote = (label, condition, hint) => !condition && (
    <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
      <strong>Note:</strong> {hint}
    </div>
  );

  return (
    <s-page heading="Product Page">
      {isDirty && <SaveBar onSave={handleSubmit} onDiscard={handleDiscard} saving={saving} />}

      <s-section>
        <div style={{ padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, fontSize: 13, color: "#1e40af" }}>
          <strong>How it works:</strong> These widgets inject automatically into any Shopify product page where ZoomCart is installed via the App Embed. They work across all themes — Dawn, Debut, Horizon, Minimal, and more.
        </div>
      </s-section>

      {/* 1. Social Proof */}
      <s-section heading="Social Proof Notifications">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Social Proof"
            desc="Show a floating notification on product pages — e.g. '🔥 14 people bought this today' — to create urgency and trust."
            checked={socialProofEnabled}
            onChange={setSocialProofEnabled}
          />
          {socialProofEnabled && (
            <>
              <div>
                <label style={labelStyle}>Message Template</label>
                <input type="text" value={socialProofText}
                  onChange={e => setSocialProofText(e.target.value)}
                  style={inputStyle} placeholder="🔥 {{count}} people bought this today" />
                <p style={helpText}>Use <code style={codeStyle}>{"{{count}}"}</code> for the random number. Try "👀 {"{{count}}"} people are viewing this right now".</p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Min Count</label>
                  <input type="number" value={socialProofMin} min="1"
                    onChange={e => setSocialProofMin(parseInt(e.target.value) || 5)}
                    style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Max Count</label>
                  <input type="number" value={socialProofMax} min="1"
                    onChange={e => setSocialProofMax(parseInt(e.target.value) || 30)}
                    style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Interval (seconds)</label>
                  <input type="number" value={socialProofInterval} min="5" max="60"
                    onChange={e => setSocialProofInterval(parseInt(e.target.value) || 8)}
                    style={inputStyle} />
                  <p style={helpText}>How often a new notification appears.</p>
                </div>
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 13, fontWeight: 600, color: "#111" }}>
                  {socialProofText.replace("{{count}}", String(Math.floor((socialProofMin + socialProofMax) / 2)))}
                </div>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 2. Stock Scarcity Badge */}
      <s-section heading="Stock Scarcity Badge">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Show Scarcity Badge on Product Pages"
            desc="Displays a low-stock warning (e.g. 'Only 3 left!') below the Add to Cart button when inventory is low."
            checked={scarcityEnabled}
            onChange={setScarcityEnabled}
          />
          {scarcityEnabled && (
            <>
              {prereqNote("Stock Scarcity Badges", s.stockScarcityEnabled,
                "Also enable 'Stock Scarcity Badges' in the Features page to configure the threshold and badge text.")}
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <span style={{ display: "inline-block", padding: "6px 12px", background: "#fff3cd", color: "#856404", border: "1px solid #ffc107", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
                  ⚠️ {(s.stockScarcityText || "Only {{count}} left!").replace("{{count}}", String(s.stockScarcityThreshold || 5))}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Badge text and threshold are configured in <strong>Features → Stock Scarcity Badges</strong>.</p>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 3. Volume Discount Table */}
      <s-section heading="Volume Discount Table">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Show Volume Discounts on Product Pages"
            desc="Display your buy-more-save-more tier table on every product page above the Add to Cart button."
            checked={volumeTableEnabled}
            onChange={setVolumeTableEnabled}
          />
          {volumeTableEnabled && (
            <>
              {prereqNote("Volume Discounts", s.volumeDiscountEnabled,
                "Also enable 'Volume Discounts' in the Features page to configure your discount tiers.")}
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                {(() => {
                  const tiers = (() => { try { return JSON.parse(s.volumeDiscounts || "[]"); } catch { return []; } })();
                  return tiers.length > 0 ? (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12 }}>
                      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#166534" }}>{s.volumeDiscountTitle || "Buy more, save more!"}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {tiers.map(t => (
                          <div key={t.id} style={{ textAlign: "center", padding: "8px 14px", background: "#fff", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>Buy {t.qty}+</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#16a34a" }}>{t.pct}% off</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>No tiers configured yet — add them in Features → Volume Discounts.</p>;
                })()}
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 4. Free Gift Teaser */}
      <s-section heading="Free Gift Teaser">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Show Free Gift Teaser on Product Pages"
            desc="Displays 'Add this item and you're $X away from a free gift!' below the ATC button to motivate customers to add to cart."
            checked={freebieTeaser}
            onChange={setFreebieTeaser}
          />
          {freebieTeaser && (
            <>
              {prereqNote("Free Gift", s.freebieEnabled || (s.freebieOffers && s.freebieOffers !== "[]"),
                "Also configure a Free Gift offer in the Freebie settings page.")}
              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <div style={{ padding: "10px 14px", background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                  🎁 Add $20 more to unlock a free gift!
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>The amount shown is calculated live from the customer's current cart vs your configured free gift threshold.</p>
            </>
          )}
        </s-stack>
      </s-section>

      {/* 5. Product Page Upsell */}
      <s-section heading="Product Page Upsell">
        <s-stack direction="block" gap="base">
          <ToggleRow
            label="Enable Product Page Upsell"
            desc="Show a 'Customers Also Bought' product grid below the Add to Cart button. Uses Shopify's AI recommendations by default, or your custom product list."
            checked={upsellEnabled}
            onChange={setUpsellEnabled}
          />
          {upsellEnabled && (
            <>
              <div>
                <label style={labelStyle}>Section Title</label>
                <input type="text" value={upsellTitle}
                  onChange={e => setUpsellTitle(e.target.value)}
                  style={inputStyle} placeholder="Customers Also Bought" />
              </div>
              <div>
                <label style={labelStyle}>Max Products to Show (1–6)</label>
                <input type="number" value={upsellLimit} min="1" max="6"
                  onChange={e => setUpsellLimit(Math.min(6, Math.max(1, parseInt(e.target.value) || 3)))}
                  style={{ ...inputStyle, width: 100 }} />
              </div>

              <div style={{ padding: "12px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#111" }}>Product Source</p>
                {upsellProducts.length === 0 ? (
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                    Using <strong>Shopify AI Recommendations</strong> (automatically picks related products for each product page).
                  </p>
                ) : (
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
                    Using <strong>{upsellProducts.length} manually selected product{upsellProducts.length > 1 ? "s" : ""}</strong> (shown on every product page).
                  </p>
                )}
                <button onClick={pickUpsellProducts} style={{ ...outlineBtn, marginRight: 10 }}>
                  {upsellProducts.length > 0 ? "Change Products" : "Pick Manual Products"}
                </button>
                {upsellProducts.length > 0 && (
                  <button onClick={() => setUpsellProducts([])} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    Use AI Instead
                  </button>
                )}
              </div>

              {upsellProducts.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {upsellProducts.slice(0, upsellLimit).map(p => (
                    <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                      {p.imageUrl && <img src={p.imageUrl} alt={p.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />}
                      <div style={{ padding: "8px 10px" }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{fmt(p.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ padding: "12px 14px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#374151" }}>Preview</p>
                <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#111" }}>{upsellTitle || "Customers Also Bought"}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {[1, 2, 3].slice(0, upsellLimit).map(i => (
                    <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                      <div style={{ width: "100%", aspectRatio: "1", background: "#f3f4f6" }} />
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ height: 10, background: "#e5e7eb", borderRadius: 4, marginBottom: 6, width: "80%" }} />
                        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, width: "50%" }} />
                        <div style={{ marginTop: 8, height: 28, background: "#111", borderRadius: 6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
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
      background: "#fff", borderBottom: "1px solid #e5e7eb",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 28px",
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>Unsaved changes</span>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onDiscard} disabled={saving}
          style={{ padding: "8px 18px", borderRadius: 7, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
          Discard
        </button>
        <button onClick={onSave} disabled={saving}
          style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: saving ? "#374151" : "#111827", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.75 : 1 }}>
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
      <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: "none" }} />
        <span style={{ display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2, transition: "background 0.2s", alignItems: "center", background: checked ? "#008060" : "#ccc" }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s", display: "block", transform: checked ? "translateX(20px)" : "translateX(2px)" }} />
        </span>
      </label>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 };
const helpText   = { margin: "6px 0 0", fontSize: 12, color: "#888" };
const codeStyle  = { background: "#f5f5f5", padding: "1px 5px", borderRadius: 4, fontSize: 12, fontFamily: "monospace" };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box", background: "#fafafa" };
const outlineBtn = { padding: "9px 16px", border: "1.5px solid #d1d5db", borderRadius: 8, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" };

export const headers = (headersArgs) => boundary.headers(headersArgs);
