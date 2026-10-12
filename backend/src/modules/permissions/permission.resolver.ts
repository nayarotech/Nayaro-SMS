import { ALL_PERMISSIONS, ALL_PERMISSIONS_WILDCARD } from "./permission.catalog.js";

export interface PermissionOverrideInput {
  permission: string;
  effect: "GRANT" | "DENY";
}

/**
 * A user's effective permissions:
 *   (union of all their roles' permissions) + per-user GRANTs − per-user DENYs
 *
 * "*" on a role expands to every permission in the catalog.
 * Unknown keys (e.g. a permission removed from the catalog) are ignored.
 */
export function resolvePermissions(
  rolePermissionLists: string[][],
  overrides: PermissionOverrideInput[] = [],
): Set<string> {
  const known = new Set<string>(ALL_PERMISSIONS);
  const result = new Set<string>();

  for (const permissions of rolePermissionLists) {
    for (const permission of permissions) {
      if (permission === ALL_PERMISSIONS_WILDCARD) {
        ALL_PERMISSIONS.forEach((p) => result.add(p));
      } else if (known.has(permission)) {
        result.add(permission);
      }
    }
  }

  for (const override of overrides) {
    if (!known.has(override.permission)) continue;
    if (override.effect === "GRANT") result.add(override.permission);
    else result.delete(override.permission);
  }

  return result;
}
