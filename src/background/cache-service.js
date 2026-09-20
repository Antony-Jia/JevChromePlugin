(function (root) {
  "use strict";
  const INDEX_KEY = "jev:analysis:index";
  const KEY_PREFIX = "jev:analysis:";
  const MAX_ENTRIES = 500;
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;

  class CacheService {
    constructor(storage) {
      this.storage = storage;
      this.writeTail = Promise.resolve();
    }

    async readIndex() {
      const data = await this.storage.get(INDEX_KEY);
      return Array.isArray(data[INDEX_KEY]) ? data[INDEX_KEY] : [];
    }

    async get(cacheKey) {
      const storageKey = KEY_PREFIX + cacheKey;
      const data = await this.storage.get(storageKey);
      const entry = data[storageKey];
      if (!entry || !Number.isFinite(entry.createdAt) || Date.now() - entry.createdAt > TTL_MS) {
        if (entry) await this.remove(cacheKey);
        return null;
      }
      return entry;
    }

    put(cacheKey, entry) {
      const operation = async () => {
        await this.storage.set({ [KEY_PREFIX + cacheKey]: entry });
        const now = Date.now();
        const previous = await this.readIndex();
        const expired = previous.filter((item) => item?.key && (!Number.isFinite(item.createdAt) || now - item.createdAt > TTL_MS));
        const index = previous.filter((item) => item?.key !== cacheKey && Number.isFinite(item?.createdAt) && now - item.createdAt <= TTL_MS);
        index.push({ key: cacheKey, createdAt: entry.createdAt });
        const evicted = index.splice(0, Math.max(0, index.length - MAX_ENTRIES));
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
