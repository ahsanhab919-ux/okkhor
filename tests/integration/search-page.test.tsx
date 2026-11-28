import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import SearchLayout from "@/app/search/layout";
import SearchPage from "@/app/search/page";
import { getMemoryCommunityRepository, resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { getMemoryContentRepository, resetContentStoreForTesting } from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { SearchForm } from "@/src/modules/search/ui/search-form";

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: refreshMock }),
  usePathname: () => "/search",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function sessionUser(id: string) {
  return {
    id,
    phoneNumber: "+8801712345678",
    displayName: "Ahsan Habib",
    locale: "bn-BD",
    roles: ["learner"],
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
  };
}

async function seed() {
  const author = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Search Member",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles: ["learner"],
  });

  await getMemoryContentRepository().createItem({
    id: "i1",
    title: "Climate adaptation in Bengal",
    abstract: "flood resilience",
    summaryBn: "সারাংশ",
    sourceLanguage: "en",
    tags: ["climate"],
    status: "published",
    authorId: author.user.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await getMemoryCommunityRepository().createThread({
    id: "t1",
    authorId: author.user.id,
    title: "Policy debate",
    body: "a climate policy argument",
    category: "Policy",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    moderationState: "visible",
    locked: false,
  });

  return author;
}

describe("search pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    resetCommunityStoreForTesting();
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the session-backed workspace chrome", async () => {
    const result = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: sessionUser(result.user.id), sessionId: "sess-12345678" }), {
          status: 200,
        }),
      ),
    );

    render(SearchLayout({ children: <p>Search body</p> }));

    expect(await screen.findByText(/Signed in as Ahsan Habib/i)).toBeInTheDocument();
    expect(screen.getByText("Search body")).toBeInTheDocument();
  });

  it("renders unified hits linking to research and community detail pages", async () => {
    await seed();

    render(await SearchPage({ searchParams: Promise.resolve({ q: "climate" }) }));

    expect(screen.getByRole("link", { name: /Climate adaptation in Bengal/i })).toHaveAttribute("href", "/content/i1");
    expect(screen.getByRole("link", { name: /Policy debate/i })).toHaveAttribute("href", "/community/t1");
    expect(screen.getAllByText(/by Search Member/i)).toHaveLength(2);
  });

  it("reflects the current query in the form and shows an empty state", async () => {
    render(await SearchPage({ searchParams: Promise.resolve({ q: "lothal" }) }));

    expect(screen.getByLabelText(/^Query$/i)).toHaveValue("lothal");
    expect(screen.getByText(/No results matched your search/i)).toBeInTheDocument();
  });

  it("prompts for a query before searching", async () => {
    render(await SearchPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/Enter a query to search/i)).toBeInTheDocument();
  });

  it("navigates with the chosen query and filters", () => {
    render(
      <SearchForm
        authors={[]}
        initial={{ q: "", kind: "all", tag: "", category: "", author: "", sort: "relevance" }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^Query$/i), { target: { value: "climate" } });
    fireEvent.change(screen.getByLabelText(/^Research tag$/i), { target: { value: "climate" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));

    expect(pushMock).toHaveBeenCalledWith("/search?q=climate&tag=climate");
  });
});
