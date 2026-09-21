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

test("shows a slim rail and toggles the detail card on click", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const config = Core.createDefaultConfig();
  const renderer = new OverlayRenderer();
  const result = {
    postId: "123",
    dimensions: [{ id: "interest", label: "兴趣", type: "score", score: 3, normalizedScore: 0.75, confidence: 0.9 }],
    composite: { score: 0.75, confidence: 0.9 },
    analyzedAt: Date.now()
  };

  renderer.renderResult(article, { postId: "123", text: "Post body" }, result, config);
  const shadow = article.querySelector("[data-jev-overlay]").shadowRoot;
  const rail = shadow.querySelector(".rail");
  const card = shadow.querySelector(".card");
  assert.equal(rail.getAttribute("aria-expanded"), "false");
  assert.equal(card.classList.contains("expanded"), false);
  assert.equal(rail.querySelector(".rail-score").textContent, "75");
  assert.equal(rail.querySelector(".rail-label").textContent, "值得关注");

  // One ring arc per dimension, colored to match the dot in the card.
  const arcs = shadow.querySelectorAll(".ring-arc");
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].getAttribute("stroke"), "#38bdf8");
  assert.equal(shadow.querySelector(".dim-dot").style.background, "rgb(56, 189, 248)");

  rail.click();
  assert.equal(card.classList.contains("expanded"), true);
  assert.equal(rail.getAttribute("aria-expanded"), "true");
  rail.click();
  assert.equal(card.classList.contains("expanded"), false);

  renderer.renderError(article, { postId: "123", text: "Post body" }, { message: "boom" }, config);
  assert.equal(rail.dataset.level, "error");
  assert.equal(rail.querySelector(".rail-score").textContent, "!");

  renderer.renderPending(article, { postId: "123", text: "Post body" });
  assert.equal(rail.dataset.level, "pending");
  assert.equal(rail.querySelector(".rail-label").textContent, "等待判断");

  // The rail occupies a carved gutter and restores the layout when disabled.
  assert.equal(article.style.paddingLeft, "148px");
  renderer.setEnabled(false, [article]);
  assert.equal(article.style.paddingLeft, "");
  renderer.setEnabled(true, [article]);
  assert.equal(article.style.paddingLeft, "148px");
});

test("lays out one mini ring per dimension in a two-column grid", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const config = Core.createDefaultConfig();
  const renderer = new OverlayRenderer();
  const result = {
    postId: "123",
    dimensions: [
      { id: "interest", label: "兴趣", type: "score", score: 3, normalizedScore: 0.75, confidence: 0.9 },
      { id: "depth", label: "深度", type: "score", score: 2, normalizedScore: 0.5, confidence: 0.9 },
      { id: "noise", label: "营销", type: "noul", noul: 1, normalizedScore: 0.25, confidence: 0.9 },
      { id: "format", label: "体裁", type: "choice", selectedChoice: "a", confidence: 0.9 }
    ],
    composite: { score: 0.6, confidence: 0.9 },
    analyzedAt: Date.now()
  };

  renderer.renderResult(article, { postId: "123", text: "Post body" }, result, config);
  const shadow = article.querySelector("[data-jev-overlay]").shadowRoot;
  const chart = shadow.querySelector(".rail-chart");
  const rings = chart.querySelectorAll(".mini-ring");
  assert.equal(rings.length, 4);
  assert.match(shadow.querySelector("style").textContent, /grid-template-columns:repeat\(2/);
  assert.equal(rings[0].querySelector(".mini-ring-value").textContent, "75");
  assert.equal(rings[3].querySelector(".mini-ring-value").textContent, "—");
  // A dimension without a numeric value renders the gray track only.
  assert.equal(rings[3].querySelectorAll(".ring-arc").length, 0);
  const expectedComposite = Math.round(Core.calculateComposite(result.dimensions, config.questions).score * 100);
  assert.equal(shadow.querySelector(".rail-score").textContent, String(expectedComposite));

  renderer.renderPending(article, { postId: "123", text: "Post body" });
  const placeholder = shadow.querySelector(".mini-ring.placeholder");
  assert.ok(placeholder);
  assert.equal(shadow.querySelector(".rail-score").textContent, "…");
});

