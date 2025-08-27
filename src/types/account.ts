import { Document } from "mongoose";

export interface Account extends Document {
  _id: string;
  discord_id: string;
  discord_username: string;
  nwc_uri: string;
  bot_nwc_uri?: string;
  createdAt: Date;
  updatedAt: Date;
}