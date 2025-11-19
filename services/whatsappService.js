// services/whatsappService.js
import whatsappPkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// `whatsapp-web.js` is distributed as CommonJS; default import gives the
// module object in ESM. Destructure to get Client and LocalAuth. Some older
// installs may not include LocalAuth, so we fallback gracefully.
const { Client, LocalAuth } = whatsappPkg;

let client;
let readyPromise;
let isResetting = false;
let lastEvent = { when: null, name: null, info: null };

export function initWhatsApp() {
  if (client) return readyPromise;

  const authStrategy =
    typeof LocalAuth !== "undefined" ? new LocalAuth() : undefined;
  if (!authStrategy) {
    console.warn(
      "LocalAuth not available — WhatsApp session persistence may not work. Install a recent whatsapp-web.js version."
    );
  }

  client = new Client(authStrategy ? { authStrategy } : {});

  client.on("qr", (qr) => {
    // Tampilkan QR di console untuk pairing
    qrcode.generate(qr, { small: true });
    console.log("Scan the QR code above with WhatsApp mobile app");
    lastEvent = { when: new Date(), name: "qr", info: null };
  });

  client.on("authenticated", (session) => {
    console.log("WhatsApp authenticated - session saved");
    lastEvent = { when: new Date(), name: "authenticated", info: null };
  });

  client.on("loading_screen", (percent, message) => {
    console.log(`WhatsApp loading: ${percent}% - ${message}`);
    lastEvent = {
      when: new Date(),
      name: "loading_screen",
      info: { percent, message },
    };
  });

  client.on("change_state", (state) => {
    console.log("WhatsApp change_state:", state);
    lastEvent = { when: new Date(), name: "change_state", info: state };
  });

  client.on("ready", () => {
    console.log("✅ WhatsApp client ready");
  });

  client.on("auth_failure", (msg) => {
    console.error("WhatsApp auth failure:", msg);
    // try to reset session after auth failure so QR appears again
    scheduleReset("auth_failure");
    lastEvent = { when: new Date(), name: "auth_failure", info: msg };
  });

  client.on("disconnected", (reason) => {
    console.warn("WhatsApp disconnected:", reason);
    scheduleReset("disconnected");
    lastEvent = { when: new Date(), name: "disconnected", info: reason };
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
  console.log(`Scheduling WhatsApp reset due to ${reason}`);
  isResetting = true;
  // wait a bit to allow events to settle, then reset
  setTimeout(async () => {
    try {
      await resetWhatsApp();
    } catch (err) {
      console.error("Failed to reset WhatsApp client:", err?.message || err);
    } finally {
      isResetting = false;
    }
  }, 1500);
}

export async function destroyWhatsApp() {
  try {
    if (client) {
      await client.destroy();
      client = null;
      readyPromise = null;
    }
  } catch (err) {
    console.warn(
      "Error while destroying WhatsApp client:",
      err?.message || err
    );
  }
}

export async function resetWhatsApp() {
  // destroy client first
  await destroyWhatsApp();

  // remove local auth folder if present
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const authDir = path.join(__dirname, "..", ".wwebjs_auth");
    await fs.rm(authDir, { recursive: true, force: true });
    console.log("Removed WhatsApp auth folder:", authDir);
  } catch (err) {
    // If file locked, warn and rethrow to let caller decide (or swallow)
    console.warn(
      "Failed to remove auth folder (may be locked):",
      err?.message || err
    );
  }

  // reinit client (this will show QR again)
  return initWhatsApp();
}

function normalizePhoneToE164(phone) {
  if (!phone) return null;
  // keep only digits and plus
  let p = phone.replace(/[^0-9+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  // if starts with 0 (local format like 08...), convert to 62
  if (p.startsWith("0")) {
    p = "62" + p.slice(1);
  }
  // if already starts with 62, keep
  return p;
}

export async function sendWhatsAppMessage(phone, text) {
  if (!client) throw new Error("WhatsApp client not initialized");

  const phoneE164 = normalizePhoneToE164(phone);
  if (!phoneE164) throw new Error("Invalid phone number");

  const chatId = `${phoneE164}@c.us`;

  // Ensure client ready
  await readyPromise;

  try {
    const message = await client.sendMessage(chatId, text);
    return { success: true, result: message, phoneE164 };
  } catch (err) {
    return { success: false, error: err.message || err, phoneE164 };
  }
}
