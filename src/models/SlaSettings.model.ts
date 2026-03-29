import mongoose from "mongoose";

const slaSettingsSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true, collection: 'sla_settings' }
);

export default mongoose.model("SlaSettings", slaSettingsSchema);
