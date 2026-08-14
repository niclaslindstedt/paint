#!/bin/bash
# Install this repo's npm dependencies when a Claude Code on the web session
# starts, so `make test` / `make lint` work without a manual `npm install`.
#
# The one wrinkle is auth: `@niclaslindstedt/oss-framework` comes from the
# GitHub Packages registry (see `.npmrc`), which requires a token even for
# public packages. The token is read from the environment and written to the
# *user-level* `~/.npmrc` — never the repo's, which is committed.
set -euo pipefail

# Async: the install runs in the background while the session starts.
echo '{"async": true, "asyncTimeout": 600000}'

# Web sessions only — a local checkout manages its own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# GITHUB_PAT is the real credential in this environment; GITHUB_TOKEN is a
# placeholder the egress proxy swaps in for git and the GitHub API, and it does
# not authenticate against npm.pkg.github.com. Prefer the former, and only fall
# back to the latter when it looks like an actual token.
token="${GITHUB_PAT:-}"
if [ -z "$token" ] && [ "${GITHUB_TOKEN:-proxy-injected}" != "proxy-injected" ]; then
  token="${GITHUB_TOKEN}"
fi

if [ -n "$token" ]; then
  npmrc="${HOME}/.npmrc"
  touch "$npmrc"
  chmod 600 "$npmrc"
  # Idempotent: replace any line we wrote on an earlier run.
  if [ -s "$npmrc" ]; then
    grep -v '^//npm\.pkg\.github\.com/:_authToken=' "$npmrc" > "$npmrc.tmp" || true
    mv "$npmrc.tmp" "$npmrc"
    chmod 600 "$npmrc"
  fi
  printf '//npm.pkg.github.com/:_authToken=%s\n' "$token" >> "$npmrc"
else
  echo "session-start: no GitHub Packages token in the environment;" \
    "npm install will fail on @niclaslindstedt/oss-framework" >&2
fi

# `install`, not `ci`: the container image is cached after the hook completes,
# and install reuses whatever node_modules that cache already carries.
npm install --no-audit --no-fund
