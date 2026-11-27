# Regional Readiness Runbook

- Status: `Active`
- Related ADR: `ADR-008` (Adopt Calendar-Aware Predictive Operations)
- Model of record: [`docs/architecture/operational-calendar.md`](../architecture/operational-calendar.md)
- Handbook: `ENGINEERING_HANDBOOK.md` §13.1–13.3

## 1. Purpose

Operational procedure for preparing the platform ahead of a known regional demand event in the
`ADR-008` calendar. It turns the handbook's readiness rules into an executable, repeatable
checklist so preparation does not depend on improvisation under pressure.

The calendar **model** (event fields, trigger rule, checklist content) is defined in
`docs/architecture/operational-calendar.md`. This runbook is the **process** that runs it.

## 2. When to Run

- Trigger: a calendar event enters its readiness lead window
  (`windowStart - leadTime`), with a floor of **24 hours** before `windowStart` (§13.2).
- Applies to known spikes such as Eid-ul-Fitr, Eid-ul-Adha, Friday traffic shifts, exam
  season, and confidence-qualified viral content events (§13.1).
- Do not wait for the peak to start. Preparation is pre-emptive by design.

## 3. Roles

| Role | Responsibility | Named person |
| --- | --- | --- |
| Calendar owner | Keeps the event current; confirms the window and impact | `To be assigned` |
| Readiness owner | Runs this runbook and signs off exit criteria | `To be assigned` |
| On-call | Handles incidents during the window (unchanged by prediction) | per on-call rota |

Until owners are assigned, this runbook is not yet operational; the assignment is an open
obligation from `ADR-008` Step 5.

## 4. Readiness Timeline

| Phase | When | Purpose |
| --- | --- | --- |
| Pre-window planning | T-72h (or `leadTime`, whichever longer) | Confirm event, name owners, announce |
| 24-hour checks | T-24h at the latest | Warm caches/manifests, validate targets, reduce risky jobs |
| Window watch | During window | Monitor critical paths, hold degradation posture |
| Exit review | After window | Restore jobs, record actions, confirm no unexplained degradation |

## 5. Pre-Window Planning (T-72h)

- [ ] Confirm the calendar entry is current; correct or close it if the event has moved.
- [ ] Name the readiness owner and the on-call for the window.
- [ ] Confirm `expectedImpact` and which critical paths the peak stresses
      (auth / playback / progress / subscription).
- [ ] Announce the window to the team.

## 6. 24-Hour Readiness Checks (T-24h)

Per handbook §13.2. Every automated step requires explicit human confirmation and must be
reversible (see §9).

- [ ] **Warm caches and critical manifests.** Record what was warmed and when.
- [ ] **Validate queue depth** against its target; note the observed value.
- [ ] **Validate cache hit targets** — probe representative routes and confirm hits, not misses.
- [ ] **Reduce risky background jobs** for the window; record which jobs were reduced.
- [ ] **Confirm observability** covers cache hit targets, queue depth, and critical-path health.
- [ ] **Confirm abort/rollback** exists for each automated action taken.

## 7. During the Window (§13.3 Posture)

- [ ] Preserve auth, playback, progress, and subscription-critical paths first.
- [ ] Shed non-essential writes before critical ones.
- [ ] If recommendations degrade, fall back to trending/editorial content.
- [ ] Prefer degraded continuity over hard failure.
- [ ] Any user-visible degradation requires a **recorded human decision** — never autonomous.

## 8. Exit Criteria

- [ ] Traffic has returned to the pre-window baseline.
- [ ] Reduced background jobs have been restored.
- [ ] Every automated action is recorded: what, when, why, and that it was reverted.
- [ ] Any user-visible degradation has a recorded human decision attached.
- [ ] Any incident during the window has a postmortem opened using
      `INCIDENT_POSTMORTEM_TEMPLATE.md`.

## 9. Automated Actions and Reversibility

Only these preparation actions may be automated, and only with explicit human confirmation at
this stage (`ADR-008`):

- cache warming
- manifest warming
- reducing risky background jobs

Rules:

- every automated action is **logged** (what, when, why) so a pre-peak action is auditable;
- every automated action must be **reversible**; an incorrect prediction must not have lasting
  effects;
- automation runs under **least privilege** and cannot bypass authorization or mutate user data;
- automation may never degrade a user-facing surface.

## 10. Rollback / Narrowing the Model

If the model produces noise or mispredicts, narrow it without touching data (`ADR-008` exit
strategy):

1. disable automated preparation actions, keeping the calendar and checklist as manual process;
2. confirm readiness reviews still occur on schedule via this checklist;
3. remove unused automation tooling and its configuration in the same change;
4. retain calendar data — it is durable operational record, not derived state.

## 11. Post-Event Review

- [ ] Note whether the predicted window matched reality (a retrospective confidence check).
- [ ] Correct any stale or wrong calendar entry.
- [ ] Record follow-ups (checklist gaps, target tuning) as action items.
- [ ] Feed recurring gaps back into `docs/architecture/operational-calendar.md`.

## 12. References

- `docs/architecture/operational-calendar.md` — calendar model, trigger rule, checklist content
- `docs/adr/ADR-008-adopt-calendar-aware-predictive-operations.md`
- `ENGINEERING_HANDBOOK.md` §13.1 Predictive Operations Rule
- `ENGINEERING_HANDBOOK.md` §13.2 24-Hour Readiness Rule
- `ENGINEERING_HANDBOOK.md` §13.3 Graceful Degradation Policy
- `docs/runbooks/INCIDENT_POSTMORTEM_TEMPLATE.md`
