#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
umask 077
BACKUP_DIR="${BACKUP_DIR:-$ROOT/.tmp/backups}"
mkdir -p "$BACKUP_DIR"
base="$BACKUP_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$"
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' > "$base.sql.partial"
mv "$base.sql.partial" "$base.sql"
compose run --rm --no-deps -T --entrypoint tar api -czf - -C /app/uploads . > "$base.uploads.tar.gz.partial"
mv "$base.uploads.tar.gz.partial" "$base.uploads.tar.gz"
echo "Backup saved: $base"
