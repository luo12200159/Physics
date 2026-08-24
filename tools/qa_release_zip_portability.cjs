const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const buildScript = fs.readFileSync(path.join(project, "tools", "build_release.ps1"), "utf8");
if (!buildScript.includes("Compress-NormalizedSourceZip")) {
  throw new Error("build_release.ps1 must use the normalized source ZIP writer");
}
if (!buildScript.includes(".Replace('\\', '/')")) {
  throw new Error("source ZIP entry paths must normalize backslashes to slashes");
}
if (!buildScript.includes("qa_release_zip_portability.cjs")) {
  throw new Error("build_release.ps1 must run the source ZIP portability gate after packaging");
}
const requiredDualSources = [
  "安装应用.ps1", "安装应用.cmd", "teacher-mode-lock.js", "physics-visuals.js", "variant-generator.js",
  "student-index.html", "student-app.js", "teacher-index.html", "teacher-app.js",
  "dual-app-common.js", "dual-app-data.js", "dual-app.css",
];
for (const required of requiredDualSources) {
  if (!buildScript.includes(required)) throw new Error(`source ZIP staging list missing ${required}`);
}
function centralDirectoryNames(buffer) {
  const eocd = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const offset = buffer.lastIndexOf(eocd);
  if (offset < 0) throw new Error("ZIP EOCD not found");
  const count = buffer.readUInt16LE(offset + 10);
  const directoryOffset = buffer.readUInt32LE(offset + 16);
  const names = [];
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("invalid ZIP central directory");
    const flags = buffer.readUInt16LE(cursor + 8);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    names.push(nameBytes.toString((flags & 0x800) ? "utf8" : "latin1"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

const version = JSON.parse(fs.readFileSync(path.join(project, "version.json"), "utf8")).appVersion;
const zipPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(project, "发布", `费曼物理-源码-v${version}.zip`);
if (!fs.existsSync(zipPath)) {
  throw new Error(`current release ZIP not found: ${zipPath}; build v${version} before running the release gate`);
}
const names = centralDirectoryNames(fs.readFileSync(zipPath));
if (names.some((name) => name.includes("\\") || name.split("/").includes(".."))) {
  throw new Error("ZIP contains Windows separators or traversal entries");
}
for (const required of requiredDualSources) {
  const exists = names.includes(required) || names.some((name) => name.startsWith(`${required}/`));
  if (!exists) throw new Error(`ZIP missing ${required}`);
}
for (const required of ["android/app-student/AndroidManifest.xml", "android/app-teacher/AndroidManifest.xml"]) {
  if (!names.includes(required)) throw new Error(`ZIP missing ${required}`);
}

console.log(JSON.stringify({
  status: "passed",
  staticChecks: true,
  inspectedZip: path.relative(project, zipPath).replaceAll("\\", "/"),
  portability: "UTF-8 names and forward-slash entries"
}, null, 2));
