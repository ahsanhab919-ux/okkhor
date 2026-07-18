import { NextResponse } from "next/server";

import { getRuntimeStatus } from "@/src/modules/platform/domain/runtime-status";

export async function GET(): Promise<Response> {
  return NextResponse.json(getRuntimeStatus(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
