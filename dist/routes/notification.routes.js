"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const notification_controller_1 = require("../controllers/notification.controller");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.get("/", (0, error_middleware_1.asyncHandler)(notification_controller_1.listNotifications));
router.post("/read-all", (0, error_middleware_1.asyncHandler)(notification_controller_1.markAllNotificationsRead));
router.post("/:id/read", (0, error_middleware_1.asyncHandler)(notification_controller_1.markNotificationRead));
exports.default = router;
