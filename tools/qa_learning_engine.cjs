const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "learning-engine.js"), "utf8");
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
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "learning-engine.js" });

const engine = context.PHYSICS_LEARNING_ENGINE;
assert.ok(engine, "learning engine should be exported");
assert.equal(engine.misconceptionCatalog.length, 8);
assert.ok(engine.formulaCatalog.length >= 20);

const state = engine.defaultState();
assert.equal(state.profiles.length, 1);
assert.equal(state.attempts.length, 0);

const misconception = engine.recordDiagnostic(state, {
  diagnosticId: "diag-force-motion",
  answer: "A",
  reason: "R1",
  confidence: 5
});
assert.equal(misconception.attempt.classification, "stable-misconception");
assert.equal(engine.misconceptionProfile(state)[0].status, "高风险");

const secure = engine.recordDiagnostic(state, {
  diagnosticId: "diag-zero-velocity",
  answer: "B",
  reason: "R2",
  confidence: 5
});
assert.equal(secure.attempt.classification, "secure");

const choiceQuestion = {
  id: "choice-1",
  title: "声现象",
  topic: "声音",
  answer: "选 A。音叉是声源。",
  solution: "音叉振动产生声音。",
  examPoints: ["声源"]
};
assert.equal(engine.gradeFinalAnswer(choiceQuestion, "A").status, "correct");
assert.equal(engine.gradeFinalAnswer(choiceQuestion, "我选 B，因为音叉会振动").status, "incorrect");

const multipleChoiceQuestion = {
  ...choiceQuestion,
  id: "choice-2",
  answer: "选 A、B、D。"
};
assert.equal(engine.gradeFinalAnswer(multipleChoiceQuestion, "A/B/D").status, "correct");

const numericQuestion = {
  id: "numeric-1",
  title: "速度换算",
  topic: "运动",
  answer: "20 m/s",
  solution: "统一单位后比较。",
  examPoints: ["速度"]
};
assert.equal(engine.gradeFinalAnswer(numericQuestion, "72 km/h").status, "correct");
const missingUnit = engine.gradeFinalAnswer(numericQuestion, "20");
assert.equal(missingUnit.status, "partial");
assert.equal(missingUnit.issues[0].type, "missing-unit");
assert.equal(engine.gradeFinalAnswer(numericQuestion, "-20 m/s").issues[0].type, "sign");
assert.equal(engine.gradeFinalAnswer(numericQuestion, "20 kg").issues[0].type, "unit");
const verification = engine.verifyPhysicsAnswer(
  numericQuestion,
  "72 km/h",
  { equations: "v=s/t", reasonableness: "数量级和极限情况合理" }
);
assert.equal(verification.find((item) => item.key === "unit").status, "pass");
assert.equal(verification.find((item) => item.key === "magnitude").status, "pass");
assert.equal(verification.find((item) => item.key === "alternative").status, "manual");

const explanationQuestion = {
  id: "explain-1",
  title: "解释惯性",
  topic: "惯性",
  answer: "物体具有惯性，合力为零时保持匀速直线运动。",
  solution: "依据牛顿第一定律。",
  examPoints: ["牛顿第一定律"]
};
assert.equal(engine.gradeFinalAnswer(explanationQuestion, "依据牛顿第一定律").status, "review-required");

assert.equal(engine.createHintLadder(choiceQuestion).length, 5);
assert.ok(engine.socraticPrompts(choiceQuestion).length >= 5);

const model = {
  object: "研究对象为小车",
  known: "已知初速度 v0",
  unknown: "求撤去推力后的速度 v",
  process: "分为撤去推力前后两个过程",
  assumptions: "忽略阻力，视为质点",
  coordinates: "沿运动方向建立坐标轴，以向右为正方向",
  forces: "受重力和支持力，合力为零",
  equations: "依据牛顿第一定律，v=v0",
  reasonableness: "单位、方向和极限情况均合理"
};
const modelScore = engine.scoreModeling(model);
assert.ok(modelScore.total >= 85);
assert.equal(Object.keys(modelScore.detail).length, 9);

const grading = engine.gradeFinalAnswer(choiceQuestion, "A");
engine.recordAttempt(state, {
  questionId: choiceQuestion.id,
  topic: choiceQuestion.topic,
  stage: "初中",
  durationSeconds: 180,
  confidenceBefore: 3,
  confidenceAfter: 5,
  hintLevel: 1,
  finalAnswer: "A",
  grading,
  model,
  reflection: "检查了研究对象"
});
const summary = engine.summarizeLearning(state, [choiceQuestion]);
assert.equal(summary.completed, 1);
assert.equal(summary.accuracy, 100);
assert.equal(summary.independenceRate, 100);
assert.equal(summary.learningMinutes, 3);
assert.ok(engine.modelingRadar(state).every((axis) => axis.value > 0));

const now = Date.now();
const review = engine.scheduleReview(state, choiceQuestion.id, 0, now);
assert.ok(new Date(review.dueAt).getTime() - now >= 9 * 60 * 1000);
assert.ok(new Date(review.dueAt).getTime() - now <= 11 * 60 * 1000);
assert.equal(engine.dueReviews(state, now).length, 0);
assert.equal(engine.dueReviews(state, now + 11 * 60 * 1000).length, 1);

assert.equal(engine.validateDimension("F=m*a").valid, true);
assert.equal(engine.validateDimension("W=F/t").valid, false);
assert.equal(engine.validateDimension("F=mystery*a").status, "符号待定义");
assert.equal(engine.convertUnit(72, "km/h", "m/s"), 20);
assert.throws(() => engine.convertUnit(1, "kg", "m"));

