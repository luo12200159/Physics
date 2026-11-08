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
for (const file of ["curriculum-taxonomy.js", "curriculum-mapping.js", "solution-format.js",
  "answer-schema.js", "physics-visuals.js", "original-practice-bank.js",
  "teaching-sequences.js", "learning-engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const bank = context.PHYSICS_ORIGINAL_PRACTICE_BANK.questions;
const high2 = bank.filter((question) => question.grade === "高二"
  && ["静电场", "电场强度", "电势能", "电容器", "恒定电流"].includes(question.topic));
assert.equal(high2.length, 100, "the reviewed book correction must cover exactly five existing templates");
for (const question of high2) {
  assert.equal(question.curriculumBook, "必修第三册", `${question.id}: correct physics book`);
  assert.equal(question.curriculumReviewStatus, "catalog-exact", `${question.id}: verified section`);
  assert.ok(question.curriculumSectionIds[0]?.startsWith("pep-h-required-3-"));
}
assert.equal(bank.length, 1416, "existing question IDs/count remain unchanged");
assert.ok(bank.every((question) => /理想模型.*合理修约/u.test(question.content)),
  "the precision convention must be visible in the question, not just in a teacher note");
assert.ok(bank.every((question) => !question.solution.includes("方向（若有）")),
  "a scalar result must not receive a generic direction instruction");

const sequences = context.PhysicsStudioTeachingSequences;
for (const id of ["kp:平均速度", "kp:欧姆定律", "kp:牛顿第二定律"]) {
  const unit = sequences.get(id)?.courseUnit;
  assert.ok(unit, `${id}: a course unit must be attached to the actual learning sequence`);
  for (const field of ["phenomenon", "prerequisite", "concept", "modelConditions",
    "representations", "workedExample", "independentPractice", "explanationCheck", "teacherGuide"]) {
    assert.ok(unit[field], `${id}: missing ${field}`);
  }
  assert.equal(sequences.get(id).stages.length, 8);
}
assert.equal(sequences.forQuestion({ grade: "高一", modelDefinitionId: "h1-original-template-004" })
  ?.knowledgePointId, "kp:牛顿第二定律");
const newton = sequences.get("kp:牛顿第二定律").simulation;
assert.equal(context.PHYSICS_VISUALS.newtonSecondLaw(newton.params).acceleration,
  newton.expectedAcceleration);
const remediations = sequences.remediations();
for (const code of ["zero-velocity-zero-acceleration", "force-maintains-motion",
  "series-voltage-always-equal", "resistance-created-by-voltage", "variable-control-ohm"]) {
  const item = remediations[code];
  assert.ok(item?.prediction && item?.counterevidence && item?.explanation
    && item?.independentRetest, `${code}: remediation needs an independent learning step`);
  assert.equal(item.requiresTeacherReview, true);
}
const catalogCodes = new Set(context.PHYSICS_LEARNING_ENGINE.misconceptionCatalog.map((item) => item.code));
assert.ok(Object.keys(remediations).every((code) => catalogCodes.has(code)),
  "a remediation must be reachable through the actual diagnostic catalogue");

const engine = context.PHYSICS_LEARNING_ENGINE;
const state = engine.defaultState();
const profileId = engine.activeProfile(state).id;
const question = { id: "qa-ohm-concept", knowledgePointId: "kp:欧姆定律", topic: "欧姆定律" };
state.attempts.push({ id: "qa-concept-evidence", profileId, questionId: question.id,
  knowledgePointId: question.knowledgePointId, misconceptionCode: "resistance-created-by-voltage",
  grading: { status: "incorrect", score: 0 } });
const advice = engine.recommendTeachingIntervention(state, profileId,
  question.knowledgePointId, [question]);
assert.equal(advice.evidenceQuality, "insufficient");
assert.equal(advice.remediation?.code, "resistance-created-by-voltage");
assert.ok(advice.evidenceIds.includes("qa-concept-evidence"));
assert.equal(advice.requiresTeacherConfirmation, true);

console.log(JSON.stringify({ status: "passed", checkedQuestions: bank.length,
  correctedBookQuestions: high2.length, courseUnits: 3,
  remediationUnits: Object.keys(remediations).length }));
