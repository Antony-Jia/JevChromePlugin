const assert = require("node:assert/strict");
const test = require("node:test");

require("../src/background/cache-service.js");
const { CacheService } = globalThis.JevXReaderCacheService;

class MemoryStorage {
  constructor(initial = {}) {
    this.data = { ...initial };
  }

  async get(key) {
    return { [key]: this.data[key] };
  }

  async set(values) {
    Object.assign(this.data, values);
  }

  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
  }
}

test("cache writes remove expired payloads as well as stale index entries", async () => {
  const expiredAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const storage = new MemoryStorage({
    "jev:analysis:index": [{ key: "expired", createdAt: expiredAt }],
    "jev:analysis:expired": { createdAt: expiredAt, result: { postId: "1" } }
  });
  const cache = new CacheService(storage);

  await cache.put("fresh", { createdAt: Date.now(), result: { postId: "2" } });

  assert.equal(storage.data["jev:analysis:expired"], undefined);
  assert.deepEqual(storage.data["jev:analysis:index"].map((item) => item.key), ["fresh"]);
  assert.equal(storage.data["jev:analysis:fresh"].result.postId, "2");
});
