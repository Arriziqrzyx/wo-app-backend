import WorkOrder from "../models/WorkOrder.js";
import Department from "../models/Department.js";
import User from "../models/User.js";
import ChatMessage from "../models/ChatMessage.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

// ==========================================================
// 🔹 SUPERVISOR PEMOHON (Requester's Supervisor) APPROVE/REJECT
// ==========================================================
export const approveOrRejectWorkOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== "supervisor") {
      return res
        .status(403)
        .json({ message: "Only supervisors can perform this action" });
    }

    const wo = await WorkOrder.findById(id);
    if (!wo) return res.status(404).json({ message: "Work order not found" });
    if (wo.status !== "WAITING_SUPERVISOR_APPROVAL") {
      return res
        .status(400)
        .json({ message: "Work order not waiting for supervisor approval" });
    }

    // Ambil data department pembuat WO (requester)
    const requesterDept = await Department.findById(wo.requesterDepartmentId);
    if (!requesterDept) {
      return res
        .status(400)
        .json({ message: "Requester department not found" });
    }

    // Pastikan supervisor ini adalah supervisor dari department pembuat
    if (String(requesterDept.supervisorId) !== String(userId)) {
      return res
        .status(403)
        .json({ message: "You are not authorized to approve this work order" });
    }

    let newStatus, historyNote, targetUserId;

    if (action === "reject") {
      newStatus = "REJECTED_BY_SUPERVISOR";
      historyNote = note || "Rejected by supervisor";
    } else if (action === "approve") {
      newStatus = "WAITING_TARGET_REVIEW";
      historyNote = "Approved by supervisor";

      // kirim ke supervisor departemen tujuan
      const targetDept = await Department.findById(wo.departmentId);
      targetUserId = targetDept?.supervisorId;
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    // Update WO
    wo.status = newStatus;
    wo.history.push({
      action: action.toUpperCase(),
      fromStatus: "WAITING_SUPERVISOR_APPROVAL",
      toStatus: newStatus,
      note: historyNote,
      performedBy: userId,
      role: "supervisor",
    });

    await wo.save();

    // Kirim notifikasi WA (protected: tetap tidak gagal jika WA error)
    try {
      // ============================
      // APPROVE → Notif ke targetUser
      // ============================
      if (action === "approve" && targetUserId) {
        const targetUser = await User.findById(targetUserId);
        const sender = await User.findById(userId);

        const lines = [];
        lines.push("> 📢 *[NOTIF] Work Order*");
        lines.push("");
        lines.push(`*WO Number:* ${wo.woNumber}`);
        lines.push(`*Title:* ${wo.title}`);
        lines.push(`*Status:* \`\`\`${newStatus}\`\`\``);
        lines.push("");
        lines.push(`Sent to: ${targetUser?.name || "unknown"} 👈`);
        lines.push(`*By:* ${sender?.name || "supervisor"}`);
        lines.push("");
        lines.push("`Ini adalah pesan otomatis`");

        const messageText = lines.join("\n");

        const sendResult = await sendWhatsAppMessage(
          targetUser.phone,
          messageText
        ).catch((e) => ({ success: false, error: e?.message || e }));

        await ChatMessage.create({
          workOrderId: wo._id,
          toUserId: targetUser._id,
          phone: targetUser.phone,
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

      // ============================
      // REJECT → Notif ke requester
      // ============================
      if (action === "reject") {
        const requesterUser = await User.findById(wo.requesterId);
        const sender = await User.findById(userId);

        if (requesterUser && requesterUser.phone) {
          const lines = [];
          lines.push("> 📢 *[NOTIF] Work Order*");
          lines.push("");
          lines.push(`*WO Number:* ${wo.woNumber}`);
          lines.push(`*Title:* ${wo.title}`);
          lines.push(`*Status:* \`\`\`${newStatus}\`\`\``);
          lines.push("");
          lines.push(`Sent to: ${requesterUser?.name || "requester"} 👈`);
          lines.push(`*By:* ${sender?.name || "supervisor"}`);
          if (note) lines.push(`*Note:* ${note}`);
          lines.push("");
          lines.push("`Ini adalah pesan otomatis`");

          const messageText = lines.join("\n");

          const sendResult = await sendWhatsAppMessage(
            requesterUser.phone,
            messageText
          ).catch((e) => ({ success: false, error: e?.message || e }));

          await ChatMessage.create({
            workOrderId: wo._id,
            toUserId: requesterUser._id,
            phone: requesterUser.phone,
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
    } catch (waErr) {
      console.error("❌ WA notify error (supervisor approve/reject):", waErr);
    }

    res.json({ message: `Work order ${action}d successfully`, wo });
  } catch (error) {
    console.error("❌ Supervisor approval error:", error);
    res.status(500).json({ message: "Failed to update work order" });
  }
};

// ==========================================================
// 🔹 SUPERVISOR TARGET (Target Dept) APPROVE/REJECT
// ==========================================================
export const approveOrRejectByTargetSupervisor = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note, assignedStaffIds } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== "supervisor") {
      return res
        .status(403)
        .json({ message: "Only target supervisors can perform this action" });
    }

    const wo = await WorkOrder.findById(id);
    if (!wo) return res.status(404).json({ message: "Work order not found" });
    if (wo.status !== "WAITING_TARGET_REVIEW") {
      return res
        .status(400)
        .json({ message: "Work order not waiting for target review" });
    }

    const targetDept = await Department.findById(wo.departmentId);
    if (!targetDept)
      return res.status(400).json({ message: "Target department not found" });

    // pastikan user ini supervisor dari department tujuan
    if (String(targetDept.supervisorId) !== String(userId)) {
      return res.status(403).json({
        message: "You are not the supervisor of this target department",
      });
    }

    let newStatus, historyNote;

    if (action === "reject") {
      newStatus = "REJECTED_BY_TARGET_SUPERVISOR";
      historyNote = note || "Rejected by target supervisor";
    } else if (action === "approve") {
      if (!Array.isArray(assignedStaffIds) || assignedStaffIds.length === 0) {
        return res.status(400).json({
          message: "assignedStaffIds array is required when approving",
        });
      }

      newStatus = "ASSIGNED_TO_STAFF";
      historyNote = note || "Assigned to IT staff";
      wo.assignedStaffIds = assignedStaffIds;
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    // Update status & history
    wo.status = newStatus;
    wo.history.push({
      action: action.toUpperCase(),
      fromStatus: "WAITING_TARGET_REVIEW",
      toStatus: newStatus,
      note: historyNote,
      performedBy: userId,
      affectedStaffIds: assignedStaffIds || [], // ✅ catat siapa yang ditugaskan
      role: "supervisor",
    });

    await wo.save();

    // Kirim notifikasi WA ke staff yang ditugaskan (approve) atau ke supervisor requester (reject)
    try {
      if (action === "approve") {
        // assignedStaffIds sudah diisi di atas
        const targetUsers = await User.find({ _id: { $in: assignedStaffIds } });
        for (const staff of targetUsers) {
          const sender = await User.findById(userId);
          const textLines = [];
          textLines.push("> 📢 *[NOTIF] Work Order*");
          textLines.push("");
          textLines.push(`*WO Number:* ${wo.woNumber}`);
          textLines.push(`*Title:* ${wo.title}`);
          textLines.push(`*Status:* \`\`\`${newStatus}\`\`\``);
          textLines.push("");
          textLines.push(`Sent to: ${staff?.name || "staff"} 👈`);
          textLines.push(`*By:* ${sender?.name || "supervisor"}`);
          if (historyNote) textLines.push(`*Note:* ${historyNote}`);
          textLines.push("");
          textLines.push("`Ini adalah pesan otomatis`");

          const messageText = textLines.join("\n");

          const sendResult = await sendWhatsAppMessage(
            staff.phone,
            messageText
          ).catch((e) => ({ success: false, error: e?.message || e }));

          await ChatMessage.create({
            workOrderId: wo._id,
            toUserId: staff._id,
            phone: staff.phone,
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
      } else if (action === "reject") {
        // Notify supervisor of requester department
        const requesterDept = await Department.findById(
          wo.requesterDepartmentId
        );
        const supId = requesterDept?.supervisorId;
        if (supId) {
          const supUser = await User.findById(supId);
          const sender = await User.findById(userId);
          if (supUser && supUser.phone) {
            const textLines = [];
            textLines.push("> 📢 *[NOTIF] Work Order*");
            textLines.push("");
            textLines.push(`*WO Number:* ${wo.woNumber}`);
            textLines.push(`*Title:* ${wo.title}`);
            textLines.push(`*Status:* \`\`\`${newStatus}\`\`\``);
            textLines.push("");
            textLines.push(`Sent to: ${supUser?.name || "supervisor"} 👈`);
            textLines.push(`*By:* ${sender?.name || "supervisor"}`);
            if (historyNote) textLines.push(`*Note:* ${historyNote}`);
            textLines.push("");
            textLines.push("`Ini adalah pesan otomatis`");

            const messageText = textLines.join("\n");
            const sendResult = await sendWhatsAppMessage(
              supUser.phone,
              messageText
            ).catch((e) => ({ success: false, error: e?.message || e }));

            await ChatMessage.create({
              workOrderId: wo._id,
              toUserId: supUser._id,
              phone: supUser.phone,
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
      }
    } catch (waErr) {
      console.error(
        "❌ WA notify error (target supervisor approve/reject):",
        waErr
      );
    }

    res.json({ message: `Work order ${action}d successfully`, wo });
  } catch (error) {
    console.error("❌ Target supervisor approval error:", error);
    res.status(500).json({ message: "Failed to update work order" });
  }
};
