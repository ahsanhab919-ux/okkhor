export class ContentError extends Error {
  constructor(
    message: string,
    public readonly code: "CONTENT_ITEM_NOT_FOUND" | "CONTENT_INVALID_CURSOR",
    public readonly status: number,
  ) {
    super(message);
    this.name = "ContentError";
  }
}
