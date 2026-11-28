import { vi } from "vitest";

import { grantUserRole, registerUser } from "@/src/modules/identity/application/auth-service";
import { AuthError } from "@/src/modules/identity/domain/auth-errors";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import {
  createMyApplication,
  decideApplication,
  getApplicationForReview,
  getMyApplication,
  listApplicationsForReview,
  saveMyApplication,
} from "@/src/modules/verification/application/verification-service";
import { canReview } from "@/src/modules/verification/domain/verification-authorization";
import { VerificationError } from "@/src/modules/verification/domain/verification-errors";
import { decideVerificationSchema, saveVerificationSchema } from "@/src/modules/verification/domain/verification-schemas";
import { canApplicantEdit, canReviewStatus } from "@/src/modules/verification/domain/verification-state";
import type { VerificationActor } from "@/src/modules/verification/domain/verification-types";
import {
  getMemoryVerificationRepository,
  resetVerificationStoreForTesting,
} from "@/src/modules/verification/infrastructure/verification-store";

const applicant: VerificationActor = { id: "u-applicant", roles: ["learner"] };
const admin: VerificationActor = { id: "u-admin", roles: ["admin"] };
const scholar: VerificationActor = { id: "u-scholar", roles: ["scholar"] };

const COMPLETE_INPUT = {
  displayName: "Dr. Nadia Islam",
  degrees: [{ degreeType: "PhD", institution: "University of Dhaka", year: "2018" }],
  affiliations: [{ role: "Associate Professor", organization: "CRMH", since: "2021" }],
  portfolio: "Archive Cities of the Bay (2024)",
  specializations: ["history of science"],
  languages: ["bn", "en"],
};

async function seedSubmittedApplication() {
  const created = await createMyApplication(applicant, COMPLETE_INPUT);
  return saveMyApplication(applicant, { status: "submitted", updatedAt: created.updatedAt });
}

describe("verification domain rules", () => {
  it("validates the save payload and rejects an unknown status", () => {
    expect(saveVerificationSchema.parse({})).toEqual({});
    expect(saveVerificationSchema.parse({ displayName: "  A  " }).displayName).toBe("A");
    expect(() => saveVerificationSchema.parse({ status: "approved" })).toThrow();
    expect(() => saveVerificationSchema.parse({ displayName: "" })).toThrow();
  });

  it("requires a decision status", () => {
    expect(decideVerificationSchema.parse({ status: "approved" }).status).toBe("approved");
    expect(() => decideVerificationSchema.parse({ status: "draft" })).toThrow();
  });

  it("permits applicant edits only for draft and rejected applications", () => {
    expect(canApplicantEdit("draft")).toBe(true);
    expect(canApplicantEdit("rejected")).toBe(true);
    expect(canApplicantEdit("submitted")).toBe(false);
    expect(canApplicantEdit("approved")).toBe(false);
  });

  it("permits review only for submitted applications", () => {
    expect(canReviewStatus("submitted")).toBe(true);
    expect(canReviewStatus("draft")).toBe(false);
    expect(canReviewStatus("approved")).toBe(false);
    expect(canReviewStatus("rejected")).toBe(false);
  });

  it("grants review rights to admins only", () => {
    expect(canReview(["admin"])).toBe(true);
    expect(canReview(["scholar", "admin"])).toBe(true);
    expect(canReview(["scholar"])).toBe(false);
    expect(canReview(["learner"])).toBe(false);
  });
});

describe("verification service", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetVerificationStoreForTesting();
  });

  it("creates a draft application for the caller", async () => {
    const application = await createMyApplication(applicant, { displayName: "Dr. Nadia Islam" });

    expect(application).toMatchObject({ applicantId: "u-applicant", status: "draft", displayName: "Dr. Nadia Islam" });
    expect(application.degrees).toEqual([]);
    expect(application.submittedAt).toBeUndefined();
    expect(await getMyApplication(applicant)).toMatchObject({ id: application.id });
    expect(await getMyApplication({ id: "someone-else", roles: ["learner"] })).toBeUndefined();
  });

  it("rejects a second application for the same user", async () => {
    await createMyApplication(applicant, { displayName: "First" });

    await expect(createMyApplication(applicant, { displayName: "Second" })).rejects.toMatchObject({
      code: "VERIFICATION_CONFLICT",
      status: 409,
    });
  });

  it("returns 404 when saving without an application", async () => {
    await expect(saveMyApplication(applicant, { displayName: "x" })).rejects.toMatchObject({
      code: "VERIFICATION_APPLICATION_NOT_FOUND",
      status: 404,
    });
  });

  it("edits a draft in place", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
      const created = await createMyApplication(applicant, { displayName: "Draft name" });

      vi.setSystemTime(new Date("2026-05-01T00:00:10.000Z"));
      const updated = await saveMyApplication(applicant, {
        portfolio: "New portfolio",
        updatedAt: created.updatedAt,
      });

      expect(updated).toMatchObject({ status: "draft", displayName: "Draft name", portfolio: "New portfolio" });
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it("submits a complete draft and stamps submittedAt", async () => {
    const created = await createMyApplication(applicant, COMPLETE_INPUT);
    const submitted = await saveMyApplication(applicant, { status: "submitted", updatedAt: created.updatedAt });

    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).toBeTruthy();
  });

  it("refuses an incomplete submission", async () => {
    const created = await createMyApplication(applicant, { displayName: "No evidence yet" });

    await expect(
      saveMyApplication(applicant, { status: "submitted", updatedAt: created.updatedAt }),
    ).rejects.toMatchObject({ code: "VERIFICATION_VALIDATION_FAILED", status: 400 });
  });

  it("freezes a submitted application to the applicant", async () => {
    const submitted = await seedSubmittedApplication();

    await expect(
      saveMyApplication(applicant, { displayName: "Changed", updatedAt: submitted.updatedAt }),
    ).rejects.toMatchObject({ code: "VERIFICATION_CONFLICT", status: 409 });
  });

  it("rejects a stale applicant write", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
      const created = await createMyApplication(applicant, { displayName: "First" });

      vi.setSystemTime(new Date("2026-05-01T00:00:10.000Z"));
      await saveMyApplication(applicant, { displayName: "Second", updatedAt: created.updatedAt });

      vi.setSystemTime(new Date("2026-05-01T00:00:20.000Z"));
      await expect(
        saveMyApplication(applicant, { displayName: "Stale", updatedAt: created.updatedAt }),
      ).rejects.toMatchObject({ code: "VERIFICATION_CONFLICT", status: 409 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows a rejected application to be edited and resubmitted, clearing the prior review", async () => {
    const submitted = await seedSubmittedApplication();
    const rejected = await decideApplication(admin, submitted.id, {
      status: "rejected",
      reviewNote: "Add more evidence.",
      updatedAt: submitted.updatedAt,
    });

    expect(rejected.reviewNote).toBe("Add more evidence.");

    const resubmitted = await saveMyApplication(applicant, { status: "submitted", updatedAt: rejected.updatedAt });

    expect(resubmitted.status).toBe("submitted");
    expect(resubmitted.reviewNote).toBeUndefined();
    expect(resubmitted.reviewedBy).toBeUndefined();
  });

  it("shows drafts to the applicant", async () => {
    await createMyApplication(applicant, { displayName: "Draft name" });

    expect(await getMyApplication(applicant)).toMatchObject({ status: "draft" });
  });
});

