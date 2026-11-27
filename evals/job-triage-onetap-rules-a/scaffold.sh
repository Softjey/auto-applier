#!/bin/bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
persona="$repo/fixtures/persona"
cp -R "$persona/job-triage-data" ./data
cp "$persona/auto-applier-data/profile.json" ./data/profile.json
mkdir -p ./data/triage
if [ -f "$repo/.eval-copy" ]; then ln -sfn "$PWD/data" "$repo/data"; fi
