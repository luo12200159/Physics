const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_feature_upgrade.cjs <index.html> <output-directory>");
}

(async () => {
  const executablePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.PhysicsStudioApp?.getQuestions?.().length > 0);

  const inventory = await page.evaluate(() => {
    const questions = window.PhysicsStudioApp.getQuestions();
    const light = questions.map(({ videoBlob, attachments = [], ...question }) => ({
      ...question,
      attachments: [],
      attachmentManifest: attachments.map(({ blob, ...attachment }) => attachment),
      videoType: question.videoType === "file" ? "none" : question.videoType,
      videoName: question.videoType === "file" ? "" : question.videoName
    }));
    const validation = window.PhysicsStudioBackupValidator.validate({
      format: "physics-studio-backup",
      version: 4,
      exportedAt: new Date().toISOString(),
      questions: light
    });
    const state = window.PHYSICS_LEARNING_ENGINE.loadState();
    const daily = window.PHYSICS_LEARNING_ENGINE.dailyTest(state, questions, {
      date: "2026-07-28",
      count: 10
    });
    const coverage = window.PhysicsStudioApp.getContentCoverage();
    return {
      total: questions.length,
      gradeSeven: questions.filter((question) => question.grade === "七年级").length,
      curriculum: window.PHYSICS_CURRICULUM_BANK.questions.length,
      books: window.PHYSICS_CURRICULUM_TAXONOMY.books.length,
      validation,
      dailyCount: daily.questionCount,
      dailyIds: daily.items.map((item) => item.question.id),
      coverage,
      ai: window.PhysicsStudioAITutor.status()
    };
  });

  assert.equal(inventory.total, 2132);
  assert.equal(inventory.gradeSeven, 0);
  assert.equal(inventory.curriculum, 43);
  assert.equal(inventory.books, 10);
  assert.equal(inventory.validation.valid, true, JSON.stringify(inventory.validation.errors.slice(0, 5)));
  assert.ok(inventory.dailyCount > 0 && inventory.dailyCount <= 8);
  assert.equal(new Set(inventory.dailyIds).size, inventory.dailyIds.length);
  assert.equal(inventory.coverage.target, 1900);
  assert.equal(inventory.coverage.indexed, 232);
  assert.equal(inventory.ai.ready, false);

  const featureChecks = await page.evaluate(async () => {
    const app = window.PhysicsStudioApp;
    const engine = window.PHYSICS_LEARNING_ENGINE;
    const state = engine.loadState();
    const profile = engine.addProfile(state, {
      name: "QA学生",
      grade: "九年级",
      goal: "中考",
      analysisNote: "仅用于自动化测试"
    });
    state.activeProfileId = profile.id;
    const exam = engine.addExamRecord(state, {
      title: "阶段测试",
      examDate: "2026-07-20",
      score: 82,
      totalScore: 100,
      weakTopics: "浮力、欧姆定律"
    });
    const growth = engine.addGrowthRecord(state, {
      title: "完成一次阶段测试复盘",
      detail: "已记录薄弱知识点并安排复习。"
    });
    engine.saveState(state);
    const report = engine.createReportPayload(state, app.getQuestions());

    const docxEntries = {
      "[Content_Types].xml": window.fflate.strToU8("<Types></Types>"),
      "word/document.xml": window.fflate.strToU8(
        "<w:document><w:body><w:p><w:r><w:t>1. 小球从静止开始做匀加速直线运动，求加速度。</w:t></w:r></w:p>"
        + "<w:p><w:r><w:t>答案：2 m/s²</w:t></w:r></w:p>"
        + "<w:p><w:r><w:t>解析：由 a=Δv/Δt 计算。</w:t></w:r></w:p>"
        + "<w:p><w:r><w:t>2. 电阻两端电压为6 V，电流为0.3 A，求电阻。</w:t></w:r></w:p></w:body></w:document>"
      )
    };
    const docxFile = new File(
      [window.fflate.zipSync(docxEntries)],
      "QA物理试卷.docx",
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
    );
    const documentResult = await window.PhysicsStudioDocumentImport.analyze(docxFile, {
      stage: "初中",
      grade: "九年级",
      source: "QA自有试卷",
      rightsConfirmed: true
    });

    const contentPackPayload = {
      format: "physics-content-pack",
      version: 1,
      manifest: {
        id: "qa-content-pack",
        title: "QA长沙中考内容包",
        publisher: "QA",
        verifiedAt: "2026-07-28",
        rightsBasis: "QA自有测试内容",
        rightsEvidenceId: "QA-RIGHTS-001",
        sourceUrls: ["https://example.com/qa-source"]
      },
      questions: [{
        id: "qa-content-pack-q1",
        title: "QA中考物理测试题",
        stage: "初中",
        grade: "九年级",
        topic: "欧姆定律",
        difficulty: "基础",
        content: "某电阻两端电压为 6 V，通过电流为 0.3 A，求电阻。",
        solution: "研究对象为该电阻。由欧姆定律 R=U/I，代入得 R=6 V÷0.3 A=20 Ω，并核对单位。",
        answer: "20 Ω",
        source: "QA自有测试内容",
        sourceUrl: "https://example.com/qa-source",
        sourceLicense: "QA自有测试内容",
        examLevel: "中考",
        examYear: 2025,
        examRegion: "长沙",
        examPaperTitle: "QA测试卷",
        examQuestionNumber: "1",
        examQuestionType: "计算题",
        examPoints: ["欧姆定律", "单位"],
        rightsEvidenceId: "QA-RIGHTS-001"
      }]
    };
    const contentFile = new File(
      [JSON.stringify(contentPackPayload)],
      "qa.pscontent",
      { type: "application/json" }
    );
    const pack = await window.PhysicsStudioContentCatalog.parseContentPack(contentFile);
    const imported = await app.importQuestionBatch(pack.questions);
    await app.updateQuestion("qa-content-pack-q1", {
      contentReviewStatus: "教师已通过"
    });
    const coverageAfterReview = app.getContentCoverage();

    const completeBackup = await window.PhysicsStudioBackup.create(app, engine);
    const backupFile = new File([completeBackup.blob], "qa.pslab", {
      type: "application/vnd.physics-studio.backup+zip"
    });
    const restored = await window.PhysicsStudioBackup.restore(backupFile, app, engine);

    let unsafeEndpointRejected = false;
    try {
      window.PhysicsStudioAITutor.saveConfig({
        endpoint: "http://example.com",
        model: "gpt-5.6-sol",
        enabled: true
      });
    } catch {
      unsafeEndpointRejected = true;
    }
    return {
      profile,
      exam,
      growth,
      reportExamCount: report.examRecords.length,
      reportGrowthCount: report.growthRecords.length,
      documentQuestions: documentResult.questions.length,
      documentParser: documentResult.parser,
      imported: imported.added.length,
      verifiedCount: coverageAfterReview.teacherVerifiedFullText,
      backupQuestionCount: completeBackup.manifest.questionCount,
      restored: restored.restored,
      unsafeEndpointRejected
    };
  });
  assert.equal(featureChecks.profile.grade, "九年级");
  assert.equal(featureChecks.exam.percentage, 82);
  assert.equal(featureChecks.reportExamCount, 1);
  assert.equal(featureChecks.reportGrowthCount, 1);
  assert.equal(featureChecks.documentQuestions, 2);
  assert.equal(featureChecks.documentParser, "device");
  assert.equal(featureChecks.imported, 1);
  assert.equal(featureChecks.verifiedCount, 1);
  assert.equal(featureChecks.backupQuestionCount, 2133);
  assert.equal(featureChecks.restored, 2133);
  assert.equal(featureChecks.unsafeEndpointRejected, true);

  await page.evaluate(() => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2,
      onboarded: true,
      role: "teacher",
      displayName: "教师",
      grade: "高一",
      textbook: "人教版",
      goal: "日常巩固"
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.PhysicsStudioApp?.getQuestions?.().length > 0);
  await page.locator("[data-teacher-action='center']").click();
  await page.locator("[data-lab-tab='teacher']").click();
  await page.waitForSelector(".content-coverage-card");
  assert.ok(await page.locator(".student-manager-card").isVisible());
  assert.ok(await page.locator(".document-import-card").isVisible());
  assert.ok(await page.locator(".ai-gateway-card").isVisible());
  assert.match(await page.locator(".content-coverage-card").textContent(), /1900/);

  await page.screenshot({
    path: path.join(outputDirectory, "teacher-feature-upgrade.png"),
    type: "png",
    fullPage: true
  });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ status: "passed", inventory, featureChecks, pageErrors }, null, 2));
  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
