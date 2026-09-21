import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "..", ".env");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(".env file is missing.");
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function safeFailure(label, error) {
  const code = typeof error?.code === "string" ? error.code
    : typeof error?.cause?.code === "string" ? error.cause.code
      : error?.name === "TypeError" ? "NETWORK_OR_RESPONSE_ERROR" : "UNKNOWN";
  const status = Number.isFinite(error?.status) ? ` HTTP ${error.status}` : "";
  const safeDetail = error?.message === "empty LLM answer" ? " empty response" : "";
  console.error(`FAIL ${label}: ${code}${status}${safeDetail}`);
}

async function main() {
  const env = readEnvFile(envPath);
  const openRouterOnly = process.argv.includes("--jev-openrouter-only");
  const llmOnly = process.argv.includes("--llm-only");
  const jevKey = openRouterOnly ? env.JEV_OPENROUTER : env.TYPESAFE_API_KEY;
  const llmBaseUrl = env.OPENAI_COMPAT_BASE_URL;
  const llmKey = env.OPENAI_COMPAT_API_KEY;
  const llmModel = env.OPENAI_COMPAT_CHAT_MODEL;
  if (!llmOnly && !jevKey) {
    throw new Error(openRouterOnly ? "JEV_OPENROUTER is empty in .env." : "TYPESAFE_API_KEY is empty in .env.");
  }
  if (!openRouterOnly && !llmOnly && (!llmBaseUrl || !llmModel)) {
    throw new Error("OPENAI_COMPAT_BASE_URL or OPENAI_COMPAT_CHAT_MODEL is empty in .env.");
  }

  const { JevClient } = require("../src/providers/jev-client.js");
  const { JevResponseSchema } = await import("../src/providers/jev-response-schema.mjs");

  if (!llmOnly) {
    const jevStarted = Date.now();
    try {
      const client = new JevClient(openRouterOnly
        ? { provider: "openrouter", openRouterApiKey: jevKey, model: "~typesafe/jev-latest", timeoutMs: 30000 }
        : { apiKey: jevKey, model: "jev-latest", timeoutMs: 30000 });
      const response = await client.analyze(
        { test: "MVP connectivity check: a released software benchmark includes reproducible measurements." },
        { connection_check: { type: "noul", instructions: "Is this text describing a software benchmark?" } }
      );
      const parsed = JevResponseSchema.safeParse(response);
      if (!parsed.success) throw new Error("invalid Jev response schema");
      const answer = parsed.data.answers.connection_check;
      if (answer?.type !== "noul" || !Number.isFinite(Number(answer.noul))) throw new Error("invalid Jev answer");
      const label = openRouterOnly ? "OpenRouter Jev" : "Jev System One";
      console.log(`PASS ${label} (${Date.now() - jevStarted} ms; response schema valid)`);
    } catch (error) {
      safeFailure(openRouterOnly ? "OpenRouter Jev" : "Jev System One", error);
      process.exitCode = 1;
      return;
    }
  }

  if (openRouterOnly) return;

  const { LlmRouter } = require("../src/providers/llm-router.js");
  const llmStarted = Date.now();
  try {
    const router = new LlmRouter({
      provider: "openai-compatible",
      baseUrl: llmBaseUrl,
      apiKey: llmKey,
      model: llmModel,
      temperature: 0,
      maxTokens: 128
    });
    const response = await router.testConnection();
    if (!response.trim()) throw new Error("empty LLM answer");
    console.log(`PASS OpenAI-compatible endpoint (${Date.now() - llmStarted} ms; response schema valid)`);
  } catch (error) {
    safeFailure("OpenAI-compatible endpoint", error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL integration setup: ${error.message}`);
  process.exitCode = 1;
});
