"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const CustomerCompanySchema = new mongoose_1.default.Schema({
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, unique: true, index: true },
    repEmail: { type: String, required: false, trim: true, lowercase: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User", required: false },
}, { timestamps: true });
exports.default = mongoose_1.default.model("CustomerCompany", CustomerCompanySchema);
