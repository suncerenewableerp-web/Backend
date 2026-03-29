"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const roleSchema = new mongoose_1.default.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    label: String,
    color: String,
    description: String,
    isSystem: {
        type: Boolean,
        default: false
    },
    permissions: {
        dashboard: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        tickets: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        jobcard: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        logistics: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        sla: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        reports: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        users: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
        settings: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean }
    }
}, { timestamps: true });
exports.default = mongoose_1.default.model("Role", roleSchema);
