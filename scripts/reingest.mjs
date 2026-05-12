#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectFiles, ingestText, initSchema, openDb, slugify } from "./wiki-core.mjs";

const [dbPath, ...args] = process.argv.slice(2);
const filesOrDirs = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--wiki" && args[index - 1] !== "--depth" && args[index - 1] !== "--limit");
if (!dbPath || filesOrDirs.length === 0) {
  console.error("Usage: reingest.mjs <db-path> <file-or-dir> [...more] [--extract] [--reset-llm] [--depth fast|standard|deep]");
  process.exit(1);
}

const db = openDb(dbPath);
initSchema(db);
const files = collectFiles(filesOrDirs);
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const base = path.basename(file).replace(/\.(md|txt)$/i, "");
  const title = base.toUpperCase() === "README" ? path.basename(path.dirname(file)) : base;
  const result = ingestText(db, {
    title,
    sourcePath: path.relative(process.cwd(), file).replace(/\\/g, "/"),
    sourceType: /\.txt$/i.test(file) ? "text" : "markdown",
    content,
    pageType: /skill\.md$/i.test(file) ? "entity" : "source",
    tags: [slugify(base)],
  });
  console.log(`Reingested ${file} (${result.chunks} chunks)`);
}

if (args.includes("--extract")) {
  const extractArgs = [fileURLToPath(new URL("./extract-llm.mjs", import.meta.url)), dbPath];
  const depth = option(args, "--depth", null);
  const limit = option(args, "--limit", null);
  if (depth) extractArgs.push("--depth", depth);
  if (limit) extractArgs.push("--limit", limit);
  if (args.includes("--reset-llm")) extractArgs.push("--reset");
  execFileSync(process.execPath, extractArgs, { stdio: "inherit" });
}

console.log(`Done. ${files.length} file(s) reingested.`);

function option(items, name, fallback = null) {
  const index = items.indexOf(name);
  return index >= 0 ? items[index + 1] : fallback;
}
