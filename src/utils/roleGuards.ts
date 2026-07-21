export const SUPER_ADMIN = "SUPER_ADMIN";
export const ADMIN = "ADMIN";

/** Roles that only a Super Admin may grant, revoke, or delete. */
export const ELEVATED_ROLES = [ADMIN, SUPER_ADMIN];

export const roleNameOf = (user: any): string =>
  String(user?.role?.name || "").trim().toUpperCase();

export const isSuperAdmin = (user: any): boolean => roleNameOf(user) === SUPER_ADMIN;

export const isElevatedRole = (roleName: string): boolean =>
  ELEVATED_ROLES.includes(String(roleName || "").trim().toUpperCase());

/**
 * Guard for actions that add or remove Admins. Returns an error message when
 * the actor may not perform it, or null when allowed.
 *
 * Admins can still manage ordinary users; only elevated roles are restricted.
 */
export function denyAdminManagement(actor: any, targetRoleName: string): string | null {
  if (!isElevatedRole(targetRoleName)) return null;
  if (isSuperAdmin(actor)) return null;
  return "Only a Super Admin can add or remove Admin accounts.";
}
