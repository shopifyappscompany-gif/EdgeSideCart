-- AlterTable: add storefrontToken column for Storefront API-based discount validation
ALTER TABLE "CartSettings" ADD COLUMN "storefrontToken" TEXT;
