import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.cartEvent.findMany({
    where: { shop, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
  });

  /* --- Aggregate metrics --- */
  const checkouts   = events.filter((e) => e.event === "checkout");
  const cartOpens   = events.filter((e) => e.event === "cart_open");
  const upsellAdds  = events.filter((e) => e.event === "upsell_add");
  const freebieAdds = events.filter((e) => e.event === "freebie_add");

  const totalRevenue  = checkouts.reduce((s, e) => s + e.revenue, 0);
  const aov           = checkouts.length ? Math.round(totalRevenue / checkouts.length) : 0;
  const conversionRate = cartOpens.length
    ? Math.round((checkouts.length / cartOpens.length) * 100)
    : 0;

  /* Upsell revenue = checkout revenue on sessions that had an upsell_add
     Approximation: (upsellAdds / checkouts) * totalRevenue */
  const upsellRevenue = checkouts.length
    ? Math.round((upsellAdds.length / Math.max(checkouts.length, 1)) * totalRevenue)
    : 0;

  /* --- Daily revenue for bar chart (last N days) --- */
  const dailyMap = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyMap[key] = 0;
  }
  checkouts.forEach((e) => {
    const key = e.createdAt.toISOString().slice(0, 10);
    if (key in dailyMap) dailyMap[key] += e.revenue;
  });
  const dailyRevenue = Object.entries(dailyMap).map(([date, rev]) => ({ date, rev }));

  /* --- Top upsell products --- */
  const variantCount = {};
  upsellAdds.forEach((e) => {
    if (e.variantId) variantCount[e.variantId] = (variantCount[e.variantId] || 0) + 1;
  });
  const topUpsells = Object.entries(variantCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vid, count]) => ({ vid, count }));

  return {
    days,
    totalRevenue,
    aov,
    conversionRate,
    cartOpens:    cartOpens.length,
    checkouts:    checkouts.length,
    upsellAdds:   upsellAdds.length,
    freebieAdds:  freebieAdds.length,
    upsellRevenue,
    dailyRevenue,
    topUpsells,
    hasData: events.length > 0,
  };
};

function money(cents) {
  return "$" + (cents / 100).toFixed(2);
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid #f0f0f0",
      borderRadius: 14,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
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
        {data.map((d, i) => {
          const pct = Math.max((d.rev / max) * 100, d.rev > 0 ? 4 : 0);
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div
                title={d.date + ": " + money(d.rev)}
                style={{
                  width: "100%",
                  height: pct + "%",
                  background: d.rev > 0 ? "linear-gradient(180deg, #6366f1, #818cf8)" : "#f3f4f6",
                  borderRadius: "4px 4px 2px 2px",
                  minHeight: 3,
                  transition: "height 0.3s ease",
                  cursor: "default",
                }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {data.map((d, i) => {
          const show = i % showEvery === 0 || i === data.length - 1;
          const label = show ? d.date.slice(5) : "";
          return (
            <div key={d.date} style={{ flex: 1, fontSize: 9, color: "#9ca3af", textAlign: "center", overflow: "hidden" }}>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Analytics() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const periods = [
    { label: "7 days", value: 7 },
    { label: "30 days", value: 30 },
    { label: "90 days", value: 90 },
  ];

  return (
    <s-page title="Analytics">
      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {periods.map((p) => (
          <a
            key={p.value}
            href={`?days=${p.value}`}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              background: data.days === p.value ? "#111" : "#f3f4f6",
              color: data.days === p.value ? "#fff" : "#374151",
              transition: "all 0.15s",
            }}
          >
            {p.label}
          </a>
        ))}
      </div>

      {!data.hasData ? (
        <s-section>
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>No data yet</p>
            <p style={{ fontSize: 14, margin: 0 }}>Analytics will appear here once customers start using your cart. Data is collected automatically.</p>
          </div>
        </s-section>
      ) : (
        <>
          {/* Key metrics grid */}
          <s-section title="Revenue">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <MetricCard label="Total Revenue" value={money(data.totalRevenue)} sub={`${data.checkouts} orders`} color="#111" />
              <MetricCard label="Avg Order Value" value={money(data.aov)} sub="per checkout" color="#6366f1" />
              <MetricCard label="Upsell Revenue" value={money(data.upsellRevenue)} sub={`${data.upsellAdds} upsells added`} color="#059669" />
              <MetricCard label="Conversion Rate" value={data.conversionRate + "%"} sub={`${data.checkouts} of ${data.cartOpens} opens`} color="#d97706" />
            </div>

            {/* Revenue chart */}
            <div style={{ background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 14, padding: "20px 22px" }}>
              <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#374151" }}>
                Revenue — last {data.days} days
              </p>
              <BarChart data={data.dailyRevenue} days={data.days} />
            </div>
          </s-section>

          {/* Engagement metrics */}
          <s-section title="Engagement">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              <MetricCard label="Cart Opens" value={data.cartOpens.toLocaleString()} sub={`last ${data.days} days`} />
              <MetricCard label="Checkouts" value={data.checkouts.toLocaleString()} sub="reached checkout" color="#6366f1" />
              <MetricCard label="Upsells Added" value={data.upsellAdds.toLocaleString()} sub="by customers" color="#059669" />
              <MetricCard label="Freebies Claimed" value={data.freebieAdds.toLocaleString()} sub="free gifts added" color="#ec4899" />
            </div>
          </s-section>

          {/* Top upsell products */}
          {data.topUpsells.length > 0 && (
            <s-section title="Top Upsell Products">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.topUpsells.map((u, i) => (
                  <div key={u.vid} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", background: "#fff",
                    border: "1.5px solid #f0f0f0", borderRadius: 10,
                  }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : "#cd7c54",
                      color: "#fff", fontSize: 11, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: "#374151", fontFamily: "monospace" }}>
                      Variant {u.vid.replace("gid://shopify/ProductVariant/", "")}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
                      {u.count} add{u.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </s-section>
          )}
        </>
      )}

      <s-section>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          📌 Analytics tracks: cart opens, checkouts (with cart value), upsell product adds, and freebie claims. Data is collected anonymously from your storefront. Revenue shown is the cart value at checkout — actual collected revenue may differ based on discounts applied at checkout.
        </p>
      </s-section>
    </s-page>
  );
}
