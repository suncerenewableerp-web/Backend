"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const user_controller_1 = require("../controllers/user.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken); // All users routes protected
router.get('/', (0, error_middleware_1.asyncHandler)(user_controller_1.getUsers));
router.get('/engineers', (0, error_middleware_1.asyncHandler)(user_controller_1.getEngineers));
exports.default = router;
