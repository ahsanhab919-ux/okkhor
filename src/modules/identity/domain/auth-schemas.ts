import { z } from "zod";

import { PASSWORD_RESET_CODE_LENGTH } from "@/src/modules/identity/domain/auth-codes";
import { isValidBangladeshPhone, normalizeBangladeshPhone } from "@/src/modules/identity/domain/phone-auth";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Za-z]/, "Password must include at least one letter.")
  .regex(/\d/, "Password must include at least one number.");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An optional email. An empty string is treated as "no email", so a form or a PATCH can clear the
 * field by sending `""`. It is validated only when present
 * (`password-reset-delivery-slice.md` §5, §6).
 */
const optionalEmailSchema = z
  .string()
  .trim()
  .max(160, "Email must be 160 characters or fewer.")
  .refine((value) => value.length === 0 || EMAIL_PATTERN.test(value), "Enter a valid email address.")
  .transform((value) => (value.length === 0 ? undefined : value));

export const registrationSchema = z.object({
  phoneNumber: z
    .string()
    .min(1)
    .transform(normalizeBangladeshPhone)
    .refine(isValidBangladeshPhone, "Enter a valid Bangladesh mobile number."),
  displayName: z.string().trim().min(2).max(80),
  password: passwordSchema,
  locale: z.string().default("bn-BD"),
  roles: z.array(z.enum(["learner", "scholar", "admin"])).default(["learner"]),
  email: optionalEmailSchema.optional(),
});

export const loginSchema = z.object({
  phoneNumber: z
    .string()
    .min(1)
    .transform(normalizeBangladeshPhone)
    .refine(isValidBangladeshPhone, "Enter a valid Bangladesh mobile number."),
  password: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  phoneNumber: z
    .string()
    .min(1)
    .transform(normalizeBangladeshPhone)
    .refine(isValidBangladeshPhone, "Enter a valid Bangladesh mobile number."),
});

export const passwordResetConfirmSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${PASSWORD_RESET_CODE_LENGTH}}$`),
      `Enter the ${PASSWORD_RESET_CODE_LENGTH}-digit reset code.`,
    ),
  newPassword: passwordSchema,
});

/** The owner-only email edit: a valid address sets it, an empty string clears it. */
export const profileEmailUpdateSchema = z.object({
  email: optionalEmailSchema,
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type ProfileEmailUpdateInput = z.infer<typeof profileEmailUpdateSchema>;
