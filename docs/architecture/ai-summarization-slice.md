# AI Summarization Slice

- Status: `Proposed` (Definition of Ready draft — decisions recorded in §13; not yet implemented)
- Related ADRs: `ADR-001`, `ADR-002`, `ADR-004`, `ADR-009`
- Owner: `Engineering Lead`
- Handbook: `ENGINEERING_HANDBOOK.md` §7.2 (Definition of Ready), §7.3 (Definition of Done)
- Predecessors: [content-comprehension-slice.md](content-comprehension-slice.md) (the research read
  path), [content-authoring-slice.md](content-authoring-slice.md) (the authoring/publish flow this
  slice hooks into)

## 1. Purpose

Okkhor's stated product value is that a research item carries a Bangla comprehension summary
(`summaryBn`) so a South Asian learner on a low-end Android device can understand the work in
their native language without reading the source-language abstract. Today that summary is written
**by hand** by the authoring scholar: the field is required on the create and edit forms
(`content-schemas.ts`) and nothing assists the author.

The product is described as an **AI-assisted** research comprehension platform
([system-overview.md](system-overview.md) §2), but no AI capability exists in the code. The
scholar has to translate and simplify an abstract manually — a slow, inconsistent step that is
also the single biggest blocker to publishing at volume.

This document is the design/architecture note and Definition of Ready for the **sixth product
slice — AI summarization** — which adds a summarization module that produces, from an item's
English abstract, **both** an English summary and a Bangla (`bn-BD`) plain-language summary. The
Bangla summary is persisted into the existing `summaryBn` field **automatically when an item is
published**; the English summary is returned to the caller as a **transient** preview (it is not
stored, since the content model has no English-summary column).

Everything is a proposal until §2 is accepted; the open questions are resolved in §13.

## 2. Definition of Ready (`§7.2`)

| Requirement | This slice |
| --- | --- |
| Clear business outcome | A scholar publishes a research item and the platform generates the Bangla summary automatically, removing the manual translation step (§3) |
| Acceptance criteria | Enumerated in §3 |
| Dependencies identified | The content authoring/publish flow (already built); a model provider credential for `gemini`; no new tables and no migration (§10) |
| Risk level understood | **Medium** — it introduces the first outbound third-party network dependency and the first externally-billed call, but it is gated to scholars/admins and blocks publish on failure (§12) |
| Design/architecture note | This document |

Do not start implementation until this section is accepted.

## 3. Business Outcome and Acceptance Criteria

**Outcome.** Publishing no longer requires the author to write the Bangla summary by hand. When a
scholar/admin moves an item from draft to published, the platform calls the configured model with
the item's title and abstract, receives an English summary and a Bangla summary, persists the
Bangla one, and returns the English one to the author as a preview.

Acceptance criteria:

- [ ] Publishing a draft whose `summaryBn` is empty generates a Bangla summary and persists it; the
      published item's `summaryBn` is non-empty.
- [ ] Publishing a draft whose `summaryBn` the author already wrote **keeps the author's text**
      (the AI does not overwrite author work).
- [ ] The publish response includes the transient English summary (`summary.summaryEn`); it is
      **not** persisted anywhere.
- [ ] Drafts may be saved and edited **without** a Bangla summary (the field is optional until
      publish).
- [ ] If the provider call fails or returns an unusable response, publish returns `502` with
      `AI_SUMMARY_FAILED` and the item **remains a draft** (no partial publish).
- [ ] The summarization call is only reachable through the scholar/admin-gated authoring path; a
      learner receives `403`, an anonymous caller `401`.
- [ ] In tests and CI the **fake** provider is used; no outbound network call is made (deterministic
      output).
- [ ] Unit tests cover the provider selection, the fake provider, the service validation of
      provider output, and the "keep the author's summary" rule; integration tests cover the publish
      transition, the failure-block, and the schema relaxation.
- [ ] No new database tables and no migration.

## 4. Scope

