export const TEMPLATES = {
  skill: `# {{name}}\n\n## Purpose\n{{purpose}}\n\n## When to Use\n{{when_to_use}}\n\n## Instructions\n{{instructions}}\n\n## Examples\n{{examples}}\n`,
  hook: `# {{name}}\n\nTrigger: {{trigger}}\n\nActions:\n{{actions}}\n`,
  plugin: `# {{name}}\n\n## Integration\n{{integration}}\n\n## Configuration\n{{configuration}}\n\n## Usage\n{{usage}}\n`,
  prompt: `# {{name}}\n\n## Context\n{{context}}\n\n## Template\n\n\`\`\`\n{{template}}\n\`\`\`\n\n## Variables\n{{variables}}\n`,
  agent: `# {{name}}\n\nPurpose: {{purpose}}\n\nResponsibilities:\n{{responsibilities}}\n`,
  tool: `# {{name}}\n\n## Function\n{{function}}\n\n## Input\n{{input}}\n\n## Output\n{{output}}\n\n## Usage\n{{usage}}\n`
};

export function scaffoldLibraryEntry(flags) {
  const kind = String(flags.kind || "").trim();
  const name = String(flags.name || "").trim();

  if (!kind || !TEMPLATES[kind]) {
    throw new Error(`Invalid kind. Must be one of: ${Object.keys(TEMPLATES).join(", ")}`);
  }
  if (!name) {
    throw new Error("library scaffold requires --name");
  }

  let content = TEMPLATES[kind].replaceAll("{{name}}", name);
  const placeholders = [...new Set((content.match(/\{\{([^}]+)\}\}/g) || []))];

  for (const token of placeholders) {
    const key = token.replace(/\{|\}/g, "");
    const value = flags[key] ? String(flags[key]) : `[TODO: ${key}]`;
    content = content.replaceAll(token, value);
  }

  return {
    kind,
    name,
    content,
    next_steps: [
      "Review and edit generated content.",
      `Save and run: node cli.js library add --kind ${kind} --name \"${name}\" --file <file> --owner <agent-id> --tags <csv>`
    ]
  };
}
