# Contributing to Okkhor

This repository follows an engineering-first contribution model designed for a `modular monolith`, GitHub-based review workflows, and a South Asia-focused product quality bar where `performance is accessibility`.

## 1. Contribution Principles

- Keep changes small, reviewable, and reversible.
- Prefer incremental delivery over large batch changes.
- Update documentation in the same change when behavior or process changes.
- Protect user trust, shared-device privacy, and low-end-device performance.
- Treat `main` and `development` as protected branches.

## 2. Before You Start

Before starting work:

- read `ENGINEERING_HANDBOOK.md`
- review any affected ADRs in `docs/adr/`
- confirm branch scope and acceptance criteria
- identify test and rollback expectations

Do not start implementation if the work item is missing:

- problem statement
- acceptance criteria
- affected module(s)
- rollout or rollback assumptions for risky changes

## 3. Branch Workflow

- Create feature work from `development` unless a hotfix is explicitly needed from `main`.
- Use branch names in one of these forms:
  - `feature/<scope>-<short-description>`
  - `fix/<scope>-<short-description>`
  - `docs/<scope>-<short-description>`
  - `chore/<scope>-<short-description>`
  - `hotfix/<scope>-<short-description>`

Examples:

- `feature/auth-phone-login`
- `fix/video-startup-timeout`
- `docs/branch-protection-guide`

## 4. Commit Standards

Use Conventional Commits:

- `feat: add Bangla onboarding copy`
- `fix: prevent stale playback manifest reuse`
- `docs: add repository maintenance rules`
- `chore: bootstrap issue templates`
- `refactor: isolate recommendation cache helpers`

Guidelines:

- one logical change per commit when practical
- avoid vague messages such as `update`, `changes`, or `fix stuff`
- mention migrations or breaking implications in the body when needed

## 5. Pull Request Requirements

Every PR must:

- use the repository PR template
- describe the change and the reason for it
- list affected modules
- include testing evidence
- include rollback notes for risky changes
- update docs when behavior, process, config, or architecture changes

UI or workflow changes should include screenshots, recordings, or concise before/after notes.

## 6. Review Rules

PR review focuses on:

- correctness
- regression risk
- architecture fit
- security and privacy impact
- performance impact on low-end devices and unstable networks
- test sufficiency

Minimum expectations:

- at least 1 approval for normal changes
- at least 2 approvals for security, auth, payments, infrastructure, CI/CD, or architecture changes
- code owner review required for protected branches
- all required CI checks must pass before merge

## 7. Coding and Documentation Hygiene

Contributors must:

- keep module boundaries intact
- avoid secret or environment leakage
- avoid committing generated artifacts unless explicitly intended
- document new environment variables in `.env.example` once the app scaffold exists
- add or update ADRs for important architecture decisions
- add runbooks for recurring operational issues

## 8. Issue Handling Rules

Use the GitHub issue templates for:

- bug reports
- feature requests
- documentation updates

Issues should be:

- reproducible
- scoped
- labeled by type and priority
- linked to PRs when implementation begins

High-risk production issues must also produce or update a runbook in `docs/runbooks/`.

## 9. Merge and Release Hygiene

- `main` is release-grade and must stay deployable.
- `development` is the default integration branch.
- squash merge is preferred for feature branches unless preserving commit history is intentionally valuable
- force-push is never allowed on protected branches
- direct commits to protected branches are not allowed

## 10. Maintenance Responsibilities

Contributors and maintainers should:

- close stale branches after merge
- keep labels and issue states accurate
- review handbook and standards quarterly
- record technical debt explicitly instead of letting it remain implicit

## 11. When to Update This File

Update `CONTRIBUTING.md` whenever the repository changes:

- branch strategy
- review requirements
- CI/CD rules
- repo hygiene expectations
- contribution workflow

All updates to this file must be reviewed like any other process change.
