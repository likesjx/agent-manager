# CLI Maintainer

Use this skill when changing command behavior, output shape, or state files in `agent-manager`.

## Goals

- Keep Node CLI and Rust CLI behavior aligned during migration.
- Preserve JSON output contracts for automation callers.
- Keep read-only parity first, then port write paths.

## Workflow

1. Confirm command contract in `inventory/commands.yaml`.
2. Implement in Node CLI first if behavior is new.
3. Port to Rust CLI (`rust-cli/agent-manager-rs`) for parity.
4. Validate both CLIs against the same fixtures.
5. Update docs and examples in `README.md`.

## Guardrails

- Do not silently change JSON keys or status enums.
- If output changes are required, document migration notes.
- Keep file writes atomic and lock-protected.
- Prefer additive changes over breaking changes.

## Rust Migration Order

1. `describe` commands
2. `library list/show`
3. `handoff list`
4. `work status`
5. Mutating commands (`library add/remove`, `work assign`, `handoff start`, etc.)
