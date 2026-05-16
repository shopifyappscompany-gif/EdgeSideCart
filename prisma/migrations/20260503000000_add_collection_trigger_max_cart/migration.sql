-- AlterTable: add collection triggers and max cart value for freebie/upsell
ALTER TABLE "CartSettings" ADD COLUMN "freebieTriggerCollectionIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN "freebieMaxCartValue" DOUBLE PRECISION;
ALTER TABLE "CartSettings" ADD COLUMN "upsellTriggerCollectionIds" TEXT NOT NULL DEFAULT '[]';
