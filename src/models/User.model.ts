import mongoose from "mongoose";
import bcrypt from "bcryptjs";

function isBcryptHash(v: unknown): v is string {
  return typeof v === "string" && /^\$2[aby]\$/.test(v);
}

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 chars']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please use a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  phone: {
    type: String,
    required: [true, "Phone is required"],
    trim: true,
    match: [/^\+?\d{10,15}$/, 'Phone number invalid']
  },
  role: {
    type: mongoose.Schema.ObjectId,
    ref: 'Role',
    required: true
  },
  company: {
    type: String,
    maxlength: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

// Hash password pre-save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  const stored = this.password;
  if (stored === undefined || stored === null) return false;

  const candidate = String(candidatePassword ?? "");

  // Legacy compatibility: if password was inserted without hashing (e.g., via `insertMany()`),
  // treat it as plaintext for comparison.
  if (!isBcryptHash(stored)) return candidate === String(stored);

  try {
    return await bcrypt.compare(candidate, stored);
  } catch {
    return false;
  }
};

export default mongoose.model("User", userSchema);
