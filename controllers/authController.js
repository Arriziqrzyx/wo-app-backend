import User from "../models/User.js";
import Department from "../models/Department.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  try {
    const { email, password, organization } = req.body;

    // 1️⃣ Cek user
    const user = await User.findOne({ email }).populate("departments");
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2️⃣ Cek password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    // 3️⃣ Cek apakah user tergabung di organisasi yg diminta
    if (organization && !user.organizations.includes(organization)) {
      return res.status(403).json({
        message: `User tidak tergabung di organisasi ${organization}`,
      });
    }

    // 4️⃣ Tentukan organisasi aktif
    const activeOrganization =
      organization || user.preferredOrganization || user.organizations[0];

    // 5️⃣ Simpan preferred org (opsional, bisa skip kalau tidak ingin update)
    if (user.preferredOrganization !== activeOrganization) {
      user.preferredOrganization = activeOrganization;
      await user.save();
    }

    // 6️⃣ Buat JWT
    const token = jwt.sign(
      { id: user._id, name: user.name, role: user.role, activeOrganization },
      process.env.JWT_SECRET,
      { expiresIn: "90d" }
    );

    res.json({
      message: "Login success",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizations: user.organizations,
        activeOrganization,
        departments: user.departments.map((d) => ({
          id: d._id,
          name: d.name,
          org: d.organization,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const switchOrganization = async (req, res) => {
  try {
    const userId = req.user.id;
    const { organization } = req.body;

    if (!["YPP", "GD", "EEE"].includes(organization)) {
      return res.status(400).json({ message: "Invalid organization" });
    }

    const user = await User.findById(userId);
    if (!user.organizations.includes(organization)) {
      return res
        .status(403)
        .json({ message: "You are not part of this organization" });
    }

    // Update preferred org
    user.preferredOrganization = organization;
    await user.save();

    // Buat token baru dengan activeOrganization yang baru
    const token = jwt.sign(
      {
        id: user._id,
        name: user.name,
        role: user.role,
        activeOrganization: organization,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: `Switched to ${organization}`,
      token,
      activeOrganization: organization,
    });
  } catch (err) {
    console.error("Switch org error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
