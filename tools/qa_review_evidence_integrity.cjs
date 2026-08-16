const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(project, "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;

function recordAttempt(state, input = {}) {
  return engine.recordAttempt(state, {
    questionId: input.questionId || "review-question",
    topic: "力与运动",
    hintLevel: input.hintLevel ?? 0,
    finalAnswer: input.finalAnswer ?? "A",
    grading: input.grading || { status: "correct", score: 1, issues: [] },
    confidenceBefore: input.confidenceBefore ?? 3,
    confidenceAfter: input.confidenceAfter ?? 3,
    createdAt: input.completedAt,
    completedAt: input.completedAt,
    selfExplanation: "说明关键规律与适用条件。"
  });
}

const emptyState = engine.defaultState();
assert.throws(
  () => engine.scheduleReview(emptyState, "never-answered", 2, Date.parse("2026-08-01T10:00:00.000Z")),
  /完成新的真实作答/,
  "an unanswered question must not create a review"
);
assert.deepEqual(Object.keys(emptyState.reviews), []);

const blankState = engine.defaultState();
recordAttempt(blankState, {
  finalAnswer: "",
  grading: { status: "incorrect", score: 0, issues: [] },
  completedAt: "2026-08-01T09:59:00.000Z"
});
assert.throws(
  () => engine.scheduleReview(blankState, "review-question", 0, Date.parse("2026-08-01T10:00:00.000Z")),
  /完成新的真实作答/,
  "a stored but blank attempt is not review evidence"
);

const ratingCases = [
  [{ grading: { status: "correct" }, hintLevel: 0 }, 2],
  [{ grading: { status: "correct" }, hintLevel: 1 }, 2],
  [{ grading: { status: "correct" }, hintLevel: 2 }, 1],
  [{ grading: { status: "correct" }, hintLevel: 5 }, 1],
  [{ grading: { status: "partial" }, hintLevel: 0 }, 1],
  [{ grading: { status: "review-required" }, hintLevel: 0 }, 1],
  [{ grading: { status: "incorrect" }, hintLevel: 0 }, 0]
];
ratingCases.forEach(([attempt, expected]) => {
  assert.equal(engine.automaticReviewRating(attempt), expected);
});
assert.equal(
  engine.automaticReviewRating({
    grading: { status: "correct" }, hintLevel: 1,
    confidenceBefore: 1, confidenceAfter: 5, subjectiveDifficulty: "very-hard"
  }),
  engine.automaticReviewRating({
    grading: { status: "correct" }, hintLevel: 1,
    confidenceBefore: 5, confidenceAfter: 1, subjectiveDifficulty: "very-easy"
  }),
  "confidence and subjective difficulty must remain metadata"
);

const subjectiveOverrideState = engine.defaultState();
const incorrectAttempt = recordAttempt(subjectiveOverrideState, {
  grading: { status: "incorrect", score: 0, issues: [] },
  completedAt: "2026-08-01T09:59:00.000Z"
});
const incorrectReviewAt = Date.parse("2026-08-01T10:00:00.000Z");
const subjectiveOverrideReview = engine.scheduleReview(
  subjectiveOverrideState,
  "review-question",
  3,
  incorrectReviewAt
);
assert.equal(subjectiveOverrideReview.lastRating, 0,
  "the legacy numeric rating argument must not override an incorrect attempt");
assert.equal(subjectiveOverrideReview.ratingSource, "automatic-answer-and-hints");
assert.equal(subjectiveOverrideReview.evidenceAttemptId, incorrectAttempt.id);
assert.ok(
  Date.parse(subjectiveOverrideReview.dueAt) - incorrectReviewAt < 11 * 60 * 1000,
  "an incorrect attempt must retain the short retry interval even when rating=3 is supplied"
);

const scheduledState = engine.defaultState();
const firstAttempt = recordAttempt(scheduledState, {
  completedAt: "2026-08-01T09:59:00.000Z",
  hintLevel: 1
});
const firstReview = engine.scheduleReviewFromAttempt(
  scheduledState,
  "review-question",
  firstAttempt.id,
  Date.parse("2026-08-01T10:00:00.000Z")
);
assert.equal(firstReview.lastRating, 2);
assert.equal(firstReview.ratingSource, "automatic-answer-and-hints");
assert.equal(firstReview.evidenceAttemptId, firstAttempt.id);
const firstDueAt = firstReview.dueAt;
assert.throws(
  () => engine.scheduleReview(
    scheduledState,
    "review-question",
    0,
    Date.parse("2026-08-01T11:00:00.000Z")
  ),
  /完成新的真实作答/,
  "one attempt must not refresh dueAt twice"
);
assert.equal(engine.reviewsForProfile(scheduledState)[0].dueAt, firstDueAt);

const nextAttempt = recordAttempt(scheduledState, {
  completedAt: "2026-08-04T10:01:00.000Z",
  hintLevel: 5
});
const nextReview = engine.scheduleReviewFromAttempt(
  scheduledState,
  "review-question",
  nextAttempt.id,
  Date.parse("2026-08-04T10:02:00.000Z")
);
assert.equal(nextReview.lastRating, 1);
assert.equal(nextReview.evidenceAttemptId, nextAttempt.id);
assert.notEqual(nextReview.dueAt, firstDueAt);

const hintFiveState = engine.defaultState();
recordAttempt(hintFiveState, {
  questionId: "hint-five-question",
  completedAt: "2026-08-02T10:00:00.000Z",
  hintLevel: 5
});
const hintFiveSummary = engine.summarizeLearning(hintFiveState, [{
  id: "hint-five-question",
  topic: "力与运动",
  fullTextIncluded: true
}]);
const hintFiveMastery = engine.questionMasteryEvidence(hintFiveState, "hint-five-question");
assert.equal(hintFiveSummary.independenceRate, 0);
assert.equal(hintFiveMastery.independentCorrect, 0);
assert.notEqual(hintFiveMastery.code, "proficient");
assert.notEqual(hintFiveMastery.code, "mastered");

const legacyState = engine.defaultState();
legacyState.reviews["legacy-question"] = {
  questionId: "legacy-question",
  intervalDays: 1,
  ease: 2.3,
  repetitions: 1,
  lapses: 0,
  lastRating: 1,
  lastReviewedAt: "2026-07-01T09:00:00.000Z",
  dueAt: "2026-07-02T09:00:00.000Z"
};
assert.equal(engine.reviewsForProfile(legacyState).length, 1);
assert.equal(engine.dueReviews(legacyState, Date.parse("2026-07-03T00:00:00.000Z")).length, 1);
const legacyAttempt = recordAttempt(legacyState, {
  questionId: "legacy-question",
  completedAt: "2026-07-03T09:00:00.000Z",
  hintLevel: 0
});
const upgradedReview = engine.scheduleReviewFromAttempt(
  legacyState,
  "legacy-question",
  legacyAttempt.id,
  Date.parse("2026-07-03T09:01:00.000Z")
);
assert.equal(legacyState.reviews["legacy-question"], undefined);
assert.equal(legacyState.reviews["student-default::legacy-question"], upgradedReview);
assert.equal(upgradedReview.profileId, "student-default");
assert.equal(upgradedReview.repetitions, 2);
assert.equal(upgradedReview.lastRating, 2);
assert.equal(upgradedReview.evidenceAttemptId, legacyAttempt.id);

const labSource = fs.readFileSync(path.join(project, "learning-lab.js"), "utf8");
assert.doesNotMatch(labSource, /data-review-rating|review-rated/,
  "due review UI must not expose subjective scheduling buttons");
const renderReviewStart = labSource.indexOf("function renderReview()");
const renderToolsStart = labSource.indexOf("function renderTools()");
assert.ok(renderReviewStart >= 0 && renderToolsStart > renderReviewStart,
  "renderReview must remain inspectable");
const renderReviewSource = labSource.slice(renderReviewStart, renderToolsStart);
assert.match(renderReviewSource, /summary\.dueQuestions[\s\S]*?data-start-question=/,
  "a due review must still open the real question workflow");
const completeAttemptStart = labSource.indexOf("async function completeAttempt()");
const saveTransferStart = labSource.indexOf("function saveTransferRecord(");
const playModelStart = labSource.indexOf("function playModel(");
assert.ok(completeAttemptStart >= 0 && saveTransferStart > completeAttemptStart,
  "completeAttempt and saveTransferRecord must remain inspectable");
assert.ok(playModelStart > saveTransferStart,
  "saveTransferRecord must remain inspectable");
const completeAttemptSource = labSource.slice(completeAttemptStart, saveTransferStart);
const saveTransferSource = labSource.slice(saveTransferStart, playModelStart);
assert.match(
  completeAttemptSource,
  /scheduleReviewFromAttempt\(lab\.state, question\.id, attempt\.id\)/,
  "completeAttempt must schedule from the newly recorded attempt evidence id"
);
assert.ok(
  completeAttemptSource.indexOf("engine.recordAttempt")
    < completeAttemptSource.indexOf("engine.scheduleReviewFromAttempt"),
  "review scheduling must happen only after recordAttempt succeeds"
);
assert.ok(
  completeAttemptSource.indexOf("engine.scheduleReviewFromAttempt")
    < completeAttemptSource.indexOf('lab.tab = "transfer"'),
  "review scheduling must happen before entering the transfer page"
);
const reviewScheduleIndex = completeAttemptSource.indexOf("engine.scheduleReviewFromAttempt");
const reviewSaveIndex = completeAttemptSource.indexOf("saveLearningState()", reviewScheduleIndex);
assert.ok(
  reviewSaveIndex > reviewScheduleIndex
    && reviewSaveIndex < completeAttemptSource.indexOf('lab.tab = "transfer"'),
  "the newly scheduled review must be saved before entering the transfer page"
);
assert.doesNotMatch(
  saveTransferSource,
  /scheduleReview(?:FromAttempt)?\(/,
  "saving transfer evidence must not schedule or refresh a review"
);

console.log(JSON.stringify({
  status: "passed",
  cases: 9,
  unansweredBlocked: true,
  duplicateEvidenceBlocked: true,
  subjectiveRatingIgnored: true,
  automaticRatingCases: ratingCases.length,
  hintFiveIndependent: false,
  legacyReviewUpgrade: "passed",
  dueReviewAction: "start-question-only"
}, null, 2));
