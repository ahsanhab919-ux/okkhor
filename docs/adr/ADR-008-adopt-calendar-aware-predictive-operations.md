# ADR-008: Adopt Calendar-Aware Predictive Operations

- Status: `Proposed`
- Date: `2026-11-27`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `Bootstrap predictive operations baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` serves a region whose demand is highly seasonal and partly predictable. The handbook names the pattern directly: Eid-ul-Fitr, Eid-ul-Adha, Friday traffic shifts, exam season, and viral content events all produce sharp, known-in-advance spikes. The product principle that follows is `Predict before react`, and the handbook treats preparation for those spikes as mandatory rather than optional:

- `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles` lists `Predict before react`
- `ENGINEERING_HANDBOOK.md` section `3.2 Core Domains` names `Operational Intelligence` as a module boundary
- `ENGINEERING_HANDBOOK.md` section `3.5 NBU Experience and Trust Architecture` allows `Operational Intelligence` and device or context signals to trigger degraded UI states during poor connectivity
- `ENGINEERING_HANDBOOK.md` section `13.1 Predictive Operations Rule` states that known regional spikes must trigger a readiness review before peak demand
- `ENGINEERING_HANDBOOK.md` section `13.2 24-Hour Readiness Rule` requires readiness checks to begin at least 24 hours early, cache warming, manifest warming, queue-depth and cache-hit-target validation, and reduction of risky background jobs
- `ENGINEERING_HANDBOOK.md` section `13.3 Graceful Degradation Policy` requires degraded continuity rather than hard failure under stress
- `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog` lists `ADR-008: Adopt calendar-aware predictive operations`

The already accepted ADRs constrain this decision:

- `ADR-004` establishes `PostgreSQL` as the primary source of truth, which means the calendar must be durable data rather than hard-coded constants
- `ADR-005` establishes `Redis` for cache and ephemeral state, and the handbook's cache-warming step in section `13.2` depends on a cache layer existing
- `ADR-006` establishes that recommendations degrade to trending or editorial content under stress, which is one of the prepared actions this decision must be able to trigger
- `ADR-007` establishes that offline resilience is scoped per journey, and is separate from operational readiness

The current repository state matters to this decision:

- there is no `Operational Intelligence` module, no calendar model, no scheduling mechanism, no readiness checklist, and no notification channel
- the identity slice is the only implemented domain, and it has no operational calendar concerns
- readiness preparation is currently undefined rather than manual, because nothing exists to prepare

That makes the key decision one of shape rather than scheduling technology: how calendar knowledge is represented and kept current, and how much of the response to a predicted peak is automated versus reviewed by a human.

## Decision

Adopt calendar-aware predictive operations: maintain an explicit, durable calendar of known regional demand events, and use it to trigger pre-emptive readiness preparation ahead of predicted peaks.

This means:

- calendar events are durable data in `PostgreSQL`, per `ADR-004`, not hard-coded constants, spreadsheets, or tribal knowledge
- each event records at minimum its time window, region, recurrence, confidence, and expected impact
- events drive a readiness review and a pre-defined checklist, matching the handbook's readiness model rather than ad hoc reaction
- the predictive layer is advisory by default: it produces signals, checklists, and reminders that the team acts on
- automation is limited to safe, reversible, pre-approved actions such as cache warming, manifest warming, and reducing risky background jobs
- the system predicts and prepares; it does not autonomously change user-facing behaviour, and it does not shed critical paths without a recorded, human-approved decision
- prediction is deliberately conservative: a false positive costs one readiness review, while a false negative costs an outage, so the model errs toward preparing early
- operational time is handled in an explicit default timezone for the primary region, with the timezone recorded on the event rather than implied
- both recurring events, such as Eid and exam season, and ad hoc events, such as a viral content spike, are represented in the same model, with ad hoc events carrying confidence and expiry

This decision applies to these uses, and only these:

- triggering readiness reviews and 24-hour readiness checks before known peaks
- warming caches and critical manifests ahead of predicted demand
- validating queue depth and cache hit targets before peak
- scheduling the reduction of risky background jobs around known windows
- informing operational communication about upcoming peak periods

This decision does not apply to:

