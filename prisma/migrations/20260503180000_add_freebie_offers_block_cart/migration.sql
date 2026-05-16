-- AlterTable: multiple freebie offers array + block /cart page setting
ALTER TABLE "CartSettings" ADD COLUMN "freebieOffers" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN "blockCartPage" BOOLEAN NOT NULL DEFAULT false;
