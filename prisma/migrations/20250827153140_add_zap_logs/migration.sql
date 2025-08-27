-- CreateTable
CREATE TABLE "public"."zap_logs" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "zap_message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zap_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."zap_logs" ADD CONSTRAINT "zap_logs_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."accounts"("discord_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."zap_logs" ADD CONSTRAINT "zap_logs_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."accounts"("discord_id") ON DELETE RESTRICT ON UPDATE CASCADE;
