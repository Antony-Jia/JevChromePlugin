(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JevXReaderJevClient = api;
})(globalThis, function () {
  "use strict";

  class ProviderError extends Error {
    constructor(code, message, retryable, status) {
      super(message);
      this.name = "ProviderError";
      this.code = code;
      this.retryable = retryable;
      this.status = status;
    }
  }

  async function fetchJson(url, options, timeoutMs, prefix) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetch(url, { ...options, signal: controller.signal });
      } catch (error) {
        if (error?.name === "AbortError") throw new ProviderError(`${prefix}_TIMEOUT`, "The request timed out.", false);
        throw new ProviderError(`${prefix}_NETWORK`, "The provider could not be reached.", true);
      }
      if (!response.ok) {
        const status = response.status;
        const code = status === 401 ? `${prefix}_UNAUTHORIZED`
          : status === 403 ? `${prefix}_FORBIDDEN`
            : [429, 432, 433].includes(status) ? `${prefix}_RATE_LIMIT`
              : status >= 500 ? `${prefix}_SERVER_ERROR`
                : `${prefix}_REQUEST_FAILED`;
        const retryable = status === 429 || status >= 500;
        const error = new ProviderError(code, `Provider request failed (HTTP ${status}).`, retryable, status);
        error.retryAfter = response.headers?.get?.("retry-after");
        throw error;
      }
      try {
        return { data: await response.json(), headers: response.headers };
      } catch {
        throw new ProviderError(`${prefix}_BAD_RESPONSE`, "The provider returned invalid JSON.", false, response.status);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function retryDelay(error, attempt) {
    const seconds = error?.retryAfter ? Number(error.retryAfter) : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5000, seconds * 1000);
    return Math.min(2500, 350 * (2 ** attempt));
  }

  async function requestWithRetry(url, options, timeoutMs, prefix, maxAttempts = 2) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await fetchJson(url, options, timeoutMs, prefix);
      } catch (error) {
        if (!(error instanceof ProviderError) || !error.retryable || attempt + 1 >= maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(error, attempt)));
      }
    }
    throw new ProviderError(`${prefix}_REQUEST_FAILED`, "Provider request failed.", false);
  }

  class JevClient {
    constructor(config) {
      this.apiKey = config.apiKey;
      this.model = config.model || "jev-latest";
      this.timeoutMs = config.timeoutMs || 20000;
    }

    async analyze(state, questions) {
      if (!this.apiKey) throw new ProviderError("JEV_NO_API_KEY", "Configure a TypeSafe API key in extension settings.", false);
      const { data } = await requestWithRetry(
        "https://api.typesafe.ai/v1/systemone",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ state, model: this.model, questions })
        },
        this.timeoutMs,
        "JEV"
      );
      return data;
    }
  }

  return { JevClient, ProviderError, fetchJson, requestWithRetry };
});
