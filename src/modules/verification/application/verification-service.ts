import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { canReview } from "@/src/modules/verification/domain/verification-authorization";
import { VerificationError } from "@/src/modules/verification/domain/verification-errors";
import { decideVerificationSchema, saveVerificationSchema } from "@/src/modules/verification/domain/verification-schemas";
import { canApplicantEdit, canReviewStatus } from "@/src/modules/verification/domain/verification-state";
import type {
  DecideVerificationInput,
  SaveVerificationInput,
  ScholarVerification,
  VerificationActor,
  VerificationStatus,
} from "@/src/modules/verification/domain/verification-types";
import { getVerificationRepository } from "@/src/modules/verification/infrastructure/verification-repository";

const VALID_STATUSES: readonly VerificationStatus[] = ["draft", "submitted", "approved", "rejected"];

function parseVerificationSchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues[0]?.message || "Verification request failed validation.";
      throw new VerificationError(detail, "VERIFICATION_VALIDATION_FAILED", 400);
    }

    throw error;
  }
}

function assertCanReview(actor: VerificationActor) {
  if (!canReview(actor.roles)) {
    throw new VerificationError("Only administrators can review scholar applications.", "VERIFICATION_FORBIDDEN", 403);
  }
}

/**
 * A submitted application must carry the minimum evidence the committee reviews: a display
 * name, at least one degree, and a portfolio.
 */
function assertSubmittable(verification: ScholarVerification) {
  if (
    !verification.displayName.trim() ||
    verification.degrees.length === 0 ||
    !verification.portfolio.trim()
  ) {
    throw new VerificationError(
      "Provide a display name, at least one degree, and a research portfolio before submitting.",
      "VERIFICATION_VALIDATION_FAILED",
      400,
    );
  }
}

function conflict(message: string) {
  return new VerificationError(message, "VERIFICATION_CONFLICT", 409);
}

/** The caller's own application, or `undefined` when they have not started one. */
export async function getMyApplication(actor: VerificationActor): Promise<ScholarVerification | undefined> {
  return getVerificationRepository().getByApplicantId(actor.id);
}

export async function createMyApplication(
  actor: VerificationActor,
  input: SaveVerificationInput,
): Promise<ScholarVerification> {
  const parsed = parseVerificationSchema(saveVerificationSchema, input);
  const repository = getVerificationRepository();
  const existing = await repository.getByApplicantId(actor.id);

  if (existing) {
    throw conflict("An application already exists for this user.");
  }

  const now = new Date().toISOString();
  const status: VerificationStatus = parsed.status === "submitted" ? "submitted" : "draft";
  const verification: ScholarVerification = {
    id: randomUUID(),
    applicantId: actor.id,
    status,
    displayName: parsed.displayName ?? "",
    degrees: parsed.degrees ?? [],
    affiliations: parsed.affiliations ?? [],
    portfolio: parsed.portfolio ?? "",
    specializations: parsed.specializations ?? [],
    languages: parsed.languages ?? [],
    submittedAt: status === "submitted" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (status === "submitted") {
    assertSubmittable(verification);
  }

  await repository.create(verification);

  return verification;
}

/**
 * Saves the caller's draft, or submits it (`status: "submitted"`). A rejected application may
 * be edited and resubmitted; the previous review is cleared on any applicant write.
 */
export async function saveMyApplication(
  actor: VerificationActor,
  input: SaveVerificationInput,
): Promise<ScholarVerification> {
  const parsed = parseVerificationSchema(saveVerificationSchema, input);
  const repository = getVerificationRepository();
  const existing = await repository.getByApplicantId(actor.id);

  if (!existing) {
    throw new VerificationError("No application exists for this user.", "VERIFICATION_APPLICATION_NOT_FOUND", 404);
  }

  if (!canApplicantEdit(existing.status)) {
    throw conflict("A submitted or approved application cannot be edited.");
  }

  if (parsed.updatedAt && parsed.updatedAt !== existing.updatedAt) {
    throw conflict("The application was changed elsewhere. Reload it and try again.");
  }

  const now = new Date().toISOString();
  const nextStatus: VerificationStatus = parsed.status ?? existing.status;
  const updated: ScholarVerification = {
    ...existing,
    status: nextStatus,
    displayName: parsed.displayName ?? existing.displayName,
    degrees: parsed.degrees ?? existing.degrees,
    affiliations: parsed.affiliations ?? existing.affiliations,
    portfolio: parsed.portfolio ?? existing.portfolio,
    specializations: parsed.specializations ?? existing.specializations,
    languages: parsed.languages ?? existing.languages,
    reviewNote: undefined,
    reviewedBy: undefined,
    reviewedAt: undefined,
    submittedAt: nextStatus === "submitted" ? now : existing.submittedAt,
    updatedAt: now,
  };

  if (nextStatus === "submitted") {
    assertSubmittable(updated);
  }

  const written = await repository.updateIfUnchanged(updated, existing.updatedAt);

  if (!written) {
    throw conflict("The application was changed elsewhere. Reload it and try again.");
  }

  return updated;
}

/** The review queue. `status` filters the list; an unknown filter is a validation error. */
export async function listApplicationsForReview(
  actor: VerificationActor,
  status?: string,
): Promise<ScholarVerification[]> {
  assertCanReview(actor);

  if (status && !VALID_STATUSES.includes(status as VerificationStatus)) {
    throw new VerificationError("Unknown application status filter.", "VERIFICATION_VALIDATION_FAILED", 400);
  }

  return getVerificationRepository().listByStatus(status as VerificationStatus | undefined);
}

export async function getApplicationForReview(
  actor: VerificationActor,
  id: string,
): Promise<ScholarVerification> {
  assertCanReview(actor);

  const application = await getVerificationRepository().getById(id);

  if (!application) {
    throw new VerificationError("Application was not found.", "VERIFICATION_APPLICATION_NOT_FOUND", 404);
  }

  return application;
}

/**
 * Approves or rejects a submitted application. The caller is responsible for granting the
 * `scholar` role on approval through identity's public surface (the composition root in
 * `app/**`), so this module never reaches into identity's application layer.
 */
export async function decideApplication(
  actor: VerificationActor,
  id: string,
  input: DecideVerificationInput,
): Promise<ScholarVerification> {
  assertCanReview(actor);

  const parsed = parseVerificationSchema(decideVerificationSchema, input);
  const repository = getVerificationRepository();
  const existing = await repository.getById(id);

  if (!existing) {
    throw new VerificationError("Application was not found.", "VERIFICATION_APPLICATION_NOT_FOUND", 404);
  }

  if (!canReviewStatus(existing.status)) {
    throw conflict("Only a submitted application can be decided.");
  }

  if (parsed.updatedAt && parsed.updatedAt !== existing.updatedAt) {
    throw conflict("The application was changed elsewhere. Reload it and try again.");
  }

  const now = new Date().toISOString();
  const updated: ScholarVerification = {
    ...existing,
    status: parsed.status,
    reviewNote: parsed.reviewNote || undefined,
    reviewedBy: actor.id,
    reviewedAt: now,
    updatedAt: now,
  };

  const written = await repository.updateIfUnchanged(updated, existing.updatedAt);

  if (!written) {
    throw conflict("The application was changed elsewhere. Reload it and try again.");
  }

  return updated;
}
