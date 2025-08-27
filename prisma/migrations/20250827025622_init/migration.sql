-- CreateTable
CREATE TABLE "public"."accounts" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "discord_username" TEXT NOT NULL,
    "nwc_uri" TEXT NOT NULL,
    "bot_nwc_uri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."faucets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_username" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "claimersIds" TEXT[],
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faucets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ranks" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_discord_id_key" ON "public"."accounts"("discord_id");

-- AddForeignKey
ALTER TABLE "public"."faucets" ADD CONSTRAINT "faucets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."accounts"("discord_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ranks" ADD CONSTRAINT "ranks_discord_id_fkey" FOREIGN KEY ("discord_id") REFERENCES "public"."accounts"("discord_id") ON DELETE RESTRICT ON UPDATE CASCADE;
