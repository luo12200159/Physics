const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const visuals = require(path.join(projectRoot, "physics-visuals.js"));

function closeTo(actual, expected, tolerance = 1e-9, message = "") {
  assert.ok(Number.isFinite(actual), `${message || "value"} must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message || "value"}: expected ${expected}, received ${actual}`);
}

const force = visuals.forceDiagram({
  forces: [
    { label: "F₁", x: 10, y: 0 },
    { label: "F₂", x: -3, y: 4 },
  ],
});
closeTo(force.resultant.x, 7, 1e-12, "force resultant x");
closeTo(force.resultant.y, 4, 1e-12, "force resultant y");
closeTo(force.resultant.magnitude, Math.sqrt(65), 1e-12, "force resultant magnitude");
assert.match(force.svg, /<svg[^>]+force-diagram/);
assert.match(force.svg, /F₁/);

const motion = visuals.kinematics({ x0: 2, v0: 3, a: 4, t: 2, duration: 5 });
closeTo(motion.position, 16, 1e-12, "kinematic position");
closeTo(motion.velocity, 11, 1e-12, "kinematic velocity");
closeTo(motion.acceleration, 4, 1e-12, "kinematic acceleration");
assert.match(motion.svg, /x-t 图/);
assert.match(motion.svg, /v-t 图/);
assert.match(motion.svg, /a-t 图/);

const series = visuals.circuit({ voltage: 12, resistances: [4, 8], mode: "series" });
closeTo(series.totalResistance, 12, 1e-12, "series resistance");
closeTo(series.totalCurrent, 1, 1e-12, "series current");
assert.deepEqual(series.branchCurrents, [1, 1]);
assert.deepEqual(series.branchVoltages, [4, 8]);
assert.match(series.svg, /circuit-diagram/);

const parallel = visuals.circuit({ voltage: 12, resistances: [6, 3], mode: "parallel" });
closeTo(parallel.totalResistance, 2, 1e-12, "parallel resistance");
closeTo(parallel.totalCurrent, 6, 1e-12, "parallel current");
assert.deepEqual(parallel.branchCurrents, [2, 4]);
closeTo(parallel.branchCurrents.reduce((sum, value) => sum + value, 0), parallel.totalCurrent,
  1e-12, "Kirchhoff current law");

const fit = visuals.scatterFit({
  points: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }],
});
assert.equal(fit.valid, true);
closeTo(fit.slope, 2, 1e-12, "fit slope");
closeTo(fit.intercept, 1, 1e-12, "fit intercept");
closeTo(fit.r2, 1, 1e-12, "fit r2");
assert.match(fit.svg, /scatter-fit-diagram/);
assert.equal(visuals.scatterFit({ points: [{ x: 2, y: 1 }, { x: 2, y: 3 }] }).valid, false,
  "constant x has no y-on-x least-squares slope");

const reflected = visuals.rayDiagram({ mode: "reflection", incidenceAngle: 35 });
closeTo(reflected.reflectionAngle, 35, 1e-12, "reflection law");
assert.match(reflected.svg, /ray-diagram/);
const refracted = visuals.rayDiagram({ mode: "refraction", incidenceAngle: 30, n1: 1, n2: 1.5 });
closeTo(refracted.refractionAngle, Math.asin(1 / 3) * 180 / Math.PI, 1e-9, "Snell law");
assert.equal(refracted.totalInternalReflection, false);
const totalReflection = visuals.rayDiagram({ mode: "refraction", incidenceAngle: 50, n1: 1.5, n2: 1 });
assert.equal(totalReflection.totalInternalReflection, true);
assert.equal(totalReflection.refractionAngle, null);

const uniform = visuals.uniformMotion({ x0: 2, v0: 3, a: 4, t: 2, duration: 5 });
closeTo(uniform.position, 16, 1e-12, "uniform model position");
closeTo(uniform.velocity, 11, 1e-12, "uniform model velocity");

const newton = visuals.newtonSecondLaw({ mass: 2, appliedForce: 10, opposingForce: 2, t: 3 });
closeTo(newton.netForce, 8, 1e-12, "Newton net force");
closeTo(newton.acceleration, 4, 1e-12, "Newton acceleration");
closeTo(newton.velocity, 12, 1e-12, "Newton velocity");
closeTo(newton.position, 18, 1e-12, "Newton position");
assert.match(newton.svg, /force-diagram/);

const energy = visuals.mechanicalEnergy({
  mass: 2, g: 10, initialHeight: 10, height: 6, dissipationRatio: 0.25,
});
closeTo(energy.initialEnergy, 200, 1e-12, "initial mechanical energy");
closeTo(energy.potentialEnergy, 120, 1e-12, "potential energy");
closeTo(energy.dissipatedEnergy, 20, 1e-12, "dissipated energy");
closeTo(energy.kineticEnergy, 60, 1e-12, "kinetic energy");
closeTo(energy.potentialEnergy + energy.kineticEnergy + energy.dissipatedEnergy,
  energy.initialEnergy, 1e-12, "energy accounting");

