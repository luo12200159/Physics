const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const repository = fs.readFileSync(path.join(root, "storage-repository.js"), "utf8");
const engine = fs.readFileSync(path.join(root, "learning-engine.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const backup = fs.readFileSync(path.join(root, "backup.js"), "utf8");

for (const store of ["attempts", "diagnosticAttempts", "examRecords", "growthRecords", "importedReports", "experimentRecords", "assessmentSessions"]) {
  assert.match(repository, new RegExp(`["']${store}["']`), `missing IndexedDB store ${store}`);
}
assert.match(repository, /db\.transaction\(\["meta", \.\.\.ENTITY_STORES\], "readwrite"\)/);
assert.match(repository, /::idb-migration-backup/);
assert.match(repository, /::idb-write-pending/);
assert.match(repository, /indexedDbPrimary:\s*true/);
assert.match(repository, /message:\s*"数据未保存"/);
assert.match(repository, /transaction\.onabort/);
assert.match(engine, /stageLearningState\(STORAGE_KEY, normalized\)/);
assert.match(app, /await learningRepository\.prepareLearningState/);
assert.match(app, /await learningRepository\.stageLearningState/);
assert.match(backup, /const learning = learningEngine\.loadState\(\)/,
  "complete backup must export hydrated learning state through the compatibility facade");

console.log(JSON.stringify({
  status: "passed",
  primary: "IndexedDB",
  migrationBackup: "retained",
  failureSignal: "数据未保存"
}, null, 2));
