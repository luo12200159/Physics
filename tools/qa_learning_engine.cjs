const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "learning-engine.js"), "utf8");
const storage = new Map();
const context = {
  console,
  Date,
  Math,
  JSON,
  Object,
  Array,
  Map,
  Set,
  RegExp,
  String,
  Number,
  Boolean,
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "storage-repository.js"), "utf8"), context, { filename: "storage-repository.js" });
vm.runInContext(source, context, { filename: "learning-engine.js" });

const engine = context.PHYSICS_LEARNING_ENGINE;
assert.ok(engine, "learning engine should be exported");
assert.ok(
  engine.misconceptionCatalog.length >= 30 && engine.misconceptionCatalog.length <= 45,
  "misconception catalog should remain a maintainable 30-45 item diagnostic set"
);
const requiredMisconceptionCategories = [
  "声学",
  "光学",
  "热学与物态变化",
  "质量与密度",
  "力与运动",
  "压强与浮力",
  "功与简单机械",
  "电路与电学",
  "磁学",
  "电磁感应",
  "曲线运动与万有引力",
  "动量",
  "振动与波",
  "电场",
  "磁场",
  "交流电",
  "光电与原子核"
];
const misconceptionCodes = new Set();
const diagnosticIds = new Set();
const coveredMisconceptionCategories = new Set();
const supportedGrades = new Set(["八年级", "九年级", "高一", "高二", "高三"]);
engine.misconceptionCatalog.forEach((item) => {
  assert.equal(misconceptionCodes.has(item.code), false, `duplicate misconception code: ${item.code}`);
  misconceptionCodes.add(item.code);
  assert.equal(diagnosticIds.has(item.diagnostic.id), false, `duplicate diagnostic id: ${item.diagnostic.id}`);
  diagnosticIds.add(item.diagnostic.id);
  assert.ok(requiredMisconceptionCategories.includes(item.category), `unknown category: ${item.category}`);
  coveredMisconceptionCategories.add(item.category);
  assert.ok(Array.isArray(item.grades) && item.grades.length > 0, `${item.code} should declare grades`);
  item.grades.forEach((grade) => assert.equal(supportedGrades.has(grade), true, `${item.code} has unsupported grade ${grade}`));
  assert.ok(Array.isArray(item.topics) && item.topics.length > 0, `${item.code} should declare topics`);
  assert.ok(String(item.diagnostic.prompt || "").trim(), `${item.code} should have a prompt`);
  assert.ok(String(item.diagnostic.explanation || "").trim(), `${item.code} should have an explanation`);
  const choiceKeys = new Set(item.diagnostic.choices.map((choice) => choice[0]));
  const reasonKeys = new Set(item.diagnostic.reasons.map((reason) => reason[0]));
  assert.equal(choiceKeys.size, item.diagnostic.choices.length, `${item.code} choice keys should be unique`);
  assert.equal(reasonKeys.size, item.diagnostic.reasons.length, `${item.code} reason keys should be unique`);
  assert.equal(choiceKeys.has(item.diagnostic.correctAnswer), true, `${item.code} correctAnswer should name a choice`);
  assert.equal(reasonKeys.has(item.diagnostic.correctReason), true, `${item.code} correctReason should name a reason`);
});
requiredMisconceptionCategories.forEach((category) => {
  assert.equal(coveredMisconceptionCategories.has(category), true, `missing misconception category: ${category}`);
});
assert.ok(engine.formulaCatalog.length >= 20);

const state = engine.defaultState();
assert.equal(state.profiles.length, 1);
assert.equal(state.attempts.length, 0);

const misconception = engine.recordDiagnostic(state, {
  diagnosticId: "diag-force-motion",
  answer: "A",
  reason: "R1",
  confidence: 5
});
assert.equal(misconception.attempt.classification, "high-confidence-error");
assert.match(engine.diagnosticClassificationLabel(misconception.attempt), /待验证/);

