#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const FIXTURE_PATH = path.resolve(process.cwd(), "scripts/fixtures/rust-parity-commands.json");
const NODE_CLI = path.resolve(process.cwd(), "cli.js");
const RUST_MANIFEST = path.resolve(process.cwd(), "rust-cli/agent-manager-rs/Cargo.toml");

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: String(error) }));
  });
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const out = {};
    for (const key of keys) {
      if (key === "file") {
        out[key] = "<normalized-file-path>";
      } else {
        out[key] = normalize(value[key]);
      }
    }
    return out;
  }
  return value;
}

function parseJson(label, raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

async function main() {
  const raw = await readFile(FIXTURE_PATH, "utf8");
  const cases = JSON.parse(raw);

  const rustProbe = await run("cargo", ["run", "--quiet", "--manifest-path", RUST_MANIFEST, "--", "describe", "system"]);
  if (rustProbe.code !== 0) {
    process.stdout.write("rust-parity: skipped (rust toolchain/deps unavailable in this environment)\n");
    return;
  }

  for (const c of cases) {
    const node = await run(process.execPath, [NODE_CLI, ...c.node]);
    if (node.code !== 0) {
      throw new Error(`node command failed for case '${c.name}': ${node.stderr}`);
    }

    const rust = await run("cargo", ["run", "--quiet", "--manifest-path", RUST_MANIFEST, "--", ...c.rust]);
    if (rust.code !== 0) {
      throw new Error(`rust command failed for case '${c.name}': ${rust.stderr}`);
    }

    const nodeJson = normalize(parseJson(`node ${c.name}`, node.stdout));
    const rustJson = normalize(parseJson(`rust ${c.name}`, rust.stdout));

    const left = JSON.stringify(nodeJson);
    const right = JSON.stringify(rustJson);
    if (left !== right) {
      throw new Error(`parity mismatch for '${c.name}'`);
    }
  }

  process.stdout.write(`rust-parity: ok (${cases.length} cases)\n`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`rust-parity: ${msg}\n`);
  process.exit(1);
});
