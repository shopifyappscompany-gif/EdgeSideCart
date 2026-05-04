-- AlterTable: add max quantity and AND/OR condition logic for freebie
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freebieMaxQuantity" INTEGER;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freebieConditionLogic" TEXT NOT NULL DEFAULT 'AND';
