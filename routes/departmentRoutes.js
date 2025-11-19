import express from "express";
import {
  getDepartmentsByOrg,
  getStaffByDepartment,
} from "../controllers/departmentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Endpoint baru untuk ambil departemen per organisasi
router.get("/by-org/:org", verifyToken, getDepartmentsByOrg);
router.get("/:id/staffs", verifyToken, getStaffByDepartment);

export default router;
