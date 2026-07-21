"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
// Named atomic sequences. `_id` is the sequence name (e.g. "ticket:2026") and
// `seq` holds the last value handed out, so $inc gives a collision-free number
// even when several requests create tickets at the same moment.
const counterSchema = new mongoose_1.default.Schema({
    _id: { type: String },
    seq: { type: Number, default: 0 },
}, { timestamps: true, collection: "counters" });
exports.default = mongoose_1.default.model("Counter", counterSchema);
