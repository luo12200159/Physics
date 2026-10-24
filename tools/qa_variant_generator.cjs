const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const storage = new Map();
const context = {
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
  Promise,
  setTimeout,
  clearTimeout,
  document: { addEventListener() {} },
  addEventListener() {},
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  "storage-repository.js",
  "learning-engine.js",
  "curriculum-taxonomy.js",
  "solution-format.js",
  "curriculum-bank.js",
  "mock-exam-bank.js",
  "original-practice-bank.js",
  "targeted-practice-bank.js",
  "variant-generator.js",
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context, { filename: "app.js" });

const engine = context.PHYSICS_LEARNING_ENGINE;
const generator = context.PhysicsStudioVariantGenerator;
const questions = [
  ...vm.runInContext("seedQuestions", context),
  ...(context.PHYSICS_CURRICULUM_BANK?.questions || []),
  ...(context.PHYSICS_MOCK_EXAM_BANK?.questions || []),
  ...(context.PHYSICS_ORIGINAL_PRACTICE_BANK?.questions || []),
  ...(context.PHYSICS_TARGETED_PRACTICE_BANK?.questions || []),
];
assert.ok(engine && generator, "variant QA requires the engine and generator");
assert.equal(questions.length, 1900, "variant QA must cover every bundled complete question");

const domains = [
  ["运动学", /机械运动|运动学|匀变速/],
  ["牛顿运动定律", /牛顿|力与运动|受力/],
  ["功和能", /功与|机械能|能量/],
  ["动量", /动量|碰撞/],
  ["电路", /电路|欧姆定律|电功率/],
  ["电场", /电场|带电粒子在电场/],
  ["磁场", /磁场|洛伦兹力/],
  ["电磁感应", /电磁感应|法拉第/],
  ["热学", /热学|热量|物态变化|内能/],
  ["光学", /光学|光的|透镜/],
  ["机械振动与波", /振动|机械波|声现象/],
  ["实验", /实验|探究|测量/],
];

async function findGoldenSet(pattern) {
  const candidates = questions.filter((question) => pattern.test([
    question.topic,
    question.title,
    ...(question.examPoints || []),
  ].join(" ")));
  for (const parent of candidates) {
    const set = await generator.generateVariantSet(parent, { questions, existingSets: [], count: 3, allowAi: false });
    if (set.variants?.length >= 2 && set.variants[0]?.variantRole === "near") return { parent, set };
  }
  return null;
}

