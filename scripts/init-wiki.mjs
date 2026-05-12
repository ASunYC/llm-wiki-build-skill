#!/usr/bin/env node
import { initSchema, ensureWiki, openDb } from "./wiki-core.mjs";

const [dbPath, ...args] = process.argv.slice(2);
if (!dbPath) {
  console.error("Usage: init-wiki.mjs <db-path> [--name <name>] [--description <description>]");
  process.exit(1);
}
const name = args[args.indexOf("--name") + 1] || "LLM Wiki";
const description = args[args.indexOf("--description") + 1] || "";
const db = openDb(dbPath);
initSchema(db);
ensureWiki(db, { name, description });
console.log(`Initialized wiki database: ${dbPath}`);
