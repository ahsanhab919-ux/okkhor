import { z } from "zod";

export const MAX_SUMMARY_LENGTH = 5000;

/**
 * The input the service validates before calling a provider. `title` and `abstract` are the
 * item's raw fields; `sourceLanguage` describes the abstract's language.
 */
export const summarizeInputSchema = z.object({
  title: z.string().trim().min(1, "A title is required to summarize.").max(200),
  abstract: z.string().trim().min(1, "An abstract is required to summarize.").max(5000),
  sourceLanguage: z.string().trim().min(2).max(20),
});

/**
 * The provider's output contract. Both summaries must be non-empty and within the length cap;
 * an empty or over-long result is rejected and surfaces as `AI_SUMMARY_FAILED`.
 */
export const summaryResultSchema = z.object({
  summaryEn: z
    .string()
    .trim()
    .min(1, "The provider returned an empty English summary.")
    .max(MAX_SUMMARY_LENGTH, "The English summary is too long."),
  summaryBn: z
    .string()
    .trim()
    .min(1, "The provider returned an empty Bangla summary.")
    .max(MAX_SUMMARY_LENGTH, "The Bangla summary is too long."),
});

export type SummarizeInputPayload = z.infer<typeof summarizeInputSchema>;
export type SummaryResultPayload = z.infer<typeof summaryResultSchema>;
