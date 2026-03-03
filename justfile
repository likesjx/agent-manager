set shell := ["bash", "-euo", "pipefail", "-c"]

default:
  @just --list

validate:
  npm run validate

init mode="embedded" agent_id="codex-local" provider="claude-code" capabilities="nodejs,workflow":
  node cli.js init --mode {{mode}} --agent-id {{agent_id}} --provider {{provider}} --capabilities {{capabilities}}

test:
  npm test

library-check:
  node cli.js library check

library-list:
  node cli.js library list

workflow-check:
  node cli.js workflow check

provider-render provider="claude-code" output_dir=".agent-manager/providers/claude-code":
  node cli.js provider render --provider {{provider}} --output-dir {{output_dir}}

provider-install provider="claude-code" output_dir=".agent-manager/providers/claude-code" install_dir=".claud_project":
  node cli.js provider install --provider {{provider}} --output-dir {{output_dir}} --install-dir {{install_dir}}

intake-sync source="all" limit="100":
  node cli.js intake sync --source {{source}} --limit {{limit}}

intake-sync-dry source="all" limit="100":
  node cli.js intake sync --source {{source}} --limit {{limit}} --dry-run

work-status:
  node cli.js work status

agent-list:
  node cli.js agent list

describe-system:
  node cli.js describe system

run +args:
  node cli.js {{args}}
