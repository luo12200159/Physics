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
const base = { id: "q-base", grade: "高一", topic: "运动", difficulty: "中", modelDefinitionId: "model-motion-1", retestGroupId: "retest-motion-1", content: "题干", solution: "解析", answer: "1", fullTextIncluded: true };
const retest = { ...base, id: "q-retest", evidenceTier: "retest-anchor" };
const base2 = { ...base, id: "q-base-2" };
const retest2 = { ...retest, id: "q-retest-2" };
const base3 = { ...base, id: "q-base-3" };
const retest3 = { ...retest, id: "q-retest-3" };
const plan = { id: "plan-1", profileId, createdAt: "2026-08-08T00:00:00.000Z", focusTopics: ["运动"], focusTopicKeys: [engine.topicKeyForQuestion(base)], baselineEvidenceIds: [], retestEvidenceIds: [] };
const record = (id, questionId, status, score, createdAt) => engine.recordAttempt(state, { id, questionId, topic: "运动", topicKey: engine.topicKeyForQuestion(base), grading: { status, score }, finalAnswer: "1", selfExplanation: "说明规律和适用条件", createdAt, completedAt: createdAt });
// recordAttempt generates IDs; use the generated IDs in the plan after creation.
const before = record("before-input", base.id, "incorrect", 0, "2026-08-07T00:00:00.000Z");
const after = record("after-input", retest.id, "correct", 1, "2026-08-09T00:00:00.000Z");
const before2 = record("before-input-2", base2.id, "incorrect", 0, "2026-08-07T01:00:00.000Z");
const after2 = record("after-input-2", retest2.id, "correct", 1, "2026-08-09T01:00:00.000Z");
const before3 = record("before-input-3", base3.id, "incorrect", 0, "2026-08-08T01:00:00.000Z");
const after3 = record("after-input-3", retest3.id, "correct", 1, "2026-08-10T01:00:00.000Z");
plan.baselineEvidenceIds = [before.id, before2.id, before3.id];
plan.retestEvidenceIds = [after.id, after2.id, after3.id];
const outcome = engine.buildComparableInterventionOutcome(state, plan, [base, retest, base2, retest2, base3, retest3]);
assert.equal(outcome.comparisonStatus, "comparable");
assert.equal(outcome.preScoredCount, 3);
assert.equal(outcome.postScoredCount, 3);
assert.equal(outcome.matchedPairCount, 3);
assert.equal(outcome.preAccuracy, 0);
assert.equal(outcome.postAccuracy, 100);
assert.equal(outcome.delta, 100);
assert.equal(outcome.conclusion, "达标");

const unmatchedPlan = { ...plan, retestEvidenceIds: [after.id] };
const unrelatedQuestion = { ...retest, id: "q-unrelated", modelDefinitionId: "other-model", retestGroupId: "other-group", difficulty: "难" };
const unmatched = engine.buildComparableInterventionOutcome(state, unmatchedPlan, [base, unrelatedQuestion]);
assert.equal(unmatched.comparisonStatus, "unmatched");

const emerging = engine.buildComparableInterventionOutcome(state, {
  ...plan, baselineEvidenceIds: [before.id], retestEvidenceIds: [after.id]
}, [base, retest]);
assert.equal(emerging.comparisonStatus, "emerging");
assert.equal(emerging.delta, null);

const pending = engine.recordAttempt(state, { questionId: retest.id, topic: "运动", grading: { status: "review-required", score: null }, finalAnswer: "过程", selfExplanation: "说明规律和适用条件", createdAt: "2026-08-10T00:00:00.000Z" });
const pendingOutcome = engine.buildComparableInterventionOutcome(state, { ...plan, retestEvidenceIds: [pending.id] }, [base, retest]);
assert.equal(pendingOutcome.postScoredCount, 0);
assert.equal(pendingOutcome.pendingReviewCount, 1);
assert.equal(pendingOutcome.comparisonStatus, "insufficient");

console.log(JSON.stringify({ status: "passed", comparable: outcome, pending: pendingOutcome }, null, 2));
