#!/usr/bin/env node
import { initSchema, openDb } from "./wiki-core.mjs";

const [dbPath, ...queryParts] = process.argv.slice(2);
const query = queryParts.filter((part, index) => !part.startsWith("--") && queryParts[index - 1] !== "--limit").join(" ").trim();
const limit = Number(option(queryParts, "--limit", "20"));
if (!dbPath || !query) {
  console.error("Usage: query-wiki.mjs <db-path> <query> [--limit N]");
  process.exit(1);
}
const db = openDb(dbPath);
initSchema(db);
const rows = search(db, query, limit);
for (const [index, row] of rows.entries()) {
  console.log(`${String(index + 1).padStart(2, "0")}. ${row.title} [${row.kind}]`);
  console.log(`    ${row.path || row.id}`);
  console.log(`    ${String(row.snippet || "").replace(/\s+/g, " ").trim()}`);
}
if (rows.length === 0) console.log(`No wiki results for "${query}".`);

function search(db, query, limit) {
  const escaped = query.replace(/"/g, '""');
  try {
    const ftsRows = db.prepare(`
SELECT p.title, p.page_type AS kind, p.path, snippet(chunks_fts, 4, '[', ']', '...', 24) AS snippet
FROM chunks_fts
JOIN chunks c ON c.id = chunks_fts.chunk_id
JOIN pages p ON p.id = c.page_id
WHERE chunks_fts MATCH ?
ORDER BY rank
LIMIT ?
`).all(`"${escaped}"`, limit);
    if (ftsRows.length) return ftsRows;
  } catch {
    // FTS can fail on special syntax; fall back to LIKE search.
  }
  const q = `%${query.toLowerCase()}%`;
  const pages = db.prepare(`
SELECT p.title, p.page_type, p.path, substr(p.content, 1, 360) AS snippet
FROM pages p
WHERE lower(p.title) LIKE ? OR lower(p.content) LIKE ? OR lower(p.tags) LIKE ?
ORDER BY CASE WHEN lower(p.title) LIKE ? THEN 0 ELSE 1 END, p.updated_at DESC
LIMIT ?
`).all(q, q, q, q, limit).map((row) => ({ ...row, kind: row.page_type }));
  const entities = db.prepare(`
SELECT name AS title, entity_type AS kind, id, COALESCE(evidence, '') AS snippet
FROM entities
WHERE lower(name) LIKE ? OR lower(entity_type) LIKE ? OR lower(COALESCE(evidence, '')) LIKE ?
ORDER BY confidence DESC
LIMIT ?
`).all(q, q, q, Math.max(0, limit - pages.length));
  const topics = db.prepare(`
SELECT name AS title, 'topic' AS kind, id, COALESCE(definition, evidence, '') AS snippet
FROM topics
WHERE lower(name) LIKE ? OR lower(COALESCE(definition, '')) LIKE ? OR lower(COALESCE(evidence, '')) LIKE ?
ORDER BY weight DESC
LIMIT ?
`).all(q, q, q, Math.max(0, limit - pages.length - entities.length));
  return [...pages, ...entities, ...topics].slice(0, limit);
}

function option(items, name, fallback = null) {
  const index = items.indexOf(name);
  return index >= 0 ? items[index + 1] : fallback;
}
