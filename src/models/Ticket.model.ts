import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    unique: true,
    required: true
  },
  createdBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
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
      'CLOSED',
      // Legacy statuses kept for backward compatibility with existing DB rows
      'RECEIVED',
      'DIAGNOSIS',
      'REPAIR',
      'TESTING',
    ],
    default: 'CREATED'
  },
  statusHistory: [{
    status: String,
    changedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    notes: String
  }],
  assignedTo: [{ type: mongoose.Schema.ObjectId, ref: 'User' }], // Engineers
  jobCard: { type: mongoose.Schema.ObjectId, ref: 'JobCard' },
  logistics: { type: mongoose.Schema.ObjectId, ref: 'Logistics' },
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

export default mongoose.model("Ticket", ticketSchema);
