import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const DEFAULT_WIKI_ID = "default";
export const CHUNK_SIZE = 6000;
export const CHUNK_OVERLAP = 500;
export const DEFAULT_ANALYSIS_CONFIG = {
  depth: "standard",
  generateDocumentRelations: true,
  generateSourceSummary: true,
  mergeSameNameEntities: true,
  protectUserModifiedPages: true,
};

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initSchema(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS wikis (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  page_type TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  word_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  text TEXT NOT NULL,
  start_offset INTEGER NOT NULL DEFAULT 0,
  end_offset INTEGER NOT NULL DEFAULT 0,
  line_start INTEGER NOT NULL DEFAULT 1,
  line_end INTEGER NOT NULL DEFAULT 1,
  hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'entity',
  source_id TEXT,
  page_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_id TEXT,
  page_id TEXT,
  weight REAL NOT NULL DEFAULT 0.5,
  definition TEXT,
  evidence TEXT,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5,
  evidence TEXT,
  confidence TEXT,
  evidence_details TEXT NOT NULL DEFAULT '[]',
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS repositories (
  full_name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  html_url TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  readme TEXT,
  skill_md TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS authors (
  login TEXT PRIMARY KEY,
  name TEXT,
  avatar_url TEXT,
  html_url TEXT,
  location TEXT,
  lat REAL,
  lon REAL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  url TEXT,
  github_repo TEXT,
  category TEXT,
  source TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  author_login TEXT,
  location_id TEXT,
  readme TEXT,
  skill_md TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  stage TEXT,
  current_chunk INTEGER,
  total_chunks INTEGER,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analysis_configs (
  wiki_id TEXT PRIMARY KEY,
  depth TEXT NOT NULL DEFAULT 'standard',
  generate_document_relations INTEGER NOT NULL DEFAULT 1,
  generate_source_summary INTEGER NOT NULL DEFAULT 1,
  merge_same_name_entities INTEGER NOT NULL DEFAULT 1,
  protect_user_modified_pages INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_runs (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  model TEXT,
  endpoint TEXT,
  status TEXT NOT NULL,
  message TEXT,
  input_chunks INTEGER NOT NULL DEFAULT 0,
  entities_count INTEGER NOT NULL DEFAULT 0,
  topics_count INTEGER NOT NULL DEFAULT 0,
  relations_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED, wiki_id UNINDEXED, title, heading, text);
CREATE INDEX IF NOT EXISTS idx_pages_type ON pages(wiki_id, page_type);
CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(wiki_id, title);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(wiki_id, source_id);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(wiki_id, name);
CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(wiki_id, name);
CREATE INDEX IF NOT EXISTS idx_relations_pair ON relations(wiki_id, source_id, target_id);
CREATE INDEX IF NOT EXISTS idx_skills_display ON skills(display_name);
CREATE INDEX IF NOT EXISTS idx_skills_repo ON skills(github_repo);
CREATE INDEX IF NOT EXISTS idx_skills_stars ON skills(stars DESC);
CREATE INDEX IF NOT EXISTS idx_locations_coords ON locations(lat, lon);
`);
  migrateSchema(db);
  ensureAnalysisConfig(db);
}

function migrateSchema(db) {
  const migrations = [
    ["pages", "metadata", "ALTER TABLE pages ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'"],
    ["chunks", "line_start", "ALTER TABLE chunks ADD COLUMN line_start INTEGER NOT NULL DEFAULT 1"],
    ["chunks", "line_end", "ALTER TABLE chunks ADD COLUMN line_end INTEGER NOT NULL DEFAULT 1"],
    ["entities", "evidence", "ALTER TABLE entities ADD COLUMN evidence TEXT"],
    ["entities", "properties", "ALTER TABLE entities ADD COLUMN properties TEXT NOT NULL DEFAULT '{}'"],
    ["entities", "created_at", "ALTER TABLE entities ADD COLUMN created_at TEXT"],
    ["entities", "updated_at", "ALTER TABLE entities ADD COLUMN updated_at TEXT"],
    ["topics", "definition", "ALTER TABLE topics ADD COLUMN definition TEXT"],
    ["topics", "evidence", "ALTER TABLE topics ADD COLUMN evidence TEXT"],
    ["topics", "properties", "ALTER TABLE topics ADD COLUMN properties TEXT NOT NULL DEFAULT '{}'"],
    ["topics", "created_at", "ALTER TABLE topics ADD COLUMN created_at TEXT"],
    ["topics", "updated_at", "ALTER TABLE topics ADD COLUMN updated_at TEXT"],
    ["relations", "confidence", "ALTER TABLE relations ADD COLUMN confidence TEXT"],
    ["relations", "evidence_details", "ALTER TABLE relations ADD COLUMN evidence_details TEXT NOT NULL DEFAULT '[]'"],
    ["relations", "properties", "ALTER TABLE relations ADD COLUMN properties TEXT NOT NULL DEFAULT '{}'"],
    ["relations", "updated_at", "ALTER TABLE relations ADD COLUMN updated_at TEXT"],
    ["import_jobs", "stage", "ALTER TABLE import_jobs ADD COLUMN stage TEXT"],
    ["import_jobs", "current_chunk", "ALTER TABLE import_jobs ADD COLUMN current_chunk INTEGER"],
    ["import_jobs", "total_chunks", "ALTER TABLE import_jobs ADD COLUMN total_chunks INTEGER"],
    ["import_jobs", "result_json", "ALTER TABLE import_jobs ADD COLUMN result_json TEXT"],
  ];
  for (const [table, column, sql] of migrations) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (!columns.includes(column)) db.exec(sql);
  }
}

export function ensureAnalysisConfig(db, wikiId = DEFAULT_WIKI_ID, input = {}) {
  const config = normalizeAnalysisConfig(input);
  const now = new Date().toISOString();
  db.prepare(`
INSERT INTO analysis_configs(wiki_id, depth, generate_document_relations, generate_source_summary, merge_same_name_entities, protect_user_modified_pages, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(wiki_id) DO UPDATE SET
  depth=COALESCE(excluded.depth, analysis_configs.depth),
  generate_document_relations=excluded.generate_document_relations,
  generate_source_summary=excluded.generate_source_summary,
  merge_same_name_entities=excluded.merge_same_name_entities,
  protect_user_modified_pages=excluded.protect_user_modified_pages,
  updated_at=excluded.updated_at
`).run(
    wikiId,
    config.depth,
    config.generateDocumentRelations ? 1 : 0,
    config.generateSourceSummary ? 1 : 0,
    config.mergeSameNameEntities ? 1 : 0,
    config.protectUserModifiedPages ? 1 : 0,
    now,
  );
  return config;
}

export function getAnalysisConfig(db, wikiId = DEFAULT_WIKI_ID, override = {}) {
  const row = db.prepare("SELECT * FROM analysis_configs WHERE wiki_id = ?").get(wikiId);
  return normalizeAnalysisConfig({
    depth: row?.depth,
    generateDocumentRelations: row ? Boolean(row.generate_document_relations) : undefined,
    generateSourceSummary: row ? Boolean(row.generate_source_summary) : undefined,
    mergeSameNameEntities: row ? Boolean(row.merge_same_name_entities) : undefined,
    protectUserModifiedPages: row ? Boolean(row.protect_user_modified_pages) : undefined,
    ...override,
  });
}

export function normalizeAnalysisConfig(input = {}) {
  const depth = ["fast", "standard", "deep"].includes(input.depth) ? input.depth : DEFAULT_ANALYSIS_CONFIG.depth;
  return {
    depth,
    generateDocumentRelations: input.generateDocumentRelations ?? DEFAULT_ANALYSIS_CONFIG.generateDocumentRelations,
    generateSourceSummary: input.generateSourceSummary ?? DEFAULT_ANALYSIS_CONFIG.generateSourceSummary,
    mergeSameNameEntities: input.mergeSameNameEntities ?? DEFAULT_ANALYSIS_CONFIG.mergeSameNameEntities,
    protectUserModifiedPages: input.protectUserModifiedPages ?? DEFAULT_ANALYSIS_CONFIG.protectUserModifiedPages,
  };
}

export function ensureWiki(db, { id = DEFAULT_WIKI_ID, name = "LLM Wiki", description = "" } = {}) {
  const now = new Date().toISOString();
  db.prepare(`
INSERT INTO wikis(id, name, description, created_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at
`).run(id, name, description, now, now);
  return id;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function slugify(value) {
  return String(value || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";
}

export function countWords(text) {
  const latin = (text.match(/[A-Za-z0-9_]+/g) || []).length;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  return latin + cjk;
}

export function extractTags(text) {
  const tags = new Set();
  for (const match of text.matchAll(/(?:^|\s)#([A-Za-z][A-Za-z0-9_-]{2,})/g)) tags.add(match[1].toLowerCase());
  const keywords = ["frontend", "design", "python", "typescript", "database", "testing", "docker", "security", "api", "agent", "llm", "ui", "github"];
  const lower = text.toLowerCase();
  for (const keyword of keywords) if (lower.includes(keyword)) tags.add(keyword);
  return [...tags].slice(0, 12);
}

export function extractWikiLinks(text) {
  return [...new Set([...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean))];
}

export function chunkMarkdown(text, maxChunkSize = CHUNK_SIZE) {
  const headingRe = /^(#{1,4})\s+(.+)$/gm;
  const headings = [];
  let match;
  while ((match = headingRe.exec(text)) !== null) {
    headings.push({ level: match[1].length, title: match[2], index: match.index, length: match[0].length });
  }
  if (headings.length === 0) return chunkText(text, maxChunkSize);
  const sections = [];
  if (headings[0].index > 0) sections.push({ heading: "", text: text.slice(0, headings[0].index).trim() });
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    const next = headings[i + 1];
    const start = current.index + current.length;
    const end = next ? next.index : text.length;
    sections.push({ heading: `${"#".repeat(current.level)} ${current.title}`, text: text.slice(start, end).trim() });
  }
  const chunks = [];
  let current = "";
  for (const section of sections) {
    const sectionText = section.heading ? `${section.heading}\n${section.text}` : section.text;
    if (!sectionText.trim()) continue;
    if (current.length + sectionText.length + 2 <= maxChunkSize) {
      current = current ? `${current}\n\n${sectionText}` : sectionText;
    } else {
      if (current) chunks.push(current);
      if (sectionText.length > maxChunkSize) chunks.push(...chunkText(sectionText, maxChunkSize));
      else current = sectionText;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : chunkText(text, maxChunkSize);
}

export function getChunkSizeForDepth(depth = "standard") {
  if (depth === "fast") return 8000;
  if (depth === "deep") return 4200;
  return CHUNK_SIZE;
}

export function getExtractionLimitsForDepth(depth = "standard") {
  if (depth === "fast") return { entities: 18, topics: 8, relations: 20 };
  if (depth === "deep") return { entities: 45, topics: 18, relations: 55 };
  return { entities: 30, topics: 12, relations: 35 };
}

export function chunkText(text, maxChunkSize = CHUNK_SIZE) {
  if (text.length <= maxChunkSize) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChunkSize);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += maxChunkSize - CHUNK_OVERLAP;
  }
  return chunks;
}

export function ingestText(db, { wikiId = DEFAULT_WIKI_ID, title, sourcePath, sourceType = "markdown", content, pageType = "source", tags = [] }) {
  initSchema(db);
  ensureWiki(db, { id: wikiId });
  const now = new Date().toISOString();
  const sourceId = `src:${sha256(`${wikiId}:${sourcePath}`).slice(0, 24)}`;
  const pageId = `page:${sha256(`${wikiId}:${sourcePath}:${title}`).slice(0, 24)}`;
  const mergedTags = [...new Set([...tags, ...extractTags(content)])];
  db.prepare(`
INSERT INTO sources(id, wiki_id, title, source_path, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET title=excluded.title, content_hash=excluded.content_hash, updated_at=excluded.updated_at
`).run(sourceId, wikiId, title, sourcePath, sourceType, sha256(content), now, now);
  db.prepare(`
INSERT INTO pages(id, wiki_id, source_id, title, path, page_type, content, tags, word_count, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, tags=excluded.tags, word_count=excluded.word_count, updated_at=excluded.updated_at
`).run(pageId, wikiId, sourceId, title, sourcePath, pageType, content, JSON.stringify(mergedTags), countWords(content), now, now);
  db.prepare("DELETE FROM chunks_fts WHERE wiki_id = ? AND chunk_id IN (SELECT id FROM chunks WHERE wiki_id = ? AND source_id = ?)").run(wikiId, wikiId, sourceId);
  db.prepare("DELETE FROM chunks WHERE wiki_id = ? AND source_id = ?").run(wikiId, sourceId);
  const chunks = chunkMarkdown(content);
  const insertChunk = db.prepare(`
INSERT INTO chunks(id, wiki_id, source_id, page_id, chunk_index, heading, text, start_offset, end_offset, line_start, line_end, hash)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
  const insertFts = db.prepare("INSERT INTO chunks_fts(chunk_id, wiki_id, title, heading, text) VALUES (?, ?, ?, ?, ?)");
  let offset = 0;
  chunks.forEach((chunk, index) => {
    const heading = chunk.match(/^#{1,4}\s+(.+)$/m)?.[1] || "";
    const start = content.indexOf(chunk.slice(0, Math.min(80, chunk.length)), Math.max(0, offset - CHUNK_OVERLAP));
    const end = start >= 0 ? start + chunk.length : offset + chunk.length;
    const chunkId = `chunk:${sha256(`${pageId}:${index}:${chunk}`).slice(0, 24)}`;
    const lineStart = lineNumberAt(content, Math.max(0, start));
    const lineEnd = lineNumberAt(content, Math.max(0, end));
    insertChunk.run(chunkId, wikiId, sourceId, pageId, index, heading, chunk, Math.max(0, start), Math.max(0, end), lineStart, lineEnd, sha256(chunk));
    insertFts.run(chunkId, wikiId, title, heading, chunk);
    offset = Math.max(offset, end);
  });
  return { sourceId, pageId, chunks: chunks.length };
}

export function lineNumberAt(text, offset) {
  if (offset <= 0) return 1;
  let line = 1;
  for (let i = 0; i < Math.min(offset, text.length); i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function collectFiles(inputPaths) {
  const out = [];
  for (const input of inputPaths) {
    const abs = path.resolve(input);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(abs)) out.push(...collectFiles([path.join(abs, child)]));
    } else if (/\.(md|txt)$/i.test(abs) || /(^|[/\\])(README|SKILL)\.md$/i.test(abs)) {
      out.push(abs);
    }
  }
  return out;
}

export function buildGraph(db, wikiId = DEFAULT_WIKI_ID) {
  initSchema(db);
  const pages = db.prepare("SELECT id, title, page_type, tags, content, source_id FROM pages WHERE wiki_id = ?").all(wikiId);
  const entities = db.prepare("SELECT id, name, entity_type, confidence, page_id, source_id, evidence FROM entities WHERE wiki_id = ?").all(wikiId);
  const topics = db.prepare("SELECT id, name, weight, page_id, source_id, evidence FROM topics WHERE wiki_id = ?").all(wikiId);
  const nodes = [
    ...pages.map((p) => ({ id: p.id, type: p.page_type, name: p.title, tags: safeJson(p.tags, []), sources: new Set([p.source_id].filter(Boolean)) })),
    ...entities.map((e) => ({ id: e.id, type: "entity", name: e.name, tags: [e.entity_type].filter(Boolean), sources: new Set([e.source_id].filter(Boolean)) })),
    ...topics.map((t) => ({ id: t.id, type: "topic", name: t.name, tags: ["topic"], sources: new Set([t.source_id].filter(Boolean)) })),
  ];
  const edges = [];
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
  const byName = new Map(nodes.map((n) => [n.name.toLowerCase(), n]));
  const edgeKeys = new Set();
  function addEdge(source, target, relation, weight, evidence = "", extra = {}) {
    if (!source || !target || source === target) return;
    const key = `${source}|${target}|${relation}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, relation, weight, evidence, ...extra });
  }
  for (const page of pages) {
    for (const link of extractWikiLinks(page.content)) {
      const target = byTitle.get(link.toLowerCase());
      if (target) addEdge(page.id, target.id, "wikilink", 1, `[[${link}]]`);
    }
  }
  for (let i = 0; i < pages.length; i++) {
    const a = pages[i];
    const tagsA = new Set(safeJson(a.tags, []));
    for (let j = i + 1; j < pages.length; j++) {
      const b = pages[j];
      const tagsB = new Set(safeJson(b.tags, []));
      const shared = [...tagsA].filter((tag) => tagsB.has(tag));
      if (shared.length) addEdge(a.id, b.id, "shared_tag", Math.min(1, shared.length / 3), shared.join(", "));
      if (a.source_id && a.source_id === b.source_id) addEdge(a.id, b.id, "source_overlap", 0.4, "same source");
    }
  }
  for (const entity of entities) {
    if (entity.page_id) addEdge(entity.page_id, entity.id, "mentions_entity", entity.confidence || 0.7, entity.evidence || "");
  }
  for (const topic of topics) {
    if (topic.page_id) addEdge(topic.page_id, topic.id, "has_topic", topic.weight || 0.6, topic.evidence || "");
  }
  const storedRelations = db.prepare("SELECT source_id, target_id, relation_type, weight, evidence, confidence, evidence_details, properties FROM relations WHERE wiki_id = ?").all(wikiId);
  for (const rel of storedRelations) {
    const source = byName.get(String(rel.source_id).toLowerCase())?.id || rel.source_id;
    const target = byName.get(String(rel.target_id).toLowerCase())?.id || rel.target_id;
    addEdge(source, target, rel.relation_type, rel.weight || 0.7, rel.evidence || "", {
      confidence: rel.confidence,
      evidenceDetails: safeJson(rel.evidence_details, []),
      properties: safeJson(rel.properties, {}),
    });
  }
  const pairMetrics = computePairMetrics(nodes, edges);
  for (const edge of edges) {
    const key = edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`;
    const metrics = pairMetrics.get(key);
    if (metrics) {
      edge.signals = { co_citation: metrics.coCitation, type_affinity: metrics.typeAffinity, source_overlap: metrics.sourceOverlap };
      edge.weight = Math.max(edge.weight || 0, metrics.weight);
    }
  }
  const communities = detectCommunities(nodes.map((n) => n.id), edges);
  return {
    wikiId,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      tags: node.tags,
      community: communities.assignments.get(node.id),
      degree: edges.filter((e) => e.source === node.id || e.target === node.id).length,
    })),
    edges,
    communities: communities.groups,
    insights: buildGraphInsights(nodes.map((n) => n.id), edges, communities.assignments),
    statistics: { totalNodes: nodes.length, totalEdges: edges.length, totalCommunities: communities.groups.length },
  };
}

function computePairMetrics(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const inbound = new Map();
  for (const edge of edges) {
    if (!inbound.has(edge.target)) inbound.set(edge.target, new Set());
    inbound.get(edge.target).add(edge.source);
  }
  const typeAffinity = {
    entity: { entity: 1, topic: 1, source: 0.6 },
    topic: { entity: 1, topic: 0.8, source: 0.6 },
    source: { entity: 0.6, topic: 0.6, source: 0.3 },
  };
  const result = new Map();
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    const key = edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`;
    if (result.has(key)) continue;
    const inA = inbound.get(edge.source) || new Set();
    const inB = inbound.get(edge.target) || new Set();
    const shared = [...inA].filter((item) => inB.has(item)).length;
    const coCitation = shared / Math.max(inA.size, inB.size, 1);
    const affinity = typeAffinity[a.type]?.[b.type] ?? 0.5;
    const sourcesA = a.sources || new Set();
    const sourcesB = b.sources || new Set();
    const overlap = sourcesA.size && sourcesB.size ? [...sourcesA].filter((item) => sourcesB.has(item)).length / Math.min(sourcesA.size, sourcesB.size) : 0;
    const signals = [coCitation, affinity];
    if (sourcesA.size && sourcesB.size) signals.push(overlap);
    result.set(key, {
      coCitation: round3(coCitation),
      typeAffinity: affinity,
      sourceOverlap: round3(overlap),
      weight: round3(signals.reduce((sum, item) => sum + item, 0) / signals.length),
    });
  }
  return result;
}

function detectCommunities(nodeIds, edges) {
  const adjacency = new Map(nodeIds.map((id) => [id, new Map()]));
  for (const edge of edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source).set(edge.target, (adjacency.get(edge.source).get(edge.target) || 0) + (edge.weight || 0.5));
    adjacency.get(edge.target).set(edge.source, (adjacency.get(edge.target).get(edge.source) || 0) + (edge.weight || 0.5));
  }
  const assignments = runLouvain(nodeIds, adjacency);
  const grouped = new Map();
  for (const [nodeId, communityId] of assignments) {
    if (!grouped.has(communityId)) grouped.set(communityId, []);
    grouped.get(communityId).push(nodeId);
  }
  return {
    assignments,
    groups: [...grouped.entries()].map(([id, ids], index) => ({
      id: `community-${index + 1}`,
      label: `Community ${index + 1}`,
      nodeIds: ids,
      isPrimary: index === 0,
    })),
  };
}

function runLouvain(nodeIds, adjacency) {
  const community = new Map(nodeIds.map((id) => [id, id]));
  let improved = true;
  let passes = 0;
  while (improved && passes < 20) {
    improved = false;
    passes++;
    for (const nodeId of nodeIds) {
      const neighbors = adjacency.get(nodeId);
      if (!neighbors?.size) continue;
      const scores = new Map();
      for (const [neighborId, weight] of neighbors) {
        const cid = community.get(neighborId);
        scores.set(cid, (scores.get(cid) || 0) + weight);
      }
      const [bestCommunity] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      if (bestCommunity && bestCommunity !== community.get(nodeId)) {
        community.set(nodeId, bestCommunity);
        improved = true;
      }
    }
  }
  return community;
}

function buildGraphInsights(nodeIds, edges, assignments) {
  const degree = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  return {
    isolatedNodes: [...degree.entries()].filter(([, value]) => value === 0).map(([id]) => id),
    bridgeNodes: [...degree.entries()].filter(([, value]) => value >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id),
    surprisingConnections: edges
      .filter((edge) => assignments.get(edge.source) !== assignments.get(edge.target) && (edge.weight || 0) >= 0.6)
      .slice(0, 8)
      .map((edge) => ({ source: edge.source, target: edge.target, reason: `${edge.relation} crosses communities` })),
  };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function upsertEntity(db, { wikiId = DEFAULT_WIKI_ID, name, entityType = "entity", sourceId = null, pageId = null, confidence = 0.7, evidence = "", properties = {} }) {
  const id = `entity:${sha256(`${wikiId}:${name.toLowerCase()}:${entityType}`).slice(0, 24)}`;
  const now = new Date().toISOString();
  db.prepare(`
INSERT INTO entities(id, wiki_id, name, entity_type, source_id, page_id, confidence, evidence, properties, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET confidence=MAX(entities.confidence, excluded.confidence), evidence=COALESCE(excluded.evidence, entities.evidence), properties=excluded.properties, updated_at=excluded.updated_at
`).run(id, wikiId, name, entityType, sourceId, pageId, confidence, evidence, JSON.stringify(properties), now, now);
  return id;
}

export function upsertTopic(db, { wikiId = DEFAULT_WIKI_ID, name, sourceId = null, pageId = null, weight = 0.6, definition = "", evidence = "", properties = {} }) {
  const id = `topic:${sha256(`${wikiId}:${name.toLowerCase()}`).slice(0, 24)}`;
  const now = new Date().toISOString();
  db.prepare(`
INSERT INTO topics(id, wiki_id, name, source_id, page_id, weight, definition, evidence, properties, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET weight=MAX(topics.weight, excluded.weight), definition=COALESCE(excluded.definition, topics.definition), evidence=COALESCE(excluded.evidence, topics.evidence), properties=excluded.properties, updated_at=excluded.updated_at
`).run(id, wikiId, name, sourceId, pageId, weight, definition, evidence, JSON.stringify(properties), now, now);
  return id;
}

export function upsertRelation(db, { wikiId = DEFAULT_WIKI_ID, sourceId, targetId, relationType = "llm_relation", weight = 0.7, evidence = "", confidence = "INFERRED", evidenceDetails = [], properties = {} }) {
  const id = `rel:${sha256(`${wikiId}:${sourceId}:${targetId}:${relationType}:${evidence}`).slice(0, 24)}`;
  const now = new Date().toISOString();
  db.prepare(`
INSERT INTO relations(id, wiki_id, source_id, target_id, relation_type, weight, evidence, confidence, evidence_details, properties, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET weight=MAX(relations.weight, excluded.weight), evidence=excluded.evidence, confidence=excluded.confidence, evidence_details=excluded.evidence_details, properties=excluded.properties, updated_at=excluded.updated_at
`).run(id, wikiId, sourceId, targetId, relationType, weight, evidence, confidence, JSON.stringify(evidenceDetails), JSON.stringify(properties), now, now);
  return id;
}

export function upsertSynthesisPage(db, { wikiId = DEFAULT_WIKI_ID, title, content, tags = [], metadata = {} }) {
  const now = new Date().toISOString();
  const pageId = `page:${sha256(`${wikiId}:synthesis:${title}`).slice(0, 24)}`;
  const pathValue = `synthesis/${slugify(title)}.md`;
  db.prepare(`
INSERT INTO pages(id, wiki_id, source_id, title, path, page_type, content, tags, word_count, metadata, created_at, updated_at)
VALUES (?, ?, NULL, ?, ?, 'synthesis', ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET content=excluded.content, tags=excluded.tags, word_count=excluded.word_count, metadata=excluded.metadata, updated_at=excluded.updated_at
`).run(pageId, wikiId, title, pathValue, content, JSON.stringify(tags), countWords(content), JSON.stringify(metadata), now, now);
  return pageId;
}

export function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function scriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}
