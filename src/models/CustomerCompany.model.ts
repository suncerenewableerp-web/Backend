import mongoose from "mongoose";

const CustomerCompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, unique: true, index: true },
    repEmail: { type: String, required: false, trim: true, lowercase: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true },
);

export default mongoose.model("CustomerCompany", CustomerCompanySchema);
