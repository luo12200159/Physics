const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const storage = new MemoryStorage();
storage.setItem("physics-learning-state", "existing-learning-records");
const calls = [];
const window = {
  localStorage: storage,
  sessionStorage: new MemoryStorage(),
  crypto: webcrypto,
  PHYSICS_STUDIO_CLASSROOM_URL: "https://classroom.example",
  fetch: async (url) => {
    calls.push(String(url));
    throw new TypeError("network unavailable");
  },
};
const context = vm.createContext({
  window,
  globalThis: window,
  localStorage: storage,
  navigator: { onLine: true },
  console,
  URL,
  AbortController,
  Uint8Array,
  setTimeout,
  clearTimeout,
});
vm.runInContext(fs.readFileSync(path.join(root, "storage-repository.js"), "utf8"), context);
window.PhysicsStudioStorageRepository = context.PhysicsStudioStorageRepository;
vm.runInContext(fs.readFileSync(path.join(root, "classroom-client.js"), "utf8"), context, {
  filename: "classroom-client.js",
});

async function main() {
  const api = window.PhysicsStudioClassroom;
  await assert.rejects(
    api.createClass({ name: "离线物理一班" }),
    (error) => error?.code === "network_error",
  );
  assert.equal(calls.length, 1, "the client makes one bounded mutation attempt");
  assert.match(calls[0], /\/v1\/classes\/anonymous$/);
  assert.equal(storage.getItem("physics-classroom-local-classes-v1"), null);
  assert.equal(storage.getItem("physics-classroom-owner-capabilities-v1"), null);
  assert.equal(
    storage.getItem("physics-learning-state"),
    "existing-learning-records",
    "class service failure must not remove independent local learning records",
  );
  console.log(JSON.stringify({
    status: "passed",
    networkFailureIsVisible: true,
    fakeClassCreated: false,
    localLearningPreserved: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
