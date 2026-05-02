-- AlterTable: add AI upsell and custom code injection fields
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "aiUpsellEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "aiUpsellTitle" TEXT NOT NULL DEFAULT 'Customers Also Bought';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "aiUpsellIntent" TEXT NOT NULL DEFAULT 'related';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "aiUpsellLimit" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "customCss" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "customJs" TEXT NOT NULL DEFAULT '';
