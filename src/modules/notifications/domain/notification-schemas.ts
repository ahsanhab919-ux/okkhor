import { z } from "zod";

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_SIZE = 50;

/**
 * Parses the inbox `limit`. An absent, non-numeric, or non-positive value falls back to the default
 * page size and any value above the maximum is clamped, so the parse never fails — `limit` is a
 * best-effort narrowing, matching the other lists' clamps (`notifications-slice.md` §6).
 */
function clampLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_NOTIFICATION_PAGE_SIZE;
  }

  return Math.min(Math.floor(parsed), MAX_NOTIFICATION_PAGE_SIZE);
}

export const listNotificationsSchema = z
  .object({ limit: z.unknown().optional() })
  .transform(({ limit }) => ({ limit: clampLimit(limit) }));

export type ListNotificationsPayload = z.infer<typeof listNotificationsSchema>;
