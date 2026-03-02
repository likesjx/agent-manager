#!/usr/bin/env node

import { spawn } from "node:child_process";
import { runIntakeSync } from "./intake/index.js";
import {
  createHandoff,
  rollbackHandoff,
  resumeHandoff,
  validateHandoffFile
} from "./handoffs/index.js";
import {
  assignWork,
  checkpointWork,
  completeWork,
  releaseWork,
  statusWork
} from "./state/work-state.js";
import { renderProviderBundle } from "./providers/index.js";

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
      "  agent-manager handoff <start|validate|resume|rollback> [flags]",
      "  agent-manager work <assign|checkpoint|complete|release|status> [flags]",
      "  agent-manager provider render --provider <name> [--output-dir <dir>]",
      "  agent-manager workflow check",
      "",
      "Examples:",
      "  agent-manager handoff start --from codex --to architect --work-item W-101 --title 'Add retries' --goal 'Improve intake reliability' --context-summary 'adapter changes complete' --decisions 'added retry helper' --risks 'env vars required' --open-loops 'add fixture tests' --next-commands 'npm run validate,node cli.js workflow check' --files-touched 'intake/adapters/http.js' --notes 'ready for review'",
      "  agent-manager handoff validate --file handoffs/handoff-*.json",
      "  agent-manager work assign --work-item W-101 --agent codex --paths intake/adapters/http.js,cli.js",
      "  agent-manager work checkpoint --assignment assign-... --label adapter-pass --note 'ado and itrack updated'",
      "  agent-manager work complete --assignment assign-... --result 'merged retry logic'",
      "  agent-manager provider render --provider claude-code",
      "  agent-manager workflow check",
      "",
      "Environment:",
      "  Intake: ADO_ORG, ADO_PROJECT, ADO_PAT, ITRACK_BASE_URL, ITRACK_TOKEN",
      ""
    ].join("\n")
  );
}

async function runNodeScript(scriptPath) {
  const child = spawn(process.execPath, [scriptPath], {
    stdio: "inherit"
  });
  await new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function handleIntake(positional, flags) {
  if (positional[1] !== "sync") {
    throw new Error("intake supports only 'sync'");
  }

  const source = flags.source || "all";
  if (![
    "ado",
    "itrack",
    "all"
  ].includes(source)) {
    throw new Error(`Invalid --source '${source}'. Use ado, itrack, or all.`);
  }

  const limit = flags.limit ? Number(flags.limit) : 100;
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error("Invalid --limit. Use a positive integer.");
  }

  const dryRun = Boolean(flags["dry-run"]);
  return runIntakeSync({ source, limit, dryRun });
}

async function handleHandoff(positional, flags) {
  const action = positional[1];

  if (action === "start") {
    return createHandoff(flags);
  }

  if (action === "validate") {
    if (!flags.file) {
      throw new Error("handoff validate requires --file");
    }
    return validateHandoffFile(String(flags.file));
  }

  if (action === "resume") {
    if (!flags.file || !flags.agent) {
      throw new Error("handoff resume requires --file and --agent");
    }
    return resumeHandoff(String(flags.file), String(flags.agent), String(flags.notes || ""));
  }

  if (action === "rollback") {
    if (!flags.file || !flags.agent) {
      throw new Error("handoff rollback requires --file and --agent");
    }
    return rollbackHandoff(String(flags.file), String(flags.agent), String(flags.reason || ""));
  }

  throw new Error("handoff supports start, validate, resume, rollback");
}

async function handleWork(positional, flags) {
  const action = positional[1];

  if (action === "assign") {
    return assignWork(flags);
  }
  if (action === "checkpoint") {
    return checkpointWork(flags);
  }
  if (action === "complete") {
    return completeWork(flags);
  }
  if (action === "release") {
    return releaseWork(flags);
  }
  if (action === "status") {
    return statusWork();
  }

  throw new Error("work supports assign, checkpoint, complete, release, status");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h || positional.length === 0) {
    printHelp();
    return;
  }

  let result = null;

  if (positional[0] === "library" && positional[1] === "check") {
    await runNodeScript("scripts/library-check.js");
    return;
  }

  if (positional[0] === "workflow" && positional[1] === "check") {
    await runNodeScript("scripts/workflow-check.js");
    return;
  }

  if (positional[0] === "provider" && positional[1] === "render") {
    result = await renderProviderBundle(flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "intake") {
    result = await handleIntake(positional, flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "handoff") {
    result = await handleHandoff(positional, flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "work") {
    result = await handleWork(positional, flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-manager error: ${message}\n`);
  process.exit(1);
});
