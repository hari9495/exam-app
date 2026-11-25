# YukthiX security review, 25 Nov 2026

Defensive review of our own code, on `test/yukthix-main` at `24c509c1a` (the code merged to main as PR #221). The worktree is `C:/D-drive/exam-app-secreview`, branch `review/yukthix-security`. Everything ran against a fresh local database, `examapp_secreview` (`prisma migrate deploy` and the seed only). No product code was changed.

**Proof tests:** `apps/api/test/security-review-2026-11-25.e2e-spec.ts`. Each test states the safe behaviour, so it **fails today**; it will pass once the fix lands. Run it with:

```
cd apps/api && npx jest --config ./test/jest-e2e.json --maxWorkers=2 --forceExit test/security-review-2026-11-25.e2e-spec.ts
```

Result on 25 Nov: 7 of 7 tests fail as expected (see the status column below).

## Summary

| # | Severity | Finding | Proof test |
|---|----------|---------|------------|
| F1 | **High** | Any YukthiX staff member can act as any company user, including a System Admin, without the support session the company must approve | `F1: …` (2 tests, failing) |
| F2 | Medium | While someone is impersonating, every audit row names the impersonated person, not the real actor | none (code read) |
| F3 | Medium | Any signed-in user can read any recruiting approval request: offer pay, candidate name, approver chain and notes | `F3: …` (failing, 200) |
| F4 | Medium | The submitter can approve their own requisition or offer | `F4: …` (failing, 201) |
| F5 | Medium | The read key `results:view` (held by the read-only Auditor and by people managers) unlocks two write routes: reassign a candidate, rate a candidate | `F5: …` (2 tests, failing: 200 and 201) |
| F6 | Medium | The read key `leave.view` unlocks planning someone's block leave and scheduling a pause of their sign-in | none (code read) |
| F7 | Medium | Public careers, sitemap, job feed and status routes share one rate-limit bucket for all callers and all companies: 20 requests a minute take every careers site down | `F7: …` (failing) |
| F8 | Medium | HR with `perf.comp.manage` can edit their own raise in a comp cycle | none (code read) |
| F9 | Low | Placeholder secrets from `.env.example` are not refused at start-up in production | none |
| F10 | Low | Two "keyed" hashes use a hard-coded key (`JWT_SECRET` is never set) | none |
| F11 | Low | A deactivated or paused account tells the caller its password was right | none |
| F12 | Low | Easy Apply ingest accepts another company's apply token | none |
| F13 | Low | Some outbound fetches skip the pinned-DNS `publicHttpsFetch` | none |
| F14 | Low | Two CSV exports have no spreadsheet-formula guard | none |

**Nothing critical was found.** I found no way for a user of company A to read or change company B's data. The only cross-company path is F1, and it needs a YukthiX staff account.

---

## High

### F1. Staff can act as any company user without an approved support session

- **Where:**
  - `apps/api/src/auth/auth.service.ts:1599-1652` (`impersonate()`): `isSuper` branch at 1610 and 1623.
  - The route: `apps/api/src/auth/auth.controller.ts:260` (`POST /auth/impersonate/:userId`).
  - `apps/api/src/auth/jwt.strategy.ts:52`: `enforceSupportSession` runs only when `actingSuperAdmin` is set, and the impersonation token never sets it.
- **Attack:**
  1. A YukthiX staff member with any staff role signs in at the staff console with a security key. The proof uses the Finance role, which holds no support key.
  2. They call `POST /api/v1/auth/impersonate/<id of company B's System Admin>`. Company B has approved no support session.
  3. They get back a normal 15-minute access token as that System Admin, and can call it again for a fresh one at any time.
  4. With it they read the company's users (proved: `GET /users` returns 200) and anything else the admin can see.
  5. No support session is open, so the RESTRICTIVE `support_session_excluded` policies do not apply. Pay, bank and identity tables are no longer protected by the database, only by the app's `actingForOther` checks, and many older routes have none.
  6. The company sees only one `user.impersonate_start` audit row.
- **Why the controls miss it:**
  - The route has no `@RequirePermissions`.
  - `@SensitiveRoleAction` only needs AAL2, which every staff session already has.
  - This bypasses P02 Q8 / YX-SEC-20, which `switch-into` enforces (company approval, time window, read-only, every request recorded).
  - `auth.service.spec.ts:795` asserts this behaviour as intended.
- **Proof:**
  - `F1 … staff cannot impersonate a company System Admin when the company approved no support session`: gets 200, expected 403.
  - `F1 … an impersonation token minted that way cannot list the company users`: gets 200.
- **Smallest fix:** in `impersonate()`, refuse staff: `if (isSuper) throw new ForbiddenException(...)`, so staff reach a company only through `switch-into`. Update `auth.service.spec.ts:795`. Optionally put a permission key on the route.

## Medium

### F2. Impersonated actions are audited as the impersonated person

- **Where:**
  - `packages/shared/src/audit/audit.service.ts` stores whatever `actorUserId` it is given.
  - Callers pass `@CurrentUserId()` (`apps/api/src/auth/current-user-id.decorator.ts`), which is the target while impersonating.
  - Only `jwt.strategy.ts:43` and the step-up entry in `permissions.guard.ts` read `impersonatorUserId`.
- **Attack:**
  - An org admin impersonates a recruiter, legitimately, and moves candidates, rates them or edits jobs on routes without `OwnSessionGuard`.
  - Staff can do the same through F1.
  - Every audit row names the recruiter. Only the start and stop rows name the real person. In a dispute, the log blames the wrong person.
- **Smallest fix:** keep `impersonatorUserId` in an `AsyncLocalStorage` for the request (the same pattern as `requestChannel`). Have `AuditService.recordIn` add `metadata.impersonatorUserId` whenever it is set. One change in shared code covers every write.

### F3. Any signed-in user can read any recruiting approval request

- **Where:**
  - `apps/api/src/approvals/approvals.controller.ts:34` (`GET /approvals/requests/:id`): no permission key, and no user id passed in.
  - `apps/api/src/approvals/approvals.service.ts:453` (`getRequestDetail`): checks only the company.
- **Attack:**
  - A panel interviewer or any employee with an account has a request id. Ids reach people from notifications, from an earlier step they were dropped from, or from a shared screen.
  - They call the route and get:
    - the offer's `compensation`;
    - the candidate's name;
    - the whole approver chain;
    - every decision note.
  - Someone removed from the chain keeps this access for good.
- **Proof:** `F3 … a panel user who is neither submitter nor approver cannot read the request`. A panel user gets 200.
- **Smallest fix:** pass `userId` in. Return 404 unless the caller is the submitter, in `approverUserIds` of any step, or holds `approvals:configure` / `pipeline:manage`. Add `ParseUUIDPipe` on `:id`.

### F4. A person can approve their own requisition or offer

- **Where:**
  - `apps/api/src/approvals/approver-resolver.ts:23-62` (`resolveSteps`) never removes the submitter from a step. The "hiring manager" step resolves to `job.hiringManagerId`, and "users" or "group" steps can contain the submitter.
  - `apps/api/src/approvals/approvals.service.ts:248` checks only `approverUserIds.includes(actorUserId)`.
- **Attack:**
  - A hiring manager (who holds `pipeline:manage`) raises an offer at the pay they want, on a job where they are the hiring manager.
  - They then approve it themselves through `POST /approvals/requests/:id/decide`.
  - If theirs is the only step, the offer is approved with nobody else involved.
  - The newer HR approvals engine already blocks this (`workflow/approvals-engine.service.ts`, `selfApproval`). This older recruiting engine does not.
- **Proof:** `F4 … the submitter cannot approve their own request`. It returns 201 and the request is approved.
- **Smallest fix:**
  - In `resolveSteps`: `ids = ids.filter((u) => u !== args.submitterUserId)`. An empty step is then skipped and reported, as today.
  - In `decide()`: refuse when `actorUserId === req.submittedByUserId`.

### F5. Read-only roles can reassign and rate candidates

- **Where:** `apps/api/src/pipeline/pipeline.controller.ts`:
  - line 186: `POST /entries/:id/feedback`, `@RequirePermissions('results:view')`;
  - line 203: `PATCH /entries/:id/assignment`, same key.
- **Who holds the key:**
  - `results:view` is in the seeded `auditor` role (`prisma/seed.ts:267`), which is meant to hold zero write keys.
  - It is also in the `TEAM_MANAGER` set (`prisma/seed-org-structure.ts`).
- **Attack:**
  - An Auditor or a line manager runs `PATCH /entries/<any>/assignment {assigneeUserId: me}` and takes over a candidate.
  - With record visibility on, this also hides the candidate from the recruiter.
  - They can also post 1-5 ratings that sway the decision.
- **Proof:** `F5 … the read-only Auditor cannot take over a candidate` (gets 200) and `… cannot rate a candidate` (gets 201).
- **Smallest fix:** gate both routes on `pipeline:manage`, as `PATCH entries/:id/checklist` already is. If interviewers must leave feedback, allow `interview:view_assigned` plus a check that they are on an interview for that entry.

### F6. The read key `leave.view` plans block leave and pauses someone's sign-in

- **Where:**
  - `apps/api/src/time/leave-v2.controller.ts:195-215`: `plan`, `nudge` and `pause` are all `@RequirePermissions('leave.view')`.
  - `apps/api/src/time/leave-v2.service.ts:952` (`blockTarget`): checks scope with `leave.view`.
  - `pauseBlock` (`:1009`) sets `accessPause: 'scheduled'`. The hourly job then pauses the person's account and revokes every session (`auth/paused-access.ts`).
- **Attack:** in a company where block leave is required (BFSI), an HR Executive or any role with only `leave.view` over a colleague:
  1. plans a 10-day block for that colleague, starting tomorrow;
  2. schedules the access pause;
  3. the colleague is locked out of the app for the whole block.
- **Smallest fix:** require `leave.approve`, or a new `leave.block.manage`, on plan and pause. Check scope with the same key in `blockTarget`.

### F7. One public rate-limit bucket for every caller and every company

- **Where:** `apps/api/src/public-applications/public-applications.throttler.guard.ts:18`. Routes with no `applyToken`/`token`/`portalToken` fall back to `req.route.path`, which is the same string for every caller.
- **Routes that share one global, Redis-wide bucket (20 a minute, `STRICT_WALK_IN_THROTTLE`):**
  - `GET careers/:orgSlug`, `careers/:orgSlug/jobs/:slug` and `careers/:orgSlug/sitemap`;
  - the careers assistant;
  - `job-boards/:feedToken/feed.xml` and `jobs-feed.xml`;
  - `GET applications/:statusToken`;
  - `easy-apply/:orgSlug/:provider`.
- **Attack:**
  - Anyone loops 20+ requests a minute to `/api/v1/public/careers/x`, and every company's careers page, job feed and candidate status page returns 429.
  - The web app (`apps/web/lib/yx-careers.ts:10`) turns a 429 into "not found".
  - Normal traffic hits this without any attacker: each careers view makes two API calls from the Next server, plus Google's crawler, across all tenants.
  - **Related:** `jobs/:applyToken/apply` allows 5 a minute keyed on the public apply token, so 5 junk POSTs a minute block real applications to that job.
- **Proof:** `F7 … two different visitors of a careers page do not share one rate-limit bucket`. Both get the tracker `/api/v1/public/careers/:orgSlug`.
- **Smallest fix:** key on `${req.route.path}:${req.ip}`, adding `orgSlug`/`feedToken`/`statusToken` when present. Key `apply` on apply token plus IP. Have the Next careers server forward the client IP (trust proxy is already 1).

### F8. HR can edit their own raise in a comp cycle

- **Where:** `apps/api/src/performance/comp.service.ts:488` (`updateProposal`):
  ```ts
  if (!a.hr && p.managerEmployeeId !== a.me)
  ```
  HR passes for every proposal, including `p.employeeId === a.me`. `submit()` (`:533-543`) then skips the manager and HR steps for an HR submitter, so only Finance sees it.
- **Attack:** an HR comp admin raises their own merit from 8 % to 25 % with a justification and submits the batch. Finance approves a batch of many people, and the one self-edit is not flagged.
- **Smallest fix:** in `updateProposal`, throw when `p.employeeId === a.me`. In `submit()`, refuse when any draft is the submitter's own.

## Low

### F9. Placeholder secrets are not refused in production

`.env.example` ships `JWT_ACCESS_SECRET="dev-access-secret-change-me"`, along with the refresh, candidate and `INTERNAL_SERVICE_SECRET` versions. The code only checks that the values exist (`jwt.strategy.ts:30`, `workflow/approval-channels.ts:83`, `service-desk/attachments.service.ts:87`). Nothing in `apps/api/src/bootstrap-config.ts` rejects these values in production.

- **Scenario:** a deployment copies the example file. Anyone can then sign a `super_admin` access token. The approval-link and attachment-link keys are derived from the same secret, so they fall too.
- **Fix:** in `bootstrap-config.ts`, when `NODE_ENV=production`, throw if any of these secrets contains `change-me` or is shorter than 32 bytes.

### F10. "Keyed" hashes use a key that is in the code

- **Where:**
  - `apps/api/src/visitors/walkin-rules.ts:11`: `process.env.JWT_SECRET ?? 'yukthix-visitors'`
  - `apps/api/src/public-applications/public-applications.service.ts:495`: `ipHash(ip, process.env.JWT_SECRET ?? 'yukthix')`
- `JWT_SECRET` is set nowhere: not in `.env.example`, not in the API `.env`, not in compose. So both always use the constants in the code.
- **Scenario:** with a database dump, visitor NDA keys fall to brute force over about 10^10 Indian mobile numbers, and consent IP hashes over the 2^32 IPv4 space. The "never the number itself" promise does not hold.
- **Fix:** derive the key from `JWT_ACCESS_SECRET` with HKDF, as `approval-channels.ts:84` does, and throw if it is missing. Existing visitor keys must be recomputed.

### F11. A deactivated account confirms its password

- **Where:** `apps/api/src/auth/auth.service.ts:318-321` (company sign-in) and `:248` (staff sign-in).
- **Scenario:** for a former employee's account, a wrong password returns "Invalid credentials", while the right password returns "deactivated" or "paused". That lets someone test leaked passwords for reuse elsewhere, with no lock-out signal.
- **Fix:** return the same answer as a wrong password, and keep the real reason in the login event.

### F12. Easy Apply ingest accepts another company's apply token

- **Where:** `apps/api/src/public-applications/public-applications.service.ts:935`.
- **Scenario:**
  - Company A's Easy Apply secret is checked, then `apply(normalized.applyToken)` runs on whatever job token the payload carries.
  - An admin of A, or anyone holding A's board secret, can post applications into company B's job, labelled as Indeed/LinkedIn applications.
  - They can do so without B's per-token limit and bot trap.
  - Nothing from B is read.
- **Fix:** after `resolveJob`, require `job.organizationId === org.id` and otherwise return the same 404. `quickApply` (`:826`) already does this.

### F13. Outbound fetch gaps

Two sets of outbound calls do not go through the pinned-DNS fetch:

- **Re-resolve after the check:** `jobs/webhook-delivery.worker.service.ts:56`, `jobs/integration-delivery.worker.service.ts:77` and `hris/hris-export.worker.service.ts:86` check the target, then call plain `fetch`, which resolves DNS again.
- **Static check only:** `job-boards/providers/http-provider.ts:63` and `whatsapp/providers/http-provider.ts:69` only run `assertPublicHttpsUrl`. Its static check also misses 100.64/10, 0/8 and `::`.

Everything is https-only, with TLS verification on, so rebinding onto internal http services fails the handshake. What remains is a blind internal port scan through the stored error text.

**Fix:** use the existing `publicHttpsFetch` everywhere, as `sms-channel.service.ts:148` does.

### F14. CSV exports without the formula guard

- **Where:** `apps/api/src/staffing/accounting-export.ts:180` and `apps/api/src/scheduled-reports/report-digest.ts:52` only quote values.
- **Scenario:** an invoice line, customer or exam name starting with `=` runs as a formula when finance opens the file in Excel.
- **Fix:** reuse `performance/calibration-rules.ts` `csvCell`.

---

## Checked and fine

**Tenant isolation**
- **Database roles:** the app connects as `examapp_app` (via `app_runtime`), which is NOSUPERUSER NOBYPASSRLS and owns nothing. Migrations run as `examapp_owner`.
- **Catalogue (query on 25 Nov):**
  - 754 of 772 public tables have RLS enabled AND forced.
  - The 18 without RLS have no `organization_id`: lookup tables, token tables keyed by hash, and child rows only reached through an RLS-protected parent (`approval_decisions`, `code_answer_reviews`, `question_tags` and so on). I checked that every direct query on them goes through a parent ownership check first.
- **Policies:**
  - 1,318 policies. The standard one, `organization_id = app_current_org() OR app_is_super_admin()`, is on 727 tables.
  - Every `USING (true)` policy is either a read-only platform catalogue or an `owner_write` limited to `examapp_owner`.
- **Composite keys:** 729 of 1,611 foreign keys include `organization_id`.
- **Tenant context:** set once per transaction in `TenantPrismaService.setSessionContext`. All 43 `set_config` calls in the code are transaction-local (`is_local = true`), so nothing carries across pooled connections.
- **The 24 SECURITY DEFINER functions:** each checks `p_org = app_current_org()` or `app_is_super_admin()` itself, and has a pinned `search_path`. Staff role changes need an active Security lead in the database.
- **Raw SQL:** no `$queryRawUnsafe` with input. The account-export one uses `ident()` on `information_schema` names; the others are only `SAVEPOINT` statements.
- **Super-admin contexts:** all 233 `isSuperAdmin: true` contexts (130 files) were traced.
  - On request paths, the rows are found by an unguessable token hash, a verified signature, an OTP or a company slug, and the follow-up work uses the found row's company.
  - The rest are background jobs with no request input.
  - The only exception is F12, which is low severity.
- **Guard test:** `rls-isolation.e2e-spec.ts` checks forced RLS from the catalogue for every table that has `organization_id`, so a new tenant table cannot be missed.

**Confidential stores**
- **Pay:** guarded by RESTRICTIVE pay policies (`app.pay_entities`, own rows); support sessions are excluded.
- **Speak-up:** you can open a case only as a member; anonymous reports store no user or IP; routing skips an officer the report is about.
- **1:1 private notes:** only the author reads them.
- **Surveys:** candidate surveys are aggregate-only; I found no employee anonymous surveys.
- **Pay portal for alumni and nominees:** OTP sign-in, a session token stored as a hash, and the `app.pay_portal_employee` database guard.

**Sign-in and sessions**
- **OTP:** 6 digits, keyed hash, 5-minute expiry, burned after 5 tries, single use, constant-time compare. It is bound to company, email, request and device.
- **Sending limits:** per address, per hour and per IP. Unknown accounts get the same answer.
- **Redis down:** lock-out and OTP stores fail closed.
- **Password reset:** 32 bytes, stored as a hash, 15 minutes, single use; it revokes all sessions.
- **TOTP:** each code is used once per time step.
- **Recovery codes:** used up atomically.
- **MFA reset:** a second admin is needed for sensitive roles.
- **Passkeys:** origin, RP id and challenge are checked; the counter can't go back; the user handle must match.
- **SAML:** signed assertion and issuer check.
- **OIDC:** PKCE, state and nonce, an Entra tenant pin, and no trust in Microsoft's unverified email.
- **JWT:**
  - Separate secrets per token type.
  - Every request checks that the server-side session is still live.
  - Deactivation, role change and password reset revoke sessions.
  - Refresh-token reuse revokes the whole family.
- **Cookies:** refresh and device cookies are HttpOnly, SameSite=Lax and Secure. The access token goes in the Authorization header, so CSRF exposure is limited to refresh and logout.
- **Staff console:** AAL2, and it refuses in-company or impersonation tokens. Support sessions need company approval, have a time window, are read-only and are recorded per request. The service-desk chat websocket refuses impersonation and support tokens.
- **Internal API:** a separate app on 127.0.0.1, with a constant-time secret check.

**Permissions**
- **Global `ValidationPipe`:** uses `whitelist` and `forbidNonWhitelisted`. I found no DTO spread into Prisma that could set `organizationId`, a role or an approver.
- **Manager chain:** worked out in the database on every request (`employee_assignments`), never taken from input.
- **Pay, documents, leave, attendance, accidents, exits, probation, tax proofs:** per-person scope checks (`grantCovers`, `may()`, `caseOr404`) and self-decision blocks.
- **Older recruiting routes:** they rely on `actingForOther` / `OwnSessionGuard` and `requireSelf`, which block pay and many changes while impersonating.
- **Role overrides:** cannot add HR or pay keys, and need step-up.

**Other surfaces**
- **Approval links:** HKDF key, single use, tied to one user, refused for high-risk requests.
- **Document shares:** 256-bit token stored as a hash, expiry, sandboxed CSP.
- **Portal sessions** (preboarding, alumni, contractor, consultant, client, agency): OTP, then a hashed session token.
- **Uploads:**
  - Magic-byte sniffing with an allow-list and size limits.
  - ClamAV that fails closed; downloads are blocked until the scan is clean.
  - `nosniff` plus `CSP: sandbox` on served files.
  - Storage paths cannot climb out; SAS links are short-lived.
- **Email templates:** whitelisted placeholders only, HTML-escaped. Speak-up, OTP and payslip emails carry no details.
- **Committed secrets:** none found in tracked files. `apps/api/.env` is untracked, and compose passwords are required env vars.

## Not checked

- **The web app** (`apps/web`) beyond the careers fetch: Next.js middleware, client-side token storage, CSP headers.
- **About 90 of the roughly 119 controllers** that leave permission checks to the service. I read about 25, chosen for how sensitive their data is. Recruiting, service desk, projects and visitors had only a light pass.
- **`endpoint-permissions.spec.ts`** covers 36 of 214 controllers and only checks for keyless routes. It cannot catch a write route behind a view key (F5, F6). Worth extending: any POST/PUT/PATCH/DELETE whose only keys end in `.view`/`:view` must be on an allow-list.
- **Kiosk and walk-in device tokens**, and the Stripe and SMS webhook signature checks.
- **Deployment:** whether `API_INTERNAL_HOST` is exposed, whether production secrets differ per token type, the Gotenberg no-egress network (exists only as a compose comment), TLS and headers at the proxy.
- **Live attacks:** no load or DoS test of F7 (proved at the guard level only), and no timing measurements.