const elastic = visuals.collision1D({ m1: 1, m2: 1, u1: 3, u2: 0, type: "elastic" });
closeTo(elastic.v1, 0, 1e-12, "elastic v1");
closeTo(elastic.v2, 3, 1e-12, "elastic v2");
closeTo(elastic.momentumBefore, elastic.momentumAfter, 1e-12, "elastic momentum");
closeTo(elastic.kineticBefore, elastic.kineticAfter, 1e-12, "elastic kinetic energy");
const inelastic = visuals.collision1D({ m1: 1, m2: 1, u1: 3, u2: 0, type: "inelastic" });
closeTo(inelastic.v1, 1.5, 1e-12, "inelastic v1");
closeTo(inelastic.v2, 1.5, 1e-12, "inelastic v2");
closeTo(inelastic.momentumBefore, inelastic.momentumAfter, 1e-12, "inelastic momentum");
assert.ok(inelastic.kineticAfter < inelastic.kineticBefore);

const wave = visuals.waveModel({ speed: 20, frequency: 5, amplitude: 2, time: 0.1 });
closeTo(wave.wavelength, 4, 1e-12, "wave equation");
closeTo(wave.period, 0.2, 1e-12, "wave period");
assert.match(wave.svg, /wave-diagram/);

const topicCases = [
  ["匀变速直线运动", "uniform"],
  ["牛顿第二定律", "newton"],
  ["机械能守恒", "energy"],
  ["完全非弹性碰撞", "collision"],
  ["波速、频率与波长", "wave"],
  ["串并联电路", "circuit"],
  ["平抛运动", "projectile"],
  ["斜面动力学", "incline"],
];
for (const [topic, expected] of topicCases) {
  assert.equal(visuals.modelForQuestion({ topic }), expected, `topic mapping: ${topic}`);
}

const metadataCases = [
  [{ visualSpec: { model: "one-dimensional-collision" }, topic: "综合题" }, "collision", "optional visualSpec"],
  [{ representationType: "图像", attachments: [{ name: "直流电路连接图.png", kind: "image" }] }, "circuit", "representation and attachment"],
  [{ knowledge: ["波长", "频率"], topic: "综合题" }, "wave", "knowledge array"],
  [{ model: "mechanical-energy", topic: "综合题" }, "energy", "explicit model"],
  [{ modelDefinitionId: "model:sample-force", representationType: "受力图" }, "newton", "model id and representation"],
];
for (const [question, expected, label] of metadataCases) {
  assert.equal(visuals.modelForQuestion(question), expected, `metadata mapping: ${label}`);
}

const frozenQuestion = Object.freeze({ topic: "机械能守恒", title: "测试题" });
assert.equal(visuals.modelForQuestion(frozenQuestion), "energy");
assert.deepEqual(frozenQuestion, { topic: "机械能守恒", title: "测试题" },
  "visual routing must not mutate question or learning evidence");

const indexSource = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const labSource = fs.readFileSync(path.join(projectRoot, "learning-lab.js"), "utf8");
const shellSource = fs.readFileSync(path.join(projectRoot, "experience-shell.js"), "utf8");
assert.ok(indexSource.indexOf('src="physics-visuals.js"') > -1, "index should load physics visuals");
assert.ok(indexSource.indexOf('src="physics-visuals.js"') < indexSource.indexOf('src="learning-lab.js"'),
  "physics visuals must load before learning lab");
assert.match(shellSource, /data-open-question-model=/, "question and wrong-question cards need model entry points");
assert.match(labSource, /selectModelForQuestion\(lab\.selectedQuestionId\)/,
  "model tab should route from the selected question");
const modelParameterBranches = [...labSource.matchAll(/else if \(event\.target\.matches\("\[data-model-param\]"\)\) \{([\s\S]*?)\n    \}/g)];
assert.ok(modelParameterBranches.length >= 2, "input and change handlers should both update model parameters");
modelParameterBranches.forEach((match) => {
  assert.doesNotMatch(match[1], /saveLearningState|recordAttempt|mastered|physics-learning-state-changed/,
    "model parameter changes must not write learning evidence");
});

const storage = new Map();
const context = { console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, "storage-repository.js"), "utf8"), context,
  { filename: "storage-repository.js" });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "learning-engine.js"), "utf8"), context,
  { filename: "learning-engine.js" });
const engine = context.PHYSICS_LEARNING_ENGINE;
const evidenceState = engine.defaultState();
const evidenceQuestionId = "qa-model-only-question";
assert.equal(engine.questionMasteryEvidence(evidenceState, evidenceQuestionId).code, "not-started");
visuals.uniformMotion({ x0: 0, v0: 2, a: 1, t: 3 });
visuals.newtonSecondLaw({ mass: 2, appliedForce: 8, opposingForce: 2, t: 3 });
assert.equal(evidenceState.attempts.length, 0, "offline model operations must not create attempts");
assert.equal(engine.questionMasteryEvidence(evidenceState, evidenceQuestionId).code, "not-started",
  "offline model operations must not count as mastery evidence");

console.log(JSON.stringify({
  status: "passed",
  components: ["force", "kinematics", "circuit", "scatter-fit", "ray"],
  offlineModels: ["uniform", "newton", "energy", "collision", "wave"],
}, null, 2));
