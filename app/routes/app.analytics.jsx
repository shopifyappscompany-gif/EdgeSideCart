import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [events, cartSettings] = await Promise.all([
    prisma.cartEvent.findMany({
      where: { shop, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cartSettings.findUnique({ where: { shop } }),
  ]);

  /* --- Aggregate metrics --- */
  const checkouts   = events.filter((e) => e.event === "checkout");
  const cartOpens   = events.filter((e) => e.event === "cart_open");
  const upsellAdds  = events.filter((e) => e.event === "upsell_add");
  const freebieAdds = events.filter((e) => e.event === "freebie_add");

  const totalCartValue = checkouts.reduce((s, e) => s + e.revenue, 0);
  const avgCartValue   = checkouts.length ? Math.round(totalCartValue / checkouts.length) : 0;
  const conversionRate = cartOpens.length
    ? Math.round((checkouts.length / cartOpens.length) * 100)
    : 0;
  const upsellCartImpact = checkouts.length
    ? Math.round((upsellAdds.length / Math.max(checkouts.length, 1)) * totalCartValue)
    : 0;

  /* --- Daily cart value for bar chart (last N days) --- */
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

  /* --- Build product lookup from saved upsell products --- */
  const productLookup = {};
  function stripGid(id) {
    if (!id) return "";
    const s = String(id);
    return s.includes("/") ? s.split("/").pop() : s;
  }
  function safeJSON(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  if (cartSettings) {
    // Side-cart manual upsell products: { id, title, handle, variantId, variantTitle }
    const sideUpsells = safeJSON(cartSettings.upsellProducts, []);
    sideUpsells.forEach((p) => {
      const vid = stripGid(p.variants?.[0]?.id || p.variantId || "");
      if (vid) productLookup[vid] = { productTitle: p.title, variantTitle: p.variants?.[0]?.title || p.variantTitle || "" };
    });
    // Product page upsell products: { id, title, handle, variantId, variantTitle }
    const ppUpsells = safeJSON(cartSettings.productPageUpsellProducts, []);
    ppUpsells.forEach((p) => {
      const vid = stripGid(p.variantId || "");
      if (vid) productLookup[vid] = { productTitle: p.title, variantTitle: p.variantTitle || "" };
    });
    // Freebie products
    const freebieOffers = safeJSON(cartSettings.freebieOffers, []);
    freebieOffers.forEach((o) => {
      const vid = stripGid(o.productVariantId || "");
      if (vid) productLookup[vid] = { productTitle: o.productTitle || "Free Gift", variantTitle: "" };
    });
  }

  /* --- Top upsell products --- */
  const variantCount = {};
  upsellAdds.forEach((e) => {
    if (e.variantId) {
      const vid = stripGid(e.variantId);
      variantCount[vid] = (variantCount[vid] || 0) + 1;
    }
  });
  const topUpsells = Object.entries(variantCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vid, count]) => ({
      vid,
      count,
      productTitle: productLookup[vid]?.productTitle || null,
      variantTitle: productLookup[vid]?.variantTitle || null,
    }));

  /* --- Top freebie claims --- */
  const freebieCount = {};
  freebieAdds.forEach((e) => {
    if (e.variantId) {
      const vid = stripGid(e.variantId);
      freebieCount[vid] = (freebieCount[vid] || 0) + 1;
    }
  });
  const topFreebies = Object.entries(freebieCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([vid, count]) => ({
      vid,
      count,
      productTitle: productLookup[vid]?.productTitle || null,
    }));

  /* --- Peak day --- */
  let peakDay = null;
  let peakRev = 0;
  Object.entries(dailyMap).forEach(([date, rev]) => {
    if (rev > peakRev) { peakRev = rev; peakDay = date; }
  });

  return {
    days,
    totalCartValue,
    avgCartValue,
    conversionRate,
    upsellCartImpact,
    cartOpens:    cartOpens.length,
    checkouts:    checkouts.length,
    upsellAdds:   upsellAdds.length,
    freebieAdds:  freebieAdds.length,
    dailyRevenue,
    topUpsells,
    topFreebies,
    peakDay,
    peakDayValue: peakRev,
    hasData: events.length > 0,
  };
};

function money(cents) {
  return "$" + (cents / 100).toFixed(2);
}

function MetricCard({ label, value, sub, color, note }) {
  return (
    <div style={{
      background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 14,
      padding: "20px 22px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: color || "#111", letterSpacing: "-0.5px" }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "#6b7280" }}>{sub}</span>}
      {note && <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{note}</span>}
    </div>
  );
}

function BarChart({ data, days }) {
  const max = Math.max(...data.map((d) => d.rev), 1);
  const showEvery = days <= 7 ? 1 : days <= 14 ? 2 : 7;
  return (
    <div style={{ padding: "0 0 8px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
        {data.map((d) => {
          const pct = Math.max((d.rev / max) * 100, d.rev > 0 ? 4 : 0);
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div
                title={d.date + ": " + money(d.rev)}
                style={{
                  width: "100%", height: pct + "%",
                  background: d.rev > 0 ? "linear-gradient(180deg, #6366f1, #818cf8)" : "#f3f4f6",
                  borderRadius: "4px 4px 2px 2px", minHeight: 3, transition: "height 0.3s ease", cursor: "default",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {data.map((d, i) => {
          const show = i % showEvery === 0 || i === data.length - 1;
          return (
            <div key={d.date} style={{ flex: 1, fontSize: 9, color: "#9ca3af", textAlign: "center", overflow: "hidden" }}>
              {show ? d.date.slice(5) : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductRow({ rank, productTitle, variantTitle, vid, count, countLabel, color }) {
  const rankColors = ["#fbbf24", "#9ca3af", "#cd7c54"];
  const displayName = productTitle
    ? (variantTitle && variantTitle !== "Default Title" ? `${productTitle} — ${variantTitle}` : productTitle)
    : `Variant #${vid}`;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 10,
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: "50%",
        background: rankColors[rank] || "#e5e7eb",
        color: rank < 3 ? "#fff" : "#374151", fontSize: 11, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{rank + 1}</span>
      <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{displayName}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || "#059669" }}>
        {count} {countLabel || "add"}{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

export default function Analytics() {
  const data = useLoaderData();
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
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
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
          <s-section title="Cart Revenue">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <MetricCard
                label="Total Cart Value"
                value={money(data.totalCartValue)}
                sub={`${data.checkouts} carts reached checkout`}
                note="Cart value at checkout (not confirmed revenue)"
                color="#111"
              />
              <MetricCard
                label="Avg Cart Value"
                value={money(data.avgCartValue)}
                sub="per checkout"
                color="#6366f1"
              />
              <MetricCard
                label="Upsell Cart Impact"
                value={money(data.upsellCartImpact)}
                sub={`${data.upsellAdds} upsells added`}
                note="Estimated — carts with upsells"
                color="#059669"
              />
              <MetricCard
                label="Conversion Rate"
                value={data.conversionRate + "%"}
                sub={`${data.checkouts} of ${data.cartOpens} cart opens`}
                color="#d97706"
              />
            </div>

            <div style={{ background: "#fff", border: "1.5px solid #f0f0f0", borderRadius: 14, padding: "20px 22px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#374151" }}>
                Cart Value at Checkout — last {data.days} days
              </p>
              {data.peakDay && (
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9ca3af" }}>
                  Peak day: {data.peakDay} ({money(data.peakDayValue)})
                </p>
              )}
              <BarChart data={data.dailyRevenue} days={data.days} />
            </div>
          </s-section>

          <s-section title="Engagement">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              <MetricCard label="Cart Opens" value={data.cartOpens.toLocaleString()} sub={`last ${data.days} days`} />
              <MetricCard label="Reached Checkout" value={data.checkouts.toLocaleString()} sub="customers clicked checkout" color="#6366f1" />
              <MetricCard label="Upsells Added" value={data.upsellAdds.toLocaleString()} sub="by customers" color="#059669" />
              <MetricCard label="Free Gifts Claimed" value={data.freebieAdds.toLocaleString()} sub="freebies auto-added" color="#ec4899" />
            </div>
          </s-section>

          {data.topUpsells.length > 0 && (
            <s-section title="Top Upsell Products">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.topUpsells.map((u, i) => (
                  <ProductRow
                    key={u.vid}
                    rank={i}
                    productTitle={u.productTitle}
                    variantTitle={u.variantTitle}
                    vid={u.vid}
                    count={u.count}
                    countLabel="add"
                    color="#059669"
                  />
                ))}
              </div>
            </s-section>
          )}

          {data.topFreebies.length > 0 && (
            <s-section title="Top Free Gifts Claimed">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.topFreebies.map((f, i) => (
                  <ProductRow
                    key={f.vid}
                    rank={i}
                    productTitle={f.productTitle}
                    variantTitle=""
                    vid={f.vid}
                    count={f.count}
                    countLabel="claim"
                    color="#ec4899"
                  />
                ))}
              </div>
            </s-section>
          )}
        </>
      )}

      <s-section>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
          📌 Tracks: cart opens, checkouts (with cart value at that moment), upsell adds, and freebie claims. "Cart value at checkout" is what was in the cart when the customer clicked Checkout — actual collected revenue may differ due to discounts or abandoned carts.
        </p>
      </s-section>
    </s-page>
  );
}
