import mongoose from "mongoose";

const workOrderCounterSchema = new mongoose.Schema(
  {
    organization: { type: String, required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

workOrderCounterSchema.index({ organization: 1, departmentId: 1 }, { unique: true });

export default mongoose.model("WorkOrderCounter", workOrderCounterSchema);
