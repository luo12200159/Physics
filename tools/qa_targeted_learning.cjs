const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const storage = new Map();
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
  document: { addEventListener() {} },
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  }
});
context.window = context;

load("storage-repository.js");

function load(file) {
  vm.runInContext(
    fs.readFileSync(path.join(project, file), "utf8"),
    context,
    { filename: file }
  );
}

load("solution-format.js");
load("curriculum-bank.js");
load("mock-exam-bank.js");
load("original-practice-bank.js");
load("targeted-practice-bank.js");
load("exam-question-index.js");
load("content-catalog.js");
load("learning-engine.js");
load("app.js");

const seeds = vm.runInContext(
  "seedQuestions.map(({ id, grade, content, solution, answer, ...rest }) => "
    + "({ id, grade, content, solution, answer, ...rest }))",
  context
);
const curriculum = context.PHYSICS_CURRICULUM_BANK.questions;
const mock = context.PHYSICS_MOCK_EXAM_BANK.questions;
const original = context.PHYSICS_ORIGINAL_PRACTICE_BANK.questions;
const targeted = context.PHYSICS_TARGETED_PRACTICE_BANK.questions;
const indexes = context.PHYSICS_REAL_EXAM_INDEX.questions;
const catalog = context.PhysicsStudioContentCatalog;
const engine = context.PHYSICS_LEARNING_ENGINE;
const all = [...seeds, ...curriculum, ...mock, ...original, ...targeted, ...indexes];

assert.ok(catalog, "content catalog should be exported");
assert.ok(engine, "learning engine should be exported");

const coverage = catalog.getCoverage(all);
assert.equal(coverage.target, 1900);
assert.equal(coverage.completeQuestions, 1900);
assert.equal(coverage.indexed, 232);
assert.equal(coverage.remaining, 0);
assert.equal(coverage.completionRate, 100);
assert.deepEqual(
  JSON.parse(JSON.stringify(coverage.completeByGrade)),
  { 八年级: 300, 九年级: 500, 高一: 300, 高二: 300, 高三: 500 }
);
assert.equal(all.length, 2132);
assert.equal(new Set(all.map((question) => question.id)).size, all.length);

assert.equal(targeted.length, 400);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.PHYSICS_TARGETED_PRACTICE_BANK.manifest.byGrade)),
  { 九年级: 200, 高三: 200 }
);
assert.equal(context.PHYSICS_TARGETED_PRACTICE_BANK.manifest.modelFamilyCount, 100);
assert.equal(context.PHYSICS_TARGETED_PRACTICE_BANK.manifest.variantsPerFamily, 4);
assert.equal(context.PHYSICS_TARGETED_PRACTICE_BANK.manifest.duplicateCount, 0);
assert.equal(context.PHYSICS_TARGETED_PRACTICE_BANK.manifest.invalidCount, 0);
assert.equal(
  context.PHYSICS_TARGETED_PRACTICE_BANK.manifest.provenance,
  "应用内原创·长沙模拟考结构适配专项；非长沙学校模拟卷原题"
);

const normalizedTargetedContents = new Set();
const targetedIds = new Set();
const families = new Map();
const requiredSolutionSections = ["【考察点】", "【分步解析】", "【最终结论】", "【结果复核】"];
const schoolNames = /(长郡|雅礼|湖南师大附中|长沙市一中|明德中学|周南中学)/;

