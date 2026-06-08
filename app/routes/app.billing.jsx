import { useEffect } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";
import prisma from "../db.server";

/* Plan name strings defined here — NOT imported from shopify.server
   (server-only modules cannot be referenced by client-side component code).
   These MUST match the keys in the `billing` config in app/shopify.server.js */
const PLAN_GROWTH     = "Growth";  // $7/mo — up to 200 orders
const PLAN_ENTERPRISE = "Scale";   // $19/mo — 200+ orders, unlimited

/* Shopify-assigned app handle (from admin URL .../apps/edgecart-1/...). Used to
   build a post-approval returnUrl that lands the merchant back INSIDE the
   embedded admin, instead of on the raw app URL (which has no session and
   bounces to the login page). */
const APP_HANDLE = "edgecart-1";

/* Development / partner stores can ONLY accept test charges; real stores must
   get a real charge. Creating a real charge on a dev store throws "The shop
   cannot accept the provided charge", and billing.check must use the same flag
   to find a subscription, so we derive isTest from the shop's plan. */
async function resolveIsTest(admin) {
  try {
    const res  = await admin.graphql(
      `#graphql
       query { shop { plan { partnerDevelopment } } }`
    );
    const json = await res.json();
    return json?.data?.shop?.plan?.partnerDevelopment === true;
  } catch (_) {
    return process.env.NODE_ENV !== "production";
  }
}

