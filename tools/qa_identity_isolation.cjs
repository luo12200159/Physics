const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
let uuidCounter = 0;
const context = {
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "curriculum-taxonomy.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;
const labSource = fs.readFileSync(path.join(root, "learning-lab.js"), "utf8");
assert.doesNotMatch(labSource, /roster:\$\{name\}/, "a display name must not become a roster identity key");
assert.match(labSource, /duplicate-name-warning/);
assert.match(labSource, /作为新学生导入/);
assert.match(labSource, /与现有档案合并/);

const state = engine.defaultState();
state.profiles = [];
const studentA = engine.addProfile(state, { name: "张伟", grade: "高一", studentNumber: "A-001", sourceProfileId: "source-a" });
const studentB = engine.addProfile(state, { name: "张伟", grade: "高一", studentNumber: "B-001", sourceProfileId: "source-b" });
assert.notEqual(studentA.id, studentB.id, "same-name students must remain separate profiles");
assert.notEqual(studentA.portableProfileId, studentB.portableProfileId, "portable IDs must remain unique");
assert.equal(engine.resolveImportedStudentId(state, "A-001").profileId, studentA.id);
assert.equal(engine.resolveImportedStudentId(state, "B-001").profileId, studentB.id);
assert.equal(engine.resolveImportedStudentId(state, "张伟").status, "unresolved", "names must never resolve identity");

const imported = engine.importExamRecords(state, [
  {
    id: "exam-row-a", sourceRecordId: "exam-shared", profileId: studentA.id,
    title: "同一场考试", examDate: "2026-08-08", score: 3, totalScore: 5,
    questionEvidence: [{ questionNo: "1", questionId: "q-a", score: 3, maxScore: 5 }]
  },
  {
    id: "exam-row-b", sourceRecordId: "exam-shared", profileId: studentB.id,
    title: "同一场考试", examDate: "2026-08-08", score: 4, totalScore: 5,
    questionEvidence: [{ questionNo: "1", questionId: "q-b", score: 4, maxScore: 5 }]
  }
], null);
assert.equal(imported.added.length, 2);
const examsA = state.examRecords.filter((record) => record.profileId === studentA.id);
const examsB = state.examRecords.filter((record) => record.profileId === studentB.id);
assert.equal(examsA.length, 1);
assert.equal(examsB.length, 1);
assert.equal(examsA[0].questionEvidence[0].questionId, "q-a");
assert.equal(examsB[0].questionEvidence[0].questionId, "q-b");
const unresolvedExam = engine.importExamRecords(state, [{
  id: "exam-unresolved", title: "未绑定学生试卷", examDate: "2026-08-08", score: 1, totalScore: 5
}]);
assert.equal(unresolvedExam.added.length, 0);
assert.equal(unresolvedExam.errors.length, 1);
assert.equal(state.examRecords.some((record) => record.id === "exam-unresolved"), false,
  "an unresolved import must never fall back to the active student");

const reportBase = {
  format: "physics-learning-profile", version: 4, exportedAt: "2026-08-08T10:00:00.000Z",
  summary: { completed: 1, topics: [] }, attempts: []
};
const reportA = engine.importStudentReport(state, {
  ...reportBase, profile: { id: "student-default", portableProfileId: "portable-device-a", name: "设备A学生", grade: "高一" }
});
const reportB = engine.importStudentReport(state, {
  ...reportBase, profile: { id: "student-default", portableProfileId: "portable-device-b", name: "设备B学生", grade: "高一" }
});
assert.equal(reportA.status, "imported");
assert.equal(reportB.status, "imported");
assert.equal(new Set(state.importedReports.map((report) => report.portableProfileId)).size, 2,
  "same internal student-default on different devices must remain two identities");
assert.equal(engine.importStudentReport(state, {
  ...reportBase, profile: { id: "student-default", portableProfileId: "portable-device-a", name: "设备A学生", grade: "高一" }
}).status, "duplicate", "same portable ID and exportedAt must not count twice");

const legacy = engine.importStudentReport(state, {
  ...reportBase, exportedAt: "2026-08-09T10:00:00.000Z",
  profile: { id: "student-default", name: "旧版学生", grade: "高一" }
});
assert.equal(legacy.status, "identity-required");
assert.equal(legacy.report.identityStatus, "unresolved-legacy");
assert.throws(() => engine.importLearningProfile(state, legacy.report), /student-default|身份/);
const binding = engine.bindImportedReportIdentity(state, legacy.report.id, { profileId: studentA.id });
assert.equal(binding.report.boundProfileId, studentA.id);

console.log(JSON.stringify({
  status: "passed",
  sameNameProfiles: 2,
  isolatedExamRecords: [examsA.length, examsB.length],
  portableReportIdentities: 2,
  legacyBinding: "explicit"
}, null, 2));
