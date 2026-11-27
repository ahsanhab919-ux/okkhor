# Phase 9 ADR Execution Log

Version: `1.0`  
Phase: `ADR-008 Bootstrap`  
Execution Mode: `Strictly Sequential`  
Status: `Completed`

## 1. Phase Objective

This phase creates the eighth concrete architecture decision record required by the engineering handbook, and completes the initial ADR backlog.

Current phase deliverable:

- `docs/adr/ADR-008-adopt-calendar-aware-predictive-operations.md`

This phase must not close until:

1. the current ADR is created
2. the current ADR is validated
3. the results are documented
4. approval is requested for the current phase deliverable

## 2. Pre-Flight Checks

### Inputs Reviewed

- `ENGINEERING_HANDBOOK.md`
- `docs/adr/ADR_TEMPLATE.md`
- `docs/adr/ADR-004-adopt-postgresql-as-primary-source-of-truth.md`
- `docs/adr/ADR-005-adopt-redis-for-cache-and-ephemeral-state.md`
- `docs/adr/ADR-006-adopt-qdrant-for-semantic-discovery.md`
- `docs/adr/ADR-007-adopt-offline-first-where-client-context-requires-it.md`
- `docs/configuration.md`
- current repository structure

### Validation Results

- handbook explicitly lists `ADR-008: Adopt calendar-aware predictive operations`
- handbook sections `13.1`, `13.2`, and `13.3` already define the readiness and degradation rules this ADR makes executable
- the ADR template remains reusable and valid
- `ADR-001` through `ADR-007` are already completed and approved, and `ADR-007` is `Accepted`
- the phase that produced `ADR-007` was approved before this phase began
- no conflicting `ADR-008` file exists
- `ADR-008` is the final entry in the handbook's initial ADR backlog, alongside the already-created `ADR-009`
- no `Operational Intelligence` module, calendar model, scheduling mechanism, or readiness checklist exists, which makes this ADR an operational-model decision rather than a record of shipped code

### Current Task Standard

The current ADR must:

- use the repository ADR template structure
- align with the data-layer standards already accepted by `ADR-004` and `ADR-005`
- explain why a durable, calendar-aware model is adopted for predictive operations
- explain why an informal calendar and a fully autonomous engine are not the current default
- state explicitly that the model is advisory by default and that automation is limited to safe, reversible, pre-approved actions
- state that autonomous user-visible degradation is out of scope and requires a recorded human decision
- address timezone and regional correctness
- include rollout, success criteria, and rollback/exit strategy

### Completion Criteria

The current phase deliverable is complete only when:

- the ADR file exists
- the ADR content is project-specific and non-placeholder
- the ADR passes diagnostics
- the outcome is documented in this phase log
- approval is requested before the phase closes

## 3. Execution Log

### Step 1: Pre-flight

- Status: `Passed`
- Findings:
  - `ADR-008` is the next logical decision after `ADR-007` because the server-side data decisions are settled and the remaining handbook backlog item is operational rather than structural
  - the handbook names specific, predictable regional demand events and requires readiness review before them
  - the 24-hour readiness rule cannot be enforced consistently without a durable calendar
  - cache warming in section `13.2` depends on the `Redis` decision in `ADR-005`, and the degradation fallback in section `13.3` depends on the `Qdrant` fallback in `ADR-006`
  - the repository has no operational calendar, scheduling, or readiness tooling, so this ADR defines the operational model before any tooling is added
  - recording the model now prevents both ad hoc seasonal reaction and premature autonomous automation

### Step 2: ADR-008 implementation

- Status: `Passed`
- Artifact created:
  - `docs/adr/ADR-008-adopt-calendar-aware-predictive-operations.md`
- Findings:
  - the ADR is specific to Okkhor's regional demand reality rather than generic capacity-planning advice
  - it requires calendar events to be durable data in `PostgreSQL` with window, region, recurrence, confidence, and expected impact
  - it makes the predictive layer advisory by default, with automation limited to safe, reversible, pre-approved actions
  - it explicitly forbids autonomous user-visible degradation without a recorded human decision
  - it defines the default operational timezone explicitly and requires the timezone to be recorded per event
  - it keeps `ADR-006`'s trending and editorial fallback as the prepared degradation path
- Resolved issues:
  - removed ambiguity about whether prediction may autonomously change product behaviour
  - made calendar ownership and a documented readiness runbook explicit obligations
  - established that the calendar is durable operational record rather than derived state, so it survives rollback of any automation

### Step 3: ADR-008 validation

- Status: `Passed`
- Validation results:
  - file exists in `docs/adr/`
  - content follows the ADR template structure
  - content aligns with handbook sections `2.2`, `3.2`, `3.5`, `4.3`, `13.1`, `13.2`, `13.3`, and `16`
  - `docs/adr/README.md` index updated to include the new file
  - diagnostics check returned no issues
- Outcome:
  - current phase deliverable satisfies the defined execution standard and completion criteria
  - with this ADR created, the handbook's initial ADR backlog is complete: `ADR-001` through `ADR-009` all exist

### Step 4: Approval request

- Status: `Approved` (2026-11-27)
- Approval scope:
  - promote `ADR-008` from `Proposed` to `Accepted`
  - close this phase
- Approval deferred by decision:
  - building any calendar, readiness, or automation tooling

### Step 5: ADR-008 promotion

- Status: `Passed`
- Findings:
  - `ADR-008` status changed from `Proposed` to `Accepted`
  - no calendar, readiness, or automation tooling is in scope for this phase
- Outcome:
  - the phase deliverable is accepted, and the phase is complete
  - the handbook's initial ADR backlog is complete: `ADR-001` through `ADR-009` all exist and none remain `Proposed`
