import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

/* Plan name strings defined here — NOT imported from shopify.server
   (server-only modules cannot be referenced by client-side component code) */
const PLAN_GROWTH     = "Growth";
const PLAN_ENTERPRISE = "Enterprise";

/* ── Loader ────────────────────────────────────────────────── */
export const loader = async ({ request }) => {
  const { billing, session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const { appSubscriptions } = await billing.check({
    plans: [PLAN_GROWTH, PLAN_ENTERPRISE],
    isTest: process.env.NODE_ENV !== "production",
  });
  const activeSub  = appSubscriptions?.[0] ?? null;
  const activePlan = activeSub?.name ?? "Starter";

  /* 30-day order count */
  let orderCount = 0;
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);
    const res  = await admin.graphql(
      `query OrderCount($q: String!) { ordersCount(query: $q) }`,
      { variables: { q: `created_at:>=${sinceStr}` } }
    );
    const json = await res.json();
    orderCount = json?.data?.ordersCount ?? 0;
  } catch (_) {}

  const settings = await prisma.cartSettings.findUnique({ where: { shop } });

  return {
    activePlan,
    orderCount,
    planName:    settings?.planName    ?? "starter",
    freeForever: settings?.freeForever ?? false,
    shop,
  };
};

/* ── Action ────────────────────────────────────────────────── */
export const action = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const shop   = session.shop;
  const form   = await request.formData();
  const intent = form.get("intent");
  const plan   = form.get("plan");

  if (intent === "subscribe") {
    const confirmationUrl = await billing.request({
      plan,
      isTest:    process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
    });
    await prisma.cartSettings.upsert({
      where:  { shop },
      create: { shop, planName: plan.toLowerCase() },
      update: { planName: plan.toLowerCase() },
    });
    return { redirectUrl: confirmationUrl };
  }

  if (intent === "downgrade") {
    try {
      const { appSubscriptions } = await billing.check({
        plans: [PLAN_GROWTH, PLAN_ENTERPRISE],
        isTest: process.env.NODE_ENV !== "production",
      });
      const sub = appSubscriptions?.[0];
      if (sub) await billing.cancel({ subscriptionId: sub.id, isTest: true, prorate: true });
    } catch (_) {}
    await prisma.cartSettings.upsert({
      where:  { shop },
      create: { shop, planName: "starter" },
      update: { planName: "starter" },
    });
    return { success: true };
  }

  return { error: "Unknown intent" };
};

/* ── Plan definitions ─────────────────────────────────────── */
const PLANS = [
  {
    key:        "starter",
    name:       "Starter",
    price:      "Free",
    sub:        "Up to 40 orders / month",
    highlight:  false,
    badge:      null,
    trial:      null,
    billingKey: null,
    note:       "No credit card required",
    color:      "#111",
  },
  {
    key:        "growth",
    name:       "Growth",
    price:      "$7",
    sub:        "per month · unlimited orders",
    highlight:  true,
    badge:      "Most Popular",
    trial:      "7-day free trial",
    billingKey: PLAN_GROWTH,
    note:       null,
    color:      "#2563eb",
  },
  {
    key:        "enterprise",
    name:       "Enterprise",
    price:      "$25",
    sub:        "per month · unlimited orders",
    highlight:  false,
    badge:      null,
    trial:      "7-day free trial",
    billingKey: PLAN_ENTERPRISE,
    note:       null,
    color:      "#7c3aed",
  },
];

/* Features — ordered by priority (upsell & freebie first) */
const FEATURES = [
  { icon: "☑️", label: "One-Click Upsell (checkbox below cart items)" },
  { icon: "⚡", label: "AI-powered upsell (Shopify Recommendations API)" },
  { icon: "🎁", label: "Freebie / free gift (up to 5 simultaneous offers)" },
  { icon: "🎁", label: "Freebie condition logic (AND / OR, cart value & quantity)" },
  { icon: "🏆", label: "Tiered rewards progress bar + confetti" },
  { icon: "🚢", label: "Free shipping progress bar" },
  { icon: "🛍", label: "Volume discounts display" },
  { icon: "🎀", label: "Gift wrap option (one-click add)" },
  { icon: "🛒", label: "Slide-in side cart drawer" },
  { icon: "📢", label: "Announcement banner (custom colors & text)" },
  { icon: "⏰", label: "Scarcity countdown timer" },
  { icon: "📦", label: "Stock scarcity badge on line items" },
  { icon: "🔔", label: "Add-to-cart: open drawer OR toast notification" },
  { icon: "📋", label: "Order summary dropdown (MRP, savings, total)" },
  { icon: "📝", label: "Order notes field" },
  { icon: "🔗", label: "Clickable product titles → product page" },
  { icon: "🚫", label: "Block /cart page redirect" },
  { icon: "🎨", label: "Custom CSS & JavaScript injection" },
  { icon: "🖱", label: "Cart icon replacement (10+ themes + custom selector)" },
  { icon: "🔒", label: "Trust badges (secure checkout, returns, guarantee)" },
  { icon: "📱", label: "Sticky Add-to-Cart button on product pages" },
  { icon: "⚡", label: "Express checkout (Shop Pay, Apple Pay, Google Pay)" },
  { icon: "🕒", label: "Recently viewed products on empty cart" },
  { icon: "🔗", label: "Cart share link (copy & share cart)" },
];

