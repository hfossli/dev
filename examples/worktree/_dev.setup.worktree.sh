#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Example worktree bootstrap for dev."
echo "Use @hfossli/dev-helpers in your config and keep repo-specific setup here."
