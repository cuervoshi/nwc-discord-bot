import { Document } from "mongoose";

export interface RankResult extends Document {
  _id: string;
  discord_id: string;
  type: string;
  amount: number;
}
