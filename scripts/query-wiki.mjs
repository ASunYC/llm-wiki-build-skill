#!/usr/bin/env node
import { initSchema, openDb } from "./wiki-core.mjs";

const [dbPath, ...queryParts] = process.argv.slice(2);
const query = queryParts.join(" ").trim();
if (!dbPath || !query) {
  console.error("Usage: query-wiki.mjs <db-path> <query>");
  process.exit(1);
}
const db = openDb(dbPath);
initSchema(db);
const q = `%${query.toLowerCase()}%`;
const rows = db.prepare(`
SELECT p.title, p.page_type, p.path, substr(p.content, 1, 360) AS snippet
FROM pages p
WHERE lower(p.title) LIKE ? OR lower(p.content) LIKE ? OR lower(p.tags) LIKE ?
ORDER BY CASE WHEN lower(p.title) LIKE ? THEN 0 ELSE 1 END, p.updated_at DESC
LIMIT 20
`).all(q, q, q, q);
for (const [index, row] of rows.entries()) {
  console.log(`${String(index + 1).padStart(2, "0")}. ${row.title} [${row.page_type}]`);
  console.log(`    ${row.path}`);
  console.log(`    ${String(row.snippet).replace(/\s+/g, " ").trim()}`);
}
if (rows.length === 0) console.log(`No wiki results for "${query}".`);
