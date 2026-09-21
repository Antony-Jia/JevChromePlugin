(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderXDomAdapter = api;
})(globalThis, function () {
  "use strict";

  const ADAPTER_VERSION = "x-dom-adapter-1.1";
  const TEXT_LIMIT = 12000;
  const QUOTE_LIMIT = 6000;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function belongsToArticle(element, article) {
    return element.closest("article") === article && !element.closest("[data-jev-overlay]");
  }

  function findStatusId(href) {
    const match = String(href || "").match(/\/status\/(\d+)(?:[/?#]|$)/);
    return match?.[1] || null;
  }

  function findPermalink(article) {
    const links = Array.from(article.querySelectorAll('a[href*="/status/"]'))
      .filter((anchor) => belongsToArticle(anchor, article));
    return links.find((anchor) => anchor.querySelector("time")) || links[0];
  }

  function parseCount(value) {
    const match = String(value || "").match(/([\d,.]+)\s*([KMB])?/i);
    if (!match) return undefined;
    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount)) return undefined;
    const multiplier = ({ K: 1000, M: 1000000, B: 1000000000 })[String(match[2] || "").toUpperCase()] || 1;
    return Math.round(amount * multiplier);
  }

  function textFrom(element) {
    return normalizeText(element?.innerText || element?.textContent || "");
  }

  function ownedElements(article, selector) {
    return Array.from(article.querySelectorAll(selector)).filter((element) => belongsToArticle(element, article));
  }

  function readHandle(container) {
    if (!container) return undefined;
    const anchors = Array.from(container.querySelectorAll('a[href^="/"]'));
    for (const anchor of anchors) {
      const path = anchor.getAttribute("href") || "";
      const match = path.match(/^\/([^/?#]+)(?:[/?#]|$)/);
      if (!match || ["home", "explore", "search", "notifications", "messages", "settings"].includes(match[1])) continue;
      return "@" + match[1].replace(/^@/, "");
    }
    const label = textFrom(container).match(/@[A-Za-z0-9_]{1,30}/);
    return label?.[0];
  }

  function readAuthor(article) {
    const userName = ownedElements(article, '[data-testid="User-Name"], [data-testid="userName"]')[0];
    if (!userName) return {};
    const spans = Array.from(userName.querySelectorAll("span"))
      .filter((element) => !element.closest("[data-jev-overlay]"))
      .map(textFrom)
      .filter(Boolean);
    const authorName = spans.find((value) => !value.startsWith("@"));
    return { authorName, authorHandle: readHandle(userName) };
  }

  function readQuote(article) {
    const marked = ownedElements(article, '[data-testid="quoteTweet"], blockquote');
    let quoteRoot = marked[0];
    if (!quoteRoot) {
      quoteRoot = Array.from(article.querySelectorAll("article")).find((element) => element !== article && element.parentElement?.closest("article") === article);
    }
    if (!quoteRoot) return undefined;
    const textElement = quoteRoot.querySelector('[data-testid="tweetText"]');
    const text = textFrom(textElement) || textFrom(quoteRoot);
    if (!text) return undefined;
    const authorHandle = readHandle(quoteRoot.querySelector('[data-testid="User-Name"], [data-testid="userName"]') || quoteRoot);
    return { ...(authorHandle ? { authorHandle } : {}), text: text.slice(0, QUOTE_LIMIT), truncated: text.length > QUOTE_LIMIT };
  }

  // Replies in a timeline carry a "回复 @user / Replying to @user" context row
  // above the author name; on a /status/ page, articles after the focused
  // tweet are replies. Neither should be scored.
  function isReplyContext(article) {
    const userName = ownedElements(article, '[data-testid="User-Name"], [data-testid="userName"]')[0];
    if (!userName) return false;
    let node = userName;
    while (node && node !== article) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.querySelector('a[href^="/"]') && /^(回复|replying to)/i.test(normalizeText(sibling.textContent))) return true;
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
    }
    return false;
  }

  function focusedStatusId(document) {
    const pathname = document?.location?.pathname || (typeof location !== "undefined" ? location.pathname : "");
    return String(pathname).match(/^\/[^/]+\/status\/(\d+)/)?.[1] || null;
  }

  function findFocusedArticle(document, statusId) {
    const pattern = new RegExp(`/status/${statusId}(?:[/?#]|$)`);
    for (const candidate of document.querySelectorAll("article")) {
      const hit = Array.from(candidate.querySelectorAll('a[href*="/status/"]'))
        .some((link) => pattern.test(link.getAttribute("href") || ""));
      if (hit) return candidate;
    }
    return null;
  }

  function readMetrics(article) {
    const selectors = {
      replies: '[data-testid="reply"]',
      reposts: '[data-testid="retweet"], [data-testid="unretweet"]',
      likes: '[data-testid="like"], [data-testid="unlike"]',
      views: '[data-testid="viewCount"]'
    };
    const result = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const element = ownedElements(article, selector)[0];
      if (!element) continue;
      const count = parseCount(element.getAttribute("aria-label") || textFrom(element));
      if (count !== undefined) result[name] = count;
    }
    return Object.keys(result).length ? result : undefined;
  }

  class XDomAdapter {
    scan(rootNode) {
      const rootElement = rootNode || document;
      const candidates = [];
      if (rootElement.nodeType === 1 && rootElement.matches?.("article")) candidates.push(rootElement);
      candidates.push(...Array.from(rootElement.querySelectorAll?.("article") || []));
      return [...new Set(candidates)].filter((article) => !article.parentElement?.closest("article") && this.getPostId(article));
    }

    getPostId(article) {
      if (!article?.querySelectorAll) return null;
      const permalink = findPermalink(article);
      return findStatusId(permalink?.getAttribute("href"));
    }

    // Shift the full center row (feed plus secondary sidebar) so the rail gets
    // a lane without narrowing posts or overlapping X's right sidebar.
    laneContainer(article) {
      const column = article?.closest?.('[data-testid="primaryColumn"]') || null;
      if (!column) return null;
      const row = column.parentElement;
      const view = article.ownerDocument?.defaultView;
      const rowStyle = row && view?.getComputedStyle(row);
      const hasSiblingColumn = row && Array.from(row.children).some((child) => child !== column && child.getBoundingClientRect().width >= 300);
      const element = rowStyle?.display === "flex" && rowStyle.flexDirection === "row" && hasSiblingColumn ? row : column;
      return { element, mode: "shift" };
    }

    // Replies/comments are not scored: they carry a reply-context row in
    // timelines, or sit below the focused tweet on /status/ pages.
    isReply(article) {
      if (!article?.ownerDocument) return false;
      if (isReplyContext(article)) return true;
      const statusId = focusedStatusId(article.ownerDocument);
      if (!statusId) return false;
      const focused = findFocusedArticle(article.ownerDocument, statusId);
      if (!focused || focused === article) return false;
      const following = article.ownerDocument.defaultView?.Node?.DOCUMENT_POSITION_FOLLOWING ?? 4;
      return Boolean(focused.compareDocumentPosition(article) & following);
    }

    extract(article) {
      const postId = this.getPostId(article);
      if (!postId) return null;
      const quote = readQuote(article);
      const textElements = ownedElements(article, '[data-testid="tweetText"]')
        .filter((element) => !element.closest('[data-testid="quoteTweet"], blockquote'));
      const joinedText = textElements.map(textFrom).filter(Boolean).join("\n");
      const text = joinedText.slice(0, TEXT_LIMIT);
      if (!text) return null;

      const permalink = findPermalink(article);
      const origin = article.ownerDocument?.location?.origin || "https://x.com";
      const href = permalink?.getAttribute("href");
      let url;
      try {
        url = href ? new URL(href, origin).href : undefined;
      } catch {
        url = undefined;
      }
      const timestamp = ownedElements(article, "time[datetime]")[0]?.getAttribute("datetime") || undefined;
      const author = readAuthor(article);
      const mediaElements = ownedElements(article, "img, video")
        .filter((element) => !element.closest('[data-testid*="Avatar"], [data-testid*="avatar"]'));
      const mediaAltTexts = mediaElements
        .map((element) => normalizeText(element.getAttribute("alt") || element.getAttribute("aria-label")))
        .filter((alt) => alt.length >= 4)
        .filter((alt, index, list) => list.indexOf(alt) === index)
        .slice(0, 20);
      const suspectedCollapsed = ownedElements(article, '[data-testid="tweetText"] a, [data-testid*="show_more"], [data-testid*="show-more"], [data-testid*="showMore"]')
        .some((element) => /show more|显示更多|展开全文|展开/i.test(textFrom(element) || element.getAttribute("aria-label") || ""));
      const extractionQuality = {
        adapterVersion: ADAPTER_VERSION,
        textTruncated: joinedText.length > TEXT_LIMIT,
        quoteTruncated: quote?.truncated === true,
        suspectedCollapsed,
        hasMedia: mediaElements.length > 0,
        mediaAltOnly: mediaElements.length > 0,
        threadContextProvided: false
      };

      return {
        platform: "x",
        postId,
        ...(url ? { url } : {}),
        ...(author.authorName ? { authorName: author.authorName.slice(0, 200) } : {}),
        ...(author.authorHandle ? { authorHandle: author.authorHandle.slice(0, 200) } : {}),
        text,
        ...(quote ? { quotedPost: { ...(quote.authorHandle ? { authorHandle: quote.authorHandle } : {}), text: quote.text } } : {}),
        ...(mediaAltTexts.length ? { mediaAltTexts } : {}),
        ...(timestamp ? { timestamp: timestamp.slice(0, 80) } : {}),
        extractionQuality,
        ...(readMetrics(article) ? { metrics: readMetrics(article) } : {})
      };
    }
  }

  return { XDomAdapter, normalizeText, findStatusId, parseCount };
});
