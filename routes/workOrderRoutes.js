import {
  createWorkOrder,
  getWorkOrderById,
  getAllWorkOrders,
} from "../controllers/workOrderController.js";
import { upload } from "../middleware/upload.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import express from "express";

const router = express.Router();

router.post("/", verifyToken, upload.array("attachments", 2), createWorkOrder);

// GET all WO for dashboard
router.get("/", verifyToken, getAllWorkOrders);

router.get("/:id", verifyToken, getWorkOrderById);

export default router;
