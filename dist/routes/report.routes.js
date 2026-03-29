"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const report_controller_1 = require("../controllers/report.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.authorize)('reports', 'view'));
router.get('/', (0, error_middleware_1.asyncHandler)(report_controller_1.getReports));
router.get('/export/tickets', (0, error_middleware_1.asyncHandler)((req, res) => {
    res.json({ success: true, message: 'CSV export ready' });
}));
exports.default = router;
