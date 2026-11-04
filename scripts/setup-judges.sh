#!/usr/bin/env bash
set -euo pipefail

# Reproducible judge setup. The test mode builds an isolated checkout from the
# current commit so it never reuses this worktree's node_modules or credentials.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-test}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"

if [[ "$MODE" != "test" ]]; then
  echo "usage: bash scripts/setup-judges.sh test" >&2
  exit 2
fi

command -v "$NODE_BIN" >/dev/null || { echo "node is required" >&2; exit 1; }
command -v "$NPM_BIN" >/dev/null || { echo "npm is required" >&2; exit 1; }
node_major="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required (found $($NODE_BIN --version))" >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/tuka-judges.XXXXXX")"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

echo "Creating isolated checkout at $tmp_dir"
git -C "$ROOT_DIR" archive --format=tar HEAD | tar -xf - -C "$tmp_dir"
cd "$tmp_dir"
echo "Installing locked dependencies"
"$NPM_BIN" ci --ignore-scripts --no-audit --no-fund
echo "Running automated tests"
"$NPM_BIN" test
echo "Building the protected submission"
"$NPM_BIN" run build:meta
echo "Judge setup passed: tests and protected build completed in an isolated checkout."
