import { createContentItem, getContentItem, updateContentItem } from "@/src/modules/content/application/content-service";
import { canAuthor } from "@/src/modules/content/domain/content-authorization";
import { ContentError } from "@/src/modules/content/domain/content-errors";
import type {
  ContentAuthor,
  CreateItemInput,
  ResearchItem,
  UpdateItemInput,
} from "@/src/modules/content/domain/content-types";
import { summarizeResearchItem } from "@/src/modules/summarization/application/summarization-service";
import type { SummaryResult } from "@/src/modules/summarization/domain/summarization-types";

/**
 * Composition-root helper (lives in `app/**`): it owns the ordering of the AI summarization call
 * versus the content write. The content module never imports summarization, and vice versa; the
 * two are joined only here, per `ADR-001` and module-boundaries §6 rule 4.
 *
 * On a publish transition the summary is generated **first** (so the English preview is always
 * available) and its Bangla summary is injected only when the author left the summary blank — the
 * author's own text wins. On provider failure the content write is not attempted, so the item
 * stays as it was (draft).
 */
export type AuthoringBody = Record<string, unknown>;

export type AuthoringResult = {
  item: ResearchItem;
  /** Present whenever the write published the item; the English summary is never persisted. */
  summary?: SummaryResult;
};

function assertCanAuthor(actor: ContentAuthor) {
  if (!canAuthor(actor.roles)) {
    throw new ContentError("You do not have permission to author research items.", "CONTENT_FORBIDDEN", 403);
  }
}

function readString(body: AuthoringBody, key: string): string | undefined {
  const value = body[key];

  return typeof value === "string" ? value : undefined;
}

/**
 * Runs the provider on a publish transition, returning the transient summary, or `undefined` when
 * the write is not a publish (a draft save, or an edit to an already-published item).
 */
async function summarizeOnPublish(
  isPublishTransition: boolean,
  input: { title: string; abstract: string; sourceLanguage: string },
): Promise<SummaryResult | undefined> {
  // A missing title/abstract means the content schema will reject the write with a 400; skip
  // generation so the caller gets that rather than a misleading 502.
  if (!isPublishTransition || !input.title || !input.abstract) {
    return undefined;
  }

  return summarizeResearchItem(input);
}

/** POST `/api/content/items`: create, generating the summary first when the new item publishes. */
export async function createItemWithSummary(actor: ContentAuthor, body: AuthoringBody): Promise<AuthoringResult> {
  assertCanAuthor(actor);

  const isPublishTransition = body.status === "published";
  const providedSummaryBn = readString(body, "summaryBn")?.trim() ?? "";
  const summary = await summarizeOnPublish(isPublishTransition, {
    title: readString(body, "title")?.trim() ?? "",
    abstract: readString(body, "abstract")?.trim() ?? "",
    sourceLanguage: readString(body, "sourceLanguage")?.trim() || "en",
  });

  // The author's summary wins; the AI's Bangla summary is used only to fill a blank one.
  const payload =
    summary && !providedSummaryBn ? { ...body, summaryBn: summary.summaryBn } : body;
  const item = await createContentItem(actor, payload as CreateItemInput);

  return { item, summary };
}

/**
 * PATCH `/api/content/items/[id]`: read the item first so the effective status and summary are
 * known, then generate-and-inject on the draft → published transition.
 */
export async function updateItemWithSummary(
  actor: ContentAuthor,
  id: string,
  body: AuthoringBody,
): Promise<AuthoringResult> {
  assertCanAuthor(actor);

  const existing = await getContentItem(id);
  const nextStatus = body.status === "published" || body.status === "draft" ? body.status : existing.status;
  const isPublishTransition = nextStatus === "published" && existing.status !== "published";
  const providedSummaryBn = readString(body, "summaryBn")?.trim();
  const effectiveSummaryBn = providedSummaryBn !== undefined ? providedSummaryBn : existing.summaryBn;
  const summary = await summarizeOnPublish(isPublishTransition, {
    title: readString(body, "title")?.trim() || existing.title,
    abstract: readString(body, "abstract")?.trim() || existing.abstract,
    sourceLanguage: readString(body, "sourceLanguage")?.trim() || existing.sourceLanguage,
  });

  const payload =
    summary && !effectiveSummaryBn ? { ...body, summaryBn: summary.summaryBn } : body;
  const item = await updateContentItem(actor, id, payload as UpdateItemInput);

  return { item, summary };
}
