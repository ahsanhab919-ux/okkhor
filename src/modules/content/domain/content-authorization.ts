import type { UserRole } from "@/src/modules/identity/domain/auth-types";

const AUTHOR_ROLES: readonly UserRole[] = ["scholar", "admin"];

/** `scholar` and `admin` may author research items; `learner` may not. */
export function canAuthor(roles: readonly UserRole[]): boolean {
  return roles.some((role) => AUTHOR_ROLES.includes(role));
}
