import mongoose, { Schema, Document } from "mongoose";

export interface IRank extends Document {
  discord_id: string;
  type: string;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

const rankingSchema = new Schema<IRank>(
  {
    discord_id: { type: String, required: true },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.ranking ||
  mongoose.model<IRank>("ranking", rankingSchema);
