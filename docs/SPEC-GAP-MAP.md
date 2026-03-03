# Spec Gap Map

Source: `/Users/jaredlikes/Downloads/agent_manager_specification.md` (v1.0, March 03, 2026)

## Status Key

- `Implemented`: Available in current repo.
- `Partial`: Present but reduced scope or different implementation.
- `Missing`: Not implemented yet.

## 1. System Architecture

- Provider-agnostic coordination model: `Implemented`
- Work queue + library + handoffs + work state: `Implemented`
- Rust CLI + Node runtime split: `Partial`
  - Rust CLI exists for read-only parity bootstrap under `rust-cli/agent-manager-rs`.
  - Node CLI remains canonical for mutating operations.

## 2. Initialization Flow (`--init`)

- Interactive/full bootstrap with install modes: `Partial`
  - Implemented `node cli.js init` with modes `embedded|standalone|submodule` and repo targeting.
  - Creates directory scaffolding, baseline skills, AGENTS.md, .gitignore updates, install-state, optional agent registration.
- Secure credential setup during init: `Partial`
  - Supports storing provided tokens via credential abstraction.
- Auto PR creation from init: `Missing`

## 3. Work Intake

- ADO + iTrack normalization: `Implemented`
- Retry/backoff/pagination: `Implemented`
- Sync-state lock + atomic writes: `Implemented`
- Credential retrieval from secure store fallback: `Implemented` (env first, store fallback)

## 4. Team Library

- Manifest-driven catalog: `Implemented`
- Agent self-service add/remove/list/show/scaffold: `Implemented`
- Validation command: `Implemented`

## 5. Handoffs

- Structured handoff states and validation: `Implemented`
- Handoff discovery (`list`): `Implemented`
- Protocol delivery semantics (push/pull notifications): `Partial`
  - Metadata captured; transport semantics not yet automated.

## 6. Work Coordination

- Assignment/checkpoint/complete/release: `Implemented`
- Path-level lock conflict handling: `Implemented`
- Queue-based assignment from intake: `Implemented`

## 7. Provider Adapters

- Claude bundle render/install: `Implemented`
- Multi-provider install parity: `Partial`
  - Core interface exists; only Claude path implemented.

## 8. Agent Registry & Onboarding

- Register/heartbeat/list: `Implemented`
- One-shot onboard command: `Implemented`
  - Registers agent, introspects system, previews library, optionally installs provider bundle.

## 9. Introspection & Help

- Describe system/commands/workflows/config: `Implemented`
- Dynamic help topics: `Implemented`

## 10. Rust Parity Roadmap

- Read-only command parity baseline: `Implemented`
- Mutating command parity: `Missing`
- Automated parity check harness: `Partial`
  - Fixture/harness script added; runs when rust binary/deps are available.

## Next Priorities

1. Implement Rust mutating commands in parity batches.
2. Add non-file credential backends (macOS/Linux/Windows secure stores).
3. Add init-time PR automation and optional git operations.
4. Add provider parity beyond Claude.
