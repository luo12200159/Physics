const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.resolve(__dirname, "..");
const context = vm.createContext({
  window: {},
  document: { addEventListener() {} },
  console,
  setTimeout,
  clearTimeout
});

function load(file) {
  vm.runInContext(
    fs.readFileSync(path.join(project, file), "utf8"),
    context,
    { filename: file }
  );
}

load("curriculum-bank.js");
load("mock-exam-bank.js");
load("original-practice-bank.js");
load("targeted-practice-bank.js");
load("exam-question-index.js");
load("content-catalog.js");
load("app.js");

const seeds = vm.runInContext(
  "seedQuestions.map(({ id, grade, content, solution, answer }) => ({ id, grade, content, solution, answer }))",
  context
);
const curriculum = context.window.PHYSICS_CURRICULUM_BANK.questions;
const mock = context.window.PHYSICS_MOCK_EXAM_BANK.questions;
const original = context.window.PHYSICS_ORIGINAL_PRACTICE_BANK.questions;
const targeted = context.window.PHYSICS_TARGETED_PRACTICE_BANK.questions;
const indexes = context.window.PHYSICS_REAL_EXAM_INDEX.questions;
const all = [...seeds, ...curriculum, ...mock, ...original, ...targeted, ...indexes];
const coverage = context.window.PhysicsStudioContentCatalog.getCoverage(all);

assert.equal(original.length, 1416);
assert.equal(targeted.length, 400);
assert.equal(context.window.PHYSICS_ORIGINAL_PRACTICE_BANK.manifest.invalidCount, 0);
assert.equal(context.window.PHYSICS_TARGETED_PRACTICE_BANK.manifest.invalidCount, 0);
assert.equal(all.length, 2132);
assert.equal(new Set(all.map((question) => question.id)).size, all.length);
assert.equal(coverage.completeQuestions, 1900);
assert.equal(coverage.indexed, 232);
assert.equal(coverage.remaining, 0);
assert.equal(coverage.completionRate, 100);
assert.deepEqual(
  JSON.parse(JSON.stringify(coverage.completeByGrade)),
  { 八年级: 300, 九年级: 500, 高一: 300, 高二: 300, 高三: 500 }
);

const invalidOriginal = original.filter((question) => {
  return question.grade === "七年级"
    || question.fullTextIncluded !== true
    || question.collection !== "changsha-original-practice-1500"
    || question.source !== "物理研习室原创·长沙课程适配练习"
    || !question.sourceLicense.includes("非官方真题")
    || !question.content.trim()
    || !question.answer.trim()
    || question.solution.split(/\r?\n/).length < 3
    || !Array.isArray(question.examPoints)
    || question.examPoints.length === 0
    || /NaN|Infinity|undefined|null/.test(
      `${question.content} ${question.solution} ${question.answer}`
    );
});
assert.equal(invalidOriginal.length, 0);

const efficiencyQuestions = original.filter((question) => question.topic === "机械效率");
assert.ok(efficiencyQuestions.length > 0);
efficiencyQuestions.forEach((question) => {
  const match = question.answer.match(/([0-9]+(?:\.[0-9]+)?)%/);
  assert.ok(match, `missing efficiency percentage: ${question.id}`);
  const value = Number(match[1]);
  assert.ok(value > 0 && value < 100, `invalid efficiency ${value}: ${question.id}`);
});

const contentGroups = new Map();
original.forEach((question) => {
  const group = contentGroups.get(question.content) || [];
  group.push(question.id);
  contentGroups.set(question.content, group);
});
const repeatedVariantEntries = original.length - contentGroups.size;

const publicKeySource = fs.readFileSync(path.join(project, "activation-public-key.js"), "utf8");
const activationSource = fs.readFileSync(path.join(project, "activation.js"), "utf8");
const indexSource = fs.readFileSync(path.join(project, "index.html"), "utf8");
assert.match(publicKeySource, /ECDSA_P256_SHA256/);
assert.match(publicKeySource, /fingerprintSha256: "[A-F0-9]{64}"/);
assert.doesNotMatch(publicKeySource, /PRIVATE KEY|privateKey|d\s*:/);
assert.match(activationSource, /crypto\.subtle\.verify/);
assert.match(activationSource, /该激活码绑定的是另一台设备/);
assert.match(indexSource, /class="activation-pending"/);
assert.match(indexSource, /activation-public-key\.js/);
assert.match(indexSource, /original-practice-bank\.js/);

console.log(JSON.stringify({
  status: "passed",
  completeQuestionCount: coverage.completeQuestions,
  completeByGrade: coverage.completeByGrade,
  sourceIndexCount: coverage.indexed,
  totalStoredRecords: all.length,
  generatedOriginalVariants: original.length,
  targetedTransferQuestions: targeted.length,
  templateCount: Object.values(
    context.window.PHYSICS_ORIGINAL_PRACTICE_BANK.manifest.templateCounts
  ).reduce((sum, value) => sum + value, 0),
  uniqueGeneratedQuestionTexts: contentGroups.size,
  repeatedVariantEntries,
  publicKeyFingerprint: publicKeySource.match(/[A-F0-9]{64}/)?.[0] || ""
}, null, 2));
