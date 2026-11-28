import type { UserRole } from "@/src/modules/identity/domain/auth-types";

export type VerificationStatus = "draft" | "submitted" | "approved" | "rejected";

/** A single academic credential. Evidence is a link, never a binary upload in this slice. */
export type VerificationDegree = {
  degreeType: string;
  institution: string;
  year: string;
  evidenceUrl?: string;
};

/** A single professional affiliation, present or historical. */
export type VerificationAffiliation = {
  role: string;
  organization: string;
  since: string;
  evidenceUrl?: string;
};

/**
 * A scholar-verification application. One per user (`UNIQUE(applicant_id)`); a rejected
 * application is edited in place and resubmitted, which clears the previous review.
 */
export type ScholarVerification = {
  id: string;
  applicantId: string;
  status: VerificationStatus;
  displayName: string;
  degrees: VerificationDegree[];
  affiliations: VerificationAffiliation[];
  portfolio: string;
  specializations: string[];
  languages: string[];
  reviewNote?: string;
  reviewedBy?: string;
  submittedAt?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The acting user, passed into verification use cases as plain data. The module treats it as
 * an opaque actor; the app layer resolves it from the identity module.
 */
export type VerificationActor = {
  id: string;
  roles: UserRole[];
};

/** The applicant-editable fields, plus an optional `status` to save-as-draft or submit. */
export type SaveVerificationInput = {
  displayName?: string;
  degrees?: VerificationDegree[];
  affiliations?: VerificationAffiliation[];
  portfolio?: string;
  specializations?: string[];
  languages?: string[];
  status?: "draft" | "submitted";
  /** The value the client last read; used for the optimistic-concurrency check. */
  updatedAt?: string;
};

/** An administrator's decision. */
export type DecideVerificationInput = {
  status: "approved" | "rejected";
  reviewNote?: string;
  updatedAt?: string;
};

export type VerificationRepository = {
  getByApplicantId(applicantId: string): Promise<ScholarVerification | undefined>;
  getById(id: string): Promise<ScholarVerification | undefined>;
  /** The review queue; `undefined` status returns every application, newest-edited first. */
  listByStatus(status?: VerificationStatus): Promise<ScholarVerification[]>;
  create(verification: ScholarVerification): Promise<void>;
  /**
   * Writes the application only if the stored `updated_at` still equals `expectedUpdatedAt`.
   * Returns `false` when another writer changed the row first.
   */
  updateIfUnchanged(verification: ScholarVerification, expectedUpdatedAt: string): Promise<boolean>;
};

export type VerificationStore = {
  verifications: Map<string, ScholarVerification>;
};
