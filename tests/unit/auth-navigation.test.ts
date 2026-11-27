import { resolveSafeNextPath } from "@/src/modules/identity/domain/auth-navigation";

describe("auth navigation", () => {
  it("returns the fallback when next is missing", () => {
    expect(resolveSafeNextPath()).toBe("/community");
    expect(resolveSafeNextPath("")).toBe("/community");
  });

  it("keeps safe internal paths", () => {
    expect(resolveSafeNextPath("/scholar-verify")).toBe("/scholar-verify");
    expect(resolveSafeNextPath("/community?tab=latest")).toBe("/community?tab=latest");
  });

  it("rejects external and auth-loop destinations", () => {
    expect(resolveSafeNextPath("https://evil.example")).toBe("/community");
    expect(resolveSafeNextPath("//evil.example")).toBe("/community");
    expect(resolveSafeNextPath("/auth?next=/community")).toBe("/community");
  });
});
