# Server vs Client Components

- Status: `Active`
- Related ADRs: `ADR-002` (Next.js App Router), `ADR-009` (phone-first NB-UX)
- Owner: `Engineering Lead`

## 1. Purpose

`ADR-002` selects the Next.js App Router with **server components as the default** and
targeted client components only where interactivity requires them. That default is easy to
erode: one stray `"use client"` high in the tree can pull an entire surface into the browser
bundle, which directly harms the low-end-device, low-bandwidth users this product targets.

This document defines the rule, the sanctioned exceptions, and the review checks that keep
the client bundle small.

## 2. The Default: Server

In the App Router everything is a **server component** unless a file opts out with
`"use client"` at the top. Server components:

- run only on the server during render (Node.js runtime here),
- can read the database / cookies / environment directly,
- ship **no** JavaScript to the browser,
- cannot use hooks (`useState`, `useEffect`, …), browser APIs, or event handlers.

Everything in `app/**` that has no `"use client"` directive is a server component —
including `app/page.tsx`, `app/auth/page.tsx`, `app/community/page.tsx`, and
`app/scholar-verify/page.tsx`.

## 3. When to Use a Client Component

Add `"use client"` only when the component genuinely needs the browser:

- local UI state (`useState` / `useReducer`)
- effects and subscriptions (`useEffect`)
- DOM event handlers (`onClick`, `onChange`, …)
- browser-only APIs (`window`, `localStorage`, `IntersectionObserver`)
- navigation hooks that require the client (`useRouter`, `usePathname`, `useSearchParams`)

If none of those apply, the component stays a server component.

## 4. Placement Rule: Push the Boundary Down

Put `"use client"` at the **smallest leaf** that needs interactivity, never on a page or
layout wrapper.

- Bad: marking a whole page `"use client"` to add one button handler — it drags the entire
  page (and its data dependencies) into the browser bundle.
- Good: keep the page a server component and render a small `"use client"` child for the
  interactive part.

The current code follows this: pages are server components that render one client shell,
and the shell localizes interactivity.

## 5. Current Client Inventory

Exactly these files carry `"use client"` (the interactive islands):

| File | Why it is client | Notes |
| --- | --- | --- |
| `src/modules/identity/ui/auth-page-shell.tsx` | holds prefill `useState` bridging the OTP flow into the credentials panel | the only state it owns is the prefilled phone number |
| `src/modules/identity/ui/phone-auth-flow.tsx` | OTP flow: `useState`, countdown `useEffect`, `useSearchParams`, handlers | largest interactive island |
| `src/modules/identity/ui/credential-auth-panel.tsx` | login/register form state and submit handlers | |
| `src/modules/identity/ui/protected-workspace-shell.tsx` | session restore effect, `useRouter`/`usePathname`, logout handler | gates protected pages from the client side |
| `src/modules/verification/ui/verification-form.tsx` | applicant form `useState`, draft/submit handlers, `useRouter` | drives `POST`/`PATCH /api/verification/application` |
| `src/modules/verification/ui/verification-review.tsx` | admin decision `useState`, approve/reject handlers, `useRouter` | drives `PATCH /api/verification/applications/[id]` |

`src/modules/identity/client/session-client.ts` is also `"use client"` but is a **helper
module**, not a component: it wraps `fetch` against the auth API with
`credentials: "include"`.

Everything else — `src/modules/experience/ui.tsx`, `src/modules/experience/site-content.ts`,
`src/modules/content/ui/content-views.tsx`, all pages, all route handlers, all module
`domain`/`application`/`infrastructure` code — is server-side.

The `content` module adds **no** client island: its list and detail pages are server
components that render the server-safe `ContentItemList` / `ContentItemDetail` views directly,
so the read path needs no JavaScript at all.

The `verification` module adds **two** islands — the applicant form and the admin decision
form. Both pages are server components that resolve the session and application state and
pass it down as props; the islands own only local form state and post to the verification API.

## 6. Import Graph Nuance

`src/modules/experience/ui.tsx` has **no** `"use client"` directive and is therefore
server-safe presentational code. However, when a client component imports it (for example
`protected-workspace-shell.tsx` importing `AppSidebar` and `AppTopBar`), those components are
compiled **into the client bundle** for that usage.

Rules that follow:

1. A component without `"use client"` can be used in both environments, but only if it uses
   no server-only APIs. Keep shared presentational components free of `node:*` imports,
   direct data access, and secrets.
2. Anything a client component imports must itself be client-safe. Importing a repository,
   `postgres-config`, or `node:crypto` from a client island will fail the build or leak
   server assumptions.

## 7. Data and Props Across the Boundary

- Data is fetched in the **server component** and passed down as props where possible.
- Props crossing into a client component must be **serializable** (plain objects, arrays,
  strings, numbers, booleans). Functions, class instances, and `Map`/`Set` are not.
- Client islands fetch their own data only when the data is inherently client-driven — as
  the protected shell does, calling `ensureSession()` from `session-client.ts` on mount.
- Server-only values (secrets, `passwordHash`, raw tokens) must never be passed as props to
  a client component.

## 8. Security Boundary

The `"use client"` directive is **not** a security boundary and must never be treated as
one. Client code can be read and modified by users. Therefore:

- authorization is enforced in middleware and in the application layer, never by hiding a
  client component (see [module-boundaries.md](module-boundaries.md) §3 and
  [api-contracts.md](api-contracts.md) §7),
- the protected shell's client-side session check is a **UX redirect**, not the access
  control — the middleware redirect is the gate.

## 9. Review Checklist

Before approving a change that adds or moves a client boundary:

- [ ] The component actually needs browser-only capability (§3).
- [ ] `"use client"` is on the smallest leaf, not a page or layout (§4).
- [ ] Nothing server-only (`node:*`, repositories, secrets) is imported into the client island (§6).
- [ ] Props passed across the boundary are serializable (§7).
- [ ] No authorization decision relies on the client side (§8).
- [ ] The client island is justified by a bundle-size sanity check (does pulling it in
      noticeably grow the surface?).

## 10. Worked Example

A "bookmark this thread" button on the community page should:

1. stay a **server component** page (`app/community/page.tsx`), unchanged;
2. render a small `"use client"` `BookmarkButton` island that owns a `useState` and posts to
   an API route;
3. receive only a serializable `threadId` as a prop;
4. let the server enforce whether the user is allowed to bookmark.

It should **not** turn `app/community/page.tsx` into a client component, and should not
fetch the whole thread list on the client to decide what to render.
