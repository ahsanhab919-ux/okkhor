# Branch Protection Rules

This document defines the required GitHub branch protection policy for `main` and `development`.

## 1. Objectives

Branch protection exists to:

- prevent direct unreviewed changes to critical branches
- require CI validation before merge
- preserve release stability
- enforce reviewer accountability
- reduce accidental history rewrites and branch loss

## 2. Protected Branches

The repository uses two protected long-lived branches:

- `main`: production-grade branch, always deployable
- `development`: integration branch for approved feature work

## 3. Main Branch Policy

`main` must have the strictest rules:

- require pull requests before merging
- require at least `1` approval for ordinary changes
- require code owner review
- dismiss stale approvals when new commits are pushed
- require conversation resolution before merge
- require all required status checks to pass before merge
- require branches to be up to date before merge
- block force pushes
- block branch deletion
- restrict direct pushes to repository admins or no one, depending on team maturity

### Required Status Checks

At minimum, `main` must require:

- `CI / ci`

As the repository grows, add explicit checks for:

- lint
- type-check
- unit tests
- integration tests
- e2e tests
- performance or smoke checks where appropriate

## 4. Development Branch Policy

`development` is less strict than `main`, but still protected:

- require pull requests before merging
- require at least `1` approval
- require code owner review
- require status checks to pass
- dismiss stale approvals when new commits are pushed
- block force pushes
- block branch deletion

### Required Status Checks

At minimum, `development` must require:

- `CI / ci`

## 5. Eligible Reviewers

The initial reviewer owner set is:

- `@ahsanhab919-ux`

As the team expands, use:

- `CODEOWNERS` for path-based reviewer routing
- team-based reviewers for architecture, security, and platform ownership

## 6. Merge Strategy

Recommended defaults:

- allow squash merge
- optionally allow rebase merge for clean history
- disable merge commits unless the team explicitly wants them

Default branch behavior:

- feature branches merge into `development`
- release-ready changes promote from `development` to `main`
- emergency hotfixes may go to `main` with elevated review and immediate back-merge into `development`

## 7. Administrative Guidance

Administrators should avoid bypassing protections except for:

- critical incident mitigation
- repository recovery
- security emergency response

Any bypass should be documented in:

- the PR description
- an incident note
- or a follow-up runbook update

## 8. Quarterly Review

Review branch protection rules every quarter and after:

- major CI pipeline changes
- new branch strategy adoption
- team growth
- security incidents
- release failures caused by missing controls
