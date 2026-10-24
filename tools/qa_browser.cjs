const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const mode = process.argv[2] ?? "desktop";
const project = path.resolve(__dirname, "..");
const viewport = mode === "mobile"
  ? { width: 390, height: 844 }
  : { width: 1440, height: 900 };

if (!new Set(["desktop", "mobile", "teacher"]).has(mode)) {
  throw new Error("Usage: node tools/qa_browser.cjs <desktop|mobile|teacher>");
}

(async () => {
  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"],
  });
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await installQaActivationStub(page, `browser-qa-${mode}`);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    if (mode === "teacher") {
      await page.addInitScript(() => {
        localStorage.setItem("physics-experience-v2", JSON.stringify({
          version: 2,
          onboarded: true,
          role: "teacher",
          displayName: "QA教师",
          grade: "高一",
          textbook: "人教版",
          goal: "日常巩固",
          examDate: "",
          weeklyGoal: 12,
          studentExternalLinks: false,
          fontScale: 1,
          events: [],
          activeDates: [],
        }));
      });
    }
    await page.goto(pathToFileURL(path.join(project, "index.html")).href);
    await page.waitForFunction(() => typeof window.PHYSICS_LEARNING_ENGINE?.studentAnalysis === "function"
      && typeof window.PHYSICS_LEARNING_ENGINE?.placementStatus === "function");
    await page.waitForFunction(() => (window.PhysicsStudioApp?.getQuestions?.() ?? []).length > 0);
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth + 1, JSON.stringify(dimensions));
    assert.ok(dimensions.bodyWidth <= dimensions.viewportWidth + 1, JSON.stringify(dimensions));
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`Browser QA passed: ${mode} ${viewport.width}x${viewport.height}`);
    await context.close();

    if (mode === "desktop") {
      const migrationContext = await browser.newContext({ viewport });
      const migrationPage = await migrationContext.newPage();
      await installQaActivationStub(migrationPage, "browser-qa-storage-migration");
      await migrationPage.addInitScript(() => {
        localStorage.setItem("physics-learning-loop-v1", JSON.stringify({
          version: 6,
          activeProfileId: "student-default",
          profiles: [{
            id: "student-default", name: "旧版迁移学生", role: "student", stage: "高中",
            grade: "高一", subject: "物理", goal: "日常巩固", createdAt: "2026-01-01T00:00:00.000Z"
          }],
          attempts: [{
            id: "legacy-storage-attempt", profileId: "student-default", questionId: "legacy-q",
            topic: "运动", grading: { status: "correct", score: 1 }, finalAnswer: "1",
            createdAt: "2026-01-02T00:00:00.000Z", completedAt: "2026-01-02T00:00:00.000Z"
          }]
        }));
      });
      await migrationPage.goto(pathToFileURL(path.join(project, "index.html")).href);
      await migrationPage.waitForFunction(() => window.PHYSICS_LEARNING_ENGINE?.loadState?.().attempts
        ?.some((item) => item.id === "legacy-storage-attempt"));
      const migration = await migrationPage.evaluate(async () => {
        const state = window.PHYSICS_LEARNING_ENGINE.loadState();
        const lightweight = JSON.parse(localStorage.getItem("physics-learning-loop-v1") || "{}");
        const backup = localStorage.getItem("physics-learning-loop-v1::idb-migration-backup");
        const attemptCount = await new Promise((resolve, reject) => {
          const request = indexedDB.open("physics-study-room-v2");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const countRequest = db.transaction("attempts", "readonly").objectStore("attempts").count();
            countRequest.onsuccess = () => { resolve(countRequest.result); db.close(); };
            countRequest.onerror = () => reject(countRequest.error);
          };
        });
        return {
          hydrated: state.attempts.some((item) => item.id === "legacy-storage-attempt"),
          portableProfileId: state.profiles[0]?.portableProfileId || "",
          lightweight: lightweight.indexedDbPrimary === true && !Array.isArray(lightweight.attempts),
          backupContainsAttempt: Boolean(backup?.includes("legacy-storage-attempt")),
          attemptCount
        };
      });
      assert.equal(migration.hydrated, true);
      assert.ok(migration.portableProfileId, "legacy profile must receive a stable portableProfileId");
      assert.equal(migration.lightweight, true, "localStorage must become a lightweight index after the transaction");
      assert.equal(migration.backupContainsAttempt, true, "legacy JSON backup must remain available after migration");
      assert.ok(migration.attemptCount >= 1, "legacy attempt must be committed to IndexedDB");
      await migrationContext.close();
      console.log("Browser storage migration QA passed: legacy JSON -> transactional IndexedDB");
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
