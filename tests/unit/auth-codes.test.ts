import {
  generatePasswordResetCode,
  PASSWORD_RESET_CODE_LENGTH,
} from "@/src/modules/identity/domain/auth-codes";

describe("password reset code", () => {
  it("is six digits long", () => {
    expect(PASSWORD_RESET_CODE_LENGTH).toBe(6);
  });

  it("generates a fixed-length numeric code", () => {
    for (let draw = 0; draw < 50; draw += 1) {
      expect(generatePasswordResetCode()).toMatch(/^\d{6}$/);
    }
  });

  it("varies across draws", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generatePasswordResetCode()));

    expect(codes.size).toBeGreaterThan(1);
  });
});
