import { SummarizationError } from "@/src/modules/summarization/domain/summarization-errors";
import type { SummaryProvider } from "@/src/modules/summarization/domain/summarization-types";
import { getFakeSummaryProvider } from "@/src/modules/summarization/infrastructure/fake-summary-provider";
import { getGeminiSummaryProvider } from "@/src/modules/summarization/infrastructure/gemini-summary-provider";

type AiSummaryDriver = "auto" | "fake" | "gemini";

function getAiSummaryDriver(): AiSummaryDriver {
  const driver = process.env.AI_SUMMARY_DRIVER;

  if (driver === "fake" || driver === "gemini") {
    return driver;
  }

  return "auto";
}

/**
 * Resolves the summarization provider from `AI_SUMMARY_DRIVER`. `auto` uses the fake provider
 * under test and Gemini when `GEMINI_API_KEY` is present; otherwise it throws
 * `AI_UNAVAILABLE` (503) rather than failing silently.
 */
export function getSummaryProvider(): SummaryProvider {
  const driver = getAiSummaryDriver();

  if (driver === "fake") {
    return getFakeSummaryProvider();
  }

  if (driver === "gemini") {
    return getGeminiSummaryProvider();
  }

  if (process.env.NODE_ENV === "test") {
    return getFakeSummaryProvider();
  }

  if (process.env.GEMINI_API_KEY) {
    return getGeminiSummaryProvider();
  }

  throw new SummarizationError(
    "Summarization is not configured: set GEMINI_API_KEY, or set AI_SUMMARY_DRIVER=fake for local, non-AI work.",
    "AI_UNAVAILABLE",
    503,
  );
}
