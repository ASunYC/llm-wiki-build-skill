#!/usr/bin/env node
import { DEFAULT_WIKI_ID, buildGraph, initSchema, openDb, safeJson } from "./wiki-core.mjs";

const [dbPath, ...args] = process.argv.slice(2);
if (!dbPath) {
  console.error("Usage: lint-wiki.mjs <db-path> [--wiki <id>]");
  process.exit(1);
}

const wikiId = option(args, "--wiki", DEFAULT_WIKI_ID);
const db = openDb(dbPath);
initSchema(db);
const issues = [];

const stats = {
  pages: count("pages", wikiId),
  sources: count("sources", wikiId),
  chunks: count("chunks", wikiId),
  entities: count("entities", wikiId),
  topics: count("topics", wikiId),
  relations: count("relations", wikiId),
};

if (stats.pages === 0) issues.push({ severity: "error", message: "No pages found. Run ingest-docs first." });
if (stats.sources > 0 && stats.chunks === 0) issues.push({ severity: "error", message: "Sources exist but chunks are missing." });

const brokenChunks = db.prepare(`
SELECT c.id FROM chunks c
LEFT JOIN pages p ON p.id = c.page_id
LEFT JOIN sources s ON s.id = c.source_id
WHERE c.wiki_id = ? AND (p.id IS NULL OR s.id IS NULL)
`).all(wikiId);
if (brokenChunks.length) issues.push({ severity: "error", message: `${brokenChunks.length} chunks reference missing pages or sources.` });

const graph = buildGraph(db, wikiId);
const nodeIds = new Set(graph.nodes.map((node) => node.id));
const brokenEdges = graph.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
if (brokenEdges.length) issues.push({ severity: "warning", message: `${brokenEdges.length} graph edges reference nodes that are not in the graph.` });

const llmRelations = db.prepare("SELECT evidence_details FROM relations WHERE wiki_id = ? AND relation_type = 'llm_relation'").all(wikiId);
const withEvidenceLocation = llmRelations.filter((row) => {
  const details = safeJson(row.evidence_details, []);
  return details.some((detail) => detail.chunkId && detail.lineStart && detail.lineEnd);
}).length;
if (llmRelations.length && withEvidenceLocation < llmRelations.length) {
  issues.push({ severity: "warning", message: `${llmRelations.length - withEvidenceLocation} LLM relations are missing source evidence locations.` });
}

const orphanNodes = graph.insights?.isolatedNodes?.length || 0;
if (orphanNodes) issues.push({ severity: "info", message: `${orphanNodes} graph nodes are isolated.` });

const report = {
  healthy: !issues.some((issue) => issue.severity === "error"),
  issues,
  statistics: {
    ...stats,
    graphNodes: graph.statistics.totalNodes,
    graphEdges: graph.statistics.totalEdges,
    graphCommunities: graph.statistics.totalCommunities,
    llmRelations: llmRelations.length,
    relationsWithEvidenceLocation: withEvidenceLocation,
    evidenceCoverage: llmRelations.length ? Math.round((withEvidenceLocation / llmRelations.length) * 1000) / 1000 : 1,
  },
};

console.log(JSON.stringify(report, null, 2));
if (!report.healthy) process.exit(1);

function count(table, wikiId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE wiki_id = ?`).get(wikiId).n;
}

function option(items, name, fallback = null) {
  const index = items.indexOf(name);
  return index >= 0 ? items[index + 1] : fallback;
}
