import mongoose from "mongoose";

const JobCardEngineerNameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true, collection: "jobcard_engineer_names" },
);

export default mongoose.model("JobCardEngineerName", JobCardEngineerNameSchema);