targeted.forEach((question) => {
  assert.equal(question.source, "物理研习室原创·长沙模拟考结构适配专项", question.id);
  assert.equal(question.sourceLicense, "应用内原创；非长沙学校模拟卷原题", question.id);
  assert.equal(
    question.copyrightNote,
    "本题为应用内原创模型题，未复制第三方试卷题干、图像或答案。",
    question.id
  );
  assert.equal(question.collection, "changsha-targeted-transfer-400", question.id);
  assert.equal(question.syncOrigin, "bundled-targeted-practice", question.id);
  assert.equal(question.originalExercise, true, question.id);
  assert.equal(question.fullTextIncluded, true, question.id);
  assert.equal(question.contentReviewStatus, "应用内原创已发布", question.id);
  assert.equal(question.sourceUrl, "", question.id);
  assert.doesNotMatch(
    `${question.source} ${question.title} ${question.examPaperTitle || ""}`,
    schoolNames,
    question.id
  );
  assert.ok(question.content.trim(), `${question.id}: missing content`);
  assert.ok(question.answer.trim(), `${question.id}: missing answer`);
  assert.ok(Array.isArray(question.examPoints) && question.examPoints.length, question.id);
  requiredSolutionSections.forEach((section) => {
    assert.ok(question.solution.includes(section), `${question.id}: missing ${section}`);
  });
  assert.ok(
    ["core", "near", "far", "counter"].includes(question.variantRole),
    `${question.id}: invalid variant role`
  );
  assert.equal(question.transferGroupId, question.modelFamilyId, question.id);
  assert.equal(catalog.isPublishedQuestion(question), true, question.id);

  assert.equal(targetedIds.has(question.id), false, `duplicate id: ${question.id}`);
  targetedIds.add(question.id);
  const normalized = question.content.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
  assert.equal(
    normalizedTargetedContents.has(normalized),
    false,
    `duplicate normalized stem: ${question.id}`
  );
  normalizedTargetedContents.add(normalized);

  const family = families.get(question.modelFamilyId) || {
    grade: question.grade,
    topic: question.topic,
    roles: new Set(),
    ids: []
  };
  assert.equal(question.grade, family.grade, question.modelFamilyId);
  assert.equal(question.topic, family.topic, question.modelFamilyId);
  family.roles.add(question.variantRole);
  family.ids.push(question.id);
  families.set(question.modelFamilyId, family);
});

assert.equal(targetedIds.size, 400);
assert.equal(normalizedTargetedContents.size, 400);
assert.equal(families.size, 100);
families.forEach((family, familyId) => {
  assert.equal(family.ids.length, 4, `${familyId}: expected four questions`);
  assert.deepEqual(
    [...family.roles].sort(),
    ["core", "counter", "far", "near"],
    `${familyId}: incomplete transfer roles`
  );
});

const state = engine.defaultState();
const grade9A = engine.addProfile(state, {
  name: "九年级学生甲",
  grade: "九年级",
  goal: "中考查漏补缺"
});
const grade9B = engine.addProfile(state, {
  name: "九年级学生乙",
  grade: "九年级",
  goal: "中考查漏补缺"
});
const high3 = engine.addProfile(state, {
  name: "高三学生",
  grade: "高三",
  goal: "高考查漏补缺"
});
const grade9Core = targeted.find((question) => {
  return question.grade === "九年级" && question.variantRole === "core";
});
const high3Core = targeted.find((question) => {
  return question.grade === "高三" && question.variantRole === "core";
});
assert.ok(grade9Core);
assert.ok(high3Core);

const pending = {
  ...grade9Core,
  id: "qa-pending-import",
  modelFamilyId: "qa-pending-family",
  transferGroupId: "qa-pending-family",
  collection: "teacher-document-import",
  syncOrigin: "teacher-document-import",
  originalExercise: false,
  source: "QA上传材料",
  sourceLicense: "用户自行上传；需核验",
  contentReviewStatus: "待教师审核"
};
const questionPool = [
  ...targeted.map((question) => ({
    ...question,
    wrong: question.id === grade9Core.id
  })),
  pending
];
assert.equal(catalog.isPublishedQuestion(pending), false);

for (const count of [3, 5, 7]) {
  const plan = engine.buildTargetedLearningPlan(state, questionPool, {
    profileId: grade9A.id,
    focusTopic: grade9Core.topic,
    count
  });
  assert.equal(plan.profileId, grade9A.id);
  assert.equal(plan.grade, "九年级");
  assert.equal(plan.questionCount, count);
  assert.equal(plan.questionIds.length, count);
  assert.equal(new Set(plan.questionIds).size, count);
  const selected = plan.questionIds.map((id) => questionPool.find((question) => question.id === id));
  assert.ok(selected.every(Boolean), `missing selected question for ${count}-question plan`);
  assert.ok(selected.every((question) => question.grade === "九年级"));
  assert.ok(selected.every((question) => question.id !== pending.id));
  assert.ok(selected.every((question) => catalog.isPublishedQuestion(question)));
  const roles = new Set(plan.items.map((item) => item.variantRole));
  assert.ok(roles.has("core"), `${count}-question plan lacks core`);
  assert.ok(roles.has("near"), `${count}-question plan lacks near transfer`);
  assert.ok(roles.has("counter"), `${count}-question plan lacks counterexample`);
  if (count >= 5) assert.ok(roles.has("far"), `${count}-question plan lacks far transfer`);
}

