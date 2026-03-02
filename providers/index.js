import { renderClaudeBundle } from "./claude-code/adapter.js";

export async function renderProviderBundle(flags) {
  const provider = String(flags.provider || "claude-code").trim();
  const outputDir = flags["output-dir"] ? String(flags["output-dir"]).trim() : undefined;

  if (provider === "claude-code") {
    return renderClaudeBundle({ outputDir });
  }

  throw new Error(`provider render not implemented for '${provider}'`);
}
