import express from "express";
import { getLogos } from "../controllers/logoController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/logos/ -> returns list of logos with public URLs
router.get("/", verifyToken, getLogos);

export default router;
