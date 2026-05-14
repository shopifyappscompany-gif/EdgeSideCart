-- Comprehensive migration: adds all columns not covered by previous migrations.
-- Every statement uses IF NOT EXISTS so it is safe to run multiple times.

-- ── Display / UX ─────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "scrollableItems"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "showLineItemProperties" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "customCartIconSelector" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "clickableLineItems"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "addToCartBehavior"      TEXT    NOT NULL DEFAULT 'drawer';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "addToCartToastSeconds"  INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "orderSummaryEnabled"    BOOLEAN NOT NULL DEFAULT true;

-- ── One-Click Upsell (OCU) ───────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuEnabled"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuHeading"          TEXT    NOT NULL DEFAULT 'Complete your order';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuLabel"            TEXT    NOT NULL DEFAULT 'Add to your order';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuHideWhenInCart"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuProductVariantId" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuProductTitle"     TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuProductImageUrl"  TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "ocuProductPrice"     INTEGER NOT NULL DEFAULT 0;

-- ── Billing plan ─────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "planName"    TEXT    NOT NULL DEFAULT 'starter';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freeForever" BOOLEAN NOT NULL DEFAULT false;

-- ── Free Shipping Progress Bar ───────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freeShippingBarEnabled"   BOOLEAN          NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freeShippingThreshold"    DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freeShippingText"         TEXT             NOT NULL DEFAULT 'Add {{amount}} more for FREE shipping!';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freeShippingUnlockedText" TEXT             NOT NULL DEFAULT 'You''ve unlocked free shipping!';

-- ── Trust Badges ─────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "trustBadgesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "trustBadges"        TEXT    NOT NULL DEFAULT '[]';

-- ── Sticky Add-to-Cart ───────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "stickyAtcEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "stickyAtcText"    TEXT    NOT NULL DEFAULT 'Add to Cart';

-- ── Express Checkout ─────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "expressCheckoutEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "expressCheckoutShopPay"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "expressCheckoutApplePay"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "expressCheckoutGooglePay" BOOLEAN NOT NULL DEFAULT false;

-- ── Volume Discounts ─────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "volumeDiscountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "volumeDiscountTitle"   TEXT    NOT NULL DEFAULT 'Buy more, save more!';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "volumeDiscounts"       TEXT    NOT NULL DEFAULT '[]';

-- ── Gift Wrap ────────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapEnabled"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapHeading"          TEXT    NOT NULL DEFAULT 'Gift Options';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapLabel"            TEXT    NOT NULL DEFAULT 'Add gift wrap';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapHideWhenInCart"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapProductVariantId" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapProductTitle"     TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapProductImageUrl"  TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "giftWrapPrice"            INTEGER NOT NULL DEFAULT 0;

-- ── Stock Scarcity on Line Items ─────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "stockScarcityEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "stockScarcityThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "stockScarcityText"      TEXT    NOT NULL DEFAULT 'Only {{count}} left!';

-- ── Recently Viewed (empty cart) ─────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "recentlyViewedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "recentlyViewedTitle"   TEXT    NOT NULL DEFAULT 'You might also like';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "recentlyViewedLimit"   INTEGER NOT NULL DEFAULT 4;

-- ── Cart Share Link ──────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "cartShareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "cartShareText"    TEXT    NOT NULL DEFAULT 'Share your cart';

-- ── Freebie show at top toggle ───────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "freebieShowAtTop" BOOLEAN NOT NULL DEFAULT false;

-- ── Cart Recovery / WhatsApp Share ──────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "cartRecoveryEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "cartRecoveryWhatsApp" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "cartRecoveryMessage"  TEXT    NOT NULL DEFAULT 'Check out my cart: {{url}}';

-- ── Delivery Date Estimator ──────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "deliveryEstimatorEnabled" BOOLEAN          NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "deliveryMinDays"          INTEGER          NOT NULL DEFAULT 3;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "deliveryMaxDays"          INTEGER          NOT NULL DEFAULT 7;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "deliveryMessage"          TEXT             NOT NULL DEFAULT 'Estimated delivery: {{date_range}}';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "deliveryCutoffHour"       INTEGER          NOT NULL DEFAULT 14;

-- ── Rotating Announcements ───────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "announcementsEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "announcements"         TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "announcementInterval"  INTEGER NOT NULL DEFAULT 4;

-- ── Product Page Features ────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageSocialProofEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageSocialProofText"     TEXT    NOT NULL DEFAULT '🔥 {{count}} people bought this today';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageSocialProofMin"      INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageSocialProofMax"      INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageSocialProofInterval" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageScarcityEnabled"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageVolumeTableEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageFreebieTeaser"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageUpsellEnabled"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageUpsellTitle"         TEXT    NOT NULL DEFAULT 'Customers Also Bought';
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageUpsellLimit"         INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CartSettings" ADD COLUMN IF NOT EXISTS "productPageUpsellProducts"      TEXT    NOT NULL DEFAULT '[]';
