const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'learning-engine.js'), 'utf8'), context);
const engine = context.PHYSICS_LEARNING_ENGINE;
let cases = 0;
let failed = 0;
function check(name, run) { cases++; try { run(); } catch (error) { failed++; console.error(name, error.message); } }
const grade = (answer, response, extra = {}) => engine.gradeFinalAnswer({ answer, questionType: '计算题', ...extra }, response);
for (const [answer, response] of [['10 N','10 J'], ['5 m/s，向右','5 m/s，向左'], ['−6 m/s','6 m/s'], ['5 m/s','不是5 m/s'], ['10 N','10 n'], ['10 N','10'], ['10 N','10 xyz'], ['5 m/s²','5 m/s']]) {
  check(`reject ${answer} / ${response}`, () => assert.notEqual(grade(answer, response).status, 'correct'));
}
for (const [answer, response] of [['1 kg','1000 g'], ['2 m²','20000 cm²'], ['1000 Pa','1 kPa'], ['−6 m/s','-6 m/s'], ['2×10⁻³ kg','2 g']]) {
  check(`equivalent ${answer} / ${response}`, () => assert.equal(grade(answer, response).status, 'correct'));
}
for (const response of ['AB', 'A/B', 'A、B', 'B,A']) {
  check(`multi choice ${response}`, () => assert.equal(grade('选A、B', response, { questionType: '多项选择题' }).status, 'correct'));
}
check('single bare A', () => assert.equal(grade('A', 'A', { questionType: '单项选择题' }).status, 'correct'));
for (const [answer, response] of [['不适合同时使用；总功率2700 W超过2200 W','适合同时使用；2700 W，2200 W'], ['第一问5 N，第二问10 N','10 N；5 N'], ['5 m/s，因为受力平衡','5 m/s']]) {
  check('unstructured open response pending', () => { const result=grade(answer,response); assert.equal(result.status, 'review-required'); assert.equal(result.score, null); });
}
for (const [equation, symbols] of [['p=m*v',{ p:'momentum' }], ['p=F/S',{ p:'pressure' }], ['E=F/q',{ E:'electricField' }], ['E=m*c^2',{ E:'energy', c:'speed' }]]) {
  check(`context ${equation}`, () => assert.equal(engine.validateDimension(equation, { symbols }).valid, true));
}
check('ambiguous p requires context', () => assert.equal(engine.validateDimension('p=m*v').valid, null));
check('unknown semantic is not false', () => assert.equal(engine.validateDimension('Z=m*v').valid, null));
check('unknown dimension UI manual', () => assert.equal(engine.verifyPhysicsAnswer({ answer:'5 N' }, '5 N', { equations:'Z=m*v' }).find(x=>x.key==='dimension').status,'manual'));
const schema = { answerSchemaVersion: 1, parts: [
  { id: 'force', kind: 'quantity', quantity: 'force', expected: { value: 10, unit: 'N' }, unitRequired: true, directionRequired: true, expectedDirection: 'right', tolerance: { absolute: 0, relative: 0 } },
  { id: 'mass', kind: 'quantity', quantity: 'mass', expected: { value: 1, unit: 'kg' }, unitRequired: true, tolerance: { absolute: 0, relative: 0 } }
] };
const structuredGrade = (parts) => grade('示意参考答案', { parts }, { answerSchema: schema, contentVersion: 'test-v1' });
check('schema binds IDs not position', () => assert.equal(structuredGrade([{ id:'mass', value:1000, unit:'g' },{ id:'force', value:10, unit:'N', direction:'right' }]).status,'correct'));
check('schema opposite direction', () => assert.notEqual(structuredGrade([{ id:'mass', value:1, unit:'kg' },{ id:'force', value:10, unit:'N', direction:'left' }]).status,'correct'));
check('schema direction verification fails', () => {
  const response={parts:[{ id:'mass',value:1,unit:'kg' },{id:'force',value:10,unit:'N',direction:'left'}]};
  assert.equal(engine.verifyPhysicsAnswer({answer:'参考',answerSchema:schema},response).find(x=>x.key==='direction').status,'fail');
});
check('schema unknown unit verification fails', () => {
  const response={parts:[{ id:'mass',value:1,unit:'xyz' },{id:'force',value:10,unit:'N',direction:'right'}]};
  assert.equal(engine.verifyPhysicsAnswer({answer:'参考',answerSchema:schema},response).find(x=>x.key==='unit').status,'fail');
});
check('schema missing direction pending', () => { const result=structuredGrade([{ id:'mass', value:1, unit:'kg' },{ id:'force', value:10, unit:'N' }]); assert.equal(result.status,'review-required'); assert.equal(result.score,null); });
check('schema unknown unit distinct', () => assert.equal(structuredGrade([{ id:'mass', value:1, unit:'xyz' },{ id:'force', value:10, unit:'N', direction:'right' }]).issues[0].type,'unknown-unit'));
check('schema missing part pending', () => assert.equal(structuredGrade([{ id:'force', value:10, unit:'N', direction:'right' }]).status,'review-required'));
check('schema duplicate IDs pending', () => assert.equal(structuredGrade([{ id:'force', value:10, unit:'N', direction:'right' },{ id:'force', value:1, unit:'kg' }]).status,'review-required'));
check('schema unknown extra item pending', () => assert.equal(structuredGrade([{ id:'mass', value:1, unit:'kg' },{ id:'force', value:10, unit:'N', direction:'right' },{ id:'extra', value:42 }]).status,'review-required'));
check('schema exact tolerance rejects deviation', () => assert.notEqual(structuredGrade([{ id:'mass', value:1.001, unit:'kg' },{ id:'force', value:10, unit:'N', direction:'right' }]).status,'correct'));
check('schema metadata and original response retained', () => { const result=structuredGrade([{ id:'mass', value:1, unit:'kg' },{ id:'force', value:10, unit:'N', direction:'right' }]); assert.equal(result.answerSchemaVersion,1); assert.equal(result.questionContentVersion,'test-v1'); assert.equal(result.rawResponse.parts[0].id,'mass'); });
check('unknown reference unit not auto-correct', () => assert.equal(grade('10 xyz','10 xyz').status,'review-required'));
check('unitless reference does not prove supplied dimension', () => assert.notEqual(grade('10','10 J').status,'correct'));
check('symbol identity not discarded', () => assert.notEqual(grade('F=10 N','E=10 N').status,'correct'));
check('negated choice is not selected choice', () => assert.notEqual(grade('A','不是A',{ questionType:'单项选择题' }).status,'correct'));
check('schema physical quantity definition consistent', () => assert.equal(grade('10 J',{ parts:[{ id:'force',value:10,unit:'J' }] },{ answerSchema:{answerSchemaVersion:1,parts:[{id:'force',kind:'quantity',quantity:'force',expected:{value:10,unit:'J'},unitRequired:true,tolerance:{absolute:0,relative:0}}]} }).status,'review-required'));
check('legacy marking preserves source and excludes mastery', () => {
  const state=engine.defaultState();
  const attempt=engine.recordAttempt(state,{ questionId:'audit-legacy', hintLevel:0, finalAnswer:'10 J', grading:{ status:'correct',score:1,issues:[] } });
  engine.markLegacyGradingForReview(state, [attempt.id], '旧单位判题无法核验');
  assert.equal(attempt.grading.status,'correct');
  assert.equal(attempt.finalAnswer,'10 J');
  assert.equal(engine.isValidAccuracyEvidence(attempt),false);
  assert.equal(engine.isPendingManualReview(attempt),true);
  assert.equal(engine.questionMasteryEvidence(state,'audit-legacy').independentCorrect,0);
  assert.equal(engine.automaticReviewRating(attempt),1);
  engine.completeManualReview(state,attempt.id,{status:'incorrect',score:0,reviewedBy:'audit-teacher'});
  assert.equal(engine.isPendingManualReview(attempt),false);
  assert.equal(engine.isValidAccuracyEvidence(attempt),true);
  assert.equal(attempt.grading.legacyReview.status,'reviewed');
});
console.log(JSON.stringify({ cases, failed }));
if (failed) process.exitCode = 1;
