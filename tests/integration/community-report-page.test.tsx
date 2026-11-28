import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import AdminCommunityLayout from "@/app/admin/community/layout";
import AdminCommunityReportsPage from "@/app/admin/community/reports/page";
import CommunityThreadPage from "@/app/community/[id]/page";
import { getMemoryCommunityRepository, resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { ReportControls } from "@/src/modules/community/ui/report-controls";
import { ReportTriageControls } from "@/src/modules/community/ui/report-triage-controls";
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
  usePathname: () => "/admin/community/reports",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

async function signInAs(roles: UserRole[]): Promise<string> {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Ahsan Habib",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  cookieState.accessToken = result.tokens.accessToken;

  // The protected shell fetches its session from the client; stub it so the layout renders.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: result.user.id,
            phoneNumber: "+8801712345678",
            displayName: "Ahsan Habib",
            locale: "bn-BD",
            roles,
            createdAt: "2026-07-18T00:00:00.000Z",
            updatedAt: "2026-07-18T00:00:00.000Z",
            passwordUpdatedAt: "2026-07-18T00:00:00.000Z",
          },
          sessionId: "sess-12345678",
        }),
        { status: 200 },
      ),
    ),
  );

  return result.user.id;
}

async function seedThread(id: string, title = "Indus Valley thread", authorId = "u-author") {
  await getMemoryCommunityRepository().createThread({
    id,
    authorId,
    title,
    body: "A discussion about the Lothal excavation record.",
    category: "History of Science",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    moderationState: "visible",
    locked: false,
  });
}

async function seedReport(id: string, targetId: string, reporterId = "u-reporter") {
  await getMemoryCommunityRepository().createReport({
    id,
    reporterId,
    targetType: "thread",
    targetId,
    reason: "spam",
    status: "open",
    createdAt: "2026-03-03T00:00:00.000Z",
  });
}

describe("community report pages", () => {
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

    render(await AdminCommunityLayout({ children: <p>Report queue body</p> }));

    expect(await screen.findByText(/Administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByText("Report queue body")).toBeNull();
  });

  it("renders the report queue with the content and triage controls for an administrator", async () => {
    await signInAs(["admin"]);
    await seedThread("t1", "Indus Valley thread");
    await seedReport("rep-1", "t1", "u-reporter");

    render(await AdminCommunityReportsPage());

    expect(screen.getByRole("link", { name: /Indus Valley thread/i })).toHaveAttribute(
      "href",
      "/admin/community/t1",
    );
    expect(screen.getByText("Spam")).toBeInTheDocument();
    expect(screen.getByText(/Reported by u-reporter/i)).toBeInTheDocument();
    // The inline moderation control is reused, so hide/lock remain available alongside triage.
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock" })).toBeInTheDocument();
  });

  it("renders the report control for a signed-in member and not for a guest", async () => {
    await seedThread("t1");

    render(await CommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("shows the report control to a signed-in member", async () => {
    await signInAs(["learner"]);
    await seedThread("t1");

    render(await CommunityThreadPage({ params: Promise.resolve({ id: "t1" }) }));

    expect(screen.getAllByRole("button", { name: "Report" }).length).toBeGreaterThan(0);
  });

  it("posts a report and confirms it inline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: { id: "rep-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportControls id="t1" target="thread" />);

    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText(/Reported\. Thank you/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/community/reports",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetType: "thread", targetId: "t1", reason: "spam", detail: undefined }),
      }),
    );
  });

  it("closes a report from the triage island", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: { id: "rep-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportTriageControls reportId="rep-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/community/moderation/reports/rep-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "resolve", note: undefined }),
      }),
    );
  });
});
