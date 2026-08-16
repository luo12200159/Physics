const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const labSource = fs.readFileSync(path.join(project, "learning-lab.js"), "utf8");
for (const field of ["studentId", "examId", "questionNo", "questionId", "maxScore", "topicKey", "questionType"]) {
  assert.match(labSource, new RegExp(field));
}

const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(project, "learning-engine.js"), "utf8"), context, { filename: "learning-engine.js" });
const engine = context.PHYSICS_LEARNING_ENGINE;
const state = engine.defaultState();
const record = {
  sourceRecordId: "exam-level-1",
  title: "题目级导入示例",
  examDate: "2026-08-08",
  score: 8,
  totalScore: 10,
  questionLevel: true,
  questionEvidence: [{ questionNo: "1", questionId: "q-1", score: 8, maxScore: 10, topicKey: "topic:motion", questionType: "选择题" }]
};
const unsafeResult = engine.importExamRecords(state, [record]);
assert.equal(unsafeResult.added.length, 0, "missing student identity must never fall back to the active profile");
assert.equal(state.examRecords.length, 0);
const result = engine.importExamRecords(state, [record], state.activeProfileId);
assert.equal(result.added.length, 1);
assert.equal(state.examRecords[0].questionEvidence[0].topicKey, "topic:motion");
assert.equal(state.examRecords[0].questionEvidence[0].questionType, "选择题");

console.log(JSON.stringify({ status: "passed", questionLevelFields: 7, preservedEvidence: true, implicitProfileFallback: "blocked" }, null, 2));
