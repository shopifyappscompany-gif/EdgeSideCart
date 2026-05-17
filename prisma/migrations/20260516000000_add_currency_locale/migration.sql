ALTER TABLE "CartSettings" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "CartSettings" ADD COLUMN "currencySymbol" TEXT NOT NULL DEFAULT '$';
ALTER TABLE "CartSettings" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "CartSettings" ADD COLUMN "cartRecoveryLabel" TEXT NOT NULL DEFAULT '💬 Send cart link via WhatsApp';
