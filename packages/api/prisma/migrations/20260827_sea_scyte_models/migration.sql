-- CreateTable: Wallet
CREATE TABLE "Wallet" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "balanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: each user has at most one wallet
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- AddForeignKey: Wallet → User
ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: WalletTx
CREATE TABLE "WalletTx" (
    "id"          TEXT NOT NULL,
    "walletId"    TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "amountUsd"   DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTx_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: WalletTx → Wallet
ALTER TABLE "WalletTx"
  ADD CONSTRAINT "WalletTx_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Membership
CREATE TABLE "Membership" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tier"      TEXT NOT NULL DEFAULT 'free',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: each user has at most one membership row
CREATE UNIQUE INDEX "Membership_userId_key" ON "Membership"("userId");

-- AddForeignKey: Membership → User
ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ContentItem
CREATE TABLE "ContentItem" (
    "id"           TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "tags"         TEXT[] DEFAULT ARRAY[]::TEXT[],
    "licenseTerms" JSONB,
    "priceUsd"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock"        INTEGER,
    "metadata"     JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Order
CREATE TABLE "Order" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "totalUsd"  DOUBLE PRECISION NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: Order → User
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: OrderItem
CREATE TABLE "OrderItem" (
    "id"            TEXT NOT NULL,
    "orderId"       TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "quantity"      INTEGER NOT NULL DEFAULT 1,
    "priceUsd"      DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: OrderItem → Order
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: OrderItem → ContentItem
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_contentItemId_fkey"
  FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Device
CREATE TABLE "Device" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "revoked"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: device tokens must be unique
CREATE UNIQUE INDEX "Device_token_key" ON "Device"("token");

-- AddForeignKey: Device → User
ALTER TABLE "Device"
  ADD CONSTRAINT "Device_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: NewsArticle
CREATE TABLE "NewsArticle" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "tags"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: article slugs must be unique
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");
