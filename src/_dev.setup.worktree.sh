#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Example worktree setup for _dev"
echo "This file is an example bootstrap script, not part of the core _dev runtime."

MAIN_WORKTREE="$(
  git -C "$ROOT_DIR" worktree list --porcelain | awk '
    $1=="worktree" { wt=$2 }
    $1=="branch" && $2=="refs/heads/main" { print wt; exit }
  '
)"

rsync_path_with_main() {
  local rel_path="$1"
  local target_path="$ROOT_DIR/$rel_path"
  local source_path="$MAIN_WORKTREE/$rel_path"

  if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync is required to copy missing files from main repo." >&2
    return
  fi

  if [ -d "$source_path" ]; then
    mkdir -p "$target_path"
    rsync -a --ignore-existing "$source_path/" "$target_path/"
    echo "Synced missing directory contents from main repo: $source_path"
  elif [ -f "$source_path" ]; then
    mkdir -p "$(dirname "$target_path")"
    rsync -a --ignore-existing "$source_path" "$target_path"
    if [ -e "$target_path" ]; then
      echo "Ensured file exists from main repo: $source_path"
    fi
  else
    echo "Main repo path not found, skipping sync: $source_path"
  fi
}

if [ -n "${MAIN_WORKTREE:-}" ]; then
  rsync_path_with_main "workers/api/.wrangler/state"
  rsync_path_with_main "workers/api/.dev.vars"
  rsync_path_with_main "workers/api/.env"
  rsync_path_with_main "workers/admin/.env.development"
  rsync_path_with_main "workers/admin/.env.production"
  rsync_path_with_main "apps/mobile/ios/"
  rsync_path_with_main "apps/mobile/.env.local"
  rsync_path_with_main "scripts/generate-characters-and-poses/.env"
  rsync_path_with_main "scripts/generate-characters-and-poses/test-models/.env"
else
  echo "Main worktree on branch 'main' not found, skipping cache and env file copy."
fi

if [ "$(uname -s)" = "Darwin" ] && command -v ios-sim-lease >/dev/null 2>&1; then
  if ios-sim-lease --prune; then
    echo "Pruned stale iOS simulator leases."
  else
    echo "Warning: failed to prune iOS simulator leases; continuing setup." >&2
  fi
else
  echo "Skipping iOS simulator lease pruning (requires macOS with ios-sim-lease available)."
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found in PATH." >&2
  echo "Install pnpm (or enable via corepack) and rerun ./dev setup." >&2
  exit 1
fi

echo "Running pnpm install with --ignore-scripts."
pnpm install --ignore-scripts

if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$ROOT_DIR" config core.hooksPath .githooks
  echo "Configured git hooks path to .githooks"
fi
