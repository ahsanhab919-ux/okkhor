import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import CommunityPage from "@/app/community/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/community",
}));

describe("CommunityPage", () => {
  it("renders the community hub with session-backed workspace chrome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
            sessionId: "sess-12345678",
          }),
          { status: 200 },
        ),
      ),
    );

    render(<CommunityPage />);

    expect(await screen.findByText(/Signed in as Ahsan Habib/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /Community Hub/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Start a Thread/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Trending/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/How should we interpret the Indus Valley urban knowledge system/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Recent Comments/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Archive Pulse/i })).toBeInTheDocument();
  });
});
