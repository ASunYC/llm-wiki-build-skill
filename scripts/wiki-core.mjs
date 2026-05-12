import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const DEFAULT_WIKI_ID = "default";
export const CHUNK_SIZE = 6000;
export const CHUNK_OVERLAP = 500;

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
  hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'entity',
  source_id TEXT,
  page_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_id TEXT,
  page_id TEXT,
  weight REAL NOT NULL DEFAULT 0.5
);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  wiki_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5,
  evidence TEXT,
  created_at TEXT NOT NULL
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
  db.prepare("DELETE FROM chunks WHERE wiki_id = ? AND source_id = ?").run(wikiId, sourceId);
  const chunks = chunkMarkdown(content);
  const insertChunk = db.prepare(`
INSERT INTO chunks(id, wiki_id, source_id, page_id, chunk_index, heading, text, start_offset, end_offset, hash)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
  let offset = 0;
  chunks.forEach((chunk, index) => {
    const heading = chunk.match(/^#{1,4}\s+(.+)$/m)?.[1] || "";
    const start = content.indexOf(chunk.slice(0, Math.min(80, chunk.length)), Math.max(0, offset - CHUNK_OVERLAP));
    const end = start >= 0 ? start + chunk.length : offset + chunk.length;
    insertChunk.run(`chunk:${sha256(`${pageId}:${index}:${chunk}`).slice(0, 24)}`, wikiId, sourceId, pageId, index, heading, chunk, Math.max(0, start), Math.max(0, end), sha256(chunk));
    offset = Math.max(offset, end);
  });
  return { sourceId, pageId, chunks: chunks.length };
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
  const pages = db.prepare("SELECT id, title, page_type, tags, content, source_id FROM pages WHERE wiki_id = ?").all(wikiId);
  const nodes = pages.map((p) => ({ id: p.id, type: p.page_type, name: p.title, tags: safeJson(p.tags, []) }));
  const edges = [];
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
  const edgeKeys = new Set();
  function addEdge(source, target, relation, weight, evidence = "") {
    if (!source || !target || source === target) return;
    const key = `${source}|${target}|${relation}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, relation, weight, evidence });
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
  return {
    wikiId,
    nodes: nodes.map((node) => ({ ...node, degree: edges.filter((e) => e.source === node.id || e.target === node.id).length })),
    edges,
    communities: [{ id: "default", label: "Default", nodeIds: nodes.map((n) => n.id), isPrimary: true }],
    statistics: { totalNodes: nodes.length, totalEdges: edges.length, totalCommunities: nodes.length ? 1 : 0 },
  };
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
