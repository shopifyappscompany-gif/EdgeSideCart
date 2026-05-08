-- AlterTable: add collection triggers and max cart value for freebie/upsell
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freebieTriggerCollectionIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freebieMaxCartValue" DOUBLE PRECISION;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "upsellTriggerCollectionIds" TEXT NOT NULL DEFAULT '[]';
