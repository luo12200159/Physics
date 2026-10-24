"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const fflate = require("../vendor/fflate.js");

const context = { console, Blob, File, TextEncoder, TextDecoder, Uint8Array, DataView, crypto: crypto.webcrypto, fflate };
context.window = context;
context.globalThis = context;
context.PhysicsStudioSecurity = {
  sha256: async (blob) => crypto.createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex"),
  sanitizeFileName: (name) => String(name).replace(/[\\/:*?"<>|]/g, "_"),
  inspectFile: async () => ({ kind: "zip" })
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", "backup.js"), "utf8"), context);
const backup = context.PhysicsStudioBackup;
const state = { version: 10, profiles: [{ id: "student-default" }], attempts: [{ id: "a1", profileId: "student-default" }] };
const questions = [{
  id: "q1", title: "测试题", content: "小车运动", answer: "2 m/s",
  solution: "由速度公式计算", attachments: [], videoBlob: null
}];
let restoreCount = 0;
const app = {
  getQuestions: () => questions,
  restoreCompleteBackup: async (nextQuestions, nextState) => {
    restoreCount += 1;
    assert.equal(nextQuestions[0].id, "q1");
    assert.equal(nextState.attempts[0].id, "a1");
    return { restored: nextQuestions.length };
  }
};
const engine = { version: "4.0.1", loadState: () => state, normalizeState: (value) => value };
const password = "unique-offline-backup-password";
const text = new TextEncoder();

(async () => {
  await assert.rejects(backup.create(app, engine), /至少 12 个字符/);
  const result = await backup.create(app, engine, { password });
  const encryptedBytes = new Uint8Array(await result.blob.arrayBuffer());
  assert.equal(backup.isEncrypted(encryptedBytes), true);
  assert.notEqual(encryptedBytes[1], 0x4b, "encrypted envelope must not expose ZIP header");
  const file = new File([encryptedBytes], "data.pslab", { type: "application/octet-stream" });
  await assert.rejects(backup.restore(file, app, engine, { password: "incorrect-passphrase" }), /密码错误|篡改/);
  assert.equal(restoreCount, 0);
  const tampered = encryptedBytes.slice();
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(backup.restore(new File([tampered], "tampered.pslab"), app, engine, { password }), /密码错误|篡改/);
  assert.equal(restoreCount, 0);
  const restored = await backup.restore(file, app, engine, { password });
  assert.equal(restored.encrypted, true);
  assert.equal(restoreCount, 1);

  const raw = {
    "questions.json": text.encode(JSON.stringify({ format: "physics-studio-questions", version: 4, questions })),
    "learning-profile.json": text.encode(JSON.stringify({ format: "physics-learning-state", version: 10, state }))
  };
  const files = await Promise.all(Object.entries(raw).map(async ([entryPath, bytes]) => ({
    path: entryPath,
    size: bytes.length,
    mime: "application/json",
    sha256: await context.PhysicsStudioSecurity.sha256(new Blob([bytes]))
  })));
  raw["manifest.json"] = text.encode(JSON.stringify({
    format: "physics-studio-complete-backup", version: 1,
    questionCount: 1, profileCount: 1, files
  }));
  const legacy = new File([fflate.zipSync(raw)], "legacy.pslab", { type: "application/zip" });
  await assert.rejects(backup.restore(legacy, app, engine), /未加密/);
  assert.equal(restoreCount, 1);
  const legacyResult = await backup.restore(legacy, app, engine, { allowLegacyUnencrypted: true });
  assert.equal(legacyResult.encrypted, false);
  assert.equal(restoreCount, 2);
  console.log("qa_encrypted_backup_v401: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
