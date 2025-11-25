import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import Department from "./models/Department.js";
import User from "./models/User.js";

dotenv.config();
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/wo-app";

// =============================
// DATA TEMPLATE
// =============================
const organizations = ["YPP", "GD", "EEE"];

// 🔧 ubah: sekarang field `staff` bisa array
const departmentTemplates = [
  {
    name: "Marketing",
    code: "MKT",
    spv: "Ana",
    staff: ["Nisa", "Nindy", "Claudia"],
  },
  {
    name: "Purchasing",
    code: "PCH",
    spv: "John",
    staff: ["Eka", "Siska", "Agriva", "Tomi", "Almi"],
  },
  {
    name: "Finance",
    code: "FIN",
    spv: "Yuni",
    staff: ["Indri", "Pipit", "Agela", "Akhsan"],
  },
  {
    name: "Logistics",
    code: "LOG",
    spv: "Yitno",
    staff: ["Sofyan", "Kelik", "Yayan", "Tantowi", "Yatimanto", "Nata"],
  },
  {
    name: "IT",
    code: "IT",
    spv: "Hendi",
    staff: ["Arriziq"],
  },
  { name: "GA", code: "GA", spv: "Hendi", staff: ["Tio", "Alex"] },
  { name: "HRD", code: "HRD", spv: "Hendi", staff: ["Amri"] },
  { name: "LEGAL", code: "LGL", spv: "Hendi", staff: ["Abraham"] },
  { name: "HSE", code: "HSE", spv: "Alwi", staff: ["Sultan"] },
  {
    name: "Project",
    code: "PRJ",
    spv: "Syamsul",
    staff: ["Fatimah", "Uung", "Cahyo", "Vino"],
  },
  { name: "Workshop", code: "WSP", spv: "Masudin", staff: ["Gunawan"] },
];

// =============================
// HELPER: create user hanya 1x per nama
// =============================
const findOrCreateUser = async ({ name, role }) => {
  const email = `${name.toLowerCase().replace(/\s+/g, "")}@mail.com`;
  let user = await User.findOne({ email });
  if (user) return user;

  const hashed = await bcrypt.hash("Alpacino@25", 10);
  user = await User.create({
    name,
    email,
    password: hashed,
    phone: "08123456789",
    role,
    organizations: [],
    departments: [],
    preferredOrganization: null,
  });
  return user;
};

// =============================
// MAIN SEED FUNCTION
// =============================
const seedData = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    await Department.deleteMany({});
    await User.deleteMany({});
    console.log("🧹 Cleared old data");

    // Buat semua user unik terlebih dahulu
    const personSet = new Set();
    departmentTemplates.forEach((d) => {
      personSet.add(d.spv);
      d.staff.forEach((s) => personSet.add(s));
    });

    const usersMap = {};
    for (const name of personSet) {
      usersMap[name] = await findOrCreateUser({ name, role: "requester" });
    }

    // Buat department untuk tiap organisasi
    for (const org of organizations) {
      console.log(`\n🏢 Seeding for organization: ${org}`);

      for (const d of departmentTemplates) {
        const supervisor = usersMap[d.spv];
        const dept = await Department.create({
          name: d.name,
          code: d.code,
          organization: org,
          supervisorId: supervisor._id,
          currentWoCounter: 0,
        });

        // Update supervisor
        if (!supervisor.departments.includes(dept._id)) {
          supervisor.departments.push(dept._id);
        }
        if (!supervisor.organizations.includes(org)) {
          supervisor.organizations.push(org);
        }
        supervisor.role = "supervisor";
        await supervisor.save();

        // Update semua staff di department ini
        for (const staffName of d.staff) {
          const staff = usersMap[staffName];

          if (!staff.departments.includes(dept._id)) {
            staff.departments.push(dept._id);
          }
          if (!staff.organizations.includes(org)) {
            staff.organizations.push(org);
          }
          if (staff.role === "requester") staff.role = "staff";
          await staff.save();

          console.log(
            `   ✅ ${d.name} (${org}) → Spv: ${d.spv}, Staff: ${staffName}`
          );
        }
      }
    }

    console.log("\n🎉 DONE: Seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
};

seedData();
