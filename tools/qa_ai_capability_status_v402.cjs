const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const gatewaySource = fs.readFileSync(path.join(project, "server", "physics-ai-gateway.mjs"), "utf8");
const variantsRoute = gatewaySource.match(/if \(request\.method === "POST" && request\.url === "\/v1\/physics\/generate-variants"\) \{([\s\S]*?)\n    \}/);
assert.ok(variantsRoute, "variant generation route must exist");
assert.match(variantsRoute[1], /assertStudentConsentVerifierAvailable\(\);[\s\S]*?readJson\(/,
  "server must verify persisted student consent before reading variant-generation content");
const saved = new Map();
const session = new Map();
let healthResponse = { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
let requestCount = 0;
const context = vm.createContext({
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  URL, AbortController, setTimeout, clearTimeout,
  localStorage: {
    getItem(key) { return saved.get(key) ?? null; },
    setItem(key, value) { saved.set(key, String(value)); },
    removeItem(key) { saved.delete(key); }
  },
  sessionStorage: {
    getItem(key) { return session.get(key) ?? null; },
    setItem(key, value) { session.set(key, String(value)); },
    removeItem(key) { session.delete(key); }
  },
  fetch: async () => { requestCount += 1; return healthResponse; }
});
context.window = context;
for (const file of ["storage-repository.js", "ai-tutor.js"]) {
  vm.runInContext(fs.readFileSync(path.join(project, file), "utf8"), context, { filename: file });
}
const tutor = context.PhysicsStudioAITutor;
const question = {
  id: "qa-ai-capability-1", title: "匀变速直线运动", stage: "高中", grade: "高一",
  topic: "匀变速直线运动", content: "初速度 0 m/s，加速度 2 m/s²，2 s 后速度是多少？"
};

(async () => {
  // A configured URL cannot by itself prove that AI tutoring is available.
  const initial = tutor.status();
  assert.equal(initial.ready, false);
  assert.equal(initial.configured, false);
  assert.equal(initial.connectionStatus, "unconfigured");
  assert.equal(initial.capabilities.localHints, "available");
  assert.equal(initial.capabilities.networkTutor, "not-authorized");

  tutor.saveConfig({ endpoint: "https://gateway.example.test", model: "test-model", enabled: true });
  const configured = tutor.status();
  assert.equal(configured.configured, true);
  assert.equal(configured.ready, false);
  assert.equal(configured.connectionStatus, "untested");
  assert.equal(configured.modelVerified, false);

  const unconfirmed = await tutor.tutorTurn({ question, studentWork: "姓名：张伟", minorAgeBand: "unknown" });
  assert.equal(unconfirmed.source, "offline-hint");
  assert.equal(unconfirmed.fallbackReason, "age-unconfirmed");
  assert.match(unconfirmed.feedback, /年龄|授权/);
  assert.equal(requestCount, 0, "unknown age must not send student content");

  const noGuardian = await tutor.tutorTurn({ question, minorAgeBand: "under14", guardianConsentStatus: "pending" });
  assert.equal(noGuardian.fallbackReason, "guardian-consent-required");
  assert.equal(requestCount, 0);

  assert.equal(await tutor.testConnection(), true);
  const reachable = tutor.status();
  assert.equal(reachable.connectionStatus, "reachable");
  assert.equal(reachable.ready, false, "health response alone is not student authorization");
  assert.equal(reachable.modelVerified, false, "health response does not validate model access");

  const grantedButUnverified = await tutor.tutorTurn({
    question, minorAgeBand: "under14", guardianConsentStatus: "granted"
  });
  assert.equal(grantedButUnverified.source, "offline-hint");
  assert.equal(grantedButUnverified.fallbackReason, "server-authorization-unverified");
  assert.match(grantedButUnverified.feedback, /服务端|授权/);
  assert.equal(requestCount, 1, "health test is allowed but student content stays local");

  healthResponse = { ok: true, status: 200, text: async () => JSON.stringify({ ok: false }) };
  assert.equal(await tutor.testConnection(), false);
  assert.equal(tutor.status().connectionStatus, "unreachable");

  tutor.saveConfig({ endpoint: "https://another.example.test", enabled: true });
  assert.equal(tutor.status().connectionStatus, "untested", "new endpoint invalidates prior health result");
  tutor.saveConfig({ endpoint: "", enabled: false });
  assert.equal(tutor.status().connectionStatus, "unconfigured");
  console.log("AI capability status QA passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
