-- AlterTable: merchant scheduled a downgrade to Free (keeps plan until Shopify period ends)
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "pendingDowngrade" BOOLEAN NOT NULL DEFAULT false;
