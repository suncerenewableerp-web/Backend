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
          tickets: { view: true, create: true, edit: true },
          jobcard: { view: true },
          logistics: { view: true, create: true, edit: true },
          sla: { view: true, edit: true },
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
    // Use `create()` (not `insertMany()`) so password hashing middleware runs.
    const users = await User.create([
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
        phone: '+919876543211',
        role: roles[1]._id, // SALES
        company: 'Sunce Renewables'
      },
      {
        name: 'Field Engineer',
        email: 'engineer@sunce.in',
        password: 'engineer123',
        phone: '+919876543212',
        role: roles[2]._id, // ENGINEER
        company: 'Sunce Renewables'
      },
      {
        name: 'John Doe',
        email: 'customer@example.com',
        password: 'customer123',
        phone: '+919876543213',
        role: roles[3]._id, // CUSTOMER
        company: 'ABC Solar Pvt Ltd'
      },
      {
        name: 'Test User',
        email: 'test@sunce.in',
        password: 'test123',
        phone: '+919876543214',
        role: roles[0]._id, // ADMIN
      }
    ]);

    console.log('✅ Seed complete!');
    console.log('👥 Roles:', roles.length);
    console.log('👤 Users:', users.length);
    console.log('🎫 Tickets: 0 (demo tickets skipped)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seed();
