import { resolveSummaryProviderName } from "@/src/modules/summarization/domain/summarization-config";
import { SummarizationError } from "@/src/modules/summarization/domain/summarization-errors";
import type { SummaryProvider } from "@/src/modules/summarization/domain/summarization-types";
import { getFakeSummaryProvider } from "@/src/modules/summarization/infrastructure/fake-summary-provider";
import { getGeminiSummaryProvider } from "@/src/modules/summarization/infrastructure/gemini-summary-provider";

/**
 * Resolves the summarization provider from `AI_SUMMARY_DRIVER`. `auto` uses the fake provider
 * under test and Gemini when `GEMINI_API_KEY` is present; otherwise it throws
 * `AI_UNAVAILABLE` (503) rather than failing silently.
 */
export function getSummaryProvider(): SummaryProvider {
  const name = resolveSummaryProviderName();

  if (name === "fake") {
    return getFakeSummaryProvider();
  }

  if (name === "gemini") {
    return getGeminiSummaryProvider();
  }

  throw new SummarizationError(
    "Summarization is not configured: set GEMINI_API_KEY, or set AI_SUMMARY_DRIVER=fake for local, non-AI work.",
    "AI_UNAVAILABLE",
    503,
  );
}
