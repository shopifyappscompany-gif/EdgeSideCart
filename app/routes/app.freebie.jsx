import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { isPremiumLocked } from "../trial.server";

const LOCK_MSG = "Your free trial has ended. Upgrade to Growth or Scale to use this feature, or contact ZoomCart support.";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.cartSettings.findUnique({ where: { shop: session.shop } });
  return { settings, locked: isPremiumLocked(settings) };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  /* Free-plan trial gate — block configuring Freebie once the trial has ended. */
  const lockSettings = await prisma.cartSettings.findUnique({ where: { shop } });
  if (isPremiumLocked(lockSettings)) {
    return { error: LOCK_MSG, locked: true };
  }

  const form = await request.formData();
  const intent = form.get("intent");

  /* ── Create $0 freebie product ── */
  if (intent === "createFreebieProduct") {
    const sourceTitle = String(form.get("sourceTitle") || "Free Gift");
    const sourceImageUrl = form.get("sourceImageUrl") ? String(form.get("sourceImageUrl")) : null;
    try {
      /* Create $0 product via REST API — bypasses GraphQL session token issues */
      const tokenPreview = session.accessToken ? session.accessToken.slice(0, 12) + "..." : "MISSING";
      console.log("[Freebie] shop:", shop, "| token preview:", tokenPreview, "| token length:", session.accessToken?.length);
      const restUrl = `https://${shop}/admin/api/2025-07/products.json`;
      console.log("[Freebie] REST URL:", restUrl);
      const restCreateRes = await fetch(
        restUrl,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": session.accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product: {
              title: `${sourceTitle} — Free Gift`,
              status: "active",
              tags: "edge-cart-freebie,edge-cart-hidden,noindex",
              variants: [{ price: "0.00" }],
            },
          }),
        }
      );
      console.log("[Freebie] REST create status:", restCreateRes.status);
      if (!restCreateRes.ok) {
        const errText = await restCreateRes.text();
        console.error("[Freebie] REST create failed:", restCreateRes.status, errText);
        return { error: `Product creation failed (HTTP ${restCreateRes.status}): ${errText.slice(0, 200)}` };
      }
      const restData = await restCreateRes.json();
      const numericProductId = restData.product?.id;
      const numericVariantId = restData.product?.variants?.[0]?.id;
      if (!numericProductId || !numericVariantId) {
        console.error("[Freebie] REST create missing IDs:", JSON.stringify(restData));
        return { error: "Failed to get product IDs after creation. Check Render logs." };
      }
      /* Convert numeric REST IDs to GIDs for GraphQL publish/metafield calls */
      const productId = `gid://shopify/Product/${numericProductId}`;
      const variantId = `gid://shopify/ProductVariant/${numericVariantId}`;
      let imageUrl = sourceImageUrl || null;

      if (sourceImageUrl) {
        try {
          const mediaRes = await admin.graphql(
            `#graphql
            mutation attachFreebieImage($productId: ID!, $media: [CreateMediaInput!]!) {
              productCreateMedia(productId: $productId, media: $media) {
                media { ... on MediaImage { image { url } } }
                mediaUserErrors { field message }
              }
            }`,
            { variables: { productId, media: [{ mediaContentType: "IMAGE", originalSource: sourceImageUrl, alt: sourceTitle + " — Free Gift" }] } }
          );
          const mediaJson = await mediaRes.json();
          const attachedUrl = mediaJson.data?.productCreateMedia?.media?.[0]?.image?.url;
          if (attachedUrl) imageUrl = attachedUrl;
        } catch (_) {}
      }

      /* Publish to Online Store — required for /cart/add.js to accept the variant.
         The product is hidden from discovery via noindex tag + seo.hidden metafield below. */
      try {
        const pubRes = await admin.graphql(
          `#graphql query getPublications { publications(first: 20) { nodes { id name } } }`
        );
        const pubJson = await pubRes.json();
        const pubs = pubJson.data?.publications?.nodes || [];
        const osPub = pubs.find((p) => p.name === "Online Store") || pubs[0];
        if (osPub?.id) {
          await admin.graphql(
            `#graphql
            mutation publishFreebie($id: ID!, $input: PublishablePublishInput!) {
              publishablePublish(id: $id, input: $input) { userErrors { field message } }
            }`,
            { variables: { id: productId, input: { publicationIds: [osPub.id] } } }
          );
        }
      } catch (_) {}

      /* Hide from search engines, sitemap, and theme search */
      try {
        await admin.graphql(
          `#graphql
          mutation setFreebieMetafields($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) { userErrors { field message } }
          }`,
          { variables: { metafields: [{ ownerId: productId, namespace: "seo", key: "hidden", value: "1", type: "number_integer" }] } }
        );
      } catch (_) {}

      // Return product data — the client updates the offer state; user clicks Save to persist
      return { success: true, freebieVariantId: variantId, freebieProductTitle: sourceTitle, freebieProductImageUrl: imageUrl };
    } catch (err) {
      if (err instanceof Response) {
        console.error("[Freebie] SDK threw Response, status:", err.status);
        if (err.status >= 300 && err.status < 400) throw err;
        return { error: `API error (HTTP ${err.status}) — check Render logs for details.` };
      }
      const msg = String(err?.message || err?.toString() || "");
      console.error("[Freebie] caught exception:", msg, err);
      return { error: msg || "Failed to create freebie product. Please try again." };
    }
  }

  /* ── Save all offers ── */
  const offersRaw = String(form.get("freebieOffers") || "[]");
  let offers = safeJSON(offersRaw, []);

  // Resolve collection product IDs for each offer at save time
  for (const offer of offers) {
    const cols = offer.triggerCollectionIds || [];
    if (cols.length === 0) continue;
    for (const col of cols) {
      try {
        const colRes = await admin.graphql(
          `#graphql
          query GetCollectionProducts($id: ID!) {
            collection(id: $id) { products(first: 250) { nodes { id title } } }
          }`,
          { variables: { id: col.id } }
        );
        const colJson = await colRes.json();
        const colProducts = colJson.data?.collection?.products?.nodes || [];
        for (const p of colProducts) {
          if (!(offer.triggerProductIds || []).find((e) => e.id === p.id)) {
            offer.triggerProductIds = [...(offer.triggerProductIds || []), { id: p.id, title: p.title }];
          }
        }
      } catch (_) {}
    }
  }

  const freebieShowAtTop = form.get("freebieShowAtTop") === "true";
  const freebieProgressBarEnabled = form.get("freebieProgressBarEnabled") !== "false";
  try {
    await prisma.cartSettings.upsert({
      where: { shop },
      create: { shop, freebieOffers: JSON.stringify(offers), freebieShowAtTop, freebieProgressBarEnabled },
      update: { freebieOffers: JSON.stringify(offers), freebieShowAtTop, freebieProgressBarEnabled },
    });
  } catch (err) {
    return { error: "Save failed: " + (err?.message || "please try again") };
  }

  return { success: true, message: "All freebie offers saved!" };
};

