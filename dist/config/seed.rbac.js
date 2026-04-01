"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
require("dotenv/config");
const Role_model_1 = __importDefault(require("../models/Role.model"));
const User_model_1 = __importDefault(require("../models/User.model"));
const Ticket_model_1 = __importDefault(require("../models/Ticket.model"));
const JobCard_model_1 = __importDefault(require("../models/JobCard.model"));
const Logistics_model_1 = __importDefault(require("../models/Logistics.model"));
const MODULES = [
    "dashboard",
    "tickets",
    "jobcard",
    "logistics",
    "sla",
    "reports",
    "users",
    "settings",
];
const none = () => ({ view: false, create: false, edit: false, delete: false });
const full = () => ({ view: true, create: true, edit: true, delete: true });
function basePermissions() {
    return Object.fromEntries(MODULES.map((m) => [m, none()]));
}
function withOverrides(overrides) {
    const p = basePermissions();
    for (const [moduleId, perms] of Object.entries(overrides)) {
        p[moduleId] = { ...p[moduleId], ...(perms || {}) };
    }
    return p;
}
async function seed() {
    await mongoose_1.default.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp");
    console.log("🌱 Seeding RBAC demo data...");
    await Promise.all([
        Role_model_1.default.deleteMany(),
        User_model_1.default.deleteMany(),
        Ticket_model_1.default.deleteMany(),
        JobCard_model_1.default.deleteMany(),
        Logistics_model_1.default.deleteMany(),
    ]);
    // Permission Matrix (from provided RBAC table)
    const roles = await Role_model_1.default.insertMany([
        {
            name: "ADMIN",
            description: "Full system access",
            isSystem: true,
            permissions: Object.fromEntries(MODULES.map((m) => [m, full()])),
        },
        {
            name: "SALES",
            description: "Create/Edit tickets, view SLA and reports",
            isSystem: true,
            permissions: withOverrides({
                dashboard: { view: true },
                tickets: { view: true, create: true, edit: true },
                jobcard: { view: true },
                logistics: { view: true, create: true, edit: true },
                sla: { view: true, edit: true },
                reports: { view: true },
            }),
        },
        {
            name: "ENGINEER",
            description: "Update tickets + jobcards, view SLA",
            isSystem: true,
            permissions: withOverrides({
                dashboard: { view: true },
                tickets: { view: true, edit: true },
                jobcard: { view: true, edit: true },
                logistics: { view: true, edit: true },
                sla: { view: true },
            }),
        },
        {
            name: "CUSTOMER",
            description: "Raise + view tickets, view SLA",
            isSystem: true,
            permissions: withOverrides({
                dashboard: { view: true },
                tickets: { view: true, create: true },
                sla: { view: true },
            }),
        },
    ]);
    const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));
    // Users (create individually so password hashing middleware runs)
    const admin = await User_model_1.default.create({
        name: "Admin User",
        email: "admin@sunce.in",
        password: "admin123",
        phone: "+919876543210",
        role: roleByName.ADMIN._id,
        company: "Sunce Renewables",
    });
    const sales = await User_model_1.default.create({
        name: "Sales Manager",
        email: "sales@sunce.in",
        password: "sales123",
        role: roleByName.SALES._id,
        company: "Sunce Renewables",
    });
    const engineer = await User_model_1.default.create({
        name: "Field Engineer",
        email: "engineer@sunce.in",
        password: "engineer123",
        role: roleByName.ENGINEER._id,
        company: "Sunce Renewables",
    });
    const customer = await User_model_1.default.create({
        name: "John Doe",
        email: "customer@example.com",
        password: "customer123",
        role: roleByName.CUSTOMER._id,
        company: "ABC Solar Pvt Ltd",
    });
    // ────────────────────────────────────────────────────────────────────────────
    // Tickets (demo dataset for meeting showcase)
    // Creates a realistic spread across the last 6 months with mixed statuses so
    // Reports/SLA/Logistics screens look "alive".
    // ────────────────────────────────────────────────────────────────────────────
    const STATUS_FLOW = [
        "CREATED",
        "PICKUP_SCHEDULED",
        "IN_TRANSIT",
        "UNDER_REPAIRED",
        "DISPATCHED",
        "CLOSED",
    ];
    const now = new Date();
    const companies = [
        "ABC Solar Pvt Ltd",
        "GreenTech Solutions",
        "SunPower Ltd",
        "Rajasthan Renewables",
        "VoltEdge Energy",
        "Nirma Solar",
        "Shakti Power Systems",
        "BlueSky EPC",
        "Solaris Integrations",
        "Prakash Agro",
    ];
    const inverterCatalog = [
        { make: "ABB", model: "TRIO-50.0-TL" },
        { make: "SMA", model: "Sunny Tripower 30000TL" },
        { make: "Huawei", model: "SUN2000-100KTL" },
        { make: "Fronius", model: "Symo 15.0-3-M" },
        { make: "Sungrow", model: "SG50CX" },
        { make: "Delta", model: "M125HV" },
        { make: "Growatt", model: "MAX 50KTL3-X LV" },
        { make: "GoodWe", model: "GW50K-MT" },
    ];
    const issues = [
        { description: "Inverter shows error F001, not producing output", errorCode: "F001" },
        { description: "Display blank, fans running", errorCode: "E205" },
        { description: "Grid fault alarm triggered continuously", errorCode: "GF-01" },
        { description: "Overheating, thermal shutdown every afternoon", errorCode: "OT-500" },
        { description: "DC insulation fault during morning hours", errorCode: "ISO-12" },
        { description: "AC contactor not engaging, intermittent trips", errorCode: "AC-07" },
        { description: "Communication loss with logger", errorCode: "COM-19" },
        { description: "MPPT voltage mismatch warning", errorCode: "MPPT-03" },
        { description: "Earth leakage detected on startup", errorCode: "EL-11" },
        { description: "No power output, relay test failed", errorCode: "RLY-02" },
    ];
    const priorities = ["LOW", "MEDIUM", "HIGH"];
    function pad4(n) {
        return String(n).padStart(4, "0");
    }
    function addDays(date, d) {
        const out = new Date(date.getTime());
        out.setUTCDate(out.getUTCDate() + d);
        return out;
    }
    function monthStartUTC(year, monthIdx0) {
        return new Date(Date.UTC(year, monthIdx0, 1, 9, 30, 0)); // 9:30 AM IST-ish in UTC for stable sorting
    }
    function flowUpTo(finalStatus) {
        const idx = STATUS_FLOW.indexOf(finalStatus);
        if (idx === -1)
            return ["CREATED"];
        return STATUS_FLOW.slice(0, idx + 1);
    }
    function statusHistoryFromFlow(flow, createdAt, changedBy) {
        return flow.map((status, i) => ({
            status,
            changedBy,
            changedAt: addDays(createdAt, i),
        }));
    }
    function pickFinalStatus(monthIndexFromOldest, itemIndexInMonth) {
        // Older months have more completed tickets; newer months have more active ones.
        if (monthIndexFromOldest <= 1)
            return itemIndexInMonth % 2 === 0 ? "CLOSED" : "DISPATCHED";
        if (monthIndexFromOldest === 2)
            return ["CLOSED", "DISPATCHED", "UNDER_REPAIRED", "UNDER_REPAIRED"][itemIndexInMonth % 4];
        if (monthIndexFromOldest === 3)
            return ["DISPATCHED", "UNDER_REPAIRED", "IN_TRANSIT", "PICKUP_SCHEDULED"][itemIndexInMonth % 4];
        if (monthIndexFromOldest === 4)
            return ["UNDER_REPAIRED", "IN_TRANSIT", "PICKUP_SCHEDULED", "CREATED"][itemIndexInMonth % 4];
        return ["CREATED", "PICKUP_SCHEDULED", "IN_TRANSIT", "UNDER_REPAIRED"][itemIndexInMonth % 4];
    }
    function pickSlaStatus(finalStatus, priority, monthIndexFromOldest, itemIndexInMonth) {
        // Mix of OK/WARNING/BREACHED for demo.
        if (finalStatus === "CLOSED")
            return itemIndexInMonth % 5 === 0 ? "BREACHED" : "OK";
        if (finalStatus === "DISPATCHED")
            return itemIndexInMonth % 4 === 0 ? "WARNING" : "OK";
        if (monthIndexFromOldest <= 2 && (priority === "HIGH" || priority === "MEDIUM")) {
            return itemIndexInMonth % 3 === 0 ? "BREACHED" : "WARNING";
        }
        return itemIndexInMonth % 3 === 0 ? "WARNING" : "OK";
    }
    const monthsToSeed = 6; // Oct -> Mar style spread for reports
    const monthBases = [];
    // Build starting from current month backwards, then reverse to oldest-first
    for (let i = monthsToSeed - 1; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
        d.setUTCMonth(d.getUTCMonth() - i);
        monthBases.push(monthStartUTC(d.getUTCFullYear(), d.getUTCMonth()));
    }
    const ticketsPayload = [];
    let seq = 1;
    for (let monthIndex = 0; monthIndex < monthBases.length; monthIndex += 1) {
        const base = monthBases[monthIndex];
        for (let j = 0; j < 6; j += 1) {
            const createdAt = addDays(base, 2 + j * 4);
            const company = companies[(monthIndex * 3 + j) % companies.length];
            const personName = company === customer.company
                ? customer.name
                : ["Aman", "Neha", "Ravi", "Pooja", "Irfan", "Meera", "Karan", "Sana"][((monthIndex + 1) * (j + 2)) % 8];
            const inv = inverterCatalog[(monthIndex * 5 + j) % inverterCatalog.length];
            const issue = issues[(monthIndex * 4 + j) % issues.length];
            const priority = priorities[(monthIndex + j) % priorities.length];
            const finalStatus = pickFinalStatus(monthIndex, j);
            const flow = flowUpTo(finalStatus);
            const statusHistory = statusHistoryFromFlow(flow, createdAt, sales._id);
            const lastChangedAt = statusHistory[statusHistory.length - 1].changedAt;
            const inWarranty = (monthIndex + j) % 2 === 0;
            const warrantyEnd = inWarranty ? addDays(now, 180) : addDays(now, -60);
            const ticketId = `SR-${now.getUTCFullYear()}-${pad4(seq)}`;
            seq += 1;
            ticketsPayload.push({
                ticketId,
                customer: {
                    name: company === customer.company ? customer.name : `${personName} (${company})`,
                    company,
                    phone: `+91${String(9000000000 + ((monthIndex * 17 + j * 91) % 999999999)).padStart(10, "0")}`,
                },
                inverter: {
                    make: inv.make,
                    model: inv.model,
                    serialNo: `${inv.make.slice(0, 3).toUpperCase()}-${now.getUTCFullYear()}-${pad4(seq + j)}`,
                    capacity: ["10kW", "15kW", "30kW", "50kW", "100kW"][(monthIndex + j) % 5],
                    warrantyEnd,
                },
                issue: {
                    description: issue.description,
                    errorCode: issue.errorCode,
                    priority,
                },
                status: finalStatus,
                assignedTo: [engineer._id],
                slaStatus: pickSlaStatus(finalStatus, priority, monthIndex, j),
                slaTargetDate: addDays(createdAt, priority === "HIGH" ? 2 : priority === "MEDIUM" ? 3 : 5),
                statusHistory,
                createdAt,
                updatedAt: lastChangedAt,
            });
        }
    }
    const tickets = await Ticket_model_1.default.insertMany(ticketsPayload);
    // Create JobCards + Logistics for a subset (for nice drill-down in meeting)
    const demoTicketIds = tickets
        .filter((t, idx) => idx % 4 === 0)
        .slice(0, 10)
        .map((t) => t._id);
    for (const ticketObjectId of demoTicketIds) {
        const ticketDoc = await Ticket_model_1.default.findById(ticketObjectId);
        if (!ticketDoc)
            continue;
        const jc = await JobCard_model_1.default.create({
            ticket: ticketDoc._id,
            jobNo: `JC-${ticketDoc.ticketId}`,
            item: "Solar Inverter",
            itemAndSiteDetails: `Site: ${ticketDoc.customer?.company || ticketDoc.customer?.name || "—"}`,
            customerName: ticketDoc.customer?.name || "",
            inDate: addDays(ticketDoc.createdAt, 2),
            outDate: ticketDoc.status === "CLOSED" ? addDays(ticketDoc.createdAt, 7) : null,
            currentStatus: ticketDoc.status,
            remarks: "Seeded demo job card for showcase.",
            checkedByName: "QA Team",
            checkedByDate: addDays(ticketDoc.createdAt, 6),
            diagnosis: "Initial inspection completed; parts verified.",
            stages: [
                { name: "Diagnosis", status: "COMPLETE", assignedTo: engineer._id, completedAt: addDays(ticketDoc.createdAt, 3) },
                { name: "Repair", status: ticketDoc.status === "DISPATCHED" || ticketDoc.status === "CLOSED" ? "COMPLETE" : ticketDoc.status === "UNDER_REPAIRED" ? "IN_PROGRESS" : "PENDING", assignedTo: engineer._id },
                { name: "Testing", status: ticketDoc.status === "DISPATCHED" || ticketDoc.status === "CLOSED" ? "COMPLETE" : "PENDING", assignedTo: engineer._id },
            ],
            serviceJobs: [
                {
                    sn: 1,
                    jobName: "Visual inspection",
                    specification: "Check connectors, PCB, dust",
                    qty: 1,
                    reason: ticketDoc.issue?.errorCode || "",
                    date: addDays(ticketDoc.createdAt, 3),
                    doneBy: engineer.name,
                },
                {
                    sn: 2,
                    jobName: "Firmware check",
                    specification: "Version + parameter reset if required",
                    qty: 1,
                    reason: "Prevent recurring fault",
                    date: addDays(ticketDoc.createdAt, 4),
                    doneBy: engineer.name,
                },
            ],
            testResults: "Basic functional tests passed (seed).",
            warrantyGiven: 6,
            testedBy: engineer._id,
            finalStatus: ticketDoc.status === "CLOSED" ? "PASS" : "",
            finalRemarks: ticketDoc.status === "CLOSED" ? "Ready for dispatch (seed)." : "",
            finalCheckedByName: ticketDoc.status === "CLOSED" ? "QA Team" : "",
            finalCheckedByDate: ticketDoc.status === "CLOSED" ? addDays(ticketDoc.createdAt, 7) : null,
        });
        // Logistics record for non-created tickets (optional but useful for backend realism)
        if (ticketDoc.status !== "CREATED") {
            const log = await Logistics_model_1.default.create({
                ticket: ticketDoc._id,
                type: "PICKUP",
                status: ticketDoc.status === "IN_TRANSIT"
                    ? "IN_TRANSIT"
                    : ticketDoc.status === "UNDER_REPAIRED" || ticketDoc.status === "DISPATCHED" || ticketDoc.status === "CLOSED" || ticketDoc.status === "RECEIVED" || ticketDoc.status === "DIAGNOSIS" || ticketDoc.status === "REPAIR" || ticketDoc.status === "TESTING"
                        ? "DELIVERED"
                        : "SCHEDULED",
                courierDetails: {
                    courierName: "BlueDart",
                    trackingId: `BD-${ticketDoc.ticketId}`,
                },
                pickupDetails: {
                    scheduledDate: addDays(ticketDoc.createdAt, 1),
                    actualPickupDate: addDays(ticketDoc.createdAt, 2),
                    pickupBy: engineer.name,
                    pickupLocation: ticketDoc.customer?.company || ticketDoc.customer?.name || "",
                },
            });
            await Ticket_model_1.default.findByIdAndUpdate(ticketDoc._id, { jobCard: jc._id, logistics: log._id });
        }
        else {
            await Ticket_model_1.default.findByIdAndUpdate(ticketDoc._id, { jobCard: jc._id });
        }
    }
    console.log("✅ Seed complete!");
    console.log("👥 Roles:", roles.length);
    console.log("👤 Users:", 4);
    console.log("🎫 Tickets:", tickets.length);
    console.log("");
    console.log("Demo Credentials:");
    console.log("- admin@sunce.in / admin123 (ADMIN)");
    console.log("- sales@sunce.in / sales123 (SALES)");
    console.log("- engineer@sunce.in / engineer123 (ENGINEER)");
    console.log("- customer@example.com / customer123 (CUSTOMER)");
    await mongoose_1.default.disconnect();
}
seed()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
