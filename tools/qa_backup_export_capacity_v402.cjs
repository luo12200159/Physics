"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const fflate = require("../vendor/fflate.js");

const context = { console, Blob, File, TextEncoder, TextDecoder, Uint8Array, DataView, crypto: crypto.webcrypto, fflate };
context.window = context;
context.globalThis = context;
context.PhysicsStudioSecurity = {
  sha256: async (blob) => crypto.createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex"),
  sanitizeFileName: (name) => String(name),
  inspectFile: async () => ({ kind: "zip" })
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "backup.js"), "utf8"), context);
const backup = context.PhysicsStudioBackup;

class LargeMediaBlob extends Blob {
  constructor(size) { super([]); this.sizeForTest = size; this.readCount = 0; }
  get size() { return this.sizeForTest; }
  async arrayBuffer() { this.readCount += 1; throw new Error("Media was read before capacity check"); }
}

const large = new LargeMediaBlob(101 * 1024 * 1024);
const small = new LargeMediaBlob(1024);
const questions = [
  { id: "q-large", title: "large", attachments: [], videoBlob: large },
  { id: "q-small", title: "small", attachments: [], videoBlob: small }
];
const app = { getQuestions: () => questions };
const engine = { version: "4.0.2", loadState: () => ({ version: 10, profiles: [] }) };

(async () => {
  await assert.rejects(
    backup.create(app, engine, { password: "test-password-1234", maxOutputBytes: 100 * 1024 * 1024 }),
    /100 MB|100 MiB|100MB/
  );
  assert.equal(large.readCount, 0, "oversized media must not be read before Android output preflight");
  assert.equal(small.readCount, 0, "preflight must include all media before reading the first media blob");

  const nearLimit = new LargeMediaBlob(100 * 1024 * 1024 - 256);
  const metadataHeavyApp = {
    getQuestions: () => [{ id: "q-heavy", title: "x".repeat(4096), attachments: [], videoBlob: nearLimit }]
  };
  await assert.rejects(
    backup.create(metadataHeavyApp, engine, { password: "test-password-1234", maxOutputBytes: 100 * 1024 * 1024 }),
    /100 MB|100 MiB|100MB|单文件导出上限/
  );
  assert.equal(nearLimit.readCount, 0, "question metadata must be included in the preflight lower bound");

  const implicitAndroid = new LargeMediaBlob(101 * 1024 * 1024);
  context.PhysicsStudioAndroid = { saveBase64FileWithAck() {} };
  await assert.rejects(
    backup.create({ getQuestions: () => [{ id: "q-native", attachments: [], videoBlob: implicitAndroid }] }, engine, { password: "test-password-1234" }),
    /100 MB|100 MiB|100MB/
  );
  assert.equal(implicitAndroid.readCount, 0, "native Android backup limit must apply even if caller omits maxOutputBytes");

  const compressed = new File([
    fflate.zipSync({ "oversized.bin": new Uint8Array(2048) }, { level: 6 })
  ], "compressed.pslab", { type: "application/zip" });
  await assert.rejects(
    backup.restore(compressed, { restoreCompleteBackup: async () => ({ restored: 0 }) }, engine,
      { allowLegacyUnencrypted: true, maxUncompressedBytes: 1024 }),
    /解压|总量|上限/
  );
  console.log("qa_backup_export_capacity_v402: passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
