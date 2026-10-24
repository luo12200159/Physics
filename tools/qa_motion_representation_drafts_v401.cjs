"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const project = path.resolve(__dirname, "..");
const context = { console, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const name of ["physics-visuals.js", "motion-representation-drafts.js"]) {
  vm.runInContext(fs.readFileSync(path.join(project, name), "utf8"), context, { filename: name });
}
const drafts = context.PhysicsStudioMotionDrafts?.questions;
assert.equal(drafts?.length, 4);
assert.deepEqual(Array.from(drafts, (item) => item.representationType).sort(),
  ["概念辨析", "运动图像", "实验数据", "跨情境解释"].sort());
assert.equal(new Set(Array.from(drafts, (item) => item.id)).size, 4);
for (const item of drafts) {
  assert.equal(item.grade, "高一");
  assert.equal(item.contentReviewStatus, "待教师审核");
  assert.equal(item.diagnosticEligible, false);
  assert.equal(item.autoScorable, false);
  assert.ok(item.content && item.answer && item.solution && item.questionType);
  assert.match(item.solution, /条件|加速度恒定/);
  const model = context.PHYSICS_VISUALS.kinematics(item.visualSpec.params);
  assert.ok(Math.abs(model.position - item.expectedModelOutput.position) < 1e-9);
  assert.ok(Math.abs(model.velocity - item.expectedModelOutput.velocity) < 1e-9);
}
console.log("qa_motion_representation_drafts_v401: passed");
