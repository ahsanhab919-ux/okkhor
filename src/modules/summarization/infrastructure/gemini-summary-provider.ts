import {
  resolveSummaryModel,
  resolveSummaryTimeoutMs,
} from "@/src/modules/summarization/domain/summarization-config";
import { SummarizationError } from "@/src/modules/summarization/domain/summarization-errors";
import type { SummaryProvider, SummaryResult } from "@/src/modules/summarization/domain/summarization-types";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summaryEn: { type: "STRING" },
    summaryBn: { type: "STRING" },
  },
  required: ["summaryEn", "summaryBn"],
} as const;

function buildPrompt(input: { title: string; abstract: string; sourceLanguage: string }): string {
  return [
    "You write plain-language research summaries for a South Asian audience.",
    `The source abstract is written in "${input.sourceLanguage}".`,
    "Return two summaries of the abstract:",
    "1. summaryEn: a concise plain-language English summary for a general reader.",
    "2. summaryBn: the same summary in Bangla (bn-BD), plain language, for a similar reader.",
    "Do not translate the title. Do not add commentary, only the summaries.",
    `Title: ${input.title}`,
    `Abstract: ${input.abstract}`,
  ].join("\n");
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

/** Reads the JSON summary text out of the Gemini envelope, or throws `AI_SUMMARY_FAILED`. */
function extractSummaryText(payload: GeminiResponse): string {
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

  if (!text.trim()) {
    throw new SummarizationError("The summary provider returned no content.", "AI_SUMMARY_FAILED", 502);
  }

  return text;
}

/** Parses the model's JSON output into a `SummaryResult`, or throws `AI_SUMMARY_FAILED`. */
function parseSummaryText(text: string): SummaryResult {
  try {
    const parsed = JSON.parse(text) as Partial<SummaryResult>;

    return {
      summaryEn: typeof parsed.summaryEn === "string" ? parsed.summaryEn : "",
      summaryBn: typeof parsed.summaryBn === "string" ? parsed.summaryBn : "",
    };
  } catch {
    throw new SummarizationError("The summary provider returned an unreadable response.", "AI_SUMMARY_FAILED", 502);
  }
}

export function createGeminiSummaryProvider(): SummaryProvider {
  return {
    async summarize(input) {
      const apiKey = process.env.GEMINI_API_KEY;
      const model = resolveSummaryModel();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey ?? ""}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resolveSummaryTimeoutMs());

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(input) }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        });

        if (!response.ok) {
          throw new SummarizationError("The summary provider rejected the request.", "AI_SUMMARY_FAILED", 502);
        }

        return parseSummaryText(extractSummaryText((await response.json()) as GeminiResponse));
      } catch (error) {
        if (error instanceof SummarizationError) {
          throw error;
        }

        throw new SummarizationError("The summary provider could not be reached.", "AI_SUMMARY_FAILED", 502);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let provider: SummaryProvider | undefined;

export function getGeminiSummaryProvider(): SummaryProvider {
  provider ??= createGeminiSummaryProvider();

  return provider;
}

export function resetGeminiSummaryProviderForTesting() {
  provider = undefined;
}
