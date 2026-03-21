const mongoose = require('mongoose');

const jobCardSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.ObjectId, ref: 'Ticket', required: true },
  diagnosis: String,
  spareParts: [{
    partName: String,
    partNo: String,
    quantity: Number,
    cost: Number,
    supplier: String
  }],
  totalCost: {
    parts: { type: Number, default: 0 },
    labor: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    grandTotal: Number
  },
  stages: [{
    name: String, // e.g., 'Diagnosis Complete', 'Parts Ordered'
    status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETE'] },
    assignedTo: { type: mongoose.Schema.ObjectId, ref: 'User' },
    completedAt: Date,
    notes: String
  }],
  repairNotes: String,
  testedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
  testResults: String,
  warrantyGiven: Number // months
}, {
  timestamps: true
});

module.exports = mongoose.model('JobCard', jobCardSchema);

