import mongoose from "mongoose";
import "dotenv/config";

import Ticket from "../models/Ticket.model";
import JobCard from "../models/JobCard.model";
import Logistics from "../models/Logistics.model";

function usage() {
  console.log("Usage: npm run purge:tickets -- --force");
  console.log("This deletes all tickets and their linked job cards/logistics records.");
}

async function main() {
  const force = process.argv.includes("--force") || process.argv.includes("--yes");
  if (!force) {
    usage();
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp";
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  const [ticketCount, jobCardCount, logisticsCount] = await Promise.all([
    Ticket.countDocuments(),
    JobCard.countDocuments(),
    Logistics.countDocuments(),
  ]);

  await Promise.all([
    JobCard.deleteMany({}),
    Logistics.deleteMany({}),
    Ticket.deleteMany({}),
  ]);

  console.log("Tickets purged successfully.");
  console.log(`Tickets deleted: ${ticketCount}`);
  console.log(`Job cards deleted: ${jobCardCount}`);
  console.log(`Logistics deleted: ${logisticsCount}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to purge tickets:", err);
  process.exit(1);
});
