import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import StudioLayout from "@/app/studio/layout";
import StudioPage from "@/app/studio/page";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { ItemEditorForm } from "@/src/modules/content/ui/item-editor-form";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/studio",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function studioItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
  return {
    title: "Seeded draft title",
    abstract: "Abstract body",
    summaryBn: "বাংলা সারসংক্ষেপ নমুনা",
    sourceLanguage: "en",
    tags: ["climate"],
    status: "draft",
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
    ...overrides,
  };
}

function sessionUser(roles: UserRole[]) {
  return {
    id: "u-studio",
    phoneNumber: "+8801712345678",
    displayName: "Dr. Studio Author",
    locale: "bn-BD",
    roles,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
  };
}

async function signInAs(roles: UserRole[]): Promise<void> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Dr. Studio Author",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  cookieState.accessToken = result.tokens.accessToken;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { ...sessionUser(roles), id: result.user.id }, sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );
}

describe("studio pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every item status for the author with a link to create a new one", async () => {
    await getMemoryContentRepository().createItem(studioItem({ id: "a" }));

    render(await StudioPage());

    expect(screen.getByRole("heading", { name: /Research Studio/i })).toBeInTheDocument();
    expect(screen.getByText("Seeded draft title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New item/i })).toHaveAttribute("href", "/studio/new");
    expect(screen.getByRole("link", { name: /Edit item/i })).toHaveAttribute("href", "/studio/a");
  });

  it("renders authoring content for a scholar inside the protected workspace", async () => {
    await signInAs(["scholar"]);

    render(await StudioLayout({ children: <p>Authoring body</p> }));

    expect(await screen.findByText(/Signed in as Dr. Studio Author/i)).toBeInTheDocument();
    expect(screen.getByText("Authoring body")).toBeInTheDocument();
    expect(screen.queryByText(/Authoring access required/i)).toBeNull();
  });

  it("hides authoring content from a non-author", async () => {
    await signInAs(["learner"]);

    render(await StudioLayout({ children: <p>Authoring body</p> }));

    expect(await screen.findByText(/Authoring access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Authoring body")).toBeNull();
  });

  it("surfaces a server validation error when the editor save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "CONTENT_VALIDATION_FAILED", message: "Title is required." } }),
          { status: 400 },
        ),
      ),
    );

    render(<ItemEditorForm />);

    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "New title" } });
    fireEvent.change(screen.getByLabelText(/^Abstract$/i), { target: { value: "Abstract body" } });
    fireEvent.change(screen.getByLabelText(/Bangla summary/i), { target: { value: "সারসংক্ষেপ" } });
    fireEvent.click(screen.getByRole("button", { name: /Create item/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Title is required.");
  });
});
