"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const serviceJobSchema = new mongoose_1.default.Schema({
    sn: Number,
    jobName: String,
    specification: String,
    qty: Number,
    reason: String,
    date: Date,
    doneBy: String,
}, { _id: false });
const finalTestingActivitySchema = new mongoose_1.default.Schema({
    sr: Number,
    activity: String,
    result: { type: String, enum: ['YES', 'NO', ''], default: '' },
    remarks: String,
}, { _id: false });
const jobCardSchema = new mongoose_1.default.Schema({
    ticket: { type: mongoose_1.default.Schema.ObjectId, ref: 'Ticket', required: true },
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
            assignedTo: { type: mongoose_1.default.Schema.ObjectId, ref: 'User' },
            completedAt: Date,
            notes: String
        }],
    repairNotes: String,
    testedBy: { type: mongoose_1.default.Schema.ObjectId, ref: 'User' },
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
    serviceJobs: { type: [serviceJobSchema], default: [] },
    finalTestingActivities: { type: [finalTestingActivitySchema], default: [] },
    finalStatus: String,
    finalRemarks: String,
    finalCheckedByName: String,
    finalCheckedByDate: Date,
}, {
    timestamps: true
});
exports.default = mongoose_1.default.model("JobCard", jobCardSchema);
