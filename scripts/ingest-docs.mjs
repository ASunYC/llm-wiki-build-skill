#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { collectFiles, ingestText, initSchema, openDb, slugify } from "./wiki-core.mjs";

const [dbPath, ...inputs] = process.argv.slice(2);
if (!dbPath || inputs.length === 0) {
  console.error("Usage: ingest-docs.mjs <db-path> <file-or-dir> [...more]");
  process.exit(1);
}
const db = openDb(dbPath);
initSchema(db);
const files = collectFiles(inputs);
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
  console.log(`Ingested ${file} (${result.chunks} chunks)`);
}
console.log(`Done. ${files.length} file(s) ingested.`);
