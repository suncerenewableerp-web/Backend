import express from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { getRoles, getRoleMatrix, createRole, updateRole, deleteRole } from "../controllers/role.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.get('/public', asyncHandler(getRoles));

router.use(verifyToken);

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role?.name !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  next();
};

router.get('/', asyncHandler(getRoles));
router.get('/matrix', asyncHandler(getRoleMatrix));
router.post('/', requireAdmin, asyncHandler(createRole));
router.put('/:id', requireAdmin, asyncHandler(updateRole));
router.delete('/:id', requireAdmin, asyncHandler(deleteRole));

export default router;
