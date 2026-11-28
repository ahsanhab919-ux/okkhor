import { NextResponse } from "next/server";

import { CommunityError } from "@/src/modules/community/domain/community-errors";

export function communityJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function communityErrorResponse(error: unknown) {
  if (error instanceof CommunityError) {
    return communityJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return communityJson(
    {
      error: {
        code: "COMMUNITY_UNKNOWN",
        message: "Unexpected community service failure.",
      },
    },
    { status: 500 },
  );
}
