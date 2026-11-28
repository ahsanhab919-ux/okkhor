import React from "react";
import { render, screen } from "@testing-library/react";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the premium archive landing experience", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: /The World's Best Research, Simplified in Bangla\./i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore the Archive/i })).toHaveAttribute("href", "#archive");
    expect(screen.getByRole("link", { name: /Sign In with Phone/i })).toHaveAttribute("href", "/auth");
    expect(screen.getByRole("heading", { name: /Netflix for Knowledge/i })).toBeInTheDocument();
    expect(screen.getByText(/The Quantum Revolution/i)).toBeInTheDocument();
  });
});
