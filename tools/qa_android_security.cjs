const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(project, relative), "utf8");
const manifest = read("android/AndroidManifest.xml");
const network = read("android/res/xml/network_security_config.xml");
const extraction = read("android/res/xml/data_extraction_rules.xml");
const activity = read("android/src/com/physicsstudio/studyroom/MainActivity.java");
const androidBuild = read("android/tools/build_android.ps1");
const styles = `${read("styles.css")}\n${read("learning-lab.css")}\n${read("experience-shell.css")}`;
const labStyles = read("learning-lab.css");
const labScript = read("learning-lab.js");

assert.match(manifest, /usesCleartextTraffic\s*=\s*"false"/);
assert.match(manifest, /networkSecurityConfig\s*=\s*"@xml\/network_security_config"/);
assert.match(manifest, /dataExtractionRules\s*=\s*"@xml\/data_extraction_rules"/);
// API 23-30 and Android 12+ must both keep sensitive WebView/local learning
// data out of system backup. allowBackup=false is the explicit cross-version
// policy; the extraction rules remain as defence in depth for newer tooling.
assert.match(manifest, /android:allowBackup\s*=\s*"false"/);
assert.doesNotMatch(manifest, /fullBackupContent\s*=\s*"@xml\/full_backup_content"/);
assert.match(network, /cleartextTrafficPermitted="false"/);
assert.match(network, />localhost<\/domain>/);
assert.match(network, />127\.0\.0\.1<\/domain>/);
assert.match(extraction, /disableIfNoEncryptionCapabilities="true"/);
assert.match(extraction, /<cloud-backup[^>]*disableIfNoEncryptionCapabilities/);
assert.match(extraction, /<exclude domain="file"/);
assert.match(extraction, /<exclude domain="database"/);
assert.match(extraction, /<exclude domain="sharedpref"/);
assert.match(activity, /setAllowFileAccess\(false\)/);
assert.match(activity, /setAllowFileAccessFromFileURLs\(false\)/);
assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/);
assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
assert.match(activity, /setSafeBrowsingEnabled\(true\)/);
assert.match(activity, /setUseWideViewPort\(true\)/);
assert.match(activity, /setLoadWithOverviewMode\(false\)/);
assert.match(androidBuild, /storage-repository\.js/);
assert.doesNotMatch(styles, /\.answer[^{}]*\{[^}]*overflow-x\s*:\s*auto/s);
assert.match(labStyles, /\.lab-panel\s*\{[\s\S]*touch-action\s*:\s*pan-x\s+pan-y/);
assert.match(labStyles, /\.diagnostic-selector\s*\{[\s\S]*overflow-x\s*:\s*auto[\s\S]*touch-action\s*:\s*pan-x/);
assert.match(labStyles, /\.diagnostic-question\s*\{[\s\S]*overflow-x\s*:\s*hidden[\s\S]*touch-action\s*:\s*pan-x\s+pan-y/);
assert.match(labStyles, /\.diagnostic-choice-text\s*\{[\s\S]*min-width\s*:\s*0[\s\S]*overflow-wrap\s*:\s*anywhere/);
assert.match(labStyles, /\.tutor-choice-response label\s*\{[\s\S]*grid-template-columns:\s*auto\s+30px\s+minmax\(0,\s*1fr\)/);
assert.match(labStyles, /\.tutor-choice-response label\s*>\s*span[\s\S]*overflow-wrap:\s*anywhere/);
assert.match(labStyles, /\.tutor-choice-response\s*\{[\s\S]*overflow-x:\s*hidden/);
assert.match(labScript, /function bindHorizontalScroller\(/);
assert.match(labScript, /element\.addEventListener\("pointermove"/);
assert.match(labScript, /requestAnimationFrame\(render\)/);

console.log("Android URL, backup, WebView, and mobile overflow security checks passed");
