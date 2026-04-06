import mongoose from "mongoose";

const logisticsSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.ObjectId, ref: 'Ticket', required: true },
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
  billing: {
    invoiceGenerated: { type: Boolean, default: false },
    paymentDone: { type: Boolean, default: false },
    dispatchApprovalRequestedAt: Date,
    dispatchApprovalRequestedBy: { type: mongoose.Schema.ObjectId, ref: "User" },
    dispatchApproved: { type: Boolean, default: false },
    dispatchApprovedAt: Date,
    dispatchApprovedBy: { type: mongoose.Schema.ObjectId, ref: "User" },
  },
  issues: String,
  documents: [String] // PDFs, photos URLs
}, {
  timestamps: true
});

// Indexes
logisticsSchema.index({ ticket: 1, type: 1 });
logisticsSchema.index({ trackingId: 1 });

export default mongoose.model("Logistics", logisticsSchema);
