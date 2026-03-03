use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Parser)]
#[command(name = "agent-manager-rs", about = "Rust CLI for agent-manager (parity bootstrap)")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Describe {
        #[command(subcommand)]
        topic: DescribeCommand,
    },
    Library {
        #[command(subcommand)]
        command: LibraryCommand,
    },
    Handoff {
        #[command(subcommand)]
        command: HandoffCommand,
    },
    Work {
        #[command(subcommand)]
        command: WorkCommand,
    },
}

#[derive(Subcommand)]
enum DescribeCommand {
    System,
    Commands,
    Workflows,
    Config,
}

#[derive(Subcommand)]
enum LibraryCommand {
    List(LibraryListArgs),
    Show(LibraryShowArgs),
}

#[derive(Args)]
struct LibraryListArgs {
    #[arg(long)]
    kind: Option<String>,
    #[arg(long)]
    owner: Option<String>,
    #[arg(long)]
    tag: Option<String>,
}

#[derive(Args)]
struct LibraryShowArgs {
    #[arg(long)]
    id: String,
}

#[derive(Subcommand)]
enum HandoffCommand {
    List(HandoffListArgs),
}

#[derive(Args)]
struct HandoffListArgs {
    #[arg(long = "to-agent")]
    to_agent: Option<String>,
    #[arg(long)]
    status: Option<String>,
    #[arg(long = "work-item")]
    work_item: Option<String>,
}

