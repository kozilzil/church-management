#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
cat > "$TEST_DIR/env" <<'ENV'
POSTGRES_PASSWORD=1234567890123456789012345678901234567890
POSTGRES_RUNTIME_PASSWORD=0987654321098765432109876543210987654321
ENV
cat > "$TEST_DIR/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DEPLOY_TEST_LOG"
if [[ "$*" == *'--exit-code-from migrate'* ]]; then exit 42; fi
MOCK
chmod +x "$TEST_DIR/docker"
if PATH="$TEST_DIR:$PATH" DEPLOY_TEST_LOG="$TEST_DIR/calls" DEPLOY_ENV_FILE="$TEST_DIR/env" "$ROOT/deploy/server-up.sh" > "$TEST_DIR/output" 2>&1; then
  echo 'Expected migration failure to abort deployment.' >&2; exit 1
fi
if grep -q 'api web gateway' "$TEST_DIR/calls" || grep -q 'Deployment healthy' "$TEST_DIR/output"; then
  echo 'Deployment incorrectly continued after migration failure.' >&2; exit 1
fi
echo 'Migration failure gate passed.'
