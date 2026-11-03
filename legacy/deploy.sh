#!/usr/bin/env bash
#
# deploy.sh — publish (and re-publish) Iron Log to GitHub Pages in one step.
#
# Usage:
#   bash deploy.sh                 # first run sets everything up; later runs push updates
#   bash deploy.sh my-repo-name    # use a different repo name (default: iron-log)
#   MSG="fix rest timer" bash deploy.sh   # custom commit message
#
# Prereqs (one time):
#   - git
#   - GitHub CLI:  macOS -> brew install gh
#   - signed in:   gh auth login
#
# Safe to run repeatedly: it commits any changes, pushes, and only does the
# repo-create / Pages-enable steps the first time.

set -euo pipefail

REPO_NAME="${1:-iron-log}"
COMMIT_MSG="${MSG:-Update Iron Log $(date '+%Y-%m-%d %H:%M')}"

# Run from this script's own folder, wherever it's called from.
cd "$(dirname "$0")"

# ---- prerequisites ---------------------------------------------------------
command -v git >/dev/null 2>&1 || { echo "✗ git is not installed."; exit 1; }
command -v gh  >/dev/null 2>&1 || { echo "✗ GitHub CLI (gh) not installed.  macOS: brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ Not signed in to GitHub.  Run: gh auth login"; exit 1; }

OWNER="$(gh api user --jq .login)"
echo "→ GitHub user: $OWNER    repo: $REPO_NAME"

# ---- git init / commit -----------------------------------------------------
if [ ! -d .git ]; then
  git init -b main >/dev/null 2>&1 || { git init >/dev/null; git checkout -b main >/dev/null 2>&1 || true; }
  echo "→ initialized git repo (branch: main)"
fi

git add -A
if git diff --cached --quiet; then
  echo "→ no changes to commit"
else
  git commit -m "$COMMIT_MSG" >/dev/null
  echo "→ committed: $COMMIT_MSG"
fi

# ---- ensure GitHub repo + remote, then push --------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  git push origin main
  echo "→ pushed to existing repo"
elif gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
  git push -u origin main
  echo "→ linked existing repo and pushed"
else
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
  echo "→ created public repo and pushed"
fi

# ---- enable GitHub Pages (main / root) if not already on -------------------
if gh api "repos/$OWNER/$REPO_NAME/pages" >/dev/null 2>&1; then
  echo "→ GitHub Pages already enabled"
else
  echo '{"source":{"branch":"main","path":"/"}}' \
    | gh api --method POST "repos/$OWNER/$REPO_NAME/pages" --input - >/dev/null
  echo "→ enabled GitHub Pages (main / root)"
fi

# ---- report URL ------------------------------------------------------------
URL="$(gh api "repos/$OWNER/$REPO_NAME/pages" --jq .html_url 2>/dev/null || true)"
[ -z "$URL" ] && URL="https://$OWNER.github.io/$REPO_NAME/"

echo ""
echo "✅ Done. Live (allow ~1 min on the very first deploy):"
echo "   $URL"
echo "   iPhone: open that URL in Safari → Share → Add to Home Screen."
