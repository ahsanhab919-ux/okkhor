import {
  formatCountdown,
  getOtpStatusMessage,
  isValidBangladeshPhone,
  isValidOtpCode,
  maskPhoneNumber,
  normalizeBangladeshPhone,
} from "@/src/modules/identity/domain/phone-auth";

describe("phone auth helpers", () => {
  it("normalizes Bangladesh mobile numbers to +880 format", () => {
    expect(normalizeBangladeshPhone("01712345678")).toBe("+8801712345678");
    expect(normalizeBangladeshPhone("+8801712345678")).toBe("+8801712345678");
  });

  it("validates Bangladesh mobile number formats", () => {
    expect(isValidBangladeshPhone("01712345678")).toBe(true);
    expect(isValidBangladeshPhone("+8801712345678")).toBe(true);
    expect(isValidBangladeshPhone("0181234")).toBe(false);
  });

  it("masks normalized phone numbers for proof-of-action messaging", () => {
    expect(maskPhoneNumber("01712345678")).toBe("+880 17•••••78");
  });

  it("formats resend countdown labels", () => {
    expect(formatCountdown(30)).toBe("00:30");
    expect(formatCountdown(75)).toBe("01:15");
  });

  it("validates six digit OTP codes only", () => {
    expect(isValidOtpCode("246810")).toBe(true);
    expect(isValidOtpCode("24681")).toBe(false);
    expect(isValidOtpCode("24a810")).toBe(false);
  });

  it("returns state-specific status messages", () => {
    expect(getOtpStatusMessage("phone-entry", "01712345678")).toContain("phone number");
    expect(getOtpStatusMessage("otp-entry", "01712345678")).toContain("+880 17•••••78");
    expect(getOtpStatusMessage("success", "01712345678")).toContain("Login confirmed");
  });
});
