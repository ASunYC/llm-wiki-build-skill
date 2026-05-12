#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();

const SCRIPT_BY_COMMAND = {
  init: "init-wiki.mjs",
  ingest: "ingest-docs.mjs",
  extract: "extract-llm.mjs",
  graph: "build-graph.mjs",
  query: "query-wiki.mjs",
  lint: "lint-wiki.mjs",
  reingest: "reingest.mjs",
  status: "llm-status.mjs",
  "llm-status": "llm-status.mjs",
  test: "test-llm.mjs",
  "test-llm": "test-llm.mjs",
};

const argv = process.argv.slice(2);
let [commandRaw, ...rawArgs] = argv;
let command = normalizeCommand(commandRaw);

if (!command && rawArgs.length > 0) {
  commandRaw = rawArgs.shift();
  command = normalizeCommand(commandRaw);
}

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const script = SCRIPT_BY_COMMAND[command];
if (!script) {
  console.error(`Unknown llm-wiki command: ${commandRaw}`);
  printHelp();
  process.exit(1);
}

const args = withFriendlyDefaults(command, rawArgs);
const result = spawnSync(process.execPath, [path.join(here, script), ...args], {
  cwd,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);

function normalizeCommand(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\/?llm-wiki[:\s-]*/, "")
    .replace(/^wiki[:\s-]*/, "");
}

function withFriendlyDefaults(command, args) {
  const db = defaultDbPath();
  if (command === "status" || command === "llm-status" || command === "test" || command === "test-llm") return args;
  if (args.length > 0) {
    return isLikelyDbArg(args[0]) ? args : [db, ...args];
  }
  if (command === "init") return [db, "--name", path.basename(cwd) || "Project Wiki"];
  if (command === "ingest") return [db, ...defaultInputs()];
  if (command === "extract") return [db, "--depth", "standard"];
  if (command === "graph") return [db, "--out", path.join("data", "wiki-graph.json")];
  if (command === "query") return [db, "agent"];
  if (command === "lint") return [db];
  if (command === "reingest") return [db, ...defaultInputs(), "--extract"];
  return args;
}

function isLikelyDbArg(value) {
  const arg = String(value || "");
  if (!arg || arg.startsWith("-")) return false;
  return /\.(db|sqlite|sqlite3)$/i.test(arg) || /[\\/]wiki\.(db|sqlite|sqlite3)$/i.test(arg);
}

function defaultDbPath() {
  return path.join("data", "wiki.db");
}

function defaultInputs() {
  const inputs = [];
  if (fs.existsSync(path.join(cwd, "README.md"))) inputs.push("README.md");
  if (fs.existsSync(path.join(cwd, "docs"))) inputs.push("docs");
  if (fs.existsSync(path.join(cwd, "SKILL.md"))) inputs.push("SKILL.md");
  return inputs.length ? inputs : ["."];
}

function printHelp() {
  console.log(`
LLM Wiki command wrapper

Usage:
  llm-wiki <command> [args]

Commands:
  init [db] [--name <name>]                 Initialize SQLite wiki DB
  ingest [db] <file-or-dir...>              Import Markdown/TXT/README/SKILL.md files
  extract [db] [--depth fast|standard|deep] Run LLM entity/topic/relation extraction
  graph [db] [--out graph.json]             Export knowledge graph JSON
  query [db] <query> [--limit N]            Search wiki pages/chunks/entities/topics
  lint [db]                                 Check wiki health and evidence coverage
  reingest [db] <file-or-dir...> [--extract] Reimport sources, optionally rerun extraction
  status                                    Show masked LLM config
  test                                      Test LLM connection

Friendly defaults:
  /llm-wiki init
  /llm-wiki ingest
  /llm-wiki extract
  /llm-wiki graph
  /llm-wiki lint

Default DB: ./data/wiki.db
Default ingest inputs: README.md, docs, SKILL.md when present.
`);
}
