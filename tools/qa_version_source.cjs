const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const version = JSON.parse(read("version.json"));
const packageJson = JSON.parse(read("package.json"));
const serverPackage = JSON.parse(fs.readFileSync(path.join(root, "server", "package.json"), "utf8"));
assert.match(version.appVersion, /^\d+\.\d+\.\d+$/);
assert.equal(packageJson.version, version.appVersion, "package.json must follow version.json");
assert.equal(serverPackage.version, version.appVersion, "server/package.json must follow version.json");
assert.equal(version.stateVersion, 8);
assert.equal(version.reportFormatVersion, 4);

const engine = read("learning-engine.js");
assert.match(engine, /version:\s*APP_VERSION/);
assert.match(engine, new RegExp(`appVersion:\\s*["']${version.appVersion.replaceAll(".", "\\.")}["']`));
assert.match(engine, new RegExp(`stateVersion:\\s*${version.stateVersion}\\b`));
assert.match(engine, new RegExp(`reportFormatVersion:\\s*${version.reportFormatVersion}\\b`));
assert.match(read("backup.js"), /appVersion:\s*String\(learningEngine\.version/);

for (const file of ["Installer.cs", "Launcher.cs", "Uninstaller.cs", "LanClassroomService.cs"]) {
  const source = read(file);
  assert.match(source, new RegExp(`AssemblyVersion\\("${version.appVersion.replaceAll(".", "\\.")}\\.0"\\)`), `${file} assembly version mismatch`);
  assert.match(source, new RegExp(`AssemblyFileVersion\\("${version.appVersion.replaceAll(".", "\\.")}\\.0"\\)`), `${file} file version mismatch`);
}
assert.match(read("Installer.cs"), new RegExp(`AppVersion\\s*=\\s*"${version.appVersion.replaceAll(".", "\\.")}"`));

const android = read("android/src/com/physicsstudio/studyroom/MainActivity.java");
assert.match(android, /getPackageInfo\(getPackageName\(\), 0\)\.versionName/);
assert.doesNotMatch(android, /PhysicsStudioAndroid\/\d+\.\d+\.\d+/,
  "Android user-agent must use installed package version, not a copied literal");
assert.match(read("android/tools/build_android.ps1"), /version\.json/);
assert.match(read("tools/build_release.ps1"), /version\.json/);
assert.match(read("server/src/version.ts"), new RegExp(`APP_VERSION\\s*=\\s*["']${version.appVersion.replaceAll(".", "\\.")}["']`));
assert.doesNotMatch(read("tools/qa_browser.cjs"), /PHYSICS_LEARNING_ENGINE\?\.version\s*===\s*["']/);
assert.doesNotMatch(read("tools/qa_targeted_teacher_ui.cjs"), /PHYSICS_LEARNING_ENGINE\?\.version\s*===\s*["']/);

console.log(JSON.stringify({ status: "passed", version }, null, 2));
