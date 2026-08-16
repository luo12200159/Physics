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

function question(id) {
  return {
    id,
    grade: "九年级",
    topic: "欧姆定律",
    knowledgePointId: "kp:欧姆定律",
    questionType: "choice",
    content: "电路题",
    solution: "先识别模型，再列式。",
    answer: "A",
    fullTextIncluded: true,
    published: true,
    diagnosticEligible: true,
    evidenceTier: "diagnostic-anchor"
  };
}

function attempt(state, questionId, status = "correct") {
  return engine.recordAttempt(state, {
    questionId,
    topic: "欧姆定律",
    topicKey: "kp:欧姆定律",
    questionType: "choice",
    grading: { status, score: status === "review-required" ? null : status === "correct" ? 1 : 0 },
    finalAnswer: "A",
    completedAt: new Date().toISOString()
  });
}

const questions = [question("placement-q1"), question("placement-q2"), question("placement-q3")];
const fresh = engine.defaultState();
fresh.profiles[0].grade = "九年级";
assert.equal(engine.placementStatus(fresh).status, "not-started");
attempt(fresh, "ordinary-practice");
assert.equal(engine.placementStatus(fresh).status, "legacy-unknown", "ordinary work must not complete placement");

const broadOnly = engine.defaultState();
broadOnly.profiles[0].grade = "九年级";
engine.recordBroadCoverageCheck(broadOnly, { profileId: broadOnly.activeProfileId, questionIds: ["broad-q1"] });
assert.equal(engine.placementStatus(broadOnly).status, "legacy-unknown", "broad checks are not placement sessions");

const state = engine.defaultState();
state.profiles[0].grade = "九年级";
const blueprint = { profileId: state.activeProfileId, items: questions.map((item) => ({ id: item.id })), blueprintVersion: "placement-test" };
const session = engine.startPlacementAssessment(state, blueprint);
assert.equal(engine.placementStatus(state).status, "in-progress");
attempt(state, questions[0].id);
assert.equal(engine.placementStatus(state).submittedCount, 1);
assert.equal(engine.placementStatus(state).status, "in-progress");
attempt(state, questions[1].id);
attempt(state, questions[2].id);
engine.completePlacementAssessment(state, session.id);
assert.equal(engine.placementStatus(state).status, "completed");

const reviewState = engine.defaultState();
reviewState.profiles[0].grade = "九年级";
const reviewSession = engine.startPlacementAssessment(reviewState, blueprint);
questions.forEach((item) => attempt(reviewState, item.id, "review-required"));
engine.completePlacementAssessment(reviewState, reviewSession.id);
const reviewStatus = engine.placementStatus(reviewState);
assert.equal(reviewStatus.status, "needs-review");
assert.equal(reviewStatus.pendingReviewCount, 3);

console.log(JSON.stringify({
  status: "passed",
  ordinaryEvidence: "legacy-unknown",
  broadCoverage: "legacy-unknown",
  incompleteSession: "in-progress",
  completedSession: "completed",
  pendingSession: "needs-review"
}, null, 2));
