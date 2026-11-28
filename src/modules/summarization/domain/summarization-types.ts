/**
 * The plain input handed to a summary provider. The summarization module never imports the
 * content module: the composition root (`app/**`) reads the item and passes it here.
 */
export type SummarizeInput = {
  title: string;
  abstract: string;
  sourceLanguage: string;
};

/**
 * The provider's output: a concise English summary and a Bangla (`bn-BD`) plain-language
 * summary. Only `summaryBn` is persisted by the caller; `summaryEn` is a transient preview.
 */
export type SummaryResult = {
  summaryEn: string;
  summaryBn: string;
};

/** The swappable summarization backend (a deterministic fake under test, else Gemini). */
export type SummaryProvider = {
  summarize(input: SummarizeInput): Promise<SummaryResult>;
};
