import type { SummaryProvider } from "@/src/modules/summarization/domain/summarization-types";

/**
 * The deterministic test double. It derives a stable summary from the input so tests and CI
 * never make a network call and never depend on a live model's wording.
 */
export function createFakeSummaryProvider(): SummaryProvider {
  return {
    async summarize(input) {
      const subject = input.title.trim();

      return {
        summaryEn: `AI English summary: ${subject}.`,
        summaryBn: `এআই সারসংক্ষেপ: ${subject}।`,
      };
    },
  };
}

let provider: SummaryProvider | undefined;

export function getFakeSummaryProvider(): SummaryProvider {
  provider ??= createFakeSummaryProvider();

  return provider;
}

export function resetFakeSummaryProviderForTesting() {
  provider = undefined;
}
