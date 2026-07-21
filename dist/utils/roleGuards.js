"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isElevatedRole = exports.isSuperAdmin = exports.roleNameOf = exports.ELEVATED_ROLES = exports.ADMIN = exports.SUPER_ADMIN = void 0;
exports.denyAdminManagement = denyAdminManagement;
exports.SUPER_ADMIN = "SUPER_ADMIN";
exports.ADMIN = "ADMIN";
/** Roles that only a Super Admin may grant, revoke, or delete. */
exports.ELEVATED_ROLES = [exports.ADMIN, exports.SUPER_ADMIN];
const roleNameOf = (user) => String(user?.role?.name || "").trim().toUpperCase();
exports.roleNameOf = roleNameOf;
const isSuperAdmin = (user) => (0, exports.roleNameOf)(user) === exports.SUPER_ADMIN;
exports.isSuperAdmin = isSuperAdmin;
const isElevatedRole = (roleName) => exports.ELEVATED_ROLES.includes(String(roleName || "").trim().toUpperCase());
exports.isElevatedRole = isElevatedRole;
/**
 * Guard for actions that add or remove Admins. Returns an error message when
 * the actor may not perform it, or null when allowed.
 *
 * Admins can still manage ordinary users; only elevated roles are restricted.
 */
function denyAdminManagement(actor, targetRoleName) {
    if (!(0, exports.isElevatedRole)(targetRoleName))
        return null;
    if ((0, exports.isSuperAdmin)(actor))
        return null;
    return "Only a Super Admin can add or remove Admin accounts.";
}
