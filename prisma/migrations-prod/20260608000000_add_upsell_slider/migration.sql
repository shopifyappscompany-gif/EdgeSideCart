-- AlterTable: toggle for the upsell carousel slider arrows
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "upsellSliderEnabled" BOOLEAN NOT NULL DEFAULT true;
