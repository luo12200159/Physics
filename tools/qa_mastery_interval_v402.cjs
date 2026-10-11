const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const saved = new Map();
const context = {
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  localStorage: {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value))
  }
};
context.window = context;
vm.createContext(context);
for (const name of ['storage-repository.js', 'learning-engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
}
const engine = context.PHYSICS_LEARNING_ENGINE;
const first = new Date(2026, 5, 1, 23, 58).toISOString();
const nextDayMinutesLater = new Date(2026, 5, 2, 0, 2).toISOString();
const justUnderOneDay = new Date(2026, 5, 2, 23, 57).toISOString();
const delayed = new Date(2026, 5, 2, 23, 59).toISOString();
const now = new Date(2026, 5, 3, 12).getTime();
const topic = '匀变速直线运动';
const question = (id, group) => ({
  id, title: id, stage: '高中', grade: '高一', topic,
  knowledgePointId: 'kp-motion-interval', modelDefinitionId: group,
  independenceGroupId: group, questionType: '计算题', difficulty: '基础',
  content: '求小车加速度。', answer: '2 m/s²', solution: '由 a=Δv/Δt。',
  fullTextIncluded: true
});
const q1 = question('interval-q1', 'model-a');
const q2 = question('interval-q2', 'model-b');
const q3 = question('interval-q3', 'model-b');
const state = engine.defaultState();
state.profiles[0].grade = '高一';
function correctAttempt(q, at) {
  return engine.recordAttempt(state, {
    questionId: q.id, question: q, topic, stage: '高中',
    knowledgePointId: q.knowledgePointId, modelDefinitionId: q.modelDefinitionId,
    independenceGroupId: q.independenceGroupId, questionType: q.questionType,
    hintLevel: 0, finalAnswer: '2 m/s²',
    grading: { status: 'correct', score: 1, issues: [] },
    createdAt: at, completedAt: at
  });
}
function verifiedTransfer(questionId) {
  state.experimentRecords.push({
    id: 'interval-transfer', profileId: state.activeProfileId,
    type: 'transfer', questionId,
    response: '换一个初速度后，仍需先确认匀加速条件再使用速度时间关系。',
    verificationStatus: '教师已通过', createdAt: nextDayMinutesLater
  });
}
function topicResult() {
  return engine.topicEvidenceProfile(state, [q1, q2, q3], state.activeProfileId, now)
    .find((item) => item.topicKey === q1.knowledgePointId);
}

correctAttempt(q1, first);
correctAttempt(q1, nextDayMinutesLater);
correctAttempt(q2, nextDayMinutesLater);
verifiedTransfer(q1.id);

// A four-minute midnight crossing must not be treated as delayed retention.
assert.equal(engine.questionMasteryEvidence(state, q1.id, state.activeProfileId, now).status, '熟练');
assert.notEqual(topicResult().status, '可迁移');
assert.equal(engine.questionMasteryEvidence(state, q1.id, state.activeProfileId, now).independentDates, 1);
assert.equal(topicResult().independentDates, 1);

correctAttempt(q1, justUnderOneDay);
assert.equal(engine.questionMasteryEvidence(state, q1.id, state.activeProfileId, now).status, '熟练');
assert.notEqual(topicResult().status, '可迁移');

correctAttempt(q1, delayed);
assert.equal(engine.questionMasteryEvidence(state, q1.id, state.activeProfileId, now).status, '已掌握');
assert.equal(topicResult().status, '可迁移');
assert.equal(engine.questionMasteryEvidence(state, q1.id, state.activeProfileId, now).independentDates, 2);
assert.equal(topicResult().independentDates, 2);
console.log('mastery interval v4.0.2 QA passed');
