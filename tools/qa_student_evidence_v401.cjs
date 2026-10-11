"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;
const questions = ["a", "b", "c", "d"].map((id) => ({
  id,
  title: id,
  grade: "高一",
  topic: "匀变速直线运动",
  knowledgePointId: "kp-motion",
  modelDefinitionId: "motion-model",
  difficulty: id === "d" ? "进阶" : "基础",
  questionType: "计算题",
  content: "小车做匀加速运动。",
  answer: "2 m/s",
  solution: "由速度公式计算。"
}));
const newState = () => engine.defaultState();
function add(state, questionId, status, day, score = status === "correct" ? 1 : status === "partial" ? 0.5 : status === "incorrect" ? 0 : null) {
  return engine.recordAttempt(state, {
    questionId,
    topic: "匀变速直线运动",
    knowledgePointId: "kp-motion",
    questionType: "计算题",
    grading: { status, score, issues: [] },
    finalAnswer: "2 m/s",
    createdAt: `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    completedAt: `2026-09-${String(day).padStart(2, "0")}T10:02:00.000Z`
  });
}
const correction = (state, questionId = "a") => engine.questionCorrectionState(state.attempts, state.activeProfileId, questionId);
const topic = (state) => engine.topicEvidenceProfile(state, questions, state.activeProfileId)
  .find((item) => item.topicKey === "kp-motion");

{
  const state = newState();
  add(state, "a", "review-required", 1);
  assert.equal(correction(state).needsCorrection, false);
  assert.equal(correction(state).pendingReviewCount, 1);
  assert.equal(engine.summarizeLearning(state, questions).accuracy, null);
  assert.equal(topic(state).status, "证据不足");
}
{
  const state = newState();
  add(state, "a", "incorrect", 1);
  const pending = add(state, "a", "review-required", 2);
  assert.equal(correction(state).needsCorrection, true);
  assert.equal(correction(state).pendingReviewCount, 1);
  assert.equal(engine.summarizeLearning(state, questions).accuracy, 0);
  engine.completeManualReview(state, pending.id, { status: "correct", score: 1 });
  assert.equal(correction(state).needsCorrection, false);
  assert.equal(correction(state).pendingReviewCount, 0);
  assert.equal(engine.summarizeLearning(state, questions).accuracy, 50);
}
{
  const state = newState();
  add(state, "a", "partial", 1);
  assert.equal(correction(state).needsCorrection, true);
  assert.equal(engine.summarizeLearning(state, questions).scoredCount, 1);
  assert.equal(topic(state).status, "证据不足");
}
for (const count of [1, 2, 3]) {
  const state = newState();
  for (let index = 0; index < count; index += 1) add(state, questions[index].id, "incorrect", index + 1);
  const evidence = topic(state);
  assert.equal(evidence.scoredCount, count);
  assert.equal(evidence.status, count < 3 ? "证据不足" : "需巩固");
  const analysis = engine.studentAnalysis(state, questions);
  assert.equal(analysis.weakest.length, count < 3 ? 0 : 1);
}
{
  const state = newState();
  add(state, "a", "incorrect", 1);
  add(state, "b", "incorrect", 2);
  add(state, "d", "correct", 3);
  const item = engine.buildStudentLearningDiagnosis(state, questions).knowledgePoints[0];
  assert.equal(item.trend, "unmatched");
  assert.equal(item.matchedPairCount, 0);
  assert.equal(item.scoredEvidenceIds.length, 3);
  add(state, "c", "correct", 4);
  const matched = engine.buildStudentLearningDiagnosis(state, questions).knowledgePoints[0];
  assert.ok(matched.matchedPairCount >= 1);
  assert.ok(matched.matchedEvidenceIds.length >= 2);
}
console.log("qa_student_evidence_v401: passed");
