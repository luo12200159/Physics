"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(project, name), "utf8");

const studentManifest = read("android/app-student/AndroidManifest.xml");
const teacherManifest = read("android/app-teacher/AndroidManifest.xml");
const activity = read("android/src/com/physicsstudio/studyroom/MainActivity.java");
const build = read("android/tools/build_android.ps1");
const index = read("index.html");
const experience = read("experience-shell.js");
const classroom = read("classroom-client.js");
const classService = read("server/src/modules/classes/service.ts");

assert.match(studentManifest, /package="com\.physicsstudio\.student"/);
assert.match(teacherManifest, /package="com\.physicsstudio\.teacher"/);
assert.match(studentManifest, /physicsStudioEdition" android:value="student"/);
assert.match(teacherManifest, /physicsStudioEdition" android:value="teacher"/);
assert.match(studentManifest, /android:allowBackup="false"/);
assert.match(teacherManifest, /android:allowBackup="false"/);
assert.match(studentManifest, /android:scheme="physicsstudio" android:host="join"/);

// Both application modules render the shared role UI and business modules.
// Student v4 may change its navigation, but compact duplicate app prototypes
// must not become a second product implementation.
for (const asset of [
  "styles.css", "learning-lab.css", "experience-shell.css", "app.js",
  "learning-lab.js", "experience-shell.js", "document-import.js",
  "content-catalog.js", "exam-question-index.js",
]) {
  assert.match(index, new RegExp(asset.replaceAll(".", "\\.")));
  assert.match(build, new RegExp(`'${asset.replaceAll(".", "\\.")}'`));
}
assert.match(build, /\$AndroidIndexName = 'index\.html'/);
assert.match(build, /PHYSICS_STUDIO_APP_EDITION/);
assert.match(build, /if \(\$Edition -eq 'student'\)[\s\S]*teacher-mode-lock\.js/);
assert.equal(fs.existsSync(path.join(project, "student-app.js")), false);
assert.equal(fs.existsSync(path.join(project, "teacher-app.js")), false);
assert.equal(fs.existsSync(path.join(project, "dual-app.css")), false);

assert.match(experience, /const FIXED_ROLE = APP_EDITION === "student" \|\| APP_EDITION === "teacher"/);
assert.match(experience, /if \(FIXED_ROLE\) experience\.role = FIXED_ROLE/);
assert.match(experience, /\["home", "⌂", "首页"\]/);
assert.match(experience, /\["course", "目", "课程"\]/);
assert.match(experience, /\["training", "▤", "训练"\]/);
assert.match(experience, /\["analysis", "◎", "学情"\]/);
assert.match(experience, /\["profile", "○", "我的"\]/);
assert.match(experience, /打开教师中心/);
assert.match(experience, /打开班级/);
assert.match(experience, /FIXED_ROLE \? "" : '<button data-teacher-action="switch"/);

assert.match(activity, /"teacher"\.equals\(appEdition\) \|\| "legacy"\.equals\(appEdition\)/);
assert.match(activity, /saveSecureCredential/);
assert.match(activity, /AndroidKeyStore/);
assert.match(activity, /startUrlForIntent/);
assert.match(build, /ValidateSet\('legacy', 'student', 'teacher'\)/);
assert.match(build, /费曼物理学生端/);
assert.match(build, /费曼物理教师端/);

assert.match(classroom, /appEdition\(\) === "student"/);
assert.match(classroom, /学生端不能创建或管理班级/);
assert.match(classroom, /saveSecureCredential\("refresh-token"/);
assert.match(classService, /actor\.role !== "teacher" && actor\.role !== "administrator"/);

console.log("Shared role interface, student v4 navigation, independent Android packages, and RBAC checks passed");