(async () => {
  const golden = [];
  for (const [label, pattern] of domains) {
    const result = await findGoldenSet(pattern);
    assert.ok(result, `${label} must have a deterministic, validated local variant family`);
    golden.push([label, result]);
  }

  for (const [label, { parent, set }] of golden) {
    assert.ok(set.variants.length >= 2 && set.variants.length <= 3, `${label}: only 2-3 variants are allowed`);
    assert.equal(set.status, "approved", `${label}: deterministic sets must be approved only after validation`);
    assert.equal(new Set(set.variants.map((item) => item.id)).size, set.variants.length, `${label}: ids must be unique`);
    assert.equal(set.variants[0].variantRole, "near", `${label} (${parent.id}): first item must be near transfer`);
    for (const variant of set.variants) {
      assert.equal(variant.sourceQuestionId, parent.id, `${label}: parent relation must be traceable`);
      assert.equal(variant.stage, parent.stage, `${label}: stage must not drift`);
      assert.equal(variant.grade, parent.grade, `${label}: grade must not drift`);
      assert.equal(variant.knowledgePointId, parent.knowledgePointId || parent.topicKey || parent.topic, `${label}: knowledge point must remain stable`);
      assert.notEqual(variant.content, parent.content, `${label}: a variant cannot copy the parent stem`);
      assert.ok(variant.title && variant.content && variant.answer && variant.solution, `${label}: complete question fields are required`);
      assert.ok(variant.changeSummary && variant.relationToParent, `${label}: change and relation must be explicit`);
      assert.ok(variant.solutionDetail?.overview && variant.solutionDetail?.finalAnswer, `${label}: structured solution is required`);
      assert.ok(Array.isArray(variant.solutionDetail?.steps) && variant.solutionDetail.steps.length > 0, `${label}: derivation steps are required`);
      variant.solutionDetail.steps.forEach((step) => {
        assert.ok(Object.hasOwn(step, "reasoning") && Object.hasOwn(step, "equation")
          && Object.hasOwn(step, "substitution") && Object.hasOwn(step, "result"), `${label}: each step must expose structured fields`);
      });
      assert.equal(variant.validation?.passed, true, `${label}: critical validation gate must pass`);
      assert.equal(variant.source, "应用内已审核题模变式", `${label}: local source must be truthful`);
    }
  }

  const { parent, set } = golden[0][1];
  const parentSnapshot = JSON.stringify(parent);
  const repeat = await generator.generateVariantSet(parent, { questions, existingSets: [], count: 3, allowAi: false });
  assert.deepEqual(repeat.variants.map((item) => item.id), set.variants.map((item) => item.id), "fixed local bank input must be deterministic");
  assert.equal(JSON.stringify(parent), parentSnapshot, "generation must not mutate the parent question");
  const cached = await generator.generateVariantSet(parent, { questions, existingSets: [set], count: 3, allowAi: false });
  assert.equal(cached.cacheHit, true, "approved set must be reused by cache key");
  assert.equal(generator.isSetStale(set, { ...parent, content: `${parent.content}（已编辑）` }), true, "editing the parent must stale the old set");

  const unavailable = await generator.generateVariantSet({
    id: "qa-unmapped-parent",
    title: "无法映射题模",
    content: "某未收录模型给出完整条件，要求计算一个当前本地题模无法验证的物理量。",
    answer: "待受控服务核验",
    solution: "该题故意不属于本地已审核知识点族，仅用于验证离线失败边界。",
    stage: "高中",
    grade: "高二",
    topic: "qa-unmapped-topic",
    knowledgePointId: "qa-unmapped-topic",
    questionType: "计算题",
    difficulty: "进阶",
  }, { questions, existingSets: [], count: 3, allowAi: false });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.message, "当前没有可验证的完整变式题");

  const state = engine.defaultState();
  const saved = engine.saveVariantSet(state, set);
  if (saved.variants.length === 3) {
    saved.variants[2].approvalStatus = "teacher-rejected";
    assert.equal(engine.variantSetProgress(state, saved.id).total, 2,
      "pending or rejected variants must never enter student training progress");
  }
  const first = saved.variants[0];
  const verified = engine.recordVariantAttempt(state, {
    variantSetId: saved.id,
    variantQuestionId: first.id,
    finalAnswer: first.answer,
    grading: { status: "correct", score: 1, summary: "fixed QA", issues: [] },
    hintLevel: 1,
    solutionViewed: false,
    startedAt: new Date(Date.now() - 30_000).toISOString(),
    completedAt: new Date().toISOString(),
    durationSeconds: 30,
  });
  assert.equal(verified.variantAttempt.verificationStatus, "verified-transfer", "low-hint correct work may become transfer evidence");
  const second = saved.variants[1];
  const revealed = engine.recordVariantAttempt(state, {
    variantSetId: saved.id,
    variantQuestionId: second.id,
    finalAnswer: second.answer,
    grading: { status: "correct", score: 1, summary: "fixed QA", issues: [] },
    hintLevel: 5,
    solutionViewed: true,
    startedAt: new Date(Date.now() - 20_000).toISOString(),
    completedAt: new Date().toISOString(),
    durationSeconds: 20,
  });
  assert.equal(revealed.variantAttempt.verificationStatus, "practice-only", "viewing the full solution cannot create formal transfer evidence");

  const migrated = engine.normalizeState({ ...engine.defaultState(), version: 8, variantSets: undefined, variantAttempts: undefined });
  assert.equal(migrated.version >= 9, true, "v8 state must migrate without data loss");
  assert.equal(migrated.variantSets.length, 0);
  assert.equal(migrated.variantAttempts.length, 0);

  console.log(`Variant generator QA passed: ${golden.length} golden domains, ${questions.length} questions available to the validated local matcher, ${state.variantAttempts.length} evidence links`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
