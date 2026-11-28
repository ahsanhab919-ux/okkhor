import { NextRequest } from "next/server";
import { vi } from "vitest";

import { listPublishedItems } from "@/src/modules/content/application/content-service";
import { resetContentStoreForTesting } from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import type { UserRole } from "@/src/modules/identity/domain/auth-types";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

import { PATCH as updateItemRoute } from "@/app/api/content/items/[id]/route";
import { POST as createItemRoute } from "@/app/api/content/items/route";

const BASE = "http://localhost/api/content/items";

type ItemPayload = {
  item: { id: string; status: string; updatedAt: string; summaryBn: string };
  summary?: { summaryEn?: string; summaryBn?: string };
};

type ErrorPayload = {
  error: { code: string };
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = BASE) {
  const request = new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (token) {
    request.cookies.set(ACCESS_TOKEN_COOKIE, token);
  }

  return request;
}

function itemContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function accessTokenFor(roles: UserRole[]) {
  const result = await registerUser({
    phoneNumber: "01712345678",
    displayName: "Studio Author",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles,
  });

  return result.tokens.accessToken;
}

describe("ai summarization routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("generates and persists a Bangla summary and returns the English preview on publish", async () => {
    const token = await accessTokenFor(["scholar"]);
    const response = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", status: "published" }, token),
    );
    const payload = (await response.json()) as ItemPayload;

    expect(response.status).toBe(201);
    expect(payload.item.summaryBn).not.toBe("");
    expect(payload.summary?.summaryEn).toBeTruthy();

    const page = await listPublishedItems({ limit: 10 });

    expect(page.items.find((item) => item.id === payload.item.id)?.summaryBn).toBe(payload.item.summaryBn);
  });

  it("keeps the author's summary but still returns the English preview", async () => {
    const token = await accessTokenFor(["scholar"]);
    const authorSummary = "আমার নিজের সারসংক্ষেপ";
    const response = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", status: "published", summaryBn: authorSummary }, token),
    );
    const payload = (await response.json()) as ItemPayload;

    expect(response.status).toBe(201);
    expect(payload.item.summaryBn).toBe(authorSummary);
    expect(payload.summary?.summaryEn).toBeTruthy();
  });

  it("generates a summary when a draft is published through PATCH", async () => {
    const token = await accessTokenFor(["scholar"]);
    const draftResponse = await createItemRoute(jsonRequest("POST", { title: "T", abstract: "A" }, token));
    const draft = (await draftResponse.json()) as ItemPayload;

    expect(draft.item.summaryBn).toBe("");

    const publishResponse = await updateItemRoute(
      jsonRequest("PATCH", { status: "published", updatedAt: draft.item.updatedAt }, token, `${BASE}/${draft.item.id}`),
      itemContext(draft.item.id),
    );
    const published = (await publishResponse.json()) as ItemPayload;

    expect(publishResponse.status).toBe(200);
    expect(published.item.status).toBe("published");
    expect(published.item.summaryBn).not.toBe("");
    expect(published.summary?.summaryEn).toBeTruthy();
  });

  it("blocks publish, keeps the item a draft, and returns 502 when the provider fails", async () => {
    const token = await accessTokenFor(["scholar"]);
    const draftResponse = await createItemRoute(jsonRequest("POST", { title: "T", abstract: "A" }, token));
    const draft = (await draftResponse.json()) as ItemPayload;

    vi.stubEnv("AI_SUMMARY_DRIVER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const publishResponse = await updateItemRoute(
      jsonRequest("PATCH", { status: "published", updatedAt: draft.item.updatedAt }, token, `${BASE}/${draft.item.id}`),
      itemContext(draft.item.id),
    );
    const payload = (await publishResponse.json()) as ErrorPayload;

    expect(publishResponse.status).toBe(502);
    expect(payload.error.code).toBe("AI_SUMMARY_FAILED");

    const page = await listPublishedItems({ limit: 10 });

    expect(page.items.map((item) => item.id)).not.toContain(draft.item.id);
  });

  it("does not regenerate a summary when an already-published item is edited", async () => {
    const token = await accessTokenFor(["scholar"]);
    const publishResponse = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", status: "published" }, token),
    );
    const published = (await publishResponse.json()) as ItemPayload;

    const editResponse = await updateItemRoute(
      jsonRequest(
        "PATCH",
        { title: "Edited", updatedAt: published.item.updatedAt },
        token,
        `${BASE}/${published.item.id}`,
      ),
      itemContext(published.item.id),
    );
    const edited = (await editResponse.json()) as ItemPayload;

    expect(editResponse.status).toBe(200);
    expect(edited.summary).toBeUndefined();
    expect(edited.item.summaryBn).toBe(published.item.summaryBn);
  });

  it("saves a draft without a Bangla summary", async () => {
    const token = await accessTokenFor(["scholar"]);
    const response = await createItemRoute(jsonRequest("POST", { title: "T", abstract: "A" }, token));
    const payload = (await response.json()) as ItemPayload;

    expect(response.status).toBe(201);
    expect(payload.item.status).toBe("draft");
    expect(payload.item.summaryBn).toBe("");
  });

  it("rejects a learner with 403 and an anonymous caller with 401", async () => {
    const learnerToken = await accessTokenFor(["learner"]);
    const learnerResponse = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", status: "published" }, learnerToken),
    );
    const learnerPayload = (await learnerResponse.json()) as ErrorPayload;

    expect(learnerResponse.status).toBe(403);
    expect(learnerPayload.error.code).toBe("CONTENT_FORBIDDEN");

    const anonymousResponse = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", status: "published" }),
    );
    const anonymousPayload = (await anonymousResponse.json()) as ErrorPayload;

    expect(anonymousResponse.status).toBe(401);
    expect(anonymousPayload.error.code).toBe("AUTH_UNAUTHORIZED");
  });
});
