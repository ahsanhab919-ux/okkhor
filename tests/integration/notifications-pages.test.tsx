import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import NotificationsLayout from "@/app/notifications/layout";
import NotificationsPage from "@/app/notifications/page";
import { publicNavItems } from "@/src/modules/experience/site-content";
import { AppSidebar } from "@/src/modules/experience/ui";
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
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ user: sessionUser(["learner"], result.user.id), sessionId: "sess-12345678" }),
          { status: 200 },
        ),
      ),
    ),
  );

  return result.user.id;
}

/**
 * A `fetch` stand-in for the workspace shell: the session endpoint returns the signed-in user, and
 * the unread-count endpoint returns `getUnread()` so a test can change the count between reads.
 */
function unreadFetch(getUnread: () => number) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/api/notifications/unread-count")) {
      return Promise.resolve(new Response(JSON.stringify({ unread: getUnread() }), { status: 200 }));
    }

    return Promise.resolve(
      new Response(JSON.stringify({ user: sessionUser(["learner"], "u-shell"), sessionId: "sess-12345678" }), {
        status: 200,
      }),
    );
  });
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

  it("renders a verification notification with a link to the verification page, with no component change", async () => {
    const userId = await signInAs();

    await createNotification({
      recipientId: userId,
      type: "verification_approved",
      title: "Your scholar verification was approved",
      body: "An administrator approved your scholar verification. Your profile now shows the Scholar badge.",
      href: "/scholar-verify",
      dedupeKey: "verification_approved:app-1:2026-07-01T00:00:00.000Z",
    });

    render(await NotificationsPage());

    expect(screen.getByText("Your scholar verification was approved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View/i })).toHaveAttribute("href", "/scholar-verify");
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

  it("hides the sidebar badge at zero and shows the count when unread", () => {
    const { rerender } = render(
      <AppSidebar items={publicNavItems} activeHref="/community" unreadCount={0} />,
    );

    expect(screen.queryByLabelText(/unread notifications/i)).toBeNull();

    rerender(<AppSidebar items={publicNavItems} activeHref="/community" unreadCount={3} />);

    expect(screen.getByLabelText("3 unread notifications")).toHaveTextContent("3");
  });

  it("shows the unread badge from the count endpoint inside the workspace chrome", async () => {
    vi.stubGlobal("fetch", unreadFetch(() => 2));

    render(NotificationsLayout({ children: <p>Inbox body</p> }));

    expect(await screen.findByLabelText("2 unread notifications")).toHaveTextContent("2");
  });

  it("re-reads the unread count when the inbox signals a change", async () => {
    let unread = 1;

    vi.stubGlobal("fetch", unreadFetch(() => unread));

    render(NotificationsLayout({ children: <p>Inbox body</p> }));

    expect(await screen.findByLabelText("1 unread notifications")).toBeInTheDocument();

    unread = 0;
    fireEvent(window, new Event("okkhor:inbox-changed"));

    await waitFor(() => expect(screen.queryByLabelText(/unread notifications/i)).toBeNull());
  });
});
