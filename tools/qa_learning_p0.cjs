const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise the calendar rule in the user timezone requested by the product.
process.env.TZ = "Asia/Shanghai";
const projectRoot = path.resolve(__dirname, "..");
const storage = new Map();
let failMigrationWrite = false;
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
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => {
      if (failMigrationWrite && String(key).includes("::migration-pending")) {
        throw new Error("simulated migration write failure");
      }
      storage.set(key, String(value));
    },
    removeItem: (key) => storage.delete(key)
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "storage-repository.js"), "utf8"), context, { filename: "storage-repository.js" });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;

assert.equal(
  engine.localCalendarDateKey(new Date("2026-08-08T00:30:00+08:00")),
  "2026-08-08",
  "local calendar date must not roll back at UTC+8 midnight"
);

const examState = engine.defaultState();
assert.throws(() => engine.addExamRecord(examState, {
  title: "占位试卷",
  score: "",
  totalScore: ""
}));
assert.equal(examState.examRecords.length, 0, "blank exam fields must not create a record");
assert.throws(() => engine.addExamRecord(examState, { score: 81, totalScore: 80 }));
assert.equal(examState.examRecords.length, 0, "invalid score range must not create a record");

const questions = [
  { id: "q-motion", grade: "高一", topic: "运动", content: "题干", solution: "解析", answer: "A" },
  { id: "q-force", grade: "高一", topic: "力", content: "题干", solution: "解析", answer: "A" }
];
const imported = {
  format: "physics-learning-profile",
  version: 2,
  profile: { id: "source-profile-1", name: "学生甲", grade: "高一" },
  attempts: [{
    id: "source-attempt-1",
    questionId: "q-motion",
    topic: "运动",
    grading: { status: "correct", score: 1 },
    hintLevel: 0,
    createdAt: "2026-08-08T00:30:00+08:00",
    completedAt: "2026-08-08T00:30:00+08:00"
  }],
  examRecords: [{
    id: "source-exam-1",
    title: "期中测试",
    examDate: "2026-08-08",
    score: 80,
    totalScore: 100,
    weakTopics: ["运动", "力"]
  }]
};
const importState = engine.defaultState();
const firstImport = engine.importLearningProfile(importState, imported);
const secondImport = engine.importLearningProfile(importState, imported);
assert.equal(firstImport.profile.id, secondImport.profile.id);
assert.equal(importState.profiles.length, 2, "reimport must not create a second student");
assert.equal(importState.attempts.length, 1, "reimport must not duplicate attempts");
assert.equal(importState.examRecords.length, 1, "reimport must not duplicate exams");

const catalog = engine.topicCatalog(questions, "高一");
const mapped = engine.normalizeTopic("运动", { catalog });
assert.equal(mapped.unresolved, false);
assert.ok(mapped.key);
const unresolvedExam = engine.resolveExamRecordTopics({ grade: "高一", weakTopics: ["不存在的知识点"] }, questions);
assert.deepEqual(Array.from(unresolvedExam.unresolvedWeakTopics), ["不存在的知识点"]);

const evidence = engine.knowledgePointEvidenceSummary(importState, questions);
assert.equal(evidence.totalKnowledgePoints, 2);
assert.equal(evidence.evidencedKnowledgePoints, 2, "formal attempt and exam evidence should be traceable");
assert.equal(evidence.coverageLabel, "2/2");
assert.ok(["局部证据", "覆盖较充分"].includes(evidence.levelLabel));

const modelingState = engine.defaultState();
const simpleAttempt = engine.recordAttempt(modelingState, {
  questionId: "simple",
  topic: "运动",
  applicableDimensions: [],
  grading: { status: "correct", score: 1 },
  finalAnswer: "A"
});
assert.equal(simpleAttempt.modelScore.total, null, "non-modeling questions must not receive a modeling score");
assert.equal(simpleAttempt.modelingRecordNeedsCheck, false);
assert.equal(
  engine.masteryDisplayLabel(engine.questionMasteryEvidence(modelingState, "simple")),
  "已有独立正确证据",
  "a single independent correct answer must not display as 熟练"
);

