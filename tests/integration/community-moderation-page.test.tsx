import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AdminCommunityLayout from "@/app/admin/community/layout";
import AdminCommunityPage from "@/app/admin/community/page";
import AdminCommunityThreadPage from "@/app/admin/community/[id]/page";
import CommunityThreadPage from "@/app/community/[id]/page";
import { resetCommunityStoreForTesting, getMemoryCommunityRepository } from "@/src/modules/community/infrastructure/community-store";
import { ModerationControls } from "@/src/modules/community/ui/moderation-controls";
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
  usePathname: () => "/admin/community",
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

async function seedThread(
  id: string,
  title = "Indus Valley thread",
  moderationState: "visible" | "hidden" = "visible",
  locked = false,
) {
  await getMemoryCommunityRepository().createThread({
    id,
    authorId: "u-author",
    title,
    body: "A discussion about the Lothal excavation record.",
    category: "History of Science",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    moderationState,
    locked,
  });
}

describe("community moderation pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetCommunityStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the restricted screen for a non-administrator", async () => {
    await signInAs(["learner"]);

    render(await AdminCommunityLayout({ children: <p>Queue body</p> }));

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Queue body")).toBeNull();
  });

  it("renders the moderation queue with state pills for an administrator", async () => {
    await signInAs(["admin"]);
    await seedThread("t1", "Visible thread");
    await seedThread("t2", "Hidden thread", "hidden");

    render(await AdminCommunityPage());

    expect(screen.getByRole("link", { name: /Visible thread/i })).toHaveAttribute(
      "href",
      "/admin/community/t1",
    );
    expect(screen.getByRole("link", { name: /Hidden thread/i })).toHaveAttribute(
      "href",
      "/admin/community/t2",
    );
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("renders a hidden reply on the moderator thread page", async () => {
    await signInAs(["admin"]);
    await seedThread("t1");

    await getMemoryCommunityRepository().createReply({
      id: "r1",
      threadId: "t1",
      authorId: "u-author",
      body: "Hidden reply body",
      createdAt: "2026-03-02T00:00:00.000Z",
      moderationState: "hidden",
    });

    render(await AdminCommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getByText("Hidden reply body")).toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("renders the locked notice and no reply form on a locked thread", async () => {
    await signInAs(["learner"]);
    await seedThread("t1", "Locked thread", "visible", true);

    render(await CommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getByText(/This thread is locked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Post reply/i })).toBeNull();
  });

  it("shows the inline moderation controls to an administrator", async () => {
    await signInAs(["admin"]);
    await seedThread("t1");

    await getMemoryCommunityRepository().createReply({
      id: "r1",
      threadId: "t1",
      authorId: "u-author",
      body: "A reply",
      createdAt: "2026-03-02T00:00:00.000Z",
      moderationState: "visible",
    });

    render(await CommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getByRole("button", { name: "Lock" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Hide" })).toHaveLength(2);
  });

  it("surfaces a server error from the moderation control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "COMMUNITY_FORBIDDEN", message: "Only administrators can moderate community content." },
          }),
          { status: 403 },
        ),
      ),
    );

    render(<ModerationControls id="t1" moderationState="visible" target="thread" />);

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only administrators can moderate community content.",
    );
  });
});
