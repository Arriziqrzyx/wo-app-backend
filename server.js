//server.js

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";

import workOrderRoutes from "./routes/workOrderRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import workOrderApprovalRoutes from "./routes/workOrderApprovalRoutes.js";
import workOrderProgressRoutes from "./routes/workOrderProgressRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import logoRoutes from "./routes/logoRoutes.js";
import { initWhatsApp } from "./services/whatsappService.js";
import waRoutes from "./routes/waRoutes.js";

dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static folder untuk file upload
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middleware dasar
app.use(
  cors({
    origin: "http://localhost:5173", // asal frontend React-mu
    credentials: true, // penting supaya cookie/token bisa dikirim
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/workorders", workOrderRoutes);
app.use("/api/workorders/approval", workOrderApprovalRoutes);
app.use("/api/workorders", workOrderProgressRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/logos", logoRoutes);
app.use("/api/admin/wa", waRoutes);

// Tes endpoint
app.get("/", (req, res) => {
  res.status(200).send("🚀 wo-app backend running successfully!");
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Jalankan server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Initialize WhatsApp client (scan QR on first run)
initWhatsApp().catch((err) => {
  console.error("Failed to initialize WhatsApp client:", err.message || err);
});
