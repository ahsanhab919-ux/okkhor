import { NextRequest } from "next/server";

import { DELETE as removeItemRoute } from "@/app/api/library/items/[id]/route";
import { POST as saveItemRoute } from "@/app/api/library/items/route";
import { GET as listLibraryRoute } from "@/app/api/library/route";
import type { ResearchItem } from "@/src/modules/content/domain/content-types";
import {
  getMemoryContentRepository,
  resetContentStoreForTesting,
} from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";
import { resetLibraryStoreForTesting } from "@/src/modules/library/infrastructure/library-store";

const LIBRARY_URL = "http://localhost/api/library";

type ErrorPayload = {
  error: { code: string };
};

function jsonRequest(method: string, body?: unknown, token?: string, url: string = LIBRARY_URL) {
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

function researchItem(overrides: Partial<ResearchItem> & { id: string }): ResearchItem {
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

async function persona(phoneNumber: string) {
  const result = await registerUser({
    phoneNumber,
    displayName: "Library Member",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles: ["learner"],
  });

  return { token: result.tokens.accessToken, userId: result.user.id };
}

describe("library routes", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    resetLibraryStoreForTesting();
  });

  it("rejects unauthenticated listing with 401", async () => {
    const response = await listLibraryRoute(jsonRequest("GET"));

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("saves a published item once and is idempotent", async () => {
    const member = await persona("01712345678");

    await getMemoryContentRepository().createItem(researchItem({ id: "item-1" }));

    const first = await saveItemRoute(jsonRequest("POST", { itemId: "item-1" }, member.token));
    const firstBody = (await first.json()) as { item: { itemId: string; savedAt: string } };

    expect(first.status).toBe(201);
    expect(firstBody.item.itemId).toBe("item-1");
    expect(firstBody.item.savedAt).toBeTruthy();

    const second = await saveItemRoute(jsonRequest("POST", { itemId: "item-1" }, member.token));

    expect(second.status).toBe(200);

    const list = await listLibraryRoute(jsonRequest("GET", undefined, member.token));
    const payload = (await list.json()) as { items: { item: { id: string } }[]; total: number };

    expect(payload.total).toBe(1);
    expect(payload.items.map((entry) => entry.item.id)).toEqual(["item-1"]);
  });

  it("rejects saving a draft or unknown item with 404", async () => {
    const member = await persona("01712345678");

    await getMemoryContentRepository().createItem(
      researchItem({ id: "draft-1", status: "draft", publishedAt: undefined }),
    );

    const draft = await saveItemRoute(jsonRequest("POST", { itemId: "draft-1" }, member.token));

    expect(draft.status).toBe(404);
    expect(((await draft.json()) as ErrorPayload).error.code).toBe("LIBRARY_ITEM_NOT_FOUND");

    const unknown = await saveItemRoute(jsonRequest("POST", { itemId: "missing" }, member.token));

    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as ErrorPayload).error.code).toBe("LIBRARY_ITEM_NOT_FOUND");
  });

  it("rejects an invalid save payload with 400", async () => {
    const member = await persona("01712345678");
    const response = await saveItemRoute(jsonRequest("POST", { itemId: "" }, member.token));

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("LIBRARY_VALIDATION_FAILED");
  });

  it("removes a saved item and treats a second remove as a no-op", async () => {
    const member = await persona("01712345678");

    await getMemoryContentRepository().createItem(researchItem({ id: "item-1" }));
    await saveItemRoute(jsonRequest("POST", { itemId: "item-1" }, member.token));

    const removed = await removeItemRoute(jsonRequest("DELETE", undefined, member.token), itemContext("item-1"));

    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { removed: boolean }).removed).toBe(true);

    const again = await removeItemRoute(jsonRequest("DELETE", undefined, member.token), itemContext("item-1"));

    expect(((await again.json()) as { removed: boolean }).removed).toBe(false);
  });

  it("omits an item that was unpublished after it was saved", async () => {
    const member = await persona("01712345678");
    const repository = getMemoryContentRepository();

    await repository.createItem(researchItem({ id: "item-1" }));
    await saveItemRoute(jsonRequest("POST", { itemId: "item-1" }, member.token));

    await repository.createItem(researchItem({ id: "item-1", status: "draft", publishedAt: undefined }));

    const list = await listLibraryRoute(jsonRequest("GET", undefined, member.token));
    const payload = (await list.json()) as { items: unknown[]; total: number };

    expect(payload.total).toBe(0);
    expect(payload.items).toEqual([]);
  });

  it("returns hydrated items newest-saved first and keeps members isolated", async () => {
    const memberA = await persona("01712345678");
    const memberB = await persona("01798765432");
    const repository = getMemoryContentRepository();

    await repository.createItem(researchItem({ id: "item-a", title: "Alpha" }));
    await repository.createItem(researchItem({ id: "item-b", title: "Beta" }));

    await saveItemRoute(jsonRequest("POST", { itemId: "item-a" }, memberA.token));
    await saveItemRoute(jsonRequest("POST", { itemId: "item-b" }, memberA.token));

    const list = await listLibraryRoute(jsonRequest("GET", undefined, memberA.token));
    const payload = (await list.json()) as { items: { item: { id: string; title: string } }[] };

    // Both saves land in the same millisecond, so `itemId` descending breaks the tie.
    expect(payload.items.map((entry) => entry.item.id)).toEqual(["item-b", "item-a"]);
    expect(payload.items[0].item.title).toBe("Beta");

    const otherList = await listLibraryRoute(jsonRequest("GET", undefined, memberB.token));

    expect(((await otherList.json()) as { total: number }).total).toBe(0);
  });
});