/* ─────────────────────────────────────────────────────────── */

function makeOffer() {
  return {
    id: "offer_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    enabled: true,
    title: "🎁 You've earned a free gift!",
    triggerType: "cartValue",
    minCartValue: 100,
    maxCartValue: null,
    minQuantity: 3,
    maxQuantity: null,
    conditionLogic: "AND",
    triggerProductIds: [],
    triggerCollectionIds: [],
    productVariantId: null,
    productTitle: null,
    productImageUrl: null,
    confettiEnabled: true,
  };
}

function initOffers(s) {
  if (!s) return [];
  const offers = safeJSON(s.freebieOffers || "[]", []);
  if (offers.length > 0) return offers;
  // Backwards compat: migrate old single-offer fields
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
    triggerProductIds: safeJSON(s.freebieTriggerProductIds || "[]", []),
    triggerCollectionIds: safeJSON(s.freebieTriggerCollectionIds || "[]", []),
    productVariantId: s.freebieProductVariantId,
    productTitle: s.freebieProductTitle,
    productImageUrl: s.freebieProductImageUrl,
    confettiEnabled: s.freebieConfettiEnabled ?? true,
  }];
}

export default function FreebieSettings() {
  const { settings, locked } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";
  const s = settings || {};

  const [offers, setOffers] = useState(() => initOffers(s));
  const [expandedId, setExpandedId] = useState(null);
  const [creatingForId, setCreatingForId] = useState(null);
  const [freebieShowAtTop, setFreebieShowAtTop] = useState(s.freebieShowAtTop ?? false);
  const [freebieProgressBarEnabled, setFreebieProgressBarEnabled] = useState(s.freebieProgressBarEnabled ?? true);

  const savedSnap = useRef(JSON.stringify({ offers: initOffers(s), freebieShowAtTop: s.freebieShowAtTop ?? false, freebieProgressBarEnabled: s.freebieProgressBarEnabled ?? true }));
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(JSON.stringify({ offers, freebieShowAtTop, freebieProgressBarEnabled }) !== savedSnap.current);
  }, [offers, freebieShowAtTop, freebieProgressBarEnabled]);

  /* NOTE: no useEffect resetting offers on settings change — that would wipe
     newly-added offers whenever any fetcher action triggers loader revalidation. */

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
      setCreatingForId(null);
      return;
    }
    if (fetcher.data.success && fetcher.data.freebieVariantId && creatingForId) {
      setOffers((prev) =>
        prev.map((o) =>
          o.id === creatingForId
            ? { ...o, productVariantId: fetcher.data.freebieVariantId, productTitle: fetcher.data.freebieProductTitle, productImageUrl: fetcher.data.freebieProductImageUrl }
            : o
        )
      );
      setCreatingForId(null);
      shopify.toast.show("Free gift product created! Click Save Settings to keep it.");
    } else if (fetcher.data.success && !fetcher.data.freebieVariantId) {
      shopify.toast.show(fetcher.data.message || "Saved!");
      savedSnap.current = JSON.stringify({ offers, freebieShowAtTop, freebieProgressBarEnabled });
      setIsDirty(false);
    }
  }, [fetcher.data]);

  function handleDiscard() {
    const fresh = initOffers(settings || {});
    setOffers(fresh);
    setFreebieShowAtTop(s.freebieShowAtTop ?? false);
    setFreebieProgressBarEnabled(s.freebieProgressBarEnabled ?? true);
    savedSnap.current = JSON.stringify({ offers: fresh, freebieShowAtTop: s.freebieShowAtTop ?? false, freebieProgressBarEnabled: s.freebieProgressBarEnabled ?? true });
    setIsDirty(false);
  }

  function addOffer() {
    if (offers.length >= 5) return;
    const o = makeOffer();
    setOffers([...offers, o]);
    setExpandedId(o.id);
  }

  function removeOffer(id) {
    const updated = offers.filter((o) => o.id !== id);
    setOffers(updated);
    fetcher.submit({ freebieOffers: JSON.stringify(updated), freebieShowAtTop: String(freebieShowAtTop), freebieProgressBarEnabled: String(freebieProgressBarEnabled) }, { method: "POST" });
  }

  function updateOffer(id, changes) {
    setOffers(offers.map((o) => (o.id === id ? { ...o, ...changes } : o)));
  }

  async function createFreebieProduct(offerId) {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false, action: "select" });
    if (!selected?.length) return;
    const p = selected[0];
    const imgUrl = p.featuredImage?.url || p.images?.[0]?.url || p.images?.[0]?.originalSrc || "";
    setCreatingForId(offerId);
    fetcher.submit({ intent: "createFreebieProduct", sourceTitle: p.title, sourceImageUrl: imgUrl }, { method: "POST" });
  }

  async function pickProducts(offerId) {
    const selected = await shopify.resourcePicker({ type: "product", multiple: 10, action: "select" });
    if (selected?.length) {
      updateOffer(offerId, {
        triggerProductIds: selected.map((p) => ({
          id: p.id,
          title: p.title,
          imageUrl: p.featuredImage?.url || p.images?.[0]?.url || p.images?.[0]?.originalSrc || "",
        })),
      });
    }
  }

  async function pickCollections(offerId) {
    const selected = await shopify.resourcePicker({ type: "collection", multiple: true, action: "select" });
    if (selected?.length) {
      updateOffer(offerId, {
        triggerCollectionIds: selected.map((c) => ({
          id: c.id,
          title: c.title,
          imageUrl: c.image?.url || c.image?.src || "",
        })),
      });
    }
  }

  function handleSave() {
    fetcher.submit({ freebieOffers: JSON.stringify(offers), freebieShowAtTop: String(freebieShowAtTop), freebieProgressBarEnabled: String(freebieProgressBarEnabled) }, { method: "POST" });
  }

  return (
    <s-page heading="Free Gift (Freebie) Settings">
      {locked && (
        <div style={{ margin: "0 0 16px", padding: "14px 16px", background: "#fff4e5", border: "1px solid #ffd699", borderRadius: 10, color: "#8a5300" }}>
          <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>🔒 Freebie is a premium feature</strong>
          <span style={{ fontSize: 13 }}>Your free trial has ended. Please <a href="/app/billing" style={{ color: "#8a5300", fontWeight: 700 }}>upgrade to Growth or Scale</a> to use Freebie, or contact ZoomCart support to extend your trial.</span>
        </div>
      )}
      {!locked && isDirty && <SaveBar onSave={handleSave} onDiscard={handleDiscard} saving={saving && !creatingForId} />}

      <s-section heading="Display">
        <s-stack direction="block" gap="base">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <strong style={{ fontSize: 14 }}>Show Progress Notification</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                Show a "Spend ₹X more to unlock your free gift!" bar in the cart when the threshold is not yet met. Turn off to silently add the gift when earned — no notification shown.
              </p>
            </div>
            <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
              <input type="checkbox" checked={freebieProgressBarEnabled} onChange={e => setFreebieProgressBarEnabled(e.target.checked)} style={{ display: "none" }} />
              <span style={{ display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2, transition: "background 0.2s", alignItems: "center", background: freebieProgressBarEnabled ? "#008060" : "#ccc" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s", display: "block", transform: freebieProgressBarEnabled ? "translateX(20px)" : "translateX(2px)" }} />
              </span>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <strong style={{ fontSize: 14 }}>Show Free Gift at Top</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                When enabled, the free gift progress bar appears above the line items instead of below them.
              </p>
            </div>
            <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
              <input type="checkbox" checked={freebieShowAtTop} onChange={e => setFreebieShowAtTop(e.target.checked)} style={{ display: "none" }} />
              <span style={{ display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2, transition: "background 0.2s", alignItems: "center", background: freebieShowAtTop ? "#008060" : "#ccc" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s", display: "block", transform: freebieShowAtTop ? "translateX(20px)" : "translateX(2px)" }} />
              </span>
            </label>
          </div>
        </s-stack>
      </s-section>

      <s-section heading="Free Gift Offers">
        <s-stack direction="block" gap="base">
          <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
            Create up to <strong>5 independent free gift offers</strong>. Each has its own trigger condition and gift product. All active offers run simultaneously.
          </p>

          {offers.length === 0 && (
            <p style={{ fontSize: 13, color: "#999", margin: 0 }}>No offers yet. Click "+ Add Offer" to create your first free gift.</p>
          )}

          {offers.map((offer, idx) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              index={idx}
              expanded={expandedId === offer.id}
              creating={creatingForId === offer.id}
              saving={saving && !creatingForId}
              onToggle={() => setExpandedId(expandedId === offer.id ? null : offer.id)}
              onUpdate={(ch) => updateOffer(offer.id, ch)}
              onRemove={() => removeOffer(offer.id)}
              onSave={handleSave}
              onCreateProduct={() => createFreebieProduct(offer.id)}
              onPickProducts={() => pickProducts(offer.id)}
              onPickCollections={() => pickCollections(offer.id)}
              currencySymbol={s.currencySymbol || "$"}
            />
          ))}

          {offers.length < 5 && (
            <button type="button" onClick={addOffer} style={addOfferBtn}>
              + Add Offer ({offers.length}/5)
            </button>
          )}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Free Gift Tips">
        <s-stack direction="block" gap="base">
          <s-paragraph>Each offer runs <s-text fontWeight="bold">independently</s-text> — a customer can unlock multiple gifts at once.</s-paragraph>
          <s-paragraph>Use <s-text fontWeight="bold">AND</s-text> to combine a cart value threshold with a specific product condition.</s-paragraph>
          <s-paragraph>Use <s-text fontWeight="bold">OR</s-text> to unlock the gift via either condition alone.</s-paragraph>
          <s-paragraph><s-text fontWeight="bold">Tip:</s-text> After selecting a gift product, click <s-text fontWeight="bold">Save Settings</s-text> to keep it.</s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

/* ── Offer Card ────────────────────────────────────────────── */
function OfferCard({ offer, index, expanded, creating, saving, onToggle, onUpdate, onRemove, onSave, onCreateProduct, onPickProducts, onPickCollections, currencySymbol }) {
  const hasProduct = !!offer.productVariantId;

  return (
    <div style={{ border: "1.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

      {/* Card header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
        background: offer.enabled ? "#f0faf5" : "#fafafa", borderBottom: expanded ? "1.5px solid #e8e8e8" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ToggleSwitch value={offer.enabled} onChange={(v) => onUpdate({ enabled: v })} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: offer.enabled ? "#008060" : "#888" }}>
              Offer {index + 1}
            </span>
            {offer.productTitle && (
              <span style={{ fontSize: 12, color: "#666", marginLeft: 6 }}>— {offer.productTitle}</span>
            )}
            {!offer.productTitle && (
              <span style={{ fontSize: 12, color: "#bbb", marginLeft: 6 }}>no gift product set</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onToggle} style={editBtn}>{expanded ? "↑ Collapse" : "✏ Edit"}</button>
          <button type="button" onClick={onRemove} style={deleteBtn}>✕ Delete</button>
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* Banner text + confetti */}
          <section>
            <SectionHeading>Display</SectionHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Gift Banner Text</label>
                <input type="text" value={offer.title} onChange={(e) => onUpdate({ title: e.target.value })}
                  style={inputStyle} placeholder="🎁 You've earned a free gift!" />
                <p style={helpText}>Shown in the side cart when the gift is unlocked.</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", background: "#fafafa", borderRadius: 10, border: "1px solid #ebebeb" }}>
                <div>
                  <strong style={{ fontSize: 13 }}>Confetti Animation</strong>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888" }}>Show confetti burst when the gift is added to cart.</p>
                </div>
                <ToggleSwitch value={offer.confettiEnabled} onChange={(v) => onUpdate({ confettiEnabled: v })} />
              </div>
            </div>
          </section>

          {/* Trigger condition */}
          <section style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}>
            <SectionHeading>Trigger Condition</SectionHeading>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Primary Condition</label>
              <select value={offer.triggerType} onChange={(e) => onUpdate({ triggerType: e.target.value })} style={selectStyle}>
                <option value="cartValue">Cart value (min and optional max)</option>
                <option value="quantity">Item quantity (min and optional max)</option>
                <option value="product">Specific products or collections only</option>
              </select>
            </div>

            {offer.triggerType === "cartValue" && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Minimum ({currencySymbol})</label>
                  <input type="number" min="0" step="0.01" value={offer.minCartValue ?? ""}
                    onChange={(e) => onUpdate({ minCartValue: parseFloat(e.target.value) || 0 })}
                    style={{ ...inputStyle, width: 140 }} />
                </div>
                <div>
                  <label style={labelStyle}>Maximum ({currencySymbol}) <span style={{ fontWeight: 400, color: "#aaa" }}>optional</span></label>
                  <input type="number" min="0" step="0.01" value={offer.maxCartValue ?? ""}
                    onChange={(e) => onUpdate({ maxCartValue: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="No limit" style={{ ...inputStyle, width: 140 }} />
                </div>
              </div>
            )}

            {offer.triggerType === "quantity" && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Minimum items</label>
                  <input type="number" min="1" value={offer.minQuantity ?? ""}
                    onChange={(e) => onUpdate({ minQuantity: parseInt(e.target.value) || 1 })}
                    style={{ ...inputStyle, width: 120 }} />
                </div>
                <div>
                  <label style={labelStyle}>Maximum items <span style={{ fontWeight: 400, color: "#aaa" }}>optional</span></label>
                  <input type="number" min="1" value={offer.maxQuantity ?? ""}
                    onChange={(e) => onUpdate({ maxQuantity: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="No limit" style={{ ...inputStyle, width: 120 }} />
                </div>
              </div>
            )}

            {/* AND/OR logic pill */}
            {offer.triggerType !== "product" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
                padding: "10px 14px", background: "#f9f9fb", borderRadius: 10, border: "1px solid #ebebeb" }}>
                <select value={offer.conditionLogic} onChange={(e) => onUpdate({ conditionLogic: e.target.value })}
                  style={{ padding: "6px 12px", border: "1.5px solid #ddd", borderRadius: 8, fontSize: 13,
                    fontWeight: 700, background: "#fff", cursor: "pointer",
                    color: offer.conditionLogic === "AND" ? "#008060" : "#c05717" }}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
                <span style={{ fontSize: 12, color: "#666" }}>
                  {offer.conditionLogic === "AND"
                    ? "Also require specific products/collections in cart (leave empty to ignore)"
                    : "OR unlock the gift when specific products/collections are in cart"}
                </span>
              </div>
            )}

            {/* Product + collection pickers */}
            <div style={{ background: "#f9f9fb", border: "1px solid #ebebeb", borderRadius: 12,
              padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>

              {offer.triggerType === "product" && (
                <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                  Gift unlocks when the cart contains <strong>any</strong> of the selected products or collection items.
                </p>
              )}

              {/* Products */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>
                    Products
                    {(offer.triggerProductIds || []).length > 0 && (
                      <span style={{ fontWeight: 400, color: "#008060", marginLeft: 6 }}>
                        {offer.triggerProductIds.length} selected
                      </span>
                    )}
                  </label>
                  <button type="button" onClick={onPickProducts} style={pickerBtnSm}>+ Select</button>
                </div>
                {(offer.triggerProductIds || []).length > 0 ? (
                  <ProductChips
                    items={offer.triggerProductIds}
                    type="product"
                    onRemove={(id) => onUpdate({ triggerProductIds: offer.triggerProductIds.filter((p) => p.id !== id) })}
                  />
                ) : (
                  <p style={{ ...helpText, margin: 0 }}>No products selected.</p>
                )}
              </div>

              {/* Collections */}
              <div style={{ borderTop: "1px solid #e8e8e8", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>
                    Collections
                    {(offer.triggerCollectionIds || []).length > 0 && (
                      <span style={{ fontWeight: 400, color: "#008060", marginLeft: 6 }}>
                        {offer.triggerCollectionIds.length} selected
                      </span>
                    )}
                  </label>
                  <button type="button" onClick={onPickCollections} style={pickerBtnSm}>+ Select</button>
                </div>
                <p style={{ ...helpText, margin: "0 0 10px" }}>Collection products are resolved to IDs when you save.</p>
                {(offer.triggerCollectionIds || []).length > 0 ? (
                  <ProductChips
                    items={offer.triggerCollectionIds}
                    type="collection"
                    onRemove={(id) => onUpdate({ triggerCollectionIds: offer.triggerCollectionIds.filter((c) => c.id !== id) })}
                  />
                ) : (
                  <p style={{ ...helpText, margin: 0 }}>No collections selected.</p>
                )}
              </div>
            </div>
          </section>

          {/* Free gift product */}
          <section style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}>
            <SectionHeading>Free Gift Product</SectionHeading>
            {creating ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
                background: "#f0faf5", border: "1.5px solid #b7e5d4", borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>⏳</span>
                <p style={{ margin: 0, fontSize: 13, color: "#005c40" }}>Creating $0.00 product on Shopify…</p>
              </div>
            ) : hasProduct ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                border: "1.5px solid #b7e5d4", borderRadius: 12, background: "#f0faf5" }}>
                {offer.productImageUrl ? (
                  <img src={offer.productImageUrl} alt={offer.productTitle}
                    style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: "1px solid #d4f0e5" }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: 10, background: "#d4f0e5", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎁</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#111" }}>{offer.productTitle}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#008060", fontWeight: 600 }}>✓ $0.00 — Ready to use</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>Added automatically when threshold is met.</p>
                </div>
                <button type="button"
                  onClick={() => onUpdate({ productVariantId: null, productTitle: null, productImageUrl: null })}
                  style={changeBtnStyle}>Change</button>
              </div>
            ) : (
              <div style={{ padding: "16px", background: "#fafafa", border: "1.5px dashed #ddd", borderRadius: 12 }}>
                <p style={{ fontSize: 13, color: "#555", margin: "0 0 12px" }}>
                  Pick any product — ZoomCart creates a <strong>$0.00 copy</strong> tagged{" "}
                  <code style={{ background: "#f0f0f0", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>edge-cart-freebie</code>{" "}
                  that gets added to cart automatically.
                </p>
                <button type="button" onClick={onCreateProduct} style={pickerBtn}>🎁 Select Free Gift Product</button>
              </div>
            )}
          </section>

          {/* Per-offer Save button */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={onSave} disabled={saving} style={{
              padding: "10px 24px", background: saving ? "#ccc" : "#008060", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1, transition: "opacity 0.2s",
            }}>
              {saving ? "Saving…" : "💾 Save All Offers"}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

/* ── Section heading ───────────────────────────────────────── */
function SectionHeading({ children }) {
  return (
    <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#333", letterSpacing: "0.02em",
      textTransform: "uppercase" }}>{children}</p>
  );
}

/* ── Toggle switch ─────────────────────────────────────────── */
function ToggleSwitch({ value, onChange }) {
  return (
    <label style={{ display: "inline-flex", cursor: "pointer", flexShrink: 0 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ display: "none" }} />
      <span style={{ display: "inline-flex", width: 44, height: 24, borderRadius: 12, padding: 2,
        background: value ? "#008060" : "#ccc", transition: "background 0.2s", alignItems: "center" }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "transform 0.2s",
          transform: value ? "translateX(20px)" : "translateX(2px)", display: "block" }} />
      </span>
    </label>
  );
}

/* ── Product / collection chips ────────────────────────────── */
function ProductChips({ items, onRemove, type }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px 8px 8px",
          background: "#fff", border: "1.5px solid #e0e0e0",
          borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          maxWidth: 220,
        }}>
          {/* Thumbnail */}
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.title}
              style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid #eee" }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f0f0f0", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {type === "collection" ? "📁" : "📦"}
            </div>
          )}
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#111",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: type === "collection" ? "#6366f1" : "#008060",
              fontWeight: 500 }}>{type === "collection" ? "Collection" : "Product"}</p>
          </div>
          {/* Remove */}
          <button type="button" onClick={() => onRemove(item.id)}
            style={{ background: "#fee2e2", border: "none", cursor: "pointer", color: "#dc2626",
              padding: "3px 7px", borderRadius: 6, fontSize: 13, fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────── */
const labelStyle  = { display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 };
const helpText    = { margin: "4px 0 0", fontSize: 12, color: "#888" };
const inputStyle  = { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box", background: "#fafafa" };
const selectStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 14, color: "#111", background: "#fafafa", outline: "none", cursor: "pointer" };
const pickerBtn   = { padding: "9px 16px", border: "1.5px dashed #008060", borderRadius: 8, background: "#f0faf5", color: "#008060", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const pickerBtnSm = { padding: "6px 12px", border: "1.5px dashed #008060", borderRadius: 7, background: "#f0faf5", color: "#008060", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const editBtn     = { padding: "6px 14px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 };
const deleteBtn   = { padding: "6px 14px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff5f5", color: "#dc2626", fontSize: 13, cursor: "pointer", fontWeight: 500 };
const changeBtnStyle = { background: "none", border: "1px solid #ddd", cursor: "pointer", color: "#555", fontSize: 13, padding: "6px 10px", borderRadius: 6, fontWeight: 500 };
const addOfferBtn = { width: "100%", padding: "11px", border: "1.5px dashed #ccc", borderRadius: 10, background: "#fafafa", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" };

function safeJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
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
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onDiscard} disabled={saving} style={{
          padding: "8px 18px", borderRadius: 7, border: "1.5px solid #d1d5db",
          background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
        }}>Discard</button>
        <button onClick={onSave} disabled={saving} style={{
          padding: "8px 22px", borderRadius: 7, border: "none",
          background: saving ? "#374151" : "#111827", color: "#fff", fontSize: 13, fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.75 : 1,
        }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
