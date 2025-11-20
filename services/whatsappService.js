// services/whatsappService.js
import whatsappPkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = whatsappPkg;

let client = null;
let readyPromise = null;
let isResetting = false;
let lastEvent = { when: null, name: null, info: null };

// FIX WAJIB (HANYA INI YANG DIPAKAI)
const AUTH_DIR = "/var/www/wo-app-backend/session";

export function initWhatsApp() {
  if (client) return readyPromise;

  console.log("🔐 Using LocalAuth at:", AUTH_DIR);

  const authStrategy = new LocalAuth({
    dataPath: AUTH_DIR,
  });

  client = new Client({
    authStrategy,
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    console.log("📲 WhatsApp requires QR scan");
    qrcode.generate(qr, { small: true });
    lastEvent = { when: new Date(), name: "qr", info: null };
  });

  client.on("authenticated", () => {
    console.log("🔐 WhatsApp authenticated - session stored");
    lastEvent = { when: new Date(), name: "authenticated", info: null };
  });

  client.on("ready", () => {
    console.log("✅ WhatsApp client ready");
    lastEvent = { when: new Date(), name: "ready", info: null };
  });

  client.on("auth_failure", (msg) => {
    console.error("❌ WhatsApp auth failure:", msg);
    scheduleReset("auth_failure");
  });

  client.on("disconnected", (reason) => {
    console.warn("⚠️ WhatsApp disconnected:", reason);
    scheduleReset("disconnected");
  });

  readyPromise = client.initialize();
  return readyPromise;
}

export function getWhatsAppStatus() {
  return {
    hasClient: Boolean(client),
    isResetting,
    lastEvent,
  };
}

function scheduleReset(reason) {
  if (isResetting) return;
  isResetting = true;

  console.log(`♻️ Scheduling WhatsApp reset (${reason})`);

  setTimeout(async () => {
    try {
      await resetWhatsApp();
    } finally {
      isResetting = false;
    }
  }, 1500);
}

export async function destroyWhatsApp() {
  if (!client) return;

  try {
    console.log("🛑 Destroying WhatsApp client…");
    await client.destroy();
  } catch (err) {
    console.warn("Error destroying client:", err?.message);
  }

  client = null;
  readyPromise = null;
}

export async function resetWhatsApp() {
  // ❗ FIX PENTING: Jangan hapus AUTH_DIR
  // Folder ini menyimpan sesi WA. Kalau dihapus → QR ulang.
  await destroyWhatsApp();

  console.log("♻️ Reinitializing WhatsApp (session preserved)");
  return initWhatsApp();
}

function normalizePhoneToE164(phone) {
  if (!phone) return null;

  let p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "62" + p.slice(1);

  return p;
}

export async function sendWhatsAppMessage(phone, text) {
  if (!client) throw new Error("WhatsApp client not initialized");

  const phoneE164 = normalizePhoneToE164(phone);
  if (!phoneE164) throw new Error("Invalid phone number");

  const chatId = `${phoneE164}@c.us`;

  await readyPromise;

  try {
    const message = await client.sendMessage(chatId, text);
    return { success: true, result: message, phoneE164 };
  } catch (err) {
    return { success: false, error: err.message, phoneE164 };
  }
}
