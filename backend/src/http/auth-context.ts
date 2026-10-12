import { prisma } from "../lib/prisma.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { ALL_PERMISSIONS } from "../modules/permissions/permission.catalog.js";
import { resolvePermissions } from "../modules/permissions/permission.resolver.js";

/** Everything the API knows about the caller, attached to each authenticated request. */
export interface AuthContext {
  userId: string;
  /** The school this request acts on. Super admins choose it with the X-School-Id header. */
  schoolId: string | null;
  isSuperAdmin: boolean;
  roleKeys: string[];
  permissions: Set<string>;
}

/**
 * Turn a Bearer token into an AuthContext. Permissions are loaded fresh on every
 * request so role changes take effect immediately (no re-login needed).
 */
export async function loadAuthContext(
  authorizationHeader: string | undefined,
  schoolIdHeader: string | undefined,
): Promise<AuthContext> {
  const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7) : undefined;
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized("Session expired, please log in again");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      schoolId: true,
      isSuperAdmin: true,
      isActive: true,
      school: { select: { isActive: true } },
      roles: { select: { role: { select: { key: true, permissions: { select: { permission: true } } } } } },
      permissionOverrides: { select: { permission: true, effect: true } },
    },
  });
  if (!user || !user.isActive) throw unauthorized("Account is disabled");

  if (user.isSuperAdmin) {
    return {
      userId: user.id,
      schoolId: schoolIdHeader || null,
      isSuperAdmin: true,
      roleKeys: ["super_admin"],
      permissions: new Set(ALL_PERMISSIONS),
    };
  }

  if (user.school && !user.school.isActive) throw forbidden("This school's account is suspended");

  return {
    userId: user.id,
    schoolId: user.schoolId,
    isSuperAdmin: false,
    roleKeys: user.roles.map((r) => r.role.key),
    permissions: resolvePermissions(
      user.roles.map((r) => r.role.permissions.map((p) => p.permission)),
      user.permissionOverrides,
    ),
  };
}
