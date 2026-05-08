import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    let shop = null;
    try {
      const { session } = await authenticate.public.appProxy(request);
      if (session?.shop) shop = session.shop;
    } catch (_) {}

    if (!shop) {
      const url = new URL(request.url);
      shop = url.searchParams.get("shop");
    }

    if (!shop) {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers: cors });
    }

    const body = await request.json().catch(() => ({}));
    const { event, revenue, variantId } = body;

    const VALID_EVENTS = ["cart_open", "checkout", "upsell_add", "freebie_add"];
    if (!VALID_EVENTS.includes(event)) {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers: cors });
    }

    await prisma.cartEvent.create({
      data: {
        shop,
        event,
        revenue: Math.round(Number(revenue) || 0),
        variantId: variantId ? String(variantId) : null,
      },
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
  } catch (err) {
    console.error("[EdgeCart] Track error:", err?.message);
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: cors });
  }
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
};
