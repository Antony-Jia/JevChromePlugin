(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderWeiboDomAdapter = api;
})(globalThis, function () {
  "use strict";

  const ADAPTER_VERSION = "weibo-dom-adapter-1.1";
  const TEXT_LIMIT = 12000;
  const QUOTE_LIMIT = 6000;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s*展开\s*$/, "")
      .trim();
  }

  function belongsToArticle(element, article) {
    return element?.closest?.("article") === article && !element.closest("[data-jev-overlay]");
  }

  function parsePermalink(value) {
    try {
      const url = new URL(String(value || ""), "https://weibo.com");
      if (!["weibo.com", "www.weibo.com"].includes(url.hostname)) return null;
      const match = url.pathname.match(/^\/(\d{1,24})\/([A-Za-z0-9]{1,32})\/?$/);
      return match ? { uid: match[1], shortId: match[2], url: `https://weibo.com/${match[1]}/${match[2]}` } : null;
    } catch {
      return null;
    }
  }

  function findPermalink(article) {
    const header = article.querySelector("header");
    const headerLinks = Array.from(header?.querySelectorAll("a[href]") || []);
    for (const anchor of headerLinks) {
      if (!belongsToArticle(anchor, article)) continue;
      const parsed = parsePermalink(anchor.href || anchor.getAttribute("href"));
      if (parsed) return { anchor, ...parsed };
    }
    for (const anchor of article.querySelectorAll("a[href]")) {
      if (!belongsToArticle(anchor, article) || anchor.closest(".retweet")) continue;
      const parsed = parsePermalink(anchor.href || anchor.getAttribute("href"));
      if (parsed) return { anchor, ...parsed };
    }
    return null;
  }

  function textFrom(element) {
    return normalizeText(element?.innerText || element?.textContent || "");
  }

  function ownedElements(article, selector) {
    return Array.from(article.querySelectorAll(selector)).filter((element) => belongsToArticle(element, article));
  }

  function parseCount(value) {
    const match = String(value || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([万亿KMB])?/i);
    if (!match) return undefined;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return undefined;
    const multiplier = ({ 万: 10000, 亿: 100000000, K: 1000, M: 1000000, B: 1000000000 })[String(match[2] || "").toUpperCase()] || 1;
    return Math.round(amount * multiplier);
  }

  function readAuthor(article) {
    const header = article.querySelector("header");
    if (!header) return {};
    const link = Array.from(header.querySelectorAll("a"))
      .find((element) => belongsToArticle(element, article)
        && !parsePermalink(element.href)
        && (element.hasAttribute("usercard") || element.hasAttribute("aria-label") || element.querySelector("span[title]")));
    const authorName = normalizeText(link?.getAttribute("aria-label") || link?.querySelector("span[title]")?.getAttribute("title") || textFrom(link));
    return authorName ? { authorName: authorName.slice(0, 200), authorHandle: `@${authorName}`.slice(0, 200) } : {};
  }

  function readMainText(article) {
    const candidates = ownedElements(article, '.wbpro-feed-ogText, [class*="_wbtext_"], [class*="wbtext"]')
      .filter((element) => !element.closest(".retweet"));
    const texts = candidates.map(textFrom).filter(Boolean);
    const joined = [...new Set(texts)].join("\n");
    return { text: joined.slice(0, TEXT_LIMIT), truncated: joined.length > TEXT_LIMIT };
  }

  function readQuote(article) {
    const quoteRoot = ownedElements(article, ".retweet")[0];
    if (!quoteRoot) return undefined;
    const textElement = quoteRoot.querySelector('[class*="_wbtext_"], [class*="wbtext"], .wbpro-feed-ogText');
    const text = textFrom(textElement);
    if (!text) return undefined;
    const authorLink = quoteRoot.querySelector("a[usercard], a[aria-label]");
    const authorName = normalizeText(authorLink?.getAttribute("aria-label") || authorLink?.querySelector("span[title]")?.getAttribute("title") || textFrom(authorLink));
    return {
      ...(authorName ? { authorHandle: `@${authorName}`.slice(0, 200) } : {}),
      text: text.slice(0, QUOTE_LIMIT),
      truncated: text.length > QUOTE_LIMIT
    };
  }

  function readCollapsedHint(article) {
    return ownedElements(article, 'a, button, [class*="expand"]')
      .some((element) => /^(展开|展开全文|全文|收起)$/.test(textFrom(element) || ""));
  }

  function readMetrics(article) {
    const result = {};
    const footer = ownedElements(article, "footer[aria-label]")[0];
    const counts = String(footer?.getAttribute("aria-label") || "").split(",").map(parseCount);
    if (Number.isFinite(counts[0])) result.reposts = counts[0];
    if (Number.isFinite(counts[1])) result.replies = counts[1];
    if (Number.isFinite(counts[2])) result.likes = counts[2];
    const headerText = textFrom(article.querySelector("header"));
    const views = headerText.match(/([\d,.]+\s*[万亿KMB]?)\s*阅读/i);
    const viewCount = parseCount(views?.[1]);
    if (Number.isFinite(viewCount)) result.views = viewCount;
    return Object.keys(result).length ? result : undefined;
  }

  class WeiboDomAdapter {
    scan(rootNode) {
      const rootElement = rootNode || document;
      const candidates = [];
      if (rootElement.nodeType === 1 && rootElement.matches?.("article")) candidates.push(rootElement);
      candidates.push(...Array.from(rootElement.querySelectorAll?.("article") || []));
      return [...new Set(candidates)].filter((article) => !article.parentElement?.closest("article") && this.getPostId(article));
    }

    getPostId(article) {
      const permalink = article?.querySelectorAll ? findPermalink(article) : null;
      return permalink ? `weibo:${permalink.uid}:${permalink.shortId}` : null;
    }

    extract(article) {
      const permalink = findPermalink(article);
      if (!permalink) return null;
      const quotedPost = readQuote(article);
      const main = readMainText(article);
      const text = main.text || (quotedPost ? "转发微博" : "");
      if (!text) return null;
      const author = readAuthor(article);
      const timestamp = permalink.anchor.getAttribute("title") || undefined;
      const mediaElements = ownedElements(article, '.wbpro-feed-content img, .wbpro-feed-content video, video[aria-label]');
      const mediaAltTexts = mediaElements
        .map((element) => normalizeText(element.getAttribute("alt") || element.getAttribute("aria-label")))
        .filter((item) => item.length >= 4)
        .filter((item, index, list) => list.indexOf(item) === index)
        .slice(0, 20);
      const metrics = readMetrics(article);
      const extractionQuality = {
        adapterVersion: ADAPTER_VERSION,
        textTruncated: main.truncated,
        quoteTruncated: quotedPost?.truncated === true,
        suspectedCollapsed: readCollapsedHint(article),
        hasMedia: mediaElements.length > 0,
        mediaAltOnly: mediaElements.length > 0,
        threadContextProvided: false
      };
      return {
        platform: "weibo",
        postId: `weibo:${permalink.uid}:${permalink.shortId}`,
        url: permalink.url,
        ...author,
        text,
        ...(quotedPost ? { quotedPost: { ...(quotedPost.authorHandle ? { authorHandle: quotedPost.authorHandle } : {}), text: quotedPost.text } } : {}),
        ...(mediaAltTexts.length ? { mediaAltTexts } : {}),
        ...(timestamp ? { timestamp: timestamp.slice(0, 80) } : {}),
        extractionQuality,
        ...(metrics ? { metrics } : {})
      };
    }
  }

  return { WeiboDomAdapter, normalizeText, parsePermalink, parseCount };
});
