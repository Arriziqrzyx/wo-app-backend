import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },

    role: {
      type: String,
      enum: ["admin", "requester", "supervisor", "staff"],
      default: "requester",
    },

    // organisasi yg user tergabung (array) — tetap dipakai
    organizations: [{ type: String, enum: ["YPP", "GD", "EEE"] }],

    // relasi ke Department document (Department sudah menyertakan organization)
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],

    // optional: organisasi preferensi / last active org (mempermudah UI saat login)
    preferredOrganization: { type: String, enum: ["YPP", "GD", "EEE"], default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
