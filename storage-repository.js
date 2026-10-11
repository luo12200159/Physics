(() => {
  "use strict";

  const root = globalThis;
  const STORAGE_SCHEMA_VERSION = 5;
  const DB_NAME = "physics-study-room-v2";
  const DB_VERSION = 4;
  const DEFAULT_LEARNING_KEY = "physics-learning-loop-v1";
  const ENTITY_STORES = Object.freeze([
    "profiles", "attempts", "diagnosticAttempts", "examRecords", "growthRecords",
    "importedReports", "experimentRecords", "assessmentSessions", "learningPlans",
    "assignments", "broadCoverageChecks", "temporaryLearningGroups",
    "variantSets", "variantAttempts", "variantPresets", "feynmanExplanations"
  ]);
  const cache = new Map();
  let writeQueue = Promise.resolve();
  let revisionSequence = 0;
  let learningFault = null;

  function storageFault() {
    return learningFault
      ? { readOnly: true, reason: learningFault.message }
      : { readOnly: false, reason: "" };
  }

  function enterReadOnlyFault(error, operation = "read") {
    if (!learningFault) {
      learningFault = new Error(`学习档案存储不可读取，已停止学习写入：${String(error?.message || error || "未知错误").slice(0, 200)}`);
      learningFault.name = "LearningStorageReadOnlyError";
    }
    emitStorageFailure(error, operation);
    return learningFault;
  }

  function nextRevision() {
    return `${Date.now()}-${++revisionSequence}-${root.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  }

  function clearPendingRevision(key, revision) {
    const raw = rawGetItem(key);
    if (!raw) return;
    let marker;
    try { marker = JSON.parse(raw); } catch (_error) { return; /* retain legacy recovery data */ }
    if (marker.revision === revision) rawRemoveItem(key);
  }

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
    if (normalizedKey === DEFAULT_LEARNING_KEY && learningFault) throw learningFault;
    if (cache.has(normalizedKey)) return JSON.stringify(cache.get(normalizedKey));
    return rawGetItem(normalizedKey);
  }

  function setItem(key, value) {
    const normalizedKey = String(key);
    if (normalizedKey === DEFAULT_LEARNING_KEY) {
      let state;
      try { state = JSON.parse(String(value)); } catch (error) { throw new Error(`Invalid learning state: ${error.message}`); }
      return stageLearningState(normalizedKey, state);
    }
    rawSetItem(normalizedKey, value);
  }

  function removeItem(key) {
    if (String(key) === DEFAULT_LEARNING_KEY && learningFault) throw learningFault;
    cache.delete(String(key));
    rawRemoveItem(key);
  }

  function getJson(key, fallback = null) {
    const value = getItem(key);
    if (value == null || value === "") return fallback;
    try { return JSON.parse(value); } catch (_error) { return fallback; }
  }

  function setJson(key, value) {
    return setItem(key, JSON.stringify(value));
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

  function putStateEntities(state, revision = nextRevision()) {
    return openIndexedDb().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(["meta", ...ENTITY_STORES], "readwrite");
      transaction.oncomplete = () => { db.close(); resolve({ saved: true, revision, version: STORAGE_SCHEMA_VERSION }); };
      transaction.onerror = () => { const error = transaction.error || new Error("IndexedDB transaction failed"); db.close(); reject(error); };
      transaction.onabort = () => { const error = transaction.error || new Error("IndexedDB transaction aborted"); db.close(); reject(error); };
      const meta = transaction.objectStore("meta");
      const now = new Date().toISOString();
      meta.put({ key: "storageVersion", value: STORAGE_SCHEMA_VERSION, updatedAt: now });
      meta.put({ key: "stateShell", value: stateShell(state), updatedAt: now });
      meta.put({ key: "storageRevision", value: revision, updatedAt: now });
      ENTITY_STORES.forEach((name) => {
        const store = transaction.objectStore(name);
        // An absent collection is not an instruction to destroy existing history.
        if (!Array.isArray(state[name])) return;
        const records = new Map();
        state[name].forEach((record, index) => {
          if (!record || typeof record !== "object") return;
          const id = String(record.id || `${name}-legacy-${index}`);
          records.set(id, { ...record, id });
        });
        const existing = store.getAll();
        existing.onsuccess = () => {
          const previous = new Map(existing.result.map(record => [String(record.id), record]));
          previous.forEach((_record, id) => { if (!records.has(id)) store.delete(id); });
          records.forEach((record, id) => {
            if (JSON.stringify(previous.get(id)) !== JSON.stringify(record)) store.put(record);
          });
        };
      });
    }));
  }

  async function readStateEntities() {
    const db = await openIndexedDb();
    try {
      const transaction = db.transaction(["meta", ...ENTITY_STORES], "readonly");
      const completed = new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB read transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB read transaction aborted"));
      });
      const shellRequest = requestResult(transaction.objectStore("meta").get("stateShell"));
      const revisionRequest = requestResult(transaction.objectStore("meta").get("storageRevision"));
      const entriesRequest = Promise.all(ENTITY_STORES.map(async (name) => [
        name,
        await requestResult(transaction.objectStore(name).getAll())
      ]));
      const [shellRecord, revisionRecord, entityEntries] = await Promise.all([shellRequest, revisionRequest, entriesRequest, completed]);
      if (!shellRecord?.value) return null;
      return { state: { ...shellRecord.value, ...Object.fromEntries(entityEntries) }, revision: revisionRecord?.value };
    } finally {
      db.close();
    }
  }

  async function prepareLearningState(key = DEFAULT_LEARNING_KEY) {
    if (learningFault) throw learningFault;
    const normalizedKey = String(key);
    let operation = "read";
    try {
    const pendingKey = `${normalizedKey}::idb-write-pending`;
    const pending = rawGetItem(pendingKey);
    let marker = null;
    try { marker = pending ? JSON.parse(pending) : null; } catch (_error) { /* validated below */ }
    const revisionMarker = marker?.pending === true && typeof marker.revision === "string";
    const raw = revisionMarker ? rawGetItem(normalizedKey) : pending || rawGetItem(normalizedKey);
    let parsed = null;
    parsed = raw ? JSON.parse(raw) : null;
    const backupKey = `${normalizedKey}::idb-migration-backup`;
    if (parsed?.indexedDbPrimary || (!parsed && (indexedDbAvailable() || rawGetItem(backupKey) != null))) {
        const hydrated = await readStateEntities();
        if (!hydrated && (parsed?.indexedDbPrimary || revisionMarker || rawGetItem(backupKey) != null)) {
          throw new Error("IndexedDB learning state is missing; historical backup remains untouched");
        }
        if (revisionMarker) {
          if (hydrated?.revision !== marker.revision) emitStorageFailure(new Error("上次保存被中断；已恢复最后完成的事务，未提交内容无法恢复"), "interrupted-write");
          clearPendingRevision(pendingKey, marker.revision);
        }
        if (hydrated) cache.set(normalizedKey, hydrated.state);
        else cache.delete(normalizedKey);
        return hydrated?.state || null;
    }
    if (!parsed) { cache.delete(normalizedKey); return null; }
    cache.set(normalizedKey, parsed);
    if (!indexedDbAvailable()) return parsed;
    operation = "migration";
      if (rawGetItem(backupKey) == null) rawSetItem(backupKey, raw);
      await putStateEntities(parsed);
      rawSetItem(normalizedKey, JSON.stringify(lightweightState(parsed)));
      rawSetItem("physics-storage-version-v1", String(STORAGE_SCHEMA_VERSION));
      if (rawGetItem(pendingKey) === pending) rawRemoveItem(pendingKey);
      return parsed;
    } catch (error) {
      throw enterReadOnlyFault(error, operation);
    }
  }

  function stageLearningState(key, state) {
    const normalizedKey = String(key || DEFAULT_LEARNING_KEY);
    if (learningFault) return Promise.reject(learningFault);
    const snapshot = JSON.parse(JSON.stringify(state));
    const revision = nextRevision();
    if (!indexedDbAvailable()) {
      let existing;
      try {
        const raw = rawGetItem(normalizedKey);
        existing = raw ? JSON.parse(raw) : null;
        if (existing?.indexedDbPrimary || (!raw && rawGetItem(`${normalizedKey}::idb-migration-backup`) != null)) {
          throw new Error("IndexedDB-backed learning history is unavailable; localStorage fallback is disabled");
        }
      } catch (error) {
        return Promise.reject(enterReadOnlyFault(error, "read"));
      }
      try { rawSetItem(normalizedKey, JSON.stringify(snapshot)); } catch (error) { emitStorageFailure(error); throw error; }
      cache.set(normalizedKey, snapshot);
      return Promise.resolve({ saved: true, revision, fallback: "localStorage" });
    }
    const pendingKey = `${normalizedKey}::idb-write-pending`;
    try { rawSetItem(pendingKey, JSON.stringify({ pending: true, revision })); } catch (error) {
      emitStorageFailure(error, "stage");
      return Promise.reject(error);
    }
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      try {
        const committed = await putStateEntities(snapshot, revision);
        cache.set(normalizedKey, snapshot);
        rawSetItem(normalizedKey, JSON.stringify(lightweightState(snapshot)));
        rawSetItem("physics-storage-version-v1", String(STORAGE_SCHEMA_VERSION));
        clearPendingRevision(pendingKey, revision);
        return committed;
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

  async function migrateStateToIndexedDB(state, legacyKey = DEFAULT_LEARNING_KEY) {
    const commit = stageLearningState(legacyKey, state);
    await commit;
    return cache.get(String(legacyKey || DEFAULT_LEARNING_KEY));
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
    storageFault,
    enterReadOnlyFault,
    indexedDbAvailable,
    prepareLearningState,
    stageLearningState,
    flush,
    migrateStateToIndexedDB,
    mirrorStateToIndexedDB,
    entityStores: ENTITY_STORES
  });
})();
