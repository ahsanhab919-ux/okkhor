export type ContentErrorCode =
  | "CONTENT_ITEM_NOT_FOUND"
  | "CONTENT_INVALID_CURSOR"
  | "CONTENT_FORBIDDEN"
  | "CONTENT_VALIDATION_FAILED"
  | "CONTENT_CONFLICT";

export class ContentError extends Error {
  constructor(
    message: string,
    public readonly code: ContentErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ContentError";
  }
}
