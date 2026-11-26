#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
mkdir -p .claude/skills/apply-to-jobs
for part in scripts browser ats; do
  cp -R "$repo/.claude/skills/apply-to-jobs/$part" ".claude/skills/apply-to-jobs/$part"
done
mkdir -p data
cp "$repo/fixtures/persona/profile.json" "$repo/fixtures/persona/stories.json" data/
mkdir -p data/runs data/triage
printf '%%PDF-1.4\n%% Daniel Nowak base resume\n' > data/Daniel_Nowak_CV.pdf
python3 - "$repo/fixtures/persona/apply-config.json" "$PWD/data/Daniel_Nowak_CV.pdf" > data/apply-config.json <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
cfg["paths"]["baseResume"] = sys.argv[2]
print(json.dumps(cfg, indent=2))
PY
echo "data" > .data-dir
if [ -f "$repo/.eval-copy" ]; then echo "$PWD/data" > "$repo/.data-dir"; fi
