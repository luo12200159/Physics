const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_real_exam_index.cjs <index.html> <output-directory>");
}

const expectedCounts = {
  "gaokao-2020": 14,
  "gaokao-2021": 16,
  "gaokao-2022": 16,
  "gaokao-2023": 15,
  "gaokao-2024": 15,
  "gaokao-2025": 15,
  "zhongkao-2020": 23,
  "zhongkao-2021": 23,
  "zhongkao-2022": 25,
  "zhongkao-2023": 24,
  "zhongkao-2024": 23,
  "zhongkao-2025": 23
};

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

async function putStoredQuestion(page, question) {
  return page.evaluate(async (value) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("physics-studio-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const request = database.transaction("questions", "readwrite").objectStore("questions").put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    database.close();
  }, question);
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
    await page.waitForFunction(
      () => document.getElementById("totalCount")?.textContent === "316"
    );

    const manifest = await page.evaluate(() => {
      const bank = window.PHYSICS_REAL_EXAM_INDEX;
      const counts = Object.fromEntries(bank.exams.map((exam) => [exam.key, exam.questionCount]));
      const yearsByLevel = Object.fromEntries(["中考", "高考"].map((level) => [
        level,
        [...new Set(bank.questions
          .filter((question) => question.examLevel === level)
          .map((question) => question.examYear))].sort()
      ]));
      return {
        version: bank.version,
        contentVersion: bank.contentVersion,
        verifiedAt: bank.verifiedAt,
        coverage: bank.coverage,
        examCount: bank.exams.length,
        questionCount: bank.questions.length,
        counts,
        yearsByLevel,
        duplicateIds: bank.questions.length - new Set(bank.questions.map((question) => question.id)).size,
        invalidQuestions: bank.questions.filter((question) => {
          return !question.id
            || !question.title
            || !question.examQuestionNumber
            || !question.examQuestionType
            || !Array.isArray(question.examPoints)
            || question.examPoints.length === 0
            || question.examPoints.some((point) => !point.trim())
            || question.collection !== "changsha-six-year-real-exam-index"
            || question.syncOrigin !== "verified-real-exam-index"
            || question.sourceLicense !== "仅保存来源链接"
            || question.fullTextIncluded !== false
            || !question.content.includes("考察点：")
            || !question.content.includes("查看原始来源")
            || !question.solution.includes("题目级索引")
            || !question.sourceUrl.startsWith("https://")
            || !question.answerUrl.startsWith("https://");
        }).length
      };
    });

    assert.equal(manifest.version, "1.0.0");
    assert.equal(manifest.contentVersion, "2020-2025-question-index-r1");
    assert.equal(manifest.verifiedAt, "2026-07-23");
    assert.equal(manifest.examCount, 12);
    assert.equal(manifest.questionCount, 232);
    assert.equal(manifest.coverage.startYear, 2020);
    assert.equal(manifest.coverage.endYear, 2025);
    assert.deepEqual(manifest.counts, expectedCounts);
    assert.deepEqual(manifest.yearsByLevel, {
      中考: [2020, 2021, 2022, 2023, 2024, 2025],
      高考: [2020, 2021, 2022, 2023, 2024, 2025]
    });
    assert.equal(manifest.duplicateIds, 0);
    assert.equal(manifest.invalidQuestions, 0);

    let stored = await getStoredQuestions(page);
    let indexed = stored.filter((question) => question.collection === "changsha-six-year-real-exam-index");
    assert.equal(stored.length, 316);
    assert.equal(indexed.length, 232);
    assert.equal(indexed.filter((question) => question.examLevel === "中考").length, 141);
    assert.equal(indexed.filter((question) => question.examLevel === "高考").length, 91);
    assert.equal(indexed.filter((question) => question.resourceOnly).length, 0);
    assert.equal(stored.filter((question) => question.collection === "changsha-internet-source-index").length, 0);
    assert.equal(await page.locator(".tag-real-exam").count(), 232);

    await page.locator("#searchInput").fill("2021年长沙中考物理");
    assert.equal(await page.locator("#resultCount").textContent(), "23 道题");
    await page.locator("#searchInput").fill("洛埃镜");
    assert.equal(await page.locator("#resultCount").textContent(), "1 道题");
    assert.ok(await page.locator('.question-card[data-id="real-exam-gaokao-2024-q9"]').isVisible());

    await page.locator("#searchInput").fill("温度测量");
    await page.locator('.question-card[data-id="real-exam-zhongkao-2021-q17"] .question-title-button').click();
    assert.ok(await page.locator("#detailModal").isVisible());
    const detailText = await page.locator("#detailContent").textContent();
    assert.match(detailText, /考察点/);
    assert.match(detailText, /自制温度计/);
    assert.match(detailText, /完整内容再发行许可未核实/);
    assert.match(detailText, /本应用未猜填、改写或替代原答案/);
    assert.match(detailText, /原卷入口 · 正文待许可/);
    assert.equal(await page.locator("#detailContent .exam-point-list span").count(), 3);
    assert.equal(
      await page.locator("#detailContent a", { hasText: "查看原始来源" }).getAttribute("href"),
      "https://www.51jiaoxi.com/doc-15618219.html"
    );
    await page.locator('[data-detail-action="close"]').click();

    stored = await getStoredQuestions(page);
    const realExam = stored.find((question) => question.id === "real-exam-zhongkao-2021-q17");
    realExam.mastered = true;
    realExam.userEdited = true;
    realExam.content = "QA 已取得许可后补充的完整真题题干，用于验证升级时不会覆盖用户已核验的正文。";
    realExam.solution = "QA 用户保存的详细解析步骤，在重新加载内置索引时应当原样保留。";
    realExam.answer = "QA 用户保存的参考答案。";
    realExam.sourceLicense = "已取得书面授权";
    realExam.resourceRightsStatus = "用户标注：已取得书面授权；授权凭证由用户自行留存";
    realExam.fullTextIncluded = true;
    realExam.resourceOnly = true;
    realExam.migratedToSourceAt = new Date().toISOString();
    await putStoredQuestion(page, realExam);
    await putStoredQuestion(page, {
      id: "qa-legacy-source-only",
      title: "试卷索引｜QA 未授权模拟卷",
      stage: "初中",
      grade: "九年级",
      topic: "中考综合",
      difficulty: "进阶",
      source: "QA 来源",
      sourceUrl: "https://example.com/qa-legacy-source",
      sourceLicense: "仅保存来源链接",
      content: "只有题源说明，没有具体题目正文。",
      solution: "请打开来源核对。",
      answer: "来源页面待核对。",
      videoType: "url",
      videoUrl: "https://example.com/method.mp4",
      mastered: true,
      wrong: true,
      wrongCount: 2,
      transferNotes: { condition: "保留的学习记录" },
      collection: "changsha-internet-source-index",
      syncOrigin: "source-index",
      resourceRightsStatus: "正文再发行许可未核实",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.getElementById("totalCount")?.textContent === "316"
    );
    stored = await getStoredQuestions(page);
    indexed = stored.filter((question) => question.collection === "changsha-six-year-real-exam-index");
    const restoredRealExam = stored.find((question) => question.id === "real-exam-zhongkao-2021-q17");
    const migratedSource = stored.find((question) => question.id === "qa-legacy-source-only");
    assert.equal(stored.length, 317);
    assert.equal(indexed.length, 232);
    assert.equal(restoredRealExam.resourceOnly, false);
    assert.equal(restoredRealExam.mastered, true);
    assert.equal(restoredRealExam.fullTextIncluded, true);
    assert.equal(restoredRealExam.sourceLicense, "已取得书面授权");
    assert.match(restoredRealExam.content, /不会覆盖用户已核验的正文/);
    assert.match(restoredRealExam.solution, /应当原样保留/);
    assert.equal(migratedSource.resourceOnly, true);
    assert.equal(migratedSource.mastered, true);
    assert.equal(migratedSource.wrong, true);
    assert.equal(migratedSource.videoUrl, "https://example.com/method.mp4");
    assert.equal(migratedSource.transferNotes.condition, "保留的学习记录");
    assert.equal(await page.locator('.question-card[data-id="qa-legacy-source-only"]').count(), 0);

    await page.locator("#syncCenterButton").click();
    await page.locator("#resourceKeywordInput").fill("QA 未授权模拟卷");
    assert.equal(await page.locator("#resourceResultCount").textContent(), "1 个入口");
    assert.equal(
      await page.locator("#resourceGrid a", { hasText: "打开资源" }).getAttribute("href"),
      "https://example.com/qa-legacy-source"
    );
    await page.locator(".close-resource-modal").first().click();

    await page.locator("#searchInput").fill("2025年长沙中考物理");
    assert.equal(await page.locator("#resultCount").textContent(), "23 道题");
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-real-exam-index.png"),
      type: "png",
      fullPage: true
    });
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      status: "passed",
      manifest,
      visibleQuestionTotal: 316,
      storedTotalAfterMigration: stored.length,
      indexedTotal: indexed.length,
      migratedSourcePreserved: true,
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
