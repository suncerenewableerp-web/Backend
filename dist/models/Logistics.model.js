"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const logisticsSchema = new mongoose_1.default.Schema({
    ticket: { type: mongoose_1.default.Schema.ObjectId, ref: 'Ticket', required: true },
    type: {
        type: String,
        enum: ['PICKUP', 'DELIVERY'],
        required: true
    },
    status: {
        type: String,
        enum: ['SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED'],
        default: 'SCHEDULED'
    },
    pickupDetails: {
        scheduledDate: Date,
        actualPickupDate: Date,
        pickupBy: String, // Engineer name
        pickupLocation: String
    },
    courierDetails: {
        courierName: String,
        trackingId: String,
        lrNumber: String,
        awbNumber: String
    },
    deliveryDetails: {
        deliveredDate: Date,
        deliveredBy: String,
        receiverName: String,
        receiverSignature: String // Base64 or URL
    },
    costs: {
        pickup: Number,
        delivery: Number,
        insurance: Number,
        total: Number
    },
    issues: String,
    documents: [String] // PDFs, photos URLs
}, {
    timestamps: true
});
// Indexes
logisticsSchema.index({ ticket: 1, type: 1 });
logisticsSchema.index({ trackingId: 1 });
exports.default = mongoose_1.default.model("Logistics", logisticsSchema);
