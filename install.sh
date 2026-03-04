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

supports_color() {
  [ -t 1 ] || return 1
  [ -z "${NO_COLOR:-}" ] || return 1
  [ "${TERM:-}" != "dumb" ] || return 1

  if command -v tput >/dev/null 2>&1; then
    local color_count
    color_count="$(tput colors 2>/dev/null || printf '0')"
    [ "${color_count:-0}" -ge 8 ] || return 1
  fi

  return 0
}

print_dev_banner() {
  local -a banner=(
'                                         '
'░▒▓███████▓▒░░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░ '
'░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░      ░▒▓█▓▒░░▒▓█▓▒░ '
'░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░       ░▒▓█▓▒▒▓█▓▒░  '
'░▒▓█▓▒░░▒▓█▓▒░▒▓██████▓▒░  ░▒▓█▓▒▒▓█▓▒░  '
'░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░        ░▒▓█▓▓█▓▒░   '
'░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░        ░▒▓█▓▓█▓▒░   '
'░▒▓███████▓▒░░▒▓████████▓▒░  ░▒▓██▓▒░    '
''
'Streamline git worktree with dev-script  '
  )

  printf '%s\n' "${banner[@]}"
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

should_skip_relative_path() {
  case "$1" in
    .DS_Store|*/.DS_Store)
      return 0
      ;;
  esac
  return 1
}

files_differ() {
  local source_path="$1"
  local target_path="$2"

  if ! cmp -s "$source_path" "$target_path"; then
    return 0
  fi

  local src_exec=0 target_exec=0
  [ -x "$source_path" ] && src_exec=1
  [ -x "$target_path" ] && target_exec=1

  [ "$src_exec" -ne "$target_exec" ]
}

prompt_overwrite_path() {
  local rel_path="$1"
  local answer

  while true; do
    printf 'Overwrite %s? [y/N]: ' "$rel_path"
    read -r answer || answer=""
    case "$answer" in
      [Yy]|[Yy][Ee][Ss])
        return 0
        ;;
      ""|[Nn]|[Nn][Oo])
        return 1
        ;;
      *)
        printf 'Please answer yes or no.\n'
        ;;
    esac
  done
}

prompt_for_confirmation() {
  local dev_state config_state tools_state setup_state
  dev_state="$(label_for_path ./dev)"
  config_state="$(label_for_path ./dev.config.js)"
  tools_state="$(label_for_path ./dev.tools)"
  setup_state="$(label_for_path ./dev.setup.sh)"

  print_dev_banner
  printf '\n'
  printf 'Installing into: %s\n' "$PWD"
  printf 'This installer will create or overwrite:\n'
  printf '  - file: dev (%s)\n' "$dev_state"
  printf '  - file: dev.config.js (%s)\n' "$config_state"
  printf '  - file: dev.setup.sh (%s)\n' "$setup_state"
  printf '  - folder: dev.tools (%s)\n' "$tools_state"
  printf '\n'
  printf 'You will be asked yes/no before overwriting each changed file.\n'
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
  local src_path rel target_path

  while IFS= read -r src_path; do
    rel="${src_path#$source_dir/}"
    should_skip_relative_path "$rel" && continue
    target_path="./$rel"

    if [ -e "$target_path" ] && [ ! -d "$target_path" ]; then
      die "$target_path exists but is not a folder."
    fi
    mkdir -p "$target_path"
  done < <(find "$source_dir" -mindepth 1 -type d | LC_ALL=C sort)

  while IFS= read -r src_path; do
    rel="${src_path#$source_dir/}"
    should_skip_relative_path "$rel" && continue
    target_path="./$rel"

    if [ -e "$target_path" ] && [ -d "$target_path" ]; then
      die "$target_path exists but is a folder."
    fi

    mkdir -p "$(dirname "$target_path")"

    if [ ! -e "$target_path" ]; then
      cp -a "$src_path" "$target_path"
      continue
    fi

    if ! files_differ "$src_path" "$target_path"; then
      continue
    fi

    if prompt_overwrite_path "$rel"; then
      cp -a "$src_path" "$target_path"
    else
      printf 'Keeping existing %s\n' "$rel"
    fi
  done < <(find "$source_dir" -mindepth 1 \( -type f -o -type l \) | LC_ALL=C sort)

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
