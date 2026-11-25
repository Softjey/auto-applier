#!/bin/bash
set -euo pipefail
persona="$(cd "$(dirname "$0")/../../fixtures/persona" && pwd)"
cp -R "$persona/job-triage-data" ./job-triage-data
cp -R "$persona/auto-applier-data" ./auto-applier-data
mkdir -p ./job-triage-data/triage
