import { getPlatformHighlights, getRuntimeStatus } from "@/src/modules/platform/domain/runtime-status";

describe("getRuntimeStatus", () => {
  it("returns the expected production scaffold metadata", () => {
    const status = getRuntimeStatus(new Date("2026-07-18T10:00:00.000Z"));

    expect(status).toEqual({
      name: "Okkhor",
      status: "ok",
      architecture: "modular-monolith",
      defaultLocale: "bn-BD",
      summary: "Research comprehension platform scaffold with Next.js App Router and TypeScript.",
      timestamp: "2026-07-18T10:00:00.000Z",
    });
  });
});

describe("getPlatformHighlights", () => {
  it("returns user-facing scaffold highlights", () => {
    expect(getPlatformHighlights()).toHaveLength(3);
    expect(getPlatformHighlights()[0]).toContain("Next.js App Router");
  });
});
