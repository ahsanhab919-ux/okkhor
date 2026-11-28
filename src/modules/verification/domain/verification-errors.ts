export type VerificationErrorCode =
  | "VERIFICATION_VALIDATION_FAILED"
  | "VERIFICATION_FORBIDDEN"
  | "VERIFICATION_APPLICATION_NOT_FOUND"
  | "VERIFICATION_CONFLICT";

export class VerificationError extends Error {
  constructor(
    message: string,
    public readonly code: VerificationErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}
