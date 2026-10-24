"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const root = path.resolve(__dirname, "..");
const legacySolutions = require("./fixtures/legacy-damaged-solutions.json");
const screenshotDirectory = path.join(root, "发布", "QA", "student-v4-mobile");

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.dismiss());
  await installQaActivationStub(page, "student-v4");
  await page.addInitScript(() => {
    globalThis.PHYSICS_STUDIO_APP_EDITION = "student";
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2,
      onboarded: true,
      role: "student",
      displayName: "测试同学",
      grade: "高一",
      textbook: "人教版",
      goal: "日常巩固",
      weeklyGoal: 12,
      events: [],
      activeDates: [],
    }));
  });
  await page.goto(pathToFileURL(path.join(root, "index.html")).href);
  await page.waitForFunction(() => document.body.classList.contains("role-student")
    && document.querySelectorAll(".student-bottom-nav [data-student-view]").length === 5, null, { timeout: 30_000 });
  await page.waitForFunction(() => (globalThis.PhysicsStudioApp?.getQuestions?.() || []).length >= 1900, null, { timeout: 30_000 });

  assert.deepEqual(
    await page.locator(".student-bottom-nav [data-student-view] strong").allTextContents(),
    ["首页", "课程", "训练", "学情", "我的"],
  );
  assert.equal(await page.locator("#teacherExperienceBar").count(), 0);
  const captureControl = await page.evaluate(() => {
    const nav = document.querySelector(".student-bottom-nav").getBoundingClientRect();
    const button = document.querySelector(".student-scan-fab").getBoundingClientRect();
    return { withinReservedBottomBar: button.top >= nav.top && button.bottom <= nav.bottom };
  });
  assert.equal(captureControl.withinReservedBottomBar, true,
    "拍题按钮必须位于底部控件区，不能悬浮遮挡首页或学情内容");
  const initialPrompt = await page.locator(".diagnostic-prompt-card.primary").innerText();
  assert.doesNotMatch(initialPrompt, /(?:蓝图覆盖|认知维度)[^。]*0\/(?:0|8)/,
    "未生成摸底题包时不得把尚未计算的覆盖显示为 0/0 或 0/8");
  assert.equal(await page.locator(".continue-card[data-start-question]").count(), 0,
    "没有已评分证据的新学生不应被默认分配未经摸底的挑战题");

  const views = ["home", "course", "training", "analysis", "profile"];
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  for (const view of views) {
    await page.locator(`.student-bottom-nav [data-student-view="${view}"]`).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction((expected) => (
      document.querySelector(".student-main")?.dataset.currentStudentView === expected
    ), view, { timeout: 10_000 });
    assert.ok((await page.locator(".student-main").innerText()).trim().length > 40, `${view} must contain usable content`);
    await page.screenshot({
      path: path.join(screenshotDirectory, `${view}.png`),
      fullPage: false,
    });
  }

  await page.locator('.student-bottom-nav [data-student-view="home"]').click();
  await page.locator(".home-quick-actions").waitFor({ state: "visible" });
  const horizontal = await page.locator(".home-quick-actions").evaluate((element) => {
    const before = element.scrollLeft;
    element.scrollLeft = 160;
    return {
      before,
      after: element.scrollLeft,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      touchAction: getComputedStyle(element).touchAction,
    };
  });
  assert.ok(horizontal.scrollWidth > horizontal.clientWidth, "home action strip must support horizontal scrolling");
  assert.ok(horizontal.after > horizontal.before, "home action strip must actually scroll");
  assert.match(horizontal.touchAction, /pan-x/);

  await page.locator('.student-bottom-nav [data-student-view="course"]').click();
  await page.locator(".curriculum-book-tabs").waitFor({ state: "visible" });
  const courseButtons = page.locator(".curriculum-selected-book button:not([disabled])");
  assert.ok(await courseButtons.count() > 0, "course page must expose real actions");
  const feynmanButton = page.locator("[data-feynman-question]").first();
  await feynmanButton.click();
  await page.locator("#experienceMetricsDialog[open]").waitFor({ state: "visible" });
  assert.match(await page.locator("#experienceMetricsDialog").innerText(), /费曼自我讲解|我来讲一遍/);
  await page.locator("#experienceMetricsDialog [data-metrics-action=close]").click();

  const pageGeometry = await page.evaluate(() => ({
    viewportHeight: innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    enabledActions: document.querySelectorAll(".student-main button:not([disabled])").length,
  }));
  assert.ok(pageGeometry.pageHeight > pageGeometry.viewportHeight, "course content must support vertical scrolling");
  assert.ok(pageGeometry.pageWidth <= pageGeometry.viewportWidth + 1, "page must not be clipped by global horizontal overflow");
  assert.ok(pageGeometry.enabledActions > 0, "visible page cannot be a static mockup");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const view of views) {
    await page.locator(`.student-bottom-nav [data-student-view="${view}"]`).click();
    const fit = await page.evaluate(() => {
      const nav = document.querySelector(".student-bottom-nav").getBoundingClientRect();
      const capture = document.querySelector(".student-scan-fab").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        captureInsideNav: capture.top >= nav.top && capture.bottom <= nav.bottom,
      };
    });
    assert.ok(fit.overflow <= 1, `${view} must fit the 360px viewport`);
    assert.equal(fit.captureInsideNav, true, `${view} capture action must not cover reading content`);
    await page.screenshot({ path: path.join(screenshotDirectory, `${view}-360.png`), fullPage: false });
  }
  const contentMigration = await page.evaluate(async (legacyEntries) => {
    const check = [];
    for (const legacy of legacyEntries.filter((entry) => ["cs-original-v1-g8-01", "hn-mock-2027-gk-a-q12"].includes(entry.id))) {
      const curriculum = legacy.id.startsWith("cs-original");
      const install = curriculum ? installCurriculumBank : installMockExamBank;
      const bank = curriculum ? window.PHYSICS_CURRICULUM_BANK : window.PHYSICS_MOCK_EXAM_BANK;
      const marker = curriculum ? `physics-curriculum-bank-v${bank.version}` : `physics-mock-exam-bank-v${bank.version}`;
      const stored = (await getAllQuestions()).find((question) => question.id === legacy.id);
      const edited = `${stored.solution}\n教师自定义解析，不应自动覆盖。`;
      await putQuestion({ ...stored, solution: edited, userEdited: false, contentHash: "" });
      appStorage().removeItem(marker);
      await install();
      const afterEdit = (await getAllQuestions()).find((question) => question.id === legacy.id).solution;
      await putQuestion({ ...stored, solution: legacy.solution, userEdited: false, contentVersion: "", contentHash: "" });
      await install();
      const afterLegacy = (await getAllQuestions()).find((question) => question.id === legacy.id).solution;
      check.push({ id: legacy.id, editedPreserved: afterEdit === edited, repaired: afterLegacy === stored.solution });
    }
    return check;
  }, legacySolutions);
  assert.equal(contentMigration.length, 2);
  assert.ok(contentMigration.every((item) => item.editedPreserved && item.repaired),
    `内置题库升级必须只修复旧原文、保留用户解析：${JSON.stringify(contentMigration)}`);
  const transactionOutcome = await page.evaluate(async () => {
    const originalDb = state.db;
    const checks = [];
    try {
      for (const operation of ["put", "delete"]) {
        const request = { result: "request-succeeded" };
        let transaction;
        state.db = { transaction() {
          transaction = { objectStore: () => ({ put: () => request, delete: () => request }) };
          return transaction;
        } };
        let status = "pending";
        const pending = (operation === "put" ? putQuestion({ id: "transaction-test" }) : deleteQuestion("transaction-test"))
          .then(() => { status = "committed"; }, () => { status = "rejected"; });
        request.onsuccess?.();
        await Promise.resolve();
        const afterRequest = status;
        transaction.onabort?.();
        await pending;
        checks.push({ operation, afterRequest, afterAbort: status });
      }
    } finally {
      state.db = originalDb;
    }
    return checks;
  });
  assert.ok(transactionOutcome.every((item) => item.afterRequest === "pending" && item.afterAbort === "rejected"),
    `单条题目请求成功不等于事务提交：${JSON.stringify(transactionOutcome)}`);
  const androidExportOutcome = await page.evaluate(async () => {
    const priorBridge = window.PhysicsStudioAndroid;
    const checks = [];
    try {
      let callback = null;
      window.PhysicsStudioAndroid = {
        saveBase64FileWithAck(requestId, filename, mimeType, base64) {
          callback = { requestId, filename, mimeType, base64 };
        }
      };
      let status = "pending";
      const first = downloadBlob("report.pslab", new Blob(["sample"], { type: "application/vnd.physics-studio.backup+zip" }))
        .then(() => { status = "saved"; }, (error) => { status = error.message; });
      while (!callback) await new Promise((resolve) => setTimeout(resolve, 0));
      const beforeAck = status;
      window.PhysicsStudioAndroidExportResponse({ requestId: callback.requestId, status: "saved" });
      await first;
      checks.push({ beforeAck, afterAck: status, filename: callback.filename });

      callback = null;
      const second = downloadBlob("report.pslab", new Blob(["sample"]));
      while (!callback) await new Promise((resolve) => setTimeout(resolve, 0));
      window.PhysicsStudioAndroidExportResponse({ requestId: callback.requestId, status: "canceled" });
      try { await second; checks.push({ canceled: false }); }
      catch (error) { checks.push({ canceled: /取消/.test(error.message) }); }
    } finally {
      window.PhysicsStudioAndroid = priorBridge;
    }
    return checks;
  });
  assert.deepEqual(androidExportOutcome, [
    { beforeAck: "pending", afterAck: "saved", filename: "report.pslab" },
    { canceled: true }
  ], "Android 备份须等原生写入完成回执，取消不可报告成功");
  const legacyGradeAudit = await page.evaluate(async () => {
    const engine = window.PHYSICS_LEARNING_ENGINE;
    const question = state.questions.find((item) => item.id === "cs-original-v1-g9-09");
    const learning = engine.loadState();
    delete learning.settings.legacyGradeAuditVersion;
    const attempt = engine.recordAttempt(learning, {
      question,
      questionId: question.id,
      topic: question.topic,
      finalAnswer: "适合同时使用；总功率 2700 W，承载上限 2200 W",
      grading: { status: "correct", score: 1, summary: "旧评分结果" }
    });
    engine.saveState(learning);
    await engine.awaitLastSave();
    const marked = await auditLegacyAutoGrading();
    const restored = engine.loadState().attempts.find((item) => item.id === attempt.id);
    return {
      marked,
      originalStatus: restored?.grading?.status,
      pending: engine.isPendingManualReview(restored),
      originalAnswer: restored?.finalAnswer,
      marker: engine.loadState().settings.legacyGradeAuditVersion
    };
  });
  assert.equal(legacyGradeAudit.marked, 1, "旧错误自动评分须标记待复核");
  assert.equal(legacyGradeAudit.originalStatus, "correct", "原始评分不得被覆盖");
  assert.equal(legacyGradeAudit.pending, true);
  assert.equal(legacyGradeAudit.originalAnswer, "适合同时使用；总功率 2700 W，承载上限 2200 W");
  assert.equal(legacyGradeAudit.marker, "4.0.2");
  assert.equal(errors.length, 0, errors.join("\n"));

  console.log(JSON.stringify({
    status: "passed",
    navigation: views,
    horizontalScroll: true,
    verticalScroll: true,
    clickable: true,
    mobileViewports: ["390x844", "360x800"],
    screenshots: screenshotDirectory,
  }, null, 2));
  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
