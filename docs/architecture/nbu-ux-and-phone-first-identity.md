# NBU UX and Phone-First Identity

Status: `Active`  
Audience: `Product`, `Design`, `Frontend`, `Identity`, `Localization`, `QA`  
Related ADR: `ADR-009`

## 1. Purpose

This document defines the implementation guidance for Okkhor's `Next Billion Users` user experience baseline.

It translates the handbook policy and `ADR-009` into practical rules for:

- phone-number-first authentication
- icon-driven navigation
- low-literacy onboarding and guidance
- shared-device privacy
- trust-building surfaces
- low-bandwidth and low-memory delivery

## 2. Product Goals

The UX must help users feel three things quickly:

- `I understand where to go`
- `I can trust what just happened`
- `I can use this safely on my device`

These goals matter more than maximizing visual density or copying generic SaaS patterns.

## 3. Target Constraints

Design and implementation must assume:

- Android devices with `2-4 GB RAM`
- intermittent `3G/4G` connectivity
- expensive mobile data
- multilingual and Bangla-first comprehension needs
- first-time or low-confidence digital behavior
- shared household devices

## 4. Experience Principles

### 4.1 Icons With Support, Not Icons Alone

Use icons as the primary navigation signal, but pair them with short supporting labels when meaning may be unclear.

Rules:

- primary navigation should lead with icons
- labels should stay short and concrete
- avoid abstract icons for critical actions such as payments, subscription changes, or logout
- never rely on color alone to communicate a destructive or irreversible action

### 4.2 Proof of Action

Every trust-sensitive flow must confirm state change visibly.

Required examples:

- login success
- OTP sent
- OTP verified
- payment submitted
- payment confirmed
- subscription changed
- profile switched
- logout completed

Preferred UI patterns:

- confirmation banners
- state chips
- timestamped activity entries
- visible status cards

### 4.3 Comprehension-First Localization

Localization is not word substitution.

Rules:

- Bangla copy should explain concepts in familiar language
- avoid untranslated technical jargon when a simpler explanation exists
- prefer direct verbs and short sentences
- review trust-sensitive copy with native-language comprehension in mind, not only grammatical correctness

## 5. Authentication UX

### 5.1 Default Entry Flow

The default sign-in order is:

1. phone number entry
2. OTP request
3. OTP verification
4. lightweight success confirmation
5. landing in the last safe destination or home surface

Email may be offered later for recovery, alerts, or optional account enrichment.

### 5.2 Phone Number Form Rules

- keep the form minimal
- default to the expected country code where region context is reliable
- allow manual correction of country code
- validate format early but do not overwhelm the user with technical error wording
- use large tap targets and clear focus states

### 5.3 OTP Screen Rules

- show countdown or resend availability clearly
- show masked destination so the user knows where the OTP was sent
- support paste and single-field or segmented entry without friction
- communicate failures in simple language
- provide a retry path that does not reset the entire experience unnecessarily

### 5.4 Security Rules for UX

- never expose full phone numbers unnecessarily after sign-in
- never show raw backend error details
- never log or render OTP values in client-visible traces
- include anti-phishing guidance in or near trust-sensitive flows when appropriate

## 6. Shared Device Patterns

### 6.1 Quick Logout

One-tap logout must be reachable from globally visible navigation.

It should:

- be easy to find
- not require deep settings navigation
- confirm success immediately
- return the device to a safe non-personal state

### 6.2 Profile Switching

Where multiple profiles or users may share one device:

- provide a fast switch action
- show the active profile clearly
- reset sensitive cached surfaces when switching profiles
- require re-entry or confirmation for billing and account-management actions

### 6.3 Privacy Expectations

Shared-device protection must cover:

- watch history visibility
- saved research capsules
- subscription state
- billing or transaction history
- notifications and identity surfaces

## 7. Trust Surfaces

The following areas must be easy to discover:

- watch history
- subscription status
- plan renewal or expiry state
- transaction logs
- payment confirmations
- support or dispute path

Guidance:

- surface recent activity near account or subscription areas
- use human-readable timestamps where helpful
- keep the state vocabulary consistent across product areas
- avoid hidden status transitions

## 8. Low-Literacy Guidance Patterns

Prefer:

- short guided steps
- progress bars
- step indicators
- icon plus label pairs
- video or motion-assisted tutorials
- localized examples

Avoid:

- long paragraphs in critical flows
- stacked technical form messages
- multi-column dense layouts on mobile-first surfaces
- unexplained settings terminology

## 9. Low-Bandwidth and Data-Saver Modes

The UI should adapt when context signals indicate poor connectivity or data sensitivity.

Possible triggers:

- weak network quality
- repeated request failures
- explicit user selection of data saver mode
- low-memory device heuristics where available

Recommended degraded behavior:

- reduce image density
- defer non-critical modules
- simplify navigation chrome
- avoid autoplay or decorative motion
- prioritize auth, playback start, progress, and core navigation

## 10. Frontend Implementation Notes

### 10.1 Asset Rules

- prefer inline or optimized `SVG` icons
- avoid large bitmap icon sets for core navigation
- lazy-load non-critical icons and illustration bundles
- keep onboarding assets small enough for weak devices and slow connections

### 10.2 Next.js Guidance

- use server components by default
- isolate interactive auth widgets into small client components
- code-split tutorials, profile panels, and non-critical account surfaces
- use loading and error states intentionally for OTP and trust-sensitive transitions

### 10.3 State and Resilience

- preserve partial progress where safe during network interruption
- make retry paths explicit
- prefer graceful fallback states over blank screens
- keep failure copy actionable and short

## 11. QA and Validation Checklist

Every major auth or navigation change should verify:

- phone login is the default visible entry path
- OTP state transitions are understandable
- logout is reachable in one obvious interaction path
- profile switching does not leak prior user state
- trust-sensitive confirmations are visible and timely
- Bangla copy is understandable to non-technical users
- core screens remain responsive on low-end device simulation
- data saver or poor-network states remain usable

## 12. Future Extensions

This document should later expand with:

- wireframes or sequence diagrams for OTP flows
- icon taxonomy and semantics
- accessibility checks for touch targets and contrast
- NBU-focused e2e scenarios
- anti-fraud and dispute-resolution UX patterns
