import Department from "../models/Department.js";
import User from "../models/User.js";

export const getDepartmentsByOrg = async (req, res) => {
  try {
    const { org } = req.params;

    const allowedNames = ["IT", "GA", "Workshop"];

    const departments = await Department.find({
      organization: org,
      name: { $in: allowedNames }, // filter hanya 3 nama ini
    }).select("_id name code organization supervisorId");

    res.json({ success: true, data: departments });
  } catch (error) {
    console.error("❌ getDepartmentsByOrg error:", error);
    res.status(500).json({ message: "Failed to fetch departments" });
  }
};

export const getStaffByDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // pastikan department valid
    const dept = await Department.findById(id);
    if (!dept) {
      return res.status(404).json({ message: "Department not found" });
    }

    // cari semua user staff aktif yang tergabung di department ini
    const staffs = await User.find({
      role: "staff",
      isActive: true,
      departments: id, // karena 'departments' adalah array of ObjectId
    }).select("_id name email phone organizations preferredOrganization");

    res.json({
      department: { id: dept._id, name: dept.name, code: dept.code },
      total: staffs.length,
      staffs,
    });
  } catch (error) {
    console.error("❌ Error getStaffByDepartment:", error);
    res.status(500).json({ message: "Failed to fetch staff list" });
  }
};
