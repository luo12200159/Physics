"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fflate = require("../vendor/fflate.js");

const root = path.resolve(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
const businessAssets = [
  "styles.css", "learning-lab.css", "experience-shell.css", "activation.css",
  "activation-public-key.js", "activation.js", "curriculum-taxonomy.js",
  "solution-format.js", "curriculum-bank.js", "exam-question-index.js",
  "mock-exam-bank.js", "original-practice-bank.js", "targeted-practice-bank.js",
  "security.js", "backup.js", "backup-validator.js", "ai-tutor.js",
  "document-import.js", "content-catalog.js", "classroom-client.js",
  "question-answer-service.js", "storage-repository.js", "learning-engine.js",
  "physics-visuals.js", "motion-representation-drafts.js", "variant-generator.js",
  "app.js", "learning-lab.js", "experience-shell.js"
];
const editions = [
  { label: "student", file: `费曼物理学生端-Android-v${version.appVersion}.apk`, teacherLock: false },
  { label: "teacher", file: `费曼物理教师端-Android-v${version.appVersion}.apk`, teacherLock: true },
];
for (const edition of editions) {
  const apk = path.join(root, "发布", "Android", edition.file);
  assert.ok(fs.existsSync(apk), `${edition.label} APK missing: ${apk}`);
  const entries = fflate.unzipSync(new Uint8Array(fs.readFileSync(apk)));
  for (const name of businessAssets) {
    assert.ok(entries[`assets/${name}`], `${edition.label} APK missing assets/${name}`);
    assert.deepEqual(Buffer.from(entries[`assets/${name}`]), fs.readFileSync(path.join(root, name)),
      `${edition.label} APK business resource is stale: ${name}`);
  }
  const index = Buffer.from(entries["assets/index.html"] || []).toString("utf8");
  assert.match(index, /<script src="version-config\.js"><\/script>/);
  assert.match(index, /<script src="solution-format\.js"><\/script>/);
  const runtimeVersion = Buffer.from(entries["assets/version-config.js"] || []).toString("utf8");
  assert.match(runtimeVersion, new RegExp(`"appVersion":"${version.appVersion.replaceAll(".", "\\.")}"`));
  if (edition.teacherLock) {
    assert.deepEqual(
      Buffer.from(entries["assets/teacher-mode-lock.js"] || []),
      fs.readFileSync(path.join(root, "teacher-mode-lock.js")),
      "teacher APK must contain the current teacher PIN management source",
    );
  } else {
    assert.equal(entries["assets/teacher-mode-lock.js"], undefined, "student APK must not bundle teacher PIN management");
  }
}
console.log(`Student and teacher APK source parity passed: ${businessAssets.length} shared business files, v${version.appVersion}`);
