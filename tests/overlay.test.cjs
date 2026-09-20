const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const Core = require("../src/shared/core.js");
const { OverlayRenderer } = require("../src/content/overlay.js");

test("renders a mask, allows reveal, and displays LLM output in a fixed right-side dock", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const config = Core.createDefaultConfig();
  let deepCalls = 0;
  let deepState;
  const renderer = new OverlayRenderer({ onDeepAnalyze: (_article, _post, _result, state) => { deepCalls += 1; deepState = state; } });
  const post = { postId: "123", text: "Post body" };
  const result = {
    postId: "123",
    dimensions: [{ id: "interest", label: "兴趣", type: "score", normalizedScore: 0.2, confidence: 0.9 }],
    composite: { score: 0.2, confidence: 0.9 },
    analyzedAt: Date.now()
  };

  renderer.renderResult(article, post, result, config);
  const host = article.querySelector("[data-jev-overlay]");
  const shadow = host.shadowRoot;
  const mask = shadow.querySelector(".mask");
  assert.equal(mask.classList.contains("visible"), true);
  assert.equal(mask.dataset.level, "strong");
  assert.doesNotMatch(shadow.querySelector("style").textContent, /backdrop-filter/);

  const cardButtons = shadow.querySelectorAll(".card button");
  cardButtons[0].click();
  assert.equal(mask.classList.contains("visible"), false);
  cardButtons[1].click();
  assert.equal(deepCalls, 1);

  renderer.showDeepAnalysis(deepState, "## Conclusion\n<img src=x onerror=alert(1)>", [
    { id: "S1", title: "Example source", url: "https://example.test/source" }
  ], { enabled: true, used: true });
  const dockHost = dom.window.document.querySelector("[data-jev-deep-dock]");
  const dock = dockHost.shadowRoot;
  assert.equal(dockHost.hidden, false);
  assert.match(dock.querySelector(".markdown").textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(dock.querySelector("img"), null);
  assert.equal(dock.querySelector(".sources a").href, "https://example.test/source");
  assert.match(dock.querySelector(".subtitle").textContent, /Tavily/);
});

test("resets overlay state when X reuses an article node for another post", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const config = Core.createDefaultConfig();
  const renderer = new OverlayRenderer();
  const result = (postId, score) => ({
    postId,
    dimensions: [{ id: "interest", label: "兴趣", type: "score", score: score * 4, normalizedScore: score, confidence: 0.9 }],
    composite: { score, confidence: 0.9 },
    analyzedAt: Date.now()
  });

  renderer.renderResult(article, { postId: "123", text: "First" }, result("123", 0.2), config);
  const firstHost = article.querySelector("[data-jev-overlay]");
  const lowAlpha = Number(firstHost.shadowRoot.querySelector(".mask").style.getPropertyValue("--tint-alpha"));
  firstHost.shadowRoot.querySelector(".card button").click();
  renderer.renderResult(article, { postId: "456", text: "Second" }, result("456", 0.9), config);

  const hosts = article.querySelectorAll("[data-jev-overlay]");
  assert.equal(hosts.length, 1);
  assert.notEqual(hosts[0], firstHost);
  assert.match(hosts[0].shadowRoot.querySelector(".score").textContent, /90/);
  const highMask = hosts[0].shadowRoot.querySelector(".mask");
  assert.equal(highMask.classList.contains("visible"), true);
  assert.equal(highMask.dataset.level, "none");
  assert.ok(Number(highMask.style.getPropertyValue("--tint-alpha")) < lowAlpha);
});
