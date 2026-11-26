#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
mkdir -p .claude/skills/apply-to-jobs
for part in scripts browser ats; do
  cp -R "$repo/.claude/skills/apply-to-jobs/$part" ".claude/skills/apply-to-jobs/$part"
done
cp -R "$repo/fixtures/persona" ./data
echo "data" > .data-dir
