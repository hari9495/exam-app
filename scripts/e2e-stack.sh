#!/usr/bin/env sh
# Starts the built API, exam runtime and web app for the apps/web Playwright walk-throughs, then waits until each
# answers. Used by CI (.github/workflows/ci.yml, job web-e2e) and locally (Git Bash works too):
#   npm run build --workspace=apps/api --workspace=apps/exam-runtime
#   NEXT_PUBLIC_API_BASE=http://localhost:$E2E_API_PORT/api/v1 \
#   NEXT_PUBLIC_EXAM_RUNTIME_API_BASE=http://localhost:$E2E_RUNTIME_PORT/api/v1 npm run build --workspace=apps/web
#   DATABASE_URL=... REDIS_URL=... JWT_ACCESS_SECRET=... (the API's usual settings) sh scripts/e2e-stack.sh
# The processes keep running in the background; their logs go to $E2E_LOG_DIR.
set -eu

WEB_PORT=${E2E_WEB_PORT:-3620}
API_PORT_=${E2E_API_PORT:-3621}
API_INTERNAL_PORT_=${E2E_API_INTERNAL_PORT:-3622}
RUNTIME_PORT=${E2E_RUNTIME_PORT:-3623}
RUNTIME_INTERNAL_PORT=${E2E_RUNTIME_INTERNAL_PORT:-3624}
LOGS=${E2E_LOG_DIR:-e2e-logs}
mkdir -p "$LOGS"

# Everything the walk-throughs expect from a laptop stack, with the dev fakes the specs name in their headers
# (virus scan, letter PDFs, receipt OCR, approval and desk channels). None of these fakes run in production.
export WEB_ORIGIN="http://localhost:$WEB_PORT"
export API_ORIGIN="http://localhost:$API_PORT_"
export API_PORT="$API_PORT_" API_INTERNAL_PORT="$API_INTERNAL_PORT_" API_INTERNAL_HOST=127.0.0.1
export API_INTERNAL_URL="http://127.0.0.1:$API_INTERNAL_PORT_/api/v1"
export EXAM_RUNTIME_PORT="$RUNTIME_PORT" EXAM_RUNTIME_INTERNAL_PORT="$RUNTIME_INTERNAL_PORT" EXAM_RUNTIME_INTERNAL_HOST=127.0.0.1
export EXAM_RUNTIME_INTERNAL_URL="http://127.0.0.1:$RUNTIME_INTERNAL_PORT"
export WEBAUTHN_RP_ID=localhost WEBAUTHN_ORIGINS="http://localhost:$WEB_PORT"
export SD_SCANNER=dev-fake LETTER_PDF_CONVERTER=dev-fake EXPENSE_OCR_ADAPTER=dev-fake APPROVAL_CHANNELS=dev-fake DESK_CHANNELS=dev-fake
# The mail-in walk-through writes the DKIM/SPF/DMARC records it signs with to this file (service-desk-channels.spec.ts).
if [ -n "${E2E_DEV_DNS:-}" ]; then export SD_MAIL_DEV_DNS="$E2E_DEV_DNS"; fi

node apps/api/dist/main.js >"$LOGS/api.log" 2>&1 &
node apps/exam-runtime/dist/main.js >"$LOGS/exam-runtime.log" 2>&1 &
PORT="$WEB_PORT" HOSTNAME=127.0.0.1 node apps/web/.next/standalone/apps/web/server.js >"$LOGS/web.log" 2>&1 &

wait_for() {
  i=0
  until curl -fs -o /dev/null "$2"; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then echo "$1 did not start; last log lines:"; tail -n 40 "$LOGS/$1.log"; exit 1; fi
    sleep 2
  done
  echo "$1 is up at $2"
}
wait_for api "http://localhost:$API_PORT_/api/v1/health"
wait_for exam-runtime "http://localhost:$RUNTIME_PORT/api/v1/health"
wait_for web "http://localhost:$WEB_PORT/yx/sign-in"
