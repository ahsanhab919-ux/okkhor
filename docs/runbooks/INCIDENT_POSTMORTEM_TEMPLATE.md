# Incident Postmortem Template

## Incident Summary

- Incident title:
- Incident ID:
- Severity: `SEV-1` / `SEV-2` / `SEV-3` / `SEV-4`
- Status: `Open` / `Mitigated` / `Resolved` / `Follow-up in progress`
- Date:
- Incident commander:
- Primary owner:
- Affected systems/modules:

## Executive Summary

Provide a short explanation of:

- what happened
- who was impacted
- how long the impact lasted
- current status

## User Impact

- User-facing symptoms:
- Estimated affected users:
- Business impact:
- Geographic / regional impact:
- Shared-device, payment, or playback impact if relevant:

## Detection

- How was the incident detected?
- Detection timestamp:
- Alert, report, or escalation source:
- Was detection timely? If not, why not?

## Timeline

| Time | Event | Owner |
|---|---|---|
| HH:MM | Incident detected | |
| HH:MM | Triage started | |
| HH:MM | Mitigation applied | |
| HH:MM | Recovery confirmed | |

## Root Cause Analysis

### Direct Cause

What failed technically?

### Contributing Factors

What conditions allowed the issue to grow?

- missing safeguard
- weak alerting
- config drift
- dependency instability
- capacity planning gap
- human error

### Why It Was Not Prevented Earlier

What existing process, test, or monitor failed to catch this?

## Mitigation and Recovery

- Immediate mitigation:
- Recovery steps:
- Rollback used? `Yes` / `No`
- If rollback was not used, why not?
- Verification steps after recovery:

## What Worked Well

- Which tools, procedures, or decisions helped reduce impact?

## What Went Poorly

- Where did process, tooling, communication, or design fail?

## Action Items

| Action | Owner | Priority | Due Date | Status |
|---|---|---|---|---|
| Example remediation item | | High | YYYY-MM-DD | Open |

## Follow-Up Classification

- [ ] Code fix required
- [ ] Test coverage required
- [ ] Runbook update required
- [ ] Alert tuning required
- [ ] Handbook update required
- [ ] ADR update required

## Preventive Changes

Describe the changes that will reduce the chance or impact of recurrence.

## Evidence and References

- Logs:
- Dashboards:
- PRs:
- Runbooks used:
- Related incidents:
