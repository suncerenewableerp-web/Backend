"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const sla_controller_1 = require("../controllers/sla.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.get('/', (0, auth_middleware_1.authorize)('sla', 'view'), (0, error_middleware_1.asyncHandler)(sla_controller_1.getSLAOverview));
// router.post('/recalculate', adminOnly, asyncHandler(recalculateSLA));
exports.default = router;
