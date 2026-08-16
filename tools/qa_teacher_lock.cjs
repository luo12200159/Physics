const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lockSource = fs.readFileSync(path.join(__dirname, "..", "teacher-mode-lock.js"), "utf8");
const shellSource = fs.readFileSync(path.join(__dirname, "..", "experience-shell.js"), "utf8");
const labSource = fs.readFileSync(path.join(__dirname, "..", "learning-lab.js"), "utf8");
assert.match(lockSource, /PBKDF2/);
assert.match(lockSource, /SHA-256/);
assert.match(lockSource, /getRandomValues/);
assert.match(lockSource, /sessionStorage/);
assert.match(lockSource, /physics-teacher-mode-lock-v1/);
assert.doesNotMatch(lockSource, /setItem\([^,]+,\s*pin\)/i, "PIN must not be written as plaintext");
assert.match(shellSource, /async function ensureTeacherUnlocked/);
assert.match(shellSource, /window\.PhysicsStudioTeacherLock\.isUnlocked/);
assert.match(shellSource, /data-teacher-action="lock"/);
assert.match(labSource, /PhysicsStudioTeacherLock.*isUnlocked/);

console.log(JSON.stringify({ status: "passed", pinStorage: "PBKDF2+salt", sessionUnlock: true, roleSwitchGate: true, lockAction: true }, null, 2));
