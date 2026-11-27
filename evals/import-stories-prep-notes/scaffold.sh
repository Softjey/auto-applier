#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
mkdir -p .claude/skills/apply-to-jobs
cp -R "$repo/.claude/skills/apply-to-jobs/scripts" .claude/skills/apply-to-jobs/scripts
mkdir -p data/notes
cp "$repo/fixtures/persona/profile.json" "$repo/fixtures/persona/stories.json" "$repo/fixtures/persona/apply-config.json" data/
cp "$repo/fixtures/persona/notes/interview-prep.md" data/notes/
if [ -f "$repo/.eval-copy" ]; then ln -sfn "$PWD/data" "$repo/data"; fi
