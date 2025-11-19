import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // contoh: Purchasing
    code: { type: String, required: true, uppercase: true }, // contoh: PCH
    organization: { type: String, enum: ["YPP", "GD", "EEE"], required: true },

    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    currentWoCounter: { type: Number, default: 0 }, // auto increment per departemen
  },
  { timestamps: true }
);

// Mencegah duplikasi kode per organisasi
departmentSchema.index({ organization: 1, code: 1 }, { unique: true });

export default mongoose.model("Department", departmentSchema);
