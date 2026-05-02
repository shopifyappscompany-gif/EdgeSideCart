-- AlterTable: add auto-discount, order notes, and variant title display fields
ALTER TABLE "CartSettings" ADD COLUMN "autoDiscountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "autoDiscountCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "orderNotesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "showVariantTitle" BOOLEAN NOT NULL DEFAULT true;
