import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a healthy JSON response", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      status: string;
      name: string;
      architecture: string;
      defaultLocale: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.status).toBe("ok");
    expect(payload.name).toBe("Okkhor");
    expect(payload.architecture).toBe("modular-monolith");
    expect(payload.defaultLocale).toBe("bn-BD");
  });
});
