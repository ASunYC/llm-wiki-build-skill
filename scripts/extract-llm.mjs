#!/usr/bin/env node
import {
  DEFAULT_WIKI_ID,
  getAnalysisConfig,
  getChunkSizeForDepth,
  getExtractionLimitsForDepth,
  initSchema,
  openDb,
  safeJson,
  sha256,
  upsertEntity,
  upsertRelation,
  upsertSynthesisPage,
  upsertTopic,
} from "./wiki-core.mjs";
import { LLMClient, publicLLMConfig } from "./llm-client.mjs";

const [dbPath, ...args] = process.argv.slice(2);
if (!dbPath) {
  console.error("Usage: extract-llm.mjs <db-path> [--wiki <id>] [--depth fast|standard|deep] [--limit N] [--reset] [--skip-health]");
  process.exit(1);
}

const wikiId = option(args, "--wiki", DEFAULT_WIKI_ID);
const depth = option(args, "--depth", null);
const limit = Number(option(args, "--limit", "0"));
const reset = args.includes("--reset");
const skipHealth = args.includes("--skip-health");
const db = openDb(dbPath);
initSchema(db);
const analysisConfig = getAnalysisConfig(db, wikiId, depth ? { depth } : {});
const client = new LLMClient();
const publicConfig = publicLLMConfig();

if (!client.isAvailable) {
  console.error("LLM is not configured. Set LLM_API_BASE, LLM_API_KEY, and LLM_MODEL.");
  console.error(JSON.stringify(publicConfig, null, 2));
  process.exit(2);
}

if (!skipHealth) {
  await client.healthCheck();
}

if (reset) resetDerivedLLMData(db, wikiId);

const runId = `llmrun:${sha256(`${wikiId}:${Date.now()}`).slice(0, 24)}`;
const startedAt = new Date().toISOString();
db.prepare(`
INSERT INTO llm_runs(id, wiki_id, model, endpoint, status, message, started_at)
VALUES (?, ?, ?, ?, 'running', ?, ?)
`).run(runId, wikiId, client.modelName, client.endpoint, `depth=${analysisConfig.depth}`, startedAt);

let chunks = db.prepare(`
SELECT c.*, p.title AS page_title, p.path AS page_path, s.title AS source_title, s.source_path
FROM chunks c
JOIN pages p ON p.id = c.page_id
JOIN sources s ON s.id = c.source_id
WHERE c.wiki_id = ?
ORDER BY c.source_id, c.chunk_index
`).all(wikiId);

if (limit > 0) chunks = chunks.slice(0, limit);
const limits = getExtractionLimitsForDepth(analysisConfig.depth);
const bySource = new Map();
const stats = { entities: 0, topics: 0, relations: 0 };

try {
  for (const [index, chunk] of chunks.entries()) {
    console.log(`LLM extracting ${index + 1}/${chunks.length}: ${chunk.source_path}#${chunk.chunk_index}`);
    const result = normalizeExtraction(await extractChunk(client, chunk, analysisConfig, limits));
    writeExtraction(db, wikiId, chunk, result, stats);
    const sourceSummary = result.source_summary || "";
    if (sourceSummary) {
      if (!bySource.has(chunk.source_id)) bySource.set(chunk.source_id, { chunk, summaries: [] });
      bySource.get(chunk.source_id).summaries.push(sourceSummary);
    }
  }

  if (analysisConfig.generateSourceSummary) {
    for (const { chunk, summaries } of bySource.values()) {
      const title = `Synthesis: ${chunk.source_title}`;
      const content = `# ${title}\n\n${summaries.map((item) => `- ${item}`).join("\n")}\n`;
      upsertSynthesisPage(db, {
        wikiId,
        title,
        content,
        tags: ["synthesis", "llm"],
        metadata: {
          model: client.modelName,
          sourceId: chunk.source_id,
          sourcePath: chunk.source_path,
          analysisDepth: analysisConfig.depth,
        },
      });
    }
  }

  db.prepare(`
UPDATE llm_runs
SET status='success', message=?, input_chunks=?, entities_count=?, topics_count=?, relations_count=?, completed_at=?
WHERE id=?
`).run("LLM extraction completed", chunks.length, stats.entities, stats.topics, stats.relations, new Date().toISOString(), runId);
  console.log(`Done. chunks=${chunks.length}, entities=${stats.entities}, topics=${stats.topics}, relations=${stats.relations}`);
} catch (error) {
  db.prepare("UPDATE llm_runs SET status='error', message=?, completed_at=? WHERE id=?").run(String(error?.message || error), new Date().toISOString(), runId);
  throw error;
}

function option(items, name, fallback = null) {
  const index = items.indexOf(name);
  return index >= 0 ? items[index + 1] : fallback;
}

