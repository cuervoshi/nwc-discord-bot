import { Faucet } from "types/faucet.js";
import FaucetModel from "../schemas/FaucetSchema.js";

const createFaucet = async (owner_id: string, owner_username: string, amount: number, maxUses: number): Promise<Faucet | null> => {
  try {
    const newFaucet = new FaucetModel({
      owner_id,
      owner_username,
      amount,
      maxUses,
      channelId: 0,
      messageId: 0,
      claimersIds: [],
      closed: false,
    });

    const result = await newFaucet.save();
    return result as Faucet;
  } catch (err: any) {
    return null;
  }
};

const getFaucet = async (faucet_id: string): Promise<Faucet | null> => {
  if (!faucet_id) return null;

  try {
    const faucet = await (FaucetModel as any).findOne({
      _id: faucet_id,
    });

    if (faucet) return faucet as Faucet;
  } catch (err: any) {
    return null;
  }

  return null;
};

const getAllOpenFaucets = async (discord_id: string): Promise<Faucet[] | null> => {
  if (!discord_id) return null;

  try {
    const faucets = await (FaucetModel as any).find({
      owner_id: discord_id,
      closed: false,
    });

    if (faucets) return faucets as Faucet[];
  } catch (err: any) {
    return null;
  }

  return null;
};

const updateFaucetMessage = async (faucet: Faucet, channelId: string, lastMessageId: string): Promise<Faucet | null> => {
  try {
    if (!faucet) return null;

    faucet.channelId = channelId;
    faucet.messageId = lastMessageId;
    await faucet.save();

    return faucet;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const addClaimerOnFaucet = async (faucet_id: string, new_claimer: string): Promise<Faucet | null> => {
  try {
    const faucet = await getFaucet(faucet_id);
    if (!faucet) return null;

    faucet.claimersIds = [...faucet.claimersIds, new_claimer];
    await faucet.save();

    return faucet;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const closeFaucet = async (faucet_id: string): Promise<Faucet | null> => {
  try {
    const faucet = await getFaucet(faucet_id);
    if (!faucet) return null;

    faucet.closed = true;
    await faucet.save();

    return faucet;
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
