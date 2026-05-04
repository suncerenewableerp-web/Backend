import mongoose from "mongoose";

const InverterModelSchema = new mongoose.Schema(
  {
    make: { type: String, required: true, trim: true },
    makeKey: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true },
);

InverterModelSchema.index({ makeKey: 1, key: 1 }, { unique: true });

export default mongoose.model("InverterModel", InverterModelSchema);

