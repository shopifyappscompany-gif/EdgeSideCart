-- AlterTable: add scarcity timer and tiered rewards fields
ALTER TABLE "CartSettings" ADD COLUMN "scarcityEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "scarcityText" TEXT NOT NULL DEFAULT '⏰ Offer ends in:';
ALTER TABLE "CartSettings" ADD COLUMN "scarcityMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "CartSettings" ADD COLUMN "scarcityBgColor" TEXT NOT NULL DEFAULT '#e53e3e';
ALTER TABLE "CartSettings" ADD COLUMN "scarcityTextColor" TEXT NOT NULL DEFAULT '#ffffff';
ALTER TABLE "CartSettings" ADD COLUMN "tieredRewardsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "tieredRewards" TEXT NOT NULL DEFAULT '[]';
