"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const ticketSchema = new mongoose_1.default.Schema({
    ticketId: {
        type: String,
        unique: true,
        required: true
    },
    createdBy: { type: mongoose_1.default.Schema.ObjectId, ref: 'User' },
    customer: {
        name: String,
        phone: String,
        email: {
            type: String,
            trim: true,
            lowercase: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please use a valid email'],
        },
        company: String,
        address: String
    },
    inverter: {
        make: String,
        model: String,
        serialNo: String,
        capacity: String,
        installationDate: Date,
        warrantyEnd: Date
    },
    issue: {
        description: String,
        errorCode: String,
        priority: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
            default: 'MEDIUM'
        },
        photos: [String] // S3/CDN URLs
    },
    status: {
        type: String,
        enum: [
            // Preferred 6-step flow
            'CREATED',
            'PICKUP_SCHEDULED',
            'IN_TRANSIT',
            'UNDER_REPAIRED',
            'UNDER_DISPATCH',
            'DISPATCHED',
            'INSTALLATION_DONE',
            'CLOSED',
            // Legacy statuses kept for backward compatibility with existing DB rows
            'RECEIVED',
            'DIAGNOSIS',
            'REPAIR',
            'TESTING',
        ],
        default: 'CREATED'
    },
    installation: {
        approved: { type: Boolean, default: false },
        approvedAt: Date,
        approvedBy: { type: mongoose_1.default.Schema.ObjectId, ref: 'User' },
        approvedByRole: String, // CUSTOMER | SALES | ADMIN
        documents: [{
                url: String, // Cloudinary URL
                uploadedAt: { type: Date, default: Date.now },
                uploadedBy: { type: mongoose_1.default.Schema.ObjectId, ref: 'User' },
                uploadedByRole: String, // CUSTOMER | SALES | ADMIN | ENGINEER
                originalName: String,
                mimeType: String,
                size: Number,
            }],
    },
    statusHistory: [{
            status: String,
            changedBy: { type: mongoose_1.default.Schema.ObjectId, ref: 'User' },
            changedAt: { type: Date, default: Date.now },
            notes: String
        }],
    assignedTo: [{ type: mongoose_1.default.Schema.ObjectId, ref: 'User' }], // Engineers
    jobCard: { type: mongoose_1.default.Schema.ObjectId, ref: 'JobCard' },
    logistics: { type: mongoose_1.default.Schema.ObjectId, ref: 'Logistics' },
    slaStatus: {
        type: String,
        enum: ['OK', 'WARNING', 'BREACHED'],
        default: 'OK'
    },
    slaTargetDate: Date,
    customerFeedback: String,
    feedbackRating: { type: Number, min: 1, max: 5 }
}, {
    timestamps: true
});
// Index for fast queries
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ ticketId: 1 });
ticketSchema.index({ 'customer.phone': 1 });
ticketSchema.index({ createdBy: 1 });
ticketSchema.index({ slaStatus: 1 });
exports.default = mongoose_1.default.model("Ticket", ticketSchema);
