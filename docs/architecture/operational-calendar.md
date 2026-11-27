# Operational Calendar Model and Readiness Checklist

- Status: `Active`
- Related ADR: `ADR-008` (Adopt Calendar-Aware Predictive Operations)
- Owner: `To be assigned` (calendar owner — see §9)
- Handbook: `ENGINEERING_HANDBOOK.md` §13.1–13.3

## 1. Purpose

`ADR-008` decision: keep an explicit, durable calendar of known regional demand events and
use it to trigger pre-emptive readiness preparation ahead of predicted peaks.

Its rollout plan is deliberate about sequencing:

> Step 2. Do not build a scheduling or automation system yet; **first record the calendar
> model and the readiness checklist in durable, reviewable form.**

This document is that record. It defines the calendar event model, the rules that decide when
an event triggers readiness, and the readiness checklist the team executes. No code, table, or
scheduler is created here — those are Steps 3–6, triggered when the first real workload lands.

The operating runbook that executes this model lives in
[`docs/runbooks/regional-readiness.md`](../runbooks/regional-readiness.md).

## 2. Scope

**Applies to** (`ADR-008`):

- triggering readiness reviews and 24-hour readiness checks before known peaks
- warming caches and critical manifests ahead of predicted demand
- validating queue depth and cache hit targets before peak
- scheduling the reduction of risky background jobs around known windows
- informing operational communication about upcoming peak periods

**Does not apply to**:

- durable data ownership → `PostgreSQL`, `ADR-004`
- recommendation ranking and content selection → `Qdrant`, `ADR-006`
- incident response → the existing severity and on-call process
- offline behaviour → `ADR-007`
- autonomous user-visible degradation → requires an explicit human decision

## 3. Calendar Event Model

Every calendar entry is durable operational data (`ADR-004`), not a constant or a spreadsheet
cell. The fields below are the minimum `ADR-008` requires plus the operational metadata needed
to keep the calendar current.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string (UUID) | yes | Stable identifier |
| `name` | string | yes | Human label, e.g. `Eid-ul-Fitr 2027` |
| `windowStart` | string (ISO-8601) | yes | Start of the expected demand window |
| `windowEnd` | string (ISO-8601) | yes | End of the expected demand window |
| `timezone` | string (IANA) | yes | Timezone the window is expressed in; recorded, never implied |
| `region` | string | yes | Geographic scope, e.g. `BD`, `BD+IN-east`. Never derived from user-level tracking |
| `recurrence` | enum | yes | `none` \| `annual` \| `monthly` \| `weekly` \| `custom` |
| `recurrenceRule` | string | no | Required when `recurrence != none`; human-readable expansion rule |
| `confidence` | enum | yes | `low` \| `medium` \| `high` |
| `expectedImpact` | enum | yes | `low` \| `medium` \| `high` |
| `criticalPaths` | string[] | no | Which of auth / playback / progress / subscription the peak stresses |
| `expiresAt` | string (ISO-8601) | ad hoc only | When an ad hoc entry stops being trusted |
| `owner` | string | yes | Who maintains this entry |
| `notes` | string | no | Context, prior-year observations |

### 3.1 Field rules

- **Timezone.** Every window carries an explicit IANA `timezone`. The default for the primary
  region is `Asia/Dhaka`; it is a default, not an assumption — an event that spans another
  region records its own.
- **Recurrence.** Recurring events (Eid, exam season) use `recurrence` +
  `recurrenceRule` and are materialized into concrete windows when the system is built
  (`ADR-008` Step 3). Eid dates are lunar and must be set per year, not extrapolated from a
  fixed annual offset.
- **Confidence.** `ADR-008` requires ad hoc events to carry confidence. Recurring, known
  events are normally `high`. Concrete guidance:
  - `high` — date and impact are known (Eid, exam season, Friday shifts).
  - `medium` — date known, impact uncertain (a scheduled campaign).
  - `low` — suspected spike, e.g. an early viral signal; must have `expiresAt`.
- **Impact.** `expectedImpact` sets readiness intensity (how many checklist steps run, how
  early readiness begins). It does not by itself authorize any degradation.
- **Expiry.** Every ad hoc entry (`recurrence: none`) must have `expiresAt`. Stale entries
  create false confidence, which `ADR-008` names as a negative consequence.
- **No personal data.** Entries are internal operational data. `region` is geographical only
  and must not be derived from user tracking (`ADR-008` security impact).

## 4. Trigger Rule

An event triggers readiness when the current time enters its **readiness lead window**:

```
readinessStart = windowStart - leadTime(confidence, expectedImpact)
```

