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
INSERT INTO church(id,name) VALUES ('00000000-0000-4000-8000-000000000001','Synthetic budget restore probe');
INSERT INTO app_user(id,church_id,username,active) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','synthetic-budget-probe',false);
INSERT INTO finance_account(id,church_id,code,name,kind) VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','E-PROBE','Synthetic expense','EXPENSE');
INSERT INTO finance_fund(id,church_id,name) VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Synthetic fund');
INSERT INTO budget_revision(id,church_id,year,account_id,fund_id,version,amount,reason,created_by) VALUES ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',2020,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',1,12345,'Synthetic restore probe','00000000-0000-4000-8000-000000000002');
SQL
compose exec -T api sh -c 'printf retained > /app/uploads/deployment-probe'
compose exec -T api node -e 'const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const db=new PrismaClient();db.$queryRawUnsafe("SELECT current_user AS name").then(rows=>{if(rows[0].name!=="church_runtime")process.exitCode=1}).finally(()=>db.$disconnect())'
verify_budget_probe() {
  compose exec -T api node -e 'const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const db=new PrismaClient();(async()=>{const r=await db.budgetRevision.findUniqueOrThrow({where:{id:"00000000-0000-4000-8000-000000000005"}});if(r.amount.toFixed(0)!=="12345"||r.version!==1)throw Error("Budget restore probe changed");const [p]=await db.$queryRawUnsafe("SELECT has_table_privilege(current_user,$1,$2) AS edit,has_table_privilege(current_user,$1,$3) AS remove,has_table_privilege(current_user,$1,$4) AS create","budget_revision","UPDATE","DELETE","INSERT");if(p.edit||p.remove||!p.create)throw Error("Budget runtime privileges incorrect")})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect())'
}
verify_budget_probe
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
verify_budget_probe
if "$ROOT/deploy/restore.sh" "$base"; then echo 'Restore unexpectedly overwrote a nonempty database.' >&2; exit 1; fi
echo 'Clean deployment, upgrade, container recreation, backup, empty-project restore, and overwrite refusal passed.'
