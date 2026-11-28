import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import CommunityThreadPage from "@/app/community/[id]/page";
import CommunityLayout from "@/app/community/layout";
import CommunityPage from "@/app/community/page";
import {
  getMemoryCommunityRepository,
  resetCommunityStoreForTesting,
} from "@/src/modules/community/infrastructure/community-store";
import { ThreadForm } from "@/src/modules/community/ui/thread-form";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/community",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

async function seedThread(id: string, title = "Indus Valley thread") {
  await getMemoryCommunityRepository().createThread({
    id,
    authorId: "u-author",
    title,
    body: "A discussion about the Lothal excavation record.",
    category: "History of Science",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  });
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

describe("community pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the community hub inside the session-backed workspace chrome", async () => {
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

    render(CommunityLayout({ children: <p>Community body</p> }));

    expect(await screen.findByText(/Signed in as Ahsan Habib/i)).toBeInTheDocument();
    expect(screen.getByText("Community body")).toBeInTheDocument();
  });

  it("lists persisted threads with a link to open one and to start a new one", async () => {
    await seedThread("t1");

    render(await CommunityPage());

    expect(screen.getByRole("link", { name: /Start a Thread/i })).toHaveAttribute("href", "/community/new");
    expect(screen.getByRole("link", { name: /Indus Valley thread/i })).toHaveAttribute("href", "/community/t1");
    expect(screen.getByText("History of Science")).toBeInTheDocument();
  });

  it("renders a thread with its replies and a reply form", async () => {
    await seedThread("t1");
    await getMemoryCommunityRepository().createReply({
      id: "r1",
      threadId: "t1",
      authorId: "u-author",
      body: "First reply body",
      createdAt: "2026-03-02T00:00:00.000Z",
    });

    render(await CommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getByRole("heading", { name: "Indus Valley thread" })).toBeInTheDocument();
    expect(screen.getByText("First reply body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Post reply/i })).toBeInTheDocument();
  });

  it("calls notFound for an unknown thread", async () => {
    await expect(CommunityThreadPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("surfaces a server validation error when the thread post fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "COMMUNITY_VALIDATION_FAILED", message: "A title is required." } }),
          { status: 400 },
        ),
      ),
    );

    render(<ThreadForm />);

    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "New title" } });
    fireEvent.change(screen.getByLabelText(/^Body$/i), { target: { value: "Body text" } });
    fireEvent.click(screen.getByRole("button", { name: /Post thread/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A title is required.");
  });
});
