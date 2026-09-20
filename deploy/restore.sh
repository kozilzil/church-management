#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ $# -eq 1 && -f "$1.sql" && -f "$1.uploads.tar.gz" ]] || { echo 'Usage: restore.sh /path/to/backup-base' >&2; exit 1; }
compose up -d --wait postgres
count="$(compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='\''public'\''"')"
[[ "$count" =~ ^[[:space:]]*0[[:space:]]*$ ]] || { echo 'Restore requires a new empty database; refusing to overwrite.' >&2; exit 1; }
compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1.sql"
compose run --rm --no-deps -T --entrypoint tar api -xzf - -C /app/uploads < "$1.uploads.tar.gz"
echo 'Restore finished. Run server-up.sh to migrate and verify health.'
