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

  const upsellTriggerType = String(form.get("upsellTriggerType") || "cartValue");
  const upsellTriggerCollectionIdsRaw = String(form.get("upsellTriggerCollectionIds") || "[]");
  const triggerCollections = safeJSON(upsellTriggerCollectionIdsRaw, []);

  let triggerProductsArr = safeJSON(String(form.get("upsellTriggerProductIds") || "[]"), []);

  if (upsellTriggerType === "product" && triggerCollections.length > 0) {
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
    upsellEnabled: form.get("upsellEnabled") === "true",
    upsellTitle: String(form.get("upsellTitle") || "You might also like"),
    upsellTriggerType,
    upsellMinCartValue: parseFloat(form.get("upsellMinCartValue") || "50"),
    upsellMinQuantity: parseInt(form.get("upsellMinQuantity") || "2", 10),
    upsellProducts: String(form.get("upsellProducts") || "[]"),
    upsellTriggerProductIds: JSON.stringify(triggerProductsArr),
    upsellTriggerCollectionIds: upsellTriggerCollectionIdsRaw,
    aiUpsellEnabled: form.get("aiUpsellEnabled") === "true",
    aiUpsellTitle: String(form.get("aiUpsellTitle") || "Customers Also Bought"),
    aiUpsellIntent: String(form.get("aiUpsellIntent") || "related"),
    aiUpsellLimit: parseInt(form.get("aiUpsellLimit") || "4", 10),
  };

  await prisma.cartSettings.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });

  return { success: true };
};

