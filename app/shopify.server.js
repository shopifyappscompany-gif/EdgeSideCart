import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/* ── Billing plan names — used as keys everywhere ── */
export const PLAN_GROWTH     = "Growth";   // $7/mo — up to 200 orders
export const PLAN_ENTERPRISE = "Scale";    // $19/mo — 200+ orders, unlimited
/* Starter is free — no Shopify subscription needed */

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: (process.env.SCOPES || "read_products,write_products,read_discounts,read_publications").split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  /* Billing API config — v1.x requires the line-items format (a flat
     amount/currencyCode/interval throws "Invalid billing configuration … must
     be … a subscription plan with line items"). */
  billing: {
    [PLAN_GROWTH]: {
      trialDays: 7,
      lineItems: [
        {
          amount: 7.00,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [PLAN_ENTERPRISE]: {
      trialDays: 7,
      lineItems: [
        {
          amount: 19.00,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