- The floor is the handbook's **24-Hour Readiness Rule** (§13.2): readiness checks begin **at
  least** 24 hours before `windowStart`.
- `leadTime` may be longer for `expectedImpact: high` (for example 72 hours) but never shorter
  than 24 hours.
- Low-confidence ad hoc events may open a readiness review early; `ADR-008` is explicit that
  prediction is conservative: *a false positive costs one readiness review, while a false
  negative costs an outage.*

Only events at or above the agreed confidence threshold open a readiness review; below that
they are recorded and watched (see §8).

## 5. Readiness Checklist

Executed from `docs/runbooks/regional-readiness.md`. The checklist content is fixed here so
the runbook and the model cannot drift. Grouped by handbook section.

### 5.1 Pre-window planning (T-72h, impact-dependent)

- [ ] Confirm the calendar event is current and still expected (correct any stale entry).
- [ ] Name the readiness owner and the on-call for the window.
- [ ] Confirm expected impact and the critical paths the peak stresses.
- [ ] Announce the upcoming window to the team (operational communication).

### 5.2 24-hour readiness checks (T-24h, per §13.2)

- [ ] Warm caches and critical manifests.
- [ ] Validate queue depth against its target.
- [ ] Validate cache hit targets (hash route/probe to confirm hits, not misses).
- [ ] Reduce or pause risky background jobs for the window.
- [ ] Confirm observability covers cache hit targets, queue depth, and critical-path health.
- [ ] Confirm rollback/abort path for every automated preparation action (§7).

### 5.3 During the window (§13.3 posture)

- [ ] Preserve auth, playback, progress, and subscription-critical paths first.
- [ ] Shed non-essential writes before shedding critical ones.
- [ ] If recommendations degrade, fall back to trending/editorial content.
- [ ] Prefer degraded continuity over hard failure.

### 5.4 Exit criteria

- [ ] Traffic has returned to the pre-window baseline.
- [ ] Risky background jobs have been restored.
- [ ] Every automated action taken is recorded (what, when, why, reversible?).
- [ ] Any user-visible degradation was backed by a **recorded human decision**.

## 6. Automation Boundary

`ADR-008` limits automation to safe, reversible, pre-approved preparation actions, each
requiring explicit human confirmation at this stage:

- cache warming
- manifest warming
- reducing risky background jobs

Everything else — especially anything that changes user-facing behaviour or sheds a critical
path — is human-decided and recorded. Automation runs under least privilege and must not be
able to bypass authorization or mutate user data.

## 7. What Is Explicitly Not Built Yet

Per `ADR-008` Step 2, the following are **deferred** until the first workload lands:

- no `Operational Intelligence` module
- no `PostgreSQL` table or migration for calendar events
- no scheduler, recurrence materializer, or notification channel
- no automated cache/manifest warming tooling

Building any of these now would contradict the ADR. `ADR_IMPLEMENTATION_GAP_AUDIT.md` records
this as "deferred by design".

## 8. Illustrative Entries

Provided for shape only; not authoritative dates.

| name | windowStart (Asia/Dhaka) | region | recurrence | confidence | expectedImpact |
| --- | --- | --- | --- | --- | --- |
| `Eid-ul-Fitr <year>` | per-year lunar date | BD | annual | high | high |
| `Eid-ul-Adha <year>` | per-year lunar date | BD | annual | high | high |
| `Friday evening shift` | weekly, Fri | BD | weekly | high | medium |
| `Exam season <term>` | per-term date | BD | annual | high | medium |
| `Viral content spike` | rolling | BD | none (+`expiresAt`) | low | variable |

## 9. Ownership

`ADR-008` requires the calendar and the readiness process to have a **named owner**. Until
assigned, this is an open obligation:

- Calendar owner: `To be assigned`
- Readiness process owner: `To be assigned`

The owner keeps entries current, corrects stale ones, and confirms the checklist was run
before each known event.

## 10. Storage Plan (when the first workload lands)

Descriptive only — nothing is created now. `ADR-008` Step 3 states the calendar will be stored
in `PostgreSQL` with `window`, `region`, `recurrence`, `confidence`, and `expected impact`,
exposed through a simple readiness view. Steps 4–6 cover pre-approved reversible actions,
the runbook, and tests for event windows, timezone handling, and checklist steps.

## 11. Validation Metrics

Per `ADR-008`:

- 24-hour readiness checks occur before every known regional event
- cache warming and hit-target validation happen ahead of peaks, not during them
- no critical-path outage is attributed to an unprepared, known event
- the calendar is current under a named owner, with stale entries corrected
- automated preparation actions are always reversible and always recorded
- no automated action degrades a user-facing surface without a recorded human decision
- readiness work is executed from a documented checklist, not improvised
