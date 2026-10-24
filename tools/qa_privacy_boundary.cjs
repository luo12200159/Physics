const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const versionSource = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
let uuidCounter = 0;
const context = {
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};
context.window = context;
context.globalThis = context;
context.PHYSICS_STUDIO_VERSION = versionSource;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "learning-engine.js"), "utf8"), context);
context.PhysicsStudioStorageRepository = { getJson: () => null, setJson: () => {} };
vm.runInContext(fs.readFileSync(path.join(root, "ai-tutor.js"), "utf8"), context);

const engine = context.PHYSICS_LEARNING_ENGINE;
const state = engine.defaultState();
const profile = state.profiles[0];
profile.minorAgeBand = "under14";
profile.guardianConsentStatus = "unknown";
assert.throws(() => engine.buildLearningSyncPayload(state, [], profile.id), /监护人授权/);
assert.throws(() => engine.buildExamSyncPayload(state, profile.id), /监护人授权/);
assert.throws(() => engine.buildLearningSyncPayload(state, [], "missing-profile"), /无法匹配/);

profile.guardianConsentStatus = "granted";
const payload = engine.buildLearningSyncPayload(state, [], profile.id);
assert.equal(payload.profile.clientEntityId, profile.portableProfileId);
assert.match(payload.profile.curriculumVersion, new RegExp(`${versionSource.appVersion.replaceAll(".", "\\.")}$`));
profile.guardianConsentStatus = "withdrawn";
assert.throws(() => engine.buildLearningSyncPayload(state, [], profile.id), /撤回/);

const ai = context.PhysicsStudioAITutor;
const redacted = ai.redactPersonalData("姓名：张伟，学号：A001，电话13800138000，邮箱a@example.com", ["张伟"]);
assert.doesNotMatch(redacted, /张伟|13800138000|a@example\.com/);
assert.match(redacted, /已脱敏/);

console.log(JSON.stringify({ status: "passed", cloudConsentGuard: true, aiRedaction: true }, null, 2));
