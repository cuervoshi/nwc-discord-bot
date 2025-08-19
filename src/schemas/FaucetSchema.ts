import mongoose, { Schema, Document } from "mongoose";

export interface IFaucet extends Document {
  owner_id: string;
  owner_username: string;
  amount: number;
  maxUses: number;
  claimersIds: string[];
  channelId?: string;
  messageId?: string;
  closed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const faucetSchema = new Schema<IFaucet>(
  {
    owner_id: { type: String, required: true },
    owner_username: { type: String, required: true },
    amount: { type: Number, required: true },
    maxUses: { type: Number, required: true },
    claimersIds: [{ type: String, required: true }],
    channelId: { type: String, required: false },
    messageId: { type: String, required: false },
    closed: { type: Boolean, required: false },
  },
  { timestamps: true }
);

export default mongoose.models.faucets ||
  mongoose.model<IFaucet>("faucets", faucetSchema);