test("renders one bar row per dimension when the bar chart style is selected", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const config = Core.createDefaultConfig();
  config.scoring.railChartStyle = "bars";
  const renderer = new OverlayRenderer();
  const result = {
    postId: "123",
    dimensions: [
      { id: "interest", label: "兴趣", type: "score", score: 3, normalizedScore: 0.75, confidence: 0.9 },
      { id: "noise", label: "营销", type: "noul", noul: 1, normalizedScore: 0.25, confidence: 0.9 },
      { id: "format", label: "体裁", type: "choice", selectedChoice: "a", confidence: 0.9 }
    ],
    composite: { score: 0.6, confidence: 0.9 },
    analyzedAt: Date.now()
  };

  renderer.renderResult(article, { postId: "123", text: "Post body" }, result, config);
  const shadow = article.querySelector("[data-jev-overlay]").shadowRoot;
  const chart = shadow.querySelector(".rail-chart");
  assert.equal(chart.classList.contains("bars"), true);
  const rows = chart.querySelectorAll(".mini-bar");
  assert.equal(rows.length, 3);
  assert.equal(chart.querySelectorAll(".mini-ring").length, 0);
  assert.equal(rows[0].querySelector(".mini-bar-label").textContent, "兴趣");
  assert.equal(rows[0].querySelector(".mini-bar-value").textContent, "75");
  assert.equal(rows[0].querySelector(".mini-bar-fill").style.width, "75%");
  assert.equal(rows[0].querySelector(".mini-bar-fill").style.background, "rgb(56, 189, 248)");
  // A choice dimension without a numeric value shows "—" and no fill.
  assert.equal(rows[2].querySelector(".mini-bar-value").textContent, "—");
  assert.equal(rows[2].querySelectorAll(".mini-bar-fill").length, 0);

  // Pending keeps the bar style: one placeholder row per enabled question.
  renderer.renderPending(article, { postId: "123", text: "Post body" });
  assert.equal(chart.querySelectorAll(".mini-bar.placeholder").length, config.questions.length);

  // Switching back to rings re-renders the placeholder.
  renderer.setChartStyle("rings", [article]);
  assert.equal(chart.classList.contains("bars"), false);
  assert.ok(chart.querySelector(".mini-ring.placeholder"));
});

test("bar chart drops label rows before collapsing entirely on short posts", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const config = Core.createDefaultConfig();
  config.scoring.railChartStyle = "bars";
  const renderer = new OverlayRenderer();
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  renderer.setChartStyle("bars", [article]);
  const rail = article.querySelector("[data-jev-overlay]").shadowRoot.querySelector(".rail");
  const chart = rail.querySelector(".rail-chart");
  assert.equal(chart.classList.contains("bars"), true);

  for (const [cls, height] of [["rail-score", 24], ["rail-label", 28], ["rail-hint", 14]]) {
    Object.defineProperty(rail.querySelector(`.${cls}`), "offsetHeight", { configurable: true, value: height });
  }
  // JSDOM reports 0 sizes; the chart measures 120 with labels, 60 without.
  Object.defineProperty(chart, "offsetHeight", {
    configurable: true,
    get: () => (chart.classList.contains("tight") ? 60 : 120)
  });
  let railHeight = 250;
  Object.defineProperty(rail, "clientHeight", { configurable: true, get: () => railHeight });

  // Tall rail: labels and bars both visible.
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  assert.equal(rail.classList.contains("compact"), false);
  assert.equal(chart.classList.contains("tight"), false);

  // Medium rail: only the bars remain (neededFull=186, neededTight=126).
  railHeight = 150;
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  assert.equal(chart.classList.contains("tight"), true);
  assert.equal(rail.classList.contains("compact"), false);

  // Short rail: even the bars alone do not fit, hide the whole chart.
  railHeight = 100;
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  assert.equal(rail.classList.contains("compact"), true);

  // Growing again restores labels, not just bars.
  railHeight = 250;
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  assert.equal(rail.classList.contains("compact"), false);
  assert.equal(chart.classList.contains("tight"), false);
});

test("hides the ring grid on short posts and restores it when tall", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const renderer = new OverlayRenderer();
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  const rail = article.querySelector("[data-jev-overlay]").shadowRoot.querySelector(".rail");

  // JSDOM reports 0 sizes; stub the content height the rail would need.
  for (const [cls, height] of [["rail-chart", 200], ["rail-score", 24], ["rail-label", 28], ["rail-hint", 14]]) {
    Object.defineProperty(rail.querySelector(`.${cls}`), "offsetHeight", { configurable: true, value: height });
  }
  let railHeight = 120;
  Object.defineProperty(rail, "clientHeight", { configurable: true, get: () => railHeight });

  renderer.renderPending(article, { postId: "1", text: "Post body" });
  assert.equal(rail.classList.contains("compact"), true);

  railHeight = 400;
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  assert.equal(rail.classList.contains("compact"), false);
});

test("adjusts the rail width live and re-carves the gutter", () => {
  const dom = new JSDOM("<!doctype html><article><div>Post body</div></article>", { url: "https://x.com/home" });
  const article = dom.window.document.querySelector("article");
  const renderer = new OverlayRenderer();
  renderer.renderPending(article, { postId: "1", text: "Post body" });
  const host = article.querySelector("[data-jev-overlay]");
  assert.equal(article.style.paddingLeft, "148px");

  renderer.setRailWidth(100, [article]);
  assert.equal(article.style.paddingLeft, "112px");
  assert.equal(host.style.getPropertyValue("--jev-rail-w"), "100px");

  renderer.setEnabled(false, [article]);
  renderer.setRailWidth(120, [article]);
  assert.equal(article.style.paddingLeft, "");
  assert.equal(host.style.getPropertyValue("--jev-rail-w"), "120px");
  renderer.setEnabled(true, [article]);
  assert.equal(article.style.paddingLeft, "132px");
});

