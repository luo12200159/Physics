const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['curriculum-taxonomy.js', 'curriculum-mapping.js', 'solution-format.js',
  'answer-schema.js', 'physics-visuals.js', 'motion-representation-drafts.js',
  'teaching-sequences.js', 'learning-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const sequences = context.PhysicsStudioTeachingSequences;
const expectedStages = ['diagnose', 'explain', 'predict', 'simulate', 'practice',
  'near-transfer', 'far-transfer', 'delayed-retest'];
for (const topic of ['hs-uniformly-accelerated-motion', 'kp:平均速度', 'kp:欧姆定律']) {
  const sequence = sequences.get(topic);
  assert.ok(sequence, `${topic}: sequence exists`);
  assert.deepEqual(Array.from(sequence.stages, (stage) => stage.id), expectedStages);
  assert.ok(sequence.stages.every((stage) => stage.instruction && stage.evidenceRequirement));
  assert.ok(sequence.stages.find((stage) => stage.id === 'delayed-retest').minimumDelayDays >= 1);
}
const draftIds = context.PhysicsStudioMotionDrafts.questions.map((item) => item.id);
const motion = sequences.get('hs-uniformly-accelerated-motion');
assert.equal(sequences.forQuestion({ knowledgePointId: 'kp:机械运动',
  modelDefinitionId: 'g8-original-template-001' }).knowledgePointId, 'kp:平均速度');
assert.equal(sequences.forQuestion({ knowledgePointId: 'kp:机械运动',
  modelDefinitionId: 'g8-original-template-000' }), null,
  'a broad mechanics label must not trigger the average-speed pilot');
assert.ok(motion.stages.some((stage) => stage.questionIds?.some((id) => draftIds.includes(id))));
assert.ok(motion.stages.filter((stage) => stage.questionIds?.some((id) => draftIds.includes(id)))
  .every((stage) => stage.requiresTeacherReview === true));
assert.equal(sequences.get('kp:平均速度').simulation.claim, '理想化模型演示，不是真实测量');
assert.equal(sequences.get('kp:欧姆定律').simulation.conditions.includes('导体温度近似不变'), true);
const motionModel = context.PHYSICS_VISUALS.uniformMotion(motion.simulation.params);
assert.equal(motionModel.position, motion.simulation.expectedPosition);
assert.equal(motionModel.velocity, motion.simulation.expectedVelocity);
const speedModel = context.PHYSICS_VISUALS.uniformMotion(sequences.get('kp:平均速度').simulation.params);
assert.equal(speedModel.position, sequences.get('kp:平均速度').simulation.expectedPosition);
const circuitModel = context.PHYSICS_VISUALS.circuit(sequences.get('kp:欧姆定律').simulation.params);
assert.equal(circuitModel.totalCurrent, sequences.get('kp:欧姆定律').simulation.expectedCurrent);

const engine = context.PHYSICS_LEARNING_ENGINE;
const state = engine.defaultState();
const profileId = engine.activeProfile(state).id;
const empty = engine.recommendTeachingIntervention(state, profileId, 'kp:欧姆定律');
assert.equal(empty.evidenceQuality, 'insufficient');
assert.deepEqual(Array.from(empty.evidenceIds), []);
assert.equal(empty.requiresTeacherConfirmation, true);

const question = { id: 'pilot-ohm-a', grade: '九年级', topic: '欧姆定律',
  knowledgePointId: 'kp:欧姆定律', questionType: '计算题', difficulty: '基础',
  modelDefinitionId: 'ohm-pilot-a', answer: '2 A', autoScorable: false };
state.attempts.push({ id: 'evidence:one', profileId, questionId: question.id,
  topic: question.topic, knowledgePointId: question.knowledgePointId,
  errorType: '公式选错', hintLevel: 2, completedAt: '2026-11-01T10:00:00.000Z',
  grading: { status: 'incorrect', score: 0 } });
const advice = engine.recommendTeachingIntervention(state, profileId,
  'kp:欧姆定律', [question]);
assert.equal(advice.evidenceQuality, 'insufficient');
assert.ok(advice.evidenceIds.includes('evidence:one'));
assert.equal(advice.requiresTeacherConfirmation, true);
assert.ok(advice.suggestedActivity);
assert.ok(advice.suggestedAssignment);
assert.ok(!/已掌握|能力提升/.test(advice.conclusion));
console.log('qa_content_remediation: passed');
