import { Document } from "mongoose";

export interface Faucet extends Document {
  _id: string;
  owner_id: string;
  owner_username: string;
  amount: number;
  maxUses: number;
  channelId: string;
  messageId: string;
  claimersIds: string[];
  closed: boolean;
}
