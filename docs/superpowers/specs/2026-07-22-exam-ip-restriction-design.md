# Exam IP Restriction — Design

**Date:** 2026-07-22
**Status:** Approved by user (design conversation, this session)

## Purpose

A recruiter can optionally restrict an exam to a single allowed IP address or
CIDR range. Any candidate — invited or walk-in — attempting to redeem their
invitation or start their attempt from outside that range is hard-blocked with
a clear message that includes their own observed IP. Blocked attempts are
audit-logged so recruiters can diagnose "why can't this candidate start."

Covers all three motivating use cases with one mechanism (the recruiter just
enters a different value): testing-center lockdown (single venue IP), corporate
office/VPN range, and general location control.

## Scope decisions (settled with user)

- **One IP or CIDR per exam** — a single nullable string column, not a list or
  related table. Null/empty = unrestricted (default). Upgrade path to a list is
  a column-format change later, no schema restructure.
- **Hard block, no recruiter override** — the candidate cannot proceed from a
  disallowed network, full stop. Per-candidate override can be added later
  without schema changes.
- **Block message shows the candidate's observed IP** — "Your network
  (203.0.113.55) is not approved for this exam." One interpolation; saves the
  support round-trip because the candidate can read the IP to the recruiter.
- **Audit-logged** — each blocked redeem/start records an audit event with the
  observed IP and range in metadata. No dedicated recruiter UI surface for now;
  the org-admin audit-log screen already displays audit events.
- **Deployment target is a VM** (not Azure Container Apps as the older
  deployment plan doc assumed); whether Nginx will front the Node processes is
  undecided. The client-IP resolution therefore defaults to the socket address
  and only trusts `X-Forwarded-For` behind an explicit env flag (below).

## Data model

`apps/api/prisma/schema.prisma`, `Exam` model — one new column following the
`walkInEnabled` pattern:

```prisma
allowedIpRange String? @map("allowed_ip_range")
```

Null means no restriction. The value is either a bare IPv4/IPv6 address
(`203.0.113.4`) or CIDR notation (`203.0.113.0/24`, `2001:db8::/32`).

## Recruiter-facing surface (apps/api + apps/web)

- **DTO** (`create-exam.dto.ts` / update DTO): optional `allowedIpRange`
  string field with a custom `@IsIpOrCidr()` class-validator decorator (new,
  small — class-validator has `IsIP` but no CIDR support). Validation happens
  at exam save time so a recruiter finds a typo immediately, never at
  candidate start time.
- **Service** (`exams.service.ts`): pass through in BOTH `create()` and
  `update()`. Note: the existing `walkInEnabled` field is silently dropped in
  `create()` (only wired in `update()`) — do not repeat that gap for the new
  field; fix nothing else.
- **Frontend** (`components/ExamDetailsForm.tsx`): one optional labeled text
  input ("Allowed IP / CIDR range (optional)") in the details form, following
  the existing scheduling-fields pattern. `apps/web/lib/types.ts` `Exam`
  interface gains `allowedIpRange: string | null`.

## Enforcement (apps/exam-runtime)

Two checkpoints, because redeem and start are separate HTTP requests and the
candidate's network can change between them:

1. **`POST /candidate-auth/redeem`** (`candidate-auth.service.ts`) — after the
   invitation and exam are loaded and existing checks pass, before JWTs are
   issued.
2. **`POST /attempt/start`** (`attempt.service.ts`) — alongside the existing
   scheduling-window check.

Both controllers gain `@Req()` (neither currently receives the request object)
and pass the resolved client IP into the service method.

On mismatch: throw `ForbiddenException` with
`Your network (<ip>) is not approved for this exam. Please contact the exam organizer.`
The candidate frontend already surfaces thrown API error messages on the
welcome/start screens; no new frontend error UI is required.

Walk-in candidates converge on the same redeem/start path (walk-in
registration just creates a normal invitation), so no walk-in-specific code is
needed.

### Shared utilities (new, small, in apps/exam-runtime)

- `resolveClientIp(req): string` — returns the first `X-Forwarded-For` hop
  when `process.env.TRUST_PROXY === 'true'`, else `req.ip` /
  `req.socket.remoteAddress`. Normalizes IPv4-mapped IPv6
  (`::ffff:203.0.113.4` → `203.0.113.4`). The env flag is the entire
  proxy-awareness story until the VM's reverse-proxy decision is made — a
  one-line deployment note, not a blocker.
- `isIpAllowed(ip: string, range: string): boolean` — exact-match for a bare
  IP; CIDR prefix match otherwise, implemented with Node's built-in `net` /
  `node:net` `BlockList` (no new dependency). Malformed stored range ⇒ treat
  as NOT allowed and log (fail closed — an unparseable restriction must not
  silently become "unrestricted").

The range-parsing logic lives in `packages/shared` (which both apps already
import) as one small exported function, used by the apps/api DTO decorator and
by exam-runtime's `isIpAllowed` — a single source of truth for what counts as
a valid range.

## Audit logging

`AuditService` (from `@exam-platform/shared`) is not currently imported
anywhere in `apps/exam-runtime` — this feature wires it in. On each block, record:

```
action: 'attempt.blocked_ip'
entityType: 'invitation'
entityId: <invitationId>
metadata: { observedIp, allowedIpRange, phase: 'redeem' | 'start' }
actorUserId: null
```

Fire-and-forget relative to the thrown ForbiddenException (log first, then
throw), consistent with how walk-in registration treats audit as a side
effect.

## Error handling summary

| Condition | Behavior |
|---|---|
| `allowedIpRange` null/empty | No check; behave exactly as today |
| IP matches | Proceed normally |
| IP does not match | `403` with candidate-visible message incl. observed IP; audit event |
| Stored range malformed | Fail closed (block) + server-side error log |
| Recruiter submits invalid range | `400` at exam create/update time via DTO validator |

## Testing

- **Unit — IP matcher:** exact IPv4 match/mismatch, CIDR /24 inside/outside,
  IPv6 + IPv4-mapped normalization, malformed range fails closed.
- **Unit — resolveClientIp:** socket-IP default; X-Forwarded-For honored only
  with `TRUST_PROXY=true`; first-hop extraction from a multi-hop header.
- **Unit — redeem + start services:** allowed IP passes; disallowed IP throws
  ForbiddenException containing the observed IP and records the audit event;
  null range skips the check entirely.
- **Unit — DTO validator:** valid IP, valid CIDR, garbage rejected.
- **E2E (Playwright):** recruiter creates an exam with a restrictive range
  that cannot match localhost, invites a candidate, candidate's redeem is
  blocked with the message visible; then recruiter clears the range and the
  candidate proceeds. (Localhost's own IP is deterministic in the test
  environment: `127.0.0.1`/`::1`.)

## Out of scope (deliberate)

- Multiple ranges per exam, geo/country blocking, warn-but-allow mode,
  per-candidate recruiter override, integrity-system integration (the
  3rd-party-tool/screen-share detection feature queued next is the
  proctoring-side sibling of this access-control feature).
