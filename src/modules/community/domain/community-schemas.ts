import { z } from "zod";

/**
 * The create-thread payload. `title` and `body` are required and non-empty; `category` is an
 * optional free-text label that defaults to `General`.
 */
export const createThreadSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(200, "The title is too long."),
  body: z.string().trim().min(1, "A body is required.").max(10000, "The body is too long."),
  category: z
    .string()
    .trim()
    .min(2, "The category is too short.")
    .max(60, "The category is too long.")
    .default("General"),
});

/** The create-reply payload. `body` is required and non-empty. */
export const createReplySchema = z.object({
  body: z.string().trim().min(1, "A reply is required.").max(10000, "The reply is too long."),
});

/** The moderator note is optional context for the audit trail, never shown to members. */
const moderationNoteSchema = z.string().trim().max(500, "The moderation note is too long.").optional();

/** The thread moderation payload: any of the four verbs. */
export const moderateThreadSchema = z.object({
  action: z.enum(["hide", "restore", "lock", "unlock"], {
    message: "A moderation action must be hide, restore, lock, or unlock.",
  }),
  note: moderationNoteSchema,
});

/** The reply moderation payload: replies can only be hidden or restored. */
export const moderateReplySchema = z.object({
  action: z.enum(["hide", "restore"], {
    message: "A reply moderation action must be hide or restore.",
  }),
  note: moderationNoteSchema,
});

/**
 * The member report payload. `detail` is optional, free-text context for the moderator, and is
 * bounded like the other long-form fields (`member-reporting-slice.md` §6.1).
 */
export const createReportSchema = z.object({
  targetType: z.enum(["thread", "reply"], {
    message: "A report target must be a thread or a reply.",
  }),
  targetId: z.string().trim().min(1, "A report target id is required."),
  reason: z.enum(["spam", "harassment", "misinformation", "off-topic", "other"], {
    message: "A report reason must be spam, harassment, misinformation, off-topic, or other.",
  }),
  detail: z.string().trim().max(1000, "The report detail is too long.").optional(),
});

/** The triage payload: close a report as `resolve` or `dismiss`, with an optional note. */
export const resolveReportSchema = z.object({
  action: z.enum(["resolve", "dismiss"], {
    message: "A report action must be resolve or dismiss.",
  }),
  note: moderationNoteSchema,
});

export type CreateThreadPayload = z.infer<typeof createThreadSchema>;
export type CreateReplyPayload = z.infer<typeof createReplySchema>;
export type ModerateThreadPayload = z.infer<typeof moderateThreadSchema>;
export type ModerateReplyPayload = z.infer<typeof moderateReplySchema>;
export type CreateReportPayload = z.infer<typeof createReportSchema>;
export type ResolveReportPayload = z.infer<typeof resolveReportSchema>;
