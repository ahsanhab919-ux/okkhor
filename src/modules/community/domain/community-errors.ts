export type CommunityErrorCode =
  | "COMMUNITY_VALIDATION_FAILED"
  | "COMMUNITY_INVALID_CURSOR"
  | "COMMUNITY_THREAD_NOT_FOUND";

export class CommunityError extends Error {
  constructor(
    message: string,
    public readonly code: CommunityErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CommunityError";
  }
}
