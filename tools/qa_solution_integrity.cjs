"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });
const shared = path.join(root, "solution-format.js");
if (fs.existsSync(shared)) vm.runInContext(fs.readFileSync(shared, "utf8"), context);
for (const file of ["curriculum-bank.js", "mock-exam-bank.js"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `window.testFormatter = formatDetailedSolution; })();`), context);
}
const questions = [...context.window.PHYSICS_CURRICULUM_BANK.questions, ...context.window.PHYSICS_MOCK_EXAM_BANK.questions];
const cases = [
  ["cs-original-v1-g8-01", "3.6 km = 3600 m"],
  ["cs-original-v1-g8-02", "0.80 s 是声音往返的总时间"],
  ["cs-original-v1-g9-08", "3.0 min = 180 s"],
  ["hn-mock-2027-gk-a-q12", "4.8 + 1.20r = 5.4 + 0.60r"],
  ["hn-mock-2027-gk-a-q12", "0.60r = 0.60"]
];
let failures = 0;
for (const [id, fragment] of cases) {
  const question = questions.find((item) => item.id === id);
  try { assert.ok(question.solution.includes(fragment), `${id}: missing ${fragment}`); }
  catch (error) { failures++; console.error(error.message); console.error(question.solution); }
}
assert.equal(failures, 0, `${failures} damaged numeric fragments`);
for (const text of ["3.6 km = 3600 m", "0.80 s", "-0.60r = -0.60", "−6 m/s", "1.2e-3 m", "3.0 × 10⁻⁴ m", "2x + 3 = 7", "1:2 的比例", "1. 未确认编号", "12、13 是数据"]) {
  assert.ok(context.window.testFormatter({ topic: "测试", solution: text, answer: "结果" }).includes(text), `must retain ${text}`);
}
const labeled = context.window.testFormatter({ topic: "测试", solution: "第 1 步：3.6 km = 3600 m。\n第2步:−6 m/s。", answer: "结果" });
assert.ok(!labeled.includes("第 1 步：") && !labeled.includes("第2步:"));
assert.ok(labeled.includes("3.6 km = 3600 m。") && labeled.includes("−6 m/s。"));
console.log("PASS: all five numeric fragments retained");
const api = context.window.PHYSICS_SOLUTION_FORMAT;
assert.equal(typeof api.repairBundledSolutions, "function", "safe old-content migration API is required");
const oldSolution = [
  "【考察点】机械运动", "【分步解析】",
  "1. 先明确题目条件、所求结论和研究对象，本题主要考察机械运动。",
  "2. 6 km = 3600 m，12 min = 720 s。",
  "3. 平均速度 v = s/t = 3600 m ÷ 720 s = 5 m/s。",
  "4. 整理上述推理，按题目要求写出结论：5 m/s。", "【最终结论】5 m/s。",
  "【结果复核】核对题目设问、物理规律适用条件、单位、方向和数量级；选择题同时核对其余选项为何不成立。"
].join("\n");
const oldRecord = { id: "cs-original-v1-g8-01", solution: oldSolution, notes: "用户笔记", attachments: [{ id: "media-1" }], wrongCount: 3 };
const before = JSON.stringify(oldRecord);
const upgraded = api.repairBundledSolutions([oldRecord]);
assert.deepEqual(Array.from(upgraded.repairedIds), [oldRecord.id]);
assert.ok(upgraded.questions[0].solution.includes("3.6 km = 3600 m"));
assert.equal(JSON.stringify(oldRecord), before, "planning must not mutate original records");
assert.equal(upgraded.questions[0].notes, "用户笔记");
assert.equal(upgraded.questions[0].attachments, oldRecord.attachments);
assert.equal(upgraded.questions[0].wrongCount, 3);
assert.equal(upgraded.questions[0].contentVersion, api.CONTENT_VERSION);
assert.equal(upgraded.questions[0].contentHash, api.solutionHash(upgraded.questions[0].solution));
assert.equal(api.repairBundledSolutions(upgraded.questions).repairedIds.length, 0, "upgrade must be idempotent");
const edited = { ...oldRecord, solution: oldSolution + "\n教师补充" };
const conflict = api.repairBundledSolutions([edited]);
assert.equal(conflict.questions[0], edited, "user-edited solution must remain untouched");
assert.equal(conflict.repairedIds.length, 0);
assert.equal(conflict.conflicts[0].id, edited.id);
const wrongHash = { ...oldRecord, contentHash: "different-hash" };
assert.equal(api.repairBundledSolutions([wrongHash]).questions[0], wrongHash, "inconsistent persisted hash must not be ignored");
const unknown = { ...oldRecord, id: "user-authored-question" };
assert.equal(api.repairBundledSolutions([unknown]).questions[0], unknown);
console.log("PASS: immutable, idempotent old-content repair; user edits and references retained");
const legacyRecords = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "legacy-damaged-solutions.json"), "utf8"));
assert.equal(legacyRecords.length, 4);
const migratedAll = api.repairBundledSolutions(legacyRecords);
assert.equal(migratedAll.repairedIds.length, 4);
assert.equal(migratedAll.conflicts.length, 0);
for (const [id, fragment] of cases) {
  assert.ok(migratedAll.questions.find((item) => item.id === id).solution.includes(fragment));
}
assert.equal(api.repairBundledSolutions(migratedAll.questions).repairedIds.length, 0);
for (const legacy of legacyRecords) {
  const recognized = { ...legacy, contentVersion: "2026.07.29-detailed-solutions-r2", contentHash: api.solutionHash(legacy.solution) };
  assert.equal(api.repairBundledSolutions([recognized]).repairedIds.length, 1);
  const otherVersion = { ...recognized, contentVersion: "user-content-v1" };
  assert.equal(api.repairBundledSolutions([otherVersion]).questions[0], otherVersion);
}
for (const question of questions) {
  assert.equal(question.contentVersion, api.CONTENT_VERSION);
  assert.equal(question.contentHash, api.solutionHash(question.solution));
}
const structured = { topic: "测试", solution: "【考察点】已排版\n1. 3.6 km = 3600 m", answer: "结果" };
assert.equal(api.formatDetailedSolution(structured), structured.solution, "already structured solutions remain byte-identical");
console.log("PASS: all four legacy records repaired safely; already structured text and numeric forms retained");
