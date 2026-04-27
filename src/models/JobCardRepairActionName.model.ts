import mongoose from "mongoose";

const JobCardRepairActionNameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true, collection: "jobcard_repair_action_names" },
);

export default mongoose.model("JobCardRepairActionName", JobCardRepairActionNameSchema);

