import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import User from "../models/User.model";
import type { Document } from "mongoose";

// Verify JWT token
import { asyncHandler } from "./error.middleware";

type ReqWithUser = Request & { user?: any; permissions?: any };

export const verifyToken = asyncHandler(async (req: ReqWithUser, res: Response, next: NextFunction) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "") as { id?: string };
    const user = await User.findById(decoded.id).populate("role");
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }
});

// Check permissions: authorize(module, action)
export const authorize = (module: string, action: string) => {
  return asyncHandler(async (req: ReqWithUser, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    const roleName = String(role?.name || "").toUpperCase();

    // Business rule: SALES should have ADMIN-like access for tickets.
    // Keep it scoped to ticket actions only (other modules still depend on RBAC matrix).
    if (module === "tickets" && roleName === "SALES") return next();
    
    if (!role.permissions[module]?.[action]) {
      return res.status(403).json({
        success: false,
        message: `Access denied: Insufficient permissions for ${module}:${action}`
      });
    }

    req.permissions = role.permissions[module];
    next();
  });
};
