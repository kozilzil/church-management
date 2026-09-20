#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
export BACKUP_DIR="$TEST_DIR/backups"
prefix="church-verify-$(date +%s)-$$"
export DEPLOY_ENV_FILE="$TEST_DIR/original.env"
umask 077
cat > "$DEPLOY_ENV_FILE" <<ENV
COMPOSE_PROJECT_NAME=$prefix
APP_VERSION=validation
APP_BIND_ADDRESS=127.0.0.1
APP_HTTP_PORT=${VERIFY_HTTP_PORT:-18081}
APP_BASE_URL=http://localhost:${VERIFY_HTTP_PORT:-18081}
COOKIE_SECURE=false
POSTGRES_DB=church_management
POSTGRES_USER=church_app
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_RUNTIME_PASSWORD=$(openssl rand -hex 24)
MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)
ENV
sed "s/COMPOSE_PROJECT_NAME=$prefix/COMPOSE_PROJECT_NAME=$prefix-restore/" "$DEPLOY_ENV_FILE" > "$TEST_DIR/restore.env"
compose() { docker compose --env-file "$DEPLOY_ENV_FILE" -f "$ROOT/deploy/compose.production.yml" "$@"; }
cleanup() {
  # Only these two randomly named, disposable test projects may lose volumes.
  for env in "$TEST_DIR/original.env" "$TEST_DIR/restore.env"; do
    docker compose --env-file "$env" -f "$ROOT/deploy/compose.production.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  done
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT
"$ROOT/deploy/server-up.sh"
compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
INSERT INTO app_metadata(key,value,updated_at) VALUES ('deployment_probe','retained',now());
SQL
compose exec -T api sh -c 'printf retained > /app/uploads/deployment-probe'
compose exec -T api node -e 'const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const db=new PrismaClient();db.$queryRawUnsafe("SELECT current_user AS name").then(rows=>{if(rows[0].name!=="church_runtime")process.exitCode=1}).finally(()=>db.$disconnect())'
if compose exec -T api node -e 'const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const db=new PrismaClient();db.auditEvent.deleteMany().then(()=>{process.exitCode=0}).catch(()=>{process.exitCode=1}).finally(()=>db.$disconnect())'; then
  echo 'Runtime role can delete audit records.' >&2; exit 1
fi

"$ROOT/deploy/server-up.sh"
compose up -d --force-recreate --wait --wait-timeout 180 postgres api web gateway
compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT value FROM app_metadata WHERE key='\''deployment_probe'\''"' | grep -q retained
compose exec -T api cat /app/uploads/deployment-probe | grep -q retained
"$ROOT/deploy/backup.sh"
base=''
for file in "$BACKUP_DIR"/*.sql; do base="${file%.sql}"; done
compose down
export DEPLOY_ENV_FILE="$TEST_DIR/restore.env"
"$ROOT/deploy/restore.sh" "$base"
"$ROOT/deploy/server-up.sh"
compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT value FROM app_metadata WHERE key='\''deployment_probe'\''"' | grep -q retained
compose exec -T api cat /app/uploads/deployment-probe | grep -q retained
if "$ROOT/deploy/restore.sh" "$base"; then echo 'Restore unexpectedly overwrote a nonempty database.' >&2; exit 1; fi
echo 'Clean deployment, upgrade, container recreation, backup, empty-project restore, and overwrite refusal passed.'
