"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "learning-engine.js"), "utf8"), context, {
  filename: "learning-engine.js",
});
const engine = context.PHYSICS_LEARNING_ENGINE;

const initial = engine.defaultState();
assert.equal(initial.version, 10);
assert.ok(Array.isArray(initial.feynmanExplanations));
assert.equal(initial.feynmanExplanations.length, 0);

const legacy = engine.normalizeState({
  ...initial,
  version: 9,
  feynmanExplanations: undefined,
  variantSets: [{
    id: "legacy-set",
    parentQuestionId: "parent-1",
    variants: [
      {
        id: "legacy-reverse",
        sourceQuestionId: "parent-1",
        variantRole: "reverse",
        content: "已知末速度和加速度，求初速度。",
        answer: "2 m/s",
        solution: "由 v=v0+at 反解。",
        questionType: "计算题",
      },
      {
        id: "legacy-context",
        sourceQuestionId: "parent-1",
        variantRole: "context",
        content: "列车在站台间做匀变速运动，求位移。",
        answer: "20 m",
        solution: "由位移公式计算。",
        questionType: "计算题",
      },
    ],
  }],
});
assert.equal(legacy.version, 10);
assert.deepEqual(Array.from(legacy.variantSets[0].variants, (item) => item.variantRole), ["far", "far"]);
assert.deepEqual(Array.from(legacy.variantSets[0].variants, (item) => item.variantTechnique), ["reverse", "context"]);
assert.deepEqual(Array.from(legacy.feynmanExplanations), []);

assert.equal(engine.normalizeErrorType("前概念混淆"), "概念理解");
assert.equal(engine.normalizeErrorType("研究对象选择错误"), "研究对象/建模");
assert.equal(engine.normalizeErrorType("公式适用条件遗漏"), "规律选择或适用条件");
assert.equal(engine.normalizeErrorType("电路图读取错误"), "图像与表征");
assert.equal(engine.normalizeErrorType("代数变形错误"), "公式与代数");
assert.equal(engine.normalizeErrorType("方向和单位错误"), "单位/方向/符号");
assert.equal(engine.normalizeErrorType("控制变量错误"), "实验与数据处理");
assert.equal(engine.normalizeErrorType("审题疏漏"), "审题或计算疏漏");

const state = engine.defaultState();
const profileId = state.activeProfileId;
const questions = [
  { id: "motion-1", title: "速度变化一", topic: "匀变速直线运动", knowledgePointId: "kp-motion", grade: "高一" },
  { id: "motion-2", title: "速度变化二", topic: "匀变速直线运动", knowledgePointId: "kp-motion", grade: "高一" },
  { id: "motion-3", title: "速度变化三", topic: "匀变速直线运动", knowledgePointId: "kp-motion", grade: "高一" },
];

function addAttempt(questionId, status, errorType = "") {
  return engine.recordAttempt(state, {
    profileId,
    questionId,
    topic: "匀变速直线运动",
    knowledgePointId: "kp-motion",
    grading: { status, score: status === "correct" ? 1 : status === "incorrect" ? 0 : null, issues: [] },
    finalAnswer: status === "correct" ? "正确答案" : "错误答案",
    errorType,
    durationSeconds: 90,
    hintLevel: 0,
  });
}

const pending = addAttempt("motion-open", "review-required");
let report = engine.buildStudentFormativeReport(state, questions, profileId);
assert.equal(report.overall.pendingReviewCount, 1);
assert.equal(report.overall.scoredCount, 0);
assert.equal(report.overall.accuracy, null);
assert.equal(report.sampleStatus, "insufficient");
assert.equal(report.needsWork.length, 0);
assert.match(report.boundary, /样本不足/);

addAttempt("motion-1", "incorrect", "公式适用条件遗漏");
addAttempt("motion-2", "incorrect", "公式适用条件遗漏");
addAttempt("motion-3", "correct");
report = engine.buildStudentFormativeReport(state, questions, profileId);
assert.equal(report.overall.scoredCount, 3);
assert.equal(report.overall.pendingReviewCount, 1);
assert.equal(report.overall.accuracy, 33);
assert.equal(report.needsWork.length, 1);
assert.equal(report.nextActions.length <= 3, true);
assert.ok(report.needsWork[0].scoredEvidenceIds.includes(state.attempts[1].id));
assert.equal(report.needsWork[0].scoredEvidenceIds.includes(pending.id), false);

const attemptsBeforeExplanation = state.attempts.length;
const explanation = engine.recordFeynmanExplanation(state, {
  profileId,
  questionId: "motion-1",
  knowledgePointId: "kp-motion",
  topic: "匀变速直线运动",
  explanation: "研究对象是小车，在加速度恒定时速度随时间均匀变化。",
  analogy: "像每秒都增加相同数量的速度刻度。",
  prediction: "若加速度加倍，同一时间内速度变化量也加倍。",
});
assert.equal(state.attempts.length, attemptsBeforeExplanation);
assert.equal(explanation.verificationStatus, "student-reflection-only");
assert.ok(explanation.evidenceIds.length >= 1);

const selfPlan = engine.saveSelfDirectedLearningPlan(state, {
  id: "self-plan-1",
  profileId,
  title: "三题自主专项",
  questionIds: ["motion-1", "motion-2", "motion-3"],
  status: "draft",
});
assert.equal(selfPlan.confirmationStatus, "student-self-directed");
assert.equal(selfPlan.status, "active");

state.learningPlans.push({
  id: "teacher-plan-1",
  profileId,
  status: "active",
  confirmationStatus: "teacher-confirmed",
  questionIds: ["motion-1"],
});
assert.throws(() => engine.saveSelfDirectedLearningPlan(state, {
  id: "self-plan-2",
  profileId,
  questionIds: ["motion-2"],
}), /教师已确认/);

console.log(JSON.stringify({
  status: "passed",
  baseline: "v3.4.1",
  stateMigration: "v9-to-v10",
  errorTaxonomy: 8,
  pendingReviewExcluded: true,
  feynmanEvidenceBoundary: true,
  selfPlanBoundary: true,
}, null, 2));
