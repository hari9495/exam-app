#!/bin/sh
# Runs once, on first start of an empty data volume (docker-entrypoint-initdb.d).
# Least-privilege role layout -- the same layout production must provision (see README, "Database"):
#   examapp_owner  owns the database + schema; runs `prisma migrate` (MIGRATION_DATABASE_URL).
#   app_runtime    NOLOGIN group; migrations GRANT table privileges to it, never to a login role.
#   examapp_app    the API/runtime login (DATABASE_URL): member of app_runtime, owns nothing,
#                  NOBYPASSRLS, so every query is subject to row-level security.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" -v owner_pw="$APP_DB_OWNER_PASSWORD" -v app_pw="$APP_DB_APP_PASSWORD" <<'SQL'
CREATE ROLE examapp_owner LOGIN NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE examapp_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  IN ROLE app_runtime PASSWORD :'app_pw';

ALTER DATABASE :"db" OWNER TO examapp_owner;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO app_runtime;

ALTER SCHEMA public OWNER TO examapp_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
