# EdgeCart — Database Guide

## Stack
- **Local dev**: PostgreSQL via Render External URL
- **Production (Render)**: PostgreSQL via Render Internal URL
- **ORM**: Prisma

---

## One-Time Setup (First Time)

### 1. Add Render Postgres URL to local `.env`
Go to **Render → your Postgres service → Connect tab** and copy the **External Database URL**.

```
DATABASE_URL="postgresql://user:password@host:5432/edgecart_db?sslmode=require"
```

### 2. Delete old SQLite migrations
```bash
rm -rf prisma/migrations
```

### 3. Create fresh Postgres migration and apply it
```bash
npx prisma migrate dev --name init
npx prisma generate
```

This creates all tables in your Render Postgres database.

---

## Every Time You Change `schema.prisma`

Whenever a new field, model, or index is added to `prisma/schema.prisma`, run:

```bash
npx prisma migrate dev --name describe_your_change
npx prisma generate
```

**Examples of good migration names:**
```bash
npx prisma migrate dev --name add_gift_wrap_fields
npx prisma migrate dev --name add_cart_event_table
npx prisma migrate dev --name add_support_messages
```

This will:
1. Generate a new SQL migration file in `prisma/migrations/`
2. Apply it to your Render Postgres database immediately
3. Regenerate the Prisma client

---

## Deploying Schema Changes to Render (Production)

After running `migrate dev` locally, the migration file is saved in `prisma/migrations/`.  
When you push to Render, it runs `prisma migrate deploy` automatically during build (if configured).

### Make sure your `package.json` build script includes the migration:

```json
"build": "prisma migrate deploy && prisma generate && react-router build"
```

This ensures Render applies any pending migrations on every deploy automatically — no manual steps needed.

---

## Useful Commands

| Command | What it does |
|---|---|
| `npx prisma migrate dev --name <name>` | Create + apply new migration locally |
| `npx prisma migrate deploy` | Apply pending migrations (used in production) |
| `npx prisma generate` | Regenerate Prisma client after schema change |
| `npx prisma studio` | Open GUI to inspect database |
| `npx prisma migrate status` | Check which migrations are applied |
| `npx prisma db push` | Push schema without creating migration file (quick prototyping only) |

---

## Current Models

| Model | Purpose |
|---|---|
| `Session` | Shopify OAuth sessions (managed by framework) |
| `CartSettings` | Per-merchant cart configuration |
| `CartEvent` | Analytics events (cart_open, checkout, upsell_add, freebie_add) |
| `SupportMessage` | Help & support messages from merchants |

---

## Schema File
`prisma/schema.prisma`

---

## Notes
- Never edit files inside `prisma/migrations/` manually
- Always commit `prisma/migrations/` to git — Render needs them to run `migrate deploy`
- `.env` is gitignored — never commit it
- Render reads credentials from its own dashboard, not `.env`
