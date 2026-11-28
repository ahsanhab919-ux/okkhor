import type { VerificationStatus } from "@/src/modules/verification/domain/verification-types";

const APPLICANT_EDITABLE_STATUSES: readonly VerificationStatus[] = ["draft", "rejected"];
const REVIEWABLE_STATUSES: readonly VerificationStatus[] = ["submitted"];

/**
 * The applicant may edit a `draft`, or a `rejected` application (which they then resubmit).
 * A `submitted` or `approved` application is frozen to the applicant.
 */
export function canApplicantEdit(status: VerificationStatus): boolean {
  return APPLICANT_EDITABLE_STATUSES.includes(status);
}

/** Only a `submitted` application can be approved or rejected. */
export function canReviewStatus(status: VerificationStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}
