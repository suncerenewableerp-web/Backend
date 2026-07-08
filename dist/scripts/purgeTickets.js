"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
require("dotenv/config");
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
const Logistics_model_1 = __importDefault(require("../models/Logistics.model"));
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
    await mongoose_1.default.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
    });
    const [ticketCount, jobCardCount, logisticsCount] = await Promise.all([
        Ticket_model_1.default.countDocuments(),
        JobCard_model_1.default.countDocuments(),
        Logistics_model_1.default.countDocuments(),
    ]);
    await Promise.all([
        JobCard_model_1.default.deleteMany({}),
        Logistics_model_1.default.deleteMany({}),
        Ticket_model_1.default.deleteMany({}),
    ]);
    console.log("Tickets purged successfully.");
    console.log(`Tickets deleted: ${ticketCount}`);
    console.log(`Job cards deleted: ${jobCardCount}`);
    console.log(`Logistics deleted: ${logisticsCount}`);
    await mongoose_1.default.disconnect();
    process.exit(0);
}
main().catch((err) => {
    console.error("Failed to purge tickets:", err);
    process.exit(1);
});