**In scope:**

- a new `summarization` module (domain, application, infrastructure, api) with a provider selector
- an English + Bangla summary produced from the item's title and abstract
- automatic generation on the publish transition, wired in the composition root (`app/**`)
- persistence of the Bangla summary into the existing `summaryBn` field, and a transient English
  summary in the publish response
- relaxing `summaryBn` from "required to save" to "required to publish"
- the `AI_SUMMARY_DRIVER` configuration, a deterministic fake provider, and a Google Gemini
  provider

**Explicitly out of scope (deferred):**

- **storing** the English summary — the content model has one summary column; a `summary_en`
  column is a deliberate non-goal of this slice (§13.2)
- on-demand / manual regeneration, per-item model choice, or an author-facing "generate" button
  (the trigger is publish only, §13.3)
- summarizing community threads, verification applications, or any non-research corpus
- translating the abstract into Bangla verbatim, or translating the item title
- streaming, batching, queued/background generation, retries, or a job runner
- caching, cost accounting, or per-user rate limiting of model calls (the authoring gate is the
  control; §12)
- provider fallbacks or multi-provider routing (one provider is implemented, §13.1)

Keeping the slice to one provider, one trigger, and no schema change keeps it small and reversible.

## 5. Core Entities and Domain Changes

New module types in `src/modules/summarization/domain/summarization-types.ts`:

| Type | Fields |
| --- | --- |
| `SummarizeInput` | `title: string`, `abstract: string`, `sourceLanguage: string` |
| `SummaryResult` | `summaryEn: string`, `summaryBn: string` |
| `SummaryProvider` | `summarize(input: SummarizeInput): Promise<SummaryResult>` |

New error codes in `src/modules/summarization/domain/summarization-errors.ts` (§6.2).

Content-module changes (existing files):

- `content-schemas.ts` — `summaryBn` becomes **optional** on create (defaulting to `""`) and on
  update (kept when omitted). When provided it must still be a non-empty, ≤ 5000-char string.
- `content-service.ts` — add a publish invariant: when the resulting `status` is `"published"`,
  `summaryBn` must be non-empty, otherwise `CONTENT_VALIDATION_FAILED` (`400`). Because the
  composition root injects the AI summary **before** calling the service (§8), a normally-published
  item always satisfies this; the invariant only guards direct/corrupt callers.
- `item-editor-form.tsx` — drop the `required` attribute on the Bangla-summary textarea, relabel it
  as auto-generated, and render the transient English summary returned by a successful publish as a
  read-only "AI English summary (preview, not saved)" panel before navigating to `/studio`.

No change to `ResearchItem`'s field types: `summaryBn` stays `string`; a draft simply stores `""`
(which keeps the `content_items.summary_bn NOT NULL` column valid — see §9).

## 6. API Contracts

Summarization has **no dedicated endpoint**. It runs inside the existing authoring writes when the
resulting status is `published`:

| Method | Path | Change |
| --- | --- | --- |
| `POST` | `/api/content/items` | when the created item is `published`, generate the summary first |
| `PATCH` | `/api/content/items/[id]` | when the edit publishes the item, generate the summary first |

Both keep their existing request bodies and, on success, **add** an optional transient field:

```json
{
  "item": { "…ResearchItem with a non-empty summaryBn…" },
  "summary": { "summaryEn": "…", "summaryBn": "…" }
}
```

`summary` is present only when generation ran (i.e. the transition published an item whose stored
`summaryBn` was empty). It is never persisted; a client that ignores it loses the English preview
only.

### 6.1 Behavior on the publish transition

1. Resolve the actor (existing `app/api/content/*/content-actor.ts`) and enforce `canAuthor`.
2. Parse the incoming payload with the (now optional-`summaryBn`) content schema.
3. Determine the resulting status and the effective `summaryBn` (payload value, else the stored
   value).
