// controllers/workOrderController.js
import WorkOrder from "../models/WorkOrder.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import ChatMessage from "../models/ChatMessage.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import fs from "fs";
import path from "path";

// Pastikan multer di route sudah menaruh file di req.files
// misal: upload.array("files", 5)

export const updateWorkOrderProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const wo = await WorkOrder.findById(id);
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    let fromStatus = wo.status;
    let newStatus;
    let historyNote = note || "";
    let notifToUserIds = [];

    // Check apakah user termasuk staff assigned
    const isAssignedStaff =
      Array.isArray(wo.assignedStaffIds) &&
      wo.assignedStaffIds.some((staffId) => String(staffId) === String(userId));

    // Helper: cari supervisor untuk assigned staff (mengembalikan array supervisorId unik)
    const findSupervisorsForAssignedStaff = async () => {
      if (
        !Array.isArray(wo.assignedStaffIds) ||
        wo.assignedStaffIds.length === 0
      )
        return [];

      // Ambil semua staff yang ditugaskan beserta departmentIds mereka
      const staffs = await User.find({
        _id: { $in: wo.assignedStaffIds },
      }).select("departments");
      const deptIds = [];
      staffs.forEach((s) => {
        if (Array.isArray(s.departments))
          s.departments.forEach((d) => deptIds.push(String(d)));
      });

      if (deptIds.length === 0) return [];

      // Ambil department yang relevan (filter unik)
      const uniqueDeptIds = [...new Set(deptIds)];
      const depts = await Department.find({
        _id: { $in: uniqueDeptIds },
      }).select("_id supervisorId");
      const supIds = new Set();
      depts.forEach((d) => {
        if (d && d.supervisorId) supIds.add(String(d.supervisorId));
      });

      return Array.from(supIds);
    };

    // === 1️⃣ Staff mulai kerja ===
    if (action === "START_WORK") {
      if (userRole !== "staff" || !isAssignedStaff)
        return res
          .status(403)
          .json({ message: "You are not assigned to this work order" });
      if (wo.status !== "ASSIGNED_TO_STAFF")
        return res
          .status(400)
          .json({ message: "Work order not in ASSIGNED_TO_STAFF state" });

      newStatus = "IN_PROGRESS";
      historyNote = note || "Staff started working on this WO";

      // Notifikasi ke supervisor dari staff yang ditugaskan
      const supIds = await findSupervisorsForAssignedStaff();
      notifToUserIds.push(...supIds);
    }

    // === 2️⃣ Staff minta konfirmasi (opsional upload foto) ===
    else if (action === "REQUEST_CONFIRMATION") {
      if (userRole !== "staff" || !isAssignedStaff)
        return res
          .status(403)
          .json({ message: "You are not assigned to this work order" });
      if (wo.status !== "IN_PROGRESS")
        return res.status(400).json({ message: "Work order not in progress" });

      newStatus = "WAITING_REQUESTER_CONFIRMATION";
      historyNote = note || "Staff requested confirmation from requester";
      notifToUserIds.push(wo.requesterId);

      // Proses foto hasil pekerjaan opsional
      if (req.files?.length) {
        const uploadedPaths = req.files.map((f) => {
          return "/uploads/woResults/" + f.filename; // langsung pakai dari multer
        });

        wo.resultPhotos.push(...uploadedPaths);
      }
    }

    // === 3️⃣ Requester konfirmasi selesai ===
    else if (action === "CONFIRM_COMPLETION") {
      if (String(wo.requesterId) !== String(userId))
        return res
          .status(403)
          .json({ message: "Only the requester can confirm" });
      if (wo.status !== "WAITING_REQUESTER_CONFIRMATION")
        return res
          .status(400)
          .json({ message: "Work order not waiting for confirmation" });

      newStatus = "CLOSED";
      historyNote = note || "Requester confirmed completion";
      // Notify supervisors of assigned staff AND supervisor of target department
      const supIds = await findSupervisorsForAssignedStaff();
      notifToUserIds.push(...supIds);
      // also include supervisor of the target department (wo.departmentId)
      if (wo.departmentId) {
        const targetDept = await Department.findById(wo.departmentId).select(
          "supervisorId"
        );
        if (targetDept && targetDept.supervisorId)
          notifToUserIds.push(String(targetDept.supervisorId));
      }
    }

    // === 4️⃣ Requester menolak hasil ===
    else if (action === "REJECT_RESULT") {
      if (String(wo.requesterId) !== String(userId))
        return res
          .status(403)
          .json({ message: "Only the requester can reject" });
      if (wo.status !== "WAITING_REQUESTER_CONFIRMATION")
        return res
          .status(400)
          .json({ message: "Work order not waiting for confirmation" });

      newStatus = "IN_PROGRESS";
      historyNote = note || "Requester rejected result, returned to IT staff";
      notifToUserIds = wo.assignedStaffIds;
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    // Update status dan histori
    wo.status = newStatus;
    wo.history.push({
      action,
      fromStatus,
      toStatus: newStatus,
      note: historyNote,
      performedBy: userId,
      affectedStaffIds: wo.assignedStaffIds || [], // affected staff selalu include assigned staff
      role: userRole,
      timestamp: new Date(),
    });

    await wo.save();

    // Kirim notifikasi WA ke user yang relevan dan simpan log
    try {
      const notifUsers = await User.find({ _id: { $in: notifToUserIds } });
      if (notifUsers.length) {
        const sender = await User.findById(userId);

        for (const u of notifUsers) {
          if (!u || !u.phone) continue;

          const lines = [];
          lines.push("> 📢 *[NOTIF] Work Order*");
          lines.push("");
          lines.push(`*WO Number:* ${wo.woNumber}`);
          lines.push(`*Title:* ${wo.title}`);
          lines.push(`*Status:* \`\`\`${newStatus}\`\`\``);
          lines.push("");

          // context-specific
          if (action === "START_WORK") {
            lines.push(`Sent to: ${u.name || "supervisor"} 👈`);
            lines.push(`*By:* ${sender?.name || "staff"}`);
            if (historyNote) lines.push(`*Note:* ${historyNote}`);
          } else if (action === "REQUEST_CONFIRMATION") {
            lines.push(`Sent to: ${u.name || "requester"} 👈`);
            lines.push(`*By:* ${sender?.name || "staff"}`);
            if (historyNote) lines.push(`*Note:* ${historyNote}`);
          } else if (action === "CONFIRM_COMPLETION") {
            lines.push(`Sent to: ${u.name || "supervisor"} 👈`);
            lines.push(`*By:* ${sender?.name || "requester"}`);
            if (historyNote) lines.push(`*Note:* ${historyNote}`);
          } else if (action === "REJECT_RESULT") {
            lines.push(`Sent to: ${u.name || "staff"} 👈`);
            lines.push(`*By:* ${sender?.name || "requester"}`);
            if (historyNote) lines.push(`*Note:* ${historyNote}`);
          }

          lines.push("");
          lines.push("`Ini adalah pesan otomatis`");

          const messageText = lines.join("\n");

          const sendResult = await sendWhatsAppMessage(
            u.phone,
            messageText
          ).catch((e) => ({ success: false, error: e?.message || e }));

          await ChatMessage.create({
            workOrderId: wo._id,
            toUserId: u._id,
            phone: u.phone,
            phoneE164: sendResult.phoneE164 || null,
            message: messageText,
            isAutomated: true,
            direction: "outgoing",
            status: sendResult.success ? "sent" : "failed",
            rawResult: sendResult.success
              ? sendResult.result
              : { error: sendResult.error },
            sentAt: sendResult.success ? new Date() : undefined,
          });
        }
      }
    } catch (notifyErr) {
      console.error("❌ WA notify error (work order progress):", notifyErr);
    }

    res.json({ message: `Work order ${action} success`, wo });
  } catch (error) {
    console.error("❌ updateWorkOrderProgress error:", error);
    res.status(500).json({ message: "Failed to update work order" });
  }
};
