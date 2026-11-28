import { NextRequest } from "next/server";

import { getAuthRepository } from "@/src/modules/identity/infrastructure/auth-repository";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { resetVerificationStoreForTesting } from "@/src/modules/verification/infrastructure/verification-store";

import { GET as getMyApplicationRoute, PATCH as saveMyApplicationRoute, POST as createMyApplicationRoute } from "@/app/api/verification/application/route";
import { PATCH as decideApplicationRoute } from "@/app/api/verification/applications/[id]/route";
import { GET as listApplicationsRoute } from "@/app/api/verification/applications/route";

const APPLICATION_URL = "http://localhost/api/verification/application";
const APPLICATIONS_URL = "http://localhost/api/verification/applications";

type ApplicationPayload = {
  application: { id: string; status: string; updatedAt: string; applicantId: string; submittedAt?: string } | null;
};

type ErrorPayload = {
  error: { code: string };
};

const COMPLETE_INPUT = {
  displayName: "Dr. Nadia Islam",
  degrees: [{ degreeType: "PhD", institution: "University of Dhaka", year: "2018" }],
  affiliations: [{ role: "Associate Professor", organization: "CRMH", since: "2021" }],
  portfolio: "Archive Cities of the Bay (2024)",
  specializations: ["history of science"],
  languages: ["bn", "en"],
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = APPLICATION_URL) {
  const request = new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (token) {
    request.cookies.set(ACCESS_TOKEN_COOKIE, token);
  }

  return request;
}

function applicationContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function persona(roles: UserRole[], phoneNumber: string) {
  const result = await registerUser({
    phoneNumber,
    displayName: "Applicant Persona",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  return { token: result.tokens.accessToken, userId: result.user.id };
}

describe("verification routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetVerificationStoreForTesting();
  });

  it("rejects unauthenticated applicant reads with 401", async () => {
    const response = await getMyApplicationRoute(jsonRequest("GET"));

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("returns null when the caller has no application", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const response = await getMyApplicationRoute(jsonRequest("GET", undefined, applicant.token));
    const payload = (await response.json()) as ApplicationPayload;

    expect(response.status).toBe(200);
    expect(payload.application).toBeNull();
  });

  it("rejects an invalid create payload with 400", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const response = await createMyApplicationRoute(
      jsonRequest("POST", { displayName: "" }, applicant.token),
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("VERIFICATION_VALIDATION_FAILED");
  });

  it("creates a draft, submits it, and reflects the submitted state", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const createResponse = await createMyApplicationRoute(
      jsonRequest("POST", { ...COMPLETE_INPUT, status: "draft" }, applicant.token),
    );
    const created = (await createResponse.json()) as ApplicationPayload;

    expect(createResponse.status).toBe(201);
    expect(created.application).toMatchObject({ status: "draft", applicantId: applicant.userId });

    const submitResponse = await saveMyApplicationRoute(
      jsonRequest("PATCH", { status: "submitted" }, applicant.token),
    );
    const submitted = (await submitResponse.json()) as ApplicationPayload;

    expect(submitResponse.status).toBe(200);
    expect(submitted.application).toMatchObject({ status: "submitted" });
    expect(submitted.application?.submittedAt).toBeTruthy();
  });

  it("rejects editing a submitted application with 409", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const created = (await (
      await createMyApplicationRoute(jsonRequest("POST", { ...COMPLETE_INPUT, status: "submitted" }, applicant.token))
    ).json()) as ApplicationPayload;

    expect(created.application?.status).toBe("submitted");

    const response = await saveMyApplicationRoute(
      jsonRequest("PATCH", { displayName: "Changed" }, applicant.token),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("VERIFICATION_CONFLICT");
  });

  it("forbids a learner from listing the review queue with 403", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const response = await listApplicationsRoute(
      jsonRequest("GET", undefined, applicant.token, `${APPLICATIONS_URL}?status=submitted`),
    );

    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("VERIFICATION_FORBIDDEN");
  });

  it("approves a submitted application and grants the applicant the scholar role", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const admin = await persona(["admin"], "01787654321");

    const created = (await (
      await createMyApplicationRoute(jsonRequest("POST", { ...COMPLETE_INPUT, status: "submitted" }, applicant.token))
    ).json()) as ApplicationPayload;
    const applicationId = created.application!.id;

    const listResponse = await listApplicationsRoute(
      jsonRequest("GET", undefined, admin.token, `${APPLICATIONS_URL}?status=submitted`),
    );
    const listed = (await listResponse.json()) as { applications: { id: string }[] };

    expect(listResponse.status).toBe(200);
    expect(listed.applications.map((entry) => entry.id)).toContain(applicationId);

    const decideResponse = await decideApplicationRoute(
      jsonRequest("PATCH", { status: "approved", reviewNote: "Welcome." }, admin.token, `${APPLICATIONS_URL}/${applicationId}`),
      applicationContext(applicationId),
    );
    const decided = (await decideResponse.json()) as ApplicationPayload;

    expect(decideResponse.status).toBe(200);
    expect(decided.application).toMatchObject({ status: "approved", reviewedBy: admin.userId });

    const storedUser = await getAuthRepository().getUserById(applicant.userId);

    expect(storedUser?.roles).toContain("scholar");
  });

  it("leaves roles unchanged when an application is rejected", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const admin = await persona(["admin"], "01787654321");

    const created = (await (
      await createMyApplicationRoute(jsonRequest("POST", { ...COMPLETE_INPUT, status: "submitted" }, applicant.token))
    ).json()) as ApplicationPayload;
    const applicationId = created.application!.id;

    const decideResponse = await decideApplicationRoute(
      jsonRequest("PATCH", { status: "rejected", reviewNote: "More evidence." }, admin.token, `${APPLICATIONS_URL}/${applicationId}`),
      applicationContext(applicationId),
    );

    expect(decideResponse.status).toBe(200);
    expect(((await decideResponse.json()) as ApplicationPayload).application?.status).toBe("rejected");

    const storedUser = await getAuthRepository().getUserById(applicant.userId);

    expect(storedUser?.roles).not.toContain("scholar");
  });

  it("refuses to decide an application that is only a draft", async () => {
    const applicant = await persona(["learner"], "01712345678");
    const admin = await persona(["admin"], "01787654321");

    const created = (await (
      await createMyApplicationRoute(jsonRequest("POST", COMPLETE_INPUT, applicant.token))
    ).json()) as ApplicationPayload;
    const applicationId = created.application!.id;

    const response = await decideApplicationRoute(
      jsonRequest("PATCH", { status: "approved" }, admin.token, `${APPLICATIONS_URL}/${applicationId}`),
      applicationContext(applicationId),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("VERIFICATION_CONFLICT");
  });
});