const lowConfidenceState = engine.defaultState();
const lowConfidence = engine.recordDiagnostic(lowConfidenceState, {
  diagnosticId: "diag-force-motion",
  answer: "A",
  reason: "R1",
  confidence: 3
});
assert.notEqual(lowConfidence.attempt.classification, "stable-misconception");

state.diagnosticAttempts.unshift({
  id: "independent-confirmation-1",
  profileId: state.activeProfileId,
  misconceptionCode: misconception.attempt.misconceptionCode,
  diagnosticId: "independent-question-1",
  answer: "A",
  reason: "R1",
  answerCorrect: false,
  createdAt: "2026-08-07T10:00:00.000Z"
});
const confirmedMisconception = engine.recordDiagnostic(state, {
  diagnosticId: "diag-force-motion",
  answer: "A",
  reason: "R1",
  confidence: 5
});
assert.equal(confirmedMisconception.attempt.classification, "stable-misconception");
assert.equal(confirmedMisconception.attempt.confirmationEvidenceId, "independent-confirmation-1");

const secure = engine.recordDiagnostic(state, {
  diagnosticId: "diag-zero-velocity",
  answer: "B",
  reason: "R2",
  confidence: 5
});
assert.equal(secure.attempt.classification, "secure");

const choiceQuestion = {
  id: "choice-1",
  title: "声现象",
  topic: "声音",
  answer: "选 A。音叉是声源。",
  solution: "音叉振动产生声音。",
  examPoints: ["声源"]
};
assert.equal(engine.gradeFinalAnswer(choiceQuestion, "A").status, "correct");
assert.equal(engine.gradeFinalAnswer(choiceQuestion, "我选 B，因为音叉会振动").status, "incorrect");

const multipleChoiceQuestion = {
  ...choiceQuestion,
  id: "choice-2",
  answer: "选 A、B、D。"
};
assert.equal(engine.gradeFinalAnswer(multipleChoiceQuestion, "A/B/D").status, "correct");

const numericQuestion = {
  id: "numeric-1",
  title: "速度换算",
  topic: "运动",
  answer: "20 m/s",
  solution: "统一单位后比较。",
  examPoints: ["速度"]
};
assert.equal(engine.gradeFinalAnswer(numericQuestion, "72 km/h").status, "correct");
const missingUnit = engine.gradeFinalAnswer(numericQuestion, "20");
assert.equal(missingUnit.status, "partial");
assert.equal(missingUnit.issues[0].type, "missing-unit");
assert.equal(engine.gradeFinalAnswer(numericQuestion, "-20 m/s").issues[0].type, "sign");
assert.equal(engine.gradeFinalAnswer(numericQuestion, "20 kg").issues[0].type, "unit");
const verification = engine.verifyPhysicsAnswer(
  numericQuestion,
  "72 km/h",
  { equations: "v=s/t", reasonableness: "数量级和极限情况合理" }
);
assert.equal(verification.find((item) => item.key === "unit").status, "pass");
assert.equal(verification.find((item) => item.key === "magnitude").status, "pass");
assert.equal(verification.find((item) => item.key === "alternative").status, "manual");

const textBlankQuestion = {
  id: "text-blank-1",
  title: "物态变化填空",
  topic: "物态变化",
  questionType: "填空题",
  answer: "第一空填“吸热”；第二空填“温度不变”。",
  solution: "按熔化过程判断能量变化和温度特点。"
};
const correctTextBlanks = engine.gradeFinalAnswer(textBlankQuestion, "吸热 温度不变");
assert.equal(correctTextBlanks.status, "correct");
assert.equal(correctTextBlanks.score, 1);
const partialTextBlanks = engine.gradeFinalAnswer(textBlankQuestion, "吸热；温度升高");
assert.equal(partialTextBlanks.status, "partial");
assert.equal(partialTextBlanks.issues[0].location, "第 2 空");
assert.equal(engine.gradeFinalAnswer({
  ...textBlankQuestion,
  id: "text-blank-unstructured",
  answer: "吸热、温度不变。"
}, "吸热；温度不变").status, "review-required");
assert.equal(engine.gradeFinalAnswer({
  ...textBlankQuestion,
  id: "experiment-blank",
  questionType: "实验探究题"
}, "吸热；温度不变").status, "review-required");

