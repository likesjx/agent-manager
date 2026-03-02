#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but not found" >&2
  exit 1
fi

echo "validate: structural checks"
echo "- profiles present: $(find profiles -maxdepth 1 -type f | wc -l | tr -d " ")"
echo "- providers present: $(find providers -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d " ")"
echo "- intake mappings present: $(find intake/mappings -maxdepth 1 -type f | wc -l | tr -d " ")"

node cli.js --help >/dev/null
echo "- cli help: ok"
