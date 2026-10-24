const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildScriptPath = path.join(root, "tools", "build_windows_current.ps1");
assert.ok(fs.existsSync(buildScriptPath), "Windows current-source build script is missing");

const buildScript = fs.readFileSync(buildScriptPath, "utf8");
assert.match(buildScript, /build_release\.ps1/);
assert.doesNotMatch(buildScript, /release-candidate-v2\.8\.0|Windows v2\.8 source snapshot/);

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const requiredScriptFiles = [
  "storage-repository.js",
  "question-answer-service.js",
  "classroom-client.js",
  "learning-engine.js",
  "variant-generator.js",
  "teacher-mode-lock.js",
  "app.js",
  "learning-lab.js",
  "experience-shell.js"
];
for (const file of requiredScriptFiles) {
  assert.match(index, new RegExp(`<script src="(?:vendor/)?${file.replaceAll(".", "\\.")}"></script>`), `index.html missing ${file}`);
}

const androidBuild = fs.readFileSync(path.join(root, "android", "tools", "build_android.ps1"), "utf8");
for (const file of requiredScriptFiles) {
  assert.match(androidBuild, new RegExp(`['"]${file.replaceAll(".", "\\.")}['"]`), `Android build missing ${file}`);
}

console.log(JSON.stringify({ status: "passed", parity: "Windows uses the same canonical web source as Android" }, null, 2));