const ENTERPRISE_ONLY = [
  { icon: "🚀", label: "Priority email support (24h response)" },
  { icon: "💬", label: "In-app priority support chat" },
  { icon: "📞", label: "Dedicated onboarding call" },
  { icon: "✨", label: "Early access to new features" },
  { icon: "🛠", label: "Custom feature requests" },
];

/* ── Small helpers ─────────────────────────────────────────── */
function Tick({ color }) {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8.5" cy="8.5" r="8.5" fill={color || "#dcfce7"} />
      <path d="M5 8.5l2.5 2.5 4.5-4.5" stroke={color === "#e0e7ff" ? "#3730a3" : color === "#ede9fe" ? "#6d28d9" : "#16a34a"}
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BillingPage() {
  const { activePlan, orderCount, planName, freeForever } = useLoaderData();
  const navigate = useNavigate();

  const currentKey = freeForever ? "forever-free" : (planName || "starter");
  const overLimit  = currentKey === "starter" && orderCount > 40;

  async function handlePlan(plan) {
    if (plan.key === "starter") {
      const fd = new FormData();
      fd.set("intent", "downgrade");
      const r = await fetch(window.location.href, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (d.success) navigate(0);
      return;
    }
    const fd = new FormData();
    fd.set("intent", "subscribe");
    fd.set("plan", plan.billingKey);
    const r = await fetch(window.location.href, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (d.redirectUrl) {
      try { window.top.location.href = d.redirectUrl; }
      catch (_) { window.location.href = d.redirectUrl; }
    }
  }

  return (
    <s-page heading="Plans & Pricing">

      {/* Order count banner */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        padding: "14px 20px", background: overLimit ? "#fef2f2" : "#f0fdf4",
        borderRadius: 12, marginBottom: 28,
        border: `1px solid ${overLimit ? "#fecaca" : "#bbf7d0"}`,
      }}>
        <span style={{ fontSize: 22 }}>{overLimit ? "⚠️" : "✅"}</span>
        <div>
          <strong style={{ fontSize: 14, color: overLimit ? "#dc2626" : "#15803d" }}>
            {orderCount} orders in the last 30 days
          </strong>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>
            {overLimit
              ? "You've exceeded the free plan limit. Upgrade to Growth to continue with no interruption."
              : currentKey === "starter"
                ? `${40 - orderCount} orders remaining on your free plan this month.`
                : "Unlimited orders on your current plan."}
          </p>
        </div>
        {freeForever && (
          <span style={{ marginLeft: "auto", background: "#7c3aed", color: "#fff", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            Partner — Free Forever
          </span>
        )}
      </div>

      {/* Plan cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 44 }}>
        {PLANS.map(plan => {
          const isCurrent = planName === plan.key || (plan.key === "starter" && !["growth","enterprise"].includes(planName));
          return (
            <div key={plan.key} style={{
              border: `${plan.highlight ? 2 : 1.5}px solid ${plan.highlight ? plan.color : "#e5e7eb"}`,
              borderRadius: 18,
              padding: "28px 24px 24px",
              background: "#fff",
              position: "relative",
              boxShadow: plan.highlight ? `0 8px 32px ${plan.color}22` : "0 2px 8px rgba(0,0,0,0.04)",
              display: "flex", flexDirection: "column",
            }}>
              {plan.badge && (
                <div style={{
                  position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                  background: plan.color, color: "#fff", padding: "3px 16px",
                  borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                }}>
                  {plan.badge}
                </div>
              )}

              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: plan.color, textTransform: "uppercase", letterSpacing: 1 }}>
                {plan.name}
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "0 0 4px" }}>
                <span style={{ fontSize: plan.price === "Free" ? 32 : 36, fontWeight: 900, color: "#111", letterSpacing: -1 }}>{plan.price}</span>
                {plan.price !== "Free" && <span style={{ fontSize: 14, color: "#9ca3af" }}>/mo</span>}
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>{plan.sub}</p>
              {plan.trial && <p style={{ margin: "0 0 16px", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ {plan.trial}</p>}
              {plan.note && <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9ca3af" }}>{plan.note}</p>}
              {!plan.trial && !plan.note && <div style={{ marginBottom: 16 }} />}

              <button
                onClick={() => !isCurrent && handlePlan(plan)}
                disabled={isCurrent}
                style={{
                  display: "block", width: "100%", padding: "11px 0",
                  background: isCurrent ? "#f3f4f6" : plan.highlight ? plan.color : "#111",
                  color: isCurrent ? "#9ca3af" : "#fff",
                  border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
                  cursor: isCurrent ? "default" : "pointer", marginBottom: 20,
                  transition: "opacity 0.15s",
                }}
              >
                {isCurrent ? "✓ Current Plan" : plan.key === "starter" ? "Downgrade to Free" : `Get ${plan.name}`}
              </button>

              {/* What's included */}
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8 }}>
                {plan.key === "enterprise" ? "Everything in Growth, plus:" : "All features included:"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {plan.key === "enterprise"
                  ? ENTERPRISE_ONLY.map(f => (
                      <div key={f.label} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "#374151" }}>
                        <Tick color="#ede9fe" />
                        <span>{f.icon} {f.label}</span>
                      </div>
                    ))
                  : FEATURES.slice(0, plan.key === "starter" ? 8 : FEATURES.length).map(f => (
                      <div key={f.label} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "#374151" }}>
                        <Tick color={plan.highlight ? "#e0e7ff" : "#dcfce7"} />
                        <span>{f.label}</span>
                      </div>
                    ))
                }
                {plan.key === "starter" && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                    + {FEATURES.length - 8} more features on paid plans
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature comparison */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 16, textAlign: "center" }}>
        Feature Comparison
      </h2>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ padding: "13px 20px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb", width: "44%" }}>
                Feature
              </th>
              {PLANS.map(p => (
                <th key={p.key} style={{ padding: "13px 16px", textAlign: "center", fontWeight: 700, color: p.color, borderBottom: "1px solid #e5e7eb" }}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Orders / month",                                    "40",   "Unlimited", "Unlimited"],
              ["☑️ One-Click Upsell",                               false,  true,        true],
              ["⚡ AI-powered upsell (Recommendations API)",        false,  true,        true],
              ["🎁 Freebie / free gift (up to 5 offers)",          false,  true,        true],
              ["🎁 Freebie condition logic (AND / OR)",             false,  true,        true],
              ["🏆 Tiered rewards progress bar + confetti",         false,  true,        true],
              ["🚢 Free shipping progress bar",                     false,  true,        true],
              ["🛍 Volume discounts display",                       false,  true,        true],
              ["🎀 Gift wrap option",                               false,  true,        true],
              ["📦 Stock scarcity badge on line items",             false,  true,        true],
              ["📱 Sticky Add-to-Cart on product pages",            false,  true,        true],
              ["⚡ Express checkout (Shop Pay, Apple Pay)",         false,  true,        true],
              ["🕒 Recently viewed on empty cart",                  false,  true,        true],
              ["🛒 Slide-in side cart drawer",                      true,   true,        true],
              ["📢 Announcement banner",                            true,   true,        true],
              ["⏰ Scarcity countdown timer",                       true,   true,        true],
              ["📋 Order summary dropdown",                         true,   true,        true],
              ["📝 Order notes",                                    true,   true,        true],
              ["🔔 Add-to-cart behavior (drawer / toast)",          true,   true,        true],
              ["🔗 Clickable product titles",                       true,   true,        true],
              ["🚫 Block /cart page redirect",                      true,   true,        true],
              ["🎨 Custom CSS & JavaScript injection",              true,   true,        true],
              ["🖱 Cart icon replacement (10+ themes)",             true,   true,        true],
              ["🔒 Trust badges",                                   true,   true,        true],
              ["🔗 Cart share link",                                true,   true,        true],
              ["🚀 Priority support (24h response)",                false,  false,       true],
              ["📞 Dedicated onboarding call",                      false,  false,       true],
              ["✨ Early access to new features",                   false,  false,       true],
              ["🛠 Custom feature requests",                        false,  false,       true],
            ].map(([label, ...vals], i) => (
              <tr key={label} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "10px 20px", color: "#374151", borderBottom: "1px solid #f3f4f6", fontWeight: 500 }}>
                  {label}
                </td>
                {vals.map((v, j) => (
                  <td key={j} style={{ padding: "10px 16px", textAlign: "center", borderBottom: "1px solid #f3f4f6" }}>
                    {v === true
                      ? <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 16 }}>✓</span>
                      : v === false
                        ? <span style={{ color: "#d1d5db", fontSize: 16 }}>—</span>
                        : <span style={{ fontWeight: 700, color: "#374151" }}>{v}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: "center", fontSize: 13, color: "#9ca3af", marginBottom: 0 }}>
        All plans include a free trial. Dev stores are always free.{" "}
        <button onClick={() => navigate("/app/help")}
          style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: 0 }}>
          Questions? Contact support →
        </button>
      </p>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error();
}
