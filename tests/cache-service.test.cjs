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

test("entries with a mismatched schema version are treated as misses", async () => {
  const storage = new MemoryStorage({
    "jev:analysis:index": [{ key: "old", createdAt: Date.now() }],
    "jev:analysis:old": { createdAt: Date.now(), schemaVersion: 1, result: { postId: "1" } }
  });
  const cache = new CacheService(storage, { schemaVersion: 2 });

  assert.equal(await cache.get("old"), null);
  assert.equal(storage.data["jev:analysis:old"], undefined);
});

test("byte budget evicts oldest entries once the cap is exceeded", async () => {
  const storage = new MemoryStorage();
  const cache = new CacheService(storage, { schemaVersion: 2, maxBytes: 4000 });
  const big = "x".repeat(800);
  await cache.put("a", { schemaVersion: 2, createdAt: Date.now() - 3000, result: { postId: "a", big } });
  await cache.put("b", { schemaVersion: 2, createdAt: Date.now() - 2000, result: { postId: "b", big } });
  await cache.put("c", { schemaVersion: 2, createdAt: Date.now() - 1000, result: { postId: "c", big } });
  await cache.put("d", { schemaVersion: 2, createdAt: Date.now(), result: { postId: "d", big } });

  assert.equal(await cache.get("a"), null);
  assert.equal(await cache.get("b"), null);
  assert.ok(await cache.get("c"));
  assert.ok(await cache.get("d"));
});
