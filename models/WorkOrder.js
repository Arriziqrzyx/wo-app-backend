// models/WorkOrder.js
import mongoose from "mongoose";
import Department from "./Department.js";
import WorkOrderCounter from "./WorkOrderCounter.js";

const workOrderSchema = new mongoose.Schema(
  {
    organization: { type: String, enum: ["YPP", "GD", "EEE"], required: true },

    // ❗ Department pembuat/requester
    requesterDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    // Department tujuan
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: { type: String, required: true },
    description: { type: String, required: true },
    incidentDate: { type: Date, required: true },
    attachments: [{ type: String }], // foto attachment dari requester
    resultPhotos: [{ type: String }], // foto hasil pekerjaan dari staff

    status: {
      type: String,
      enum: [
        "WAITING_SUPERVISOR_APPROVAL",
        "REJECTED_BY_SUPERVISOR",
        "APPROVED_BY_SUPERVISOR",
        "WAITING_TARGET_REVIEW",
        "REJECTED_BY_TARGET_SUPERVISOR",
        "ASSIGNED_TO_STAFF",
        "IN_PROGRESS",
        "WAITING_REQUESTER_CONFIRMATION",
        "CLOSED",
      ],
      default: "WAITING_SUPERVISOR_APPROVAL",
    },

    assignedStaffIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    woNumber: { type: String, unique: true },

    history: [
      {
        action: String,
        fromStatus: String,
        toStatus: String,
        note: String,
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        affectedStaffIds: [
          { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        ],
        role: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ==================================================
// 🔢 Auto-generate WO number dari counter berdasarkan
//    requesterDepartmentId
// ==================================================
workOrderSchema.pre("save", async function (next) {
  if (!this.isNew) return next();

  const requesterDept = await Department.findById(this.requesterDepartmentId);
  if (!requesterDept) throw new Error("Requester department not found");

  // Atomic increment di counter sesuai organization + department requester
  const counter = await WorkOrderCounter.findOneAndUpdate(
    { organization: this.organization, departmentId: requesterDept._id },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const padded = String(counter.seq).padStart(3, "0");
  // this.woNumber = `WO/${padded}/${this.organization}/${requesterDept.code}`;
  this.woNumber = `WO/${this.organization}/${requesterDept.code}/${padded}`;
  next();
});

export default mongoose.model("WorkOrder", workOrderSchema);