- durable data ownership, which remains with `PostgreSQL` per `ADR-004`
- recommendation ranking and content selection, which belong to `Qdrant` per `ADR-006`
- incident response, which stays with the existing severity and on-call process and is not replaced by prediction
- offline behaviour, which is scoped separately per `ADR-007`
- autonomous user-visible degradation, which requires an explicit human decision

## Decision Drivers

- the product principle `Predict before react`
- known, recurring regional spikes that are predictable in advance
- the handbook's requirement that known spikes trigger readiness review
- regional resilience as an operational requirement, not an optimization
- the 24-hour readiness rule, which needs a calendar to be enforceable at all
- protection of the paths the handbook names as critical: auth, playback, progress, and subscription
- a small team that benefits from pre-planned checklists over improvisation under pressure
- cost sensitivity: avoiding avoidable capacity and incident cost during predictable peaks
- the risk of over-automation, which argues for an advisory, human-in-the-loop model
- keeping institutional knowledge durable and reviewable rather than held by individuals

## Options Considered

### Option A

- Description: Adopt a durable calendar model that drives advisory readiness signals and a small set of pre-approved, reversible automated actions
- Pros:
  - converts the handbook's readiness rules into something enforceable rather than aspirational
  - keeps institutional knowledge in versioned, reviewable form
  - preserves human judgement where the consequences are user-visible
  - limits automation to actions that are safe to reverse, which matches the graceful-degradation intent
  - depends only on infrastructure already accepted by `ADR-004` and `ADR-005`
  - fits a small team, because the operational burden is a periodic checklist, not a second system to run
- Cons:
  - the calendar must be actively maintained, and stale entries create false confidence
  - introduces a readiness process that needs a named owner
  - regional and timezone edge cases require explicit handling
  - an incorrect or missing event can produce an unprepared peak

### Option B

- Description: Keep the calendar informal, holding dates in team documents and running readiness checks ad hoc when someone remembers
- Pros:
  - zero build cost and zero new processes
  - complete flexibility, with no model to maintain
  - appropriate if peak demand never materialises
- Cons:
  - directly contradicts handbook section `13.1`, which states that known spikes must trigger readiness review
  - makes the 24-hour rule in section `13.2` impossible to enforce consistently
  - loses institutional knowledge when team members change
  - cannot represent region, confidence, or expected impact, so preparation cannot be prioritised
  - repeats the same avoidable mistakes across successive seasonal peaks

### Option C

- Description: Build a fully autonomous predictive operations engine that detects and reacts to predicted demand without human review, including automated degradation of non-critical surfaces
- Pros:
  - the fastest possible reaction to changing load
  - removes the human latency from readiness decisions
  - could in principle optimise capacity more tightly than a checklist
- Cons:
  - autonomous degradation of user-facing surfaces is exactly the kind of change the handbook expects to be deliberate
  - risks silently shedding paths that should be preserved, against section `13.3`
  - requires detection, decision, and safe-execution machinery far beyond the team's current stage
  - makes behaviour hard to explain during an incident, which weakens incident response
  - is premature engineering for a product that has not yet reached sustained peak load

## Why This Decision Was Chosen

An advisory, calendar-driven model is correct because the handbook's operational rules are human-in-the-loop by design. Sections `13.1` and `13.2` describe a readiness review, a 24-hour window, and validation steps — not an autonomous control loop. Encoding the calendar durably is what turns those rules from guidance into something the team can actually execute on schedule, and it keeps the knowledge reviewable in pull requests like any other change.

It is preferred over an informal calendar because the handbook states that known regional spikes must trigger readiness review. A calendar that lives only in memory cannot guarantee that, cannot express confidence or regional scope, and cannot enforce the 24-hour window. The cost of the durable model is small, and it is the difference between preparing and hoping.

It is preferred over a fully autonomous engine because the consequences of over-automation land in the wrong place. Shedding a critical path, or degrading a surface without a recorded decision, is a user-visible failure that the graceful-degradation policy intends to prevent. Automating only safe, reversible preparation keeps the benefit of prediction without taking control of the product away from humans.

This decision also composes cleanly with what has already been accepted. The calendar is durable data under `ADR-004`, its warming actions depend on `ADR-005`, and its degradation fallback to trending or editorial content is already defined by `ADR-006`.

## Consequences

### Positive

- predictable peaks are prepared for rather than absorbed
- the 24-hour readiness rule becomes enforceable and auditable instead of aspirational
- institutional knowledge about regional demand becomes durable and reviewable
- cache warming and hit-target validation gain a concrete trigger
- risky background jobs can be scheduled around known windows deliberately
- the critical paths named in the handbook are protected by preparation rather than luck

