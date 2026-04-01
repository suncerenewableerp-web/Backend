"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const settings_controller_1 = require("../controllers/settings.controller");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.get('/sla', (0, auth_middleware_1.authorize)('sla', 'view'), (0, error_middleware_1.asyncHandler)(settings_controller_1.getSlaSettings));
router.put('/sla', (0, auth_middleware_1.authorize)('sla', 'edit'), (0, error_middleware_1.asyncHandler)(settings_controller_1.updateSlaSettings));
router.get('/inverter-brands', (0, auth_middleware_1.authorize)('tickets', 'view'), (0, error_middleware_1.asyncHandler)(settings_controller_1.listInverterBrands));
router.post('/inverter-brands', (0, auth_middleware_1.authorize)('tickets', 'edit'), (0, error_middleware_1.asyncHandler)(settings_controller_1.addInverterBrand));
exports.default = router;
