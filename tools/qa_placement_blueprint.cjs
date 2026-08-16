const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "curriculum-taxonomy.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "learning-engine.js"), "utf8"), context);
const engine = context.PHYSICS_LEARNING_ENGINE;
const state = engine.defaultState();
const profileId = state.activeProfileId;
const topics = Array.from({ length: 8 }, (_, index) => `kp:test-${index + 1}`);
const capabilityLabels = ["基础概念", "条件判断", "模型识别", "图像表征理解", "实验与探究", "建模", "定量计算", "迁移反例"];
const questions = Array.from({ length: 32 }, (_, index) => ({
  id: `placement-q-${index + 1}`,
  grade: "高一",
  topic: `测试知识点${index % topics.length + 1}`,
  knowledgePointId: topics[index % topics.length],
  questionType: index % 4 === 0 ? "选择题" : index % 4 === 1 ? "填空题" : index % 4 === 2 ? "实验题" : "计算题",
  difficulty: index % 3 === 0 ? "挑战" : index % 3 === 1 ? "进阶" : "基础",
  cognitiveDemand: capabilityLabels[index % capabilityLabels.length],
  representationType: index % 8 === 3 ? "图像" : index % 8 === 4 ? "实验" : "文字/公式",
  diagnosticEligible: true,
  evidenceTier: "diagnostic-anchor",
  modelDefinitionId: `model-${index % 12}`,
  independenceGroupId: `group-${index % 12}`,
  content: `完整题干 ${index + 1}，要求${capabilityLabels[index % capabilityLabels.length]}。`,
  answer: "1",
  solution: "步骤一；步骤二；结论。",
  fullTextIncluded: true,
  status: "published"
}));

const targets = topics.slice(0, 4);
const paper = engine.generatePlacementDiagnostic(state, questions, {
  profileId, count: 24, scopeType: "custom", targetKnowledgePointIds: targets, seed: "blueprint-test"
});
assert.deepEqual([...paper.blueprint.targetKnowledgePointIds].sort(), [...targets].sort());
assert.equal(paper.blueprintCoverage.targetCount, 4, "placement denominator must be declared blueprint targets");
assert.ok(paper.blueprintCoverage.coverageRate <= 100);
assert.equal(paper.capabilityCoverage.targetCount, 8);
assert.equal(paper.capabilityCoverage.coveredCount, 8, "placement selection must cover every available cognitive dimension");
assert.deepEqual(Array.from(paper.capabilityCoverage.missingDimensions), []);
assert.equal(paper.longitudinalEvidenceCoverage.totalKnowledgePoints, 8,
  "longitudinal course coverage must remain separate from placement blueprint coverage");

const historical = engine.recordAttempt(state, {
  questionId: paper.items.find((item) => item.kind === "bank-question").id,
  topic: "测试知识点1", knowledgePointId: targets[0], grading: { status: "correct", score: 1 },
  createdAt: "2020-01-01T00:00:00.000Z", completedAt: "2020-01-01T00:01:00.000Z"
});
const session = engine.startPlacementAssessment(state, paper, { profileId });
const refreshed = engine.refreshPlacementAssessment(state, session.id);
assert.equal(refreshed.submittedCount, 0, "historical answers must not complete a new placement session");
assert.ok(historical.id);

console.log(JSON.stringify({
  status: "passed",
  blueprintCoverage: paper.blueprintCoverage,
  longitudinalDenominator: paper.longitudinalEvidenceCoverage.totalKnowledgePoints,
  historicalEvidenceExcluded: true
}, null, 2));
