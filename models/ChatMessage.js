import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder" },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    phone: { type: String, required: true }, // original phone as stored (e.g. 08...)
    phoneE164: { type: String }, // converted e.g. 6285...
    message: { type: String, required: true },
    isAutomated: { type: Boolean, default: true },
    direction: {
      type: String,
      enum: ["outgoing", "incoming"],
      default: "outgoing",
    },
    status: {
      type: String,
      enum: ["sent", "failed", "pending"],
      default: "pending",
    },
    rawResult: { type: mongoose.Schema.Types.Mixed },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("ChatMessage", chatMessageSchema);
