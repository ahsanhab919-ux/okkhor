import { vi } from "vitest";

import { ensureSession, getUserInitials } from "@/src/modules/identity/client/session-client";

describe("session client", () => {
  it("returns initials from display names", () => {
    expect(getUserInitials("Ahsan Habib")).toBe("AH");
    expect(getUserInitials("Okkhor")).toBe("O");
  });

  it("refreshes and retries session lookup when the first request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "expired" },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "u-1",
              phoneNumber: "+8801712345678",
              displayName: "Ahsan Habib",
              locale: "bn-BD",
              roles: ["learner"],
              createdAt: "2026-07-18T00:00:00.000Z",
              updatedAt: "2026-07-18T00:00:00.000Z",
              passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
            },
            sessionId: "sess-1",
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const session = await ensureSession();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/refresh",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(session.user.displayName).toBe("Ahsan Habib");
  });
});
