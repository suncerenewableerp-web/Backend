const mongoose = require("mongoose");
require("dotenv").config();

const Role = require("../models/Role.model");
const User = require("../models/User.model");
const Ticket = require("../models/Ticket.model");
const JobCard = require("../models/JobCard.model");
const Logistics = require("../models/Logistics.model");

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
    p[moduleId] = { ...p[moduleId], ...perms };
  }
  return p;
}

async function seed() {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/sunce_erp",
  );

  console.log("🌱 Seeding RBAC demo data...");

  await Promise.all([
    Role.deleteMany(),
    User.deleteMany(),
    Ticket.deleteMany(),
    JobCard.deleteMany(),
    Logistics.deleteMany(),
  ]);

  // Permission Matrix (from provided RBAC table)
  const roles = await Role.insertMany([
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
        sla: { view: true },
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
      description: "View tickets + SLA",
      isSystem: true,
      permissions: withOverrides({
        dashboard: { view: true },
        tickets: { view: true },
        sla: { view: true },
      }),
    },
  ]);

  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));

  // Users (create individually so password hashing middleware runs)
  const admin = await User.create({
    name: "Admin User",
    email: "admin@sunce.in",
    password: "admin123",
    phone: "+919876543210",
    role: roleByName.ADMIN._id,
    company: "Sunce Renewables",
  });
  const sales = await User.create({
    name: "Sales Manager",
    email: "sales@sunce.in",
    password: "sales123",
    role: roleByName.SALES._id,
    company: "Sunce Renewables",
  });
  const engineer = await User.create({
    name: "Field Engineer",
    email: "engineer@sunce.in",
    password: "engineer123",
    role: roleByName.ENGINEER._id,
    company: "Sunce Renewables",
  });
  const customer = await User.create({
    name: "John Doe",
    email: "customer@example.com",
    password: "customer123",
    role: roleByName.CUSTOMER._id,
    company: "ABC Solar Pvt Ltd",
  });

  // Tickets
  const tickets = await Ticket.insertMany([
    {
      ticketId: "SR-2026-0001",
      customer: {
        name: "John Doe",
        company: customer.company,
        phone: "+918888877777",
      },
      inverter: {
        make: "ABB",
        model: "TRIO-50.0-TL",
        serialNo: "ABB2023001",
        capacity: "50kW",
      },
      issue: {
        description: "Inverter shows error F001, not producing output",
        errorCode: "F001",
        priority: "HIGH",
      },
      status: "DIAGNOSIS",
      assignedTo: [engineer._id],
      slaStatus: "WARNING",
      statusHistory: [{ status: "CREATED", changedBy: sales._id }],
    },
    {
      ticketId: "SR-2026-0002",
      customer: { name: "GreenTech Solutions", company: "GreenTech Solutions" },
      inverter: {
        make: "SMA",
        model: "Sunny Tripower 30000TL",
        serialNo: "SMA2024002",
        capacity: "30kW",
      },
      issue: { description: "Display blank, fans running", errorCode: "E205", priority: "MEDIUM" },
      status: "REPAIR",
      assignedTo: [engineer._id],
      slaStatus: "OK",
      statusHistory: [{ status: "CREATED", changedBy: sales._id }],
    },
    {
      ticketId: "SR-2026-0003",
      customer: { name: "SunPower Ltd", company: "SunPower Ltd" },
      inverter: { make: "Fronius", model: "Symo 15.0-3-M", serialNo: "FRO2025003", capacity: "15kW" },
      issue: { description: "Grid fault alarm triggered continuously", errorCode: "GF-01", priority: "LOW" },
      status: "CREATED",
      slaStatus: "OK",
      statusHistory: [{ status: "CREATED", changedBy: sales._id }],
    },
    {
      ticketId: "SR-2026-0004",
      customer: { name: "Rajasthan Renewables", company: "Rajasthan Renewables" },
      inverter: { make: "Huawei", model: "SUN2000-100KTL", serialNo: "HW2023004", capacity: "100kW" },
      issue: { description: "Overheating, thermal shutdown every afternoon", errorCode: "OT-500", priority: "HIGH" },
      status: "TESTING",
      assignedTo: [engineer._id],
      slaStatus: "BREACHED",
      statusHistory: [{ status: "CREATED", changedBy: sales._id }],
    },
  ]);

  // Create a JobCard + Logistics for the first ticket
  const t0 = tickets[0];
  const jobCard = await JobCard.create({
    ticket: t0._id,
    diagnosis: "Under analysis",
    stages: [
      { name: "Diagnosis", status: "IN_PROGRESS", assignedTo: engineer._id },
    ],
  });
  const logistics = await Logistics.create({
    ticket: t0._id,
    type: "PICKUP",
    status: "IN_TRANSIT",
    courierDetails: { courierName: "BlueDart", trackingId: "BD2026031600123" },
  });
  await Ticket.findByIdAndUpdate(t0._id, { jobCard: jobCard._id, logistics: logistics._id });

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

  await mongoose.disconnect();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });

