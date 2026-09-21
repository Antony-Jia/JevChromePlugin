(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderAutoScroller = api;
})(globalThis, function () {
  "use strict";

  class AutoScroller {
    constructor(options) {
      this.options = options;
      this.enabled = false;
      this.token = 0;
      this.pauseUntil = 0;
      this.processed = new Set();
      this.consecutiveErrors = 0;
    }

    configure(config) {
      this.config = config;
    }

    start() {
      if (this.enabled) return;
      this.enabled = true;
      this.token += 1;
      this.processed.clear();
      this.consecutiveErrors = 0;
      this.options.onState?.({ enabled: true, message: "自动浏览已开启" });
      this.loop(this.token).catch(() => this.stop("自动浏览已暂停"));
    }

    stop(message = "自动浏览已关闭") {
      if (!this.enabled) return;
      this.enabled = false;
      this.token += 1;
      this.options.onState?.({ enabled: false, message });
    }

    pauseForInteraction() {
      if (!this.enabled) return;
      const duration = this.config?.browsing?.pauseAfterInteractionMs || 15000;
      this.pauseUntil = Date.now() + duration;
      this.options.onState?.({ enabled: true, paused: true, message: `检测到操作，暂停 ${Math.ceil(duration / 1000)} 秒` });
    }

    noteAnalysisResult(response) {
      if (!this.enabled) return;
      if (response?.ok) {
        this.consecutiveErrors = 0;
        return;
      }
      const code = response?.error?.code || "UNKNOWN";
      this.consecutiveErrors += 1;
      if (["JEV_UNAUTHORIZED", "JEV_FORBIDDEN", "JEV_RATE_LIMIT", "RATE_LIMIT", "DAILY_BUDGET"].includes(code)) {
        this.stop("Jev 权限、限流或额度已用尽，自动浏览已暂停");
      } else if (this.consecutiveErrors >= 3) {
        this.stop("连续分析失败，自动浏览已暂停");
      }
    }

    async wait(milliseconds, token) {
      const until = Date.now() + milliseconds;
      while (this.enabled && token === this.token && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(20, until - Date.now()))));
      }
    }

    currentItem(items) {
      const visible = items.map((item) => ({ item, rect: item.article.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight)
        .sort((left, right) => left.rect.top - right.rect.top);
      return visible[0]?.item || items[0];
    }

    nextItem(items, current) {
      const index = items.findIndex((item) => item.post.postId === current.post.postId);
      if (index < 0) return undefined;
      const currentTop = current.article.getBoundingClientRect().top;
      return items.slice(index + 1).find((item) => item.article.getBoundingClientRect().top > currentTop + 10);
    }

    async loop(token) {
      while (this.enabled && token === this.token) {
        if (document.visibilityState === "hidden") {
          this.options.onState?.({ enabled: true, paused: true, message: "标签页不可见，自动浏览已暂停" });
          await this.wait(500, token);
          continue;
        }
        if (Date.now() < this.pauseUntil) {
          const remaining = this.pauseUntil - Date.now();
          this.options.onState?.({ enabled: true, paused: true, message: `用户操作后暂停 ${Math.ceil(remaining / 1000)} 秒` });
          await this.wait(Math.min(500, remaining), token);
          continue;
        }

        const items = this.options.getPosts();
        const current = items.length ? this.currentItem(items) : undefined;
        if (!current) {
          window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: "smooth" });
          await this.wait(900, token);
          continue;
        }

        if (!this.processed.has(current.post.postId)) {
          if (this.processed.size >= (this.config?.browsing?.maxPostsPerSession || 100)) {
            this.stop("已达到本次 Session 帖子上限");
            break;
          }
          this.processed.add(current.post.postId);
        }
        this.options.onState?.({ enabled: true, message: `自动浏览 ${this.processed.size} 条帖子` });
        let timeoutId;
        const response = await Promise.race([
          this.options.ensureAnalysis(current),
          new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve({ ok: false, error: { code: "JEV_TIMEOUT", message: "分析等待超时。" } }), this.config?.jev?.timeoutMs || 20000);
          })
        ]);
        clearTimeout(timeoutId);
        if (!response?.ok && ["JEV_UNAUTHORIZED", "JEV_FORBIDDEN", "JEV_RATE_LIMIT", "RATE_LIMIT", "DAILY_BUDGET"].includes(response?.error?.code)) {
          this.stop("Jev 权限、限流或额度已用尽，自动浏览已暂停");
          break;
        }
        await this.wait(this.config?.browsing?.dwellMs || 5000, token);
        if (!this.enabled || token !== this.token) break;
        if (Date.now() < this.pauseUntil) continue;

        const next = this.nextItem(items, current);
        if (next) {
          next.article.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: "smooth" });
        }
        await this.wait(900, token);
      }
    }
  }

  return { AutoScroller };
});
