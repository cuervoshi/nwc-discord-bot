import mongoose, { Schema } from "mongoose";
import { Account } from "types/account.js";

const accountSchema = new Schema<Account>({
  discord_id: { type: String, required: true },
  discord_username: { type: String, required: true },
  nwc_uri: { type: String, required: false },
  bot_nwc_uri: { type: String, required: false }
});

export default mongoose.models.accounts ||
  mongoose.model<Account>("accounts", accountSchema);
