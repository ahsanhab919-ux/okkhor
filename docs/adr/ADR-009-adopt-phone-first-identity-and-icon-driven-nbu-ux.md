# ADR-009: Adopt Phone-First Identity and Icon-Driven NBU UX

- Status: `Accepted`
- Date: `2026-07-18`
- Owners: `Engineering Lead`
- Deciders: `Engineering Lead`, `Founding Product Team`
- Related Tickets: `NBU trust, identity, and accessibility baseline`
- Supersedes:
- Superseded By:

## Context

`Journal Club Asia / Okkhor` is designed for South Asian learners who often use low-end Android devices, unstable mobile networks, shared household devices, and multilingual interfaces. Many users are first-time or low-confidence digital participants, and a text-heavy, email-first product experience would create avoidable friction.

The platform must address several realities at the same time:

- phone numbers are often a stronger digital identifier than email addresses
- OTP-based login is more familiar than password-heavy or email-centric flows
- digital literacy varies widely across the target audience
- trust in digital platforms is often earned through visible proof and transparent states
- shared-device use requires fast privacy controls such as quick logout and profile switching
- performance constraints on `2-4 GB RAM` devices make heavy client-side UI patterns too costly

The team therefore needs a formal decision for how identity, onboarding, navigation, and trust surfaces should behave by default in the user experience.

## Decision

Adopt a `phone-number-first identity model` and an `icon-driven, comprehension-first NBU UX baseline` for the primary Okkhor product experience.

This means:

- phone number is the default sign-in identifier
- OTP is the default login and re-authentication pattern unless a higher-risk flow requires stronger controls
- icons and short supporting labels are the default primary navigation pattern for user-facing surfaces
- onboarding, authentication, payment, and subscription states must use explicit visual guidance and proof of action
- shared-device protections such as one-tap logout, device-aware sessions, and rapid profile switching are mandatory product capabilities
- Bangla and other localized surfaces must optimize for comprehension, not literal translation

This decision applies to:

- the main web experience
- future mobile-first product surfaces unless a documented exception is approved
- identity, onboarding, navigation, profile, progress, billing, and trust-sensitive user journeys

This decision does not require:

- removal of email as a secondary recovery or notification channel
- icon-only interfaces with no text support
- disabling stronger risk-based checks where fraud, compliance, or account recovery concerns require them

## Decision Drivers

- accessibility for the Next Billion Users
- performance as accessibility
- trust-building for first-time digital users
- fit with South Asian device and network reality
- reduced sign-in friction
- shared-device privacy protection
- multilingual comprehension quality
- product simplicity under resource constraints

## Options Considered

### Option A

- Description: Adopt phone-first identity and icon-driven NBU UX as the default baseline
- Pros:
  - aligns with regional user behavior and digital identity patterns
  - reduces onboarding and login friction
  - improves usability for low-literacy and low-confidence users
  - supports shared-device privacy more directly
  - keeps UI lighter and easier to optimize for low-end hardware
- Cons:
  - requires disciplined UX governance to avoid ambiguous iconography
  - increases responsibility for OTP reliability, abuse controls, and fallback handling
  - requires stronger localization quality than basic string translation

### Option B

- Description: Use a conventional email-first, text-heavy, globally generic UX baseline
- Pros:
  - familiar to many SaaS teams and libraries
  - easier to scaffold from common western templates
  - less custom UX guidance required at the start
- Cons:
  - poor fit for the target market
  - higher user drop-off during onboarding and authentication
  - weaker support for low digital literacy and shared-device use
  - increases cognitive load and trust friction

### Option C

- Description: Support both phone-first and email-first flows equally with no default regional posture
- Pros:
  - broader theoretical flexibility
  - allows multiple authentication choices from day one
- Cons:
  - creates decision ambiguity in implementation
  - increases UX and testing complexity
  - weakens the product's opinionated accessibility posture
  - spends complexity budget without solving the core NBU problem well

## Why This Decision Was Chosen

Option A is the best fit for Okkhor because it aligns directly with the platform's stated market, hardware, language, and trust assumptions.

The product is not trying to optimize for the habits of a desktop-first, email-centric, always-online audience. It is trying to make research comprehension accessible in South Asia under real-world constraints. A phone-first identity model and icon-driven UX reduce friction at the exact moments where first-time users decide whether the platform feels understandable and safe.

This decision is also more consistent with the rest of the architecture. The project already emphasizes Bangla-first comprehension, shared-device safeguards, low-end device performance, and graceful degradation. A generic western UX baseline would conflict with those principles.

## Consequences

### Positive

- lower sign-in friction for core users
- stronger alignment between UX and regional market reality
- better first-run experience for low-literacy and low-confidence users
- clearer trust-building through visible status and proof-of-action patterns
- better privacy posture for shared devices
- more disciplined performance choices for icon and onboarding assets

### Negative

- OTP delivery, rate limiting, and retry states become mission-critical product concerns
- icon design requires usability review to avoid misinterpretation
- localization effort increases because comprehension quality is now a core UX requirement
- some enterprise or cross-border user scenarios may later require broader identity options

## Operational Impact

Expected operational effects:

- CI/CD should eventually include critical-path coverage for phone login, OTP entry, logout, and profile switching
- observability must include OTP delivery latency, resend rate, failure rate, and sign-in abandonment
- support and incident workflows must treat identity and trust-surface regressions as high priority
- frontend and localization review processes must include NBU usability criteria
- design and engineering workflows must document icon semantics and fallback text behavior

## Security and Compliance Impact

- phone-number-first flows still require secure verification, abuse controls, and server-side authorization
- OTP values, tokens, and sensitive identifiers must never be logged
- device-aware sessions and quick logout are required for shared-device privacy
- email can remain available for secondary recovery, but must not displace the default phone-first posture without documented reason
- educational anti-phishing guidance should be delivered in-product for trust-sensitive flows

## Rollout Plan

1. Keep the handbook policy in `ENGINEERING_HANDBOOK.md` section `3.5`
2. Publish a dedicated architecture guide for implementation rules in `docs/architecture`
3. Make new auth and onboarding work default to phone-first UX unless an ADR or approved exception says otherwise
4. Add UI acceptance criteria for:
   - one-tap logout
   - profile switching
   - visible proof-of-action states
   - Bangla comprehension review
   - data saver or degraded UI states where appropriate
5. Add critical-path test coverage for OTP, onboarding, logout, and trust-sensitive navigation

## Validation and Success Metrics

This decision is considered successful if:

- login completion rates improve or remain strong for phone-first flows
- OTP delivery failures and resend loops remain within defined thresholds
- users can complete onboarding with low instructional overhead
- shared-device privacy regressions remain rare
- first meaningful interaction stays acceptable on `2-4 GB RAM` devices and unstable mobile networks
- usability reviews show icons and visual guidance reduce confusion rather than increase it

## Rollback or Exit Strategy

If this decision proves too limiting or too costly, the exit path is controlled expansion of identity and UX patterns, not abandonment of NBU accessibility goals.

Possible adjustments include:

- allowing additional first-class identity methods for specific user segments
- increasing text support in areas where icon comprehension is weak
- using region- or persona-specific UX variants

Any such change must preserve the core principles of trust, accessibility, shared-device privacy, and low-end device performance.

## References

- Handbook sections:
  - `ENGINEERING_HANDBOOK.md` section `3.5 NBU Experience and Trust Architecture`
  - `ENGINEERING_HANDBOOK.md` section `9.2 Shared Device Protection`
- Design docs:
  - `docs/architecture/nbu-ux-and-phone-first-identity.md`
- Related PRs:
- External references:
