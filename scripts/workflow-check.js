#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_TOP_LEVEL = [
  "workflow_id:",
  "name:",
  "description:",
  "required_steps:",
  "artifacts:",
  "role_policy:",
  "automation_hooks:"
];

const WORKFLOWS = [
  "workflows/handoff.yaml",
  "workflows/code-management.yaml",
  "workflows/teamwork.yaml",
  "workflows/onboarding.yaml"
];

function hasIndentedKey(raw, key) {
  const pattern = new RegExp(`^\\s{2,}${key}:`, "m");
  return pattern.test(raw);
}

function countStepIds(raw) {
  return (raw.match(/^\s{2}- id:/gm) || []).length;
}

async function validateWorkflow(file) {
  const absolute = path.resolve(process.cwd(), file);
  const raw = await readFile(absolute, "utf8");
  const issues = [];

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!raw.includes(key)) {
      issues.push(`missing top-level key ${key}`);
    }
  }

  const stepCount = countStepIds(raw);
  if (stepCount === 0) {
    issues.push("required_steps must declare at least one step");
  }

  if (!hasIndentedKey(raw, "name") || !hasIndentedKey(raw, "command") || !hasIndentedKey(raw, "outputs")) {
    issues.push("each workflow step should include name, command, and outputs");
  }

  return { file, ok: issues.length === 0, issues, stepCount };
}

async function main() {
  const results = await Promise.all(WORKFLOWS.map((file) => validateWorkflow(file)));
  const failed = results.filter((result) => !result.ok);

  if (failed.length) {
    for (const result of failed) {
      process.stderr.write(`workflow-check: ${result.file} failed\n`);
      for (const issue of result.issues) {
        process.stderr.write(`  - ${issue}\n`);
      }
    }
    process.exit(1);
  }

  const totalSteps = results.reduce((sum, result) => sum + result.stepCount, 0);
  process.stdout.write(`workflow-check: ok (${results.length} workflows, ${totalSteps} steps)\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`workflow-check error: ${message}\n`);
  process.exit(1);
});
