const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const context = vm.createContext({ console, Object, Array, Map, Set, String, Number, Boolean, RegExp, Math });
context.window = context;
vm.runInContext(fs.readFileSync(path.join(project, "targeted-practice-bank.js"), "utf8"), context, {
  filename: "targeted-practice-bank.js"
});

const bank = context.PHYSICS_TARGETED_PRACTICE_BANK;
assert.ok(bank?.coverageReport, "targeted bank should expose coverage reporting");
assert.equal(bank.questions.length, 400, "coverage work must not publish generated filler questions");
const report = JSON.parse(JSON.stringify(bank.coverageReport()));
assert.deepEqual(Object.keys(report.byGrade), ["八年级", "九年级", "高一", "高二", "高三"]);
for (const grade of ["八年级", "高一", "高二"]) {
  assert.equal(report.byGrade[grade].publishedQuestionCount, 0, grade);
  assert.equal(report.byGrade[grade].structureStatus, "missing-reviewed-content", grade);
  assert.ok(report.byGrade[grade].gaps.length > 0, grade);
}
for (const grade of ["九年级", "高三"]) {
  assert.equal(report.byGrade[grade].publishedQuestionCount, 200, grade);
  assert.equal(report.byGrade[grade].publishedModelFamilyCount, 50, grade);
  assert.equal(report.byGrade[grade].incompleteFamilyCount, 0, grade);
  assert.equal(report.byGrade[grade].structureStatus, "complete-reviewed-structure", grade);
}
bank.questions.forEach((question) => {
  assert.ok(question.modelFamilyId, question.id);
  assert.equal(question.transferGroupId, question.modelFamilyId, question.id);
  assert.equal(question.independenceGroupId, question.modelFamilyId, question.id);
});
assert.equal(report.boundary.includes("未发布"), true);
console.log("Targeted practice coverage QA passed");
