import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import { updateWorkOrderProgress } from "../controllers/workOrderProgressController.js";
import { uploadStaffResult } from "../middleware/uploadStaffResult.js";

const router = express.Router();

router.put(
  "/:id/progress",
  verifyToken,
  uploadStaffResult.array("files", 2), // optional files from staff
  updateWorkOrderProgress
);

export default router;
