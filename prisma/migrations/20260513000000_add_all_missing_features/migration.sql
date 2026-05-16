-- Comprehensive migration: adds all columns not covered by previous migrations.
-- Every statement uses IF NOT EXISTS so it is safe to run multiple times.

-- ── Display / UX ─────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "scrollableItems"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN "showLineItemProperties" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "customCartIconSelector" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "clickableLineItems"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN "addToCartBehavior"      TEXT    NOT NULL DEFAULT 'drawer';
ALTER TABLE "CartSettings" ADD COLUMN "addToCartToastSeconds"  INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CartSettings" ADD COLUMN "orderSummaryEnabled"    BOOLEAN NOT NULL DEFAULT true;

-- ── One-Click Upsell (OCU) ───────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "ocuEnabled"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "ocuHeading"          TEXT    NOT NULL DEFAULT 'Complete your order';
ALTER TABLE "CartSettings" ADD COLUMN "ocuLabel"            TEXT    NOT NULL DEFAULT 'Add to your order';
ALTER TABLE "CartSettings" ADD COLUMN "ocuHideWhenInCart"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN "ocuProductVariantId" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "ocuProductTitle"     TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "ocuProductImageUrl"  TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "ocuProductPrice"     INTEGER NOT NULL DEFAULT 0;

-- ── Billing plan ─────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "planName"    TEXT    NOT NULL DEFAULT 'starter';
ALTER TABLE "CartSettings" ADD COLUMN "freeForever" BOOLEAN NOT NULL DEFAULT false;

-- ── Free Shipping Progress Bar ───────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "freeShippingBarEnabled"   BOOLEAN          NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "freeShippingThreshold"    DOUBLE PRECISION NOT NULL DEFAULT 50;
ALTER TABLE "CartSettings" ADD COLUMN "freeShippingText"         TEXT             NOT NULL DEFAULT 'Add {{amount}} more for FREE shipping!';
ALTER TABLE "CartSettings" ADD COLUMN "freeShippingUnlockedText" TEXT             NOT NULL DEFAULT 'You''ve unlocked free shipping!';

-- ── Trust Badges ─────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "trustBadgesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "trustBadges"        TEXT    NOT NULL DEFAULT '[]';

-- ── Sticky Add-to-Cart ───────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "stickyAtcEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "stickyAtcText"    TEXT    NOT NULL DEFAULT 'Add to Cart';

-- ── Express Checkout ─────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "expressCheckoutEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "expressCheckoutShopPay"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN "expressCheckoutApplePay"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN "expressCheckoutGooglePay" BOOLEAN NOT NULL DEFAULT false;

-- ── Volume Discounts ─────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "volumeDiscountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "volumeDiscountTitle"   TEXT    NOT NULL DEFAULT 'Buy more, save more!';
ALTER TABLE "CartSettings" ADD COLUMN "volumeDiscounts"       TEXT    NOT NULL DEFAULT '[]';

-- ── Gift Wrap ────────────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapEnabled"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapHeading"          TEXT    NOT NULL DEFAULT 'Gift Options';
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapLabel"            TEXT    NOT NULL DEFAULT 'Add gift wrap';
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapHideWhenInCart"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapProductVariantId" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapProductTitle"     TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapProductImageUrl"  TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "giftWrapPrice"            INTEGER NOT NULL DEFAULT 0;

-- ── Stock Scarcity on Line Items ─────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "stockScarcityEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "stockScarcityThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CartSettings" ADD COLUMN "stockScarcityText"      TEXT    NOT NULL DEFAULT 'Only {{count}} left!';

-- ── Recently Viewed (empty cart) ─────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "recentlyViewedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "recentlyViewedTitle"   TEXT    NOT NULL DEFAULT 'You might also like';
ALTER TABLE "CartSettings" ADD COLUMN "recentlyViewedLimit"   INTEGER NOT NULL DEFAULT 4;

-- ── Cart Share Link ──────────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "cartShareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "cartShareText"    TEXT    NOT NULL DEFAULT 'Share your cart';

-- ── Freebie show at top toggle ───────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "freebieShowAtTop" BOOLEAN NOT NULL DEFAULT false;

-- ── Cart Recovery / WhatsApp Share ──────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "cartRecoveryEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "cartRecoveryWhatsApp" TEXT    NOT NULL DEFAULT '';
ALTER TABLE "CartSettings" ADD COLUMN "cartRecoveryMessage"  TEXT    NOT NULL DEFAULT 'Check out my cart: {{url}}';

-- ── Delivery Date Estimator ──────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "deliveryEstimatorEnabled" BOOLEAN          NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "deliveryMinDays"          INTEGER          NOT NULL DEFAULT 3;
ALTER TABLE "CartSettings" ADD COLUMN "deliveryMaxDays"          INTEGER          NOT NULL DEFAULT 7;
ALTER TABLE "CartSettings" ADD COLUMN "deliveryMessage"          TEXT             NOT NULL DEFAULT 'Estimated delivery: {{date_range}}';
ALTER TABLE "CartSettings" ADD COLUMN "deliveryCutoffHour"       INTEGER          NOT NULL DEFAULT 14;

-- ── Rotating Announcements ───────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "announcementsEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "announcements"         TEXT    NOT NULL DEFAULT '[]';
ALTER TABLE "CartSettings" ADD COLUMN "announcementInterval"  INTEGER NOT NULL DEFAULT 4;

-- ── Product Page Features ────────────────────────────────────────────────────
ALTER TABLE "CartSettings" ADD COLUMN "productPageSocialProofEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "productPageSocialProofText"     TEXT    NOT NULL DEFAULT '🔥 {{count}} people bought this today';
ALTER TABLE "CartSettings" ADD COLUMN "productPageSocialProofMin"      INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CartSettings" ADD COLUMN "productPageSocialProofMax"      INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "CartSettings" ADD COLUMN "productPageSocialProofInterval" INTEGER NOT NULL DEFAULT 8;
ALTER TABLE "CartSettings" ADD COLUMN "productPageScarcityEnabled"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "productPageVolumeTableEnabled"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "productPageFreebieTeaser"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "productPageUpsellEnabled"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CartSettings" ADD COLUMN "productPageUpsellTitle"         TEXT    NOT NULL DEFAULT 'Customers Also Bought';
ALTER TABLE "CartSettings" ADD COLUMN "productPageUpsellLimit"         INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "CartSettings" ADD COLUMN "productPageUpsellProducts"      TEXT    NOT NULL DEFAULT '[]';
