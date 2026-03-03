# Agent Manager Lifecycle

Use this skill when an agent needs to onboard, operate, extend, and release `agent-manager` safely.

## 1) Bootstrap (first session)

Run in order:

```bash
node cli.js describe system
node cli.js describe commands
node cli.js describe workflows
node cli.js describe config
node cli.js library check
node cli.js workflow check
npm run validate
```

Register and onboard self:

```bash
node cli.js agent register --id <agent-id> --provider <provider> --capabilities <csv>
node cli.js agent onboard --id <agent-id> --provider <provider> --capabilities <csv>
```

## 2) Daily operation loop

1. Sync intake:

```bash
node cli.js intake sync --source all
```

2. Pick up work:

```bash
node cli.js work assign --from-queue --agent <agent-id>
node cli.js work status
```

3. Checkpoint progress:

```bash
node cli.js work checkpoint --assignment <assignment-id> --label <label> --note <note>
```

4. Complete or release:

```bash
node cli.js work complete --assignment <assignment-id> --result <summary>
# or
node cli.js work release --assignment <assignment-id> --reason <reason>
```

5. Handoff when needed:

```bash
node cli.js handoff start --from <agent-id> --to <agent-id> --work-item <id> --title <title> --goal <goal> --context-summary <summary> --decisions <csv> --risks <csv> --open-loops <csv> --next-commands <csv> --files-touched <csv> --notes <notes>
node cli.js handoff validate --file <handoff-file>
node cli.js handoff list --to-agent <receiver> --status validated
```

## 3) Contribute capabilities (self-service)

Create from template:

```bash
node cli.js library scaffold --kind skill --name "<Name>" > new-skill.md
```

Publish:

```bash
node cli.js library add --kind skill --name "<Name>" --owner <agent-id> --file new-skill.md --tags <csv>
node cli.js library list --kind skill
node cli.js library show --id skill.<slug>
node cli.js library check
```

## 4) Update CLI behavior safely

When changing command behavior:

1. Update Node implementation (`cli.js` + module).
2. Update `inventory/commands.yaml`.
3. Update `README.md` examples.
4. Add/adjust tests.
5. Run:

```bash
npm test
npm run validate
```

## 5) Rust migration lifecycle (parallel path)

Read-only parity first in `rust-cli/agent-manager-rs`:

- `describe system|commands|workflows|config`
- `library list|show`
- `handoff list`
- `work status`

Then port mutating commands in small batches with fixture parity against Node CLI.

## 6) Release/handoff checklist

Before ending a session:

1. `npm run validate` is green.
2. Command inventory and docs are aligned with code.
3. State and handoff artifacts are intentional (no accidental generated files).
4. Handoff includes exact next commands and open loops.

## Guardrails

- Keep JSON output contracts stable.
- Use atomic writes and lock files for shared state.
- Prefer additive changes; document breaking changes explicitly.
