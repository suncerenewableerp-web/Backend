"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const jobcard_controller_1 = require("../controllers/jobcard.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.authorize)('jobcard', 'view'));
router.get('/', (0, error_middleware_1.asyncHandler)(jobcard_controller_1.getJobCards));
router.post('/', (0, auth_middleware_1.authorize)('jobcard', 'create'), (0, error_middleware_1.asyncHandler)(jobcard_controller_1.createJobCard));
router.post('/:id/parts', (0, auth_middleware_1.authorize)('jobcard', 'edit'), (0, error_middleware_1.asyncHandler)(jobcard_controller_1.addPart));
exports.default = router;
