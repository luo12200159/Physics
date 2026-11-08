const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
vm.createContext(context);
for (const file of ['answer-schema.js', 'learning-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const schemas = context.PHYSICS_ANSWER_SCHEMA;
const engine = context.PHYSICS_LEARNING_ENGINE;

function grade(question, response) {
  const normalized = schemas.forQuestion(question);
  return engine.gradeFinalAnswer({ ...question, ...normalized }, response);
}

const distance = { id: 'schema-test-distance', questionType: '计算题',
  content: '以 2 m/s 匀速运动 5 s，求路程。', answer: '通过的路程为 10 m。', autoScorable: true };
const distanceSchema = schemas.forQuestion(distance);
assert.equal(distanceSchema.autoScorable, true, 'one unambiguous quantity remains auto-scorable');
assert.equal(distanceSchema.answerSchema.answerSchemaVersion, 1);
assert.equal(grade(distance, '10 m').status, 'correct');
assert.equal(grade(distance, '1000 cm').status, 'correct', 'equivalent units remain valid');
assert.notEqual(grade(distance, '11 m').status, 'correct', 'out-of-tolerance values fail');
assert.equal(grade(distance, '10').status, 'review-required', 'missing unit is not silently correct');
assert.equal(engine.gradeFinalAnswer({ ...distance, answerSchema: distanceSchema.answerSchema,
  autoScorable: false }, '10 m').status, 'review-required',
  'an explicit manual-review decision must override a present answer schema');

const paired = { id: 'schema-test-paired', questionType: '计算题',
  content: '求速度和时间。', answer: '速度为 2 m/s；时间为 5 s。', autoScorable: true };
assert.equal(schemas.forQuestion(paired).answerSchema.parts.length, 2);
assert.equal(grade(paired, '2 m/s；5 s').status, 'correct');
assert.notEqual(grade(paired, '5 s；2 m/s').status, 'correct', 'part order cannot be swapped');

const choice = { id: 'schema-test-choice', questionType: '单项选择题',
  content: '下列说法正确的是？A. 正确；B. 错误。', answer: 'A。', autoScorable: true };
assert.equal(grade(choice, 'A').status, 'correct');
assert.equal(grade(choice, 'B').status, 'incorrect');
assert.equal(engine.gradeFinalAnswer({ ...choice, answerSchema: {
  answerSchemaVersion: 1, parts: [{ id: 'part-1', kind: 'choice', expectedOptionIds: ['X'] }]
} }, { parts: [{ id: 'part-1', optionIds: ['X'] }] }).status, 'review-required',
  'a malformed stored answer schema must not be used to mark a response correct');
assert.equal(schemas.validSchema({ answerSchemaVersion: 1, parts: [{
  id: 'part-1', kind: 'choice', expectedOptionIds: ['A', 'A']
}] }), false, 'duplicate expected options are not a valid schema');

const explainedChoice = { id: 'schema-test-explained-choice', questionType: '单项选择题',
  content: '下列说法正确的是？A. 振动产生声音；B. 真空可传声。',
  answer: '选 A。振动产生声音，真空不能传声。', autoScorable: true };
assert.equal(grade(explainedChoice, 'A').status, 'correct',
  'a leading explicit option remains scorable even when the reference explains why');
assert.equal(grade(explainedChoice, explainedChoice.answer).status, 'correct',
  'the reference answer must round-trip through the same scorer');

const explanation = { id: 'schema-test-explanation', questionType: '简答题',
  content: '解释惯性。', answer: '物体保持原有运动状态的性质。', autoScorable: true };
assert.equal(schemas.forQuestion(explanation).autoScorable, false);
assert.equal(grade(explanation, '物体保持原有运动状态的性质。').status, 'review-required');

const experiment = { id: 'schema-test-experiment', questionType: '实验题',
  content: '测量并解释误差。', answer: '测得 5 Ω，并讨论误差。', autoScorable: true };
assert.equal(schemas.forQuestion(experiment).autoScorable, false);
assert.equal(grade(experiment, '5 Ω').status, 'review-required');

const unknownUnit = { id: 'schema-test-unknown-unit', questionType: '计算题',
  content: '求结果。', answer: '结果为 10 xyz。', autoScorable: true };
assert.equal(schemas.forQuestion(unknownUnit).autoScorable, false);
assert.equal(grade(unknownUnit, '10 xyz').status, 'review-required');

const electricField = { id: 'schema-test-electric-field', questionType: '计算题',
  content: '求电场强度。', answer: '电场强度为 2×10^3 N/C。', autoScorable: true };
assert.equal(schemas.forQuestion(electricField).autoScorable, true);
assert.equal(grade(electricField, '2000 V/m').status, 'correct', 'N/C and V/m are equivalent field units');
assert.notEqual(grade(electricField, '2000 C').status, 'correct', 'charge is not electric field');

const charge = { id: 'schema-test-charge', questionType: '计算题',
  content: '求电荷量。', answer: '电荷量为 1.6×10⁻¹⁹ C。', autoScorable: true };
assert.equal(schemas.forQuestion(charge).autoScorable, true);
assert.equal(grade(charge, '1.6e-19 C').status, 'correct');
const barePower = { id: 'schema-test-bare-power', questionType: '计算题',
  content: '求长度。', answer: '长度为 10^5 m。', autoScorable: true };
assert.equal(grade(barePower, '100000 m').status, 'correct');

const momentum = { id: 'schema-test-momentum', questionType: '计算题',
  content: '求冲量。', answer: '冲量为 3 N·s。', autoScorable: true };
assert.equal(grade(momentum, '3 kg·m/s').status, 'correct');

const half = { id: 'schema-test-half', questionType: '计算题',
  content: '求位移。', answer: '位移为 1/3 m。', autoScorable: true };
assert.equal(grade(half, '0.333 m').status, 'correct');

const directional = { id: 'schema-test-directional', questionType: '计算题',
  content: '求两段力的大小与方向。', answer: '第一段为 2 N，沿斜面向上；第二段为 3 N，垂直纸面向里。',
  autoScorable: true, answerSchema: { answerSchemaVersion: 1, parts: [
    { id: 'part-1', kind: 'quantity', quantity: 'force', expected: { value: 2, unit: 'N' },
      tolerance: { absolute: 0, relative: 0.01 }, directionRequired: true, expectedDirection: 'incline-up' },
    { id: 'part-2', kind: 'quantity', quantity: 'force', expected: { value: 3, unit: 'N' },
      tolerance: { absolute: 0, relative: 0.01 }, directionRequired: true, expectedDirection: 'into-page' },
  ] } };
assert.equal(grade(directional, '2 N 沿斜面向上；3 N 垂直纸面向里').status, 'correct');
assert.notEqual(grade(directional, '2 N 沿斜面向下；3 N 垂直纸面向里').status, 'correct');

console.log('qa_content_answer_schema: passed');