const explanationQuestion = {
  id: "explain-1",
  title: "解释惯性",
  topic: "惯性",
  answer: "物体具有惯性，合力为零时保持匀速直线运动。",
  solution: "依据牛顿第一定律。",
  examPoints: ["牛顿第一定律"]
};
assert.equal(engine.gradeFinalAnswer(explanationQuestion, "依据牛顿第一定律").status, "review-required");

assert.equal(engine.createHintLadder(choiceQuestion).length, 5);
assert.ok(engine.socraticPrompts(choiceQuestion).length >= 5);

const model = {
  object: "研究对象为小车",
  known: "已知初速度 v0",
  unknown: "求撤去推力后的速度 v",
  process: "分为撤去推力前后两个过程",
  assumptions: "忽略阻力，视为质点",
  coordinates: "沿运动方向建立坐标轴，以向右为正方向",
  forces: "受重力和支持力，合力为零",
  equations: "依据牛顿第一定律，v=v0",
  reasonableness: "单位、方向和极限情况均合理"
};
const modelScore = engine.scoreModeling(model);
assert.ok(modelScore.total >= 85);
assert.equal(Object.keys(modelScore.detail).length, 9);

const grading = engine.gradeFinalAnswer(choiceQuestion, "A");
engine.recordAttempt(state, {
  questionId: choiceQuestion.id,
  topic: choiceQuestion.topic,
  questionType: "单选题",
  stage: "初中",
  durationSeconds: 180,
  confidenceBefore: 3,
  confidenceAfter: 5,
  hintLevel: 1,
  finalAnswer: "A",
  grading,
  model,
  reflection: "检查了研究对象",
  errorType: "公式选错"
});
assert.equal(state.attempts[0].questionType, "单项选择题");
assert.equal(state.attempts[0].errorType, "规律选择或适用条件");
assert.equal(state.attempts[0].errorTypeCode, "law-condition");
[
  ["审题偏差", "审题或计算疏漏"],
  ["前概念混淆", "概念理解"],
  ["研究对象选择不当", "研究对象/建模"],
  ["公式选错", "规律选择或适用条件"],
  ["有效数字错误", "单位/方向/符号"],
  ["实验图表读取错误", "图像与表征"]
].forEach(([input, expected]) => assert.equal(engine.normalizeErrorType(input), expected));
const summary = engine.summarizeLearning(state, [choiceQuestion]);
assert.equal(summary.completed, 1);
assert.equal(summary.accuracy, 100);
assert.equal(summary.independenceRate, 100);
assert.equal(summary.learningMinutes, 3);
assert.ok(engine.modelingRadar(state).every((axis) => axis.value > 0));

const now = Date.now();
const review = engine.scheduleReview(state, choiceQuestion.id, 0, now);
const automaticCorrectInterval = 3 * 24 * 60 * 60 * 1000;
assert.equal(review.lastRating, 2);
assert.equal(review.ratingSource, "automatic-answer-and-hints");
assert.equal(new Date(review.dueAt).getTime() - now, automaticCorrectInterval);
assert.equal(engine.dueReviews(state, now).length, 0);
assert.equal(engine.dueReviews(state, now + automaticCorrectInterval).length, 1);

assert.equal(engine.validateDimension("F=m*a").valid, true);
assert.equal(engine.validateDimension("W=F/t").valid, false);
assert.equal(engine.validateDimension("F=mystery*a").status, "符号待定义");
assert.equal(engine.convertUnit(72, "km/h", "m/s"), 20);
assert.throws(() => engine.convertUnit(1, "kg", "m"));

const regression = engine.linearRegression([
  { x: 0, y: 1 },
  { x: 1, y: 3 },
  { x: 2, y: 5 }
]);
assert.equal(regression.slope, 2);
assert.equal(regression.intercept, 1);
assert.equal(regression.r2, 1);

