const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { XDomAdapter, parseCount } = require("../src/content/x-dom-adapter.js");

const fixtures = path.join(__dirname, "fixtures");

function readFixture(name) {
  return fs.readFileSync(path.join(fixtures, name), "utf8");
}

function parseFixture(name) {
  const dom = new JSDOM(readFixture(name), { url: "https://x.com/home" });
  const adapter = new XDomAdapter();
  const article = adapter.scan(dom.window.document)[0];
  return { dom, adapter, article, post: adapter.extract(article) };
}

test("extracts author, status, text, timestamp, media and engagement metrics", () => {
  const { post } = parseFixture("normal-tweet.html");
  assert.equal(post.postId, "1234567890");
  assert.equal(post.url, "https://x.com/alice/status/1234567890");
  assert.equal(post.authorName, "Alice Example");
  assert.equal(post.authorHandle, "@alice");
  assert.match(post.text, /reduces memory use by 30%/);
  assert.equal(post.timestamp, "2026-09-20T08:00:00.000Z");
  assert.deepEqual(post.metrics, { replies: 12, reposts: 1200, likes: 340, views: 12500 });
  assert.deepEqual(post.mediaAltTexts, ["Latency chart comparing three inference paths"]);
});

test("does not include extension overlay text in extracted post text", () => {
  const { post } = parseFixture("normal-tweet.html");
  assert.doesNotMatch(post.text, /Injected extension text/);
});

test("reports extraction quality flags for complete and media posts", () => {
  const { post } = parseFixture("normal-tweet.html");
  assert.equal(post.extractionQuality.adapterVersion, "x-dom-adapter-1.1");
  assert.equal(post.extractionQuality.textTruncated, false);
  assert.equal(post.extractionQuality.threadContextProvided, false);
  const image = parseFixture("tweet-with-image.html").post;
  assert.equal(image.extractionQuality.hasMedia, true);
  assert.equal(image.extractionQuality.mediaAltOnly, true);
});

test("extracts quote context while keeping it separate from the main post", () => {
  const { post } = parseFixture("quote-tweet.html");
  assert.equal(post.postId, "222");
  assert.match(post.text, /tested this new scheduler/);
  assert.doesNotMatch(post.text, /open source GPU scheduler/);
  assert.deepEqual(post.quotedPost, { authorHandle: "@carol", text: "We are releasing an open source GPU scheduler." });
});

test("handles image, repost, long text, and missing metrics fixtures", () => {
  const image = parseFixture("tweet-with-image.html").post;
  assert.deepEqual(image.mediaAltTexts, ["Benchmark chart comparing throughput across four models"]);

  const repost = parseFixture("repost.html").post;
  assert.equal(repost.postId, "444");
  assert.match(repost.text, /reference implementation/);
  assert.doesNotMatch(repost.text, /reposted/);

  const long = parseFixture("long-tweet.html").post;
  assert.match(long.text, /Part one/);
  assert.match(long.text, /Part three/);

  const missing = parseFixture("missing-metrics.html").post;
  assert.equal(missing.metrics, undefined);
});

test("detects replies via the replying-to context row", () => {
  const dom = new JSDOM(`<article>
    <div>
      <div><a href="/bob">回复 @bob</a></div>
      <div><div data-testid="User-Name"><span>Carol</span></div></div>
      <div data-testid="tweetText">a reply body</div>
      <a href="/carol/status/555"><time datetime="2026-09-20T08:00:00.000Z"></time></a>
    </div>
  </article>`, { url: "https://x.com/home" });
  const adapter = new XDomAdapter();
  const article = adapter.scan(dom.window.document)[0];
  assert.equal(adapter.isReply(article), true);

  const { adapter: homeAdapter, article: homeArticle } = parseFixture("normal-tweet.html");
  assert.equal(homeAdapter.isReply(homeArticle), false);
});

test("marks articles below the focused tweet as replies on status pages", () => {
  const dom = new JSDOM(`<div data-testid="primaryColumn">
    <article>
      <div data-testid="User-Name"><span>Alice</span></div>
      <div data-testid="tweetText">main post</div>
      <a href="/alice/status/1234567890"><time datetime="2026-09-20T08:00:00.000Z"></time></a>
    </article>
    <article>
      <div data-testid="User-Name"><span>Bob</span></div>
      <div data-testid="tweetText">a reply body</div>
      <a href="/bob/status/999"><time datetime="2026-09-20T08:01:00.000Z"></time></a>
    </article>
  </div>`, { url: "https://x.com/alice/status/1234567890" });
  const adapter = new XDomAdapter();
  const articles = adapter.scan(dom.window.document);
  assert.equal(articles.length, 2);
  assert.equal(adapter.isReply(articles[0]), false);
  assert.equal(adapter.isReply(articles[1]), true);
});

test("resolves the primary column as the lane container", () => {
  const dom = new JSDOM(`<div data-testid="primaryColumn"><div><article>
      <div data-testid="tweetText">post</div>
      <a href="/alice/status/777"><time datetime="2026-09-20T08:00:00.000Z"></time></a>
    </article></div></div>`, { url: "https://x.com/home" });
  const adapter = new XDomAdapter();
  const article = adapter.scan(dom.window.document)[0];
  const column = dom.window.document.querySelector('[data-testid="primaryColumn"]');
  assert.deepEqual(adapter.laneContainer(article), { element: column, mode: "shift" });
});

test("ignores articles without a status permalink and parses abbreviated counts", () => {
  const dom = new JSDOM('<article><div data-testid="tweetText">No status URL</div></article>', { url: "https://x.com/home" });
  assert.deepEqual(new XDomAdapter().scan(dom.window.document), []);
  assert.equal(parseCount("1.2K likes"), 1200);
  assert.equal(parseCount("2M views"), 2000000);
  assert.equal(parseCount("unknown"), undefined);
});
