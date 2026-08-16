const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const windows = fs.readFileSync(path.join(project, "Launcher.cs"), "utf8");
const android = fs.readFileSync(path.join(project, "android", "src", "com", "physicsstudio", "studyroom", "MainActivity.java"), "utf8");
const shell = fs.readFileSync(path.join(project, "experience-shell.js"), "utf8");
const questionAnswerService = fs.readFileSync(path.join(project, "question-answer-service.js"), "utf8");

assert.match(windows, /FindMicrosoftEdge\(\)/);
assert.match(windows, /Microsoft\\Edge\\Application\\msedge\.exe/);
assert.match(windows, /UseShellExecute\s*=\s*true/);
assert.match(windows, /改用 Edge 或系统默认浏览器打开/);
assert.match(android, /EDGE_PACKAGE\s*=\s*"com\.microsoft\.emmx"/);
assert.match(android, /setPackage\(EDGE_PACKAGE\)/);
assert.match(android, /openWithDefaultHandler\(uri\)/);
assert.match(questionAnswerService, /https:\/\/www\.bing\.com\/search\?q=/);
assert.match(questionAnswerService, /openEdgeSearch/);
assert.match(shell, /外部结果不直接写入学情证据/);
assert.match(shell, /studentExternalLinks:\s*true/);
assert.match(shell, /当前巩固重点/);

console.log(JSON.stringify({
  status: "passed",
  windows: "Edge-first with default fallback",
  android: "Edge-first with default fallback",
  questionAnswerService: "Bing search fallback keeps external results outside learning evidence"
}, null, 2));
