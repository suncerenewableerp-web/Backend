import mongoose from "mongoose";

// Named atomic sequences. `_id` is the sequence name (e.g. "ticket:2026") and
// `seq` holds the last value handed out, so $inc gives a collision-free number
// even when several requests create tickets at the same moment.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "counters" },
);

export default mongoose.model("Counter", counterSchema);
