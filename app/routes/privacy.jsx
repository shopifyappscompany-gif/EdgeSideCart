/* Public route — no authentication required.
   Register this URL in Partner Dashboard → App Setup → Privacy Policy URL
   URL: https://your-app-url.com/privacy
*/
export const loader = () => {
  return new Response(null, { status: 200 });
};

const s = {
  page: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "48px 24px 80px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#1f2937",
    lineHeight: 1.7,
  },
  logo: { fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 8 },
  date: { fontSize: 13, color: "#9ca3af", marginBottom: 48 },
  h1: { fontSize: 32, fontWeight: 900, margin: "0 0 6px", color: "#111" },
  h2: { fontSize: 18, fontWeight: 700, margin: "40px 0 12px", color: "#111" },
  p: { margin: "0 0 16px", fontSize: 15, color: "#374151" },
  li: { marginBottom: 8, fontSize: 15, color: "#374151" },
  link: { color: "#2563eb" },
  divider: { border: "none", borderTop: "1px solid #e5e7eb", margin: "40px 0" },
};

export default function Privacy() {
  return (
    <div style={s.page}>
      <div style={s.logo}>EdgeCart</div>
      <h1 style={s.h1}>Privacy Policy</h1>
      <p style={s.date}>Last updated: May 2026</p>

      <p style={s.p}>
        EdgeCart ("we", "our", or "us") is a Shopify app that adds a slide-in side
        cart drawer to Shopify storefronts. This Privacy Policy explains what data we
        collect, how we use it, and your rights.
      </p>

      <h2 style={s.h2}>1. Data We Collect</h2>
      <p style={s.p}>When a merchant installs EdgeCart, we collect and store:</p>
      <ul>
        <li style={s.li}><strong>Shop domain</strong> — to identify the merchant store (e.g. example.myshopify.com).</li>
        <li style={s.li}><strong>Access token</strong> — OAuth token issued by Shopify to call Admin APIs on the merchant's behalf. Stored encrypted in our database.</li>
        <li style={s.li}><strong>Cart settings</strong> — configuration data the merchant saves (colors, banner text, discount codes, upsell products, freebie settings, etc.). No customer personal data is included.</li>
        <li style={s.li}><strong>Support messages</strong> — name and message text submitted via the in-app Help & Support form. Used only to respond to the merchant.</li>
      </ul>
      <p style={s.p}>
        On the customer (storefront) side, EdgeCart reads the Shopify cart session via
        the Shopify AJAX Cart API (<code>/cart.js</code>). This happens entirely
        client-side in the customer's browser. We do not store any cart data, customer
        names, email addresses, or payment information on our servers.
      </p>

      <h2 style={s.h2}>2. How We Use Data</h2>
      <ul>
        <li style={s.li}>To render the side cart drawer with the merchant's configuration.</li>
        <li style={s.li}>To authenticate API calls to Shopify on the merchant's behalf (e.g. creating freebie products).</li>
        <li style={s.li}>To respond to merchant support requests.</li>
        <li style={s.li}>To manage billing subscriptions via Shopify's Billing API.</li>
      </ul>
      <p style={s.p}>We do not sell, rent, or share merchant or customer data with third parties for marketing purposes.</p>

      <h2 style={s.h2}>3. Data Storage & Security</h2>
      <p style={s.p}>
        Merchant settings and session tokens are stored in a secure SQLite/PostgreSQL
        database hosted on our servers. In production, data is stored on servers with
        industry-standard encryption at rest and in transit (TLS/HTTPS).
        Access tokens are never exposed to end customers.
      </p>

      <h2 style={s.h2}>4. Third-Party Services</h2>
      <ul>
        <li style={s.li}><strong>Shopify</strong> — All storefront cart operations use Shopify's own AJAX Cart API. Customer checkout is handled entirely by Shopify.</li>
        <li style={s.li}><strong>Gmail (SMTP)</strong> — Support messages submitted through the app are forwarded to our support email via Gmail. No customer data is transmitted.</li>
        <li style={s.li}><strong>Calendly</strong> — The Help page links to Calendly for demo booking. Calendly's own privacy policy applies when you visit their site.</li>
      </ul>

      <h2 style={s.h2}>5. GDPR & Customer Data Rights</h2>
      <p style={s.p}>
        EdgeCart complies with Shopify's mandatory GDPR webhooks:
      </p>
      <ul>
        <li style={s.li}><strong>Customer data request</strong> — We respond to data access requests within 30 days. Since we do not store customer personal data, the response will confirm no data is held.</li>
        <li style={s.li}><strong>Customer data erasure</strong> — We process erasure requests immediately. No customer personal data is held.</li>
        <li style={s.li}><strong>Shop data erasure</strong> — When a merchant uninstalls EdgeCart, all their CartSettings and session data are permanently deleted from our database within 48 hours.</li>
      </ul>

      <h2 style={s.h2}>6. Data Retention</h2>
      <p style={s.p}>
        Merchant cart settings and configuration are retained while the app is installed.
        Upon uninstallation, all data is deleted automatically via our
        <code>app/uninstalled</code> webhook handler.
        Support messages are retained for up to 12 months and then deleted.
      </p>

      <h2 style={s.h2}>7. Cookies</h2>
      <p style={s.p}>
        EdgeCart does not set any tracking cookies. The side cart uses
        <code>sessionStorage</code> in the customer's browser only to remember whether
        the cart was open before a page redirect. This data never leaves the customer's
        browser and is cleared when the browser tab is closed.
      </p>

      <h2 style={s.h2}>8. Children's Privacy</h2>
      <p style={s.p}>
        EdgeCart is a B2B tool for Shopify merchants. We do not knowingly collect
        data from persons under the age of 16.
      </p>

      <h2 style={s.h2}>9. Changes to This Policy</h2>
      <p style={s.p}>
        We may update this policy from time to time. Material changes will be
        communicated via the app admin or email. Continued use of EdgeCart after
        changes constitutes acceptance of the updated policy.
      </p>

      <h2 style={s.h2}>10. Contact</h2>
      <p style={s.p}>
        For privacy questions or data requests, contact us at:{" "}
        <a href="mailto:shopifyappscompany@gmail.com" style={s.link}>
          shopifyappscompany@gmail.com
        </a>
      </p>

      <hr style={s.divider} />
      <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center" }}>
        © 2026 EdgeCart — SwiftCartUpsell. All rights reserved.
      </p>
    </div>
  );
}
