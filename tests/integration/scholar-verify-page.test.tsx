import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import ScholarVerifyPage from "@/app/scholar-verify/page";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import {
  createMyApplication,
  saveMyApplication,
} from "@/src/modules/verification/application/verification-service";
import { resetVerificationStoreForTesting } from "@/src/modules/verification/infrastructure/verification-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/scholar-verify",
}));

function sessionUser(roles: UserRole[], id: string) {
  return {
    id,
    phoneNumber: "+8801712345678",
    displayName: "Dr. Nadia Islam",
    locale: "bn-BD",
    roles,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
  };
}

async function signInAs(roles: UserRole[]): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Dr. Nadia Islam",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  cookieState.accessToken = result.tokens.accessToken;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: sessionUser(roles, result.user.id), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );

  return result.user.id;
}

const COMPLETE_INPUT = {
  displayName: "Dr. Nadia Islam",
  degrees: [{ degreeType: "PhD", institution: "University of Dhaka", year: "2018" }],
  affiliations: [{ role: "Associate Professor", organization: "CRMH", since: "2021" }],
  portfolio: "Archive Cities of the Bay (2024)",
  specializations: ["history of science"],
  languages: ["bn", "en"],
};

describe("ScholarVerifyPage", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetVerificationStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the credentials form for a signed-in applicant with no application yet", async () => {
    await signInAs(["learner"]);

    render(await ScholarVerifyPage());

    expect(await screen.findByText(/Signed in as Dr. Nadia Islam/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Provide verifiable evidence of academic and professional authority/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Display name/i)).toHaveValue("Dr. Nadia Islam");
    expect(screen.getByRole("button", { name: /Submit for Review/i })).toBeInTheDocument();
  });

  it("offers the review queue to an admin", async () => {
    await signInAs(["admin"]);

    render(await ScholarVerifyPage());

    expect(await screen.findByRole("link", { name: /Open the review queue/i })).toHaveAttribute(
      "href",
      "/admin/verifications",
    );
  });

  it("freezes a submitted application so the applicant can no longer edit it", async () => {
    const userId = await signInAs(["learner"]);
    const actor = { id: userId, roles: ["learner" as UserRole] };
    const created = await createMyApplication(actor, COMPLETE_INPUT);
    await saveMyApplication(actor, { status: "submitted", updatedAt: created.updatedAt });

    render(await ScholarVerifyPage());

    expect(await screen.findByRole("heading", { name: /Application submitted/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit for Review/i })).toBeNull();
  });
});
