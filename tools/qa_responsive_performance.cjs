const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(project, relative), "utf8");
const lab = read("learning-lab.js");
const labStyles = read("learning-lab.css");
const experience = read("experience-shell.js");
const activity = read("android/src/com/physicsstudio/studyroom/MainActivity.java");
const launcher = read("Launcher.cs");

assert.match(labStyles, /\.diagnostic-question\s*\{[\s\S]*overflow-x\s*:\s*hidden/);
assert.match(labStyles, /\.diagnostic-question\s*\{[\s\S]*touch-action\s*:\s*pan-x\s+pan-y/);
assert.match(labStyles, /html\.android-app[\s\S]*\.lab-two-column\s*\{[\s\S]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/);
assert.match(labStyles, /\.diagnostic-question fieldset[\s\S]*width\s*:\s*100%/);
assert.match(lab, /function bindHorizontalScroller\s*\(/);
assert.match(lab, /derivedLearningCache/);
assert.match(lab, /function getDerivedLearning\s*\(/);
assert.match(lab, /function renderPanel\s*\(options = \{\}\)/);
assert.match(lab, /lab\.panel\.innerHTML\s*=\s*'<div class="lab-opening-state"/);
assert.match(lab, /requestAnimationFrame\(render\)/);
assert.match(experience, /let studentDataCache\s*=\s*null/);
assert.match(experience, /studentDataCache\?\.data/);
assert.match(experience, /function scheduleStudentAnalysisWarmup\s*\(/);
assert.match(experience, /includePlacement/);
assert.match(experience, /window\.setTimeout\(\(\) => \{[\s\S]*renderDiagnosticPackage/);
assert.match(activity, /setUseWideViewPort\(true\)/);
assert.match(launcher, /WorkingArea/);

console.log("Responsive layout, viewport, and assessment responsiveness checks passed");
