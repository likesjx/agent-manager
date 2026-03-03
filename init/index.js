import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson, nowIso } from "../runtime/json-store.js";
import { storeCredential } from "../runtime/credentials/index.js";
import { registerAgent } from "../profiles/registry.js";

const INSTALL_MODES = ["embedded", "standalone", "submodule"];

function resolveRepo(flags) {
  const raw = flags.repo ? String(flags.repo) : process.cwd();
  return path.resolve(raw);
}

async function validatePreflight(repoPath) {
  await access(repoPath).catch(() => {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  });
  await access(path.join(repoPath, ".git")).catch(() => {
    throw new Error(`Not a git repository: ${repoPath}`);
  });
}

function managerRoot(repoPath, mode) {
  if (mode === "standalone") {
    return path.join(repoPath, "agent-manager");
  }
  return path.join(repoPath, ".agent-manager");
}

function rel(p, base) {
  const value = path.relative(base, p).replaceAll("\\", "/");
  return value || ".";
}

async function ensureDirStructure(root) {
  const dirs = [
    "library/agents",
    "library/hooks",
    "library/skills",
    "library/plugins",
    "library/prompts",
    "library/tools",
    "library/manifests",
    "queue",
    "handoffs",
    "workflows",
    ".agent-manager"
  ];

  for (const dir of dirs) {
    await mkdir(path.join(root, dir), { recursive: true });
  }
}

async function ensureFile(filePath, content) {
  const existing = await readFile(filePath, "utf8").catch(() => null);
  if (existing === null) {
    await writeFile(filePath, content, "utf8");
  }
}

async function ensureManifest(root) {
  const file = path.join(root, "library/manifests/team-library.json");
  const current = await readJson(file, null);
  if (current && Array.isArray(current.entries)) {
    return;
  }
  await writeJson(file, {
    version: "1.0.0",
    updatedAt: nowIso().slice(0, 10),
    entries: []
  });
}

async function ensureBootstrapSkills(root) {
  const skills = [
    ["agent-onboarding.md", "# Agent Onboarding\n\nHow to start using agent-manager in this repository.\n"],
    ["error-handling.md", "# Error Handling\n\nTeam standards for safe error handling and retries.\n"],
    ["testing-standards.md", "# Testing Standards\n\nCoverage and validation expectations for all changes.\n"],
    ["code-review.md", "# Code Review\n\nChecklist for reviewing agent-generated changes.\n"],
    ["security-practices.md", "# Security Practices\n\nSecurity requirements for dependencies and credentials.\n"],
    ["handoff-protocol.md", "# Handoff Protocol\n\nRequired fields for work transfer between agents.\n"]
  ];

  for (const [name, content] of skills) {
    await ensureFile(path.join(root, "library/skills", name), content);
  }
}

async function ensureAgentsDoc(repoPath, managerRelativePath) {
  const doc = path.join(repoPath, "AGENTS.md");
  const cliPath = managerRelativePath === "." ? "cli.js" : `${managerRelativePath}/cli.js`;
  const content = [
    "# Agent Instructions",
    "",
    `Use \`${managerRelativePath}\` as the coordination root for agent workflows.`,
    "",
    "## Daily Start",
    "",
    `- node ${cliPath} describe system`,
    `- node ${cliPath} work status`,
    "",
    "## Validation",
    "",
    "- npm run validate",
    ""
  ].join("\n");
  await ensureFile(
    doc,
    content
  );
}

async function appendGitignore(repoPath, mode, managerRelativePath) {
  const file = path.join(repoPath, ".gitignore");
  const current = await readFile(file, "utf8").catch(() => "");
  const additions = [];

  const runtimeStatePath = mode === "standalone" ? "agent-manager/.agent-manager/" : ".agent-manager/.agent-manager/";
  if (!current.includes(runtimeStatePath)) {
    additions.push(runtimeStatePath);
  }
  if (!current.includes(".agent-manager/credentials.json")) {
    additions.push(".agent-manager/credentials.json");
  }

  if (additions.length > 0) {
    const suffix = `${current.endsWith("\n") || current.length === 0 ? "" : "\n"}${additions.join("\n")}\n`;
    await writeFile(file, `${current}${suffix}`, "utf8");
  }

  if (mode === "submodule") {
    const notePath = path.join(repoPath, `${managerRelativePath}.SUBMODULE.md`);
    await ensureFile(
      notePath,
      "# Submodule Install Note\n\nRun:\n\n```bash\ngit submodule add https://github.com/likesjx/agent-manager.git .agent-manager\n```\n\nThis initializer created local scaffolding and runtime config, but network/submodule add may still be required.\n"
    );
  }
}

async function writeInstallState(repoPath, mode, managerPath) {
  const statePath = path.join(repoPath, ".agent-manager", "install-state.json");
  await writeJson(statePath, {
    installedAt: nowIso(),
    mode,
    managerPath,
    initializedBy: "agent-manager init"
  });
}

function validateMode(mode) {
  if (!INSTALL_MODES.includes(mode)) {
    throw new Error(`Invalid --mode '${mode}'. Use: ${INSTALL_MODES.join(", ")}`);
  }
}

export async function runInit(flags) {
  const repoPath = resolveRepo(flags);
  const mode = String(flags.mode || "submodule").trim();
  validateMode(mode);
  await validatePreflight(repoPath);

  const root = managerRoot(repoPath, mode);
  await ensureDirStructure(root);
  await ensureManifest(root);
  await ensureBootstrapSkills(root);

  const managerRelativePath = rel(root, repoPath);
  await ensureAgentsDoc(repoPath, managerRelativePath);
  await appendGitignore(repoPath, mode, managerRelativePath);
  await writeInstallState(repoPath, mode, root);

  const storedCredentials = [];
  if (flags.ado_pat) {
    await storeCredential(repoPath, "ado_pat", String(flags.ado_pat));
    storedCredentials.push("ado_pat");
  }
  if (flags.itrack_token) {
    await storeCredential(repoPath, "itrack_token", String(flags.itrack_token));
    storedCredentials.push("itrack_token");
  }

  if (flags["agent-id"] && flags.provider) {
    await registerAgent(
      {
        id: String(flags["agent-id"]),
        name: String(flags["agent-name"] || flags["agent-id"]),
        provider: String(flags.provider),
        capabilities: String(flags.capabilities || "")
      },
      { rootDir: repoPath }
    );
  }

  return {
    initialized: true,
    repo: repoPath,
    mode,
    managerPath: root,
    managerRelativePath,
    storedCredentials,
    next: [
      `node ${managerRelativePath === "." ? "cli.js" : `${managerRelativePath}/cli.js`} describe system`,
      `node ${managerRelativePath === "." ? "cli.js" : `${managerRelativePath}/cli.js`} library check`,
      "npm run validate"
    ]
  };
}
