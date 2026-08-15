#!/usr/bin/env bash
#
# Wire Sentry DSNs into the production VM and turn error reporting on.
#
# Usage, from the repo root:
#   scripts/enable-sentry.sh <api-dsn> <exam-runtime-dsn> <web-dsn>
#
# The three DSNs come from each Sentry project's Client Keys (DSN) page. They are write-only
# ingest keys -- the web one is compiled into the browser bundle and is public by design -- so
# they are not secrets in the way a password is. They are still written straight into the VM's
# .env files and never echoed here.
#
# NEVER add `set -x`: this script handles DSNs and runs beside DATABASE_URL.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $0 <api-dsn> <exam-runtime-dsn> <web-dsn>" >&2
  exit 1
fi

API_DSN="$1"
RUNTIME_DSN="$2"
WEB_DSN="$3"
KEY="${SSH_KEY:-$HOME/Downloads/PTC-VSS-SF-Interview-VM_key.pem}"
HOST="${VM_HOST:-ptcsfadmin@20.219.132.226}"

for dsn in "$API_DSN" "$RUNTIME_DSN" "$WEB_DSN"; do
  case "$dsn" in
    https://*@*/*) ;;
    *) echo "refusing: '${dsn:0:12}...' does not look like a Sentry DSN (expected https://<key>@<host>/<project>)" >&2; exit 1 ;;
  esac
done

# Everything runs in ONE ssh connection. This box exhausts its P6 disk burst credits during a
# web rebuild and drops SSH for minutes at a time; a second connection is exactly what fails.
# The remote half is fed on stdin so no quoting games are needed -- inlining a heredoc inside a
# quoted ssh command silently eats single quotes on this setup.
ssh -i "$KEY" -o ConnectTimeout=30 "$HOST" \
  "cat > ~/enable_sentry_remote.sh; chmod +x ~/enable_sentry_remote.sh; \
   nohup ~/enable_sentry_remote.sh '$API_DSN' '$RUNTIME_DSN' '$WEB_DSN' > ~/enable_sentry.log 2>&1 & echo LAUNCHED" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
API_DSN="$1"; RUNTIME_DSN="$2"; WEB_DSN="$3"
cd "$HOME/app"
MARK="$HOME/enable_sentry.marker"
rm -f "$MARK"
trap 'pm2 start web --update-env >/dev/null 2>&1 || true; echo "SENTRY_ENABLE_FAIL" >> "$MARK"' ERR

# Replace any existing line rather than appending a duplicate; a second SENTRY_DSN= would
# shadow the first depending on parse order.
set_var() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  grep -v "^${key}=" "$file" > "${file}.tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "${file}.tmp"
  mv "${file}.tmp" "$file"
}

echo "=== 1. write DSNs ==="
set_var apps/api/.env SENTRY_DSN "$API_DSN"
set_var apps/api/.env SENTRY_ENVIRONMENT production
set_var apps/exam-runtime/.env SENTRY_DSN "$RUNTIME_DSN"
set_var apps/exam-runtime/.env SENTRY_ENVIRONMENT production
# Web needs BOTH: the server runtime reads SENTRY_DSN, the browser reads NEXT_PUBLIC_SENTRY_DSN.
set_var apps/web/.env.local SENTRY_DSN "$WEB_DSN"
set_var apps/web/.env.local NEXT_PUBLIC_SENTRY_DSN "$WEB_DSN"
set_var apps/web/.env.local SENTRY_ENVIRONMENT production
echo "written (values not echoed)"

echo "=== 2. rebuild web ==="
# NEXT_PUBLIC_* is inlined at BUILD time. Setting it only at runtime leaves the browser half
# permanently inert with no error anywhere -- the single most likely way to think this worked
# when it did not.
pm2 stop web
npm run build --workspace=apps/web
pm2 start web --update-env

echo "=== 3. restart backends ==="
# Both read .env from disk at boot via ConfigModule, so a restart is required; --update-env
# alone would not do it.
pm2 restart api exam-runtime --update-env

echo "=== 4. confirm the DSNs actually landed ==="
sleep 12
# Positive checks only. An earlier version of this script inferred success from the ABSENCE of
# the "SENTRY_DSN=unset" warning in api-out.log -- but pm2-logrotate had already rotated that
# line away, so the check passed identically whether or not the DSN was written. Absence of a
# warning is not evidence when the log it lived in may no longer exist.
for f in apps/api/.env apps/exam-runtime/.env apps/web/.env.local; do
  if grep -q '^SENTRY_DSN=https://' "$f"; then
    echo "  $f: SENTRY_DSN present"
  else
    echo "  $f: SENTRY_DSN MISSING -- deploy did not take"; echo "SENTRY_ENABLE_FAIL" >> "$MARK"; exit 1
  fi
done
grep -q '^NEXT_PUBLIC_SENTRY_DSN=https://' apps/web/.env.local \
  && echo "  apps/web/.env.local: NEXT_PUBLIC_SENTRY_DSN present" \
  || { echo "  apps/web/.env.local: NEXT_PUBLIC_SENTRY_DSN MISSING"; echo "SENTRY_ENABLE_FAIL" >> "$MARK"; exit 1; }

# The browser half is the one that fails silently: NEXT_PUBLIC_* is inlined at BUILD time, so a
# correct .env with a stale bundle looks fine everywhere except in Sentry, where web events
# simply never arrive. Prove the value is in the shipped bundle, not just in the file.
if grep -rq 'ingest\.\(de\.\)\?sentry\.io' apps/web/.next/static 2>/dev/null; then
  echo "  web bundle: DSN inlined into client chunks"
else
  echo "  web bundle: DSN NOT found in client chunks -- browser errors will not report"
  echo "SENTRY_ENABLE_FAIL" >> "$MARK"; exit 1
fi

# Only meaningful for a process that has just restarted, so check the CURRENT boot's log tail.
echo "  recent inert warnings (expect none):"
tail -200 ~/.pm2/logs/api-out.log 2>/dev/null | grep -c 'SENTRY_DSN=unset' || true
tail -200 ~/.pm2/logs/exam-runtime-out.log 2>/dev/null | grep -c 'SENTRY_DSN=unset' || true

echo "=== 5. pm2 state ==="
pm2 list --no-color

echo "SENTRY_ENABLE_OK" >> "$MARK"
REMOTE

echo
echo "Launched detached on the VM. Poll with:"
echo "  ssh -i \"$KEY\" $HOST 'cat ~/enable_sentry.marker 2>/dev/null; tail -3 ~/enable_sentry.log'"
echo
echo "Expect SENTRY_ENABLE_OK. Then run the mandatory PII check -- see docs/superpowers/specs/2026-08-13-observability-design.md."
