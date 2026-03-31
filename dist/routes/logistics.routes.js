"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const logistics_controller_1 = require("../controllers/logistics.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.get('/', (0, auth_middleware_1.authorize)('logistics', 'view'), (0, error_middleware_1.asyncHandler)(logistics_controller_1.getLogistics));
router.post('/', (0, auth_middleware_1.authorize)('logistics', 'create'), (0, error_middleware_1.asyncHandler)(logistics_controller_1.createLogistics));
router.post('/schedule-pickup', (0, auth_middleware_1.authorize)('logistics', 'edit'), (0, error_middleware_1.asyncHandler)(logistics_controller_1.schedulePickup));
router.post('/schedule-dispatch', (0, auth_middleware_1.authorize)('logistics', 'edit'), (0, error_middleware_1.asyncHandler)(logistics_controller_1.scheduleDispatch));
router.put('/:id', (0, auth_middleware_1.authorize)('logistics', 'edit'), (0, error_middleware_1.asyncHandler)(logistics_controller_1.updateTracking));
router.get('/ticket/:ticketId', (0, auth_middleware_1.authorize)('logistics', 'view'), (0, error_middleware_1.asyncHandler)(logistics_controller_1.getLogisticsByTicket));
exports.default = router;
