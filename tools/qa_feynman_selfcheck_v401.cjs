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
const base = {
  grade: "高一", knowledgePointId: "kp-motion", topic: "匀变速直线运动",
  content: "一辆车做匀加速直线运动。", answer: "2 m/s", solution: "由 v=v0+at 得出。",
  fullTextIncluded: true, contentReviewStatus: "教师已审核"
};
const questions = [
  { ...base, id: "original", modelDefinitionId: "model-a" },
  { ...base, id: "same-model", modelDefinitionId: "model-a" },
  { ...base, id: "new-context", modelDefinitionId: "model-b" },
  { ...base, id: "wrong-topic", knowledgePointId: "kp-force", modelDefinitionId: "model-c" },
  { ...base, id: "draft", modelDefinitionId: "model-d", contentReviewStatus: "待教师审核" }
];

const retest = engine.selectFeynmanRetestQuestion(questions, "original", "kp-motion", "高一", []);
assert.equal(retest?.id, "new-context", "复测优先使用不同模型的已审核新题");
const selfCheck = engine.feynmanSelfCheck({
  researchObject: "小车", lawConditions: "加速度恒定", prediction: "速度增加",
  predictionReason: "由 v=v0+at，正加速度使速度随时间增加"
});
assert.equal(selfCheck.items.length, 3);
assert.equal(selfCheck.items.every((item) => item.status === "待与解析核对"), true);
assert.equal("score" in selfCheck, false, "讲解长度不能成为掌握分数");
const missing = engine.feynmanSelfCheck({ researchObject: "小车" });
assert.equal(missing.items.filter((item) => item.status === "待补充").length, 2);

const state = engine.defaultState();
const record = engine.recordFeynmanExplanation(state, {
  questionId: "original", knowledgePointId: "kp-motion", topic: "匀变速直线运动",
  explanation: "研究小车，依据恒定加速度运动规律分析其速度变化。",
  researchObject: "小车", lawConditions: "加速度恒定", prediction: "速度增加",
  predictionReason: "v=v0+at", retestQuestionId: retest.id
});
assert.equal(record.retestQuestionId, "new-context");
assert.equal(record.researchObject, "小车");
assert.equal(engine.masterySummary(state).masteredCount || 0, 0, "保存讲解不能生成掌握证据");
console.log("qa_feynman_selfcheck_v401: passed");
