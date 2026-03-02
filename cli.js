#!/usr/bin/env node

import { runIntakeSync } from "./intake/index.js";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }

  return { positional, flags };
}

function printHelp() {
  process.stdout.write(
    [
      "agent-manager",
      "",
      "Usage:",
      "  agent-manager intake sync --source <ado|itrack|all> [--limit <n>] [--dry-run]",
      "  agent-manager library check",
      "",
      "Examples:",
      "  agent-manager intake sync --source ado",
      "  agent-manager intake sync --source itrack --limit 50",
      "  agent-manager intake sync --source all",
      "  agent-manager library check",
      "",
      "Environment:",
      "  ADO_ORG, ADO_PROJECT, ADO_PAT",
      "  ITRACK_BASE_URL, ITRACK_TOKEN",
      ""
    ].join("\n")
  );
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    printHelp();
    return;
  }

  if (positional[0] !== "intake" || positional[1] !== "sync") {
    if (positional[0] === "library" && positional[1] === "check") {
      const child = spawn(process.execPath, ["scripts/library-check.js"], {
        stdio: "inherit"
      });
      await new Promise((resolve, reject) => {
        child.on("exit", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(`library check failed with code ${code}`));
        });
        child.on("error", reject);
      });
      return;
    }
    printHelp();
    process.exitCode = 1;
    return;
  }

  const source = flags.source || "all";
  if (!["ado", "itrack", "all"].includes(source)) {
    process.stderr.write(`Invalid --source '${source}'. Use ado, itrack, or all.\n`);
    process.exitCode = 1;
    return;
  }

  const limit = flags.limit ? Number(flags.limit) : 100;
  if (Number.isNaN(limit) || limit <= 0) {
    process.stderr.write("Invalid --limit. Use a positive integer.\n");
    process.exitCode = 1;
    return;
  }

  const dryRun = Boolean(flags["dry-run"]);
  const result = await runIntakeSync({ source, limit, dryRun });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-manager error: ${message}\n`);
  process.exit(1);
});
