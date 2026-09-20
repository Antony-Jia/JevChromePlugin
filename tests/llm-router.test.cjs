const assert = require("node:assert/strict");
const test = require("node:test");
require("../src/providers/jev-client.js");
const { normalizeEndpoint, extractContent } = require("../src/providers/llm-router.js");

test("normalizes OpenAI-compatible endpoints without duplicate slashes", () => {
  assert.equal(normalizeEndpoint("https://api.example.test/v1/"), "https://api.example.test/v1/chat/completions");
  assert.equal(normalizeEndpoint("http://localhost:11434/v1"), "http://localhost:11434/v1/chat/completions");
  assert.equal(normalizeEndpoint("https://api.example.test/v1/chat/completions"), "https://api.example.test/v1/chat/completions");
});

test("rejects unsupported protocols and URLs that embed credentials", () => {
  assert.throws(() => normalizeEndpoint("file:///tmp/model"), /HTTP or HTTPS/);
  assert.throws(() => normalizeEndpoint("https://user:pass@example.test/v1"), /cannot contain credentials/);
  assert.throws(() => normalizeEndpoint("http://llm.example.test/v1"), /remote hosts must use HTTPS/);
});

test("extracts text from common Chat Completions response shapes", () => {
  assert.equal(extractContent({ choices: [{ message: { content: "  OK  " } }] }), "OK");
  assert.equal(extractContent({ choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } }] }), "AB");
  assert.throws(() => extractContent({ choices: [] }), /no message content/);
  assert.throws(() => extractContent({ choices: [{ message: { content: "  " } }] }), /no message content/);
});
