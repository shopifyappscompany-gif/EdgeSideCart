import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { sendSupportEmail } from "../email.server";

const CALENDLY_URL = "https://calendly.com/shopifyappscompany/30min";
const SUPPORT_EMAIL = "shopifyappscompany@gmail.com";
const OWNER_SHOP = "swiftcartupsell.myshopify.com";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const message = String(form.get("message") || "").trim();

  if (!name || !message) {
    return { error: "Please fill in your name and message." };
  }

  await prisma.supportMessage.create({
    data: { shop: session.shop, name, message },
  });

  try {
    await sendSupportEmail({ shop: session.shop, name, message });
  } catch (err) {
    console.error("[EdgeCart] Failed to send support email:", err.message);
  }

  return { success: true };
};

const styles = {
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardIcon: { fontSize: 36, lineHeight: 1 },
  cardTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" },
  cardDesc: { margin: 0, fontSize: 14, color: "#6b7280", lineHeight: 1.6, flex: 1 },
  cardBtn: {
    display: "inline-block",
    marginTop: 4,
    padding: "9px 18px",
    background: "#111827",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    textAlign: "center",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    color: "#111827",
    background: "#fff",
    boxSizing: "border-box",
    outline: "none",
  },
  submitBtn: {
    padding: "10px 24px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  successBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: 20,
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
  },
};

export default function HelpPage() {
  const { shop } = useLoaderData();
  const fetcher = useFetcher();
  const submitted = fetcher.data?.success;
  const error = fetcher.data?.error;
  const isOwner = shop === OWNER_SHOP;

  return (
    <s-page heading="Help & Support">
      {isOwner && (
        <s-button slot="primary-action" url="/app/support-inbox" variant="primary" suppressHydrationWarning>
          View Support Inbox
        </s-button>
      )}

      {/* Three action cards */}
      <s-section heading="How can we help you?">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {/* Send a Message */}
          <div style={styles.card}>
            <div style={styles.cardIcon}>💬</div>
            <h3 style={styles.cardTitle}>Send a Message</h3>
            <p style={styles.cardDesc}>
              Have a question or need help with setup? Fill out the form below and we'll get back to you shortly.
            </p>
            <a href="#msg-form" style={{ ...styles.cardBtn, background: "#2563eb" }}>
              Send Message
            </a>
          </div>

          {/* Schedule a Demo */}
          <div style={styles.card}>
            <div style={styles.cardIcon}>📅</div>
            <h3 style={styles.cardTitle}>Schedule a Demo</h3>
            <p style={styles.cardDesc}>
              Get a complete walkthrough of EdgeCart features and learn best practices to boost your store's average order value.
            </p>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.cardBtn, background: "#7c3aed" }}
            >
              Book a Call
            </a>
          </div>

          {/* Email Support */}
          <div style={styles.card}>
            <div style={styles.cardIcon}>✉️</div>
            <h3 style={styles.cardTitle}>Email Support</h3>
            <p style={styles.cardDesc}>
              Reach our support team directly. We typically respond within 24 hours on business days.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=EdgeCart Support — ${shop}`}
              style={{ ...styles.cardBtn, background: "#059669" }}
            >
              Email Us
            </a>
          </div>
        </div>
      </s-section>

      {/* Message form */}
      <s-section heading="Send us a message">
        <div id="msg-form" style={{ maxWidth: 560 }}>
          {submitted ? (
            <div style={styles.successBox}>
              <span style={{ fontSize: 28 }}>✅</span>
              <div>
                <strong style={{ fontSize: 15 }}>Message received!</strong>
                <p style={{ margin: "4px 0 0", color: "#166534", fontSize: 14 }}>
                  We'll review your message and get back to you soon. Thank you for reaching out!
                </p>
              </div>
            </div>
          ) : (
            <fetcher.Form method="POST">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={styles.label}>Your Name</label>
                  <input
                    name="name"
                    type="text"
                    placeholder="e.g. Jane Smith"
                    required
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Message</label>
                  <textarea
                    name="message"
                    placeholder="Describe your question or issue in detail..."
                    required
                    rows={5}
                    style={{ ...styles.input, resize: "vertical" }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  Submitted from: <strong>{shop}</strong>
                </div>
                {error && (
                  <p style={{ color: "#dc2626", margin: 0, fontSize: 14 }}>{error}</p>
                )}
                <div>
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle"}
                    style={{
                      ...styles.submitBtn,
                      opacity: fetcher.state !== "idle" ? 0.6 : 1,
                    }}
                  >
                    {fetcher.state !== "idle" ? "Sending…" : "Send Message"}
                  </button>
                </div>
              </div>
            </fetcher.Form>
          )}
        </div>
      </s-section>

      {/* Aside: quick tips */}
      <s-section slot="aside" heading="Quick Tips">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text fontWeight="bold">App Embed:</s-text> Enable EdgeCart in Themes → Customize → App Embeds.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Settings:</s-text> Configure banner, colors, and discount in General Settings.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Upsell:</s-text> Set up product upsells in the Upsell section.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Free Gift:</s-text> Configure freebies with progress bar in the Freebie section.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Contact">
        <s-stack direction="block" gap="tight">
          <s-paragraph>
            <s-text fontWeight="bold">Email:</s-text> {SUPPORT_EMAIL}
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Response time:</s-text> Within 24 hours
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">Demo calls:</s-text> Free 30-minute session
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
