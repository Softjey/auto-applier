#!/bin/bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
copy="$(mktemp -d)/job-triage"
rsync -a --exclude .git --exclude .venv --exclude data --exclude evals/results "$repo/" "$copy/"
touch "$copy/.eval-copy"
cd "$copy"
echo "evals run from $copy (data/ there is linked into each case's sandbox)" >&2
exec claude plugin eval . --no-publish --trust-plugin --ablation none --scaffold \
  --allow-tools Write Edit Bash Glob Grep "$@"
