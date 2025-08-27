import mongoose, { Schema } from "mongoose";
import { Account } from "types/account.js";

const accountSchema = new Schema<Account>({
  discord_id: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  discord_username: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  nwc_uri: { type: String, required: false },
  bot_nwc_uri: { type: String, required: false }
}, {
  timestamps: true
});

accountSchema.index({ discord_id: 1 }, { unique: true });
accountSchema.index({ discord_username: 1 }, { unique: true });

export default mongoose.models.accounts ||
  mongoose.model<Account>("accounts", accountSchema);
