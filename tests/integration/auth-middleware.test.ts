import { vi } from "vitest";
import { NextRequest } from "next/server";

import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

vi.mock("@/src/modules/identity/domain/auth-jwt", async () => {
  const actual = await vi.importActual<typeof import("@/src/modules/identity/domain/auth-jwt")>(
    "@/src/modules/identity/domain/auth-jwt",
  );

  return {
    ...actual,
    verifyAccessTokenEdge: vi.fn(async () => ({
      sub: "u-1",
      sessionId: "sess-1",
      phoneNumber: "+8801712345678",
      roles: ["learner"],
      type: "access" as const,
    })),
  };
});

import { middleware } from "@/middleware";

describe("auth middleware", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
  });

  it("redirects unauthenticated requests to /auth", async () => {
    const response = await middleware(new NextRequest("http://localhost/community"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth");
  });

  it("allows authenticated requests through", async () => {
    const request = new NextRequest("http://localhost/community");
    request.cookies.set(ACCESS_TOKEN_COOKIE, "mock-access-token");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
