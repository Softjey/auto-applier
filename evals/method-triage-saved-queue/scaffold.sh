#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
mkdir -p .claude/skills/apply-to-jobs .claude/skills/apply-method-triage autofill/packages/extension/src
for part in scripts browser ats; do
  cp -R "$repo/.claude/skills/apply-to-jobs/$part" ".claude/skills/apply-to-jobs/$part"
done
cp -R "$repo/.claude/skills/apply-method-triage/reference" .claude/skills/apply-method-triage/reference
cp -R "$repo/autofill/packages/extension/src/adapters" autofill/packages/extension/src/adapters
mkdir -p data/triage
cp "$repo/fixtures/persona/profile.json" "$repo/fixtures/persona/stories.json" "$repo/fixtures/persona/apply-config.json" data/
echo "data" > .data-dir
if [ -f "$repo/.eval-copy" ]; then echo "$PWD/data" > "$repo/.data-dir"; fi
