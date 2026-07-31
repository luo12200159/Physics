const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const project = path.resolve(__dirname, "..");
const indexPath = path.join(project, "index.html");
const outputDirectory = path.join(project, "qa-output", "student-complete-experience");
const managerPath = path.join(
  project,
  "发布",
  "仅限管理员",
  "物理研习室-激活码管理器-v1.0.0.exe"
);
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const moduleViews = [
  "library",
  "wrong",
  "videos",
  "mastered",
  "progress",
  "curriculum",
  "analysis",
  "lab",
  "advice"
];

function experienceInit(grade = "高一") {
  return {
    version: 2,
    onboarded: true,
    role: "student",
    displayName: "学生端验收",
    grade,
    textbook: "人教版",
    goal: "日常巩固",
    examDate: "",
    weeklyGoal: 12,
    studentExternalLinks: false,
    fontScale: 1,
    events: [],
    activeDates: []
  };
}

async function preparePage(context, suffix) {
  const page = await context.newPage();
  await page.addInitScript((value) => {
    localStorage.setItem("physics-experience-v2", JSON.stringify(value));
  }, experienceInit());
  await page.goto(pathToFileURL(indexPath).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return document.getElementById("activationDeviceCode")?.textContent?.startsWith("PSDEV-")
      || !document.body.classList.contains("activation-pending");
  });
  if (await page.locator("#activationGate").count()) {
    const deviceRequest = (await page.locator("#activationDeviceCode").textContent()).trim();
    const codePath = path.join(outputDirectory, `activation-${suffix}.txt`);
    const issued = childProcess.spawnSync(
      managerPath,
      ["--issue", deviceRequest, codePath],
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );
    if (issued.error) throw issued.error;
    assert.equal(issued.status, 0, issued.stderr || "activation issue command failed");
    const code = fs.readFileSync(codePath, "utf8").trim();
    fs.rmSync(codePath, { force: true });
    await page.locator("#activationCode").fill(code);
    await page.locator("#activationSubmit").click();
  }
  await page.waitForFunction(() => {
    return !document.body.classList.contains("activation-pending")
      && window.PhysicsStudioApp?.getQuestions?.().length >= 1900
      && document.querySelectorAll(".student-module-grid [data-student-view]").length >= 9;
  });
  return page;
}

