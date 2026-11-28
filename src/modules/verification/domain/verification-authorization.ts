import type { UserRole } from "@/src/modules/identity/domain/auth-types";

const REVIEW_ROLES: readonly UserRole[] = ["admin"];

/** Only administrators may list, read, or decide applications. */
export function canReview(roles: readonly UserRole[]): boolean {
  return roles.some((role) => REVIEW_ROLES.includes(role));
}
