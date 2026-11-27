export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "AUTH_VALIDATION_FAILED"
      | "AUTH_USER_EXISTS"
      | "AUTH_INVALID_CREDENTIALS"
      | "AUTH_UNAUTHORIZED"
      | "AUTH_TOKEN_INVALID"
      | "AUTH_TOKEN_EXPIRED"
      | "AUTH_RESET_INVALID",
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
