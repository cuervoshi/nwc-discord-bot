import RankingModel from "../schemas/RankSchema.js";
import { RankResult } from "../types/rank.js";

const createRank = async (discord_id: string, type: string, amount: number): Promise<RankResult | null> => {
  try {
    const newUserRank = new RankingModel({
      discord_id,
      type,
      amount,
    });
    const result = await newUserRank.save();

    return result as RankResult;
  } catch (err: any) {
    return null;
  }
};

const getRank = async (discord_id: string, type: string): Promise<RankResult | null> => {
  if (!discord_id) return null;

  try {
    const user_rank = await (RankingModel as any).findOne({
      discord_id,
      type,
    });
    if (user_rank) return user_rank as RankResult;
  } catch (err: any) {
    return null;
  }

  return null;
};

const updateUserRank = async (discord_id: string, type: string, new_amount: number): Promise<RankResult | null> => {
  try {
    const userRank = await getRank(discord_id, type);

    if (userRank) {
      userRank.amount = userRank.amount + new_amount;
      await userRank.save();

      return userRank;
    } else {
      const new_rank = await createRank(discord_id, type, new_amount);
      return new_rank;
    }
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const getTopRanking = async (type: string): Promise<RankResult[] | null> => {
  try {
    const topUsers = await (RankingModel as any).find({ type })
      .sort({ amount: -1 })
      .limit(10);

    return topUsers as RankResult[];
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const getSumOfDonationAmounts = async (type: string): Promise<number | null> => {
  try {
    const result = await (RankingModel as any).aggregate([
      { $match: { type: type } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);

    if (result.length > 0) return result[0].totalAmount;
    return 0;
  } catch (err: any) {
    console.error(err);
    return null;
  }
};

const trackSatsSent = async (discord_id: string, amount: number): Promise<RankResult | null> => {
  return await updateUserRank(discord_id, "sats_sent", amount);
};

export { getSumOfDonationAmounts, getTopRanking, updateUserRank, trackSatsSent };
