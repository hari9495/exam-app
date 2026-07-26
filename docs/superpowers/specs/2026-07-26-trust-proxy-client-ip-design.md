# Trust the Proxy: Restore Per-Candidate Rate Limiting and IP Restriction — Design

**Severity: high. Two production features are silently not working, and one of them caps how many candidates can start an exam.**

## The problem

Both NestJS apps sit behind nginx on the same VM. Neither app tells Express to trust that proxy, so `req.ip` resolves to the **socket** address — which for a same-host nginx is `127.0.0.1` for every request, from every candidate, everywhere.

Two things depend on knowing the real client IP, and both are therefore broken.

### 1. Rate limiting is global, not per candidate

`FailOpenThrottlerGuard` (`apps/exam-runtime/src/fail-open-throttler.guard.ts`) extends `ThrottlerGuard` without overriding `getTracker`, so the default tracker applies: `req.ips[0] ?? req.ip`. Without trust proxy, `req.ips` is empty and `req.ip` is `127.0.0.1`.

Every candidate therefore shares one throttle bucket. `POST /candidate-auth/redeem` carries `STRICT_AUTH_THROTTLE` — **5 requests per 60 seconds** — so on the current reading roughly **five candidates can begin an exam per minute in total**. The sixth is rejected with `429`, not delayed.

**Measured 2026-07-26 against production** (`https://prudenthire.prudentconsulting.com:3002/api/v1/candidate-auth/redeem`, invalid tokens so nothing was written): attempts 1–5 returned `404` (invitation not found, i.e. the request reached the handler), attempts 6–8 returned `429`. The limit is live and bites exactly where configured.

The same reasoning applies to every other throttled route, including `DEFAULT_THROTTLE_LIMIT = 100/60s` across the app.

### 2. Exam IP restriction cannot work

`resolveClientIp()` (`apps/exam-runtime/src/network/resolve-client-ip.ts`) reads `X-Forwarded-For` **only** when `process.env.TRUST_PROXY === 'true'`. That variable is **not set in either production `.env`** (verified on the VM). So the function returns `req.ip` — `127.0.0.1`.

`enforceIpRestriction` (`apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts:150`) then compares `127.0.0.1` against the recruiter's configured CIDR. A recruiter restricting an exam to their office network is getting a check that compares the wrong address, and the denial message would tell a candidate their network is `127.0.0.1`.

No production audit log has ever recorded an `observedIp`, so the feature has never actually fired — which is why nobody has noticed.

## What is proven versus inferred

**Proven by direct measurement:** the throttle limit is real and rejects the 6th redeem in 60 seconds.

**Proven by reading the code and the VM:** no `app.set('trust proxy', …)` in either `main.ts`; no `getTracker` override; `TRUST_PROXY` absent from both production `.env` files.

**Inferred, not directly observed:** that all candidates share one bucket. Confirming it needs two genuinely different source IPs, which was not available. It follows deterministically from Express's documented behaviour, but the implementation should confirm it rather than assume — see Verification.

## Design

### Trust exactly one hop

In `main.ts` of **both** `apps/api` and `apps/exam-runtime`:

```ts
app.set('trust proxy', 1);
```

The literal `1` matters. `true` tells Express to trust the entire `X-Forwarded-For` chain, which lets any client prepend a forged address and choose its own throttle bucket — turning a rate limiter into decoration. `1` trusts exactly one proxy hop, which is the real topology: client → nginx → app.

Set `TRUST_PROXY=true` in both production `.env` files so `resolveClientIp` reads the header too.

### nginx must set the header

Confirm nginx forwards `X-Forwarded-For` for **both** server blocks — `:443` (which proxies `/api/v1` to apps/api) and `:3002` (which proxies to exam-runtime). The standard directive is:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
```

`$proxy_add_x_forwarded_for` *appends* the connecting address to whatever the client sent. With `trust proxy: 1`, Express takes the **last** entry as the client — the one nginx itself appended — so a forged prefix is ignored. This is what makes the pairing safe; neither half is sufficient alone.

If the directive is missing from either block, the header never arrives and the change does nothing there.

### Do not raise the limits to compensate

`STRICT_AUTH_THROTTLE` at 5/60s is a sensible per-candidate limit — a real candidate redeems once. It only looks absurd because it is currently being applied globally. Fix the attribution, leave the numbers alone. Raising them would weaken a genuine brute-force protection to work around a bug.

### Known consequence: shared networks

Once per-IP throttling works correctly, candidates behind a single NAT — an exam hall, a campus, a company office — genuinely share one public IP and therefore one bucket. Five redeems per minute from one building is a real constraint that this fix *introduces* by making the limiter work as designed.

This is out of scope here and must not be solved by widening the limit. Options for later, in rough order of preference: key the redeem throttle on the invitation token rather than the IP (each token is used once, so it is the natural unit); or allow an org-level allowlist of known exam-centre addresses. Decide it separately with real usage in hand.

## Verification

The change is only meaningful if per-candidate attribution actually works, and that cannot be shown from a single source IP.

1. **Two distinct sources.** From two different networks — a laptop on office wifi and a phone on mobile data is enough — issue 6 rapid redeems from each. Correct behaviour: each source gets 5 through and its own 429 on the 6th; the two do not interfere. Before the fix, the second source would already be blocked by the first's traffic.
2. **Spoof resistance.** Send a request with a forged `X-Forwarded-For: 1.2.3.4`. With `trust proxy: 1` and `$proxy_add_x_forwarded_for`, the app must still attribute the request to the real address, not `1.2.3.4`. If a forged header changes the bucket, the configuration is wrong and the limiter is bypassable.
3. **IP restriction end to end.** Set `allowedIpRange` on a test exam to a range that excludes the tester, attempt a redeem, and confirm the denial audit log records the **real** public IP in `observedIp` — not `127.0.0.1`. Then set the range to include the tester and confirm entry succeeds.

Test 2 is the one that must not be skipped. A misconfigured trust setting looks identical to a correct one in normal use and only reveals itself when someone bypasses the limiter deliberately.

## Files

| File | Change |
|---|---|
| `apps/exam-runtime/src/main.ts` | `app.set('trust proxy', 1)` |
| `apps/api/src/main.ts` | `app.set('trust proxy', 1)` |
| `apps/exam-runtime/.env` (VM) | `TRUST_PROXY=true` |
| `apps/api/.env` (VM) | `TRUST_PROXY=true` |
| nginx `:443` and `:3002` blocks | confirm `X-Forwarded-For` is set |

Both `.env` files are gitignored, so this must be re-applied after any redeploy that regenerates them — the same trap as `EXAM_RUNTIME_INTERNAL_URL` and the connection-pool settings.

## Out of scope

- Changing any throttle limit.
- The shared-NAT problem described above.
- Load-testing capacity. It cannot be measured meaningfully until this is fixed, because the 5/minute ceiling gates everything upstream of the application.
