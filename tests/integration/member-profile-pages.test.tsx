import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import ProfileLayout from "@/app/profile/layout";
import ProfilePage from "@/app/profile/page";
import MemberProfilePage from "@/app/u/[id]/page";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { saveItem } from "@/src/modules/library/application/library-service";
import { resetLibraryStoreForTesting } from "@/src/modules/library/infrastructure/library-store";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/profile",
}));

function buildItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
  return {
    title: "Sedentary cores reveal rapid shifts",
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
      new Response(JSON.stringify({ user: sessionUser(result.user.id), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    ),
  );

  return result.user.id;
}

describe("member profile pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    resetCommunityStoreForTesting();
    resetLibraryStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the profile inside the session-backed workspace chrome", async () => {
    await signInAs();

    render(ProfileLayout({ children: <p>Profile body</p> }));

    expect(await screen.findByText(/Signed in as Ahsan Habib/i)).toBeInTheDocument();
    expect(screen.getByText("Profile body")).toBeInTheDocument();
  });

  it("redirects an anonymous visitor to sign-in", async () => {
    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT:/auth?next=/profile");
  });

  it("shows the owner their authored items (drafts flagged), threads, and saved rollup", async () => {
    const memberId = await signInAs();
    const content = getMemoryContentRepository();

    await content.createItem(buildItem({ id: "published", authorId: memberId }));
    await content.createItem(buildItem({ id: "draft", authorId: memberId, status: "draft" }));
    await content.createItem(buildItem({ id: "theirs", authorId: "u-other", title: "Another member's item" }));
    await getMemoryCommunityRepository().createThread({
      id: "t1",
      authorId: memberId,
      title: "My thread",
      body: "A discussion body",
      category: "General",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });
    await saveItem({ id: memberId, roles: ["learner"] }, { itemId: "published" });

    render(await ProfilePage());

    expect(screen.getByRole("heading", { name: "Ahsan Habib" })).toBeInTheDocument();
    expect(screen.getByText(/Member since \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1 saved item/i })).toHaveAttribute("href", "/library");
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Studio/i })).toHaveAttribute("href", "/studio/draft");
    expect(screen.getByRole("link", { name: /My thread/i })).toHaveAttribute("href", "/community/t1");
    // Another member's item is never shown on this profile.
    expect(screen.queryByText("Another member's item")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Read the summary/i })).toHaveLength(1);
  });

  it("shows an empty authored state for a member with no items or threads", async () => {
    await signInAs();

    render(await ProfilePage());

    expect(screen.getByText(/You have not authored any research items/i)).toBeInTheDocument();
    expect(screen.getByText(/You have not started a thread/i)).toBeInTheDocument();
  });

  it("renders a public footprint to an anonymous visitor with a sign-in prompt for threads", async () => {
    const { user } = await registerUser({
      phoneNumber: "01712345678",
      displayName: "Ahsan Habib",
      password: "Okkhor2026",
      locale: "bn-BD",
      roles: ["learner"],
    });

    await getMemoryContentRepository().createItem(buildItem({ id: "published", authorId: user.id }));
    await getMemoryCommunityRepository().createThread({
      id: "t1",
      authorId: user.id,
      title: "My thread",
      body: "A discussion body",
      category: "General",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });

    render(await MemberProfilePage({ params: Promise.resolve({ id: user.id }) }));

    expect(screen.getByRole("heading", { name: "Ahsan Habib" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the summary/i })).toHaveAttribute("href", "/content/published");
    expect(screen.queryByRole("link", { name: /My thread/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Sign in$/ })).toHaveAttribute(
      "href",
      `/auth?next=${encodeURIComponent(`/u/${user.id}`)}`,
    );
  });

  it("shows a signed-in viewer the member's threads", async () => {
    const viewerId = await signInAs();

    await getMemoryCommunityRepository().createThread({
      id: "t1",
      authorId: viewerId,
      title: "My thread",
      body: "A discussion body",
      category: "General",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      moderationState: "visible",
      locked: false,
    });

    render(await MemberProfilePage({ params: Promise.resolve({ id: viewerId }) }));

    expect(screen.getByRole("link", { name: /My thread/i })).toHaveAttribute("href", "/community/t1");
  });

  it("calls notFound for an unknown member", async () => {
    await expect(MemberProfilePage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
