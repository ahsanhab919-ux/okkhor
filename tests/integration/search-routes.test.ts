import { NextRequest } from "next/server";

import { GET as searchRoute } from "@/app/api/search/route";
import { getMemoryCommunityRepository, resetCommunityStoreForTesting } from "@/src/modules/community/infrastructure/community-store";
import { getMemoryContentRepository, resetContentStoreForTesting } from "@/src/modules/content/infrastructure/content-store";
import { registerUser } from "@/src/modules/identity/application/auth-service";
import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { resetAuthStoreForTesting } from "@/src/modules/identity/infrastructure/auth-store";

type ErrorPayload = {
  error: { code: string };
};

type SearchPayload = {
  hits: { id: string; kind: string; href: string }[];
  total: number;
};

function searchRequest(query: string, token?: string) {
  const request = new NextRequest(`http://localhost/api/search${query}`, { method: "GET" });

  if (token) {
    request.cookies.set(ACCESS_TOKEN_COOKIE, token);
  }

  return request;
}

async function persona(phoneNumber: string) {
  const result = await registerUser({
    phoneNumber,
    displayName: "Search Member",
    password: "Okkhor2026",
    locale: "bn-BD",
    roles: ["learner"],
  });

  return { token: result.tokens.accessToken, userId: result.user.id };
}

async function seed() {
  const author = await persona("01712345678");

  await getMemoryContentRepository().createItem({
    id: "i1",
    title: "Climate adaptation in Bengal",
    abstract: "flood resilience",
    summaryBn: "সারাংশ",
    sourceLanguage: "en",
    tags: ["climate"],
    status: "published",
    authorId: author.userId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await getMemoryCommunityRepository().createThread({
    id: "t1",
    authorId: author.userId,
    title: "Policy debate",
    body: "a climate policy argument",
    category: "Policy",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  });

  return author;
}

describe("search route", () => {
  beforeEach(() => {
    resetAuthStoreForTesting();
    resetContentStoreForTesting();
    resetCommunityStoreForTesting();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const response = await searchRoute(searchRequest("?q=climate"));

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorPayload).error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("returns unified hits for both kinds", async () => {
    const author = await seed();
    const response = await searchRoute(searchRequest("?q=climate", author.token));
    const payload = (await response.json()) as SearchPayload;

    expect(response.status).toBe(200);
    expect(payload.total).toBe(2);
    expect(payload.hits.map((hit) => hit.kind).sort()).toEqual(["research", "thread"]);
  });

  it("narrows by kind, tag, category, and author", async () => {
    const author = await seed();

    const research = (await (
      await searchRoute(searchRequest("?q=climate&kind=research", author.token))
    ).json()) as SearchPayload;
    expect(research.hits.map((hit) => hit.id)).toEqual(["i1"]);

    const byTag = (await (
      await searchRoute(searchRequest("?q=climate&tag=climate", author.token))
    ).json()) as SearchPayload;
    expect(byTag.hits.map((hit) => hit.id)).toEqual(["i1"]);

    const byCategory = (await (
      await searchRoute(searchRequest("?q=climate&category=Policy", author.token))
    ).json()) as SearchPayload;
    expect(byCategory.hits.map((hit) => hit.id)).toEqual(["t1"]);

    const byAuthor = (await (
      await searchRoute(searchRequest(`?q=climate&author=${author.userId}`, author.token))
    ).json()) as SearchPayload;
    expect(byAuthor.total).toBe(2);
  });

  it("orders by recency when sort=newest", async () => {
    const author = await seed();
    const response = await searchRoute(searchRequest("?q=climate&sort=newest", author.token));
    const payload = (await response.json()) as SearchPayload;

    expect(payload.hits.map((hit) => hit.id)).toEqual(["t1", "i1"]);
  });

  it("clamps limit", async () => {
    const author = await seed();
    const response = await searchRoute(searchRequest("?q=climate&limit=999", author.token));
    const payload = (await response.json()) as SearchPayload;

    expect(response.status).toBe(200);
    expect(payload.hits.length).toBeLessThanOrEqual(2);
  });

  it("rejects an empty or over-long query with 400", async () => {
    const author = await seed();

    const empty = await searchRoute(searchRequest("?q=", author.token));
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as ErrorPayload).error.code).toBe("SEARCH_VALIDATION_FAILED");

    const missing = await searchRoute(searchRequest("", author.token));
    expect(missing.status).toBe(400);

    const overLong = await searchRoute(searchRequest(`?q=${"a".repeat(130)}`, author.token));
    expect(overLong.status).toBe(400);
  });
});
