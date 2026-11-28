import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import NotificationsLayout from "@/app/notifications/layout";
import NotificationsPage from "@/app/notifications/page";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { createNotification } from "@/src/modules/notifications/application/notification-service";
import { resetNotificationStoreForTesting } from "@/src/modules/notifications/infrastructure/notification-store";
import { MarkAllReadButton, MarkReadButton } from "@/src/modules/notifications/ui/notification-actions";

const cookieState = vi.hoisted(() => ({ accessToken: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieState.accessToken ? { name, value: cookieState.accessToken } : undefined),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/notifications",
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

describe("notifications pages", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetNotificationStoreForTesting();
    cookieState.accessToken = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the inbox inside the session-backed chrome and exposes the nav entry", async () => {
    await signInAs();

    render(NotificationsLayout({ children: <p>Inbox body</p> }));

    expect(await screen.findByText(/Signed in as Ahsan Habib/i)).toBeInTheDocument();
    expect(screen.getByText("Inbox body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/notifications");
  });

  it("lists the member's notifications with a link to the outcome", async () => {
    const userId = await signInAs();

    await createNotification({
      recipientId: userId,
      type: "content_hidden",
      title: "Your thread was hidden",
      body: "An administrator hid your thread in the community.",
      href: "/community",
      dedupeKey: "content_hidden:t1",
    });

    render(await NotificationsPage());

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("Your thread was hidden")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View/i })).toHaveAttribute("href", "/community");
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark read" })).toBeInTheDocument();
  });

  it("renders a reply notification with a link back to the thread, with no component change", async () => {
    const userId = await signInAs();

    await createNotification({
      recipientId: userId,
      type: "reply_posted",
      title: "New reply in a discussion you're part of",
      body: "Someone replied to a community thread you're part of. Open it to catch up.",
      href: "/community/thread-9",
      dedupeKey: "reply_posted:reply-1",
    });

    render(await NotificationsPage());

    expect(screen.getByText("New reply in a discussion you're part of")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View/i })).toHaveAttribute("href", "/community/thread-9");
  });

  it("shows an empty state when the inbox is empty", async () => {
    await signInAs();

    render(await NotificationsPage());

    expect(screen.getByText(/You have no notifications yet/i)).toBeInTheDocument();
  });

  it("marks a notification read through the island", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    render(<MarkReadButton notificationId="n1" />);

    fireEvent.click(screen.getByRole("button", { name: /Mark read/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/n1/read",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("surfaces a server error from the mark-all-read island", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "AUTH_UNAUTHORIZED", message: "Access token is required." } }),
          { status: 401 },
        ),
      ),
    );

    render(<MarkAllReadButton />);

    fireEvent.click(screen.getByRole("button", { name: /Mark all read/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Access token is required.");
  });
});