4. If the result is `published` **and** the effective `summaryBn` is empty, call
   `summarizeResearchItem({ title, abstract, sourceLanguage })` and inject the returned `summaryBn`
   into the content payload, then call the content service. On provider failure the write is not
   attempted and the item stays as it was (draft).
5. Return `{ item, summary }` (the `summary` block only in the generated case).

### 6.2 Error codes

New codes, whose executable source of truth is
`src/modules/summarization/domain/summarization-errors.ts`:

| Code | Status | Meaning |
| --- | --- | --- |
| `AI_SUMMARY_FAILED` | 502 | The provider call failed or returned an unusable (empty/invalid) summary |
| `AI_UNAVAILABLE` | 503 | Summarization is not configured (no provider credentials) |
| `AI_UNKNOWN` | 500 | Unhandled failure (fallback) |

These are shaped by a new `src/modules/summarization/api/summarization-http.ts`
(`summarizationErrorResponse`), mirrored on `content-http.ts`. The content route handlers catch
`AuthError` → `authErrorResponse`, then `SummarizationError` → `summarizationErrorResponse`, then
`ContentError` → `contentErrorResponse`, in that order.

## 7. Authorization Model

- **Scholars/admins only.** Summarization is reachable only through the content authoring writes,
  which already enforce `canAuthor` (`content-authorization.ts`): `scholar` and `admin` may author,
  `learner` may not. No new role and no new gate are introduced.
- **No standalone surface.** There is no `/api/summarize` route and no UI that calls the model
  directly, so there is no new endpoint to authorize; the existing `403`/`401` behavior of the
  content writes applies unchanged.
- **Composition root.** The acting member and the ordering of the AI call versus the content write
  are resolved in `app/**`; the `summarization` module imports identity **types only** (it does not
  import `content` at all — it is handed plain `{ title, abstract, sourceLanguage }`).
- **Cost control.** Because only scholars/admins can trigger a call, the authoring role is the
  rate control for this slice; explicit quota/pricing controls are out of scope (§4) and recorded as
  a risk (§12).

## 8. Module Placement and Dependencies

```
src/modules/summarization/
  domain/         summarization-types.ts     (SummarizeInput, SummaryResult, SummaryProvider)
                  summarization-errors.ts    (AI_* codes)
                  summarization-schemas.ts   (Zod input + provider-output schemas)
  application/    summarization-service.ts   (validate input -> provider -> validate output)
  infrastructure/ summary-provider.ts         (AI_SUMMARY_DRIVER selector)
                  fake-summary-provider.ts    (deterministic; used under NODE_ENV=test)
                  gemini-summary-provider.ts  (fetch to the Gemini generateContent API)
  api/            summarization-http.ts       (response/error shaping for the caller's routes)
app/
  api/content/items/route.ts                  (POST: generate-then-create when publishing)
  api/content/items/[id]/route.ts             (PATCH: generate-then-update when publishing)
  api/content/items/summarize-on-publish.ts   (shared composition helper: ai + content ordering)
```

- `summarization` depends on `platform` only if it needs shared runtime helpers; otherwise it is a
  leaf module with an outbound HTTP client.
- `summarization` does **not** import `content`; it accepts a plain input and returns a plain
  result. The content module does **not** import `summarization`. The two are joined **only** in the
  composition root (`app/api/content/items/**`), following `ADR-001` and
  [module-boundaries.md](module-boundaries.md) §6 rule 4.
- The shared helper `app/api/content/items/summarize-on-publish.ts` lives in `app/`, so the
  composition (not a module) owns the ordering: detect publish → summarize → inject → write.

## 9. Persistence and Provider Calls

**No new tables and no migration.** The slice reads the draft's `title`/`abstract` and writes the
existing `content_items.summary_bn` column through the normal content update. `summary_bn` stays
`NOT NULL`; a draft without a summary stores `""`, so no migration is required. The English summary
is never written.

**Provider selection** mirrors the established driver pattern:

