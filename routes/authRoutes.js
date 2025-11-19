import express from "express";
import { login } from "../controllers/authController.js";
import { switchOrganization } from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/switch-org", verifyToken, switchOrganization);


export default router;
