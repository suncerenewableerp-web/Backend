import mongoose from "mongoose";

const InverterBrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true },
);

export default mongoose.model("InverterBrand", InverterBrandSchema);

