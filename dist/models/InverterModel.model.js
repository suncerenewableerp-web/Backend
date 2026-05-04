"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const InverterModelSchema = new mongoose_1.default.Schema({
    make: { type: String, required: true, trim: true },
    makeKey: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User", required: false },
}, { timestamps: true });
InverterModelSchema.index({ makeKey: 1, key: 1 }, { unique: true });
exports.default = mongoose_1.default.model("InverterModel", InverterModelSchema);
