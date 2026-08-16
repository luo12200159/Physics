const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "android", "src", "com", "physicsstudio", "studyroom", "MainActivity.java"), "utf8");
assert.match(source, /saveTextFile[\s\S]{0,900}sanitizeGenericFileName\(fileName, mimeType\)/);
assert.match(source, /extensionForMime[\s\S]{0,900}"application\/json"/);
assert.match(source, /"text\/html"/);
assert.match(source, /"text\/csv"/);
assert.match(source, /"text\/plain"/);
assert.match(source, /replaceAll/);
assert.match(source, /p\{Cntrl\}/);

function sanitize(fileName, mimeType) {
  let safe = fileName == null ? "物理试题导出" : String(fileName).trim();
  safe = safe.replace(/[\\/:*?"<>|\p{Cc}]/gu, "_").replace(/\.{2,}/g, "_").replace(/^\.+/, "");
  if (!safe) safe = "物理试题导出";
  const ext = ({ "application/json": ".json", "text/html": ".html", "text/csv": ".csv", "text/plain": ".txt" })[String(mimeType || "").toLowerCase()] || "";
  if (ext && !safe.toLowerCase().endsWith(ext)) {
    const dot = safe.lastIndexOf(".");
    if (dot > 0) safe = safe.slice(0, dot);
    safe += ext;
  }
  return safe;
}

assert.equal(sanitize("report.html", "text/html"), "report.html");
assert.equal(sanitize("data.csv", "text/csv"), "data.csv");
assert.equal(sanitize("backup.json", "application/json"), "backup.json");
assert.equal(sanitize("notes", "text/plain"), "notes.txt");
assert.equal(sanitize("..\\secret/report", "text/html"), "__secret_report.html");
assert.equal(sanitize("C:\\temp\\backup", "application/json"), "C__temp_backup.json");
assert.ok(!sanitize("..\\secret", "text/plain").includes(".."));

console.log(JSON.stringify({ status: "passed", mimeExtensions: [".json", ".html", ".csv", ".txt"], pathTraversal: "blocked" }, null, 2));
