import { z } from "zod";

const researchItemStatusSchema = z.enum(["draft", "published"]);

const tagsSchema = z.array(z.string().trim().min(1)).max(20);

/**
 * The authoring payload. `title`, `abstract`, and `summaryBn` are required and non-empty;
 * `tags` defaults to `[]`, `sourceLanguage` to `en`, and `status` to `draft`.
 */
export const createItemSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title is too long."),
  abstract: z.string().trim().min(1, "Abstract is required.").max(5000, "Abstract is too long."),
  summaryBn: z.string().trim().min(1, "The Bangla summary is required.").max(5000, "The Bangla summary is too long."),
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
  summaryBn: z
    .string()
    .trim()
    .min(1, "The Bangla summary is required.")
    .max(5000, "The Bangla summary is too long.")
    .optional(),
  sourceLanguage: z.string().trim().min(2).max(20).optional(),
  tags: tagsSchema.optional(),
  sourceUrl: z.string().trim().max(2048).optional(),
  status: researchItemStatusSchema.optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export type CreateItemPayload = z.infer<typeof createItemSchema>;
export type UpdateItemPayload = z.infer<typeof updateItemSchema>;
