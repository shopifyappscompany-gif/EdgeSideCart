-- AlterTable: coupon list ("View all coupons") + auto-discount mode
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "offersEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "configuredDiscounts" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "autoDiscountMode" TEXT NOT NULL DEFAULT 'exact';
