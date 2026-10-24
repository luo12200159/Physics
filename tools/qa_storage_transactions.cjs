const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installQaActivationStub, launchBrowser } = require('./browser-launcher.cjs');

(async () => {
  const browser = await launchBrowser({ headless: true });
  const failures = [];
  try {
    for (const scenario of ['incremental', 'bounded-journal', 'revision-race', 'abort', 'migration', 'legacy-pending', 'explicit-migration', 'migration-race', 'restart', 'interrupted', 'quota', 'quota-error', 'cleanup-error', 'bulk-history', 'read-failure-backup', 'primary-without-idb', 'direct-stage-no-idb', 'failed-stage-cache']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('http://localhost/storage-qa', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
      await page.goto('http://localhost/storage-qa');
      await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'storage-repository.js'), 'utf8') });
      try {
        const result = await page.evaluate(async (scenario) => {
          const repo = PhysicsStudioStorageRepository;
          const key = 'physics-learning-loop-v1';
          const state = { version: 10, profiles: [{ id: 'p', name: 'Student' }], attempts: [{ id: 'a', profileId: 'p', draft: 'image-data'.repeat(50000) }] };
          const check = (ok, message) => { if (!ok) throw new Error(message); };
          const events = [];
          addEventListener('physics-storage-error', e => events.push(e.detail));
          if (scenario === 'explicit-migration') {
            check((await repo.migrateStateToIndexedDB(state))?.attempts[0]?.id === 'a', 'explicit migration ignored supplied state');
            check((await repo.prepareLearningState()).attempts[0].id === 'a', 'explicit migration did not commit supplied state');
            return true;
          }
          if (scenario === 'read-failure-backup') {
            await repo.stageLearningState(key, state);
            const stale = { ...state, attempts: [{ id: 'stale', profileId: 'p' }] };
            localStorage.setItem(key + '::idb-migration-backup', JSON.stringify(stale));
            const before = localStorage.getItem(key);
            const originalOpen = IDBFactory.prototype.open;
            IDBFactory.prototype.open = function () { throw new DOMException('blocked', 'SecurityError'); };
            let readRejected = false;
            try { await repo.prepareLearningState(); } catch { readRejected = true; }
            check(readRejected, 'failed IDB read silently returned stale migration backup');
            check(repo.storageFault?.().readOnly === true, 'failed IDB read did not enter explicit read-only state');
            let writeRejected = false;
            try { await repo.stageLearningState(key, stale); } catch { writeRejected = true; }
            check(writeRejected, 'failed IDB read allowed a new learning write');
            let getRejected = false;
            try { repo.getItem(key); } catch { getRejected = true; }
            check(getRejected, 'failed IDB read exposed stale or unsaved learning state');
            check(localStorage.getItem(key) === before, 'failed IDB read changed the primary pointer');
            check(JSON.parse(localStorage.getItem(key + '::idb-migration-backup')).attempts[0].id === 'stale', 'read failure changed migration backup');
            IDBFactory.prototype.open = originalOpen;
            return true;
          }
          if (scenario === 'primary-without-idb') {
            await repo.stageLearningState(key, state);
            const before = localStorage.getItem(key);
            Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
            let readRejected = false;
            try { await repo.prepareLearningState(); } catch { readRejected = true; }
            check(readRejected, 'IndexedDB-primary pointer was accepted without IndexedDB');
            let writeRejected = false;
            try { await repo.stageLearningState(key, { ...state, attempts: [{ id: 'replacement' }] }); } catch { writeRejected = true; }
            check(writeRejected, 'IndexedDB-primary state fell back to localStorage overwrite');
            check(localStorage.getItem(key) === before, 'fallback overwrote IndexedDB-primary pointer');
            return true;
          }
          if (scenario === 'direct-stage-no-idb') {
            await repo.stageLearningState(key, state);
            const before = localStorage.getItem(key);
            Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
            let writeRejected = false;
            try { await repo.stageLearningState(key, { ...state, attempts: [{ id: 'replacement' }] }); } catch { writeRejected = true; }
            check(writeRejected, 'direct save overwrote an IndexedDB-primary state through localStorage fallback');
            check(localStorage.getItem(key) === before, 'direct save changed the IndexedDB-primary pointer');
            return true;
          }
          if (scenario === 'failed-stage-cache') {
            await repo.stageLearningState(key, state);
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
              if (k === key + '::idb-write-pending') throw new DOMException('quota', 'QuotaExceededError');
              return original.call(this, k, v);
            };
            let writeRejected = false;
            try { await repo.stageLearningState(key, { ...state, attempts: [{ id: 'not-committed' }] }); } catch { writeRejected = true; }
            check(writeRejected, 'quota failure did not reject the write');
            check(JSON.parse(repo.getItem(key)).attempts[0].id === 'a', 'quota failure exposed uncommitted cache snapshot');
            Storage.prototype.setItem = original;
            return true;
          }
          if (scenario === 'migration-race') {
            const migration = repo.migrateStateToIndexedDB(state);
            const followingSave = repo.stageLearningState(key, { ...state, activeProfileId: 'later' });
            check(!(await migration).activeProfileId, 'migration result was replaced by a later queued state');
            await followingSave;
            return true;
          }
          if (scenario === 'migration' || scenario === 'legacy-pending') {
            localStorage.setItem(scenario === 'legacy-pending' ? key + '::idb-write-pending' : key, JSON.stringify(state));
            check((await repo.prepareLearningState()).attempts[0].id === 'a', 'v10 migration lost attempt');
            check(localStorage.getItem(key + '::idb-migration-backup') !== null, 'migration removed original backup');
            check((await repo.prepareLearningState()).version === 10, 'IDB hydration changed state version');
            check(!localStorage.getItem(key + '::idb-write-pending'), 'legacy recovery marker survived successful migration');
            return true;
          }
          if (scenario === 'bounded-journal') {
            const promise = repo.stageLearningState(key, state);
            const marker = localStorage.getItem(key + '::idb-write-pending');
            check(marker && marker.length < 1000, 'pending journal contains full learning/media snapshot');
            await promise;
            return true;
          }
          await repo.stageLearningState(key, state);
          if (scenario === 'incremental') {
            const calls = [];
            for (const name of ['clear', 'put', 'delete']) {
              const original = IDBObjectStore.prototype[name];
              IDBObjectStore.prototype[name] = function (...args) { calls.push([name, this.name, args[0]?.id || args[0]]); return original.apply(this, args); };
            }
            await repo.stageLearningState(key, { ...state, attempts: [...state.attempts, { id: 'b', profileId: 'p' }] });
            check(!calls.some(c => c[0] === 'clear'), 'save clears existing entity stores');
            check(calls.filter(c => c[0] === 'put' && c[1] === 'attempts').length === 1, 'unchanged history rewritten');
            check(!calls.some(c => c[0] === 'put' && c[1] === 'profiles'), 'unchanged profile rewritten');
            await repo.stageLearningState(key, { ...state, attempts: [{ id: 'b', profileId: 'p' }] });
            check((await repo.prepareLearningState()).attempts.length === 1, 'explicit entity deletion ignored');
          } else if (scenario === 'revision-race') {
            const a = repo.stageLearningState(key, { ...state, activeProfileId: 'A' });
            const b = repo.stageLearningState(key, { ...state, activeProfileId: 'B' });
            const markerB = localStorage.getItem(key + '::idb-write-pending');
            const resultA = await a;
            check(localStorage.getItem(key + '::idb-write-pending') === markerB, 'commit A removed pending B');
            const resultB = await b;
            check(resultA.revision && resultB.revision && resultA.revision !== resultB.revision, 'commit revision absent or reused');
          } else if (scenario === 'abort') {
            const original = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) {
              const request = original.apply(this, args);
              if (this.name === 'attempts') request.addEventListener('success', () => this.transaction.abort());
              return request;
            };
            let rejected = false;
            try { await repo.stageLearningState(key, { ...state, attempts: [{ id: 'b' }] }); } catch { rejected = true; }
            check(rejected, 'request success was reported as transaction success');
            check(events.length > 0, 'aborted write did not emit visible error');
            check(JSON.parse(repo.getItem(key)).attempts[0].id === 'a', 'aborted transaction exposed uncommitted cache snapshot');
            IDBObjectStore.prototype.put = original;
            check((await repo.prepareLearningState()).attempts[0].id === 'a', 'abort did not preserve previously committed attempt');
            await repo.stageLearningState(key, { ...state, attempts: [{ id: 'b' }] });
            check((await repo.prepareLearningState()).attempts[0].id === 'b', 'failed save poisoned subsequent retry');
          } else if (scenario === 'restart') {
            localStorage.removeItem(key);
            check((await repo.prepareLearningState())?.attempts[0]?.id === 'a', 'existing IDB data ignored without localStorage pointer');
          } else if (scenario === 'quota') {
            const original = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) { if (v.length > 2000) throw new DOMException('quota', 'QuotaExceededError'); return original.call(this, k, v); };
            await repo.stageLearningState(key, { ...state, activeProfileId: 'p' });
            check(events.length === 0, 'large IDB state still requires full localStorage snapshot');
          } else if (scenario === 'quota-error') {
            Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
            let rejected = false;
            try { await repo.stageLearningState(key, state); } catch { rejected = true; }
            check(rejected && events[0]?.errorCode === 'QuotaExceededError', 'quota failure was not rejected and made visible');
          } else if (scenario === 'cleanup-error') {
            Storage.prototype.removeItem = function () { throw new DOMException('denied', 'SecurityError'); };
            let rejected = false;
            try { await repo.stageLearningState(key, state); } catch { rejected = true; }
            check(rejected && events[0]?.errorCode === 'SecurityError', 'pending cleanup storage error silently swallowed');
          } else if (scenario === 'interrupted') {
            localStorage.setItem(key + '::idb-write-pending', JSON.stringify({ pending: true, revision: 'never-committed' }));
            check((await repo.prepareLearningState()).attempts[0].id === 'a', 'interruption failed to restore committed history');
            check(events.some(e => e.operation === 'interrupted-write'), 'uncommitted revision loss was not reported');
          } else if (scenario === 'bulk-history') {
            const history = Array.from({ length: 10000 }, (_, i) => ({ id: `attempt-${i}`, profileId: 'p', time: '2026-10-11' }));
            await repo.stageLearningState(key, { ...state, attempts: history });
            let writes = 0;
            const original = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) { if (this.name === 'attempts') writes++; return original.apply(this, args); };
            await repo.stageLearningState(key, { ...state, attempts: [...history, { id: 'new-attempt', profileId: 'p' }] });
            check(writes === 1, 'new attempt rewrites 10000-entry history');
            check((await repo.prepareLearningState()).attempts.length === 10001, 'large history lost records');
          }
          return true;
        }, scenario);
        assert.equal(result, true);
        console.log('PASS', scenario);
      } catch (error) { failures.push(scenario); console.error('FAIL', scenario, error.message); }
      await context.close();
    }
    const startupContext = await browser.newContext();
    const startupPage = await startupContext.newPage();
    await installQaActivationStub(startupPage, 'storage-readonly-startup');
    await startupPage.addInitScript(() => {
      const key = 'physics-learning-loop-v1';
      localStorage.setItem(key, JSON.stringify({ version: 10, indexedDbPrimary: true, storageSchemaVersion: 5 }));
      localStorage.setItem(key + '::idb-migration-backup', JSON.stringify({
        version: 10, attempts: [{ id: 'stale-migration-attempt' }], profiles: [{ id: 'student-default' }]
      }));
      const originalOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        if (args[0] === 'physics-study-room-v2') throw new DOMException('blocked', 'SecurityError');
        return originalOpen.apply(this, args);
      };
    });
    await startupPage.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    try {
      await startupPage.locator('#learningStorageReadOnlyFault').waitFor({ state: 'visible', timeout: 10000 });
      const result = await startupPage.evaluate(async () => {
        const repo = PhysicsStudioStorageRepository;
        const engine = PHYSICS_LEARNING_ENGINE;
        let loadRejected = false;
        try { engine.loadState(); } catch { loadRejected = true; }
        let saveRejected = false;
        try { engine.saveState(engine.defaultState()); await engine.awaitLastSave(); } catch { saveRejected = true; }
        return {
          readOnly: repo.storageFault().readOnly,
          loadRejected,
          saveRejected,
          appReady: Boolean(window.PhysicsStudioApp),
          originalPointer: JSON.parse(localStorage.getItem(engine.storageKey)).indexedDbPrimary === true,
          oldBackup: localStorage.getItem(engine.storageKey + '::idb-migration-backup').includes('stale-migration-attempt')
        };
      });
      assert.equal(result.readOnly, true, 'storage startup failure did not enter read-only mode');
      assert.equal(result.loadRejected, true, 'engine converted unreadable history to a blank profile');
      assert.equal(result.saveRejected, true, 'engine accepted a write after startup read failure');
      assert.equal(result.appReady, false, 'app started an editable learning experience after storage failure');
      assert.equal(result.originalPointer && result.oldBackup, true, 'storage startup failure changed source data');
      console.log('PASS fail-closed-app-startup');
    } catch (error) { failures.push('fail-closed-app-startup'); console.error('FAIL fail-closed-app-startup', error.message); }
    await startupContext.close();
  } finally { await browser.close(); }
  assert.deepEqual(failures, [], 'Storage transaction regressions failed');
})().catch(error => { console.error(error); process.exitCode = 1; });
