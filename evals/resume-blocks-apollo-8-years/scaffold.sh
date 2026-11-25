#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
persona="$repo/fixtures/persona"
cp "$persona/skills.csv" "$persona/CV_Base.html" "$persona/resume-config.json" .
cp "$persona/vacancies/$(basename "$here" | sed 's/^resume-blocks-//').md" ./vacancy.md
for dir in "$repo"/.claude/skills/*/; do
  name="$(basename "$dir")"
  mkdir -p ".claude/skills/$name"
  find "$dir" -maxdepth 1 -name '*.mjs' -exec cp {} ".claude/skills/$name/" \;
done