const questions = [
  { ...choiceQuestion, id: "q1", stage: "高中", grade: "高一", difficulty: "基础", fullTextIncluded: true },
  { ...choiceQuestion, id: "q2", stage: "高中", grade: "高一", difficulty: "进阶", fullTextIncluded: true },
  { ...choiceQuestion, id: "q3", stage: "高中", grade: "高一", difficulty: "挑战", fullTextIncluded: false }
];
const assignment = engine.generateAssignment(questions, { stage: "高中", grade: "高一", count: 10 });
assert.equal(assignment.questionCount, 2);
assert.deepEqual([...assignment.questionIds], ["q1", "q2"]);
assert.equal(assignment.reviewStatus, "教师待审核");

const variants = engine.transferVariants({
  title: "斜面上的物块",
  topic: "受力分析",
  examPoints: ["牛顿第二定律"]
});
assert.equal(variants.length, 3);
assert.ok(variants.some((variant) => variant.type === "反例辨析"));

const recommendations = engine.recommendations(state, questions, 3);
assert.ok(recommendations.length > 0);

const masteryState = engine.defaultState();
const masteryQuestion = {
  id: "mastery-q",
  title: "平抛运动",
  stage: "高中",
  grade: "高一",
  topic: "曲线运动",
  difficulty: "进阶",
  content: "从高处水平抛出小球，求运动时间。",
  solution: "竖直方向使用自由落体规律。",
  answer: "2 s",
  fullTextIncluded: true
};
const correctGrading = { status: "correct", score: 1, issues: [] };
const firstMasteryAttempt = engine.recordAttempt(masteryState, {
  questionId: masteryQuestion.id,
  topic: masteryQuestion.topic,
  stage: masteryQuestion.stage,
  hintLevel: 1,
  finalAnswer: "2 s",
  grading: correctGrading,
  model,
  selfExplanation: "竖直方向满足自由落体规律。"
});
firstMasteryAttempt.createdAt = "2026-07-24T10:00:00.000Z";
firstMasteryAttempt.completedAt = firstMasteryAttempt.createdAt;
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "熟练");
const secondMasteryAttempt = engine.recordAttempt(masteryState, {
  questionId: masteryQuestion.id,
  topic: masteryQuestion.topic,
  stage: masteryQuestion.stage,
  hintLevel: 0,
  finalAnswer: "2 s",
  grading: correctGrading,
  model,
  selfExplanation: "竖直分运动决定下落时间。"
});
secondMasteryAttempt.createdAt = "2026-07-25T10:00:00.000Z";
secondMasteryAttempt.completedAt = secondMasteryAttempt.createdAt;
masteryState.experimentRecords.push({
  id: "transfer-evidence",
  type: "transfer",
  profileId: masteryState.activeProfileId,
  questionId: masteryQuestion.id,
  response: "研究对象仍为小球，改变高度后继续用 h=gt²/2 求时间。",
  verificationStatus: "教师已通过",
  createdAt: "2026-07-25T10:10:00.000Z"
});
engine.scheduleReview(masteryState, masteryQuestion.id, 3, Date.now());
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "已掌握");
const masteryReview = engine.reviewsForProfile(masteryState)[0];
masteryReview.dueAt = new Date(Date.now() - 1000).toISOString();
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "待复习");
engine.recordAttempt(masteryState, {
  questionId: masteryQuestion.id,
  topic: masteryQuestion.topic,
  stage: masteryQuestion.stage,
  hintLevel: 4,
  finalAnswer: "3 s",
  grading: { status: "incorrect", score: 0, issues: [] },
  model,
  selfExplanation: "尚未分清竖直分运动。"
});
assert.equal(engine.questionMasteryEvidence(masteryState, masteryQuestion.id).status, "薄弱");

