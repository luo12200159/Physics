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
vm.runInContext(fs.readFileSync(path.join(root, "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;

const state = engine.defaultState();
const profileId = state.activeProfileId;
const plan = {
  id: "plan-multi-session",
  profileId,
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  expectedMinutes: 12,
  questionIds: ["q1", "q2", "q3", "q4", "q5"],
  sessions: [
    { id: "session-1", title: "诊断与母题", questionIds: ["q1", "q2"], expectedMinutes: 12, dueAt: "2026-08-01T00:00:00.000Z" },
    { id: "session-2", title: "条件变化与迁移", questionIds: ["q3", "q4"], expectedMinutes: 12, dueAt: "" },
    { id: "session-3", title: "延迟独立复测", questionIds: ["q5"], expectedMinutes: 10, dueAt: "2026-08-10T00:00:00.000Z" }
  ]
};

let progress = engine.learningPlanProgress(state, plan, Date.parse("2026-08-02T00:00:00.000Z"));
assert.equal(progress.currentSession.id, "session-1");
assert.deepEqual(Array.from(progress.currentQuestionIds), ["q1", "q2"]);
assert.equal(progress.currentSessionAvailable, true);

const record = (questionId, createdAt) => engine.recordAttempt(state, {
  profileId, questionId, topic: "运动", grading: { status: "correct", score: 1 },
  finalAnswer: "1", selfExplanation: "说明规律和条件", createdAt, completedAt: createdAt
});
record("q1", "2026-08-02T01:00:00.000Z");
record("q2", "2026-08-02T02:00:00.000Z");
progress = engine.learningPlanProgress(state, plan, Date.parse("2026-08-02T03:00:00.000Z"));
assert.equal(progress.currentSession.id, "session-2");
assert.deepEqual(Array.from(progress.currentQuestionIds), ["q3", "q4"]);

record("q3", "2026-08-03T01:00:00.000Z");
record("q4", "2026-08-03T02:00:00.000Z");
progress = engine.learningPlanProgress(state, plan, Date.parse("2026-08-04T00:00:00.000Z"));
assert.equal(progress.currentSession.id, "session-3");
assert.equal(progress.currentSession.status, "scheduled");
assert.equal(progress.currentSessionAvailable, false, "delayed retest must not open early");
progress = engine.learningPlanProgress(state, plan, Date.parse("2026-08-11T00:00:00.000Z"));
assert.equal(progress.currentSession.status, "ready");
assert.equal(progress.currentSessionAvailable, true);

const shellSource = fs.readFileSync(path.join(root, "experience-shell.js"), "utf8");
assert.match(shellSource, /currentPlanQuestionIds/);
assert.match(shellSource, /学生首页一次只显示当前时段/);

console.log(JSON.stringify({ status: "passed", sessions: 3, delayedRetestProtected: true }, null, 2));
