(function (root) {
  "use strict";
  const INDEX_KEY = "jev:analysis:index";
  const KEY_PREFIX = "jev:analysis:";
  const MAX_ENTRIES = 500;
  // Conservative byte budget so cache growth stays well below the local quota.
  const MAX_BYTES = 6 * 1024 * 1024;
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function estimateBytes(entry) {
    try {
      return JSON.stringify(entry).length * 2;
    } catch {
      return 0;
    }
  }

  class CacheService {
    constructor(storage, options = {}) {
      this.storage = storage;
      this.schemaVersion = options.schemaVersion;
      this.maxEntries = options.maxEntries || MAX_ENTRIES;
      this.maxBytes = options.maxBytes || MAX_BYTES;
      this.writeTail = Promise.resolve();
    }

    async readIndex() {
      const data = await this.storage.get(INDEX_KEY);
      return Array.isArray(data[INDEX_KEY]) ? data[INDEX_KEY] : [];
    }

    isUsable(entry) {
      if (!entry || !Number.isFinite(entry.createdAt)) return false;
      if (Date.now() - entry.createdAt > TTL_MS) return false;
      if (this.schemaVersion !== undefined && entry.schemaVersion !== this.schemaVersion) return false;
      return true;
    }

    async get(cacheKey) {
      const storageKey = KEY_PREFIX + cacheKey;
      const data = await this.storage.get(storageKey);
      const entry = data[storageKey];
      if (!this.isUsable(entry)) {
        if (entry) await this.remove(cacheKey);
        return null;
      }
      return entry;
    }

    put(cacheKey, entry) {
      const operation = async () => {
        const entryBytes = estimateBytes(entry);
        if (entryBytes > this.maxBytes) return;
        await this.storage.set({ [KEY_PREFIX + cacheKey]: entry });
        const now = Date.now();
        const previous = await this.readIndex();
        const expired = previous.filter((item) => item?.key && (!Number.isFinite(item.createdAt) || now - item.createdAt > TTL_MS));
        const index = previous.filter((item) => item?.key !== cacheKey && Number.isFinite(item?.createdAt) && now - item.createdAt <= TTL_MS);
        index.push({ key: cacheKey, createdAt: entry.createdAt, bytes: entryBytes });
        let totalBytes = index.reduce((sum, item) => sum + (Number.isFinite(item.bytes) ? item.bytes : 0), 0);
        let evicted = [];
        while (index.length > this.maxEntries || totalBytes > this.maxBytes) {
          const removed = index.shift();
          if (!removed) break;
          evicted.push(removed);
          totalBytes -= Number.isFinite(removed.bytes) ? removed.bytes : 0;
        }
        evicted = evicted.filter((item) => item.key !== cacheKey);
        const removedKeys = [...new Set([...expired, ...evicted].map((item) => item?.key).filter((key) => key && key !== cacheKey))];
        if (removedKeys.length) await this.storage.remove(removedKeys.map((key) => KEY_PREFIX + key));
        await this.storage.set({ [INDEX_KEY]: index });
      };
      this.writeTail = this.writeTail.then(operation, operation);
      return this.writeTail;
    }

    remove(cacheKey) {
      const operation = async () => {
        await this.storage.remove(KEY_PREFIX + cacheKey);
        const index = (await this.readIndex()).filter((item) => item?.key !== cacheKey);
        await this.storage.set({ [INDEX_KEY]: index });
      };
      this.writeTail = this.writeTail.then(operation, operation);
      return this.writeTail;
    }
  }

  root.JevXReaderCacheService = { CacheService };
})(globalThis);
