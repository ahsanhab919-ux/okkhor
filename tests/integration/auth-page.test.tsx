import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import AuthPage from "@/app/auth/page";

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

describe("AuthPage", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  it("renders phone-first OTP sign-in guidance", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("No active session"));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole("heading", { name: /Sign in with your mobile number/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send OTP/i })).toBeInTheDocument();
    expect(screen.getByText(/Never share your OTP/i)).toBeInTheDocument();
  });

  it("moves from phone entry to OTP verification and success", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("No active session"));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getAllByLabelText(/Phone number/i)[0], {
      target: { value: "01712345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send OTP/i }));

    expect(screen.getByText(/We sent a code to \+880 17•••••78/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/One-time password/i), {
      target: { value: "246810" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verify and Continue/i }));

    expect(screen.getByText(/Login successful/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue to Backend Sign-In/i })).toHaveAttribute(
      "href",
      "#credential-auth-panel",
    );
    expect(screen.getByDisplayValue("+8801712345678")).toBeInTheDocument();
  });

  it("restores an expired session on the auth page and redirects to the requested destination", async () => {
    searchParams = new URLSearchParams("next=/scholar-verify");

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

    render(<AuthPage />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/scholar-verify");
    });
    expect(router.refresh).toHaveBeenCalled();
  });
});
