export type SummarizationErrorCode = "AI_SUMMARY_FAILED" | "AI_UNAVAILABLE" | "AI_UNKNOWN";

export class SummarizationError extends Error {
  constructor(
    message: string,
    public readonly code: SummarizationErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SummarizationError";
  }
}