async function extractChunk(client, chunk, config, limits) {
  const system = [
    "You extract a precise LLM Wiki knowledge graph from documentation.",
    "Return JSON only. Do not include markdown fences.",
    "Keep evidence short and grounded in the source text.",
  ].join("\n");
  const user = `
Source title: ${chunk.source_title}
Source path: ${chunk.source_path}
Page title: ${chunk.page_title}
Chunk index: ${chunk.chunk_index}
Line range: ${chunk.line_start}-${chunk.line_end}
Analysis depth: ${config.depth}
Generate source summary: ${config.generateSourceSummary}
Generate document relations: ${config.generateDocumentRelations}

Return this JSON shape:
{
  "source_summary": "50-100 word summary, or empty string",
  "entities": [{"name":"A","type":"tool|person|project|concept|framework|library|pattern|other","relevance":"why it matters","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","evidence":"short quote or paraphrase"}],
  "topics": [{"name":"Topic","importance":"why important","evidence":"short evidence"}],
  "connections": [{"from":"A","to":"B","type":"depends_on|relates_to|contrasts_with|implements|uses|contains|extends|solves","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","evidence":"why","snippet":"source snippet <=120 chars"}],
  "document_relations": [{"from":"${chunk.source_title}","to":"other source or page title","type":"supplements|overlaps|contrasts|references|conflicts|same_topic","confidence":"EXTRACTED|INFERRED|AMBIGUOUS","evidence":"why","snippet":"source snippet <=120 chars"}],
  "contradictions": [{"claim_a":"...","claim_b":"...","context":"..."}]
}

Limits: max entities ${limits.entities}, max topics ${limits.topics}, max connections ${limits.relations}.
If a field is unavailable, return an empty string or empty array.

Source text:
${chunk.text}
`;
  return client.chatJSON([
    { role: "system", content: system },
    { role: "user", content: user },
  ], { temperature: 0.15, maxTokens: config.depth === "deep" ? 8192 : 4096 });
}

function normalizeExtraction(value) {
  return {
    source_summary: String(value?.source_summary || ""),
    entities: Array.isArray(value?.entities) ? value.entities : [],
    topics: Array.isArray(value?.topics) ? value.topics : [],
    connections: Array.isArray(value?.connections) ? value.connections : [],
    document_relations: Array.isArray(value?.document_relations) ? value.document_relations : [],
    contradictions: Array.isArray(value?.contradictions) ? value.contradictions : [],
  };
}

function writeExtraction(db, wikiId, chunk, result, stats) {
  const detailBase = {
    sourceTitle: chunk.source_title,
    sourcePath: chunk.source_path,
    chunkId: chunk.id,
    lineStart: chunk.line_start,
    lineEnd: chunk.line_end,
    charStart: chunk.start_offset,
    charEnd: chunk.end_offset,
  };
  for (const entity of result.entities) {
    const name = cleanName(entity.name);
    if (!name) continue;
    upsertEntity(db, {
      wikiId,
      name,
      entityType: entity.type || "entity",
      sourceId: chunk.source_id,
      pageId: chunk.page_id,
      confidence: confidenceWeight(entity.confidence),
      evidence: entity.evidence || entity.relevance || "",
      properties: { relevance: entity.relevance || "", confidence: entity.confidence || "INFERRED" },
    });
    stats.entities++;
  }
  for (const topic of result.topics) {
    const name = cleanName(topic.name);
    if (!name) continue;
    upsertTopic(db, {
      wikiId,
      name,
      sourceId: chunk.source_id,
      pageId: chunk.page_id,
      weight: 0.7,
      definition: topic.importance || "",
      evidence: topic.evidence || topic.importance || "",
      properties: { importance: topic.importance || "" },
    });
    stats.topics++;
  }
  const relations = [
    ...result.connections.map((item) => ({ ...item, kind: "entity_relation" })),
    ...result.document_relations.map((item) => ({ ...item, kind: "document_relation" })),
  ];
  for (const relation of relations) {
    const from = cleanName(relation.from);
    const to = cleanName(relation.to);
    if (!from || !to) continue;
    upsertEntity(db, {
      wikiId,
      name: from,
      entityType: relation.kind === "document_relation" ? "source" : "entity",
      sourceId: chunk.source_id,
      pageId: chunk.page_id,
      confidence: confidenceWeight(relation.confidence),
      evidence: relation.evidence || relation.snippet || "",
      properties: { inferredFromRelation: true },
    });
    upsertEntity(db, {
      wikiId,
      name: to,
      entityType: relation.kind === "document_relation" ? "source" : "entity",
      sourceId: chunk.source_id,
      pageId: chunk.page_id,
      confidence: confidenceWeight(relation.confidence),
      evidence: relation.evidence || relation.snippet || "",
      properties: { inferredFromRelation: true },
    });
    upsertRelation(db, {
      wikiId,
      sourceId: from,
      targetId: to,
      relationType: "llm_relation",
      weight: confidenceWeight(relation.confidence),
      evidence: relation.evidence || relation.snippet || "",
      confidence: relation.confidence || "INFERRED",
      evidenceDetails: [{ ...detailBase, evidence: relation.evidence || "", snippet: relation.snippet || "" }],
      properties: { llmType: relation.type || "relates_to", kind: relation.kind },
    });
    stats.relations++;
  }
  if (result.contradictions.length) {
    upsertSynthesisPage(db, {
      wikiId,
      title: `Contradictions: ${chunk.source_title}`,
      content: `# Contradictions: ${chunk.source_title}\n\n${result.contradictions.map((item) => `- ${item.claim_a || ""} vs ${item.claim_b || ""}: ${item.context || ""}`).join("\n")}\n`,
      tags: ["synthesis", "contradiction", "llm"],
      metadata: { sourceId: chunk.source_id, sourcePath: chunk.source_path, contradictions: result.contradictions },
    });
  }
}

function cleanName(value) {
  return String(value || "").trim().slice(0, 160);
}

function confidenceWeight(value) {
  const text = String(value || "").toUpperCase();
  if (text.includes("EXTRACTED")) return 0.9;
  if (text.includes("AMBIGUOUS")) return 0.45;
  return 0.68;
}

function resetDerivedLLMData(db, wikiId) {
  db.prepare("DELETE FROM entities WHERE wiki_id = ?").run(wikiId);
  db.prepare("DELETE FROM topics WHERE wiki_id = ?").run(wikiId);
  db.prepare("DELETE FROM relations WHERE wiki_id = ? AND relation_type = 'llm_relation'").run(wikiId);
  db.prepare("DELETE FROM pages WHERE wiki_id = ? AND page_type = 'synthesis'").run(wikiId);
}
