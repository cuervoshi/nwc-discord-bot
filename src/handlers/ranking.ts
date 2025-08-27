import { PrismaConfig } from "../utils/prisma.js";
import type { Rank } from "../types/prisma.js";

const createRank = async (discord_id: string, type: string, amount: number): Promise<Rank | null> => {
  try {
    const prisma = PrismaConfig.getClient();
    const result = await prisma.rank.create({
      data: {
        discord_id,
        type,
        amount,
      },
    });

    return result;
  } catch (err: any) {
    return null;
  }
};

const getRank = async (discord_id: string, type: string): Promise<Rank | null> => {
  if (!discord_id) return null;

  try {
    const prisma = PrismaConfig.getClient();
    const user_rank = await prisma.rank.findFirst({
      where: {
        discord_id,
        type,
      },
    });

    return user_rank;
  } catch (err: any) {
    return null;
  }
};

const updateUserRank = async (discord_id: string, type: string, new_amount: number): Promise<Rank | null> => {
  try {
    const userRank = await getRank(discord_id, type);

    if (userRank) {
      const prisma = PrismaConfig.getClient();
      const updatedRank = await prisma.rank.update({
        where: { id: userRank.id },
        data: {
          amount: userRank.amount + new_amount,
        },
      });

      return updatedRank;
    } else {
      const new_rank = await createRank(discord_id, type, new_amount);
      return new_rank;
    }
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const getTopRanking = async (type: string): Promise<Rank[] | null> => {
  try {
    const prisma = PrismaConfig.getClient();
    const topUsers = await prisma.rank.findMany({
      where: { type },
      orderBy: { amount: 'desc' },
      take: 10,
    });

    return topUsers;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const getSumOfDonationAmounts = async (type: string): Promise<number | null> => {
  try {
    const prisma = PrismaConfig.getClient();
    const result = await prisma.rank.aggregate({
      where: { type },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount || 0;
  } catch (err: any) {
    console.error(err);
    return null;
  }
};

const trackSatsSent = async (discord_id: string, amount: number): Promise<Rank | null> => {
  return await updateUserRank(discord_id, "sats_sent", amount);
};

export { getSumOfDonationAmounts, getTopRanking, updateUserRank, trackSatsSent };
