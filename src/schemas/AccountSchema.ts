import mongoose, { Schema, Document } from "mongoose";

export interface IAccount extends Document {
  discord_id: string;
  discord_username: string;
  nwc_uri: string;
  bot_nwc_uri?: string;
}

const accountSchema = new Schema<IAccount>({
  discord_id: { type: String, required: true },
  discord_username: { type: String, required: true },
  nwc_uri: { type: String, required: false },
  bot_nwc_uri: { type: String, required: false }
});

export default mongoose.models.accounts ||
  mongoose.model<IAccount>("accounts", accountSchema);
