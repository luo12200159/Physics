const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const lab = fs.readFileSync(path.join(project, "learning-lab.js"), "utf8");
const css = fs.readFileSync(path.join(project, "learning-lab.css"), "utf8");

const decisionLoop = lab.indexOf("${studentDecisionLoop}");
const targetedPlan = lab.indexOf('<section class="lab-card targeted-plan-card">', decisionLoop);
const advancedCoverage = lab.indexOf("${contentCoverage}", targetedPlan);
assert.ok(decisionLoop >= 0, "teacher detail must render the evidence decision loop");
assert.ok(targetedPlan > decisionLoop, "teacher plan must follow evidence and priorities");
assert.ok(advancedCoverage > targetedPlan, "question-bank maintenance must follow the student decision loop");
assert.match(lab, /renderTargetedRetestStatus\(lab\.state, profile\?\.id, activePlan, planProgress\)/);
assert.match(lab, /decisionLoop\.after\(targetedPlan\)/);
assert.doesNotMatch(lab, /id="examRecordWeakTopics"/);
assert.match(lab, /id="examRecordScore"[^>]*value=""/);
assert.match(lab, /id="examRecordTotal"[^>]*value=""/);
assert.match(lab, /无记录\/不适用/);
assert.match(css, /\.student-decision-loop/);

console.log(JSON.stringify({
  status: "passed",
  studentDecisionLoopBeforePlan: true,
  advancedQuestionToolsDeferred: true,
  retestStatusVisible: true,
  examDefaultsBlank: true
}, null, 2));
