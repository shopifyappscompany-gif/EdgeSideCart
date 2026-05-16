-- AlterTable: add max quantity and AND/OR condition logic for freebie
ALTER TABLE "CartSettings" ADD COLUMN "freebieMaxQuantity" INTEGER;
ALTER TABLE "CartSettings" ADD COLUMN "freebieConditionLogic" TEXT NOT NULL DEFAULT 'AND';
