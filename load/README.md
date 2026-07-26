# Load / spike testing

Simulates candidates arriving at once and taking an exam, to find where the
system stops coping and **why**.

## Run it

```bash
# 1. Seed fixtures (LOCAL database only) — one published exam + N invitations
DB_URL=$(grep "^DATABASE_URL=" apps/api/.env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
DATABASE_URL="$DB_URL" node load/seed-load-fixtures.js 1000

# 2. Start exam-runtime with throttling relaxed and a real connection pool
cd apps/exam-runtime
DB=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
DATABASE_URL="${DB};connection_limit=60;pool_timeout=30" NODE_ENV=test npx nest start

# 3. Spike
node load/spike.js --users 200 --steady 0
```

## Two things that will make the numbers lie

**Throttling.** `redeem` carries `STRICT_AUTH_THROTTLE` — 5 requests per 60s **per IP**.
A load generator is one IP, so without `NODE_ENV=test` you measure the rate limiter and
the app never gets touched. In this app `NODE_ENV` affects **only** `rate-limit-tiers.ts`,
so setting it changes nothing else. The limiter is a real protection — it just isn't the
thing under test here.

**A restart that didn't happen.** If the previous server still holds port 3502 the new one
dies with `EADDRINUSE` and your "new" run silently hits the old process. This happened
during the first attempt at the pool comparison and produced an identical result that
looked like "the fix does nothing". Always check the log for `EADDRINUSE`, and kill the
listener by PID rather than by process name.

## What was found (2026-07-26, 12-core dev machine, local SQL Server)

| Concurrent | Pool | Got in | Failed |
|---|---|---|---|
| 50 | ~25 (default) | 50/50 | 0 |
| 100 | ~25 (default) | 51/100 | 49 |
| 200 | ~25 (default) | 64/200 | 136 |
| 200 | 60 | 128/200 | 72 |

Failures are **HTTP 500**, from Prisma `P2028 — "Unable to start a transaction in the
given time."**

**Root cause.** `TenantPrismaService.forTenant()` wraps every tenant-scoped request in an
*interactive transaction*, because the row-level-security session context
(`sp_set_session_context`) is bound to a physical connection. So each in-flight request
holds a pooled DB connection for its whole duration, and concurrency is capped by the
Prisma pool — not by CPU and not by database throughput.

Prisma's default pool is `cores * 2 + 1` with a 2s acquire timeout, neither set anywhere
in this repo. Capacity tracked the pool directly: raising it from ~25 to 60 doubled the
number of candidates who got in and eliminated every `start` failure.

**Implication for production.** The VM is 2 vCPU, so the default pool there is **5**.
