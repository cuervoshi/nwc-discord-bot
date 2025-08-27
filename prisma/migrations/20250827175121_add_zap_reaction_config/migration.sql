-- AlterTable
ALTER TABLE "public"."accounts" ADD COLUMN     "zapReaction_amount" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "zapReaction_enabled" BOOLEAN NOT NULL DEFAULT false;
