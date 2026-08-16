const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;
const state = engine.defaultState();
const profileId = state.activeProfileId;
const pending = (id, topic = "力") => engine.recordAttempt(state, {
  questionId: id,
  topic,
  finalAnswer: "过程答案",
  selfExplanation: "说明关键规律和适用条件",
  grading: { status: "review-required", score: null, issues: [{ type: "manual" }] }
});
const scored = (id, status, score, topic = "力") => engine.recordAttempt(state, {
  questionId: id,
  topic,
  finalAnswer: "A",
  selfExplanation: "说明关键规律和适用条件",
  grading: { status, score, issues: [] }
});

let summary = engine.summarizeAttemptEvidence([pending("p1")]);
assert.equal(summary.submittedCount, 1);
assert.equal(summary.scoredCount, 0);
assert.equal(summary.correctCount, 0);
assert.equal(summary.pendingReviewCount, 1);
assert.equal(summary.accuracy, null);
summary = engine.summarizeAttemptEvidence([pending("p2"), pending("p3")]);
assert.equal(summary.accuracy, null);
assert.equal(summary.pendingReviewCount, 2);

const correct = scored("c1", "correct", 1);
summary = engine.summarizeAttemptEvidence([correct, pending("p4")]);
assert.equal(summary.accuracy, 100);
assert.equal(summary.scoredCount, 1);
assert.equal(summary.pendingReviewCount, 1);

const incorrect = scored("i1", "incorrect", 0);
summary = engine.summarizeAttemptEvidence([incorrect, pending("p5")]);
assert.equal(summary.accuracy, 0);
assert.equal(summary.scoredCount, 1);
assert.equal(summary.pendingReviewCount, 1);

const partial = scored("partial", "partial", 0.5);
assert.equal(engine.isValidAccuracyEvidence(partial), true, "partial remains a scored accuracy record");
assert.equal(engine.summarizeAttemptEvidence([partial]).accuracy, 0);

const reviewTarget = pending("teacher-review");
assert.equal(engine.isPendingManualReview(reviewTarget), true);
const reviewed = engine.completeManualReview(state, reviewTarget.id, {
  status: "correct",
  score: 1,
  reviewedBy: "teacher-1",
  summary: "教师核对步骤后判定正确"
});
assert.equal(reviewed.grading.status, "correct");
assert.equal(reviewed.grading.manualReview, true);
assert.equal(engine.isPendingManualReview(reviewed), false);
assert.equal(engine.summarizeAttemptEvidence([reviewed]).accuracy, 100);

const placementReviewState = engine.defaultState();
const placementAttempt = engine.recordAttempt(placementReviewState, {
  questionId: "placement-open-1", topic: "实验", finalAnswer: "开放作答",
  selfExplanation: "说明实验变量与结论", grading: { status: "review-required", score: null, issues: [] }
});
placementReviewState.assessmentSessions.push({
  id: "placement-review-session", profileId: placementReviewState.activeProfileId, type: "placement",
  grade: "高一", scopeType: "semester", scopeIds: [], blueprintVersion: "placement-v2",
  questionIds: ["placement-open-1"], startedAt: "2020-01-01T00:00:00.000Z",
  completedAt: placementAttempt.createdAt, submittedCount: 1, scoredCount: 0,
  pendingReviewCount: 1, coverage: {}, status: "needs-review"
});
engine.completeManualReview(placementReviewState, placementAttempt.id, {
  status: "partial", score: 0.5, reviewedBy: "teacher-1", summary: "教师完成摸底开放题复核"
});
assert.equal(placementReviewState.assessmentSessions[0].status, "completed",
  "placement must leave needs-review after all submitted open responses are reviewed");

const pendingState = engine.defaultState();
  engine.recordAttempt(pendingState, { questionId: "e1", topic: "实验", hintLevel: 5, finalAnswer: "步骤", selfExplanation: "实验变量与结论", grading: { status: "review-required", score: null, issues: [] } });
  engine.recordAttempt(pendingState, { questionId: "e2", topic: "实验", hintLevel: 5, finalAnswer: "步骤", selfExplanation: "实验变量与结论", grading: { status: "review-required", score: null, issues: [] } });
const topic = engine.topicPerformance(pendingState, pendingState.activeProfileId)[0];
assert.equal(topic.pendingReviewCount, 2);
assert.equal(topic.accuracy, null);
assert.notEqual(topic.status, "需巩固");
const learning = engine.summarizeLearning(pendingState, []);
assert.equal(learning.pendingReviewCount, 2);
assert.equal(learning.accuracy, null);
assert.equal(learning.trend.length, 0, "pending review must not enter score trend");

console.log(JSON.stringify({ status: "passed", cases: 7, pendingReview: "excluded-from-scored-metrics", teacherTransition: "passed" }, null, 2));
