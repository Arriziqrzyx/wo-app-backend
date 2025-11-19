import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logosDir = path.join(__dirname, "..", "uploads", "logos");

export const getLogos = async (req, res) => {
  try {
    const files = await fs.readdir(logosDir);
    const logos = files
      .filter((f) => !f.startsWith("."))
      .map((filename) => ({
        filename,
        url: `${req.protocol}://${req.get(
          "host"
        )}/uploads/logos/${encodeURIComponent(filename)}`,
      }));

    res.status(200).json({ logos });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to read logos directory", error: err.message });
  }
};