const abilityState = engine.defaultState();
const abilityQuestions = [
  { ...masteryQuestion, id: "ability-motion", topic: "运动学", questionType: "计算题", modelDefinitionId: "model-motion-1", independenceGroupId: "independent-motion-1" },
  { ...masteryQuestion, id: "ability-motion-transfer", topic: "运动学", questionType: "条件变式题", modelDefinitionId: "model-motion-2", independenceGroupId: "independent-motion-2" },
  { ...masteryQuestion, id: "ability-circuit", topic: "电路", questionType: "实验探究题" },
  { ...masteryQuestion, id: "ability-optics", topic: "光学", questionType: "作图题" },
  { ...masteryQuestion, id: "ability-sound", topic: "声学", questionType: "选择题" }
];
function addDatedAttempt(input, completedAt) {
  const attempt = engine.recordAttempt(abilityState, {
    stage: "高中",
    confidenceBefore: 3,
    confidenceAfter: 4,
    finalAnswer: input.grading.status === "correct" ? "2 s" : "待订正",
    selfExplanation: "说明规律、条件和建模过程。",
    model,
    ...input
  });
  attempt.startedAt = completedAt;
  attempt.completedAt = completedAt;
  attempt.createdAt = completedAt;
  return attempt;
}
addDatedAttempt({
  questionId: "ability-motion-transfer",
  topic: "运动学",
  questionType: "计算题",
  hintLevel: 0,
  grading: correctGrading
}, "2026-07-01T12:00:00.000Z");
addDatedAttempt({
  questionId: "ability-motion",
  topic: "运动学",
  questionType: "计算题",
  hintLevel: 1,
  grading: correctGrading
}, "2026-07-02T12:00:00.000Z");
addDatedAttempt({
  questionId: "ability-motion",
  topic: "运动学",
  questionType: "条件变式题",
  hintLevel: 0,
  transferType: "far",
  grading: correctGrading
}, "2026-07-03T12:00:00.000Z");
addDatedAttempt({
  questionId: "ability-circuit",
  topic: "电路",
  questionType: "实验探究题",
  hintLevel: 2,
  errorType: "前概念混淆",
  grading: { status: "incorrect", score: 0, issues: [] }
}, "2026-07-02T13:00:00.000Z");
addDatedAttempt({
  questionId: "ability-circuit",
  topic: "电路",
  questionType: "实验探究题",
  hintLevel: 3,
  errorType: "单位换算失误",
  grading: { status: "incorrect", score: 0, issues: [] }
}, "2026-07-03T13:00:00.000Z");
addDatedAttempt({
  questionId: "ability-optics",
  topic: "光学",
  questionType: "作图题",
  hintLevel: 1,
  grading: correctGrading
}, "2026-07-02T14:00:00.000Z");
addDatedAttempt({
  questionId: "ability-optics",
  topic: "光学",
  questionType: "作图题",
  hintLevel: 0,
  grading: correctGrading
}, "2026-07-02T15:00:00.000Z");

const knowledgePoints = engine.topicEvidenceProfile(
  abilityState,
  abilityQuestions,
  abilityState.activeProfileId,
  new Date("2026-07-04T12:00:00.000Z").getTime()
);
const motionEvidence = knowledgePoints.find((item) => item.topic === "运动学");
const circuitEvidence = knowledgePoints.find((item) => item.topic === "电路");
const opticsEvidence = knowledgePoints.find((item) => item.topic === "光学");
const soundEvidence = knowledgePoints.find((item) => item.topic === "声学");
assert.equal(motionEvidence.status, "可迁移");
assert.equal(motionEvidence.sampleSize, 3);
assert.equal(motionEvidence.latestEvidenceDate, "2026-07-03");
assert.equal(motionEvidence.transferSuccessCount, 1);
assert.equal(motionEvidence.questionTypes.find((item) => item.label === "计算题").count, 2);
assert.equal(circuitEvidence.status, "需巩固");
assert.deepEqual(
  Array.from(circuitEvidence.errorTypes, (item) => item.label).sort(),
  ["概念理解", "单位/方向/符号"].sort()
);
assert.equal(opticsEvidence.status, "基本掌握");
assert.equal(opticsEvidence.sampleSize, 2);
assert.equal(soundEvidence.status, "证据不足");
assert.equal(soundEvidence.sampleSize, 0);

