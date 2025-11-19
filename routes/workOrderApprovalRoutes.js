// routes/workOrderApprovalRoutes.js
import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { approveOrRejectWorkOrder, approveOrRejectByTargetSupervisor } from "../controllers/workOrderApprovalController.js";

const router = express.Router();

router.put("/:id/supervisor", verifyToken, approveOrRejectWorkOrder);
router.put("/:id/target", verifyToken, approveOrRejectByTargetSupervisor);


export default router;
