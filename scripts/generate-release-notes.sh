#!/usr/bin/env bash

set -euo pipefail

CURRENT_TAG="${1:-${GITHUB_REF_NAME:-}}"
REPOSITORY="${2:-${GITHUB_REPOSITORY:-}}"
OUTPUT_FILE="${3:-release-notes.txt}"
CHECKSUM_FILE="${4:-}"
TEMPLATE_FILE=".github/templates/release-notes.md"

if [[ -z "$CURRENT_TAG" || -z "$REPOSITORY" ]]; then
  echo "Usage: $0 <current_tag> <owner/repo> [output_file] [checksum_file]"
  exit 1
fi

PROJECT_NAME="$(echo "$REPOSITORY" | cut -d'/' -f2)"
REPO_URL="https://github.com/$REPOSITORY"
RELEASE_DATE="$(date -u +%F)"
PREVIOUS_TAG="$(git tag --list 'v*' --sort=-v:refname | grep -Fxv "$CURRENT_TAG" | head -n 1 || true)"

if [[ -n "$PREVIOUS_TAG" ]]; then
  COMMIT_RANGE="${PREVIOUS_TAG}..${CURRENT_TAG}"
else
  COMMIT_RANGE="$CURRENT_TAG"
fi

categorize_commits() {
  local range="$1"
  local repo_url="$2"
  local lines
  lines="$(git log --pretty="format:%s|%h|%H" --no-merges "$range" 2>/dev/null || true)"

  if [[ -z "$lines" ]]; then
    echo "- Initial release"
    return
  fi

  local features=""
  local fixes=""
  local docs=""
  local refactors=""
  local tests=""
  local perf=""
  local chores=""
  local others=""

  while IFS='|' read -r msg short_hash full_hash; do
    [[ -z "$msg" ]] && continue
    local link="[\`$short_hash\`]($repo_url/commit/$full_hash)"
    local entry="- $msg ($link)"
    case "$msg" in
      ✨*) features+="${entry}"$'\n' ;;
      🐛*) fixes+="${entry}"$'\n' ;;
      📝*) docs+="${entry}"$'\n' ;;
      ♻️*) refactors+="${entry}"$'\n' ;;
      ✅*) tests+="${entry}"$'\n' ;;
      ⚡*) perf+="${entry}"$'\n' ;;
      🔧*|🔨*|📦*|⬆️*|⬇️*) chores+="${entry}"$'\n' ;;
      *) others+="${entry}"$'\n' ;;
    esac
  done <<< "$lines"

  if [[ -n "$features" ]]; then
    echo "### ✨ Features"
    echo
    echo "$features"
  fi
  if [[ -n "$fixes" ]]; then
    echo "### 🐛 Fixes"
    echo
    echo "$fixes"
  fi
  if [[ -n "$perf" ]]; then
    echo "### ⚡ Performance"
    echo
    echo "$perf"
  fi
  if [[ -n "$refactors" ]]; then
    echo "### ♻️ Refactor"
    echo
    echo "$refactors"
  fi
  if [[ -n "$tests" ]]; then
    echo "### ✅ Tests"
    echo
    echo "$tests"
  fi
  if [[ -n "$docs" ]]; then
    echo "### 📝 Docs"
    echo
    echo "$docs"
  fi
  if [[ -n "$chores" ]]; then
    echo "### 🔧 Maintenance"
    echo
    echo "$chores"
  fi
  if [[ -n "$others" ]]; then
    echo "### 🔀 Other"
    echo
    echo "$others"
  fi
}

COMMIT_LIST="$(categorize_commits "$COMMIT_RANGE" "$REPO_URL")"
if [[ -z "$COMMIT_LIST" ]]; then
  COMMIT_LIST="- Initial release"
fi

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "Template not found: $TEMPLATE_FILE"
  exit 1
fi

CHECKSUM_LIST="- Checksums were not generated for this release."
if [[ -n "$CHECKSUM_FILE" && -f "$CHECKSUM_FILE" ]]; then
  CHECKSUM_LIST="$(cat "$CHECKSUM_FILE")"
fi

cp "$TEMPLATE_FILE" "$OUTPUT_FILE"
sed -i "s|\${PROJECT_NAME}|$PROJECT_NAME|g" "$OUTPUT_FILE"
sed -i "s|\${CURRENT_TAG}|$CURRENT_TAG|g" "$OUTPUT_FILE"
sed -i "s|\${RELEASE_DATE}|$RELEASE_DATE|g" "$OUTPUT_FILE"
sed -i "s|\${REPO_URL}|$REPO_URL|g" "$OUTPUT_FILE"

if [[ -n "$PREVIOUS_TAG" ]]; then
  sed -i "s|\${PREVIOUS_TAG}|$PREVIOUS_TAG|g" "$OUTPUT_FILE"
else
  sed -i "s|\${PREVIOUS_TAG}|$CURRENT_TAG|g" "$OUTPUT_FILE"
fi

printf '%s\n' "$COMMIT_LIST" > .release-commits.tmp
sed -i "/\${COMMIT_LIST}/r .release-commits.tmp" "$OUTPUT_FILE"
sed -i "/\${COMMIT_LIST}/d" "$OUTPUT_FILE"

printf '%s\n' "$CHECKSUM_LIST" > .release-checksums.tmp
sed -i "/\${CHECKSUM_LIST}/r .release-checksums.tmp" "$OUTPUT_FILE"
sed -i "/\${CHECKSUM_LIST}/d" "$OUTPUT_FILE"
rm -f .release-commits.tmp .release-checksums.tmp

echo "Release notes written to $OUTPUT_FILE"
