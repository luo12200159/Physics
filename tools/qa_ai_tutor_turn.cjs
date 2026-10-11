const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const gatewaySource = fs.readFileSync(path.join(project, "server", "physics-ai-gateway.mjs"), "utf8");
const variantGatewayStart = gatewaySource.indexOf("async function generateVariants(");
const variantGatewayEnd = gatewaySource.indexOf("\nasync function analyzeDocument", variantGatewayStart);
const variantGateway = gatewaySource.slice(variantGatewayStart, variantGatewayEnd);
assert.equal((variantGateway.match(/await callOpenAI\(/g) || []).length, 2,
  "variant generation must use separate generation and independent verification calls");
assert.match(variantGateway, /crossVerification/);
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
context.PHYSICS_LEARNING_ENGINE = { version: "3.3.0" };

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
  assert.equal(online.source, "offline-hint");
  assert.equal(online.hintLevel, 1);
  assert.equal(requests.length, 0, "student work must not be sent without server-verified consent");
  assert.doesNotMatch(tutor.redactPersonalData("姓名：张伟", ["张伟"]), /张伟/);

  const aiVariant = (id, role) => ({
    id,
    variantRole: role,
    title: role === "near" ? "近迁移" : "逆向迁移",
    content: "质量为 2 kg 的物体受水平合力作用，请根据给定量求加速度。",
    options: [],
    stage: "高中",
    grade: "高一",
    topic: "牛顿第二定律",
    knowledgePointId: "hs-newton-second-law",
    knowledgePoints: ["牛顿第二定律"],
    examPoints: ["F=ma"],
    questionType: "计算题",
    difficulty: "基础",
    modelDefinitionId: "model-newton-2",
    transferGroupId: "transfer-newton-2",
    independenceGroupId: `independent-${role}`,
    changeSummary: "改变已知量与设问组合",
    relationToParent: "保持牛顿第二定律模型",
    answer: "3 m/s²",
    correctAnswer: "",
    correctAnswers: [],
    solution: "以物体为研究对象，由 F=ma 得 a=F/m=3 m/s²，并核对量纲。",
    solutionDetail: {
      overview: "建立质点动力学模型",
      known: ["m=2 kg", "F=6 N"],
      unknown: "a",
      researchObject: "物体",
      process: "水平匀加速过程",
      laws: [{ name: "牛顿第二定律", condition: "惯性参考系中的质点" }],
      steps: [{ reasoning: "列动力学方程", equation: "F=ma", substitution: "6=2a", result: "a=3 m/s²" }],
      finalAnswer: "3 m/s²",
      checks: ["N/kg=m/s²"],
      pitfalls: ["合力不是某一个分力"],
      parentDifference: "已知量与设问顺序改变"
    },
    crossVerification: {
      passed: true,
      checks: ["独立重算得到 a=3 m/s²", "单位与量纲一致"],
      criticalIssues: [],
      verifier: "independent-second-pass"
    },
    reviewRequired: true
  });
  responseFactory = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        variants: [aiVariant("ai-near", "near"), aiVariant("ai-reverse", "reverse")],
        generationNotes: "两题均经独立求解复核，仍需教师审核。",
        reviewRequired: true
      });
    }
  });
  await assert.rejects(
    tutor.generateVariants({
      question: { ...question, questionType: "计算题", difficulty: "基础" },
      count: 3,
      personalIdentifiers: ["张伟"]
    }),
    /年龄段未确认|服务端尚无持久化学生授权校验/
  );
  assert.equal(requests.length, 0, "variant generation must not send content without verified consent");

  responseFactory = async () => ({
    ok: true,
    status: 200,
    async text() {
      const unsafe = aiVariant("ai-near", "near");
      delete unsafe.crossVerification;
      return JSON.stringify({ variants: [unsafe, aiVariant("ai-reverse", "reverse")], generationNotes: "", reviewRequired: true });
    }
  });
  await assert.rejects(
    tutor.generateVariants({ question: { ...question, questionType: "计算题", difficulty: "基础" }, count: 2 }),
    /年龄段未确认|服务端尚无持久化学生授权校验/
  );

  responseFactory = async () => ({
    ok: true,
    status: 200,
    async text() {
      const conflicted = aiVariant("ai-near", "near");
      conflicted.crossVerification.criticalIssues = ["答案数值与独立重算不一致"];
      return JSON.stringify({
        variants: [conflicted, aiVariant("ai-reverse", "reverse")],
        generationNotes: "",
        reviewRequired: true
      });
    }
  });
  await assert.rejects(
    tutor.generateVariants({ question: { ...question, questionType: "计算题", difficulty: "基础" }, count: 2 }),
    /年龄段未确认|服务端尚无持久化学生授权校验/
  );

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
