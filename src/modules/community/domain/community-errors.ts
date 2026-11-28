export type CommunityErrorCode =
  | "COMMUNITY_VALIDATION_FAILED"
  | "COMMUNITY_INVALID_CURSOR"
  | "COMMUNITY_THREAD_NOT_FOUND"
  | "COMMUNITY_REPLY_NOT_FOUND"
  | "COMMUNITY_THREAD_LOCKED"
  | "COMMUNITY_REPORT_TARGET_NOT_FOUND"
  | "COMMUNITY_REPORT_NOT_FOUND"
  | "COMMUNITY_FORBIDDEN";

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
