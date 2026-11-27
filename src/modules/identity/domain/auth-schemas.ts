import { z } from "zod";

import { isValidBangladeshPhone, normalizeBangladeshPhone } from "@/src/modules/identity/domain/phone-auth";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Za-z]/, "Password must include at least one letter.")
  .regex(/\d/, "Password must include at least one number.");

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
  token: z.string().trim().min(16),
  newPassword: passwordSchema,
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
