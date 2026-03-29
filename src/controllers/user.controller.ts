import User from "../models/User.model";
import Role from "../models/Role.model";
import { asyncHandler } from "../middleware/error.middleware";
import { getPagination } from "../utils/helpers";

// @desc    Get all users
// @route   GET /api/users
export const getUsers = asyncHandler(async (req: any, res: any) => {
  const { page = 1, limit = 20 } = req.query;
  const { skip, limit: lim } = getPagination(page, limit);
  
  const users = await User.find({ isActive: true })
    .populate('role', 'name')
    .select('-password')
    .skip(skip)
    .limit(lim)
    .sort('-createdAt');
    
  const total = await User.countDocuments({ isActive: true });
  
  res.json({
    success: true,
    data: {
      users,
      pagination: { total, page: parseInt(page), limit: lim, pages: Math.ceil(total / lim) }
    }
  });
});

// @desc    Get engineers
// @route   GET /api/users/engineers
export const getEngineers = asyncHandler(async (req: any, res: any) => {
  const engineerRole = await Role.findOne({ name: 'ENGINEER' }).select('_id');
  if (!engineerRole) return res.json({ success: true, data: [] });

  const engineers = await User.find({ role: engineerRole._id, isActive: true })
    .populate('role', 'name')
    .select('-password')
    .sort('name');
    
  res.json({ success: true, data: engineers });
});