test("carves a lane on the adapter-provided container when available", () => {
  const dom = new JSDOM(`<!doctype html><div id="col" data-testid="primaryColumn"><div id="cell"><article><div>Post body</div></article></div></div>`, { url: "https://x.com/home" });
  const document = dom.window.document;
  const article = document.querySelector("article");
  const column = document.getElementById("col");
  const original = dom.window.Element.prototype.getBoundingClientRect;
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const width = this === column ? 600 : 0;
    return { width, height: 100, top: 0, left: 0, right: width, bottom: 100, x: 0, y: 0, toJSON() { return {}; } };
  };
  try {
    let calls = 0;
    const renderer = new OverlayRenderer({ laneContainer: (a) => { calls += 1; return a.closest('[data-testid="primaryColumn"]'); } });
    renderer.renderPending(article, { postId: "1", text: "Post body" });
    assert.ok(calls >= 1);
    assert.equal(column.style.paddingLeft, "148px");
    assert.equal(article.style.paddingLeft, "");
    const shadow = article.querySelector("[data-jev-overlay]").shadowRoot;
    assert.equal(shadow.querySelector(".rail").classList.contains("inset"), false);
    renderer.setRailWidth(100, [article]);
    assert.equal(column.style.paddingLeft, "112px");
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = original;
  }
});

test("shift-mode lanes offset the column without changing its layout width", () => {
  const dom = new JSDOM(`<!doctype html><div id="row"><div id="col" data-testid="primaryColumn"><div id="cell"><article><div>Post body</div></article></div></div></div>`, { url: "https://x.com/home" });
  const document = dom.window.document;
  const article = document.querySelector("article");
  const column = document.getElementById("col");
  const original = dom.window.Element.prototype.getBoundingClientRect;
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const width = this === column ? 600 : 0;
    return { width, height: 100, top: 0, left: 0, right: width, bottom: 100, x: 0, y: 0, toJSON() { return {}; } };
  };
  try {
    const renderer = new OverlayRenderer({
      laneContainer: (a) => ({ element: a.closest('[data-testid="primaryColumn"]'), mode: "shift" })
    });
    renderer.renderPending(article, { postId: "1", text: "Post body" });
    // The column shifts visually; margin/grid sizing stays untouched.
    assert.equal(column.style.position, "relative");
    assert.equal(column.style.left, "148px");
    assert.equal(column.style.marginLeft, "");
    assert.equal(column.style.paddingLeft, "");
    assert.equal(article.style.paddingLeft, "");
    renderer.setRailWidth(100, [article]);
    assert.equal(column.style.left, "112px");
    renderer.setEnabled(false, [article]);
    assert.equal(column.style.position, "");
    assert.equal(column.style.left, "");
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = original;
  }
});

test("carves a lane on the feed column when layout allows", () => {
  const dom = new JSDOM(`<!doctype html><div id="page"><div id="nav"></div><div id="col"><div id="cell"><article><div>Post body</div></article></div></div></div>`, { url: "https://x.com/home" });
  const document = dom.window.document;
  const article = document.querySelector("article");
  const column = document.getElementById("col");
  const widths = new Map([
    [article, 600],
    [document.getElementById("cell"), 600],
    [column, 600],
    [document.getElementById("page"), 1300],
    [document.body, 1300],
    [document.documentElement, 1300]
  ]);
  const original = dom.window.Element.prototype.getBoundingClientRect;
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const width = widths.get(this) || 0;
    return { width, height: 100, top: 0, left: 0, right: width, bottom: 100, x: 0, y: 0, toJSON() { return {}; } };
  };
  try {
    const renderer = new OverlayRenderer();
    const result = {
      postId: "1",
      dimensions: [{ id: "interest", label: "兴趣", type: "score", score: 3, normalizedScore: 0.9, confidence: 0.9 }],
      composite: { score: 0.9, confidence: 0.9 }
    };
    renderer.renderResult(article, { postId: "1", text: "Post body" }, result, Core.createDefaultConfig());
    const shadow = article.querySelector("[data-jev-overlay]").shadowRoot;
    // The lane lives on the feed column, not inside the article.
    assert.equal(column.style.paddingLeft, "148px");
    assert.equal(article.style.paddingLeft, "");
    assert.equal(shadow.querySelector(".rail").classList.contains("inset"), false);
    renderer.setEnabled(false, [article]);
    assert.equal(column.style.paddingLeft, "");
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = original;
  }
});
