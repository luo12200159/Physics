const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = {
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  setTimeout, clearTimeout,
  document: { addEventListener() {} },
  addEventListener() {}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ["curriculum-taxonomy.js", "curriculum-bank.js", "mock-exam-bank.js", "original-practice-bank.js", "targeted-practice-bank.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
}
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), context, { filename: "app.js" });
const seeds = vm.runInContext("seedQuestions", context);
const banks = [
  seeds,
  context.window.PHYSICS_CURRICULUM_BANK.questions,
  context.window.PHYSICS_MOCK_EXAM_BANK.questions,
  context.window.PHYSICS_ORIGINAL_PRACTICE_BANK.questions,
  context.window.PHYSICS_TARGETED_PRACTICE_BANK.questions
];
const questions = banks.flat();
const ids = new Set();
const invalid = [];
for (const question of questions) {
  if (ids.has(question.id)) invalid.push(`${question.id}:duplicate-id`);
  ids.add(question.id);
  if (!String(question.questionType || question.examQuestionType || "").trim()) invalid.push(`${question.id}:missing-questionType`);
  if (question.questionType === "未标注") invalid.push(`${question.id}:unmarked-questionType`);
  for (const field of ["evidenceTier", "modelDefinitionId", "retestGroupId", "knowledgePointId", "independenceGroupId", "assessmentPurpose", "cognitiveDemand", "representationType"]) {
    if (!String(question[field] || "").trim()) invalid.push(`${question.id}:missing-${field}`);
  }
  const resolvedKnowledgePoint = context.window.PHYSICS_CURRICULUM_TAXONOMY.resolveKnowledgePoint(question);
  if (!resolvedKnowledgePoint.id || resolvedKnowledgePoint.unresolved) invalid.push(`${question.id}:unresolved-knowledgePointId`);
  if (typeof question.diagnosticEligible !== "boolean" || typeof question.autoScorable !== "boolean") invalid.push(`${question.id}:missing-evidence-flags`);
}
assert.deepEqual(invalid, []);
const original = context.window.PHYSICS_ORIGINAL_PRACTICE_BANK.questions;
assert.equal(new Set(original.map((question) => question.modelDefinitionId)).size, 75, "original parameterized practice must retain 75 stable model definitions");
const complete = questions.filter((question) => question.fullTextIncluded !== false && question.content && question.solution && question.answer);
assert.equal(complete.length, questions.length);
assert.ok(questions.some((question) => /选择/.test(question.questionType)));
assert.ok(questions.some((question) => /填空/.test(question.questionType)));
assert.ok(questions.some((question) => /实验/.test(question.questionType)));
const resolver = context.window.PHYSICS_CURRICULUM_TAXONOMY.resolveKnowledgePoint;
assert.equal(resolver("带电粒子在磁场中运动").id, resolver("带电粒子在磁场中的运动").id,
  "磁场带电粒子语义别名必须共用 knowledgePointId");

assert.equal(questions.length, 1900, "metadata QA must cover every complete bundled question, including the three seed questions");
console.log(JSON.stringify({ status: "passed", total: questions.length, complete: complete.length, modelDefinitions: 75, questionTypes: { choice: true, blank: true, experiment: true } }, null, 2));
