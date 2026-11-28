import React from "react";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import AdminUsersPage from "@/app/admin/users/page";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import {
  getMemoryAuthRepository,
  resetAuthStoreForTesting,
} from "@/src/modules/identity/infrastructure/auth-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/users",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function sessionUser(roles: UserRole[], id: string) {
  return {
    id,
    phoneNumber: "+8801712345678",
    displayName: "Ahsan Habib",
    locale: "bn-BD",
    roles,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
  };
}

async function signInAs(roles: UserRole[]): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Ahsan Habib",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  cookieState.accessToken = result.tokens.accessToken;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: sessionUser(roles, result.user.id), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );

  return result.user.id;
}

type SeedMemberOptions = {
  displayName?: string;
  roles?: UserRole[];
  createdAt?: string;
  lastLoginAt?: string;
};

async function seedMember(id: string, options: SeedMemberOptions = {}) {
  const createdAt = options.createdAt ?? "2026-06-01T00:00:00.000Z";

  await getMemoryAuthRepository().createUser({
    id,
    phoneNumber: `+8801${id}`,
    displayName: options.displayName ?? `Member ${id}`,
    locale: "bn-BD",
    roles: options.roles ?? ["learner"],
    createdAt,
    updatedAt: createdAt,
    passwordUpdatedAt: createdAt,
    passwordHash: "seeded-hash",
    lastLoginAt: options.lastLoginAt,
  });
}

function memberRow(name: string): HTMLElement {
  // Scoped to the roster cells: the shell's top bar also renders the signed-in member's name.
  const cell = Array.from(document.querySelectorAll(".roster-table__name")).find(
    (element) => element.textContent === name,
  );
  const row = cell?.closest("tr");

  if (!row) {
    throw new Error(`No roster row for ${name}`);
  }

  return row as HTMLElement;
}

function rosterNames(): string[] {
  return Array.from(document.querySelectorAll(".roster-table__name")).map(
    (element) => element.textContent ?? "",
  );
}

function figureValue(label: string): string | undefined {
  const card = Array.from(document.querySelectorAll(".stat-card")).find(
    (element) => element.querySelector("span")?.textContent === label,
  );

  return card?.querySelector("strong")?.textContent ?? undefined;
}

async function renderRoster(role?: string) {
  return render(await AdminUsersPage({ searchParams: Promise.resolve({ role }) }));
}

describe("admin users page", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    await renderRoster();

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Members")).toBeNull();
  });

  it("lists every member with roles, dates, and a profile link, counting from the account", async () => {
    await signInAs(["admin"]);

    await seedMember("m1", {
      displayName: "Dr. Ariful Haque",
      roles: ["learner", "scholar"],
      createdAt: "2026-04-01T00:00:00.000Z",
      lastLoginAt: "2026-07-18T00:00:00.000Z",
    });
    await seedMember("m2", {
      displayName: "Sarah Ahmed",
      roles: ["learner"],
      createdAt: "2026-05-02T00:00:00.000Z",
    });

    await renderRoster();

    expect(await screen.findByText(/Every member of the archive/i)).toBeInTheDocument();

    const scholarRow = memberRow("Dr. Ariful Haque");
    expect(within(scholarRow).getByText("learner")).toBeInTheDocument();
    expect(within(scholarRow).getByText("scholar")).toBeInTheDocument();
    expect(within(scholarRow).getByText("2026-04-01")).toBeInTheDocument();
    expect(within(scholarRow).getByText("2026-07-18")).toBeInTheDocument();
    expect(within(scholarRow).getByRole("link", { name: "View profile" })).toHaveAttribute("href", "/u/m1");

    // A member who has never signed in shows "Never" rather than a fabricated date.
    const idleRow = memberRow("Sarah Ahmed");
    expect(within(idleRow).getByText("Never")).toBeInTheDocument();

    // The administrator who is viewing the roster is a member too, wearing the accent chip.
    const adminRow = memberRow("Ahsan Habib");
    expect(adminRow.querySelector(".chip--accent")?.textContent).toBe("admin");

    expect(figureValue("Members")).toBe("3");
    expect(figureValue("Learners")).toBe("2");
    expect(figureValue("Scholars")).toBe("1");
    expect(figureValue("Administrators")).toBe("1");
  });

  it("filters the roster to scholars", async () => {
    await signInAs(["admin"]);

    await seedMember("m1", { displayName: "Dr. Ariful Haque", roles: ["scholar"] });
    await seedMember("m2", { displayName: "Sarah Ahmed", roles: ["learner"] });

    await renderRoster("scholar");

    expect(await screen.findByText("Dr. Ariful Haque")).toBeInTheDocument();
    expect(rosterNames()).toEqual(["Dr. Ariful Haque"]);

    const filterNav = screen.getByRole("navigation", { name: "Filter members" });
    expect(within(filterNav).getByRole("link", { name: "Scholars" })).toHaveClass("tab-row__tab--active");
  });

  it("explains an empty roster for a role nobody holds", async () => {
    await signInAs(["admin"]);

    await renderRoster("scholar");

    expect(await screen.findByText("No members hold the scholar role.")).toBeInTheDocument();
  });
});
