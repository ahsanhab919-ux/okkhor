import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import ScholarVerifyPage from "@/app/scholar-verify/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/scholar-verify",
}));

describe("ScholarVerifyPage", () => {
  it("renders the scholar verification credentials flow inside the protected workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: {
              id: "u-2",
              phoneNumber: "+8801712345678",
              displayName: "Dr. Arshad Khan",
              locale: "bn-BD",
              roles: ["scholar"],
              createdAt: "2026-07-18T00:00:00.000Z",
              updatedAt: "2026-07-18T00:00:00.000Z",
              passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
            },
            sessionId: "sess-99887766",
          }),
          { status: 200 },
        ),
      ),
    );

    render(<ScholarVerifyPage />);

    expect(await screen.findByText(/Signed in as Dr. Arshad Khan/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /Credentials/i })).toHaveLength(2);
    expect(screen.getAllByText(/Step 2 of 4/i)).toHaveLength(2);
    expect(screen.getByLabelText(/Degree Type/i)).toHaveValue("PhD in History of Science");
    expect(screen.getByLabelText(/Current Role/i)).toHaveValue("Associate Professor");
    expect(screen.getByRole("button", { name: /Continue to Specialization/i })).toBeInTheDocument();
  });
});
