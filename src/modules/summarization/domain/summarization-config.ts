/**
 * The summarization configuration, resolved from the environment with the documented defaults
 * (`docs/configuration.md`). The defaults live here, once, and both the provider selector and the
 * Gemini provider read through these resolvers, so an admin surface reports exactly the values a
 * run would use.
 */
export type AiSummaryDriver = "auto" | "fake" | "gemini";

/** The provider a run would use, or `"unavailable"` when nothing is configured. */
export type SummaryProviderName = "fake" | "gemini" | "unavailable";

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = 15000;

/** `auto` resolves by environment; `fake` and `gemini` force that provider. */
export function resolveAiSummaryDriver(): AiSummaryDriver {
  const driver = process.env.AI_SUMMARY_DRIVER;

  return driver === "fake" || driver === "gemini" ? driver : "auto";
}

/**
 * The provider a run would resolve *without throwing* — `"fake"`, `"gemini"`, or `"unavailable"`
 * when nothing is configured. The provider selector uses this, and an admin surface reports it
 * rather than calling the selector, which throws for the unconfigured case.
 */
export function resolveSummaryProviderName(): SummaryProviderName {
  const driver = resolveAiSummaryDriver();

  if (driver === "fake" || driver === "gemini") {
    return driver;
  }

  if (process.env.NODE_ENV === "test") {
    return "fake";
  }

  return process.env.GEMINI_API_KEY ? "gemini" : "unavailable";
}

/** The Gemini model id passed to `generateContent`. */
export function resolveSummaryModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();

  return model && model.length > 0 ? model : DEFAULT_MODEL;
}

/** How long a single summarization call may run before it is aborted, in milliseconds. */
export function resolveSummaryTimeoutMs(): number {
  const raw = Number.parseInt(process.env.AI_SUMMARY_TIMEOUT_MS ?? "", 10);

  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}
