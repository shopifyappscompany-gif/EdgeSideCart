# EdgeCart — Production Deployment Guide

> Current deployment: Railway (`https://edgecart-production.up.railway.app`)  
> Database: PostgreSQL (required for production — multi-tenant, concurrent writes)  
> App Client ID: `b5830ef0857b056c23608b0df3eedfca`

---

## Option A — Deploy on Railway (Already Active)

Railway is already configured and working. Use this section when redeploying or setting up a fresh Railway instancee.

### 1. Create PostgreSQL on Railway

1. Go to [railway.app](https://railway.app) → your project → **New** → **Database** → **PostgreSQL**
2. Click the PostgreSQL service → **Variables** tab → copy `DATABASE_URL`
   - Format: `postgresql://postgres:PASSWORD@HOST.railway.internal:5432/railway`

### 2. Set Environment Variables

In your Railway Web Service → **Variables** tab:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Internal PostgreSQL URL from step above |
| `SHOPIFY_API_KEY` | `b5830ef0857b056c23608b0df3eedfca` |
| `SHOPIFY_API_SECRET` | From Partner Dashboard → Apps → EdgeCart → API credentials |
| `SCOPES` | `read_products,write_products,read_discounts` |
| `NODE_ENV` | `production` |
| `SHOPIFY_APP_URL` | `https://edgecart-production.up.railway.app` |

### 3. Build & Start Commands

In Railway Web Service → **Settings**:

| Field | Value |
|---|---|
| Build Command | `npm run render-build` |
| Start Command | `npm run start` |

### 4. Push & Deploy

```bash
git add .
git commit -m "deploy"
git push origin main
```

Railway auto-deploys on push to `main`.

---

## Option B — Deploy on Render (Fresh Setup)

### Step 1: Create PostgreSQL on Render

1. [render.com](https://render.com) → **New +** → **PostgreSQL**
2. Fill in:
   - **Name:** `edgecart-db`
   - **Region:** Oregon (US West)
   - **Plan:** Starter ($7/mo)
3. Click **Create Database** — wait ~2 minutes
4. Open the database → **Info** tab → copy **Internal Database URL**
   ```
   postgresql://edgecart_db_user:PASSWORD@dpg-xxx.oregon-postgres.render.com/edgecart_db
   ```

### Step 2: Push Code to GitHub

Make sure all latest changes are committed and pushed:

```bash
git add prisma/migrations/ prisma/schema.prisma package.json
git commit -m "Add PostgreSQL migrations for production"
git push origin main
```

### Step 3: Create Web Service on Render

1. [render.com](https://render.com) → **New +** → **Web Service**
2. Connect GitHub → select the `edge-cart` repository
3. Configure:

| Field | Value |
|---|---|
| Name | `edgecart` |
| Region | Oregon (US West) — same region as DB |
| Branch | `main` |
| Runtime | Node |
| Build Command | `npm run render-build` |
| Start Command | `npm run start` |
| Plan | Starter ($7/mo) |

4. Do **not** deploy yet — set env vars first.

### Step 4: Set Environment Variables

In Render Web Service → **Environment** tab → **Add Environment Variable**:

| Key | Value |
|---|---|
| `DATABASE_URL` | Internal Database URL from Step 1 |
| `SHOPIFY_API_KEY` | `b5830ef0857b056c23608b0df3eedfca` |
| `SHOPIFY_API_SECRET` | From Partner Dashboard → Apps → EdgeCart → API credentials |
| `SCOPES` | `read_products,write_products,read_discounts` |
| `NODE_ENV` | `production` |
| `SHOPIFY_APP_URL` | `https://edgecart.onrender.com` (use your actual Render URL) |

> Your Render URL is shown at the top of the Web Service page.

### Step 5: Add Health Check

In Render Web Service → **Settings**:
- **Health Check Path:** `/`

This keeps the service alive and prevents cold starts.

### Step 6: Deploy

Click **Manual Deploy** → **Deploy latest commit**

Watch the logs — successful deploy looks like:
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL
5 migrations found in prisma/migrations
5 migrations applied ✓
> react-router-serve ./build/server/index.js
```

### Step 7: Update `shopify.app.toml`

Replace `https://edgecart-production.up.railway.app` with your Render URL everywhere:

```toml
client_id = "b5830ef0857b056c23608b0df3eedfca"
application_url = "https://edgecart.onrender.com"
embedded = true
name = "EdgeCart"

[access_scopes]
scopes = "read_products,write_products,read_discounts"

[app_proxy]
url = "https://edgecart.onrender.com"
subpath = "edge-cart"
prefix = "apps"

[auth]
redirect_urls = [
  "https://edgecart.onrender.com/auth/callback",
  "https://edgecart.onrender.com/auth/shopify/callback",
  "https://edgecart.onrender.com/api/auth"
]

[build]
include_config_on_deploy = true
automatically_update_urls_on_dev = true
```

### Step 8: Push Config to Shopify

```bash
shopify app deploy
```

This updates the Shopify Partner Dashboard with the new URL.

### Step 9: Update Partner Dashboard Manually

1. [partners.shopify.com](https://partners.shopify.com) → Apps → EdgeCart → **App setup**
2. **App URL:** `https://edgecart.onrender.com`
3. **Allowed redirection URLs:**
   ```
   https://edgecart.onrender.com/auth/callback
   https://edgecart.onrender.com/auth/shopify/callback
   https://edgecart.onrender.com/api/auth
   ```
4. **Save**

---

## Database Migrations

All migrations live in `prisma/migrations/`. They run automatically during deploy via `render-build`.

| Migration | What It Does |
|---|---|
| `20260425000000_init` | Creates `Session` and `CartSettings` tables |
| `20260426044709_add_auto_discount_notes_variant` | Adds auto-discount, order notes, variant display fields |
| `20260426083257_add_scarcity_tiered_rewards` | Adds scarcity timer and tiered rewards fields |
| `20260426162748_add_freebie_confetti` | Adds freebie confetti field |
| `20260428000000_add_ai_upsell_custom_code` | Adds AI upsell and custom CSS/JS fields |

### Adding a New Migration (after schema change)

```bash
# 1. Edit prisma/schema.prisma — add your new fields

# 2. Create the migration file
mkdir -p prisma/migrations/YYYYMMDDHHMMSS_describe_change
# Write the ALTER TABLE SQL in migration.sql

# 3. Regenerate Prisma client locally
npx prisma generate

# 4. Commit and push — migration runs automatically on next deploy
git add prisma/
git commit -m "Add migration: describe change"
git push origin main
```

---

## How 1000+ Merchants Are Stored

Each merchant gets exactly one row in `CartSettings`, keyed by their shop domain:

```
CartSettings
├── shop = "store-a.myshopify.com"  → all settings for Store A
├── shop = "store-b.myshopify.com"  → all settings for Store B
└── shop = "store-c.myshopify.com"  → all settings for Store C
```

**Flow when a merchant installs:**
1. OAuth completes → `Session` row created (framework handles this automatically)
2. Merchant opens app → `loader` calls `prisma.cartSettings.findUnique({ where: { shop } })`
3. If no row exists yet → returns `null` → UI shows defaults
4. Merchant saves settings → `prisma.cartSettings.upsert(...)` creates or updates their row

**Flow when a customer opens the side cart:**
1. Storefront JS calls `/apps/edge-cart` (Shopify App Proxy)
2. Server receives request with `shop` in query params (injected by Shopify)
3. `prisma.cartSettings.findUnique({ where: { shop } })` — single indexed lookup, ~1ms
4. Returns JSON → storefront renders that merchant's configured cart

**Scaling numbers:**
| Merchants | DB Size | Queries/day (est.) | PostgreSQL Plan |
|---|---|---|---|
| 0–500 | < 1 MB | < 500k | Starter ($7/mo) |
| 500–2000 | < 5 MB | < 2M | Standard ($20/mo) |
| 2000+ | < 20 MB | < 10M | Standard+ |

The bottleneck is never DB size — it's connection pool. Upgrade PostgreSQL plan when you see connection errors in logs.

---

## GDPR Webhooks (Required for App Store)

Register these manually in **Partner Dashboard → Apps → EdgeCart → App setup → GDPR webhooks**:

| Webhook | URL |
|---|---|
| Customer data request | `https://YOUR_APP_URL/webhooks/customers/data_request` |
| Customer redact | `https://YOUR_APP_URL/webhooks/customers/redact` |
| Shop redact | `https://YOUR_APP_URL/webhooks/shop/redact` |

---

## Re-installing the App (Required When Scopes Change)

If you add new scopes to `shopify.app.toml` (e.g. added `read_discounts`), existing merchants need to re-authorize. For your dev store:

1. **Partner Dashboard** → Dev Stores → `swiftcartupsell.myshopify.com` → Open
2. **Apps** → Uninstall EdgeCart
3. Go to your app URL → Install again → Approve new permissions

For App Store merchants, Shopify prompts them to re-authorize automatically when scopes change after an update.

---

## Quick Reference — Commands

```bash
# Local development
shopify app dev

# Build for production
npm run build

# Deploy schema changes (dev only)
npx prisma db push

# View database
npx prisma studio

# Deploy to Shopify Partner Dashboard
shopify app deploy

# Push to trigger Render/Railway redeploy
git push origin main
```
