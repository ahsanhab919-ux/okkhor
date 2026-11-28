export type SearchErrorCode = "SEARCH_VALIDATION_FAILED" | "SEARCH_UNKNOWN";

export class SearchError extends Error {
  constructor(
    message: string,
    public readonly code: SearchErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SearchError";
  }
}
