#!/usr/bin/env sh
# Creates this checkout's e2e database once, applies the migrations (deploy only, never diff or reset) and seeds it.
# The name comes from the same rule the e2e setup uses (apps/api/src/testing/e2e-database.ts): the test app's
# examapp_org becomes examapp_org_e2e; E2E_DATABASE_URL wins when set. Safe to run again.
# From the repo root (Git Bash works):  sh scripts/e2e-db.sh
# PG_CONTAINER names the Postgres container (default exam-app-pg-postgres-1); its superuser only creates the database.
set -eu
cd "$(dirname "$0")/../apps/api"
CONTAINER=${PG_CONTAINER:-exam-app-pg-postgres-1}
NAME=$(npx ts-node --transpile-only -e "require('dotenv').config({ quiet: true }); process.stdout.write(require('./src/testing/e2e-database').e2eDatabase(process.env).name)")
case "$NAME" in
  *_e2e) ;;
  *) echo "The e2e database here is $NAME (a builder's own worktree database): nothing to create."; exit 0 ;;
esac
EXISTS=$(docker exec "$CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$NAME'")
if [ "$EXISTS" != "1" ]; then
  # The same layout as docker/postgres/init/01-roles.sh: owned by examapp_owner, CONNECT for app_runtime only.
  docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -c "CREATE DATABASE \"$NAME\" OWNER examapp_owner"
  docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -c "REVOKE ALL ON DATABASE \"$NAME\" FROM PUBLIC" -c "GRANT CONNECT ON DATABASE \"$NAME\" TO app_runtime"
  docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$NAME" -c "ALTER SCHEMA public OWNER TO examapp_owner" -c "REVOKE ALL ON SCHEMA public FROM PUBLIC"
  echo "Created $NAME."
else
  echo "$NAME exists."
fi
# Migrations as the schema owner, against the e2e database only (the URLs are never printed).
eval "$(npx ts-node --transpile-only -e "require('dotenv').config({ quiet: true }); const d = require('./src/testing/e2e-database').e2eDatabase(process.env); const q = (s) => \"'\" + String(s).replace(/'/g, \"'\\\\''\") + \"'\"; process.stdout.write('export DATABASE_URL=' + q(d.url) + '; export MIGRATION_DATABASE_URL=' + q(d.migrationUrl ?? d.url))")"
npx prisma migrate deploy
# The permission catalog and base data, as CI does before the e2e suites (the seed is safe to run again).
npx prisma db seed
echo "Migrations applied and seeded: $NAME."
