-- AlterTable: multiple freebie offers array + block /cart page setting
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freebieOffers" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "blockCartPage" BOOLEAN NOT NULL DEFAULT false;
