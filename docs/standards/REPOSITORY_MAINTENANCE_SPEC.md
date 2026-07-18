# Repository Maintenance Specification

This document defines repository hygiene requirements that apply to all contributors and maintainers.

## 1. Purpose

The repository maintenance specification exists to keep the codebase:

- reviewable
- secure
- automation-friendly
- easy to onboard into
- consistent with the engineering handbook

## 2. Source Documents

This specification works together with:

- `ENGINEERING_HANDBOOK.md`
- `CONTRIBUTING.md`
- `docs/standards/BRANCH_PROTECTION_RULES.md`
- `.github/pull_request_template.md`

If documents conflict, use this order:

1. approved ADR
2. `ENGINEERING_HANDBOOK.md`
3. this maintenance specification
4. template-level guidance

## 3. Contribution Workflow

- all changes must be made through branches, not direct commits to protected branches
- all pull requests must use the PR template
- all behavior or process changes must update documentation in the same PR
- risky changes must include rollback notes
- architecture-impacting changes must link to an ADR or explicitly state that a new ADR is required

## 4. Coding and Quality Rules

- keep changes scoped and reviewable
- avoid unrelated refactors in the same PR
- preserve module boundaries
- do not commit secrets, credentials, or local environment state
- do not commit generated outputs unless intentionally versioned
- prefer explicit, typed, and testable changes over implicit behavior

## 5. Issue Handling Rules

- all new issues should use the provided issue templates
- every issue should have at least:
  - one `type:` label
  - one `priority:` label when triaged
  - one `status:` label once work begins
- duplicate issues should be linked and closed with references
- stale or blocked issues should be updated instead of left ambiguous

## 6. Branch and Merge Hygiene

- `main` must remain deployable
- `development` is the default integration branch
- feature work should merge into `development` before promotion to `main`
- hotfixes may target `main` when necessary, but must be back-merged
- force pushes and branch deletion are not allowed on protected branches

## 7. CI and Automation Hygiene

- CI must run on pull requests and protected-branch pushes
- failing CI must block merge into protected branches
- required checks must be reviewed quarterly
- workflow changes require extra care because they affect repository automation security

## 8. Documentation Hygiene

- update README, handbook, ADR, or runbook content when corresponding behavior changes
- outdated process documents must be corrected within the same sprint they are identified
- recurring operational fixes must produce or update a runbook

## 9. Label Governance

The repository maintains labels across these dimensions:

- `type:*`
- `priority:*`
- `status:*`

Additional labels such as `good first issue` and `needs-triage` may be used to improve contributor workflow.

## 10. Review and Maintenance Cadence

- repository hygiene review: monthly
- branch protection and CI review: quarterly
- handbook and standards review: quarterly
- label taxonomy review: quarterly or after major workflow changes

## 11. Sunsetting and Cleanup Rules

When removing obsolete files, workflows, or standards:

- document the reason
- remove dead references
- update linked docs
- ensure replacement behavior is clear

## 12. Ownership

Initial repository owner and code owner:

- `@ahsanhab919-ux`

As the engineering team grows, expand ownership by domain rather than leaving all paths under a single owner forever.
