"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const ticket_controller_1 = require("../controllers/ticket.controller");
const error_middleware_1 = require("../middleware/error.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.get('/', (0, auth_middleware_1.authorize)('tickets', 'view'), (0, error_middleware_1.asyncHandler)(ticket_controller_1.getTickets));
router.post('/', (0, auth_middleware_1.authorize)('tickets', 'create'), (0, error_middleware_1.asyncHandler)(ticket_controller_1.createTicket));
router.post('/bulk', (0, auth_middleware_1.authorize)('tickets', 'create'), (0, error_middleware_1.asyncHandler)(ticket_controller_1.createTicketsBulk));
router.get('/:id/pickup-details', (0, auth_middleware_1.authorize)('tickets', 'view'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.getTicketPickupDetails));
router.post('/:id/pickup-details', (0, auth_middleware_1.authorize)('tickets', 'edit'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.upsertTicketPickupDetails));
router.post('/:id/installation-done', (0, auth_middleware_1.authorize)('tickets', 'view'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.approveInstallationDone));
router.post("/:id/pickup-documents", (0, auth_middleware_1.authorize)("tickets", "edit"), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), upload_middleware_1.pickupDocumentUpload.single("file"), (0, error_middleware_1.asyncHandler)(ticket_controller_1.uploadTicketPickupDocument));
router.get('/:id/jobcard', (0, auth_middleware_1.authorize)('jobcard', 'view'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.getTicketJobCard));
router.put('/:id/jobcard', (0, auth_middleware_1.authorize)('jobcard', 'edit'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.updateTicketJobCard));
router.get('/:id', (0, auth_middleware_1.authorize)('tickets', 'view'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.getTicket));
router.put('/:id', (0, auth_middleware_1.authorize)('tickets', 'edit'), (0, validate_middleware_1.validate)([validate_middleware_1.validateTicketId]), (0, error_middleware_1.asyncHandler)(ticket_controller_1.updateTicket));
router.patch('/:id/assign', (0, auth_middleware_1.authorize)('tickets', 'edit'), (0, error_middleware_1.asyncHandler)((req, res) => res.json({ success: true, message: 'Assigned' }))); // Stub
router.get('/:id/history', (0, auth_middleware_1.authorize)('tickets', 'view'), (0, error_middleware_1.asyncHandler)((req, res) => {
    // History logic
    res.json({ success: true, data: [] });
}));
exports.default = router;
