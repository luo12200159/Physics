const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "learning-engine.js"), "utf8"), context, {
  filename: "learning-engine.js"
});
const engine = context.PHYSICS_LEARNING_ENGINE;

const empty = engine.defaultState();
const noEvidence = engine.buildStudentLearningDiagnosis(empty, []);
assert.equal(noEvidence.sampleStatus, "insufficient");
assert.match(noEvidence.boundary, /样本不足/);
assert.equal(noEvidence.overall.accuracy, null);

const state = engine.defaultState();
const profileId = state.activeProfileId;
const questions = [
  { id: "fraction-1", title: "分数运算一", topic: "分数运算", knowledgePointId: "kp-fraction", grade: "八年级" },
  { id: "fraction-2", title: "分数运算二", topic: "分数运算", knowledgePointId: "kp-fraction", grade: "八年级" },
  { id: "fraction-3", title: "分数运算三", topic: "分数运算", knowledgePointId: "kp-fraction", grade: "八年级" },
  { id: "force-1", title: "受力分析", topic: "受力分析", knowledgePointId: "kp-force", grade: "八年级" }
];
function add(id, status, date, errorType, durationSeconds) {
  const attempt = engine.recordAttempt(state, {
    profileId,
    questionId: id,
    topic: id.startsWith("fraction") ? "分数运算" : "受力分析",
    knowledgePointId: id.startsWith("fraction") ? "kp-fraction" : "kp-force",
    grading: { status, score: status === "correct" ? 1 : 0, issues: [] },
    errorType,
    durationSeconds,
    finalAnswer: status === "correct" ? "正确" : "错误"
  });
  attempt.createdAt = date;
  attempt.completedAt = date;
  return attempt;
}
add("fraction-1", "incorrect", "2026-08-01T09:00:00.000Z", "计算错误", 90);
add("fraction-2", "incorrect", "2026-08-02T09:00:00.000Z", "计算错误", 120);
add("fraction-3", "correct", "2026-08-03T09:00:00.000Z", "", 60);
add("force-1", "correct", "2026-08-03T10:00:00.000Z", "", 30);
const pendingAttempt = engine.recordAttempt(state, {
  profileId,
  questionId: "open-review",
  topic: "分数运算",
  knowledgePointId: "kp-fraction",
  grading: { status: "review-required", score: null, issues: [] },
  finalAnswer: "待教师复核"
});
pendingAttempt.createdAt = "2026-08-03T08:00:00.000Z";
pendingAttempt.completedAt = pendingAttempt.createdAt;

const diagnosis = engine.buildStudentLearningDiagnosis(state, questions, profileId);
assert.equal(diagnosis.sampleStatus, "sufficient");
assert.equal(diagnosis.overall.submittedCount, 5);
assert.equal(diagnosis.overall.scoredCount, 4);
assert.equal(diagnosis.overall.pendingReviewCount, 1);
assert.equal(diagnosis.overall.correctCount, 2);
assert.equal(diagnosis.overall.accuracy, 50);
const fraction = diagnosis.knowledgePoints.find((item) => item.knowledgePointId === "kp-fraction");
assert.ok(fraction);
assert.equal(fraction.attemptCount, 4);
assert.equal(fraction.accuracy, 33);
assert.equal(fraction.wrongCount, 2);
assert.ok(fraction.repeatedErrorCount >= 1);
assert.equal(fraction.lastPracticeAt, "2026-08-03T09:00:00.000Z");
assert.equal(fraction.averageDurationSeconds, 68);
assert.equal(fraction.trend, "unmatched", "缺少模型与难度元数据时不能宣称近期改善");
assert.equal(fraction.matchedPairCount, 0);
const parallelQuestions = questions.map((question) => question.knowledgePointId === "kp-fraction"
  ? { ...question, modelDefinitionId: "model-fraction", difficulty: "基础" }
  : question);
const matched = engine.buildStudentLearningDiagnosis(state, parallelQuestions, profileId)
  .knowledgePoints.find((item) => item.knowledgePointId === "kp-fraction");
assert.equal(matched.trend, "improving", "仅可比的跨日不同题目可显示改善迹象");
assert.ok(matched.matchedEvidenceIds.length >= 2);
assert.ok(diagnosis.priorities.some((item) => item.knowledgePointId === "kp-fraction"));
assert.ok(diagnosis.priorities[0].evidenceIds.length >= 2);

console.log(JSON.stringify({ status: "passed", sampleGuard: "passed", realMetrics: "passed", repeatedErrors: "passed" }, null, 2));
