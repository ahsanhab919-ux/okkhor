import { ZodError } from "zod";

import { SummarizationError } from "@/src/modules/summarization/domain/summarization-errors";
import { summarizeInputSchema, summaryResultSchema } from "@/src/modules/summarization/domain/summarization-schemas";
import type {
  SummarizeInput,
  SummaryProvider,
  SummaryResult,
} from "@/src/modules/summarization/domain/summarization-types";
import { getSummaryProvider } from "@/src/modules/summarization/infrastructure/summary-provider";

/**
 * Validates a value against a schema, converting a `ZodError` into `AI_SUMMARY_FAILED` (502).
 * Both the input and the provider's output are unusable-as-is if they fail, so both share
 * this mapping.
 */
function parseSummarizationSchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Summarization request failed validation.";
      throw new SummarizationError(detail, "AI_SUMMARY_FAILED", 502);
    }

    throw error;
  }
}

/**
 * Produces an English and a Bangla summary from an item's title and abstract. The input is
 * validated, the configured provider is called, and the provider's output is validated before
 * it is returned. A provider failure or an unusable result becomes `AI_SUMMARY_FAILED` (502);
 * a missing provider configuration becomes `AI_UNAVAILABLE` (503) from the selector.
 *
 * `provider` is an optional test seam; production callers omit it and the selector resolves the
 * configured provider.
 */
export async function summarizeResearchItem(
  input: SummarizeInput,
  provider?: SummaryProvider,
): Promise<SummaryResult> {
  const parsedInput = parseSummarizationSchema(summarizeInputSchema, input);
  const resolvedProvider = provider ?? getSummaryProvider();
  let raw: unknown;

  try {
    raw = await resolvedProvider.summarize(parsedInput);
  } catch (error) {
    if (error instanceof SummarizationError) {
      throw error;
    }

    throw new SummarizationError("The summary provider failed.", "AI_SUMMARY_FAILED", 502);
  }

  return parseSummarizationSchema(summaryResultSchema, raw);
}