async function openStudentView(page, view) {
  if (!await page.locator(`[data-student-view="${view}"]`).count()) {
    const profileViews = new Set(["mastered", "progress", "analysis", "advice"]);
    const hub = profileViews.has(view) ? "profile" : "practice";
    await page.locator(`.student-bottom-nav [data-student-view="${hub}"]`).click();
    await page.waitForTimeout(80);
  }
  await page.locator(`[data-student-view="${view}"]`).first().click();
  await page.waitForTimeout(120);
  const state = await page.evaluate(() => ({
    text: document.querySelector(".student-main")?.innerText || "",
    html: document.querySelector(".student-main")?.innerHTML || ""
  }));
  assert.ok(
    state.text.length > 120,
    `${view} did not render substantive content: ${state.text.slice(0, 200)} / ${state.html.slice(0, 300)}`
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const fit = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  assert.ok(
    Math.max(fit.documentWidth, fit.bodyWidth) <= fit.viewport + 1,
    `${label} has horizontal overflow: ${JSON.stringify(fit)}`
  );
  return fit;
}

async function run() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  assert.ok(fs.existsSync(managerPath), "activation manager is missing");
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const desktop = await preparePage(desktopContext, "desktop");
  const errors = [];
  desktop.on("pageerror", (error) => errors.push(error.message));
  desktop.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    const inventory = await desktop.evaluate(() => {
      const questions = window.PhysicsStudioApp.getQuestions();
      const complete = questions.filter((question) => {
        return !question.resourceOnly
          && question.fullTextIncluded !== false
          && String(question.content || "").trim()
          && String(question.solution || "").trim()
          && String(question.answer || "").trim();
      });
      const books = window.PHYSICS_CURRICULUM_TAXONOMY.books;
      return {
        complete: complete.length,
        byGrade: Object.fromEntries(["八年级", "九年级", "高一", "高二", "高三"].map((grade) => [
          grade,
          complete.filter((question) => question.grade === grade).length
        ])),
        books: books.length,
        chapters: books.reduce((sum, book) => sum + book.chapters.length, 0),
        sections: books.reduce((sum, book) => {
          return sum + book.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.sections.length, 0);
        }, 0),
        incompleteDetailedSolutions: complete.filter((question) => {
          return question.solution.split(/\r?\n/).filter((line) => line.trim()).length < 3
            || !String(question.answer || "").trim();
        }).length
      };
    });
    assert.equal(inventory.complete, 1900);
    assert.deepEqual(inventory.byGrade, {
      八年级: 300,
      九年级: 500,
      高一: 300,
      高二: 300,
      高三: 500
    });
    assert.equal(inventory.books, 10);
    assert.equal(inventory.chapters, 55);
    assert.equal(inventory.sections, 231);
    assert.equal(inventory.incompleteDetailedSolutions, 0);

    const homeModules = await desktop.locator(".student-module-grid").first()
      .locator("[data-student-view]")
      .evaluateAll((buttons) => buttons.map((button) => ({
        view: button.dataset.studentView,
        text: button.innerText.trim()
      })));
    assert.deepEqual(homeModules.map((item) => item.view), moduleViews);
    assert.ok(homeModules.every((item) => item.text.length >= 12));
    await assertNoHorizontalOverflow(desktop, "desktop home");
    await desktop.screenshot({
      path: path.join(outputDirectory, "desktop-home-modules.png"),
      fullPage: true
    });

    await openStudentView(desktop, "library");
    assert.match(await desktop.locator(".library-overview").innerText(), /1900/);
    assert.equal(await desktop.locator(".library-question-list .student-question-card").count(), 12);
    const firstQuestion = desktop.locator(".library-question-list .student-question-card").first();
    assert.deepEqual(
      await firstQuestion.locator(".student-question-actions button").allTextContents(),
      ["独立作答", "详细解析", "方法讲解"]
    );
    await firstQuestion.locator('[data-question-detail]').click();
    await desktop.locator("#detailModal[open]").waitFor({ state: "visible" });
    assert.ok(await desktop.locator(".detail-solution-flow article").count() >= 3);
    assert.match(await desktop.locator("#detailContent").innerText(), /分步解析[\s\S]*解析结论[\s\S]*结果复核[\s\S]*参考答案/);
    assert.equal(await desktop.locator('[data-detail-action="edit"]').count(), 0);
    await desktop.locator('[data-detail-action="close"]').click();
    await firstQuestion.locator('[data-method-question]').click();
    await desktop.locator("#studentMethodDialog[open]").waitFor({ state: "visible" });
    assert.ok(await desktop.locator(".method-step-index li").count() >= 5);
    const firstMethodText = await desktop.locator(".method-player-stage article p").innerText();
    await desktop.locator('[data-method-action="next"]').click();
    assert.notEqual(await desktop.locator(".method-player-stage article p").innerText(), firstMethodText);
    await desktop.screenshot({
      path: path.join(outputDirectory, "desktop-method-walkthrough.png"),
      fullPage: false
    });
    await desktop.locator('[data-method-action="close"]').click();
    await assertNoHorizontalOverflow(desktop, "desktop library");

    const substantiveSelectors = {
      wrong: ".correction-workflow",
      videos: ".dynamic-method-section",
      mastered: ".mastery-rule-panel",
      progress: ".progress-state-grid",
      analysis: ".analysis-metric-grid",
      lab: ".student-lab-grid",
      advice: ".seven-day-plan"
    };
    for (const [view, selector] of Object.entries(substantiveSelectors)) {
      await openStudentView(desktop, view);
      await desktop.locator(selector).waitFor({ state: "visible" });
      assert.ok((await desktop.locator(".student-main").innerText()).length > 500, `${view} is too shallow`);
      await assertNoHorizontalOverflow(desktop, `desktop ${view}`);
    }
    await openStudentView(desktop, "lab");
    assert.equal(await desktop.locator('[data-open-lab-tab="teacher"]').count(), 0);
    assert.deepEqual(
      await desktop.locator(".student-lab-grid [data-open-lab-tab]").evaluateAll((buttons) => {
        return buttons.map((button) => button.dataset.openLabTab);
      }),
      ["diagnostic", "tutor", "models", "transfer", "review", "tools", "sensors", "dashboard"]
    );
    await desktop.locator('[data-open-lab-tab="diagnostic"]').click();
    await desktop.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    assert.equal(await desktop.locator('.lab-tabs [data-lab-tab="teacher"]').count(), 0);
    assert.ok(await desktop.locator(".lab-diagnostic-card").count() >= 1);
    await desktop.locator('[data-lab-action="close"]').click();

    await openStudentView(desktop, "curriculum");
    assert.equal(await desktop.locator(".curriculum-book-tabs button").count(), 10);
    const selectedSections = desktop.locator(".curriculum-section-list > article");
    assert.ok(await selectedSections.count() >= 4);
    for (let index = 0; index < await selectedSections.count(); index += 1) {
      assert.ok(
        await selectedSections.nth(index).locator("li").count() >= 4,
        `curriculum section ${index + 1} lacks four knowledge points`
      );
    }
    const officialLinks = await desktop.locator("[data-official-url]").evaluateAll((buttons) => {
      return buttons.map((button) => button.dataset.officialUrl);
    });
    assert.ok(officialLinks.every((value) => /^https:\/\/([a-z0-9-]+\.)*pep\.com\.cn\//i.test(value)));
    await desktop.screenshot({
      path: path.join(outputDirectory, "desktop-curriculum.png"),
      fullPage: true
    });
    await selectedSections.first().locator("[data-curriculum-target]").click();
    await desktop.locator(".curriculum-filter-chip").waitFor({ state: "visible" });
    assert.ok(await desktop.locator(".library-question-list .student-question-card").count() >= 1);

    await openStudentView(desktop, "analysis");
    await desktop.screenshot({
      path: path.join(outputDirectory, "desktop-learning-analysis.png"),
      fullPage: true
    });

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const mobile = await preparePage(mobileContext, "mobile");
    mobile.on("pageerror", (error) => errors.push(`mobile: ${error.message}`));
    mobile.on("console", (message) => {
      if (message.type() === "error") errors.push(`mobile: ${message.text()}`);
    });
    try {
      await openStudentView(mobile, "library");
      assert.ok(await mobile.locator(".library-question-list .student-question-card").count() >= 1);
      await assertNoHorizontalOverflow(mobile, "mobile library");
      const touchSizes = await mobile.locator(".student-question-actions button").first().evaluateAll((buttons) => {
        return buttons.map((button) => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
      });
      assert.ok(touchSizes.every((size) => size.width >= 48 && size.height >= 48));
      await mobile.screenshot({
        path: path.join(outputDirectory, "mobile-library.png"),
        fullPage: true
      });

      await openStudentView(mobile, "curriculum");
      await assertNoHorizontalOverflow(mobile, "mobile curriculum");
      assert.ok(await mobile.locator(".curriculum-section-list > article").first().locator("li").count() >= 4);
      await mobile.screenshot({
        path: path.join(outputDirectory, "mobile-curriculum.png"),
        fullPage: true
      });

      await mobile.locator(".curriculum-section-list [data-method-question]").first().click();
      await mobile.locator("#studentMethodDialog[open]").waitFor({ state: "visible" });
      await assertNoHorizontalOverflow(mobile, "mobile method dialog");
      const dialogBox = await mobile.locator("#studentMethodDialog").evaluate((dialog) => {
        const box = dialog.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      });
      assert.ok(dialogBox.left >= -1 && dialogBox.right <= 391);
      await mobile.screenshot({
        path: path.join(outputDirectory, "mobile-method-walkthrough.png"),
        fullPage: false
      });
    } finally {
      await mobileContext.close();
    }

    assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({
      status: "passed",
      inventory,
      modules: homeModules.map((item) => item.view),
      screenshots: fs.readdirSync(outputDirectory).filter((name) => name.endsWith(".png")).sort(),
      browserErrors: errors
    }, null, 2));
  } finally {
    await desktopContext.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
