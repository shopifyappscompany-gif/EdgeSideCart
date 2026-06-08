-- AlterTable: free-plan premium-feature trial length (days from install), editable per-shop
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "trialDays" INTEGER NOT NULL DEFAULT 45;
