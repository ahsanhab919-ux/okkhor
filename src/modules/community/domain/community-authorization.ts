import type { UserRole } from "@/src/modules/identity/domain/auth-types";

const MODERATION_ROLES: readonly UserRole[] = ["admin"];

/**
 * Only administrators may hide, restore, or lock community content. Membership posting stays
 * role-free; moderation is a separate, narrower power (`community-moderation-slice.md` §7).
 */
export function canModerate(roles: readonly UserRole[]): boolean {
  return roles.some((role) => MODERATION_ROLES.includes(role));
}