```
AI_SUMMARY_DRIVER = auto | fake | gemini   (default: auto)
  fake   → deterministic fake provider (no network)
  gemini → Google Gemini provider
  auto   → NODE_ENV === "test"                 → fake
             else GEMINI_API_KEY present        → gemini
             else                                → throw (misconfiguration → AI_UNAVAILABLE)
```

`summarization-service.ts` validates the input with Zod, calls `getSummaryProvider().summarize(...)`,
and validates the **provider output** with a Zod schema (`summaryEn` and `summaryBn` both non-empty,
within length caps). A provider error or an invalid/empty result becomes `AI_SUMMARY_FAILED`
(`502`); a missing provider configuration becomes `AI_UNAVAILABLE` (`503`).

**Gemini provider.** A `POST` to
`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}` with
`generationConfig.responseMimeType = "application/json"` and a `responseSchema` of
`{ summaryEn, summaryBn }`, so the response is parsed as JSON rather than free text. The prompt
instructs the model to (a) write a concise plain-language **English** summary of the abstract and
(b) write a **Bangla (`bn-BD`)** plain-language summary for a general reader. The model defaults to
a current Flash model (`GEMINI_MODEL`) and the request is bounded by a timeout
(`AI_SUMMARY_TIMEOUT_MS`, default ~15000 ms). The API key is read only in
`infrastructure`, never in `domain`/`application`.

**Fake provider.** Returns a deterministic `{ summaryEn, summaryBn }` derived from the input (e.g.
a fixed prefix plus the title) so tests assert behavior without a network call or a snapshot that
depends on a live model.

## 10. What This Does Not Trigger

- **`ADR-003` (R2)** — no media.
- **`ADR-005` (Redis)** — no caching of summaries; each publish is a single call.
- **`ADR-006` (Qdrant)** — unrelated; no embedding or vector work.
- **`ADR-007` (offline)** — publish is an online, server-side operation.
- **`ADR-008`** — no calendar or scheduling behavior; no background job runner is added.

Uses only `ADR-004` (PostgreSQL, for the existing content write) plus a new outbound provider
integration; the content schema relaxation is the only change to an existing contract.

## 11. Testing Plan (`§7.3`)

- **Unit:** the input and provider-output schemas (empty/invalid provider output rejected); the
  provider selector (`fake` under test, misconfiguration throws); the fake provider's determinism;
  the service's failure mapping (provider throw → `AI_SUMMARY_FAILED`, unconfigured →
  `AI_UNAVAILABLE`); the content publish invariant (published + empty `summaryBn` →
  `CONTENT_VALIDATION_FAILED`); the relaxed content schema (draft without `summaryBn` accepted,
  blank `summaryBn` rejected).
- **Integration:** `POST`/`PATCH` publishing an item with an empty summary persists a non-empty
  `summaryBn` and returns the transient `summaryEn`; publishing with an author-written summary
  keeps it and still returns the English preview; a failing provider returns `502 AI_SUMMARY_FAILED`
  and the item is still `draft`; a learner gets `403` and an anonymous caller `401`; saving a draft
  without a summary succeeds.
- **Component:** the editor island publishes without a Bangla summary and shows the transient
  English preview; the textarea is no longer required.
- **Manual:** with a real `GEMINI_API_KEY`, publish a draft and confirm the persisted Bangla summary
  reads correctly and the English preview appears; publish a draft with an author-written summary
  and confirm it is preserved.

## 12. Risks and Mitigations

