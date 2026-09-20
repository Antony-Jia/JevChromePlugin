const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { WeiboDomAdapter, parseCount, parsePermalink } = require("../src/content/weibo-dom-adapter.js");

const fixtures = path.join(__dirname, "fixtures");

function parseFixture(name) {
  const html = fs.readFileSync(path.join(fixtures, name), "utf8");
  const dom = new JSDOM(html, { url: "https://weibo.com/hot" });
  const adapter = new WeiboDomAdapter();
  const article = adapter.scan(dom.window.document)[0];
  return { dom, adapter, article, post: adapter.extract(article) };
}

test("extracts a Weibo post permalink, author, text, media, timestamp and metrics", () => {
  const { post } = parseFixture("weibo-normal.html");
  assert.equal(post.platform, "weibo");
  assert.equal(post.postId, "weibo:123456:AbC123xYz");
  assert.equal(post.url, "https://weibo.com/123456/AbC123xYz");
  assert.equal(post.authorName, "测试作者");
  assert.equal(post.authorHandle, "@测试作者");
  assert.match(post.text, /吞吐量提高了 35%/);
  assert.equal(post.timestamp, "2026-09-20 10:30");
  assert.deepEqual(post.mediaAltTexts, ["推理吞吐量对比图"]);
  assert.deepEqual(post.metrics, { reposts: 12, replies: 3, likes: 45, views: 12000 });
});

test("keeps a repost body separate from quoted Weibo content", () => {
  const { post } = parseFixture("weibo-repost.html");
  assert.equal(post.postId, "weibo:100:RePost9");
  assert.equal(post.text, "这个实现值得研究。");
  assert.deepEqual(post.quotedPost, { authorHandle: "@原作者", text: "开源了新的 GPU 调度器和完整基准测试。" });
});

test("ignores non-post articles and parses Chinese abbreviated counts", () => {
  const dom = new JSDOM("<article><div>不是微博帖子</div></article>", { url: "https://weibo.com/" });
  assert.deepEqual(new WeiboDomAdapter().scan(dom.window.document), []);
  assert.equal(parseCount("1.2万"), 12000);
  assert.equal(parseCount("3亿"), 300000000);
  assert.deepEqual(parsePermalink("https://weibo.com/123/AbC9"), { uid: "123", shortId: "AbC9", url: "https://weibo.com/123/AbC9" });
  assert.equal(parsePermalink("https://evil.example/123/AbC9"), null);
});
