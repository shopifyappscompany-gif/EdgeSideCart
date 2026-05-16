-- AlterTable: add AI upsell and custom code injection fields
ALTER TABLE "CartSettings" ADD COLUMN "aiUpsellEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "aiUpsellTitle" TEXT NOT NULL DEFAULT 'Customers Also Bought';
ALTER TABLE "CartSettings" ADD COLUMN "aiUpsellIntent" TEXT NOT NULL DEFAULT 'related';
ALTER TABLE "CartSettings" ADD COLUMN "aiUpsellLimit" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "CartSettings" ADD COLUMN "customCss" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "customJs" TEXT NOT NULL DEFAULT '';
