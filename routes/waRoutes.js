import express from "express";
import { resetWhatsApp } from "../services/whatsappService.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { getWhatsAppStatus } from "../services/whatsappService.js";

const router = express.Router();

// POST /api/admin/wa/switch -> destroy session, remove auth files, reinit (show QR)
router.post("/switch", verifyToken, async (req, res) => {
  try {
    // basic role check: only admin allowed
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await resetWhatsApp();
    res.json({
      message: "WhatsApp session reset initiated. Scan QR to reconnect.",
    });
  } catch (err) {
    console.error("Error resetting WhatsApp:", err);
    res.status(500).json({
      message: "Failed to reset WhatsApp session",
      error: err?.message || err,
    });
  }
});

router.get("/status", verifyToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const status = getWhatsAppStatus();
    res.json({ status });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to get WA status", error: err?.message || err });
  }
});

export default router;