const grade9Five = engine.buildTargetedLearningPlan(state, questionPool, {
  profileId: grade9A.id,
  focusTopic: grade9Core.topic,
  count: 5
});
const high3Five = engine.buildTargetedLearningPlan(state, questionPool, {
  profileId: high3.id,
  focusTopic: high3Core.topic,
  count: 5
});
const savedGrade9 = engine.saveTargetedLearningPlan(state, grade9Five);
const savedHigh3 = engine.saveTargetedLearningPlan(state, high3Five);
assert.equal(engine.activeLearningPlan(state, grade9A.id).id, savedGrade9.id);
assert.equal(engine.activeLearningPlan(state, high3.id).id, savedHigh3.id);
assert.ok(
  savedHigh3.questionIds
    .map((id) => questionPool.find((question) => question.id === id))
    .every((question) => question.grade === "高三")
);

state.activeProfileId = grade9A.id;
engine.recordAttempt(state, {
  questionId: grade9Core.id,
  topic: grade9Core.topic,
  stage: grade9Core.stage,
  hintLevel: 4,
  finalAnswer: "错误答案",
  grading: { status: "incorrect", score: 0, issues: [] },
  errorType: "建模",
  model: {}
});

const studentARecommendations = engine.recommendations(
  state,
  questionPool,
  400,
  { profileId: grade9A.id }
);
const studentBRecommendations = engine.recommendations(
  state,
  questionPool,
  400,
  { profileId: grade9B.id }
);
const studentAItem = studentARecommendations.find((item) => item.question.id === grade9Core.id);
const studentBItem = studentBRecommendations.find((item) => item.question.id === grade9Core.id);
assert.ok(studentAItem);
assert.ok(studentBItem);
assert.ok(studentAItem.reasons.includes("本人上次作答未完全正确"));
assert.equal(studentBItem.reasons.includes("本人上次作答未完全正确"), false);
assert.equal(studentBItem.score, 8, "global question.wrong must not affect another student");
assert.ok(studentARecommendations.every((item) => item.question.grade === "九年级"));
assert.ok(studentBRecommendations.every((item) => item.question.grade === "九年级"));
assert.equal(studentARecommendations.some((item) => item.question.id === pending.id), false);
assert.equal(studentBRecommendations.some((item) => item.question.id === pending.id), false);

const replacement = engine.buildTargetedLearningPlan(state, questionPool, {
  profileId: grade9A.id,
  focusTopic: grade9Core.topic,
  count: 3
});
const savedReplacement = engine.saveTargetedLearningPlan(state, replacement);
assert.equal(engine.activeLearningPlan(state, grade9A.id).id, savedReplacement.id);
assert.equal(engine.activeLearningPlan(state, high3.id).id, savedHigh3.id);
assert.equal(
  state.learningPlans.find((plan) => plan.id === savedGrade9.id).status,
  "replaced"
);

const dailyForStudentB = engine.dailyTest(state, questionPool, {
  profileId: grade9B.id,
  date: "2026-07-30",
  count: 7
});
assert.equal(dailyForStudentB.questionCount, 7);
assert.ok(dailyForStudentB.items.every((item) => item.question.grade === "九年级"));
assert.equal(
  dailyForStudentB.items.some((item) => item.question.id === pending.id),
  false
);

console.log(JSON.stringify({
  status: "passed",
  completeQuestions: coverage.completeQuestions,
  completeByGrade: coverage.completeByGrade,
  totalStoredRecords: all.length,
  targetedQuestions: targeted.length,
  modelFamilies: families.size,
  rolesPerFamily: 4,
  testedPlanSizes: [3, 5, 7],
  crossStudentIsolation: "passed",
  pendingContentGate: "passed"
}, null, 2));