const diagnosticItem = engine.misconceptionCatalog[0];
const wrongAnswer = diagnosticItem.diagnostic.choices.find(([key]) => key !== diagnosticItem.diagnostic.correctAnswer)[0];
const wrongReason = diagnosticItem.diagnostic.reasons.find(([key]) => key !== diagnosticItem.diagnostic.correctReason)[0];
const singleDiagnosticState = engine.defaultState();
const singleDiagnostic = engine.recordDiagnostic(singleDiagnosticState, {
  diagnosticId: diagnosticItem.diagnostic.id,
  answer: wrongAnswer,
  reason: wrongReason,
  confidence: 5
});
assert.equal(singleDiagnostic.attempt.classification, "high-confidence-error");
assert.notEqual(
  engine.misconceptionProfile(singleDiagnosticState).find((item) => item.code === singleDiagnostic.attempt.misconceptionCode).status,
  "稳定误概念风险",
  "one high-confidence error must not be a stable misconception risk"
);

const lowConfidenceState = engine.defaultState();
const lowConfidenceDiagnostic = engine.recordDiagnostic(lowConfidenceState, {
  diagnosticId: diagnosticItem.diagnostic.id,
  answer: wrongAnswer,
  reason: wrongReason,
  confidence: 3
});
assert.notEqual(lowConfidenceDiagnostic.attempt.classification, "stable-misconception");
assert.notEqual(
  engine.misconceptionProfile(lowConfidenceState).find((item) => item.code === lowConfidenceDiagnostic.attempt.misconceptionCode).status,
  "稳定误概念风险",
  "one low-confidence error must not be a stable misconception risk"
);

singleDiagnosticState.diagnosticAttempts.push({
  id: "independent-confirmation",
  profileId: singleDiagnosticState.activeProfileId,
  misconceptionCode: singleDiagnostic.attempt.misconceptionCode,
  diagnosticId: "independent-confirmation-diagnostic",
  answer: wrongAnswer,
  reason: wrongReason,
  answerCorrect: false,
  createdAt: "2026-08-07T10:00:00.000Z"
});
const confirmedDiagnostic = engine.recordDiagnostic(singleDiagnosticState, {
  diagnosticId: diagnosticItem.diagnostic.id,
  answer: wrongAnswer,
  reason: wrongReason,
  confidence: 5
});
assert.equal(confirmedDiagnostic.attempt.classification, "stable-misconception");
assert.equal(
  engine.misconceptionProfile(singleDiagnosticState).find((item) => item.code === confirmedDiagnostic.attempt.misconceptionCode).status,
  "稳定误概念风险",
  "matching independent evidence may be shown as a stable misconception risk"
);

const legacyRaw = JSON.stringify({
  version: 4,
  activeProfileId: "legacy-student",
  profiles: [{ id: "legacy-student", name: "旧档案学生", grade: "高一", role: "student" }],
  attempts: [],
  examRecords: []
});
storage.set("physics-learning-loop-v1", legacyRaw);
failMigrationWrite = true;
const readableAfterMigrationFailure = engine.loadState();
failMigrationWrite = false;
assert.equal(storage.get("physics-learning-loop-v1"), legacyRaw, "failed migration must keep the legacy raw value");
assert.equal(readableAfterMigrationFailure.profiles[0].name, "旧档案学生", "legacy data remains readable after migration failure");

assert.match(engine.diagnosticClassificationLabel({ classification: "stable-misconception" }), /历史规则结果/);

console.log(JSON.stringify({
  status: "passed",
  dateBoundary: "passed",
  duplicateProfile: "passed",
  examBlankValue: "passed",
  topicNormalization: "passed",
  knowledgePointCoverage: evidence.coverageLabel,
  modelingSemantics: "passed"
}, null, 2));
