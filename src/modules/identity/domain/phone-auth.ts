export type OtpFlowState = "phone-entry" | "otp-entry" | "success";

export function normalizeBangladeshPhone(input: string): string {
  const digits = input.replace(/\D/g, "");

  if (digits.startsWith("8801") && digits.length === 13) {
    return `+${digits}`;
  }

  if (digits.startsWith("01") && digits.length === 11) {
    return `+88${digits}`;
  }

  return input.trim();
}

export function isValidBangladeshPhone(input: string): boolean {
  const normalized = normalizeBangladeshPhone(input);

  return /^\+8801\d{9}$/.test(normalized);
}

export function maskPhoneNumber(input: string): string {
  const normalized = normalizeBangladeshPhone(input);

  if (!isValidBangladeshPhone(normalized)) {
    return normalized;
  }

  const local = normalized.slice(4);
  const visibleStart = local.slice(0, 2);
  const visibleEnd = local.slice(-2);

  return `+880 ${visibleStart}${"•".repeat(5)}${visibleEnd}`;
}

export function formatCountdown(secondsRemaining: number): string {
  const safeSeconds = Math.max(0, secondsRemaining);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function isValidOtpCode(input: string): boolean {
  return /^\d{6}$/.test(input.trim());
}

export function getOtpStatusMessage(state: OtpFlowState, phone: string): string {
  switch (state) {
    case "phone-entry":
      return "Enter your phone number to receive a secure one-time verification code.";
    case "otp-entry":
      return `We sent a code to ${maskPhoneNumber(phone)}. Keep the OTP private and never share it with anyone.`;
    case "success":
      return "Login confirmed. Your session is now linked to this device for safer re-entry.";
  }
}
