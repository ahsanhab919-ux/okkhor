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

export type CreateThreadPayload = z.infer<typeof createThreadSchema>;
export type CreateReplyPayload = z.infer<typeof createReplySchema>;