#[derive(Subcommand)]
enum WorkCommand {
    Status,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Manifest {
    version: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ManifestEntry {
    id: String,
    kind: String,
    name: String,
    path: String,
    owner: String,
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CommandInventory {
    commands: Vec<InventoryCommand>,
}

#[derive(Debug, Deserialize, Serialize)]
struct InventoryCommand {
    id: String,
    usage: String,
    category: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct HandoffWorkItem {
    id: String,
    title: String,
    source: String,
}

#[derive(Debug, Deserialize)]
struct HandoffPayload {
    handoff_id: String,
    from_agent: String,
    to_agent: String,
    status: String,
    work_item: HandoffWorkItem,
    created_at: String,
    updated_at: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("agent-manager-rs error: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();
    let cwd = env::current_dir().context("failed to read current dir")?;

    let output = match cli.command {
        Commands::Describe { topic } => handle_describe(&cwd, topic)?,
        Commands::Library { command } => handle_library(&cwd, command)?,
        Commands::Handoff { command } => handle_handoff(&cwd, command)?,
        Commands::Work { command } => handle_work(&cwd, command)?,
    };

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

fn handle_describe(cwd: &Path, topic: DescribeCommand) -> Result<serde_json::Value> {
    Ok(match topic {
        DescribeCommand::System => {
            let version = read_package_version(cwd).unwrap_or_else(|_| "0.0.0".to_string());
            json!({
                "name": "agent-manager",
                "version": version,
                "capabilities": {
                    "intake": {"sources": ["ado", "itrack"], "operations": ["sync"]},
                    "library": {"operations": ["list", "show"]},
                    "handoff": {"operations": ["list"]},
                    "work": {"operations": ["status"]},
                    "provider": {"supported": ["claude-code"]}
                },
                "paths": {
                    "library": "library/",
                    "queue": "queue/",
                    "handoffs": "handoffs/",
                    "state": ".agent-manager/"
                }
            })
        }
        DescribeCommand::Commands => {
            let raw = fs::read_to_string(cwd.join("inventory/commands.yaml"))
                .context("failed to read inventory/commands.yaml")?;
            let parsed: CommandInventory = serde_yaml::from_str(&raw).context("invalid commands yaml")?;
            json!({ "commands": parsed.commands })
        }
        DescribeCommand::Workflows => {
            let mut workflows = Vec::new();
            let dir = cwd.join("workflows");
            if dir.exists() {
                for entry in fs::read_dir(&dir)? {
                    let path = entry?.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("yaml") {
                        continue;
                    }
                    let raw = fs::read_to_string(&path)?;
                    let value: serde_yaml::Value = serde_yaml::from_str(&raw).unwrap_or(serde_yaml::Value::Null);
                    let workflow_id = value
                        .get("workflow_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = value
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let rel = path.strip_prefix(cwd).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                    workflows.push(json!({"workflow_id": workflow_id, "name": name, "file": rel}));
                }
            }
            workflows.sort_by(|a, b| a["file"].as_str().cmp(&b["file"].as_str()));
            json!({ "workflows": workflows })
        }
        DescribeCommand::Config => {
            let ado = env::var("ADO_ORG").is_ok() && env::var("ADO_PROJECT").is_ok() && env::var("ADO_PAT").is_ok();
            let itrack = env::var("ITRACK_BASE_URL").is_ok() && env::var("ITRACK_TOKEN").is_ok();
            json!({
                "environment": {
                    "ado": {"configured": ado, "required_vars": ["ADO_ORG", "ADO_PROJECT", "ADO_PAT"]},
                    "itrack": {"configured": itrack, "required_vars": ["ITRACK_BASE_URL", "ITRACK_TOKEN"]}
                },
                "paths": {
                    "library": abs(cwd, "library"),
                    "queue": abs(cwd, "queue"),
                    "handoffs": abs(cwd, "handoffs"),
                    "state": abs(cwd, ".agent-manager")
                }
            })
        }
    })
}

fn handle_library(cwd: &Path, command: LibraryCommand) -> Result<serde_json::Value> {
    let manifest = load_manifest(cwd)?;
    Ok(match command {
        LibraryCommand::List(args) => {
            let mut entries = manifest.entries.clone();
            if let Some(kind) = args.kind {
                entries.retain(|e| e.kind == kind);
            }
            if let Some(owner) = args.owner {
                entries.retain(|e| e.owner == owner);
            }
            if let Some(tag) = args.tag {
                entries.retain(|e| e.tags.iter().any(|t| t == &tag));
            }
            json!({
                "version": manifest.version,
                "updatedAt": manifest.updated_at,
                "count": entries.len(),
                "entries": entries
            })
        }
        LibraryCommand::Show(args) => {
            let entry = manifest
                .entries
                .iter()
                .find(|e| e.id == args.id)
                .cloned()
                .with_context(|| format!("library entry not found: {}", args.id))?;
            let content = fs::read_to_string(cwd.join(&entry.path))
                .with_context(|| format!("failed to read {}", entry.path))?;
            json!({
                "id": entry.id,
                "kind": entry.kind,
                "name": entry.name,
                "path": entry.path,
                "owner": entry.owner,
                "tags": entry.tags,
                "content": content
            })
        }
    })
}

fn handle_handoff(cwd: &Path, command: HandoffCommand) -> Result<serde_json::Value> {
    Ok(match command {
        HandoffCommand::List(args) => {
            let mut rows = Vec::new();
            let dir = cwd.join("handoffs");
            if dir.exists() {
                for entry in fs::read_dir(dir)? {
                    let path = entry?.path();
                    if path.extension().and_then(|x| x.to_str()) != Some("json") {
                        continue;
                    }
                    let raw = fs::read_to_string(&path)?;
                    let parsed: HandoffPayload = match serde_json::from_str(&raw) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    if let Some(to_agent) = &args.to_agent {
                        if &parsed.to_agent != to_agent {
                            continue;
                        }
                    }
                    if let Some(status) = &args.status {
                        if &parsed.status != status {
                            continue;
                        }
                    }
                    if let Some(work_item) = &args.work_item {
                        if &parsed.work_item.id != work_item {
                            continue;
                        }
                    }
                    rows.push(json!({
                        "handoff_id": parsed.handoff_id,
                        "from_agent": parsed.from_agent,
                        "to_agent": parsed.to_agent,
                        "status": parsed.status,
                        "work_item": parsed.work_item,
                        "created_at": parsed.created_at,
                        "updated_at": parsed.updated_at,
                        "file": path.to_string_lossy().to_string()
                    }));
                }
            }
            rows.sort_by(|a, b| b["created_at"].as_str().cmp(&a["created_at"].as_str()));
            json!(rows)
        }
    })
}

fn handle_work(cwd: &Path, command: WorkCommand) -> Result<serde_json::Value> {
    Ok(match command {
        WorkCommand::Status => {
            let path = cwd.join(".agent-manager/work-state.json");
            if !path.exists() {
                json!({ "version": 1, "active_assignments": [], "completed_assignments": [] })
            } else {
                let raw = fs::read_to_string(path)?;
                let value: serde_json::Value = serde_json::from_str(&raw)?;
                value
            }
        }
    })
}

fn load_manifest(cwd: &Path) -> Result<Manifest> {
    let path = cwd.join("library/manifests/team-library.json");
    let raw = fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    let parsed = serde_json::from_str(&raw).context("invalid team library manifest")?;
    Ok(parsed)
}

fn read_package_version(cwd: &Path) -> Result<String> {
    let raw = fs::read_to_string(cwd.join("package.json"))?;
    let value: serde_json::Value = serde_json::from_str(&raw)?;
    Ok(value["version"].as_str().unwrap_or("0.0.0").to_string())
}

fn abs(cwd: &Path, rel: &str) -> String {
    let p: PathBuf = cwd.join(rel);
    p.to_string_lossy().to_string()
}
