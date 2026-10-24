const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "solution-format.js"), "utf8"), context, { filename: "solution-format.js" });
const source = fs.readFileSync(path.join(projectRoot, "mock-exam-bank.js"), "utf8");
vm.runInContext(source, context, { filename: "mock-exam-bank.js" });

const bank = context.window.PHYSICS_MOCK_EXAM_BANK;
assert.ok(bank, "原创模拟卷题库未注册");
assert.equal(bank.version, 2);
assert.equal(bank.contentVersion, context.window.PHYSICS_SOLUTION_FORMAT.CONTENT_VERSION);
assert.equal(bank.exams.length, 2);
assert.equal(bank.questions.length, 38);

const ids = new Set(bank.questions.map((question) => question.id));
assert.equal(ids.size, bank.questions.length, "题目编号必须唯一");

const junior = bank.questions.filter((question) => question.examLevel === "中考");
const senior = bank.questions.filter((question) => question.examLevel === "高考");
assert.equal(junior.length, 23);
assert.equal(senior.length, 15);
assert.deepEqual(
  Array.from(junior, (question) => question.examQuestionNumber),
  Array.from({ length: 23 }, (_, index) => index + 1)
);
assert.deepEqual(
  Array.from(senior, (question) => question.examQuestionNumber),
  Array.from({ length: 15 }, (_, index) => index + 1)
);

for (const question of bank.questions) {
  assert.equal(question.collection, "changsha-original-mock-exams");
  assert.equal(question.sourceLicense, "应用内原创");
  assert.equal(question.resourceRightsStatus, "应用内原创，可离线使用");
  assert.equal(question.fullTextIncluded, true);
  assert.equal(question.originalMock, true);
  assert.equal(question.sourceUrl, "");
  assert.ok(question.curriculumBasis.includes("课程标准"));
  assert.ok(question.content.trim().length >= 30, `${question.id} 题干过短`);
  assert.ok(question.solution.trim().length >= 45, `${question.id} 解题方法不够详细`);
  assert.ok(question.answer.trim().length >= 18, `${question.id} 答案不够详细`);
  assert.ok(Array.isArray(question.examPoints) && question.examPoints.length >= 2, `${question.id} 缺少考点`);
  assert.ok(question.examPoints.every((point) => typeof point === "string" && point.trim()));
  if (question.questionType.includes("选择题")) {
    assert.match(question.answer, /选 [A-D]/, `${question.id} 选择题答案不明确`);
  }
}

const expectedPaperCounts = new Map(bank.exams.map((exam) => [exam.title, exam.questionCount]));
for (const [paperTitle, expectedCount] of expectedPaperCounts) {
  const actualCount = bank.questions.filter((question) => question.examPaperTitle === paperTitle).length;
  assert.equal(actualCount, expectedCount, `${paperTitle} 题目数量不一致`);
}

console.log(JSON.stringify({
  bank: bank.title,
  contentVersion: bank.contentVersion,
  total: bank.questions.length,
  junior: junior.length,
  senior: senior.length,
  status: "passed"
}, null, 2));