const abilityAnalysis = engine.studentAnalysis(
  abilityState,
  abilityQuestions,
  abilityState.activeProfileId
);
assert.equal(abilityAnalysis.abilityProfile.knowledgePointCounts["可迁移"], 1);
assert.ok(abilityAnalysis.abilityProfile.questionTypes.some((item) => item.label === "实验探究题"));

const gradeDiagnosticCases = [
  { grade: "八年级", topic: "质量与密度", diagnosticId: "diag-density-property" },
  { grade: "九年级", topic: "电功率", diagnosticId: "diag-electric-energy-unit" },
  { grade: "高一", topic: "平抛运动", diagnosticId: "diag-projectile-time" },
  { grade: "高二", topic: "简谐运动", diagnosticId: "diag-shm-equilibrium" },
  { grade: "高三", topic: "光电效应", diagnosticId: "diag-photoelectric-frequency" }
];
gradeDiagnosticCases.forEach(({ grade, topic, diagnosticId }) => {
  const gradeState = engine.defaultState();
  gradeState.profiles[0].grade = grade;
  const gradeQuestions = Array.from({ length: 24 }, (_, index) => ({
    id: `grade-diagnostic-${grade}-${index + 1}`,
    title: `${topic}摸底题${index + 1}`,
    stage: grade.startsWith("高") ? "高中" : "初中",
    grade,
    topic,
    questionType: "单项选择题",
    difficulty: "基础",
    content: `${topic}的完整题干与条件。`,
    solution: `依据${topic}的基本规律分析。`,
    answer: "选 A。",
    examPoints: [topic],
    fullTextIncluded: true
  }));
  const gradePlacement = engine.generatePlacementDiagnostic(gradeState, gradeQuestions, {
    count: 20,
    seed: `qa-grade-diagnostic-${grade}`
  });
  assert.equal(gradePlacement.containsMisconceptionDiagnostics, true, `${grade} should include a matching diagnostic`);
  assert.equal(
    gradePlacement.items.some((item) => item.kind === "misconception-diagnostic" && item.id === diagnosticId),
    true,
    `${grade} placement should include ${diagnosticId}`
  );
  gradePlacement.items.filter((item) => item.kind === "misconception-diagnostic").forEach((item) => {
    const catalogItem = engine.misconceptionCatalog.find((candidate) => candidate.diagnostic.id === item.id);
    assert.ok(catalogItem.grades.includes(grade), `${item.id} should match ${grade}`);
  });
});

const placementTopics = ["惯性", "加速度", "自由落体", "电流", "平面镜成像", "受力分析", "温度", "圆周运动"];
const placementQuestions = Array.from({ length: 32 }, (_, index) => {
  const topic = placementTopics[index % placementTopics.length];
  return {
    id: `placement-question-${index + 1}`,
    title: `${topic}摸底题${index + 1}`,
    stage: "高中",
    grade: "高一",
    topic,
    questionType: index % 3 === 0 ? "单项选择题" : "计算题",
    difficulty: "基础",
    content: `${topic}的完整题干与已知条件，要求给出结论。`,
    solution: `依据${topic}相关规律分步分析并核对条件。`,
    answer: "结论与题设条件一致。",
    examPoints: [topic],
    fullTextIncluded: true
  };
});
const placementState = engine.defaultState();
placementState.profiles[0].createdAt = "2026-01-01T00:00:00.000Z";
const placement = engine.generatePlacementDiagnostic(placementState, placementQuestions, {
  count: 24,
  seed: "qa-placement"
});
assert.equal(placement.questionCount, 24);
assert.equal(placement.meetsTargetRange, true);
assert.equal(placement.targetCountMet, true);
assert.equal(placement.containsMisconceptionDiagnostics, true);
assert.equal(placement.coverage.complete, true);
const sourceQuestionIds = new Set(placementQuestions.map((question) => question.id));
placement.items.filter((item) => item.kind === "bank-question").forEach((item) => {
  assert.equal(sourceQuestionIds.has(item.id), true, `placement invented question ${item.id}`);
});

