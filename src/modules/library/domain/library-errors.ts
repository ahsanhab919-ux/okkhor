export type LibraryErrorCode = "LIBRARY_VALIDATION_FAILED" | "LIBRARY_ITEM_NOT_FOUND";

export class LibraryError extends Error {
  constructor(
    message: string,
    public readonly code: LibraryErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LibraryError";
  }
}
