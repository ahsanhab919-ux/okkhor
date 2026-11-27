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
  item: { id: string; status: string; updatedAt: string; authorId?: string };
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

describe("content authoring routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
  });

  it("rejects unauthenticated writes with 401", async () => {
    const response = await createItemRoute(jsonRequest("POST", { title: "T", abstract: "A", summaryBn: "S" }));
    const payload = (await response.json()) as ErrorPayload;

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("rejects authenticated learners with 403", async () => {
    const token = await accessTokenFor(["learner"]);
    const response = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", summaryBn: "S" }, token),
    );
    const payload = (await response.json()) as ErrorPayload;

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("CONTENT_FORBIDDEN");
  });

  it("creates a draft as a scholar", async () => {
    const token = await accessTokenFor(["scholar"]);
    const response = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", summaryBn: "S" }, token),
    );
    const payload = (await response.json()) as ItemPayload;

    expect(response.status).toBe(201);
    expect(payload.item).toMatchObject({ title: "T", status: "draft" });
    expect(payload.item.authorId).toBeTruthy();
  });

  it("rejects an invalid payload with 400", async () => {
    const token = await accessTokenFor(["scholar"]);
    const response = await createItemRoute(
      jsonRequest("POST", { title: "", abstract: "A", summaryBn: "S" }, token),
    );
    const payload = (await response.json()) as ErrorPayload;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("CONTENT_VALIDATION_FAILED");
  });

  it("publishes an item and makes it visible on the public list", async () => {
    const token = await accessTokenFor(["scholar"]);
    const createResponse = await createItemRoute(
      jsonRequest("POST", { title: "T", abstract: "A", summaryBn: "S" }, token),
    );
    const created = (await createResponse.json()) as ItemPayload;

    const publishResponse = await updateItemRoute(
      jsonRequest(
        "PATCH",
        { status: "published", updatedAt: created.item.updatedAt },
        token,
        `${BASE}/${created.item.id}`,
      ),
      itemContext(created.item.id),
    );
    const published = (await publishResponse.json()) as ItemPayload;

    expect(publishResponse.status).toBe(200);
    expect(published.item.status).toBe("published");

    const page = await listPublishedItems({ limit: 10 });

    expect(page.items.map((item) => item.id)).toContain(created.item.id);
  });

  it("returns 404 when editing an unknown item", async () => {
    const token = await accessTokenFor(["scholar"]);
    const response = await updateItemRoute(
      jsonRequest("PATCH", { title: "T" }, token, `${BASE}/missing`),
      itemContext("missing"),
    );
    const payload = (await response.json()) as ErrorPayload;

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("CONTENT_ITEM_NOT_FOUND");
  });

  it("rejects a stale edit with 409", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    try {
      vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
      const token = await accessTokenFor(["scholar"]);
      const createResponse = await createItemRoute(
        jsonRequest("POST", { title: "T", abstract: "A", summaryBn: "S" }, token),
      );
      const created = (await createResponse.json()) as ItemPayload;

      vi.setSystemTime(new Date("2026-05-01T00:00:10.000Z"));
      await updateItemRoute(
        jsonRequest("PATCH", { title: "First edit", updatedAt: created.item.updatedAt }, token, `${BASE}/${created.item.id}`),
        itemContext(created.item.id),
      );

      vi.setSystemTime(new Date("2026-05-01T00:00:20.000Z"));
      const staleResponse = await updateItemRoute(
        jsonRequest("PATCH", { title: "Stale edit", updatedAt: created.item.updatedAt }, token, `${BASE}/${created.item.id}`),
        itemContext(created.item.id),
      );
      const payload = (await staleResponse.json()) as ErrorPayload;

      expect(staleResponse.status).toBe(409);
      expect(payload.error.code).toBe("CONTENT_CONFLICT");
    } finally {
      vi.useRealTimers();
    }
  });
});