| Risk | Level | Mitigation |
| --- | --- | --- |
| First outbound third-party dependency and first externally-billed call | Medium | Gated to scholars/admins; the fake provider keeps CI offline; a timeout bounds each call; cost/quota controls are explicitly deferred (§4) and flagged here |
| Provider latency or outage blocks publishing | Medium | Publish is blocked on failure by decision (§13.5) and returns `AI_SUMMARY_FAILED`; the item stays a draft and the author can retry. A future retry/queue is out of scope |
| Model returns poor or unsafe Bangla | Medium | Output is validated for non-emptiness only; the author still sees the result and may edit the stored summary afterwards (§13.3 note). Quality evaluation is a follow-up, not a gate |
| Summary text is longer than the column's practical limit | Low | The provider-output schema caps both summaries; the content schema keeps the ≤ 5000-char rule |
| Silent provider misconfiguration in production | Low | The selector fails fast outside tests (as with the storage drivers); `AI_UNAVAILABLE` (503) is returned, and `.env.example` documents the variables |
| Relaxing the content schema weakens the authoring contract | Low | The "published items must have a summary" invariant is enforced in the service, not only the schema; both are unit-tested |
| New module drifts from the layering rules | Medium | Keep `summarization` free of `content` imports; join the modules only in `app/**`; read the key only in `infrastructure` |

## 13. Resolved Decisions

1. **Provider — Google Gemini.** Summaries are produced via the Gemini `generateContent` API
   (§13.1). The provider is selected by `AI_SUMMARY_DRIVER` (`auto|fake|gemini`); a deterministic
   **fake** provider is used under `NODE_ENV=test` so CI is offline. One provider is implemented;
   multi-provider routing is out of scope.
2. **Output — both English and Bangla.** The model returns `{ summaryEn, summaryBn }`. Only the
   **Bangla** summary is persisted (into the existing `summaryBn`); the **English** summary is
   transient (returned in the publish response, never stored), because the content model has no
   English-summary column and adding one is a deliberate non-goal.
3. **Trigger — automatic on publish.** Generation runs when an item transitions to `published`;
   there is no on-demand button or dedicated endpoint in this slice. The author remains able to edit
   the stored Bangla summary in the editor afterwards.
4. **Author's summary wins.** If the author already wrote a `summaryBn`, publish **keeps it** and
   the AI is not asked to overwrite it; the English preview is still produced. *(Open default chosen
   during drafting — see the note below.)*
5. **On failure — block publish.** If the provider fails or returns an unusable response, the
   publish is rejected with `502 AI_SUMMARY_FAILED` and the item stays a draft. No item is ever
   published without a summary, and there is no abstract-fallback.
6. **Role — scholars/admins only.** Generation rides the existing authoring gate (`canAuthor`); no
   new role or endpoint is added.
7. **Schema — `summaryBn` required to publish, optional to save.** Drafts may omit it (stored as
   `""`); publish requires a non-empty value, supplied by the AI when the author left it blank. No
   migration, since the column stays `NOT NULL`.

> **Note on §13.4 (open during drafting).** The draft/publish interplay was left as a free-text
> answer during the review; this note records the chosen default ("author's summary wins; AI fills
> gaps") so it can be confirmed or changed at the Definition-of-Ready review before implementation.
> The alternative ("AI always regenerates/overwrites at publish") is a one-line change in §6.1
> step 4.

## 14. Definition of Done (`§7.3`)

This slice is done only when: the acceptance criteria in §3 all pass; code is merged via PR;
unit/integration/component tests are added; [api-contracts.md](api-contracts.md),
[data-models.md](data-models.md), [configuration.md](../configuration.md),
[module-boundaries.md](module-boundaries.md), and
[server-vs-client-components.md](server-vs-client-components.md) are updated for the new behavior;
the new error codes are registered; and `.env.example` documents `AI_SUMMARY_DRIVER`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, and `AI_SUMMARY_TIMEOUT_MS`.

## 15. Recommended Implementation Order

On acceptance: domain (types, errors, schemas) → application (service: validate → provider →
validate output) → infrastructure (provider selector, fake provider, Gemini provider) → api helper
(error shaping) → the content schema relaxation + publish invariant → the `app/**` composition
helper and the `POST`/`PATCH` routes → the editor island change (optional summary + English preview)
→ tests → docs update. Follow the order used by the authoring, verification, community, and
discovery slices ([discovery-slice.md](discovery-slice.md) §15).