/* ── Loader ────────────────────────────────────────────────── */
export const loader = async ({ request }) => {
  const { billing, session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  /* Read the merchant's CURRENT active subscription straight from Shopify. This
     returns active subscriptions regardless of the test flag, so the UI always
     matches what Shopify shows (billing.check needs a matching isTest, which can
     disagree and make a paid merchant look "free"). Never throws to the page. */
  let activePlan = "Starter";
  try {
    const res = await admin.graphql(
      `#graphql
       query {
         currentAppInstallation {
           activeSubscriptions { name status }
         }
       }`
    );
    const json = await res.json();
    const subs = json?.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subs.find((s) => s.status === "ACTIVE") ?? subs[0];
    if (active?.name) activePlan = active.name;
  } catch (_) {}

  let settings = null;
  try {
    settings = await prisma.cartSettings.findUnique({ where: { shop } });
  } catch (_) {}

  const dbPlan = settings?.planName ?? "starter";

  /* Downgrade reflection: after a downgrade we cancel the Shopify subscription and
     set our planName back to "starter", but Shopify keeps the cancelled sub ACTIVE
     until the billing period ends (grace period). So if Shopify still reports a paid
     sub yet our DB says the merchant downgraded to starter, show Free immediately.
     (Upgrades are unaffected: subscribe sets planName to the paid plan, so this
     only triggers on an actual downgrade.) */
  if (activePlan !== "Starter" && dbPlan === "starter") {
    activePlan = "Starter";
  }

  return {
    activePlan,
    planName:    dbPlan,
    freeForever: settings?.freeForever ?? false,
    shop,
  };
};

/* Header the library puts the charge-approval URL into when billing.request
   throws for an XHR (App Bridge fetch) request. */
const REAUTH_URL_HEADER = "X-Shopify-API-Request-Failure-Reauthorize-Url";

/* ── Action ────────────────────────────────────────────────────
   Billing API flow. billing.request() does NOT return a URL — it THROWS a
   Response carrying Shopify's native charge-approval URL. Rather than let that
   bubble to the client (which made App Bridge/React Router crash), we catch it
   here, pull the URL out of the header, and hand it back as plain JSON so the
   client can redirect the top frame to it itself. On approval Shopify activates
   the recurring charge and returns the merchant to returnUrl. */
export const action = async ({ request }) => {
  const { billing, session, admin } = await authenticate.admin(request);
  const shop     = session.shop;
  const formData = await request.formData();
  const intent   = formData.get("intent");

  /* After approval Shopify redirects the TOP window to returnUrl. Point it at the
     embedded admin deep link so the app reloads with a valid session — returning
     to the raw app URL has no session and dumps the merchant on the login page.
     Use the app's client ID (stable) like Corner Cart does, falling back to the
     handle. Shopify appends ?charge_id=... on redirect. */
  const storeHandle = (shop || "").replace(".myshopify.com", "");
  const appRef      = process.env.SHOPIFY_API_KEY || APP_HANDLE;
  const returnUrl   = `https://admin.shopify.com/store/${storeHandle}/apps/${appRef}/app/billing`;
  const isTest      = await resolveIsTest(admin);

  if (intent === "subscribe") {
    const plan = formData.get("plan"); // "Growth" | "Scale"
    try {
      await prisma.cartSettings.upsert({
        where:  { shop },
        create: { shop, planName: String(plan).toLowerCase() },
        update: { planName: String(plan).toLowerCase() },
      });
    } catch (_) {}
    try {
      await billing.request({ plan, isTest, returnUrl });
    } catch (thrown) {
      /* Success path: the library throws a Response carrying the approval URL. */
      if (thrown instanceof Response) {
        const url = thrown.headers.get(REAUTH_URL_HEADER) || thrown.headers.get("Location");
        if (url) return { confirmationUrl: url };
        return { error: `Billing request failed (HTTP ${thrown.status}).` };
      }
      /* A real error (not the redirect). Most common cause: the app is still on
         Shopify App Pricing in the Partner Dashboard, which blocks Billing API
         charges. Surface it instead of throwing an "Application Error". */
      console.error("billing.request failed:", thrown);
      return {
        error:
          (thrown && thrown.message) ||
          "Could not start the subscription. In the Partner Dashboard set this app's pricing to “Manual pricing (Billing API)”, not Shopify App Pricing.",
      };
    }
    return null; // unreachable on success (redirect URL returned above)
  }

  if (intent === "cancel") {
    /* 1) Record the downgrade in our DB FIRST and unconditionally. The merchant
          explicitly chose Free, so the app must reflect Free regardless of how the
          Shopify cancel call behaves. (Previously a cancel hiccup returned early,
          before this write, so the page kept showing the paid plan.) */
    try {
      await prisma.cartSettings.upsert({
        where:  { shop },
        create: { shop, planName: "starter" },
        update: { planName: "starter" },
      });
    } catch (e) {
      console.error("billing cancel: DB downgrade failed:", e);
    }

    /* 2) Cancel whatever subscription Shopify reports active. Errors here are
          logged but never block the downgrade from reflecting in the app. */
    try {
      const res = await admin.graphql(
        `#graphql
         query { currentAppInstallation { activeSubscriptions { id status } } }`
      );
      const json = await res.json();
      const subs = json?.data?.currentAppInstallation?.activeSubscriptions ?? [];
      for (const sub of subs) {
        if (!sub?.id) continue;
        const cancelRes = await admin.graphql(
          `#graphql
           mutation CancelSub($id: ID!) {
             appSubscriptionCancel(id: $id) { userErrors { field message } }
           }`,
          { variables: { id: sub.id } }
        );
        const cancelJson = await cancelRes.json();
        const errs = cancelJson?.data?.appSubscriptionCancel?.userErrors ?? [];
        if (errs.length) console.error("billing cancel userErrors:", errs.map((e) => e.message).join("; "));
      }
    } catch (e) {
      console.error("billing cancel: Shopify cancel failed:", e);
    }

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
    sub:        "Core cart features — free forever",
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
    sub:        "per month",
    highlight:  true,
    badge:      "Most Popular",
    trial:      "7-day free trial",
    billingKey: PLAN_GROWTH,
    note:       null,
    color:      "#2563eb",
  },
  {
    key:        "enterprise",
    name:       "Scale",
    price:      "$19",
    sub:        "per month",
    highlight:  false,
    badge:      "Best for high volume",
    trial:      "7-day free trial",
    billingKey: PLAN_ENTERPRISE,
    note:       null,
    color:      "#7c3aed",
  },
];

/* Features — ordered by priority (upsell & freebie first) */
const FEATURES = [
  { icon: "☑️", label: "One-Click Upsell (checkbox below cart items)", premium: true },
  { icon: "⚡", label: "AI-powered upsell (Shopify Recommendations API)", premium: true },
  { icon: "🎁", label: "Freebie / free gift (up to 5 simultaneous offers)", premium: true },
  { icon: "🎁", label: "Freebie condition logic (AND / OR, cart value & quantity)", premium: true },
  { icon: "🏷", label: "Discount code field (validated & applied in cart)" },
  { icon: "🎟", label: "View all offers — one-click coupon list" },
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
  const { activePlan, freeForever } = useLoaderData();
  const navigate = useNavigate();
  const fetcher  = useFetcher();

  /* When the action returns the charge-approval URL, send the whole admin tab
     there (it's an admin.shopify.com URL, so a top-frame navigation is allowed
     from inside the embedded iframe). */
  useEffect(() => {
    const url = fetcher.data?.confirmationUrl;
    if (url) {
      try { (window.top ?? window).location.href = url; }
      catch (_) { window.location.href = url; }
    }
  }, [fetcher.data]);

  /* The active Shopify subscription (from the loader) is the single source of
     truth: "Growth"/"Scale" map to their card keys, anything else is the free
     Starter plan. (Previously this fell back to a stored planName like "scale",
     which never matched the Scale card's key "enterprise" — so an approved
     merchant showed as "free".) */
  const activeKey  = activePlan === "Growth" ? "growth"
                   : activePlan === "Scale"  ? "enterprise"
                   : "starter";
  const currentKey = freeForever ? "forever-free" : activeKey;

  const busy = fetcher.state !== "idle";

  /* Submit through the fetcher so the request carries the App Bridge session
     token. "subscribe" returns { confirmationUrl } -> the effect above redirects
     to Shopify's native approval page. "cancel" revalidates the loader. */
  function handlePlan(plan) {
    if (busy) return;
    if (plan.key === "starter") {
      fetcher.submit({ intent: "cancel" }, { method: "post" });
      return;
    }
    fetcher.submit({ intent: "subscribe", plan: plan.billingKey }, { method: "post" });
  }

  return (
    <s-page heading="Plans & Pricing">

      {/* Billing error (e.g. app still on Shopify App Pricing, blocking the Billing API) */}
      {fetcher.data?.error && (
        <div style={{
          padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 10, marginBottom: 16, color: "#b91c1c", fontSize: 13, fontWeight: 500,
        }}>
          ⚠️ {fetcher.data.error}
        </div>
      )}

      {/* Trial / status banner */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        padding: "14px 20px", background: "#f0fdf4",
        borderRadius: 12, marginBottom: 28, border: "1px solid #bbf7d0",
      }}>
        <span style={{ fontSize: 22 }}>🎁</span>
        <div>
          <strong style={{ fontSize: 14, color: "#15803d" }}>
            45-day free trial of all premium features
          </strong>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>
            Freebie, Upsell & AI Upsell are free for your first 45 days. After that, keep them by upgrading to Growth or Scale.
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
          const isCurrent = currentKey === plan.key || (plan.key === "starter" && !["growth","enterprise"].includes(currentKey));
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
                type="button"
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
                {plan.key === "enterprise" ? "Everything in Growth, plus:" : plan.key === "growth" ? "All features included:" : "Included (premium free for 45 days):"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {plan.key === "enterprise"
                  ? ENTERPRISE_ONLY.map(f => (
                      <div key={f.label} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "#374151" }}>
                        <Tick color="#ede9fe" />
                        <span>{f.icon} {f.label}</span>
                      </div>
                    ))
                  : FEATURES.slice(0, plan.key === "starter" ? 8 : FEATURES.length).map(f => {
                      const trialOnly = plan.key === "starter" && f.premium;
                      return (
                        <div key={f.label} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "#374151" }}>
                          <Tick color={plan.highlight ? "#e0e7ff" : "#dcfce7"} />
                          <span>
                            {f.label}
                            {trialOnly && <span style={{ color: "#b45309", fontWeight: 700 }}> · free 45 days</span>}
                          </span>
                        </div>
                      );
                    })
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
              ["☑️ One-Click Upsell",                               "45 days", true,     true],
              ["⚡ AI-powered upsell (Recommendations API)",        "45 days", true,     true],
              ["🎁 Freebie / free gift (up to 5 offers)",          "45 days", true,     true],
              ["🎁 Freebie condition logic (AND / OR)",             "45 days", true,     true],
              ["🏷 Discount code field",                            true,   true,        true],
              ["🎟 View all offers / coupon list",                  true,   true,        true],
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
  return boundary.error(useRouteError());
}