const limitedPlacement = engine.generatePlacementDiagnostic(placementState, placementQuestions.slice(0, 1), {
  count: 20,
  seed: "qa-limited-placement"
});
assert.equal(limitedPlacement.meetsTargetRange, false);
assert.ok(limitedPlacement.warnings.some((message) => message.includes("少于目标")));

const beforeBroadCoverage = engine.scheduleBroadCoverageCheck(placementState, placementQuestions, {
  now: new Date("2026-01-14T00:00:00.000Z"),
  seed: "qa-broad"
});
assert.equal(beforeBroadCoverage.due, false);
assert.equal(beforeBroadCoverage.paper, null);
const dueBroadCoverage = engine.scheduleBroadCoverageCheck(placementState, placementQuestions, {
  now: new Date("2026-01-15T00:00:00.000Z"),
  seed: "qa-broad"
});
assert.equal(dueBroadCoverage.due, true);
assert.equal(dueBroadCoverage.intervalDays, 14);
assert.equal(dueBroadCoverage.paper.questionCount, 20);
engine.recordBroadCoverageCheck(placementState, {
  id: "broad-coverage-qa-1",
  questionIds: dueBroadCoverage.paper.items.map((item) => item.id),
  coveredTopics: dueBroadCoverage.paper.coverage.coveredTopics,
  coverageComplete: dueBroadCoverage.paper.coverage.complete,
  completedAt: "2026-01-15T00:00:00.000Z"
});
assert.equal(engine.scheduleBroadCoverageCheck(placementState, placementQuestions, {
  now: new Date("2026-01-28T00:00:00.000Z")
}).due, false);
assert.equal(engine.scheduleBroadCoverageCheck(placementState, placementQuestions, {
  now: new Date("2026-01-29T00:00:00.000Z")
}).due, true);

const streak = engine.closedLoopStreak(
  abilityState,
  abilityState.activeProfileId,
  new Date("2026-07-04T12:00:00.000Z")
);
assert.equal(streak.currentStreak, 3);
assert.equal(streak.longestStreak, 3);
assert.equal(streak.badges.find((badge) => badge.requiredDays === 3).earned, true);
assert.equal(streak.rankingEnabled, false);
assert.match(streak.feedbackPolicy, /不设置积分、排行榜/);

const migratedState = engine.normalizeState({
  ...engine.defaultState(),
  attempts: [{
    profileId: "student-default",
    questionId: "legacy-attempt",
    examQuestionType: "多选题",
    errorType: "审题偏差"
  }]
});
assert.equal(migratedState.attempts[0].questionType, "多项选择题");
assert.equal(migratedState.attempts[0].errorType, "审题或计算疏漏");

const audit = engine.auditQuestion({
  title: "水平面上物体的受力与加速度",
  stage: "初中",
  grade: "八年级",
  topic: "力与运动",
  source: "教师自编",
  sourceLicense: "个人原创",
  content: "质量为2 kg的物体受到水平向右10 N拉力和向左4 N摩擦力，求合力大小和方向。",
  solution: "研究对象为物体，由合力定义 F合=F拉-f，结果为6 N，方向向右。",
  answer: "6 N，方向向右。",
  attachments: [],
  fullTextIncluded: true
});
assert.ok(audit.issues.some((issue) => issue.code === "title-question-加速度"));
assert.equal(audit.requiresTeacherReview, true);

const report = engine.createReportPayload(state, questions);
assert.equal(report.format, "physics-learning-profile");
assert.equal(report.summary.completed, 1);
assert.equal(report.attempts.length, 1);
assert.ok(report.summary.closedLoop);
assert.ok(Array.isArray(report.analysis.knowledgePoints));

const saved = engine.saveState(state);
assert.equal(engine.loadState().attempts.length, saved.attempts.length);

console.log(JSON.stringify({
  status: "passed",
  misconceptionDiagnostics: engine.misconceptionCatalog.length,
  formulaCount: engine.formulaCatalog.length,
  modelScore: modelScore.total,
  masteryRuleVersion: engine.version,
  contentAuditRisks: audit.errorCount + audit.warningCount,
  reportAttempts: report.attempts.length
}, null, 2));