export default function UpsellSettings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const s = settings || {};

  const [enabled, setEnabled] = useState(s.upsellEnabled ?? false);
  const [title, setTitle] = useState(s.upsellTitle ?? "You might also like");
  const [triggerType, setTriggerType] = useState(s.upsellTriggerType ?? "cartValue");
  const [minCartValue, setMinCartValue] = useState(s.upsellMinCartValue ?? 50);
  const [minQty, setMinQty] = useState(s.upsellMinQuantity ?? 2);
  const [upsellProducts, setUpsellProducts] = useState(() => safeJSON(s.upsellProducts, []));
  const [triggerProducts, setTriggerProducts] = useState(() => safeJSON(s.upsellTriggerProductIds, []));
  const [triggerCollections, setTriggerCollections] = useState(() => safeJSON(s.upsellTriggerCollectionIds, []));
  const [aiEnabled, setAiEnabled] = useState(s.aiUpsellEnabled ?? false);
  const [aiTitle, setAiTitle] = useState(s.aiUpsellTitle ?? "Customers Also Bought");
  const [aiIntent, setAiIntent] = useState(s.aiUpsellIntent ?? "related");
  const [aiLimit, setAiLimit] = useState(s.aiUpsellLimit ?? 4);

  useEffect(() => {
    if (fetcher.data?.success) shopify.toast.show("Upsell settings saved!");
  }, [fetcher.data]);

  async function pickUpsellProducts() {
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
      selectionIds: upsellProducts.map((p) => ({ id: p.id })),
    });
    if (selected) {
      const mapped = selected.slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        featuredImage: p.images?.[0] ? { url: p.images[0].originalSrc || p.images[0].src } : null,
        variants: (p.variants || []).slice(0, 1).map((v) => ({
          id: v.id,
          title: v.displayName || v.title,
          price: v.price,
        })),
      }));
      setUpsellProducts(mapped);
    }
  }

  async function pickTriggerProducts() {
    const selected = await shopify.resourcePicker({ type: "product", multiple: 10, action: "select" });
    if (selected && selected.length > 0) {
      const mapped = selected.map((p) => ({ id: p.id, title: p.title }));
      setTriggerProducts(mapped);
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
        upsellEnabled: String(enabled),
        upsellTitle: title,
        upsellTriggerType: triggerType,
        upsellMinCartValue: String(minCartValue),
        upsellMinQuantity: String(minQty),
        upsellProducts: JSON.stringify(upsellProducts),
        upsellTriggerProductIds: JSON.stringify(triggerProducts),
        upsellTriggerCollectionIds: JSON.stringify(triggerCollections),
        aiUpsellEnabled: String(aiEnabled),
        aiUpsellTitle: aiTitle,
        aiUpsellIntent: aiIntent,
        aiUpsellLimit: String(aiLimit),
      },
      { method: "POST" }
    );
  }

  return (
    <s-page heading="Upsell Settings">
      <s-button slot="primary-action" onClick={handleSubmit} variant="primary" loading={saving ? true : undefined}>
        Save Upsell Settings
      </s-button>

      {/* Enable toggle */}
      <s-section heading="Upsell Feature">
        <s-stack direction="block" gap="base">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <strong style={{ fontSize: 14 }}>Enable Upsell</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Show targeted product recommendations inside the side cart.
              </p>
            </div>
            <ToggleSwitch value={enabled} onChange={setEnabled} />
          </div>

          {enabled && (
            <div>
              <label style={labelStyle}>Section Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="You might also like"
              />
            </div>
          )}
        </s-stack>
      </s-section>

      {/* Trigger condition */}
      {enabled && (
        <s-section heading="Show Upsell When…">
          <s-stack direction="block" gap="base">
            <div>
              <label style={labelStyle}>Trigger Condition</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} style={selectStyle}>
                <option value="cartValue">Cart value reaches a minimum amount</option>
                <option value="quantity">Cart contains minimum number of items</option>
                <option value="product">Cart contains specific products</option>
              </select>
            </div>

            {triggerType === "cartValue" && (
              <div>
                <label style={labelStyle}>Minimum Cart Value ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minCartValue}
                  onChange={(e) => setMinCartValue(e.target.value)}
                  style={{ ...inputStyle, width: 160 }}
                />
                <p style={helpText}>Show upsell when cart subtotal ≥ this value.</p>
              </div>
            )}

            {triggerType === "quantity" && (
              <div>
                <label style={labelStyle}>Minimum Item Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                  style={{ ...inputStyle, width: 120 }}
                />
                <p style={helpText}>Show upsell when cart has at least this many items.</p>
              </div>
            )}

            {triggerType === "product" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Trigger Products</label>
                  <p style={{ ...helpText, marginBottom: 10 }}>
                    Show upsell when any of these specific products is in the cart.
                  </p>
                  <button type="button" onClick={pickTriggerProducts} style={pickerBtn}>
                    + Select Products
                  </button>
                  {triggerProducts.length > 0 && (
                    <ProductChips products={triggerProducts} onRemove={(id) => setTriggerProducts(triggerProducts.filter((p) => p.id !== id))} />
                  )}
                </div>

                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
                  <label style={labelStyle}>Trigger Collections</label>
                  <p style={{ ...helpText, marginBottom: 10 }}>
                    Show upsell when any product from these collections is in the cart. Product list is synced when you save.
                  </p>
                  <button type="button" onClick={pickTriggerCollections} style={pickerBtn}>
                    + Select Collections
                  </button>
                  {triggerCollections.length > 0 && (
                    <ProductChips products={triggerCollections} onRemove={(id) => setTriggerCollections(triggerCollections.filter((c) => c.id !== id))} />
                  )}
                </div>

                <p style={{ ...helpText, color: "#1773b0" }}>
                  Products and collections are combined — upsell shows if any match is found in the cart.
                </p>
              </div>
            )}
          </s-stack>
        </s-section>
      )}

      {/* Product selection */}
      {enabled && (
        <s-section heading="Upsell Products to Display">
          <s-stack direction="block" gap="base">
            <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
              Select up to 5 products to show as upsell recommendations. Only products not already in the cart are shown.
            </p>
            <button type="button" onClick={pickUpsellProducts} style={pickerBtn}>
              + Select Upsell Products
            </button>

            {upsellProducts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {upsellProducts.map((p) => (
                  <div key={p.id} style={productCard}>
                    {p.featuredImage?.url && (
                      <img src={p.featuredImage.url} alt={p.title} style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{p.title}</p>
                      {p.variants?.[0]?.price && (
                        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#666" }}>${p.variants[0].price}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => setUpsellProducts(upsellProducts.filter((x) => x.id !== p.id))} style={removeBtn}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </s-stack>
        </s-section>
      )}

      {/* ── AI-Powered Upsell ── */}
      <s-section heading="✦ AI-Powered Upsell (Shopify Recommendations)">
        <s-stack direction="block" gap="base">
          <div style={{ padding: "12px 14px", background: "linear-gradient(135deg,#f5f3ff,#eff6ff)", borderRadius: 10, border: "1px solid #ddd6fe" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#5b21b6", fontWeight: 600 }}>Powered by Shopify's native recommendation engine</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
              Automatically suggests products based on purchase history, browsing behaviour, and store trends — no manual selection needed.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <strong style={{ fontSize: 14 }}>Enable AI Upsell</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Shows below the static upsell section (or standalone if static is off).
              </p>
            </div>
            <ToggleSwitch value={aiEnabled} onChange={setAiEnabled} />
          </div>

          {aiEnabled && (
            <>
              <div>
                <label style={labelStyle}>Section Title</label>
                <input
                  type="text"
                  value={aiTitle}
                  onChange={e => setAiTitle(e.target.value)}
                  style={inputStyle}
                  placeholder="Customers Also Bought"
                />
              </div>

              <div>
                <label style={labelStyle}>Recommendation Type</label>
                <select value={aiIntent} onChange={e => setAiIntent(e.target.value)} style={selectStyle}>
                  <option value="related">Related Products — similar items, frequently bought together</option>
                  <option value="complementary">Complementary Products — add-ons that pair well</option>
                </select>
                <p style={helpText}>
                  "Complementary" requires setting up product complementary in Shopify Admin → Search &amp; Discovery app.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Number of Products to Show</label>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={aiLimit}
                  onChange={e => setAiLimit(parseInt(e.target.value, 10) || 4)}
                  style={{ ...inputStyle, width: 100 }}
                />
                <p style={helpText}>Between 2 and 8. Products already in the cart are automatically excluded.</p>
              </div>
            </>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How Upsell Works">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text fontWeight="bold">Static Upsell:</s-text> You hand-pick up to 5 products. Shows when trigger condition is met.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">AI Upsell:</s-text> Shopify automatically picks products using purchase history and store trends. No manual selection needed.
          </s-paragraph>
          <s-paragraph>
            Both can run at the same time — static upsell appears first, AI upsell below it.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Tip:</s-text> Enable AI upsell as a fallback when the static list has no eligible products.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function ToggleSwitch({ value, onChange }) {
  return (
    <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ display: "none" }} />
      <span style={{ display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2, background: value ? "#008060" : "#ccc", transition: "background 0.2s", alignItems: "center" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s", transform: value ? "translateX(20px)" : "translateX(2px)", display: "block" }} />
      </span>
    </label>
  );
}

function ProductChips({ products, onRemove }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
      {products.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#f0f4ff", borderRadius: 20, fontSize: 13, fontWeight: 500 }}>
          {p.title}
          <button type="button" onClick={() => onRemove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", padding: 0, fontSize: 14 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 };
const helpText = { margin: "6px 0 0", fontSize: 12, color: "#888" };
const inputStyle = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8,
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box", background: "#fafafa",
};
const selectStyle = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8,
  fontSize: 14, color: "#111", background: "#fafafa", outline: "none", cursor: "pointer",
};
const pickerBtn = {
  padding: "9px 16px", border: "1.5px dashed #008060", borderRadius: 8,
  background: "#f0faf5", color: "#008060", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const productCard = {
  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
  border: "1.5px solid #e8e8e8", borderRadius: 10, background: "#fafafa",
};
const removeBtn = {
  background: "none", border: "none", cursor: "pointer", color: "#bbb", fontSize: 16,
  padding: "4px 6px", borderRadius: 6, transition: "color 0.15s",
};

function safeJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
