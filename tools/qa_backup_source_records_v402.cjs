"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await installQaActivationStub(page, "backup-source-records-v402");
    await page.addInitScript(() => {
      globalThis.PHYSICS_STUDIO_APP_EDITION = "student";
      localStorage.setItem("physics-experience-v2", JSON.stringify({
        version: 2, onboarded: true, role: "student", displayName: "备份测试同学",
        grade: "高一", textbook: "人教版", goal: "日常巩固", weeklyGoal: 12,
        events: [], activeDates: []
      }));
    });
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.waitForFunction(() => globalThis.PhysicsStudioApp?.getQuestions?.().length >= 1900,
      null, { timeout: 30_000 });

    const result = await page.evaluate(async () => {
      const app = globalThis.PhysicsStudioApp;
      const engine = globalThis.PHYSICS_LEARNING_ENGINE;
      const backup = globalThis.PhysicsStudioBackup;
      const source = {
        id: "qa-resource-only-v402", title: "题源：教师留存来源", resourceOnly: true,
        sourceUrl: "https://example.org/original", source: "教师索引",
        stage: "高中", grade: "高一", difficulty: "进阶",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
      };
      await putQuestion(source);
      await refreshQuestions();
      const before = await getAllQuestions();
      const displayedPracticeCount = app.getQuestions().length;
      const encrypted = await backup.create(app, engine, {
        password: "source-record-roundtrip-password"
      });
      const manifestCount = encrypted.manifest.questionCount;
      const sourceCount = encrypted.manifest.sourceRecordCount;
      const file = new File([encrypted.blob], "sources.pslab", {
        type: "application/octet-stream"
      });

      await deleteQuestion(source.id);
      const deletedCount = (await getAllQuestions()).length;
      let wrongPasswordRejected = false;
      try {
        await backup.restore(file, app, engine, { password: "wrong-password-12345" });
      } catch (_error) {
        wrongPasswordRejected = true;
      }
      const afterWrongPassword = await getAllQuestions();
      const tampered = new Uint8Array(await encrypted.blob.arrayBuffer());
      tampered[tampered.length - 1] ^= 1;
      let tamperRejected = false;
      try {
        await backup.restore(new File([tampered], "tampered.pslab"), app, engine,
          { password: "source-record-roundtrip-password" });
      } catch (_error) {
        tamperRejected = true;
      }
      const afterTamper = await getAllQuestions();
      const outcome = await backup.restore(file, app, engine, {
        password: "source-record-roundtrip-password"
      });
      const restored = await getAllQuestions();
      const restoredSource = restored.find((item) => item.id === source.id);

      const snapshot = restored.map((item) => ({ ...item }));
      let invalidRejected = false;
      try {
        await app.restoreCompleteBackup([...snapshot, { id: 42, title: "坏记录" }], engine.loadState());
      } catch (_error) {
        invalidRejected = true;
      }
      const afterInvalid = await getAllQuestions();

      return {
        beforeCount: before.length, displayedPracticeCount, manifestCount, sourceCount,
        deletedCount, wrongPasswordRejected, tamperRejected,
        countAfterWrongPassword: afterWrongPassword.length,
        countAfterTamper: afterTamper.length,
        sourceAbsentAfterFailure: !afterWrongPassword.some((item) => item.id === source.id)
          && !afterTamper.some((item) => item.id === source.id),
        restoredCount: outcome.restored, countAfterRestore: restored.length,
        restoredSource: restoredSource && {
          resourceOnly: restoredSource.resourceOnly,
          title: restoredSource.title, sourceUrl: restoredSource.sourceUrl
        },
        invalidRejected, countAfterInvalid: afterInvalid.length,
        sourceAfterInvalid: afterInvalid.some((item) => item.id === source.id)
      };
    });

    assert.equal(result.beforeCount, result.displayedPracticeCount + result.sourceCount,
      "完整备份应将题源记录与正式题目分别计数");
    assert.equal(result.manifestCount, result.beforeCount,
      "完整备份清单必须包含同一数据库中的全部题目与题源");
    assert.equal(result.deletedCount, result.beforeCount - 1);
    assert.equal(result.wrongPasswordRejected, true);
    assert.equal(result.tamperRejected, true);
    assert.equal(result.countAfterWrongPassword, result.deletedCount);
    assert.equal(result.countAfterTamper, result.deletedCount);
    assert.equal(result.sourceAbsentAfterFailure, true,
      "密码错误或文件篡改不得局部恢复题源");
    assert.equal(result.restoredCount, result.beforeCount);
    assert.equal(result.countAfterRestore, result.beforeCount);
    assert.deepEqual(result.restoredSource, {
      resourceOnly: true, title: "题源：教师留存来源",
      sourceUrl: "https://example.org/original"
    });
    assert.equal(result.invalidRejected, true);
    assert.equal(result.countAfterInvalid, result.beforeCount);
    assert.equal(result.sourceAfterInvalid, true,
      "校验失败不得清除现有题源或学习记录");
    console.log("qa_backup_source_records_v402: passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
