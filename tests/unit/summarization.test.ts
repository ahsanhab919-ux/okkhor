import { vi } from "vitest";

import { createContentItem, updateContentItem } from "@/src/modules/content/application/content-service";
import { createItemSchema, updateItemSchema } from "@/src/modules/content/domain/content-schemas";
import type { ContentAuthor } from "@/src/modules/content/domain/content-types";
import { resetContentStoreForTesting } from "@/src/modules/content/infrastructure/content-store";
import { summarizeResearchItem } from "@/src/modules/summarization/application/summarization-service";
import { SummarizationError } from "@/src/modules/summarization/domain/summarization-errors";
import {
  summarizeInputSchema,
  summaryResultSchema,
} from "@/src/modules/summarization/domain/summarization-schemas";
import type { SummaryProvider } from "@/src/modules/summarization/domain/summarization-types";
import { createFakeSummaryProvider } from "@/src/modules/summarization/infrastructure/fake-summary-provider";
import { createGeminiSummaryProvider } from "@/src/modules/summarization/infrastructure/gemini-summary-provider";
import { getSummaryProvider } from "@/src/modules/summarization/infrastructure/summary-provider";

const scholar: ContentAuthor = { id: "user-scholar", roles: ["scholar"] };

describe("summarization schemas", () => {
  it("requires a non-empty title and abstract on the input", () => {
    expect(summarizeInputSchema.safeParse({ title: "", abstract: "A", sourceLanguage: "en" }).success).toBe(false);
    expect(summarizeInputSchema.safeParse({ title: "T", abstract: "  ", sourceLanguage: "en" }).success).toBe(false);
    expect(summarizeInputSchema.safeParse({ title: "T", abstract: "A", sourceLanguage: "en" }).success).toBe(true);
  });

  it("rejects an empty provider output on either summary", () => {
    expect(summaryResultSchema.safeParse({ summaryEn: "", summaryBn: "বাংলা" }).success).toBe(false);
    expect(summaryResultSchema.safeParse({ summaryEn: "English", summaryBn: "" }).success).toBe(false);
    expect(summaryResultSchema.safeParse({ summaryEn: "English", summaryBn: "বাংলা" }).success).toBe(true);
  });
});

describe("summary provider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the deterministic fake provider under test", async () => {
    const result = await getSummaryProvider().summarize({ title: "Climate", abstract: "A", sourceLanguage: "en" });

    expect(result.summaryEn).toContain("Climate");
    expect(result.summaryBn).toContain("Climate");
  });

  it("honours an explicit fake driver", async () => {
    vi.stubEnv("AI_SUMMARY_DRIVER", "fake");

    const result = await getSummaryProvider().summarize({ title: "T", abstract: "A", sourceLanguage: "en" });

    expect(result.summaryBn).toContain("T");
  });

  it("fails fast with AI_UNAVAILABLE when unconfigured outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_SUMMARY_DRIVER", "");
    vi.stubEnv("GEMINI_API_KEY", "");

    expect(() => getSummaryProvider()).toThrowError(
      expect.objectContaining({ code: "AI_UNAVAILABLE", status: 503 }),
    );
  });
});

describe("fake summary provider", () => {
  it("is deterministic for the same input", async () => {
    const provider = createFakeSummaryProvider();
    const input = { title: "Renewable energy", abstract: "A", sourceLanguage: "en" };

    expect(await provider.summarize(input)).toEqual(await provider.summarize(input));
  });
});

