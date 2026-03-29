"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const slaSettingsSchema = new mongoose_1.default.Schema({
    _id: {
        type: String,
        default: 'default',
    },
    criticalHours: {
        type: Number,
        min: 1,
        default: 24,
    },
    highHours: {
        type: Number,
        min: 1,
        default: 48,
    },
    normalHours: {
        type: Number,
        min: 1,
        default: 72,
    },
}, { timestamps: true, collection: 'sla_settings' });
exports.default = mongoose_1.default.model("SlaSettings", slaSettingsSchema);
