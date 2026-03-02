# Agent Manager

Repo-embeddable, provider-agnostic agent operations module for:

- Onboarding
- Handoffs
- Team workflows
- Code-management governance
- Work intake normalization (ADO, iTrack)

## v1 agent clients

- GitHub Copilot
- Claude Code
- Gemini CLI / Antigravity
- Windsurf
- Cursor
- OpenCode
- AskArchitect

## Quick start

1. Install Node 20+.
2. Validate structure: `npm run validate`
3. Run intake sync:
   - `node cli.js intake sync --source ado`
   - `node cli.js intake sync --source itrack`
   - `node cli.js intake sync --source all`

## Intake env vars

### ADO

- `ADO_ORG`: Azure DevOps organization
- `ADO_PROJECT`: Azure DevOps project
- `ADO_PAT`: personal access token

### iTrack

- `ITRACK_BASE_URL`: base URL for iTrack API (example: `https://itrack.example.com`)
- `ITRACK_TOKEN`: bearer token
- Optional: `ITRACK_ISSUES_ENDPOINT` (default: `/api/issues`)

## Outputs

- `queue/work-items.latest.json`: normalized latest sync result
- `.agent-manager/sync-state.json`: per-source cursor and sync metadata
