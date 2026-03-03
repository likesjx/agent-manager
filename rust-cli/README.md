# Rust CLI Bootstrap

This folder contains the parallel Rust implementation of agent-manager.

## Current Scope

Read-only parity commands:

- `describe system|commands|workflows|config`
- `library list|show`
- `handoff list`
- `work status`

## Run

```bash
cargo run --manifest-path rust-cli/agent-manager-rs/Cargo.toml -- describe system
cargo run --manifest-path rust-cli/agent-manager-rs/Cargo.toml -- library list --kind skill
```

## Migration Strategy

1. Keep Node CLI as canonical behavior.
2. Port stable read-only commands first.
3. Port mutating commands with fixture parity tests.
4. Flip default once parity is complete.
