#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
compose run --rm --no-deps -T api pnpm care:purge
