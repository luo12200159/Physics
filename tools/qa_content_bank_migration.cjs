const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  document: { addEventListener() {} }, addEventListener() {} };
context.window = context;
vm.createContext(context);
for (const file of [
  'curriculum-taxonomy.js', 'curriculum-mapping.js', 'solution-format.js', 'answer-schema.js',
  'curriculum-bank.js', 'mock-exam-bank.js', 'original-practice-bank.js', 'targeted-practice-bank.js',
  'learning-engine.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });

const banks = [
  context.PHYSICS_CURRICULUM_BANK,
  context.PHYSICS_MOCK_EXAM_BANK,
  context.PHYSICS_ORIGINAL_PRACTICE_BANK,
  context.PHYSICS_TARGETED_PRACTICE_BANK
];
const questions = banks.flatMap((bank) => bank.questions);
assert.ok(questions.every((question) => ['catalog-exact', 'unresolved'].includes(question.curriculumReviewStatus)),
  'every bundled question carries a resolved or explicitly unresolved curriculum status');
assert.ok(questions.every((question) => (question.curriculumSectionIds || [])
  .every((id) => context.PHYSICS_CURRICULUM_MAPPING.sectionExists(id))),
  'a published curriculum ID must exist in the taxonomy');
const ids = questions.map((question) => question.id);
assert.equal(new Set(ids).size, ids.length, 'published question IDs remain unique');
const invalid = questions.filter((question) => question.autoScorable === true
  && !context.PHYSICS_ANSWER_SCHEMA.validSchema(question.answerSchema));
assert.equal(invalid.length, 0,
  `auto-scored questions need complete answerSchema; first invalid: ${invalid[0]?.id || ''}`);
const experiments = questions.filter((question) => /实验|探究|作图|简答|论证/.test(question.questionType));
assert.ok(experiments.length > 0);
assert.ok(experiments.every((question) => question.autoScorable !== true),
  'subjective questions must remain pending teacher review');
for (const question of questions.filter((item) => item.autoScorable === true)) {
  const result = context.PHYSICS_LEARNING_ENGINE.gradeFinalAnswer(question, question.answer);
  assert.equal(result.status, 'correct', `${question.id}: reference answer must match its own schema`);
}

const generated = context.PHYSICS_ORIGINAL_PRACTICE_BANK.questions;
const families = new Map();
for (const question of generated) {
  assert.ok(question.modelDefinitionId);
  families.set(question.modelDefinitionId, (families.get(question.modelDefinitionId) || 0) + 1);
}
assert.equal(families.size, 75, 'existing generated model families remain stable');
assert.equal(generated.length, 1416, 'existing generated question count remains stable');
assert.equal(generated.find((question) => question.id === 'cs-original-1500-h1-0001').questionType,
  '计算题', 'a numeric end-velocity problem is not a true/false question');
assert.equal(generated.find((question) => question.id === 'cs-original-1500-h2-0001').questionType,
  '计算题', 'a Coulomb-force calculation is not a choice without options');
assert.equal(generated.find((question) => question.id === 'cs-original-1500-h3-0008').questionType,
  '计算题', 'half-life remaining mass is numeric even without the verb 求');
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });
const mergeScoring = vm.runInContext('mergeBundledScoringMetadata', context);
const published = generated.find((question) => question.autoScorable);
const legacyStored = { id: published.id, answer: published.answer, autoScorable: true,
  notes: '学生原笔记', wrongCount: 2 };
const upgraded = mergeScoring(legacyStored, published);
assert.equal(upgraded.autoScorable, true);
assert.ok(context.PHYSICS_ANSWER_SCHEMA.validSchema(upgraded.answerSchema));
assert.equal(upgraded.notes, '学生原笔记');
assert.equal(upgraded.wrongCount, 2);
assert.equal(upgraded.curriculumReviewStatus, published.curriculumReviewStatus);
assert.deepEqual(Array.from(upgraded.curriculumSectionIds), Array.from(published.curriculumSectionIds));
const edited = mergeScoring({ ...legacyStored, userEdited: true, answer: '教师自定义答案' }, published);
assert.equal(edited.answer, '教师自定义答案');
assert.equal(edited.autoScorable, false, 'edited answers require renewed review');
assert.equal(edited.answerSchema, null);
console.log(JSON.stringify({ status: 'passed', questions: questions.length,
  autoScorable: questions.filter((question) => question.autoScorable === true).length,
  manualReview: questions.filter((question) => question.autoScorable === false).length,
  generatedFamilies: families.size }));
