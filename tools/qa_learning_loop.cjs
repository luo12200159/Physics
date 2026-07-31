const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  ({ chromium } = require("playwright"));
}

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_learning_loop.cjs <index.html> <output-directory>");
}

async function openApp(viewport) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2, onboarded: true, role: "teacher", displayName: "QA",
      grade: "高一", textbook: "人教版", goal: "日常巩固",
      studentExternalLinks: false, fontScale: 1, events: [], activeDates: []
    }));
    window.DeviceMotionEvent = class DeviceMotionEvent extends Event {};
  });
  await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Number(document.getElementById("totalCount")?.textContent || "0") > 0);
  return { browser, context, page, errors };
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const desktop = await openApp({ width: 1440, height: 960 });
  const { page, browser, errors } = desktop;

  try {
    assert.equal(await page.locator("#totalCount").textContent(), "316");
    await page.locator("#learningLabQuickButton").click();
    await page.waitForSelector(".learning-lab-modal[open] .lab-dashboard");
    assert.equal(await page.locator(".lab-tabs > button").count(), 9);
    assert.match(await page.locator(".lab-hero-card").innerText(), /诊断|建模/);

    await page.locator('[data-lab-tab="diagnostic"]').first().click();
    await page.locator('input[name="diagnosticAnswer"][value="A"]').check();
    await page.locator('input[name="diagnosticReason"][value="R1"]').check();
    await page.locator("#diagnosticConfidence").fill("5");
    await page.locator('[data-lab-action="submit-diagnostic"]').click();
    await page.waitForSelector(".diagnostic-result");
    assert.match(await page.locator(".diagnostic-result").innerText(), /稳定错误观念风险/);
    assert.match(await page.locator(".misconception-profile").innerText(), /高风险/);

    await page.locator('[data-lab-tab="tutor"]').first().click();
    await page.waitForSelector("#labQuestionSearch");
    await page.locator("#labQuestionSearch").fill("声音的产生与传播");
    const pickerCard = page.locator("#labQuestionPickerList > article:visible").first();
    assert.match(await pickerCard.innerText(), /声音的产生与传播/);
    await pickerCard.locator("[data-start-question]").click();
    await page.waitForSelector(".tutor-layout");
    assert.match(await page.locator(".tutor-question").innerText(), /440 Hz/);

    const modeling = {
      object: "研究对象为音叉和声音传播过程",
      known: "已知音叉频率为 440 Hz，声音需要介质传播",
      unknown: "求判断声音产生与传播条件的正确选项",
      process: "分为音叉振动产生声音与空气传播两个过程",
      assumptions: "忽略其他声源，视为空气性质恒定",
      coordinates: "本题无需坐标系，若描述传播则沿传播方向为正方向",
      forces: "音叉受敲击后振动，声波是介质振动传播",
      equations: "频率定义 f=N/t，Hz 表示每秒振动次数",
      reasonableness: "检查单位 Hz、传播条件和数量级均合理"
    };
    for (const [key, value] of Object.entries(modeling)) {
      await page.locator(`#model-${key}`).fill(value);
    }
    await page.locator('[data-hint-level="1"]').click();
    await page.locator('[data-hint-level="2"]').click();
    assert.match(await page.locator(".hint-ladder").innerText(), /声音|研究对象/);
    await page.locator("#labFinalAnswer").fill("A");
    await page.locator("#labReflection").fill("先判断声源是否振动，再检查声音传播是否需要介质。");
    await page.locator("#labSelfExplanation").fill("发声体必须振动，声音传播需要介质，频率表示每秒振动次数。");
    await page.locator('[data-lab-action="grade-answer"]').click();
    await page.waitForSelector(".grading-result.status-correct");
    assert.match(await page.locator(".grading-result").innerText(), /选项正确/);
    await page.locator('[data-lab-action="complete-attempt"]').click();
    await page.waitForSelector(".transfer-required-banner");
    await page.locator("#transferResponse0").fill("保留声源振动与介质传播的模型，改变频率并检查 Hz 的定义。");
    await page.locator('[data-save-transfer="0"]').click();
    await page.waitForSelector(".review-dashboard");
    assert.match(await page.locator(".lab-success-banner").innerText(), /本次学习闭环已完成/);
    const reviewText = await page.locator(".review-dashboard").innerText();
    assert.match(reviewText, /100%/);
    assert.match(reviewText, /基于真实步骤/);

    await page.locator('[data-lab-tab="models"]').first().click();
    await page.waitForSelector("#labModelOutput .main-simulation");
    const initialModelText = await page.locator("#labModelOutput").innerText();
    assert.match(initialModelText, /量纲一致/);
    await page.locator('[data-model-param="v0"]').evaluate((input) => {
      input.value = "30";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.match(await page.locator('[data-model-value="v0"]').textContent(), /30/);
    await page.locator('[data-model-type="circuit"]').click();
    await page.waitForSelector("#labModelOutput .circuit-svg");
    assert.match(await page.locator("#labModelOutput").innerText(), /功率/);

    await page.locator('[data-lab-tab="transfer"]').first().click();
    await page.waitForSelector(".transfer-variants");
    assert.equal(await page.locator(".transfer-variants > article").count(), 3);
    assert.match(await page.locator(".transfer-variants").innerText(), /反例辨析/);
    assert.match(await page.locator("#transferResponse0").inputValue(), /保留声源振动与介质传播的模型/);
    assert.match(await page.locator('[data-save-transfer="0"]').innerText(), /更新迁移记录/);

    await page.locator('[data-lab-tab="tools"]').first().click();
    await page.waitForSelector("#dimensionEquation");
    await page.locator("#dimensionEquation").fill("F=m*a");
    await page.locator('[data-lab-action="check-dimension"]').click();
    assert.match(await page.locator("#dimensionResult").innerText(), /量纲一致/);
    await page.locator('[data-lab-action="convert-unit"]').click();
    assert.match(await page.locator("#unitResult").innerText(), /72 km\/h = 20 m\/s/);
    await page.locator('[data-lab-action="fit-graph"]').click();
    assert.match(await page.locator("#graphResult").innerText(), /R²/);
    assert.equal(await page.locator("#labSketchCanvas").count(), 1);

    await page.locator('[data-lab-tab="teacher"]').first().click();
    await page.waitForSelector("#assignmentTitle");
    await page.locator("#assignmentTitle").fill("QA 分层作业");
    await page.locator("#assignmentCount").fill("6");
    await page.locator('[data-lab-action="generate-assignment"]').click();
    assert.match(await page.locator(".assignment-list").innerText(), /QA 分层作业/);
    assert.match(await page.locator(".assignment-list").innerText(), /教师待审核/);
    assert.match(await page.locator(".teacher-boundary").innerText(), /独立后端/);

    await page.locator('[data-lab-tab="sensors"]').first().click();
    await page.waitForSelector('[data-start-sensor="motion"]:not([disabled])');
    await page.locator('[data-start-sensor="motion"]').click();
    await page.waitForFunction(() => document.getElementById("sensorLiveBadge")?.textContent.includes("加速度计采集中"));
    await page.evaluate(async () => {
      for (let index = 0; index < 8; index += 1) {
        const event = new Event("devicemotion");
        Object.defineProperty(event, "accelerationIncludingGravity", {
          value: { x: index * 0.1, y: 0.2, z: 9.8 }
        });
        window.dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
    });
    assert.match(await page.locator("#sensorLiveBadge").innerText(), /加速度计采集中/);
    await page.locator('[data-lab-action="stop-sensors"]').click();
    const capturedSamples = Number.parseInt(await page.locator("#sensorSampleCount").textContent(), 10);
    assert.ok(capturedSamples >= 5);
    await page.locator("#experimentHypothesis").fill("上下振动会改变加速度合量的波动幅度。");
    await page.locator("#experimentVariables").fill("自变量为振动频率，因变量为加速度峰值，保持手机姿态不变。");
    await page.locator("#experimentConclusion").fill("本次样本仅用于功能验证，样本量小，不能形成一般性结论。");
    await page.locator('[data-lab-action="save-experiment"]').click();
    assert.match(await page.locator(".experiment-history").innerText(), /本次样本仅用于功能验证/);

    await page.screenshot({
      path: path.join(outputDirectory, "physics-learning-loop-desktop.png"),
      type: "png",
      fullPage: false
    });
    const desktopFit = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      dialogWidth: document.querySelector(".learning-lab-modal").getBoundingClientRect().width,
      panelOverflow: document.querySelector(".lab-panel").scrollWidth - document.querySelector(".lab-panel").clientWidth
    }));
    assert.ok(desktopFit.documentWidth <= desktopFit.viewport);
    assert.ok(desktopFit.panelOverflow <= 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }

  const mobile = await openApp({ width: 390, height: 844 });
  try {
    await mobile.page.locator("#learningLabQuickButton").click();
    await mobile.page.waitForSelector(".learning-lab-modal[open] .lab-dashboard");
    const fit = await mobile.page.evaluate(() => {
      const modal = document.querySelector(".learning-lab-modal");
      const panel = document.querySelector(".lab-panel");
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        modalWidth: modal.getBoundingClientRect().width,
        panelOverflow: panel.scrollWidth - panel.clientWidth
      };
    });
    assert.ok(fit.documentWidth <= fit.viewportWidth);
    assert.ok(Math.abs(fit.modalWidth - fit.viewportWidth) <= 6, JSON.stringify(fit));
    assert.ok(fit.panelOverflow <= 1);
    await mobile.page.locator('[data-lab-tab="models"]').first().click();
    await mobile.page.waitForSelector("#labModelOutput .main-simulation");
    await mobile.page.screenshot({
      path: path.join(outputDirectory, "physics-learning-loop-mobile.png"),
      type: "png",
      fullPage: false
    });
    assert.deepEqual(mobile.errors, []);
  } finally {
    await mobile.browser.close();
  }

  console.log(JSON.stringify({
    status: "passed",
      questionCount: 316,
    tabs: 9,
    diagnostics: 8,
    viewports: ["1440x960", "390x844"]
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
