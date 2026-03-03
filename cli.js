#!/usr/bin/env node

import { spawn } from "node:child_process";
import { runIntakeSync } from "./intake/index.js";
import { runInit } from "./init/index.js";
import {
  addToLibrary,
  listLibrary,
  removeFromLibrary,
  scaffoldLibraryEntry,
  showLibraryEntry
} from "./library/contribute.js";
import {
  createHandoff,
  listHandoffs,
  rollbackHandoff,
  resumeHandoff,
  validateHandoffFile
} from "./handoffs/index.js";
import {
  assignWork,
  assignWorkFromQueue,
  checkpointWork,
  completeWork,
  releaseWork,
  statusWork
} from "./state/work-state.js";
import { installProviderBundle, renderProviderBundle } from "./providers/index.js";
import { describeCommands, describeSystem, describeWorkflows, getConfig } from "./runtime/introspect.js";
import { generateHelp } from "./runtime/help.js";
import { heartbeatAgent, listAgents, onboardAgent, registerAgent } from "./profiles/registry.js";

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
      "  agent-manager init [--repo <path>] [--mode <embedded|standalone|submodule>]",
      "  agent-manager library <check|add|remove|list|show|scaffold> [flags]",
      "  agent-manager handoff <start|validate|resume|rollback|list> [flags]",
      "  agent-manager work <assign|checkpoint|complete|release|status> [flags]",
      "  agent-manager provider <render|install> --provider <name> [flags]",
      "  agent-manager workflow check",
      "  agent-manager describe <system|commands|workflows|config>",
      "  agent-manager agent <register|heartbeat|list|onboard> [flags]",
      "  agent-manager help [topic]",
      "",
      "Examples:",
      "  agent-manager library add --kind skill --name 'Retry Pattern' --owner codex --content '# Retry Pattern'",
      "  agent-manager init --mode embedded --agent-id codex-1 --provider claude-code --capabilities nodejs,workflow",
      "  agent-manager handoff list --to-agent architect --status validated",
      "  agent-manager work assign --from-queue --agent codex --priority 1",
      "  agent-manager provider install --provider claude-code",
      "  agent-manager agent onboard --id codex-1 --provider claude-code --capabilities nodejs,workflow",
      "  agent-manager describe system",
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
  if (!["ado", "itrack", "all"].includes(source)) {
    throw new Error(`Invalid --source '${source}'. Use ado, itrack, or all.`);
  }

  const limit = flags.limit ? Number(flags.limit) : 100;
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error("Invalid --limit. Use a positive integer.");
  }

  const dryRun = Boolean(flags["dry-run"]);
  return runIntakeSync({ source, limit, dryRun });
}

async function handleLibrary(positional, flags) {
  const action = positional[1];

  if (action === "check") {
    await runNodeScript("scripts/library-check.js");
    return null;
  }
  if (action === "add") {
    return addToLibrary(flags);
  }
  if (action === "remove") {
    return removeFromLibrary(flags);
  }
  if (action === "list") {
    return listLibrary(flags);
  }
  if (action === "show") {
    return showLibraryEntry(flags);
  }
  if (action === "scaffold") {
    return scaffoldLibraryEntry(flags);
  }

  throw new Error("library supports check, add, remove, list, show, scaffold");
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

  if (action === "list") {
    return listHandoffs({
      toAgent: flags["to-agent"] ? String(flags["to-agent"]) : "",
      status: flags.status ? String(flags.status) : "",
      workItem: flags["work-item"] ? String(flags["work-item"]) : ""
    });
  }

  throw new Error("handoff supports start, validate, resume, rollback, list");
}

async function handleWork(positional, flags) {
  const action = positional[1];

  if (action === "assign") {
    if (flags["from-queue"]) {
      return assignWorkFromQueue(flags);
    }
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

async function handleDescribe(positional) {
  const topic = positional[1];
  if (topic === "system") {
    return describeSystem();
  }
  if (topic === "commands") {
    return describeCommands();
  }
  if (topic === "workflows") {
    return describeWorkflows();
  }
  if (topic === "config") {
    return getConfig();
  }
  throw new Error("describe supports system, commands, workflows, config");
}

async function handleAgent(positional, flags) {
  const action = positional[1];
  if (action === "register") {
    return registerAgent(flags);
  }
  if (action === "heartbeat") {
    return heartbeatAgent(flags);
  }
  if (action === "list") {
    return listAgents(flags);
  }
  if (action === "onboard") {
    return onboardAgent(flags, {
      describeSystem,
      listLibrary,
      installProviderBundle
    });
  }

  throw new Error("agent supports register, heartbeat, list, onboard");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h || positional.length === 0) {
    printHelp();
    return;
  }

  let result = null;

  if (positional[0] === "init") {
    result = await runInit(flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  if (positional[0] === "provider" && positional[1] === "install") {
    result = await installProviderBundle(flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "intake") {
    result = await handleIntake(positional, flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "library") {
    result = await handleLibrary(positional, flags);
    if (result) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
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

  if (positional[0] === "describe") {
    result = await handleDescribe(positional);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "agent") {
    result = await handleAgent(positional, flags);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (positional[0] === "help") {
    result = generateHelp(positional[1]);
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
