#!/usr/bin/env bash
set -euo pipefail

echo "validate: placeholder"
echo "- profiles present: $(ls -1 profiles | wc -l | tr -d " ")"
echo "- providers present: $(ls -1 providers | wc -l | tr -d " ")"
echo "- intake mappings present: $(ls -1 intake/mappings | wc -l | tr -d " ")"
