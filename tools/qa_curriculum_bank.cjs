const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_curriculum_bank.cjs <index.html> <output-directory>");
}

async function getStoredQuestions(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("physics-studio-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const questions = await new Promise((resolve, reject) => {
      const request = database.transaction("questions", "readonly").objectStore("questions").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return questions;
  });
}

async function waitForTotal(page, expected) {
  await page.waitForFunction(
    (total) => document.getElementById("totalCount")?.textContent === String(total),
    expected
  );
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2, onboarded: true, role: "teacher", displayName: "QA",
      grade: "高一", textbook: "人教版", goal: "日常巩固",
      studentExternalLinks: false, fontScale: 1, events: [], activeDates: []
    }));
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
    const manifest = await page.evaluate(() => {
      const bank = window.PHYSICS_CURRICULUM_BANK;
      const counts = {};
      bank.questions.forEach((question) => {
        counts[question.grade] = (counts[question.grade] || 0) + 1;
      });
      return {
        version: bank.version,
        contentVersion: bank.contentVersion,
        count: bank.questions.length,
        counts,
        duplicateCount: bank.questions.length - new Set(bank.questions.map((question) => question.id)).size,
        incompleteCount: bank.questions.filter((question) => {
          return !question.id
            || !question.title
            || !question.content
            || !question.solution
            || !question.answer
            || !question.textbookUnit
            || !question.curriculumBasis
            || !question.copyrightNote
            || !question.originalExercise;
        }).length
      };
    });

    assert.equal(manifest.version, 2);
    assert.equal(manifest.contentVersion, "2026.07.23-taxonomy1");
    assert.equal(manifest.count, 43);
    assert.deepEqual(manifest.counts, {
      八年级: 11,
      九年级: 10,
      高一: 8,
      高二: 8,
      高三: 6
    });
    assert.equal(manifest.duplicateCount, 0);
    assert.equal(manifest.incompleteCount, 0);

    await page.waitForFunction(() => Number.parseInt(document.getElementById("totalCount")?.textContent || "0", 10) > 0);
    let stored = await getStoredQuestions(page);
    const sourceIndexCount = stored.filter((question) => question.collection === "changsha-internet-source-index").length;
    assert.equal(sourceIndexCount, 0);
    const realExamIndexCount = stored.filter((question) => question.collection === "changsha-six-year-real-exam-index").length;
    assert.equal(realExamIndexCount, 232);
    const mockExamCount = stored.filter((question) => question.collection === "changsha-original-mock-exams").length;
    assert.equal(mockExamCount, 38);
    const expectedInitialTotal = manifest.count + 3 + sourceIndexCount + realExamIndexCount + mockExamCount;
    await waitForTotal(page, expectedInitialTotal);
    assert.equal(stored.length, expectedInitialTotal);
    assert.equal(stored.filter((question) => question.collection === "changsha-curriculum-original").length, 43);
    assert.ok(stored.every((question) => question.id.startsWith("cs-original-v1-")
      ? question.source.includes("原创练习") && question.videoType === "none"
      : true));
    assert.equal(await page.locator(".question-card .tag", { hasText: "长沙同步原创" }).count(), 43);

    await page.locator("#searchInput").fill("原创练习");
    assert.equal(await page.locator("#resultCount").textContent(), "43 道题");
    await page.locator("#searchInput").fill("七年级");
    assert.equal(await page.locator("#resultCount").textContent(), "0 道题");

    await page.locator("#searchInput").fill("");
    await page.locator('.question-card[data-id="cs-original-v1-g8-10"] .question-title-button').click();
    assert.ok(await page.locator("#detailModal").isVisible());
    assert.match(await page.locator("#detailContent").textContent(), /浮力为 5 N/);
    assert.match(await page.locator("#detailContent").textContent(), /非教材原题/);
    assert.equal(
      await page.locator("#detailContent a", { hasText: "查看长沙教材使用依据" }).getAttribute("href"),
      "https://jyt.hunan.gov.cn/jyt/sjyt/xxgk/c100951/202503/t20250310_33607705.html"
    );
    await page.locator('[data-detail-action="close"]').click();
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-curriculum-bank.png"),
      type: "png"
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTotal(page, expectedInitialTotal);
    assert.equal((await getStoredQuestions(page)).length, expectedInitialTotal);

    await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("physics-studio-db", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const request = database.transaction("questions", "readwrite")
          .objectStore("questions")
          .put({
            id: "qa-obsolete-grade-seven",
            title: "应由升级迁移删除的七年级内容",
            stage: "初中",
            grade: "七年级",
            topic: "迁移测试",
            difficulty: "基础",
            content: "旧版本记录",
            solution: "旧版本解析"
          });
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
      database.close();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTotal(page, expectedInitialTotal);
    stored = await getStoredQuestions(page);
    assert.equal(stored.some((question) => question.grade === "七年级"), false);

    await page.evaluate(async () => {
      localStorage.removeItem("physics-curriculum-bank-v2");
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("physics-studio-db", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const customQuestion = {
        id: "qa-existing-user-question",
        title: "既有用户自建题",
        stage: "初中",
        grade: "八年级",
        topic: "用户数据保护",
        difficulty: "基础",
        source: "个人题库",
        content: "用于验证升级不覆盖既有数据。",
        solution: "保持原记录。",
        answer: "原记录不变。",
        videoType: "none",
        videoUrl: "",
        mastered: false,
        wrong: false,
        transferNotes: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      };
      await new Promise((resolve, reject) => {
        const request = database.transaction("questions", "readwrite").objectStore("questions").put(customQuestion);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
      database.close();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForTotal(page, expectedInitialTotal + 1);
    stored = await getStoredQuestions(page);
    assert.equal(stored.find((question) => question.id === "qa-existing-user-question").answer, "原记录不变。");
    assert.equal(stored.filter((question) => question.collection === "changsha-curriculum-original").length, 43);
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      status: "passed",
      manifest,
      freshTotal: expectedInitialTotal,
      upgradedTotal: stored.length,
      errors
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
