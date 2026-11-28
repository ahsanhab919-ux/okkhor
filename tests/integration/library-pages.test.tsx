import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import LibraryLayout from "@/app/library/layout";
import LibraryPage from "@/app/library/page";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { saveItem } from "@/src/modules/library/application/library-service";
import { resetLibraryStoreForTesting } from "@/src/modules/library/infrastructure/library-store";
import { SaveItemButton } from "@/src/modules/library/ui/save-item-button";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/library",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function publishedItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
  return {
    title: "Sediment cores reveal rapid shifts",
    abstract: "Abstract body",
    summaryBn: "বাংলা সারসংক্ষেপ নমুনা",
    sourceLanguage: "en",
    tags: ["climate"],
    status: "published",
    publishedAt: "2026-02-10T00:00:00.000Z",
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
    ...overrides,
  };
}

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

async function signInAs(): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Ahsan Habib",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles: ["learner"],
  });

  cookieState.accessToken = result.tokens.accessToken;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: sessionUser(["learner"], result.user.id), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );

  return result.user.id;
}

describe("library pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    resetLibraryStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the library inside the session-backed workspace chrome", async () => {
    await signInAs();

    render(LibraryLayout({ children: <p>Library body</p> }));

    expect(await screen.findByText(/Signed in as Ahsan Habib/i)).toBeInTheDocument();
    expect(screen.getByText("Library body")).toBeInTheDocument();
  });

  it("lists saved items with a link to the item", async () => {
    const userId = await signInAs();

    await getMemoryContentRepository().createItem(publishedItem({ id: "a" }));
    await saveItem({ id: userId, roles: ["learner"] }, { itemId: "a" });

    render(await LibraryPage());

    expect(screen.getByRole("heading", { name: /My Library/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the summary/i })).toHaveAttribute("href", "/content/a");
  });

  it("shows an empty state when nothing is saved", async () => {
    await signInAs();

    render(await LibraryPage());

    expect(screen.getByText(/Nothing saved yet/i)).toBeInTheDocument();
  });

  it("offers sign-in to an anonymous reader", () => {
    render(<SaveItemButton authenticated={false} initialSaved={false} itemId="a" />);

    expect(screen.getByRole("link", { name: /Sign in to save/i })).toHaveAttribute(
      "href",
      `/auth?next=${encodeURIComponent("/content/a")}`,
    );
  });

  it("shows the saved state for an item the member already saved", () => {
    render(<SaveItemButton authenticated initialSaved itemId="a" />);

    expect(screen.getByRole("button", { name: /^Saved$/i })).toBeInTheDocument();
  });

  it("saves an item and reflects the new state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ item: { itemId: "a", savedAt: "2026-02-10T00:00:00.000Z" } }), {
          status: 201,
        }),
      ),
    );

    render(<SaveItemButton authenticated initialSaved={false} itemId="a" />);

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(await screen.findByRole("button", { name: /^Saved$/i })).toBeInTheDocument();
  });

  it("surfaces a server error when the save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "LIBRARY_ITEM_NOT_FOUND", message: "The research item was not found." } }),
          { status: 404 },
        ),
      ),
    );

    render(<SaveItemButton authenticated initialSaved={false} itemId="a" />);

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The research item was not found.");
  });
});
