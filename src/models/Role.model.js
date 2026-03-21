const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  description: String,
  isSystem: {
    type: Boolean,
    default: false
  },
  permissions: {
    dashboard: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    tickets: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    jobcard: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    logistics: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    sla: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    reports: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    users: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean },
    settings: { view: Boolean, create: Boolean, edit: Boolean, delete: Boolean }
  }
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