describe("summarization service", () => {
  it("maps a provider throw to AI_SUMMARY_FAILED", async () => {
    const provider: SummaryProvider = {
      async summarize() {
        throw new Error("boom");
      },
    };

    await expect(
      summarizeResearchItem({ title: "T", abstract: "A", sourceLanguage: "en" }, provider),
    ).rejects.toMatchObject({ code: "AI_SUMMARY_FAILED", status: 502 });
  });

  it("rejects an empty provider output with AI_SUMMARY_FAILED", async () => {
    const provider: SummaryProvider = {
      async summarize() {
        return { summaryEn: "", summaryBn: "" };
      },
    };

    await expect(
      summarizeResearchItem({ title: "T", abstract: "A", sourceLanguage: "en" }, provider),
    ).rejects.toMatchObject({ code: "AI_SUMMARY_FAILED", status: 502 });
  });

  it("returns the validated provider output on success", async () => {
    const result = await summarizeResearchItem({ title: "T", abstract: "A", sourceLanguage: "en" });

    expect(result.summaryEn).toContain("T");
    expect(result.summaryBn).toContain("T");
  });

  it("surfaces AI_UNAVAILABLE when no provider is configured outside tests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_SUMMARY_DRIVER", "");
    vi.stubEnv("GEMINI_API_KEY", "");

    try {
      await expect(
        summarizeResearchItem({ title: "T", abstract: "A", sourceLanguage: "en" }),
      ).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("gemini summary provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function geminiBody(text: string): Response {
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200 },
    );
  }

  it("parses the model's JSON summary", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(geminiBody(JSON.stringify({ summaryEn: "English", summaryBn: "বাংলা" }))),
    );

    const result = await createGeminiSummaryProvider().summarize({
      title: "T",
      abstract: "A",
      sourceLanguage: "en",
    });

    expect(result).toEqual({ summaryEn: "English", summaryBn: "বাংলা" });
  });

  it("maps a non-ok response to AI_SUMMARY_FAILED", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 502 })));

    await expect(
      createGeminiSummaryProvider().summarize({ title: "T", abstract: "A", sourceLanguage: "en" }),
    ).rejects.toMatchObject({ code: "AI_SUMMARY_FAILED", status: 502 });
  });

  it("maps a network failure to AI_SUMMARY_FAILED", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      createGeminiSummaryProvider().summarize({ title: "T", abstract: "A", sourceLanguage: "en" }),
    ).rejects.toMatchObject({ code: "AI_SUMMARY_FAILED", status: 502 });
  });

  it("maps an unreadable model response to AI_SUMMARY_FAILED", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiBody("not json")));

    await expect(
      createGeminiSummaryProvider().summarize({ title: "T", abstract: "A", sourceLanguage: "en" }),
    ).rejects.toBeInstanceOf(SummarizationError);
  });
});

describe("relaxed content schema", () => {
  it("defaults an omitted Bangla summary on create", () => {
    const parsed = createItemSchema.parse({ title: "T", abstract: "A" });

    expect(parsed.summaryBn).toBe("");
  });

  it("rejects a blank Bangla summary when one is supplied", () => {
    expect(createItemSchema.safeParse({ title: "T", abstract: "A", summaryBn: "   " }).success).toBe(false);
  });

  it("leaves an omitted Bangla summary absent on update", () => {
    const parsed = updateItemSchema.parse({ title: "Only the title" });

    expect(parsed.summaryBn).toBeUndefined();
  });
});

describe("content publish invariant", () => {
  beforeEach(() => {
    resetContentStoreForTesting();
  });

  it("rejects publishing a new item without a Bangla summary", async () => {
    await expect(
      createContentItem(scholar, { title: "T", abstract: "A", status: "published" }),
    ).rejects.toMatchObject({ code: "CONTENT_VALIDATION_FAILED", status: 400 });
  });

  it("rejects publishing a draft whose stored summary is blank", async () => {
    const draft = await createContentItem(scholar, { title: "T", abstract: "A" });

    await expect(updateContentItem(scholar, draft.id, { status: "published" })).rejects.toMatchObject({
      code: "CONTENT_VALIDATION_FAILED",
      status: 400,
    });
  });

  it("allows a draft to be saved without a Bangla summary", async () => {
    const draft = await createContentItem(scholar, { title: "T", abstract: "A" });

    expect(draft.summaryBn).toBe("");
    expect(draft.status).toBe("draft");
  });
});
