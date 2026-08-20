(() => {
  "use strict";

  const root = globalThis;
  const STORAGE_SCHEMA_VERSION = 4;
  const DB_NAME = "physics-study-room-v2";
  const DB_VERSION = 3;
  const DEFAULT_LEARNING_KEY = "physics-learning-loop-v1";
  const ENTITY_STORES = Object.freeze([
    "profiles", "attempts", "diagnosticAttempts", "examRecords", "growthRecords",
    "importedReports", "experimentRecords", "assessmentSessions", "learningPlans",
    "assignments", "broadCoverageChecks", "temporaryLearningGroups",
    "variantSets", "variantAttempts", "variantPresets"
  ]);
  const cache = new Map();
  let writeQueue = Promise.resolve();

  function backend() {
    return root.localStorage || null;
  }

  function rawGetItem(key) {
    const store = backend();
    return store ? store.getItem(String(key)) : null;
  }

  function rawSetItem(key, value) {
    const store = backend();
    if (!store) throw new Error("Storage backend unavailable");
    store.setItem(String(key), String(value));
  }

  function rawRemoveItem(key) {
    const store = backend();
    if (store) store.removeItem(String(key));
  }

  function emitStorageFailure(error, operation = "write") {
    const detail = {
      message: "数据未保存",
      operation,
      errorCode: String(error?.name || "storage-failed"),
      reason: String(error?.message || "本地存储事务失败").slice(0, 300)
    };
    try { root.dispatchEvent?.(new CustomEvent("physics-storage-error", { detail })); } catch (_error) { /* non-browser QA */ }
    return detail;
  }

  function getItem(key) {
    const normalizedKey = String(key);
    if (cache.has(normalizedKey)) return JSON.stringify(cache.get(normalizedKey));
    return rawGetItem(normalizedKey);
  }

  function setItem(key, value) {
    const normalizedKey = String(key);
    if (normalizedKey === DEFAULT_LEARNING_KEY) {
      let state;
      try { state = JSON.parse(String(value)); } catch (error) { throw new Error(`Invalid learning state: ${error.message}`); }
      stageLearningState(normalizedKey, state);
      return;
    }
    rawSetItem(normalizedKey, value);
  }

  function removeItem(key) {
    cache.delete(String(key));
    rawRemoveItem(key);
  }

  function getJson(key, fallback = null) {
    const value = getItem(key);
    if (value == null || value === "") return fallback;
    try { return JSON.parse(value); } catch (_error) { return fallback; }
  }

  function setJson(key, value) {
    setItem(key, JSON.stringify(value));
  }

  function migrateJson(key, migrate) {
    const original = getItem(key);
    if (original == null) return null;
    const pendingKey = `${String(key)}::migration-pending`;
    try {
      const next = migrate(JSON.parse(original));
      rawSetItem(pendingKey, JSON.stringify(next));
      const pending = rawGetItem(pendingKey);
      if (pending == null) throw new Error("Migration write was not persisted");
      cache.set(String(key), next);
      rawRemoveItem(pendingKey);
      return next;
    } catch (error) {
      rawRemoveItem(pendingKey);
      throw error;
    }
  }

  function indexedDbAvailable() {
    return typeof root.indexedDB !== "undefined";
  }

  function openIndexedDb() {
    if (!indexedDbAvailable()) return Promise.reject(new Error("IndexedDB unavailable"));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        ENTITY_STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function stateShell(state = {}) {
    const shell = { ...state };
    ENTITY_STORES.forEach((name) => { delete shell[name]; });
    return shell;
  }

  function lightweightState(state = {}) {
    return {
      version: Number(state.version) || 1,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      indexedDbPrimary: true,
      activeProfileId: String(state.activeProfileId || ""),
      settings: state.settings && typeof state.settings === "object" ? state.settings : {},
      profileIndex: (state.profiles || []).map((profile) => ({
        id: profile.id,
        portableProfileId: profile.portableProfileId,
        name: profile.name,
        grade: profile.grade,
        dataSource: profile.dataSource || "local"
      })),
      updatedAt: state.updatedAt || new Date().toISOString()
    };
  }

  function putStateEntities(state) {
    return openIndexedDb().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(["meta", ...ENTITY_STORES], "readwrite");
      const meta = transaction.objectStore("meta");
      const now = new Date().toISOString();
      meta.put({ key: "storageVersion", value: STORAGE_SCHEMA_VERSION, updatedAt: now });
      meta.put({ key: "stateShell", value: stateShell(state), updatedAt: now });
      ENTITY_STORES.forEach((name) => {
        const store = transaction.objectStore(name);
        store.clear();
        (Array.isArray(state[name]) ? state[name] : []).forEach((record, index) => {
          if (!record || typeof record !== "object") return;
          const id = String(record.id || `${name}-${index}-${Date.now()}`);
          store.put({ ...record, id });
        });
      });
      transaction.oncomplete = () => { db.close(); resolve({ version: STORAGE_SCHEMA_VERSION }); };
      transaction.onerror = () => { const error = transaction.error || new Error("IndexedDB transaction failed"); db.close(); reject(error); };
      transaction.onabort = () => { const error = transaction.error || new Error("IndexedDB transaction aborted"); db.close(); reject(error); };
    }));
  }

  async function readStateEntities() {
    const db = await openIndexedDb();
    try {
      const transaction = db.transaction(["meta", ...ENTITY_STORES], "readonly");
      const shellRecord = await requestResult(transaction.objectStore("meta").get("stateShell"));
      if (!shellRecord?.value) throw new Error("IndexedDB state shell is missing");
      const entityEntries = await Promise.all(ENTITY_STORES.map(async (name) => [
        name,
        await requestResult(transaction.objectStore(name).getAll())
      ]));
      return { ...shellRecord.value, ...Object.fromEntries(entityEntries) };
    } finally {
      db.close();
    }
  }

  async function prepareLearningState(key = DEFAULT_LEARNING_KEY) {
    const normalizedKey = String(key);
    const pendingKey = `${normalizedKey}::idb-write-pending`;
    const pending = rawGetItem(pendingKey);
    const raw = pending || rawGetItem(normalizedKey);
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (error) {
      emitStorageFailure(error, "read");
      throw error;
    }
    if (parsed?.indexedDbPrimary && !pending) {
      try {
        const hydrated = await readStateEntities();
        cache.set(normalizedKey, hydrated);
        return hydrated;
      } catch (error) {
        const backup = rawGetItem(`${normalizedKey}::idb-migration-backup`);
        if (backup) {
          const restored = JSON.parse(backup);
          cache.set(normalizedKey, restored);
          emitStorageFailure(error, "read-recovered-from-backup");
          return restored;
        }
        emitStorageFailure(error, "read");
        throw error;
      }
    }
    if (!parsed) return null;
    cache.set(normalizedKey, parsed);
    if (!indexedDbAvailable()) return parsed;
    const backupKey = `${normalizedKey}::idb-migration-backup`;
    try {
      if (rawGetItem(backupKey) == null) rawSetItem(backupKey, raw);
      await putStateEntities(parsed);
      rawSetItem(normalizedKey, JSON.stringify(lightweightState(parsed)));
      rawSetItem("physics-storage-version-v1", String(STORAGE_SCHEMA_VERSION));
      rawRemoveItem(pendingKey);
      return parsed;
    } catch (error) {
      emitStorageFailure(error, "migration");
      throw error;
    }
  }

  function stageLearningState(key, state) {
    const normalizedKey = String(key || DEFAULT_LEARNING_KEY);
    const snapshot = JSON.parse(JSON.stringify(state));
    cache.set(normalizedKey, snapshot);
    if (!indexedDbAvailable()) {
      try { rawSetItem(normalizedKey, JSON.stringify(snapshot)); } catch (error) { emitStorageFailure(error); throw error; }
      return Promise.resolve({ fallback: "localStorage" });
    }
    const pendingKey = `${normalizedKey}::idb-write-pending`;
    try { rawSetItem(pendingKey, JSON.stringify(snapshot)); } catch (error) {
      emitStorageFailure(error, "stage");
      return Promise.reject(error);
    }
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      try {
        await putStateEntities(snapshot);
        rawSetItem(normalizedKey, JSON.stringify(lightweightState(snapshot)));
        rawSetItem("physics-storage-version-v1", String(STORAGE_SCHEMA_VERSION));
        rawRemoveItem(pendingKey);
        return { saved: true, version: STORAGE_SCHEMA_VERSION };
      } catch (error) {
        emitStorageFailure(error, "write");
        throw error;
      }
    });
    return writeQueue;
  }

  function flush() {
    return writeQueue;
  }

  function migrateStateToIndexedDB(state, legacyKey = DEFAULT_LEARNING_KEY) {
    cache.set(String(legacyKey), state);
    return prepareLearningState(legacyKey);
  }

  function mirrorStateToIndexedDB(state) {
    return stageLearningState(DEFAULT_LEARNING_KEY, state);
  }

  root.PhysicsStudioStorageRepository = Object.freeze({
    getItem,
    setItem,
    removeItem,
    getJson,
    setJson,
    migrateJson,
    storageSchemaVersion: STORAGE_SCHEMA_VERSION,
    indexedDbAvailable,
    prepareLearningState,
    stageLearningState,
    flush,
    migrateStateToIndexedDB,
    mirrorStateToIndexedDB,
    entityStores: ENTITY_STORES
  });
})();
