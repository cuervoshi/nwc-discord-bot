import { PrismaConfig } from "../utils/prisma.js";
import type { Faucet } from "../types/prisma.js";

const createFaucet = async (owner_id: string, owner_username: string, amount: number, maxUses: number): Promise<Faucet | null> => {
  try {
    const prisma = PrismaConfig.getClient();
    const result = await prisma.faucet.create({
      data: {
        owner_id,
        owner_username,
        amount,
        maxUses,
        channelId: "0",
        messageId: "0",
        claimersIds: [],
        closed: false,
      },
    });
    return result;
  } catch (err: any) {
    return null;
  }
};

const getFaucet = async (faucet_id: string): Promise<Faucet | null> => {
  if (!faucet_id) return null;

  try {
    const prisma = PrismaConfig.getClient();
    const faucet = await prisma.faucet.findUnique({
      where: { id: faucet_id },
    });

    return faucet;
  } catch (err: any) {
    return null;
  }
};

const getAllOpenFaucets = async (discord_id: string): Promise<Faucet[] | null> => {
  if (!discord_id) return null;

  try {
    const prisma = PrismaConfig.getClient();
    const faucets = await prisma.faucet.findMany({
      where: {
        owner_id: discord_id,
        closed: false,
      },
    });

    return faucets;
  } catch (err: any) {
    return null;
  }
};

const updateFaucetMessage = async (faucet: Faucet, channelId: string, lastMessageId: string): Promise<Faucet | null> => {
  try {
    if (!faucet) return null;

    const prisma = PrismaConfig.getClient();
    const updatedFaucet = await prisma.faucet.update({
      where: { id: faucet.id },
      data: {
        channelId,
        messageId: lastMessageId,
      },
    });

    return updatedFaucet;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const addClaimerOnFaucet = async (faucet_id: string, new_claimer: string): Promise<Faucet | null> => {
  try {
    const faucet = await getFaucet(faucet_id);
    if (!faucet) return null;

    const prisma = PrismaConfig.getClient();
    const updatedFaucet = await prisma.faucet.update({
      where: { id: faucet_id },
      data: {
        claimersIds: [...faucet.claimersIds, new_claimer],
      },
    });

    return updatedFaucet;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const closeFaucet = async (faucet_id: string): Promise<Faucet | null> => {
  try {
    const faucet = await getFaucet(faucet_id);
    if (!faucet) return null;

    const prisma = PrismaConfig.getClient();
    const updatedFaucet = await prisma.faucet.update({
      where: { id: faucet_id },
      data: {
        closed: true,
      },
    });

    return updatedFaucet;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

export {
  createFaucet,
  getFaucet,
  addClaimerOnFaucet,
  updateFaucetMessage,
  getAllOpenFaucets,
  closeFaucet,
};