### Negative

- the calendar becomes operational data that must be maintained and kept current
- a missing or incorrect event can produce false confidence and an unprepared peak
- readiness work becomes a recurring process with a named owner
- automation of preparation adds tooling that must itself be tested and monitored
- timezone and regional edge cases require explicit handling and can be wrong

## Operational Impact

Expected operational effects:

- readiness reviews become a scheduled process tied to the calendar, with a documented checklist
- cache warming, manifest warming, and queue and hit-target validation become repeatable steps rather than ad hoc ones
- observability should cover cache hit targets, queue depth, and critical-path health during known windows
- a readiness runbook is required, including who runs it, when, and what the exit criteria are
- ownership of the calendar and of the readiness process must be assigned explicitly
- incident response is complemented, not replaced: prediction reduces incidents but does not change severity handling
- automated preparation actions must be logged, because operational actions taken before a peak need to be auditable

## Security and Compliance Impact

- calendar entries are internal operational data and must not contain personal data
- region fields are geographical, not personal, and must not be derived from user-level tracking
- any notification or reminder channel used for readiness must respect consent and channel rules, and must never carry credentials or sensitive values
- automation must operate under least privilege, and must not be able to bypass authorization or mutate user data
- automated preparation actions must be reversible, since an incorrect prediction must not have lasting effects
- operational logs must record what was automated and why, without capturing sensitive payloads

## Rollout Plan

1. Accept calendar-aware predictive operations as the operational model
2. Do not build a scheduling or automation system yet; first record the calendar model and the readiness checklist in durable, reviewable form
3. When the first workload lands, store events in `PostgreSQL` with window, region, recurrence, confidence, and expected impact, and expose a simple readiness view over them
4. Wire only pre-approved, reversible actions, such as cache warming and background-job reduction, each requiring explicit human confirmation
5. Document the readiness runbook in `docs/runbooks`, and assign a named owner for the calendar and the process
6. Add tests covering event windows, timezone handling, and the readiness checklist steps
7. Revisit the ADR backlog only after this decision is validated

## Validation and Success Metrics

This decision is considered successful if:

- 24-hour readiness checks occur before every known regional event
- cache warming and hit-target validation happen ahead of predicted peaks, not during them
- no critical-path outage is attributed to an unprepared, known event
- the calendar is kept current by a named owner, with stale entries corrected
- automated preparation actions are always reversible and always recorded
- no automated action degrades a user-facing surface without a recorded human decision
- readiness work is executed from a documented checklist rather than improvised

## Rollback or Exit Strategy

Because the model is advisory and its automation is reversible, the decision can be narrowed without risk to data.

The exit path is:

1. disable the automated preparation actions, retaining the calendar and checklist as manual process
2. confirm that readiness reviews still occur on schedule through the documented checklist
3. remove any automation tooling and its configuration in the same change that removes their usage, per handbook section `4.3`
4. retain the calendar data, since it is durable operational record rather than derived state

If the advisory model proves insufficient, a more automated approach should be proposed through a new or superseding ADR, with explicit limits on what may be automated and what requires human approval.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `2.2 Product Principles`
  - `ENGINEERING_HANDBOOK.md` section `3.2 Core Domains`
  - `ENGINEERING_HANDBOOK.md` section `3.5 NBU Experience and Trust Architecture`
  - `ENGINEERING_HANDBOOK.md` section `4.3 Dependency Management Rules`
  - `ENGINEERING_HANDBOOK.md` section `13.1 Predictive Operations Rule`
  - `ENGINEERING_HANDBOOK.md` section `13.2 24-Hour Readiness Rule`
  - `ENGINEERING_HANDBOOK.md` section `13.3 Graceful Degradation Policy`
  - `ENGINEERING_HANDBOOK.md` section `16. Initial ADR Backlog`
- Design docs:
  - `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
  - `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`
  - `docs/adr/ADR-006-adopt-qdrant-for-semantic-discovery.md`
  - `docs/adr/ADR-007-adopt-offline-first-where-client-context-requires-it.md`
  - `docs/configuration.md`
- Related PRs:
  - `docs/adr-008-calendar-aware-operations` introduces this decision
- External references:
