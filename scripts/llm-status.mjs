#!/usr/bin/env node
import { publicLLMConfig } from "./llm-client.mjs";

console.log(JSON.stringify(publicLLMConfig(), null, 2));
