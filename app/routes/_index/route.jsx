import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.logo}>🛒</div>
        <h1 className={styles.heading}>ZoomCart</h1>
        <p className={styles.tagline}>
          Slide-in side cart with upsells, free gifts &amp; discount codes —
          controlled entirely from your Shopify admin.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <div className={styles.inputWrap}>
              <label className={styles.label} htmlFor="shop">
                Your store domain
              </label>
              <input
                id="shop"
                className={styles.input}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                autoComplete="off"
                required
              />
            </div>
            <button className={styles.button} type="submit">
              Install ZoomCart →
            </button>
          </Form>
        )}

        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>⚡</span>
            <strong>Instant Side Cart</strong>
            <p>Opens on Add to Cart — no page redirects</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🎯</span>
            <strong>Smart Upsells</strong>
            <p>Trigger by cart value, quantity, or products</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🎁</span>
            <strong>Free Gift Engine</strong>
            <p>Progress bar + one-tap claim for customers</p>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>🏷️</span>
            <strong>Discount Codes</strong>
            <p>Applied seamlessly at checkout</p>
          </div>
        </div>

        <div className={styles.privacy}>
          <h2 className={styles.privacyHeading}>Privacy Policy</h2>
          <p className={styles.privacyUpdated}>Last updated: May 2025</p>

          <div className={styles.privacySection}>
            <h3>1. Information We Collect</h3>
            <p>
              ZoomCart collects only the information necessary to provide the side cart service to Shopify merchants:
            </p>
            <ul>
              <li><strong>Shop domain</strong> — used to identify your store and store your settings.</li>
              <li><strong>OAuth access token</strong> — granted by Shopify during installation, used to read product and shop data on your behalf.</li>
              <li><strong>Cart settings</strong> — configuration you enter in the app (colors, banner text, upsell products, freebie settings, discount codes). Stored in our database and served to your storefront.</li>
            </ul>
            <p>We do <strong>not</strong> collect, store, or process any personal data belonging to your customers (shoppers).</p>
          </div>

          <div className={styles.privacySection}>
            <h3>2. How We Use Your Information</h3>
            <ul>
              <li>To display and operate the ZoomCart side cart on your storefront.</li>
              <li>To save and retrieve the settings you configure in the ZoomCart admin panel.</li>
              <li>To create freebie products in your store via the Shopify Admin API when you use the Free Gift feature.</li>
            </ul>
            <p>We do not sell, rent, or share your data with any third parties for marketing purposes.</p>
          </div>

          <div className={styles.privacySection}>
            <h3>3. Data Storage & Security</h3>
            <p>
              Your settings and session tokens are stored in a secured database hosted on Render. We use industry-standard practices to protect your data, including encrypted connections (HTTPS/TLS) for all communication between your store, our servers, and Shopify's API.
            </p>
          </div>

          <div className={styles.privacySection}>
            <h3>4. Data Retention & Deletion</h3>
            <p>
              When you uninstall ZoomCart from your Shopify store, we automatically delete all settings and session data associated with your shop within 48 hours. You may also contact us at any time to request immediate data deletion.
            </p>
          </div>

          <div className={styles.privacySection}>
            <h3>5. Shopify's Role</h3>
            <p>
              ZoomCart is built on Shopify's platform and complies with the{" "}
              <a
                className={styles.privacyLink}
                href="https://www.shopify.com/legal/api-terms"
                target="_blank"
                rel="noreferrer"
              >
                Shopify API Terms of Service
              </a>
              {" "}and the{" "}
              <a
                className={styles.privacyLink}
                href="https://www.shopify.com/legal/partners"
                target="_blank"
                rel="noreferrer"
              >
                Shopify Partner Program Agreement
              </a>
              . Your store data is also governed by Shopify's own privacy policy.
            </p>
          </div>

          <div className={styles.privacySection}>
            <h3>6. GDPR</h3>
            <p>
              ZoomCart provides mandatory GDPR webhook endpoints as required by Shopify:
            </p>
            <ul>
              <li><strong>Customer data request</strong> — we confirm we hold no customer PII.</li>
              <li><strong>Customer data erasure</strong> — we confirm we hold no customer PII to erase.</li>
              <li><strong>Shop data erasure</strong> — all shop data is deleted upon uninstall or on request.</li>
            </ul>
          </div>

          <div className={styles.privacySection}>
            <h3>7. Contact</h3>
            <p>
              If you have any questions about this privacy policy or your data, please contact us at:{" "}
              <a className={styles.privacyLink} href="mailto:shopifyappscompany@gmail.com">
                shopifyappscompany@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
