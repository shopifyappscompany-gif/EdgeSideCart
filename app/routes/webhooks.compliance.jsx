import { authenticate } from "../shopify.server";

// Handles all 3 GDPR compliance webhooks:
// customers/data_request, customers/redact, shop/redact
// authenticate.webhook validates HMAC and returns 401 automatically if invalid.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[GDPR compliance] ${topic} for ${shop}`, payload);
  // EdgeCart stores no personal customer data — nothing to export or redact.
  return new Response(null, { status: 200 });
};
