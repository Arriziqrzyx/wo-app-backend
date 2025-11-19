// controllers/workOrderController.js
import WorkOrder from "../models/WorkOrder.js";
import Department from "../models/Department.js";
import User from "../models/User.js";
import ChatMessage from "../models/ChatMessage.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";

export const createWorkOrder = async (req, res) => {
  try {
    const { departmentId, title, description, incidentDate } = req.body;
    const requesterId = req.user.id;
    const organization = req.user.activeOrganization;

    // 🔹 Simpan path file upload (jika ada)
    const attachments =
      req.files?.map((file) => `/uploads/workorders/${file.filename}`) || [];

    // Ambil departemen tujuan
    const targetDept = await Department.findById(departmentId);
    if (!targetDept)
      return res.status(400).json({ message: "Target department not found" });

    if (targetDept.organization !== organization) {
      return res.status(400).json({
        message: `Invalid target department. Must be in your active organization (${organization})`,
      });
    }

    const requester = await User.findById(requesterId).populate("departments");
    const requesterDept = requester.departments.find(
      (d) => d.organization === organization
    );
    if (!requesterDept)
      return res.status(400).json({
        message: "Requester department not found in active organization",
      });

    const requesterDeptData = await Department.findById(requesterDept._id);

    let initialStatus, notifToUserId;
    if (req.user.role === "supervisor") {
      initialStatus = "WAITING_TARGET_REVIEW";
      notifToUserId = targetDept.supervisorId;
    } else {
      initialStatus = "WAITING_SUPERVISOR_APPROVAL";
      notifToUserId = requesterDeptData.supervisorId;
    }

    const wo = await WorkOrder.create({
      organization,
      requesterDepartmentId: requesterDeptData._id,
      departmentId,
      requesterId,
      title,
      description,
      incidentDate,
      attachments, // ✅ simpan foto upload
      status: initialStatus,
      history: [
        {
          action: "CREATE",
          toStatus: initialStatus,
          note: "Work order created by requester",
          performedBy: requesterId,
          role: req.user.role,
        },
      ],
    });

    // ----- After creating WO: send WA to notifToUserId (supervisor)
    try {
      if (notifToUserId) {
        const notifUser = await User.findById(notifToUserId);
        if (notifUser && notifUser.phone) {
          const phone = notifUser.phone; // 08xxx

          const lines = [];
          lines.push("> 📢 *[NOTIF] Work Order*");
          lines.push("");
          lines.push(`*WO Number:* ${wo.woNumber}`);
          lines.push(`*Title:* ${wo.title}`);
          lines.push(`*Status:* \`\`\`${wo.status}\`\`\``); // triple backtick
          lines.push("");
          lines.push(`Sent to: ${notifUser?.name || "Supervisor"} 👈`);
          lines.push(`*By:* ${requester.name || requesterId}`);
          if (wo.note) {
            lines.push(`*Note:* ${wo.note}`);
          }
          lines.push("");
          lines.push("`Ini adalah pesan otomatis`");

          const text = lines.join("\n");

          // send WA
          const sendResult = await sendWhatsAppMessage(phone, text).catch(
            (e) => ({ success: false, error: e?.message || e })
          );

          // save chat log
          const chat = await ChatMessage.create({
            workOrderId: wo._id,
            toUserId: notifUser._id,
            phone: phone,
            phoneE164: sendResult.phoneE164 || null,
            message: text,
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
    } catch (err) {
      console.error("❌ WA notify error:", err);
    }

    res
      .status(201)
      .json({ message: "Work order created successfully", data: wo });
  } catch (error) {
    console.error("❌ Create WO error:", error);
    res.status(500).json({ message: "Failed to create work order" });
  }
};

// ============================================
// 📄 GET DETAIL WORK ORDER BY ID
// ============================================
export const getWorkOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Ambil WO lengkap — populate relasi yang benar
    const wo = await WorkOrder.findById(id)
      .populate("requesterId", "name role") // jangan populate departmentId di requesterId (User schema tidak punya departmentId)
      .populate("requesterDepartmentId", "name code organization supervisorId")
      .populate("departmentId", "name code organization supervisorId")
      .populate("assignedStaffIds", "name role")
      .populate("history.performedBy", "name role")
      .populate("history.affectedStaffIds", "name role"); // <- penting

    if (!wo) {
      return res.status(404).json({ message: "Work order not found" });
    }

    // ==========================
    // 🔒 Validasi akses
    // ==========================
    if (user.role !== "admin") {
      // 🚧 Cek organisasi
      if (wo.organization !== user.activeOrganization) {
        return res.status(403).json({
          message: "Access denied: cross-organization not allowed",
        });
      }

      // 🚧 Staff hanya boleh melihat WO yang dia buat atau ditugaskan
      if (user.role === "staff") {
        const isRequester =
          wo.requesterId && wo.requesterId._id.equals(user.id);
        const isAssigned =
          Array.isArray(wo.assignedStaffIds) &&
          wo.assignedStaffIds.some((staff) => staff._id.equals(user.id));

        if (!isRequester && !isAssigned) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // 🚧 Supervisor: hanya boleh melihat WO dari/untuk departemen yang dia awasi
      if (user.role === "supervisor") {
        // Ambil semua departemen yang dia awasi oleh supervisor ini di organisasi aktif
        const supervisorDepts = await Department.find({
          supervisorId: user.id,
          organization: user.activeOrganization,
        }).select("_id");

        if (!supervisorDepts.length) {
          return res.status(403).json({
            message: "Supervisor department not found in this organization",
          });
        }

        const deptIds = supervisorDepts.map((d) => d._id.toString());
        const requesterDeptId = wo.requesterDepartmentId?._id?.toString();
        const targetDeptId = wo.departmentId?._id?.toString();

        const inScope =
          (requesterDeptId && deptIds.includes(requesterDeptId)) ||
          (targetDeptId && deptIds.includes(targetDeptId));

        if (!inScope) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
    }

    // ==========================
    // 🎯 Tentukan konteks supervisor (requester / target)
    // ==========================
    let supervisorRoleContext = null;
    if (user.role === "supervisor") {
      // reuse query yang sama: departemen mana yang dia awasi
      const supervisorDepts = await Department.find({
        supervisorId: user.id,
        organization: user.activeOrganization,
      }).select("_id");

      const deptIds = supervisorDepts.map((d) => d._id.toString());
      const requesterDeptId = wo.requesterDepartmentId?._id?.toString();
      const targetDeptId = wo.departmentId?._id?.toString();

      if (requesterDeptId && deptIds.includes(requesterDeptId)) {
        supervisorRoleContext = "requester";
      } else if (targetDeptId && deptIds.includes(targetDeptId)) {
        supervisorRoleContext = "target";
      }
    }

    // ✅ Response akhir
    res.status(200).json({
      message: "Work order detail fetched successfully",
      wo,
      supervisorRoleContext, // frontend dapat gunakan ini untuk menentukan UI apa yang ditampilkan
    });
  } catch (error) {
    console.error("❌ Get WO detail error:", error);
    res.status(500).json({ message: "Failed to fetch work order detail" });
  }
};

// ============================================
// 📄 GET ALL WORK ORDERS (for dashboard view)
// ============================================
export const getAllWorkOrders = async (req, res) => {
  try {
    const user = req.user;
    const filter = { isDeleted: false, organization: user.activeOrganization };

    if (user.role === "staff") {
      // WO yang dibuat oleh dirinya atau ditugaskan kepadanya
      filter.$or = [{ requesterId: user.id }, { assignedStaffIds: user.id }];
    } else if (user.role === "supervisor") {
      // Ambil semua departemen yang dia supervisi di organisasi aktif
      const depts = await Department.find({
        supervisorId: user.id,
        organization: user.activeOrganization,
      }).select("_id");

      if (depts.length === 0) {
        return res.status(404).json({
          message:
            "No department found for this supervisor in active organization",
        });
      }

      const deptIds = depts.map((d) => d._id);
      filter.$or = [
        { requesterDepartmentId: { $in: deptIds } },
        { departmentId: { $in: deptIds } },
      ];
    } else if (user.role === "admin") {
      // Admin global: tidak perlu filter tambahan
    }

    const workOrders = await WorkOrder.find(filter)
      .populate("requesterId", "name role")
      .populate("departmentId", "name code organization")
      .populate("requesterDepartmentId", "name code organization")
      .populate("assignedStaffIds", "name role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Work orders fetched successfully",
      total: workOrders.length,
      data: workOrders,
    });
  } catch (error) {
    console.error("❌ Get all WO error:", error);
    res.status(500).json({ message: "Failed to fetch work orders" });
  }
};
