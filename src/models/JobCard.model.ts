import mongoose from "mongoose";

const serviceJobSchema = new mongoose.Schema(
  {
    sn: Number,
    jobName: String,
    specification: String,
    componentsUsed: { type: [mongoose.Schema.Types.Mixed], default: [] }, // supports string[] (legacy) or { name, qty }[]
    qty: Number,
    reason: String,
    date: Date,
    doneBy: String,
  },
  { _id: false }
);

const finalTestingActivitySchema = new mongoose.Schema(
  {
    sr: Number,
    activity: String,
    result: { type: String, enum: ['YES', 'NO', ''], default: '' },
    remarks: String,
  },
  { _id: false }
);

const jobCardSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.ObjectId, ref: 'Ticket', required: true },
  diagnosis: String,
  repairActionsByName: String, // e.g. QA team / sub engineer name
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
  warrantyGiven: Number, // months

  // Client sheet fields (Service Job History Sheet + Final Testing)
  jobNo: String,
  item: String,
  itemAndSiteDetails: String,
  customerName: String,
  inDate: Date,
  outDate: Date,
  currentStatus: String,
  remarks: String,
  checkedByName: String,
  checkedByDate: Date,
  // Engineer final decision (final authority)
  engineerFinalStatus: String, // REPAIRABLE | NOT_REPAIRABLE
  engineerFinalizedAt: Date,
  engineerFinalizedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },

  serviceJobs: { type: [serviceJobSchema], default: [] },

  finalTestingActivities: { type: [finalTestingActivitySchema], default: [] },
  finalStatus: String,
  finalRemarks: String,
  finalCheckedByName: String,
  finalCheckedByDate: Date,
}, {
  timestamps: true
});

export default mongoose.model("JobCard", jobCardSchema);
