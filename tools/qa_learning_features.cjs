const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_learning_features.cjs <index.html> <output-directory>");
}

async function waitForTitle(page, title) {
  await page.waitForFunction(
    (expected) => document.getElementById("pageTitle")?.textContent === expected,
    title
  );
}

(async () => {
  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
    await page.waitForFunction(() => Number.parseInt(document.getElementById("totalCount")?.textContent || "0", 10) > 0);
    const bankMetrics = await page.evaluate(() => {
      const questions = state.questions;
      return {
        expectedTotal: questions.length,
        topicCount: new Set(questions.map((question) => question.topic)).size,
        electricityTopicTotal: questions.filter((question) => question.topic === "欧姆定律").length,
        electricityTopicMastered: questions.filter((question) => {
          return question.topic === "欧姆定律"
            && window.PhysicsStudioApp.getMasteryEvidence(question.id)?.code === "mastered";
        }).length
      };
    });
    const initialMasteryRate = 0;
    const updatedMasteryRate = Math.round(100 / bankMetrics.expectedTotal);
    await page.waitForFunction(
      (expected) => document.getElementById("totalCount")?.textContent === String(expected),
      bankMetrics.expectedTotal
    );

    assert.equal(await page.locator("#wrongNavCount").textContent(), "0");
    await page.locator('.nav-item[data-view="wrong"]').click();
    await waitForTitle(page, "我的错题集");
    assert.equal(await page.locator("#resultCount").textContent(), "0 道题");
    assert.equal(await page.locator("#emptyState h3").textContent(), "错题集目前是空的");
    await page.locator("#emptyAddButton").click();
    await waitForTitle(page, "我的物理题库");

    const forceCard = page.locator('.question-card[data-id="sample-force"]');
    await forceCard.locator('[data-action="wrong"]').click();
    await page.waitForFunction(() => document.getElementById("wrongNavCount")?.textContent === "1");
    assert.ok(await forceCard.evaluate((card) => card.classList.contains("wrong-card")));
    assert.equal(await forceCard.locator('[data-action="wrong"]').textContent(), "移出错题");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("wrongNavCount")?.textContent === "1");
    await page.locator('.nav-item[data-view="wrong"]').click();
    await waitForTitle(page, "我的错题集");
    assert.equal(await page.locator("#resultCount").textContent(), "1 道题");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-wrong-set.png"), type: "png" });

    await page.locator('.question-card[data-id="sample-force"] [data-action="wrong"]').click();
    await page.waitForFunction(() => document.getElementById("wrongNavCount")?.textContent === "0");
    assert.ok(await page.locator("#emptyState").isVisible());

    await page.locator("#emptyAddButton").click();
    await waitForTitle(page, "我的物理题库");
    await page.locator('.question-card[data-id="sample-force"] [data-action="wrong"]').click();
    await page.waitForFunction(() => document.getElementById("wrongNavCount")?.textContent === "1");

    await page.locator('.nav-item[data-view="analysis"]').click();
    await waitForTitle(page, "学情分析");
    assert.ok(await page.locator("#analysisPanel").isVisible());
    assert.equal(await page.locator("#analysisMasteryRate").textContent(), `${initialMasteryRate}%`);
    assert.equal(await page.locator("#analysisWrongCount").textContent(), "1");
    assert.equal(await page.locator("#analysisTopicCount").textContent(), String(bankMetrics.topicCount));
    assert.equal(await page.locator("#analysisTransferCount").textContent(), "0");
    assert.match(await page.locator("#analysisPriority").textContent(), /力与运动/);
    await page.waitForTimeout(3200);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-learning-analysis.png"), type: "png" });

    await page.locator('#analysisPanel [data-analysis-view="wrong"]').click();
    await waitForTitle(page, "我的错题集");
    assert.equal(await page.locator("#resultCount").textContent(), "1 道题");
    await page.locator('.nav-item[data-view="analysis"]').click();
    await page.locator('.priority-card [data-analysis-view="knowledge"]').click();
    await waitForTitle(page, "知识点掌握");
    assert.ok(await page.locator("#knowledgePanel").isVisible());
    assert.equal(await page.locator(".knowledge-topic-card").count(), bankMetrics.topicCount);
    const electricityTopic = page.locator('.knowledge-topic-card[data-topic="欧姆定律"]');
    const electricityRate = Math.round((bankMetrics.electricityTopicMastered / bankMetrics.electricityTopicTotal) * 100);
    assert.match(await electricityTopic.textContent(), new RegExp(`${electricityRate}%`));
    assert.match(
      await electricityTopic.textContent(),
      new RegExp(`${bankMetrics.electricityTopicMastered}/${bankMetrics.electricityTopicTotal} 道已掌握`)
    );
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-knowledge-mastery.png"), type: "png" });

    await page.locator('#knowledgePanel [data-analysis-view="analysis"]').click();
    await waitForTitle(page, "学情分析");
    await page.locator('.nav-item[data-view="knowledge"]').click();
    await waitForTitle(page, "知识点掌握");

    await electricityTopic.click();
    await waitForTitle(page, "我的物理题库");
    assert.equal(await page.locator("#searchInput").inputValue(), "欧姆定律");
    assert.ok(Number.parseInt(await page.locator("#resultCount").textContent(), 10) >= bankMetrics.electricityTopicTotal);
    await page.locator('.stat-card[data-view-target="library"]').click();
    await page.waitForFunction(
      (expected) => document.getElementById("resultCount")?.textContent === `${expected} 道题`,
      bankMetrics.expectedTotal
    );

    await page.locator('.question-card[data-id="sample-force"] [data-action="transfer"]').click();
    assert.ok(await page.locator("#transferModal").isVisible());
    assert.equal(await page.locator("#transferContent h2").textContent(), "改变条件");
    await page.locator('[data-transfer-action="save"]').click();
    await page.waitForFunction(() => document.getElementById("toast")?.textContent.includes("请先填写"));
    assert.ok(await page.locator("#transferModal").isVisible());
    const transferNote = "改变拉力大小后，先判断摩擦力是否保持不变，再由 F合 = F拉 − f 比较加速度变化，并检查方向。";
    await page.locator("#transferNoteInput").fill(transferNote);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-transfer-practice.png"), type: "png" });
    await page.locator('[data-transfer-action="save"]').click();
    await page.locator("#transferModal").waitFor({ state: "hidden" });

    await page.locator('.nav-item[data-view="analysis"]').click();
    await waitForTitle(page, "学情分析");
    assert.equal(await page.locator("#analysisTransferCount").textContent(), "1");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#exportButton").click();
    const download = await downloadPromise;
    const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    const exportedForce = backup.questions.find((question) => question.id === "sample-force");
    assert.equal(backup.version, 4);
    assert.equal(exportedForce.wrong, true);
    assert.equal(exportedForce.transferNotes.condition.text, transferNote);

    await page.locator('.nav-item[data-view="library"]').click();
    await waitForTitle(page, "我的物理题库");
    await page.locator('.question-card[data-id="sample-force"] .question-title-button').click();
    assert.equal(await page.locator(".transfer-variant-card").count(), 3);
    assert.ok(await page.locator('.transfer-variant-card[data-variant="condition"]').evaluate(
      (button) => button.classList.contains("completed")
    ));
    await page.locator('.transfer-variant-card[data-variant="condition"]').click();
    assert.equal(await page.locator("#transferNoteInput").inputValue(), transferNote);
    await page.locator('[data-transfer-action="original"]').click();
    assert.ok(await page.locator("#detailModal").isVisible());
    await page.locator('[data-detail-action="close"]').click();

    await page.locator('.nav-item[data-view="wrong"]').click();
    await waitForTitle(page, "我的错题集");
    assert.equal(
      await page.locator('.question-card[data-id="sample-force"] [data-action="master"]').count(),
      0
    );
    await page.evaluate(() => {
      const engine = window.PHYSICS_LEARNING_ENGINE;
      const learningState = engine.loadState();
      const profileId = learningState.activeProfileId;
      const model = {
        object: "水平面上的物体",
        known: "已知水平拉力和滑动摩擦力，单位均为 N",
        unknown: "求物体所受合力的大小和方向",
        process: "分析物体在水平面上的受力与直线运动过程",
        assumptions: "将物体视为质点，忽略竖直方向运动",
        coordinates: "建立水平坐标轴，沿拉力方向为正方向",
        forces: "拉力、摩擦力、重力、支持力",
        equations: "F合=F拉-f",
        reasonableness: "检查单位、方向与数量级是否合理"
      };
      const record = (completedAt) => {
        const attempt = engine.recordAttempt(learningState, {
          questionId: "sample-force",
          topic: "力与运动",
          stage: "初中",
          confidenceBefore: 3,
          confidenceAfter: 4,
          hintLevel: 0,
          finalAnswer: "2 N，方向水平向右",
          grading: { status: "correct", score: 1, issues: [] },
          selfExplanation: "同一直线上方向相反的力，合力等于较大力减去较小力。",
          model
        });
        attempt.completedAt = completedAt;
        attempt.createdAt = completedAt;
      };
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      record(yesterday.toISOString());
      record(today.toISOString());
      learningState.experimentRecords.push({
        id: engine.createId("transfer"),
        type: "transfer",
        profileId,
        questionId: "sample-force",
        variantIndex: 0,
        variantType: "condition",
        variantTitle: "改变条件",
        response: "改变拉力后重新判断合力的大小和方向，并检查受力条件是否变化。",
        verificationStatus: "待学习者或教师复核",
        createdAt: today.toISOString()
      });
      engine.scheduleReview(learningState, "sample-force", 3, Date.now());
      engine.saveState(learningState);
      document.dispatchEvent(new CustomEvent("physics-learning-state-changed"));
    });
    await page.waitForFunction(() => document.getElementById("masteredCount")?.textContent === "1");
    await page.locator('.question-card[data-id="sample-force"] [data-action="wrong"]').click();
    await page.waitForFunction(() => document.getElementById("wrongNavCount")?.textContent === "0");
    assert.equal(await page.locator("#masteredCount").textContent(), "1");
    assert.equal(
      await page.evaluate(() => window.PhysicsStudioApp.getMasteryEvidence("sample-force").status),
      "已掌握"
    );
    assert.ok(await page.locator("#emptyState").isVisible());

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("masteredCount")?.textContent === "1");
    assert.equal(await page.locator("#wrongNavCount").textContent(), "0");
    await page.locator('.nav-item[data-view="analysis"]').click();
    assert.equal(await page.locator("#analysisMasteryRate").textContent(), `${updatedMasteryRate}%`);
    assert.equal(await page.locator("#analysisTransferCount").textContent(), "1");

    const desktopFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      analysisWidth: document.getElementById("analysisPanel").getBoundingClientRect().width
    }));
    assert.ok(desktopFit.scrollWidth <= desktopFit.width);
    assert.ok(desktopFit.analysisWidth > 900);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#menuButton").click();
    await page.locator('.nav-item[data-view="analysis"]').click();
    await waitForTitle(page, "学情分析");
    await page.locator("#analysisPanel").scrollIntoViewIfNeeded();
    const mobileFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      metricColumns: getComputedStyle(document.querySelector(".analysis-metrics")).gridTemplateColumns,
      panelWidth: document.getElementById("analysisPanel").getBoundingClientRect().width
    }));
    assert.ok(mobileFit.scrollWidth <= mobileFit.width);
    assert.equal(mobileFit.metricColumns.split(" ").length, 1);
    assert.ok(mobileFit.panelWidth > 320 && mobileFit.panelWidth < 390);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-analysis-mobile.png"), type: "png" });

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: "passed", desktopFit, mobileFit, errors }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
