-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "headerText" TEXT NOT NULL DEFAULT 'Your Cart',
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "bannerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bannerText" TEXT NOT NULL DEFAULT '🎉 Free shipping on orders over $50!',
    "bannerBgColor" TEXT NOT NULL DEFAULT '#1a1a1a',
    "bannerTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "discountEnabled" BOOLEAN NOT NULL DEFAULT true,
    "upsellEnabled" BOOLEAN NOT NULL DEFAULT false,
    "upsellTitle" TEXT NOT NULL DEFAULT 'You might also like',
    "upsellTriggerType" TEXT NOT NULL DEFAULT 'cartValue',
    "upsellMinCartValue" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "upsellMinQuantity" INTEGER NOT NULL DEFAULT 2,
    "upsellProducts" TEXT NOT NULL DEFAULT '[]',
    "upsellTriggerProductIds" TEXT NOT NULL DEFAULT '[]',
    "freebieEnabled" BOOLEAN NOT NULL DEFAULT false,
    "freebieTitle" TEXT NOT NULL DEFAULT '🎁 You''ve earned a free gift!',
    "freebieTriggerType" TEXT NOT NULL DEFAULT 'cartValue',
    "freebieMinCartValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "freebieMinQuantity" INTEGER NOT NULL DEFAULT 3,
    "freebieProductVariantId" TEXT,
    "freebieProductTitle" TEXT,
    "freebieProductImageUrl" TEXT,
    "freebieTriggerProductIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartSettings_shop_key" ON "CartSettings"("shop");
