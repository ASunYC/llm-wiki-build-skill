#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildGraph, initSchema, openDb } from "./wiki-core.mjs";
import { exportViewerBundle } from "./wiki-viewer.mjs";

const [dbPath, ...args] = process.argv.slice(2);
if (!dbPath) {
  console.error("Usage: build-graph.mjs <db-path> [--out <graph.json>] [--no-viewer]");
  process.exit(1);
}
const out = args[args.indexOf("--out") + 1];
const noViewer = args.includes("--no-viewer");
const db = openDb(dbPath);
initSchema(db);
const graph = buildGraph(db);
if (out) {
  const outPath = path.resolve(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(graph, null, 2), "utf8");
  console.log(`Wrote graph: ${outPath}`);
  if (!noViewer) {
    const viewer = exportViewerBundle(db, graph, { outPath });
    console.log(`Wrote viewer: ${viewer.htmlPath}`);
    console.log(`Wrote viewer data: ${viewer.dataPath}`);
  }
} else {
  console.log(JSON.stringify(graph, null, 2));
}
