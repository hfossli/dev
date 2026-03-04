#!/usr/bin/env bash
set -euo pipefail

readonly DEFAULT_REPO="hfossli/dev"
readonly DEFAULT_REF="main"

REPO="${DEV_INSTALL_REPO:-$DEFAULT_REPO}"
REF="${DEV_INSTALL_REF:-$DEFAULT_REF}"
TMP_DIR=""

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found in PATH: $1"
}

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup EXIT

ensure_git_repo() {
  need_cmd git
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Current directory is not a git repository."
}

ensure_no_merge_or_rebase_in_progress() {
  local git_dir
  git_dir="$(git rev-parse --git-common-dir)"

  if [ -f "$git_dir/MERGE_HEAD" ] || [ -n "$(git ls-files -u)" ]; then
    die "Git has unresolved merge conflicts. Resolve or abort the merge before installing."
  fi

  if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
    die "Git has an unfinished rebase. Complete or abort the rebase before installing."
  fi
}

ensure_clean_worktree() {
  if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
    die "Git repository has uncommitted changes. Commit or stash them before installing."
  fi
}

validate_target_paths() {
  if [ -e "./dev" ] && [ ! -f "./dev" ]; then
    die "./dev exists but is not a file."
  fi

  if [ -e "./dev.config.js" ] && [ ! -f "./dev.config.js" ]; then
    die "./dev.config.js exists but is not a file."
  fi

  if [ -e "./dev.tools" ] && [ ! -d "./dev.tools" ]; then
    die "./dev.tools exists but is not a folder."
  fi
}

label_for_path() {
  if [ -e "$1" ]; then
    printf 'overwriting'
  else
    printf 'creating'
  fi
}

prompt_for_confirmation() {
  local dev_state config_state tools_state
  dev_state="$(label_for_path ./dev)"
  config_state="$(label_for_path ./dev.config.js)"
  tools_state="$(label_for_path ./dev.tools)"

  printf 'Installing into: %s\n' "$PWD"
  printf 'This installer will create or overwrite:\n'
  printf '  - file: dev (%s)\n' "$dev_state"
  printf '  - file: dev.config.js (%s)\n' "$config_state"
  printf '  - folder: dev.tools (%s)\n' "$tools_state"
  printf 'Press Enter to continue (Ctrl+C to cancel): '
  read -r _
}

resolve_source_dir() {
  if [ -n "${DEV_INSTALL_SOURCE_DIR:-}" ]; then
    [ -d "${DEV_INSTALL_SOURCE_DIR}/src" ] || die "DEV_INSTALL_SOURCE_DIR does not contain a src directory."
    printf '%s\n' "${DEV_INSTALL_SOURCE_DIR}/src"
    return
  fi

  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -d "${script_dir}/src" ]; then
      printf '%s\n' "${script_dir}/src"
      return
    fi
  fi

  need_cmd curl
  need_cmd tar
  need_cmd mktemp

  TMP_DIR="$(mktemp -d)"
  local archive_url extracted_root
  archive_url="https://github.com/${REPO}/archive/refs/heads/${REF}.tar.gz"

  printf 'Downloading %s (%s)...\n' "$REPO" "$REF"
  curl -fsSL "$archive_url" -o "${TMP_DIR}/repo.tar.gz"
  tar -xzf "${TMP_DIR}/repo.tar.gz" -C "$TMP_DIR"

  extracted_root="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "${extracted_root:-}" ] || die "Failed to unpack installer repository."
  [ -d "${extracted_root}/src" ] || die "Downloaded repository does not contain src/."

  printf '%s\n' "${extracted_root}/src"
}

install_from_source() {
  local source_dir="$1"
  [ -d "$source_dir" ] || die "Source directory not found: $source_dir"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$source_dir"/ ./
  else
    cp -a "$source_dir"/. ./
  fi

  chmod +x ./dev
}

main() {
  ensure_git_repo
  ensure_no_merge_or_rebase_in_progress
  ensure_clean_worktree
  validate_target_paths
  prompt_for_confirmation

  local source_dir
  source_dir="$(resolve_source_dir)"
  install_from_source "$source_dir"

  printf 'Install complete.\n'
  printf 'Run: ./dev start web\n'
}

main "$@"
