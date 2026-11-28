import { z } from "zod";

const researchItemStatusSchema = z.enum(["draft", "published"]);

const tagsSchema = z.array(z.string().trim().min(1)).max(20);

/**
 * When supplied, the Bangla summary must be non-empty and within the length cap. It is optional
 * to save (a draft may omit it and store `""`); it becomes required at publish time, enforced by
 * the service's publish invariant and filled by the AI summarization composition when blank.
 */
const summaryBnSchema = z
  .string()
  .trim()
  .min(1, "The Bangla summary cannot be blank.")
  .max(5000, "The Bangla summary is too long.");

/**
 * The authoring payload. `title` and `abstract` are required and non-empty; `summaryBn` may be
 * omitted (stored as `""`) and is filled on publish; `tags` defaults to `[]`, `sourceLanguage`
 * to `en`, and `status` to `draft`.
 */
export const createItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title is too long."),
  abstract: z.string().trim().min(1, "Abstract is required.").max(5000, "Abstract is too long."),
  summaryBn: summaryBnSchema.default(""),
  sourceLanguage: z.string().trim().min(2).max(20).default("en"),
  tags: tagsSchema.default([]),
  sourceUrl: z.string().trim().max(2048).optional(),
  status: researchItemStatusSchema.default("draft"),
});

/**
 * The edit payload: every create field is optional, so a PATCH may send a partial change.
 * `updatedAt` is the value the client last read; the service uses it for the concurrency check.
 */
export const updateItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title is too long.").optional(),
  abstract: z.string().trim().min(1, "Abstract is required.").max(5000, "Abstract is too long.").optional(),
  summaryBn: summaryBnSchema.optional(),
  sourceLanguage: z.string().trim().min(2).max(20).optional(),
  tags: tagsSchema.optional(),
  sourceUrl: z.string().trim().max(2048).optional(),
  status: researchItemStatusSchema.optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export type CreateItemPayload = z.infer<typeof createItemSchema>;
export type UpdateItemPayload = z.infer<typeof updateItemSchema>;
