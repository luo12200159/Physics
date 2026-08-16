const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const storage = new Map();
const context = vm.createContext({
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  }
});
context.window = context;
for (const file of ["storage-repository.js", "targeted-practice-bank.js", "learning-engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(project, file), "utf8"), context, { filename: file });
}
const engine = context.PHYSICS_LEARNING_ENGINE;
const questions = context.PHYSICS_TARGETED_PRACTICE_BANK.questions;
const state = engine.defaultState();
const first = state.profiles[0];
first.name = "甲同学";
first.grade = "九年级";
const second = engine.addProfile(state, { name: "乙同学", grade: "九年级", goal: "中考" });
const anchor = questions.find((item) => item.grade === "九年级" && item.variantRole === "core");
assert.ok(anchor);
const anchors = questions.filter((item) => item.grade === "九年级"
  && item.variantRole === "core"
  && item.topic === anchor.topic)
  .filter((item, index, items) => items.findIndex((candidate) => candidate.modelFamilyId === item.modelFamilyId) === index)
  .slice(0, 3);
assert.equal(anchors.length, 3, "QA needs three independent model families for a stable weak-evidence example");
for (const profile of [first, second]) {
  state.activeProfileId = profile.id;
  for (let index = 0; index < 3; index += 1) {
    const question = anchors[index];
    engine.recordAttempt(state, {
      id: `wrong-${profile.id}-${index}`,
      profileId: profile.id,
      questionId: question.id,
      topic: question.topic,
      knowledgePointId: question.knowledgePointId,
      grading: { status: "incorrect", score: 0 },
      finalAnswer: "错误答案",
      selfExplanation: "尝试说明规律",
      hintLevel: 1,
      createdAt: `2026-08-${String(10 + index).padStart(2, "0")}T08:00:00.000Z`,
      completedAt: `2026-08-${String(10 + index).padStart(2, "0")}T08:00:00.000Z`
    });
  }
}

const draft = engine.buildTieredAssignmentDraft(state, questions, {
  profileIds: [first.id, second.id],
  count: 5
});
assert.equal(draft.status, "teacher-confirmation-required");
assert.equal(draft.studentScope.length, 2);
assert.equal(draft.questionCount, 5);
assert.ok(draft.knowledgePointIds.length >= 1);
assert.ok(draft.evidenceIds.length >= 2);
assert.ok(draft.questionCandidates.every((item) => item.id && item.title && item.source));
assert.equal(draft.publish, false);
assert.match(draft.boundary, /教师确认/);

const emptyState = engine.defaultState();
emptyState.profiles[0].grade = "八年级";
const insufficient = engine.buildTieredAssignmentDraft(emptyState, questions, {});
assert.equal(insufficient.status, "insufficient-evidence");
assert.equal(insufficient.publish, false);
assert.equal(insufficient.questionCount, 0);

console.log("Tiered assignment draft QA passed");
