import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

const OWNER_SHOP = "swiftcartupsell.myshopify.com";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (shop !== OWNER_SHOP) {
    return { authorized: false, merchants: [], stats: {} };
  }

  const [merchants, events] = await Promise.all([
    prisma.cartSettings.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        shop: true, planName: true, freeForever: true,
        enabled: true, upsellEnabled: true, freebieEnabled: true,
        freeShippingBarEnabled: true, trustBadgesEnabled: true,
        stickyAtcEnabled: true, aiUpsellEnabled: true,
        tieredRewardsEnabled: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.cartEvent.groupBy({
      by: ["shop"],
      _count: { event: true },
      _max: { createdAt: true },
    }),
  ]);

  const eventMap = {};
  for (const e of events) {
    eventMap[e.shop] = { total: e._count.event, lastAt: e._max.createdAt };
  }

  const total = merchants.length;
  const active = merchants.filter(m => m.enabled).length;
  const plans = merchants.reduce((acc, m) => {
    const p = m.planName || "starter";
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});

  return {
    authorized: true,
    merchants: merchants.map(m => ({ ...m, events: eventMap[m.shop] || null })),
    stats: { total, active, plans },
  };
};

export default function MerchantsPage() {
  const { authorized, merchants, stats } = useLoaderData();

  if (!authorized) {
    return (
      <s-page heading="Merchants">
        <s-section>
          <p style={{ color: "#6b7280", fontSize: 14 }}>This page is only accessible from the app owner account.</p>
        </s-section>
      </s-page>
    );
  }

  const planColor = { starter: "#6b7280", growth: "#2563eb", enterprise: "#7c3aed" };

  function fmt(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function dot(on) {
    return (
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: on ? "#22c55e" : "#d1d5db", flexShrink: 0 }} />
    );
  }

  return (
    <s-page heading="Installed Merchants">

      {/* Summary Stats */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[
            { label: "Total Installs", value: stats.total, color: "#111" },
            { label: "Active (cart on)", value: stats.active, color: "#16a34a" },
            { label: "Growth Plan", value: stats.plans?.growth || 0, color: "#2563eb" },
            { label: "Enterprise Plan", value: stats.plans?.enterprise || 0, color: "#7c3aed" },
          ].map(s => (
            <div key={s.label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 20px" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      </s-section>

      {/* Merchants Table */}
      <s-section heading={`All Merchants (${merchants.length})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {["Shop", "Plan", "Cart", "Upsell", "Freebie", "Rewards", "Free Ship", "Trust", "Sticky", "AI", "Events", "Last Event", "Installed"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {merchants.map((m, i) => (
                <tr key={m.shop} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "10px 12px", maxWidth: 200 }}>
                    <div style={{ fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.shop.replace(".myshopify.com", "")}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{m.shop}</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, background: planColor[m.planName] || "#6b7280", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                      {m.freeForever ? "Free Forever" : (m.planName || "starter")}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.enabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.upsellEnabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.freebieEnabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.tieredRewardsEnabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.freeShippingBarEnabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.trustBadgesEnabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.stickyAtcEnabled)}</td>
                  <td style={{ padding: "10px 12px" }}>{dot(m.aiUpsellEnabled)}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: m.events ? "#111" : "#d1d5db" }}>
                    {m.events ? m.events.total.toLocaleString() : "0"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                    {m.events ? fmt(m.events.lastAt) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                    {fmt(m.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {merchants.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0", fontSize: 14 }}>No merchants installed yet.</p>
          )}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
