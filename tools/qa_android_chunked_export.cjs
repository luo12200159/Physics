"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const start = source.indexOf("async function downloadBlob(");
const end = source.indexOf("\nfunction exportQuestions()", start);
assert.ok(start >= 0 && end > start);
const activity = fs.readFileSync(path.join(root, "android/src/com/physicsstudio/studyroom/MainActivity.java"), "utf8");
for (const method of ["beginChunkedFileExport", "appendChunkedFileExport", "finishChunkedFileExport", "abortChunkedFileExport"]) {
  assert.ok(activity.includes(`public void ${method}(`), `Android bridge missing ${method}`);
}

(async () => {
  const chunks = [];
  let opened = null;
  const payload = Buffer.alloc(900_000, 0x5a);
  const window = {
    PhysicsStudioSecurity: { limits: { androidExportBytes: 100 * 1024 * 1024 } },
    setTimeout, clearTimeout,
    PhysicsStudioAndroid: {
      beginChunkedFileExport(id, name, mime, size) { opened = { id, name, mime, size }; },
      appendChunkedFileExport(id, index, base64) {
        assert.equal(id, opened.id);
        assert.equal(index, chunks.length);
        const chunk = Buffer.from(base64, "base64");
        assert.ok(chunk.length <= 256 * 1024, "individual bridge allocation is bounded");
        chunks.push(chunk);
      },
      finishChunkedFileExport(id) {
        assert.equal(id, opened.id);
        setTimeout(() => window.PhysicsStudioAndroidExportResponse({ requestId: id, status: "saved" }), 0);
      },
      abortChunkedFileExport() { throw new Error("unexpected abort"); },
      saveBase64FileWithAck() { throw new Error("full-file Base64 bridge must not be used"); }
    }
  };
  const context = { window, Blob, Uint8Array, btoa, crypto, FileReader: class {
    constructor() { throw new Error("full-file FileReader must not be used"); }
  }, URL, document: {} };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nwindow.downloadBlob = downloadBlob;`, context);
  await window.downloadBlob("report.pslab", new Blob([payload], { type: "application/vnd.physics-studio.backup+zip" }));
  assert.equal(opened.name, "report.pslab");
  assert.equal(opened.size, payload.length);
  assert.ok(chunks.length > 1);
  assert.deepEqual(Buffer.concat(chunks), payload);
  console.log(`Android chunked export QA passed: ${chunks.length} bounded chunks`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
