import mongoose from "mongoose";
import "dotenv/config";

import Role from "../models/Role.model";
import User from "../models/User.model";
import Ticket from "../models/Ticket.model";

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sunce_erp');
    console.log('🌱 Seeding database...');

    // Clear existing data
    await Promise.all([
      Role.deleteMany(),
      User.deleteMany(),
      Ticket.deleteMany()
    ]);

    // 1. Create 4 Roles with permissions
    const roles = await Role.insertMany([
      {
        name: 'ADMIN',
        description: 'Full system access',
        isSystem: true,
        permissions: {
          dashboard: { view: true, create: true, edit: true, delete: true },
          tickets: { view: true, create: true, edit: true, delete: true },
          jobcard: { view: true, create: true, edit: true, delete: true },
          logistics: { view: true, create: true, edit: true, delete: true },
          sla: { view: true, create: true, edit: true, delete: true },
          reports: { view: true, create: true, edit: true, delete: true },
          users: { view: true, create: true, edit: true, delete: true },
          settings: { view: true, create: true, edit: true, delete: true }
        }
      },
      {
        name: 'SALES',
        isSystem: true,
        permissions: {
          dashboard: { view: true },
          tickets: { view: true, create: true },
          reports: { view: true }
        }
      },
      {
        name: 'ENGINEER',
        isSystem: true,
        permissions: {
          dashboard: { view: true },
          tickets: { view: true, edit: true },
          jobcard: { view: true, edit: true },
          logistics: { view: true, edit: true }
        }
      },
      {
        name: 'CUSTOMER',
        isSystem: true,
        permissions: {
          tickets: { view: true }
        }
      }
    ]);

    // 2. Create 5 Users (matching README demo creds)
    const users = await User.insertMany([
      {
        name: 'Admin User',
        email: 'admin@sunce.in',
        password: 'admin123',
        phone: '+919876543210',
        role: roles[0]._id, // ADMIN
        company: 'Sunce Renewables'
      },
      {
        name: 'Sales Manager',
        email: 'sales@sunce.in',
        password: 'sales123',
        role: roles[1]._id, // SALES
        company: 'Sunce Renewables'
      },
      {
        name: 'Field Engineer',
        email: 'engineer@sunce.in',
        password: 'engineer123',
        role: roles[2]._id, // ENGINEER
        company: 'Sunce Renewables'
      },
      {
        name: 'John Doe',
        email: 'customer@example.com',
        password: 'customer123',
        role: roles[3]._id, // CUSTOMER
        company: 'ABC Solar Pvt Ltd'
      },
      {
        name: 'Test User',
        email: 'test@sunce.in',
        password: 'test123',
        role: roles[0]._id // ADMIN
      }
    ]);

    // 3. Create 5 Sample Tickets
    await Ticket.insertMany([
      {
        ticketId: 'SR-202412-001',
        customer: { name: 'Ravi Kumar', phone: '+919999988888', company: 'Green Energy Ltd' },
        inverter: { model: 'Sunce 5KW', serialNo: 'INV-2023-5678', capacity: '5KW' },
        issue: { description: 'Inverter not powering on', priority: 'HIGH' },
        status: 'UNDER_REPAIRED',
        statusHistory: [{ status: 'CREATED' }, { status: 'UNDER_REPAIRED', changedBy: users[2]._id }]
      },
      {
        ticketId: 'SR-202412-002',
        customer: { name: 'Priya Sharma', phone: '+918888877777' },
        inverter: { model: 'Sunce 3KW', serialNo: 'INV-2023-1234' },
        issue: { description: 'Display error code E101', priority: 'MEDIUM' },
        status: 'UNDER_REPAIRED'
      }
      // Add 3 more similar...
    ]);

    console.log('✅ Seed complete!');
    console.log('👥 Roles:', roles.length);
    console.log('👤 Users:', users.length);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seed();