describe("verification review service", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetVerificationStoreForTesting();
  });

  it("forbids non-admins from listing or deciding", async () => {
    await seedSubmittedApplication();

    await expect(listApplicationsForReview(scholar)).rejects.toMatchObject({
      code: "VERIFICATION_FORBIDDEN",
      status: 403,
    });
    await expect(getApplicationForReview(scholar, "any")).rejects.toBeInstanceOf(VerificationError);
  });

  it("lists submitted applications for an admin and filters by status", async () => {
    await createMyApplication(applicant, { displayName: "Draft name" });

    expect(await listApplicationsForReview(admin, "submitted")).toHaveLength(0);
    expect(await listApplicationsForReview(admin, "draft")).toHaveLength(1);
    await expect(listApplicationsForReview(admin, "bogus")).rejects.toMatchObject({
      code: "VERIFICATION_VALIDATION_FAILED",
      status: 400,
    });
  });

  it("returns 404 for an unknown application", async () => {
    await expect(decideApplication(admin, "missing", { status: "approved" })).rejects.toMatchObject({
      code: "VERIFICATION_APPLICATION_NOT_FOUND",
      status: 404,
    });
  });

  it("refuses to decide an application that is not submitted", async () => {
    const created = await createMyApplication(applicant, COMPLETE_INPUT);

    await expect(
      decideApplication(admin, created.id, { status: "approved", updatedAt: created.updatedAt }),
    ).rejects.toMatchObject({ code: "VERIFICATION_CONFLICT", status: 409 });
  });

  it("approves a submitted application and stamps the reviewer", async () => {
    const submitted = await seedSubmittedApplication();
    const approved = await decideApplication(admin, submitted.id, {
      status: "approved",
      reviewNote: "Welcome aboard.",
      updatedAt: submitted.updatedAt,
    });

    expect(approved).toMatchObject({
      status: "approved",
      reviewedBy: "u-admin",
      reviewNote: "Welcome aboard.",
    });
    expect(approved.reviewedAt).toBeTruthy();
  });
});

describe("grantUserRole", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
  });

  async function registeredUser(roles: ("learner" | "scholar" | "admin")[]) {
    const result = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Applicant",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles,
    });

    return result.user;
  }

  it("forbids a non-admin actor", async () => {
    const user = await registeredUser(["learner"]);

    await expect(
      grantUserRole({ id: "u-x", roles: ["scholar"] }, user.id, "scholar"),
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN", status: 403 });
    await expect(grantUserRole({ id: "u-x", roles: ["scholar"] }, user.id, "scholar")).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("adds the role for an admin and is idempotent", async () => {
    const user = await registeredUser(["learner"]);

    const granted = await grantUserRole(admin, user.id, "scholar");

    expect(granted.roles).toContain("scholar");
    expect(granted.roles).toContain("learner");

    const again = await grantUserRole(admin, user.id, "scholar");

    expect(again.roles.filter((role) => role === "scholar")).toHaveLength(1);
  });
});

describe("verification memory repository", () => {
  beforeEach(() => {
    resetVerificationStoreForTesting();
  });

  it("enforces the conditional write", async () => {
    const created = await createMyApplication(applicant, { displayName: "Draft name" });
    const repository = getMemoryVerificationRepository();

    expect(await repository.updateIfUnchanged({ ...created, displayName: "Nope" }, "stale-token")).toBe(false);

    const written = await repository.updateIfUnchanged(
      { ...created, displayName: "Fresh" },
      created.updatedAt,
    );

    expect(written).toBe(true);
    expect(await repository.getByApplicantId("u-applicant")).toMatchObject({ displayName: "Fresh" });
  });
});
