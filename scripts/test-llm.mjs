#!/usr/bin/env node
import { LLMClient, publicLLMConfig } from "./llm-client.mjs";

const startedAt = Date.now();
const client = new LLMClient();
if (!client.isAvailable) {
  console.error("LLM is not configured.");
  console.error(JSON.stringify(publicLLMConfig(), null, 2));
  process.exit(2);
}

try {
  await client.healthCheck();
  console.log(JSON.stringify({
    ok: true,
    endpoint: client.endpoint,
    model: client.modelName,
    latencyMs: Date.now() - startedAt,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    endpoint: client.endpoint,
    model: client.modelName,
    latencyMs: Date.now() - startedAt,
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
