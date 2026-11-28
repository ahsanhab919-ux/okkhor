import { NextRequest } from "next/server";

import { communityErrorResponse, communityJson } from "@/src/modules/community/api/community-http";
import { listModerationReports } from "@/src/modules/community/application/community-service";
import type { ReportStatus } from "@/src/modules/community/domain/community-types";
import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";

import { resolveCommunityActor } from "../../community-actor";

export const runtime = "nodejs";

const REPORT_STATUSES: ReportStatus[] = ["open", "resolved", "dismissed"];

function parseStatus(value: string | null): ReportStatus | undefined {
  return value && REPORT_STATUSES.includes(value as ReportStatus) ? (value as ReportStatus) : undefined;
}

/** The report queue: open reports by default, newest first, each with the reported content. Administrators only. */
export async function GET(request: NextRequest) {
  try {
    const actor = await resolveCommunityActor(request);
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const status = parseStatus(request.nextUrl.searchParams.get("status"));
    const entries = await listModerationReports(actor, { limit, status });

    return communityJson({ entries });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return communityErrorResponse(error);
  }
}
