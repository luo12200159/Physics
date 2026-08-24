const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(project, name), "utf8");

const studentManifest = read("android/app-student/AndroidManifest.xml");
const teacherManifest = read("android/app-teacher/AndroidManifest.xml");
const activity = read("android/src/com/physicsstudio/studyroom/MainActivity.java");
const build = read("android/tools/build_android.ps1");
const studentHtml = read("student-index.html");
const teacherHtml = read("teacher-index.html");
const studentApp = read("student-app.js");
const teacherApp = read("teacher-app.js");
const classroom = read("classroom-client.js");
const classService = read("server/src/modules/classes/service.ts");

assert.match(studentManifest, /package="com\.physicsstudio\.student"/);
assert.match(teacherManifest, /package="com\.physicsstudio\.teacher"/);
assert.match(studentManifest, /physicsStudioEdition" android:value="student"/);
assert.match(teacherManifest, /physicsStudioEdition" android:value="teacher"/);
assert.match(studentManifest, /android:allowBackup="false"/);
assert.match(teacherManifest, /android:allowBackup="false"/);
assert.match(studentManifest, /android:scheme="physicsstudio" android:host="join"/);

assert.match(studentHtml, /student-app\.js/);
assert.doesNotMatch(studentHtml, /teacher-app\.js|teacher-mode-lock\.js|learning-lab\.js|experience-shell\.js/);
assert.match(teacherHtml, /teacher-app\.js/);
assert.doesNotMatch(teacherHtml, /student-app\.js|experience-shell\.js/);
assert.doesNotMatch(studentApp, /createClass\(|createAssignment\(|listRoster\(|decideReviewCase\(/);
assert.match(studentApp, /submitAssignment\(/);
assert.match(studentApp, /assistanceLocked/);
assert.match(studentApp, /variantStartTimes/);
assert.match(studentApp, /durationSeconds:\s*Math\.max\(1, Math\.round/);
assert.doesNotMatch(studentApp, /durationSeconds:\s*1[,\n]/);
assert.doesNotMatch(studentApp, /name="hintLevel"/);
assert.match(teacherApp, /createClass\(/);
assert.match(teacherApp, /createAssignment\(/);
assert.match(teacherApp, /listRoster\(/);
assert.match(teacherApp, /decideReviewCase\(/);
assert.match(teacherApp, /pending-sync-publish/);
assert.doesNotMatch(teacherApp, /recordAttempt\(|recordVariantAttempt\(|submitAssignment\(/);

assert.match(activity, /"teacher"\.equals\(appEdition\) \|\| "legacy"\.equals\(appEdition\)/);
assert.match(activity, /saveSecureCredential/);
assert.match(activity, /AndroidKeyStore/);
assert.match(activity, /startUrlForIntent/);
assert.match(build, /ValidateSet\('legacy', 'student', 'teacher'\)/);
assert.match(build, /SharedWebAssets/);
assert.match(build, /费曼物理学生端/);
assert.match(build, /费曼物理教师端/);

assert.match(classroom, /appEdition\(\) === "student"/);
assert.match(classroom, /学生端不能创建或管理班级/);
assert.match(classroom, /saveSecureCredential\("refresh-token"/);
assert.match(classService, /actor\.role !== "teacher" && actor\.role !== "administrator"/);

console.log("Independent student/teacher Android package and RBAC boundary checks passed");
