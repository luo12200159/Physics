(() => {
  "use strict";

  const DB_NAME = "physics-studio-db";
  const DB_VERSION = 1;
  const STORE_NAME = "questions";
  let databasePromise = null;
  let cachedQuestions = null;

  function bundledQuestions() {
    const collections = [
      globalThis.PHYSICS_CURRICULUM_BANK?.questions,
      globalThis.PHYSICS_MOCK_EXAM_BANK?.questions,
      globalThis.PHYSICS_ORIGINAL_PRACTICE_BANK?.questions,
      globalThis.PHYSICS_TARGETED_PRACTICE_BANK?.questions,
    ];
    const byId = new Map();
    for (const collection of collections) {
      for (const question of Array.isArray(collection) ? collection : []) {
        if (!question?.id || question.resourceOnly || question.fullTextIncluded === false) continue;
        byId.set(String(question.id), { ...question });
      }
    }
    return [...byId.values()];
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("题库数据库无法打开。"));
    });
    return databasePromise;
  }

  async function storedQuestions() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("本机题库读取失败。"));
    });
  }

  async function replaceStoredQuestions(questions) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const question of questions) {
        if (question?.id) store.put(question);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("本机题库写入失败。"));
      transaction.onabort = () => reject(transaction.error || new Error("本机题库事务已中止。"));
    });
  }

  async function loadQuestions(force = false) {
    if (cachedQuestions && !force) return cachedQuestions.map((item) => ({ ...item }));
    const byId = new Map(bundledQuestions().map((item) => [String(item.id), item]));
    for (const question of await storedQuestions()) {
      if (!question?.id || question.resourceOnly || question.fullTextIncluded === false) continue;
      byId.set(String(question.id), { ...question });
    }
    cachedQuestions = [...byId.values()].sort((left, right) => {
      return String(left.grade || "").localeCompare(String(right.grade || ""), "zh-CN")
        || String(left.topic || "").localeCompare(String(right.topic || ""), "zh-CN")
        || String(left.id).localeCompare(String(right.id));
    });
    return cachedQuestions.map((item) => ({ ...item }));
  }

  async function getQuestion(questionId) {
    const questions = await loadQuestions();
    return questions.find((item) => item.id === questionId) || null;
  }

  async function restoreCompleteBackup(questions, learningState) {
    const previous = await storedQuestions();
    const engine = globalThis.PHYSICS_LEARNING_ENGINE;
    const previousLearning = engine?.loadState?.();
    try {
      await replaceStoredQuestions(questions);
      if (engine && learningState) engine.saveState(engine.normalizeState(learningState));
      cachedQuestions = null;
      return { restored: questions.length };
    } catch (error) {
      await replaceStoredQuestions(previous);
      if (engine && previousLearning) engine.saveState(previousLearning);
      cachedQuestions = null;
      throw error;
    }
  }

  function backupAdapter() {
    return {
      getQuestions: () => cachedQuestions?.map((item) => ({ ...item })) || [],
      restoreCompleteBackup,
    };
  }

  async function downloadBlob(blob, fileName) {
    const bridge = globalThis.PhysicsStudioAndroid;
    if (bridge?.saveBase64File) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      bridge.saveBase64File(fileName, blob.type || "application/octet-stream", btoa(binary));
      return;
    }
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  async function exportBackup() {
    const engine = globalThis.PHYSICS_LEARNING_ENGINE;
    if (!globalThis.PhysicsStudioBackup || !engine) throw new Error("备份模块尚未加载。 ");
    cachedQuestions = await loadQuestions();
    const result = await globalThis.PhysicsStudioBackup.create(backupAdapter(), engine);
    const date = new Date().toISOString().slice(0, 10);
    await downloadBlob(result.blob, `费曼物理完整备份-${date}.pslab`);
    return result.manifest;
  }

  async function importBackup(file) {
    const engine = globalThis.PHYSICS_LEARNING_ENGINE;
    if (!globalThis.PhysicsStudioBackup || !engine) throw new Error("备份模块尚未加载。 ");
    cachedQuestions = await loadQuestions();
    const result = await globalThis.PhysicsStudioBackup.restore(file, backupAdapter(), engine);
    cachedQuestions = null;
    await loadQuestions(true);
    return result;
  }

  globalThis.FeynmanDualAppData = Object.freeze({
    version: 1,
    loadQuestions,
    getQuestion,
    restoreCompleteBackup,
    exportBackup,
    importBackup,
  });
})();
