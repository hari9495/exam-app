# Move exam-runtime off port 3002 onto a 443 subdomain

## Why

The candidate app loads over 443 but fetches everything from
`https://prudenthire.prudentconsulting.com:3002/api/v1`. Corporate, office and guest
networks routinely allow 443 and block non-standard high ports, so a candidate on such a
network sees **"Can't open this invitation — Can't reach the server"** while everyone else
works. Confirmed live on 2026-08-06: the invitation was valid, exam-runtime was healthy, and
:3002 answered in 35ms from an unrestricted network.

Same class of problem as the Monaco CDN (ADO #6825): the product must assume the candidate is
behind a restrictive network, because that is where interviews happen.

**Not path-proxying** (`/runtime/...` on the existing 443 block) is deliberate. Socket.IO
namespace semantics break under a path prefix — recorded in the deployment notes and not worth
re-litigating. A subdomain keeps the origin clean and the namespace at the root.

## Current state (verified 2026-08-06, not assumed)

| Thing | Value |
|---|---|
| nginx site | single file `/etc/nginx/sites-enabled/exam-platform` |
| `:80` | `default_server`, `server_name _`, serves `/.well-known/acme-challenge/` from `/var/www/html`, else 301 → https |
| `:443` | `server_name prudenthire.prudentconsulting.com`; `/api/v1/`+`/uploads/` → `127.0.0.1:3001` (api), `/` → `127.0.0.1:3000` (web) |
| `:3002` | TLS → `127.0.0.1:3102` (exam-runtime), **has the `Upgrade`/`Connection` headers** |
| exam-runtime ports | `*:3102` public, `127.0.0.1:3003` internal (`/internal/...`, api→runtime only) |
| cert | `prudenthire.prudentconsulting.com` only; expires 2026-10-20 |
| exam-runtime CORS | `WEB_ORIGIN=https://prudenthire.prudentconsulting.com` |
| candidate/recruiter URL | `apps/web/.env.local` → `NEXT_PUBLIC_EXAM_RUNTIME_API_BASE` |

**Two facts that drive the whole cutover:**

1. `NEXT_PUBLIC_*` is **baked into the JS bundle at build time**, not read at runtime. A
   candidate already mid-exam is running the old bundle and will keep calling `:3002` until
   they reload. So `:3002` must stay listening — removing it is a separate, later step.
2. `apps/web/.env.local` is **gitignored and exists only on the VM**. It is not in the repo,
   so this change cannot be made by a deploy alone and will be silently lost if that file is
   ever regenerated. Same trap as `EXAM_RUNTIME_INTERNAL_URL`.

## Blocking dependency

**A DNS A record must exist before anything else can be done.** It is an exact copy of the
record that already exists for `prudenthire`, pointing at the same VM.

**Where (verified 2026-08-06):** public DNS for `prudentconsulting.com` is hosted at
**Hostinger** — authoritative nameservers `ns1.dns-parking.com` / `ns2.dns-parking.com`, SOA
administrator `dns.hostinger.com`. The record is added in Hostinger's hPanel under
Domains → prudentconsulting.com → DNS / Nameservers, by whoever holds that account.

(A lookup from inside the corporate network answers from an internal AD server,
`pidcvm-dc.pidc.prudent.site01`, which is *not* where the public record lives. Hostinger is
the one that matters.)

**The record:**

| Field | Value |
|---|---|
| Type | `A` |
| Name / Host | `exam` (Hostinger takes just the label; it becomes `exam.prudentconsulting.com`) |
| Points to | `20.219.132.226` |
| TTL | default is fine (the existing `prudenthire` record serves at 14400) |

**Verify before step 2** — must return `20.219.132.226` from a public resolver, not just
internally:

```bash
nslookup exam.prudentconsulting.com 8.8.8.8
```

Recommended name: **`exam.prudentconsulting.com`** — short, candidate-visible, and a sibling
of the existing record rather than a deeper sub-subdomain. `runtime.prudenthire.prudentconsulting.com`
also works if IT prefers to keep it namespaced under the app.

## Steps

### 1. DNS (external, gating)
A record `exam.prudentconsulting.com` → `20.219.132.226`. Verify with `dig +short`, and wait
for it to actually resolve from off-network before step 2 — certbot will fail otherwise.

### 2. Extend the certificate
Expand the existing cert rather than issuing a second one, so there is still only one renewal
to keep alive:

```bash
sudo certbot certonly --webroot -w /var/www/html --expand -d prudenthire.prudentconsulting.com -d exam.prudentconsulting.com
```

The `:80` block is `default_server` with `server_name _` and already serves the ACME challenge
for **any** hostname, so no nginx change is needed to validate the new name. Afterwards
`certbot certificates` must list both domains under one certificate.

### 3. New nginx server block
Add a `:443` block for the new name proxying to `127.0.0.1:3102`. **Copy the proxy headers
from the existing `:3002` block verbatim** — particularly `proxy_http_version 1.1`,
`Upgrade` and `Connection "upgrade"`, without which Socket.IO silently falls back or fails.
Keep `client_max_body_size 10m` (webcam snapshot uploads).

Leave the `:3002` block exactly as it is.

`sudo nginx -t` before `sudo systemctl reload nginx`. Reload, don't restart.

### 4. Prove the new origin works *before* pointing anything at it
While the app is still on `:3002`, from an outside network:
- `curl -s -o /dev/null -w '%{http_code}' https://exam.prudentconsulting.com/api/v1/candidate/code-languages` → expect the same status `:3002` gives (404 is fine; it proves TLS + proxy + Nest).
- Confirm the cert served for the new name is valid and not a mismatch.

If this fails, stop. Nothing has changed for users yet.

### 5. Repoint the app and rebuild
On the VM, edit `apps/web/.env.local`:

```
NEXT_PUBLIC_EXAM_RUNTIME_API_BASE=https://exam.prudentconsulting.com/api/v1
```

Back the file up first. Then rebuild web — the URL only changes in the bundle at build time:

```bash
pm2 stop web && npm run build --workspace=apps/web && pm2 start web --update-env
```

**This takes the frontend down for the whole build (~2-4 min)** — an in-place `next build`
deletes `.next` underneath the live process. Do it when no exam is running and none is about
to start. Verify no live attempts first:

```sql
SELECT status, started_at, last_seen_at FROM attempts WHERE status IN ('in_progress','paused','blocked')
```

No API, exam-runtime or DB change is needed. `WEB_ORIGIN` stays as-is — it is the *web*
origin, which is unchanged, so exam-runtime's CORS and Socket.IO CORS keep working.

### 6. Verify for real
- Candidate golden path end to end on the new origin: open a `/start?token=…` link, start,
  answer, submit.
- Recruiter **Live** tab: roster populates and the connection badge reads Connected — this is
  the Socket.IO path through the new block, and the thing most likely to be subtly broken.
- Browser devtools: confirm requests go to `exam.prudentconsulting.com` and **no request goes
  to `:3002`**.
- Ideally, one test from a network that blocks 3002 — that is the entire point of the change,
  and the only check that proves it.

### 7. Retire :3002 — later, not now
Keep it serving until every in-flight attempt has finished and every recruiter tab has been
reloaded. A separate, reversible change once the new origin has been in production for a
while. Removing it early breaks exactly the candidates this is meant to help.

## Rollback

Any step before 5 is invisible to users — the new block just sits unused. After step 5:
restore the backed-up `.env.local`, rebuild web, restart. `:3002` never stopped serving, so
rollback is a rebuild, not a scramble.

## Risks

| Risk | Mitigation |
|---|---|
| DNS not propagated → certbot fails | Verify `dig` resolves from off-network first; nothing else changes until it does |
| Websockets break under the new block | Copy the proxy headers verbatim from `:3002`; step 6 checks the Live tab specifically |
| Frontend down during the rebuild | Do it outside exam hours, after checking for live attempts |
| `.env.local` change lost on a future redeploy | It is gitignored and VM-only — record it in the deployment notes alongside the other VM-only env values |
| A candidate mid-exam on the old bundle | `:3002` stays up; that is why step 7 is deferred |

## Out of scope

Moving the api (`:3001`) or web (`:3000`) — both already sit behind 443 and are unaffected.
The `127.0.0.1:3003` internal port is localhost-only, never reached by a browser, and does not
move.
