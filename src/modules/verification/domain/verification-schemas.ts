import { z } from "zod";

const degreeSchema = z.object({
  degreeType: z.string().trim().min(1, "Degree type is required.").max(200, "Degree type is too long."),
  institution: z.string().trim().min(1, "Institution is required.").max(200, "Institution is too long."),
  year: z.string().trim().min(1, "Year is required.").max(20, "Year is too long."),
  evidenceUrl: z.string().trim().max(2048, "Evidence link is too long.").optional(),
});

const affiliationSchema = z.object({
  role: z.string().trim().min(1, "Role is required.").max(200, "Role is too long."),
  organization: z.string().trim().min(1, "Organization is required.").max(200, "Organization is too long."),
  since: z.string().trim().min(1, "Since is required.").max(20, "Since is too long."),
  evidenceUrl: z.string().trim().max(2048, "Evidence link is too long.").optional(),
});

const stringListSchema = z.array(z.string().trim().min(1)).max(50);

/**
 * The applicant payload. Every field is optional so a PATCH may send a partial change;
 * `status` is the save-as-draft (`draft`) or submit (`submitted`) intent. `updatedAt` is the
 * value the client last read, used for the concurrency check.
 */
export const saveVerificationSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(120, "Display name is too long.").optional(),
  degrees: z.array(degreeSchema).max(20).optional(),
  affiliations: z.array(affiliationSchema).max(20).optional(),
  portfolio: z.string().trim().max(5000, "The portfolio is too long.").optional(),
  specializations: stringListSchema.optional(),
  languages: stringListSchema.optional(),
  status: z.enum(["draft", "submitted"]).optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

/** The admin decision payload. */
export const decideVerificationSchema = z.object({
  status: z.enum(["approved", "rejected"], { message: "A decision must be approved or rejected." }),
  reviewNote: z.string().trim().max(2000, "The review note is too long.").optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export type SaveVerificationPayload = z.infer<typeof saveVerificationSchema>;
export type DecideVerificationPayload = z.infer<typeof decideVerificationSchema>;
