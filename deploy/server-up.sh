#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
compose config --quiet
# Validate without echoing any secret. The password must be URL-safe.
for key in POSTGRES_PASSWORD POSTGRES_RUNTIME_PASSWORD; do
  password="$(sed -n "s/^$key=//p" "$ENV_FILE")"
  [[ "$password" =~ ^[a-zA-Z0-9_-]{32,}$ && "$password" != *CHANGE_ME* ]] || { echo "Set $key to a random URL-safe password (32+ characters)." >&2; exit 1; }
done
unset password

compose build
compose up -d --wait postgres
if compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT to_regclass('\''public._prisma_migrations'\'') IS NOT NULL"' | grep -q t; then
  "$ROOT/deploy/backup.sh"
fi
# Remove previous migration job so the new image must successfully migrate.
compose rm -f migrate
compose up --no-deps --abort-on-container-exit --exit-code-from migrate migrate
# Separate migration ownership from the non-owner application login.
compose exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
\getenv runtime_password POSTGRES_RUNTIME_PASSWORD
SELECT format('CREATE ROLE church_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'runtime_password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='church_runtime') \gexec
SELECT format('ALTER ROLE church_runtime PASSWORD %L', :'runtime_password') \gexec
GRANT USAGE ON SCHEMA public TO church_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO church_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO church_runtime;
REVOKE UPDATE, DELETE ON audit_event, member_status_history, attendance_change, newcomer_change, care_change FROM church_runtime;
REVOKE DELETE ON household_membership, organization_membership, position_appointment, member_relation, care_note FROM church_runtime;
SQL
compose up -d --wait --wait-timeout 180 api web gateway
compose exec -T gateway wget -q -O /dev/null http://127.0.0.1/api/v1/health/readiness
echo 'Deployment healthy; database and uploads volumes retained.'
