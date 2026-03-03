import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInit } from "../init/index.js";

async function withTempRepo(fn) {
  const prev = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-manager-init-"));
  process.chdir(dir);
  try {
    await mkdir(".git", { recursive: true });
    await fn(dir);
  } finally {
    process.chdir(prev);
  }
}

test("init embedded mode creates .agent-manager root and runtime state", async () => {
  await withTempRepo(async (repo) => {
    const result = await runInit({ mode: "embedded", "agent-id": "codex-a", provider: "claude-code", capabilities: "nodejs" });
    assert.equal(result.mode, "embedded");

    const install = JSON.parse(await readFile(path.join(repo, ".agent-manager", "install-state.json"), "utf8"));
    assert.equal(install.mode, "embedded");

    const agents = JSON.parse(await readFile(path.join(repo, ".agent-manager", "agent-registry.json"), "utf8"));
    assert.equal(agents.agents.length, 1);

    const agentsDoc = await readFile(path.join(repo, "AGENTS.md"), "utf8");
    assert.match(agentsDoc, /coordination root/);
  });
});

test("init standalone mode creates agent-manager directory", async () => {
  await withTempRepo(async (repo) => {
    const result = await runInit({ mode: "standalone" });
    assert.equal(result.mode, "standalone");

    const manifest = JSON.parse(
      await readFile(path.join(repo, "agent-manager", "library", "manifests", "team-library.json"), "utf8")
    );
    assert.equal(Array.isArray(manifest.entries), true);
  });
});

test("init submodule mode writes submodule note and stores credentials", async () => {
  await withTempRepo(async (repo) => {
    const result = await runInit({ mode: "submodule", ado_pat: "secret-ado", itrack_token: "secret-itrack" });
    assert.equal(result.mode, "submodule");

    const note = await readFile(path.join(repo, ".agent-manager.SUBMODULE.md"), "utf8");
    assert.match(note, /git submodule add/);

    const creds = JSON.parse(await readFile(path.join(repo, ".agent-manager", "credentials.json"), "utf8"));
    assert.equal(Boolean(creds.values.ado_pat), true);
    assert.equal(Boolean(creds.values.itrack_token), true);
  });
});
