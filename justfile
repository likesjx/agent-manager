set shell := ["bash", "-euo", "pipefail", "-c"]

default:
  @just --list

validate:
  npm run validate

test:
  npm test

library-check:
  node cli.js library check

workflow-check:
  node cli.js workflow check

provider-render provider="claude-code" output_dir=".agent-manager/providers/claude-code":
  node cli.js provider render --provider {{provider}} --output-dir {{output_dir}}

intake-sync source="all" limit="100":
  node cli.js intake sync --source {{source}} --limit {{limit}}

intake-sync-dry source="all" limit="100":
  node cli.js intake sync --source {{source}} --limit {{limit}} --dry-run

work-status:
  node cli.js work status

run +args:
  node cli.js {{args}}
