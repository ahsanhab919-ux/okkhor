import { NextRequest } from "next/server";

import { authErrorResponse } from "@/src/modules/identity/api/auth-http";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { verificationErrorResponse, verificationJson } from "@/src/modules/verification/api/verification-http";
import {
  createMyApplication,
  getMyApplication,
  saveMyApplication,
} from "@/src/modules/verification/application/verification-service";

import { resolveVerificationActor } from "../verification-actor";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveVerificationActor(request);
    const application = await getMyApplication(actor);

    return verificationJson({ application: application ?? null });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return verificationErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveVerificationActor(request);
    const body = await request.json();
    const application = await createMyApplication(actor, body);

    return verificationJson({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return verificationErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await resolveVerificationActor(request);
    const body = await request.json();
    const application = await saveMyApplication(actor, body);

    return verificationJson({ application });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error);
    }

    return verificationErrorResponse(error);
  }
}
