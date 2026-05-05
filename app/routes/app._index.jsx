import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await prisma.cartSettings.findUnique({ where: { shop } });
  return {
    shop,
    enabled: settings?.enabled ?? true,
    upsellEnabled: settings?.upsellEnabled ?? false,
    freebieEnabled: settings?.freebieEnabled ?? false,
    bannerEnabled: settings?.bannerEnabled ?? true,
    discountEnabled: settings?.discountEnabled ?? true,
    tieredRewardsEnabled: settings?.tieredRewardsEnabled ?? false,
  };
};

const s = {
  hero: {
    background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
    borderRadius: 16,
    padding: "36px 40px",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 0,
  },
  heroTitle: { margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#fff" },
  heroSub: { margin: "0 0 20px", fontSize: 15, color: "#94a3b8", lineHeight: 1.5 },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    background: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    color: "#e2e8f0",
    marginBottom: 16,
    border: "1px solid rgba(255,255,255,0.15)",
  },
  heroBtn: {
    display: "inline-block",
    padding: "10px 22px",
    background: "#3b82f6",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    marginRight: 10,
  },
  heroBtnOutline: {
    display: "inline-block",
    padding: "10px 22px",
    background: "transparent",
    color: "#e2e8f0",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
    border: "1px solid rgba(255,255,255,0.25)",
    cursor: "pointer",
  },
  statusDot: (on) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: on ? "#22c55e" : "#6b7280",
    display: "inline-block",
    marginRight: 6,
    flexShrink: 0,
  }),
  statusRow: {
    display: "flex",
    alignItems: "center",
    fontSize: 13,
    color: "#fff",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  featureCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: "24px 24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    transition: "box-shadow 0.15s, border-color 0.15s",
    textDecoration: "none",
    cursor: "pointer",
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    marginBottom: 2,
  },
  featureTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: "#111827" },
  featureDesc: { margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.55, flex: 1 },
  featureLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
    color: "#2563eb",
    textDecoration: "none",
    marginTop: 4,
  },
  stepCard: {
    display: "flex",
    gap: 14,
    padding: "14px 0",
    borderBottom: "1px solid #f3f4f6",
    alignItems: "flex-start",
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#0f172a",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 800,
    flexShrink: 0,
  },
};

const features = [
  {
    icon: "🛒",
    iconBg: "#eff6ff",
    title: "Cart Drawer",
    desc: "Slide-in cart with banner, colors, discount code, and checkout button. Fully customizable.",
    href: "/app/settings",
    cta: "Configure →",
  },
  {
    icon: "⚡",
    iconBg: "#fef9c3",
    title: "Upsell Products",
    desc: "Show targeted upsell products triggered by cart value, quantity, or specific products.",
    href: "/app/upsell",
    cta: "Set up →",
  },
  {
    icon: "🎁",
    iconBg: "#fdf4ff",
    title: "Free Gift",
    desc: "Reward customers with a free gift when they hit a cart value or quantity milestone.",
    href: "/app/freebie",
    cta: "Set up →",
  },
];

export default function Dashboard() {
  const data = useLoaderData();
  const navigate = useNavigate();

  const statuses = [
    { label: "Side Cart", on: data.enabled },
    { label: "Banner", on: data.bannerEnabled },
    { label: "Discount Code", on: data.discountEnabled },
    { label: "Upsell", on: data.upsellEnabled },
    { label: "Free Gift", on: data.freebieEnabled },
    { label: "Tiered Rewards", on: data.tieredRewardsEnabled },
  ];

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Hero banner */}
      <s-section>
        <div style={s.hero}>
          <div style={{ flex: 1 }}>
            <div style={s.heroBadge}>
              <span style={{ color: "#4ade80" }}>●</span> EdgeCart is active
            </div>
            <h1 style={s.heroTitle}>Welcome to EdgeCart</h1>
            <p style={s.heroSub}>
              Your all-in-one side cart — boost conversions with upsells,<br />
              free gifts, tiered rewards, and smart discounts.
            </p>
            <div>
              <button onClick={() => navigate("/app/settings")} style={s.heroBtn}>Configure Cart Drawer</button>
              <button onClick={() => navigate("/app/help")} style={s.heroBtnOutline}>Get Help</button>
            </div>
          </div>

          {/* Live status panel */}
          <div
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: "18px 22px",
              minWidth: 200,
              flexShrink: 0,
            }}
          >
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Live Status
            </p>
            {statuses.map((st) => (
              <div key={st.label} style={s.statusRow}>
                <span style={s.statusDot(st.on)} />
                <span style={{ flex: 1 }}>{st.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: st.on ? "#4ade80" : "#64748b" }}>
                  {st.on ? "ON" : "OFF"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </s-section>

      {/* Feature cards */}
      <s-section heading="Configure your cart">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {features.map((f) => (
            <div
              key={f.title}
              role="button"
              tabIndex={0}
              onClick={() => navigate(f.href)}
              onKeyDown={(e) => e.key === "Enter" && navigate(f.href)}
              style={s.featureCard}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
                e.currentTarget.style.borderColor = "#d1d5db";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              <div style={{ ...s.featureIcon, background: f.iconBg }}>{f.icon}</div>
              <h3 style={s.featureTitle}>{f.title}</h3>
              <p style={s.featureDesc}>{f.desc}</p>
              <span style={s.featureLink}>{f.cta}</span>
            </div>
          ))}
        </div>
      </s-section>

      {/* Bottom: How to activate + Support */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* How to activate */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: "22px 24px",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#111827" }}>
              🚀 How to Activate
            </h3>
            {[
              { n: 1, text: "Configure your cart settings using the links above." },
              { n: 2, text: "Go to Shopify Admin → Online Store → Themes → Customize." },
              { n: 3, text: 'Click "App Embeds" in the left sidebar.' },
              { n: 4, text: 'Toggle on "EdgeCart SideCart" and Save. You\'re live!' },
            ].map((step) => (
              <div key={step.n} style={s.stepCard}>
                <div style={s.stepNum}>{step.n}</div>
                <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{step.text}</p>
              </div>
            ))}
          </div>

          {/* Support */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: "22px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827" }}>
              💬 Need Help?
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              Our support team is here to help you get the most out of EdgeCart. Reach out anytime.
            </p>

            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate("/app/help")}
              onKeyDown={(e) => e.key === "Enter" && navigate("/app/help")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                cursor: "pointer",
                background: "#f9fafb",
              }}
            >
              <span style={{ fontSize: 20 }}>✉️</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>Send a Message</p>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>We reply within 24 hours</p>
              </div>
            </div>

            <a
              href="https://calendly.com/shopifyappscompany/30min"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                textDecoration: "none",
                background: "#f9fafb",
              }}
            >
              <span style={{ fontSize: 20 }}>📅</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>Schedule a Demo</p>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Free 30-min walkthrough</p>
              </div>
            </a>
          </div>
        </div>
      </s-section>
    </div>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
