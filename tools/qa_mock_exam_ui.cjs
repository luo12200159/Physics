const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_mock_exam_ui.cjs <index.html> <output-directory>");
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await installQaActivationStub(page, "mock-exam-qa");
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
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "1900");

    const storedSummary = await page.evaluate(async () => {
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
      const mockQuestions = questions.filter((question) => question.collection === "changsha-original-mock-exams");
      return {
        count: mockQuestions.length,
        junior: mockQuestions.filter((question) => question.examLevel === "中考").length,
        senior: mockQuestions.filter((question) => question.examLevel === "高考").length,
        invalid: mockQuestions.filter((question) => {
          return question.fullTextIncluded !== true
            || question.sourceLicense !== "应用内原创"
            || !question.solution
            || !question.answer
            || !Array.isArray(question.examPoints)
            || question.examPoints.length < 2;
        }).length
      };
    });
    assert.deepEqual(storedSummary, { count: 38, junior: 23, senior: 15, invalid: 0 });

    await page.locator("#searchInput").fill("物理研习室原创模拟卷");
    assert.equal(await page.locator("#resultCount").textContent(), "38 道完整题");
    assert.equal(await page.locator(".question-card .tag", { hasText: "模拟卷原创" }).count(), 38);

    await page.locator("#searchInput").fill("2027届长沙中考物理原创综合训练卷 A");
    assert.equal(await page.locator("#resultCount").textContent(), "23 道完整题");
    await page.locator('.question-card[data-id="cs-mock-2027-zk-a-q23"] .question-title-button').click();
    const juniorDetail = await page.locator("#detailContent").textContent();
    assert.match(juniorDetail, /双挡电热器/);
    assert.match(juniorDetail, /1100 W/);
    assert.match(juniorDetail, /6.6 × 10⁵ J/);
    assert.match(juniorDetail, /多挡用电器/);
    assert.equal(await page.locator("#detailContent .exam-point-list span").count(), 5);
    await page.locator('[data-detail-action="close"]').click();

    await page.locator("#searchInput").fill("2027届湖南高考物理原创综合训练卷 A");
    assert.equal(await page.locator("#resultCount").textContent(), "15 道完整题");
    await page.locator('.question-card[data-id="hn-mock-2027-gk-a-q14"] .question-title-button').click();
    const seniorDetail = await page.locator("#detailContent").textContent();
    assert.match(seniorDetail, /加速电场与匀强磁场/);
    assert.match(seniorDetail, /2.0 × 10⁵ m\/s/);
    assert.match(seniorDetail, /3.14 × 10⁻⁷ s/);
    assert.match(seniorDetail, /圆周运动半径与周期/);
    await page.locator('[data-detail-action="close"]').click();

    await page.locator("#searchInput").fill("原创模拟卷");
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-original-mock-exams.png"),
      type: "png",
      fullPage: true
    });

    await page.locator("#searchInput").fill("声音的产生与传播");
    await page.locator('.question-card[data-id="cs-mock-2027-zk-a-q01"] .question-title-button').click();
    await page.locator('[data-detail-action="edit"]').click();
    await page.locator("#titleInput").fill("用户保留的模拟题编辑");
    assert.equal(await page.locator("#titleInput").inputValue(), "用户保留的模拟题编辑");
    await page.locator("#contentInput").fill("这是用户在内置原创模拟题上保存的完整自定义题干，用于验证应用升级不会覆盖用户编辑。");
    assert.equal(await page.locator("#titleInput").inputValue(), "用户保留的模拟题编辑");
    await page.locator("#solutionInput").fill("这是用户保存的分步解题方法。升级后应继续保留，不应被内置题库安装流程覆盖。");
    assert.equal(await page.locator("#titleInput").inputValue(), "用户保留的模拟题编辑");
    await page.locator("#answerInput").fill("用户自定义答案应完整保留。");
    assert.equal(await page.locator("#titleInput").inputValue(), "用户保留的模拟题编辑");
    assert.equal(await page.locator("#solutionInput").inputValue(), "这是用户保存的分步解题方法。升级后应继续保留，不应被内置题库安装流程覆盖。");
    await page.locator('#questionForm button[type="submit"]').click();
    await page.waitForFunction(() => !document.getElementById("questionModal")?.open);
    const editedBeforeReload = await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("physics-studio-db", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const question = await new Promise((resolve, reject) => {
        const request = database.transaction("questions", "readonly")
          .objectStore("questions")
          .get("cs-mock-2027-zk-a-q01");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return { title: question.title, userEdited: question.userEdited };
    });
    assert.deepEqual(editedBeforeReload, {
      title: "用户保留的模拟题编辑",
      userEdited: true
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "1900");
    await page.locator("#searchInput").fill("用户保留的模拟题编辑");
    assert.equal(await page.locator("#resultCount").textContent(), "1 道完整题");
    await page.locator('.question-card[data-id="cs-mock-2027-zk-a-q01"] .question-title-button').click();
    const editedDetail = await page.locator("#detailContent").textContent();
    assert.match(editedDetail, /升级不会覆盖用户编辑/);
    assert.match(editedDetail, /用户自定义答案应完整保留/);
    await page.locator('[data-detail-action="close"]').click();
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      status: "passed",
      storedSummary,
      juniorPaperQuestions: 23,
      seniorPaperQuestions: 15,
      userEditPreservedAfterReload: true,
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
