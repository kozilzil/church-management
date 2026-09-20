#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT/deploy/.env.production}"
[[ -f "$ENV_FILE" ]] || { echo 'Create the deployment environment file first.' >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$ROOT/deploy/compose.production.yml" "$@"; }
