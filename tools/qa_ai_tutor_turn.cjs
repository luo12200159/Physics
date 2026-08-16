const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const saved = new Map();
const session = new Map();
const requests = [];
let responseFactory = null;

const context = vm.createContext({
  console,
  Date,
  Math,
  JSON,
  Object,
  Array,
  Map,
  Set,
  RegExp,
  String,
  Number,
  Boolean,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) { return saved.has(key) ? saved.get(key) : null; },
    setItem(key, value) { saved.set(key, String(value)); },
    removeItem(key) { saved.delete(key); }
  },
  sessionStorage: {
    getItem(key) { return session.has(key) ? session.get(key) : null; },
    setItem(key, value) { session.set(key, String(value)); },
    removeItem(key) { session.delete(key); }
  },
  fetch: async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return responseFactory(url, options);
  }
});
context.window = context;
context.PHYSICS_LEARNING_ENGINE = { version: "3.2.0" };

for (const file of ["storage-repository.js", "ai-tutor.js"]) {
  vm.runInContext(fs.readFileSync(path.join(project, file), "utf8"), context, { filename: file });
}

const tutor = context.PhysicsStudioAITutor;
assert.ok(tutor?.tutorTurn, "stateful tutor adapter should be exported");

const question = {
  id: "qa-tutor-1",
  title: "牛顿第二定律",
  stage: "高中",
  grade: "高一",
  topic: "牛顿第二定律",
  content: "质量为2 kg的物体受到6 N合力，求加速度。"
};

(async () => {
  const offline = await tutor.tutorTurn({
    question,
    studentWork: "我不知道从哪里开始",
    hintLevelUsed: 0,
    modeling: {},
    offlineHints: ["先选研究对象", "写出合力", "使用 F=ma"]
  });
  assert.equal(offline.source, "offline-hint");
  assert.equal(offline.hintLevel, 1);
  assert.match(offline.nextPrompt, /研究对象|先选研究对象/);
  assert.equal(offline.canRevealSolution, false);

  tutor.saveConfig({ endpoint: "https://gateway.example.test", enabled: true, accessToken: "session-secret" });
  responseFactory = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        diagnosisType: "model-selection",
        nextPrompt: "请先说明研究对象是谁。",
        hintLevel: 1,
        feedback: "你已识别已知量，下一步先确定研究对象。",
        verification: { checks: ["dimension", "unit"], passed: null },
        canRevealSolution: false,
        reviewRequired: false,
        sessionState: { turn: 1, focus: "object" }
      });
    }
  });
  const online = await tutor.tutorTurn({
    question,
    studentWork: "姓名：张伟\n我认为 a=3 m/s²",
    personalIdentifiers: ["张伟"],
    hintLevelUsed: 0,
    modeling: { object: "物体", equations: "F=ma", unrelated: "drop-me" },
    sessionState: { turn: 0, previousPrompt: "从哪里开始？", privateProfile: "drop-me" }
  });
  assert.equal(online.source, "gateway");
  assert.equal(online.hintLevel, 1);
  assert.equal(requests.at(-1).url, "https://gateway.example.test/v1/physics/tutor-turn");
  assert.doesNotMatch(JSON.stringify(requests.at(-1).body), /张伟|privateProfile|drop-me/);
  assert.equal(requests.at(-1).body.responseSchema.name, "physics_tutor_turn_v1");
  assert.deepEqual(Object.keys(requests.at(-1).body.modeling).sort(), ["equations", "object"]);

  responseFactory = async () => ({ ok: true, status: 200, async text() { return "{}"; } });
  const fallback = await tutor.tutorTurn({
    question,
    studentWork: "继续",
    hintLevelUsed: 2,
    offlineHints: ["方向", "规律", "公式", "局部步骤", "完整解法"]
  });
  assert.equal(fallback.source, "offline-hint");
  assert.equal(fallback.hintLevel, 3);
  assert.equal(fallback.gatewayUnavailable, true);
  assert.equal("error" in fallback, false, "gateway details must not leak into the learning response");

  const explicit = await tutor.tutorTurn({
    question,
    studentWork: "",
    hintLevelUsed: 4,
    revealSolutionRequested: true,
    offlineHints: ["方向", "规律", "公式", "局部步骤", "完整解法"]
  });
  assert.equal(explicit.hintLevel, 5);
  assert.equal(explicit.independentCompletionEligible, false);

  console.log("AI tutor-turn QA passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
