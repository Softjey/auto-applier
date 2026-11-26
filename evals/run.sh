#!/bin/bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
copy="$(mktemp -d)/auto-applier"
rsync -a --exclude node_modules --exclude .git --exclude evals/results "$repo/" "$copy/"
touch "$copy/.eval-copy"
cd "$copy"
echo "evals run from $copy (no node_modules: the Bash sandbox otherwise fails with E2BIG)" >&2
exec claude plugin eval . --no-publish --trust-plugin --ablation none --scaffold \
  --allow-tools Write Edit Bash Glob Grep "$@"
