const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html");
const app = read("app.js");
const lab = read("learning-lab.js");
const shell = read("experience-shell.js");
const storage = read("storage-repository.js");
const classroom = read("classroom-client.js");
const routes = read("server/src/modules/learning/routes.ts");
const migration = read("server/migrations/010_variant_training.ts");

assert.ok(index.indexOf('src="variant-generator.js"') > index.indexOf('src="learning-engine.js"'));
assert.ok(index.indexOf('src="variant-generator.js"') < index.indexOf('src="learning-lab.js"'));
assert.match(app, /generateVariantSet\(/, "legacy transfer entry must use complete variant sets");
assert.doesNotMatch(app, /请自己构造一道变式|仅写变式思路/u, "generic text-only transfer task must not be the primary flow");

const transferStart = lab.indexOf("function renderTransfer()");
const transferEnd = lab.indexOf("\n  function renderReview()", transferStart);
const transfer = lab.slice(transferStart, transferEnd);
assert.match(transfer, /session\.grading\s*\?[^]*renderVariantSolutionDetail\(variant\)/,
  "student solution must remain behind grading or an explicit reveal action");
assert.match(lab, /data-variant-reveal-solution[^]*hintLevel\s*=\s*5[^]*solutionViewed\s*=\s*true/,
  "explicit full solution must record hint level 5 and solutionViewed");
assert.match(lab, /data-variant-review="approve-all"/);
assert.match(lab, /data-variant-review="regenerate-one"/);
assert.match(lab, /data-lab-action="confirm-assignment-preview"/);
assert.match(lab, /assignmentPresetSelect/);
assert.match(lab, /applyAssignmentPreset\(/);
assert.match(lab, /physics-studio-assignment-confirmed/);

assert.match(storage, /variantSets/);
assert.match(storage, /variantAttempts/);
assert.match(classroom, /async function syncVariantSets\(/);
assert.match(classroom, /kind:\s*"variant-set-sync"/);
assert.match(classroom, /enqueueSyncEvent\(event\)/, "offline variant publishing must queue rather than fake success");
assert.match(shell, /client\.syncVariantSets/);
assert.match(shell, /client\.listVariantSets/);
assert.match(routes, /\/v1\/classes\/:classId\/variant-sets\/sync/);
assert.match(routes, /\/v1\/classes\/:classId\/variant-sets/);
assert.match(migration, /UNIQUE\s*\(class_id,\s*cache_key\)/i, "class sync must deduplicate approved cache keys");

console.log("Variant student/teacher UI and classroom sync QA passed");