const regression = engine.linearRegression([
  { x: 0, y: 1 },
  { x: 1, y: 3 },
  { x: 2, y: 5 }
]);
assert.equal(regression.slope, 2);
assert.equal(regression.intercept, 1);
assert.equal(regression.r2, 1);

const questions = [
  { ...choiceQuestion, id: "q1", stage: "高中", grade: "高一", difficulty: "基础", fullTextIncluded: true },
  { ...choiceQuestion, id: "q2", stage: "高中", grade: "高一", difficulty: "进阶", fullTextIncluded: true },
  { ...choiceQuestion, id: "q3", stage: "高中", grade: "高一", difficulty: "挑战", fullTextIncluded: false }
];
const assignment = engine.generateAssignment(questions, { stage: "高中", grade: "高一", count: 10 });
assert.equal(assignment.questionCount, 2);
assert.deepEqual([...assignment.questionIds], ["q1", "q2"]);
assert.equal(assignment.reviewStatus, "教师待审核");

const variants = engine.transferVariants({
  title: "斜面上的物块",
  topic: "受力分析",
  examPoints: ["牛顿第二定律"]
});
assert.equal(variants.length, 3);
assert.ok(variants.some((variant) => variant.type === "反例辨析"));

const recommendations = engine.recommendations(state, questions, 3);
assert.ok(recommendations.length > 0);

const masteryState = engine.defaultState();
const masteryQuestion = {
  id: "mastery-q",
  title: "平抛运动",
  stage: "高中",
  grade: "高一",
  topic: "曲线运动",
  difficulty: "进阶",
  content: "从高处水平抛出小球，求运动时间。",
  solution: "竖直方向使用自由落体规律。",
  answer: "2 s",
  fullTextIncluded: true
};
const correctGrading = { status: "correct", score: 1, issues: [] };
const firstMasteryAttempt = engine.recordAttempt(masteryState, {
  questionId: masteryQuestion.id,
  topic: masteryQuestion.topic,
  stage: masteryQuestion.stage,
  hintLevel: 1,
  finalAnswer: "2 s",
  grading: correctGrading,
  model,
  selfExplanation: "竖直方向满足自由落体规律。"
});
firstMasteryAttempt.createdAt = "2026-07-24T10:00:00.000Z";
firstMasteryAttempt.completedAt = firstMasteryAttempt.createdAt;
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "熟练");
const secondMasteryAttempt = engine.recordAttempt(masteryState, {
  questionId: masteryQuestion.id,
  topic: masteryQuestion.topic,
  stage: masteryQuestion.stage,
  hintLevel: 0,
  finalAnswer: "2 s",
  grading: correctGrading,
  model,
  selfExplanation: "竖直分运动决定下落时间。"
});
secondMasteryAttempt.createdAt = "2026-07-25T10:00:00.000Z";
secondMasteryAttempt.completedAt = secondMasteryAttempt.createdAt;
masteryState.experimentRecords.push({
  id: "transfer-evidence",
  type: "transfer",
  profileId: masteryState.activeProfileId,
  questionId: masteryQuestion.id,
  response: "研究对象仍为小球，改变高度后继续用 h=gt²/2 求时间。",
  verificationStatus: "教师已通过",
  createdAt: "2026-07-25T10:10:00.000Z"
});
engine.scheduleReview(masteryState, masteryQuestion.id, 3, Date.now());
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "已掌握");
const masteryReview = engine.reviewsForProfile(masteryState)[0];
masteryReview.dueAt = new Date(Date.now() - 1000).toISOString();
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "待复习");
engine.recordAttempt(masteryState, {
  questionId: masteryQuestion.id,
  topic: masteryQuestion.topic,
  stage: masteryQuestion.stage,
  hintLevel: 4,
  finalAnswer: "3 s",
  grading: { status: "incorrect", score: 0, issues: [] },
  model,
  selfExplanation: "尚未分清竖直分运动。"
});
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "薄弱");

const audit = engine.auditQuestion({
  title: "水平面上物体的受力与加速度",
  stage: "初中",
  grade: "八年级",
  topic: "力与运动",
  source: "教师自编",
  sourceLicense: "个人原创",
  content: "质量为2 kg的物体受到水平向右10 N拉力和向左4 N摩擦力，求合力大小和方向。",
  solution: "研究对象为物体，由合力定义 F合=F拉-f，结果为6 N，方向向右。",
  answer: "6 N，方向向右。",
  attachments: [],
  fullTextIncluded: true
});
assert.ok(audit.issues.some((issue) => issue.code === "title-question-加速度"));
assert.equal(audit.requiresTeacherReview, true);

const report = engine.createReportPayload(state, questions);
assert.equal(report.format, "physics-learning-profile");
assert.equal(report.summary.completed, 1);
assert.equal(report.attempts.length, 1);

const saved = engine.saveState(state);
assert.equal(engine.loadState().attempts.length, saved.attempts.length);

console.log(JSON.stringify({
  status: "passed",
  misconceptionDiagnostics: engine.misconceptionCatalog.length,
  formulaCount: engine.formulaCatalog.length,
  modelScore: modelScore.total,
  masteryRuleVersion: engine.version,
  contentAuditRisks: audit.errorCount + audit.warningCount,
  reportAttempts: report.attempts.length
}, null, 2));
