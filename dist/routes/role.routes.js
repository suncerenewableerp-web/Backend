"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_controller_1 = require("../controllers/role.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const router = express_1.default.Router();
router.get('/public', (0, error_middleware_1.asyncHandler)(role_controller_1.getRoles));
router.use(auth_middleware_1.verifyToken);
const requireAdmin = (req, res, next) => {
    if (req.user?.role?.name !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'Admin only' });
    }
    next();
};
router.get('/', (0, error_middleware_1.asyncHandler)(role_controller_1.getRoles));
router.get('/matrix', (0, error_middleware_1.asyncHandler)(role_controller_1.getRoleMatrix));
router.post('/', requireAdmin, (0, error_middleware_1.asyncHandler)(role_controller_1.createRole));
router.put('/:id', requireAdmin, (0, error_middleware_1.asyncHandler)(role_controller_1.updateRole));
router.delete('/:id', requireAdmin, (0, error_middleware_1.asyncHandler)(role_controller_1.deleteRole));
exports.default = router;
