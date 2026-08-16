const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const project = path.resolve(__dirname, "..");
const indexPath = path.join(project, "index.html");
const outputDirectory = path.join(project, "qa-output", "student-complete-experience");
const moduleViews = [
  "library",
  "wrong",
  "curriculum",
  "lab"
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
  await page.route("**/activation.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `(() => {
        const whenActivated = Promise.resolve({ licenseId: "student-experience-qa", expiresAt: 0 });
        window.PhysicsStudioActivation = Object.freeze({
          version: "student-experience-qa",
          whenActivated,
          validateCode: async () => true,
          formatDeviceRequest: (value) => String(value || ""),
          publicKeyFingerprint: "student-experience-qa"
        });
        const unlock = () => {
          document.body.classList.remove("activation-pending");
          document.body.classList.add("activation-complete");
        };
        document.readyState === "loading"
          ? document.addEventListener("DOMContentLoaded", unlock, { once: true })
          : unlock();
      })();`
    });
  });
  await page.goto(pathToFileURL(indexPath).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return !document.body.classList.contains("activation-pending")
      && window.PhysicsStudioApp?.getQuestions?.().length >= 1900
      && document.querySelectorAll(".student-module-grid [data-student-view]").length >= 4;
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
  const browser = await launchBrowser({
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
    assert.match(await desktop.locator(".diagnostic-prompt-card.primary").innerText(), /24 题[\s\S]*前概念/);
    await desktop.locator('[data-shell-action="open-placement"]').click();
    await desktop.locator("#experienceMetricsDialog[open]").waitFor({ state: "visible" });
    assert.equal(await desktop.locator(".diagnostic-package-list > li").count(), 24);
    assert.ok(await desktop.locator("[data-diagnostic-concept]").count() > 0);
    assert.ok(await desktop.locator("[data-diagnostic-question]").count() > 0);
    await desktop.locator('[data-metrics-action="close"]').click();
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

    await desktop.locator("#studentLibraryGrade").selectOption({ label: "全部" });
    const questionTypeCounts = await desktop.locator(".library-type-summary span").evaluateAll((items) => {
      return Object.fromEntries(items.map((item) => [
        item.childNodes[item.childNodes.length - 1]?.textContent?.trim(),
        Number(item.querySelector("strong")?.textContent || 0)
      ]));
    });
    assert.ok(questionTypeCounts["选择题"] > 0, JSON.stringify(questionTypeCounts));
    assert.ok(questionTypeCounts["填空题"] > 0, JSON.stringify(questionTypeCounts));
    assert.ok(questionTypeCounts["实验题"] > 0, JSON.stringify(questionTypeCounts));
    for (const type of ["选择题", "填空题", "实验题"]) {
      await desktop.locator("#studentLibraryQuestionType").selectOption({ label: type });
      assert.ok(await desktop.locator(".library-question-list .student-question-card").count() > 0, `${type} filter is empty`);
    }
    await desktop.locator('[data-library-action="clear"]').click();
    await desktop.locator("#studentLibraryGrade").selectOption({ label: "九年级" });
    await desktop.locator("#studentLibraryQuestionType").selectOption({ label: "选择题" });
    await desktop.locator("#studentLibrarySearch").fill("声音的产生与传播");
    const choiceCard = desktop.locator(".library-question-list .student-question-card").first();
    assert.match(await choiceCard.innerText(), /单项选择题/);
    await choiceCard.locator('[data-start-question]').click();
    await desktop.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    await desktop.locator(".tutor-choice-response").waitFor({ state: "visible" });
    const labScrollBefore = await desktop.evaluate(() => ({
      documentY: window.scrollY,
      panelTop: document.getElementById("labPanel").scrollTop,
      panelHeight: document.getElementById("labPanel").clientHeight,
      panelScrollHeight: document.getElementById("labPanel").scrollHeight,
      contentHeight: document.getElementById("learningLabContent").clientHeight,
      modalHeight: document.getElementById("learningLabModal").clientHeight
    }));
    assert.ok(labScrollBefore.panelScrollHeight > labScrollBefore.panelHeight, JSON.stringify(labScrollBefore));
    assert.ok(Math.abs(labScrollBefore.contentHeight - labScrollBefore.modalHeight) <= 2, JSON.stringify(labScrollBefore));
    await desktop.locator("#labPanel").hover();
    await desktop.mouse.wheel(0, 900);
    await desktop.waitForTimeout(120);
    const labScrollAfter = await desktop.evaluate(() => ({
      documentY: window.scrollY,
      panelTop: document.getElementById("labPanel").scrollTop
    }));
    assert.ok(labScrollAfter.panelTop > labScrollBefore.panelTop, JSON.stringify({ labScrollBefore, labScrollAfter }));
    assert.equal(labScrollAfter.documentY, labScrollBefore.documentY);
    const expectedChoice = await desktop.evaluate(() => {
      const id = document.querySelector(".tutor-layout")?.closest("#labPanel")
        ? document.querySelector(".tutor-layout .tutor-question")?.querySelector("[data-view-source-question]")?.dataset.viewSourceQuestion
        : "";
      const question = window.PhysicsStudioApp.getQuestions().find((item) => item.id === id)
        || window.PhysicsStudioApp.getQuestions().find((item) => item.title.includes("声音的产生与传播"));
      return String(question?.answer || "").match(/\b([A-H])\b/)?.[1] || "A";
    });
    await desktop.locator(`[data-lab-choice][value="${expectedChoice}"]`).check();
    const documentBeforeGrade = await desktop.evaluate(() => window.scrollY);
    await desktop.locator('[data-lab-action="grade-answer"]').click();
    await desktop.locator(".grading-result").waitFor({ state: "visible" });
    assert.match(await desktop.locator(".grading-result").innerText(), /结果通过|参考答案与分步解析/);
    assert.match(await desktop.locator(".grading-reference").innerText(), /参考答案[\s\S]*分步解析/);
    const postGradeFit = await desktop.evaluate(() => {
      const dialogElement = document.getElementById("learningLabModal");
      const contentElement = document.getElementById("learningLabContent");
      const shellElement = document.querySelector(".lab-shell");
      const dialog = dialogElement.getBoundingClientRect();
      const header = document.querySelector(".lab-header").getBoundingClientRect();
      return {
        documentY: window.scrollY,
        dialogTop: dialog.top,
        headerTop: header.top,
        headerHeight: header.height,
        dialogScrollTop: dialogElement.scrollTop,
        contentScrollTop: contentElement.scrollTop,
        shellScrollTop: shellElement.scrollTop,
        panelScrollTop: document.getElementById("labPanel").scrollTop
      };
    });
    assert.equal(postGradeFit.documentY, documentBeforeGrade);
    assert.ok(postGradeFit.headerTop >= postGradeFit.dialogTop - 1, JSON.stringify(postGradeFit));
    assert.ok(postGradeFit.headerHeight >= 70, JSON.stringify(postGradeFit));
    await desktop.screenshot({ path: path.join(outputDirectory, "desktop-answer-feedback.png"), fullPage: false });
    await desktop.locator('[data-lab-action="close"]').click();
    await desktop.locator('[data-library-action="clear"]').click();

    await desktop.locator(".student-scan-fab").click();
    await desktop.locator("#studentCaptureDialog[open]").waitFor({ state: "visible" });
    const captureScrollBefore = await desktop.evaluate(() => {
      const form = document.getElementById("studentCaptureForm");
      return { documentY: window.scrollY, top: form.scrollTop, height: form.clientHeight, scrollHeight: form.scrollHeight };
    });
    assert.ok(captureScrollBefore.scrollHeight > captureScrollBefore.height, JSON.stringify(captureScrollBefore));
    await desktop.locator("#studentCaptureForm").hover();
    await desktop.mouse.wheel(0, 900);
    await desktop.waitForTimeout(120);
    const captureScrollAfter = await desktop.evaluate(() => ({
      documentY: window.scrollY,
      top: document.getElementById("studentCaptureForm").scrollTop,
      footerVisible: document.querySelector("#studentCaptureForm footer").getBoundingClientRect().top < innerHeight
    }));
    assert.ok(captureScrollAfter.top > captureScrollBefore.top, JSON.stringify({ captureScrollBefore, captureScrollAfter }));
    assert.equal(captureScrollAfter.documentY, captureScrollBefore.documentY);
    assert.equal(captureScrollAfter.footerVisible, true);
    await desktop.screenshot({ path: path.join(outputDirectory, "desktop-capture-scroll.png"), fullPage: false });
    await desktop.locator('[data-capture-action="close"]').click();

    const substantiveSelectors = {
      wrong: ".correction-workflow",
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
    await desktop.locator("#learningLabModal[open] .lab-diagnostic-card").waitFor({ state: "visible" });
    assert.equal(await desktop.locator('.lab-tabs [data-lab-tab="teacher"]').count(), 0);
    assert.ok(await desktop.locator(".lab-diagnostic-card").count() >= 1);
    const diagnosticStrip = await desktop.locator(".diagnostic-selector").evaluate((strip) => {
      const before = strip.scrollLeft;
      strip.scrollLeft = strip.scrollWidth;
      return {
        before,
        after: strip.scrollLeft,
        clientWidth: strip.clientWidth,
        scrollWidth: strip.scrollWidth
      };
    });
    assert.ok(diagnosticStrip.scrollWidth >= diagnosticStrip.clientWidth, JSON.stringify(diagnosticStrip));
    if (diagnosticStrip.scrollWidth > diagnosticStrip.clientWidth) {
      assert.ok(diagnosticStrip.after > diagnosticStrip.before, JSON.stringify(diagnosticStrip));
    }
    const diagnosticOptions = await desktop.locator(".diagnostic-question label").evaluateAll((labels) => labels.map((label) => ({
      clientWidth: label.clientWidth,
      scrollWidth: label.scrollWidth
    })));
    assert.ok(diagnosticOptions.every((item) => item.scrollWidth <= item.clientWidth + 1), JSON.stringify(diagnosticOptions));
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
    assert.ok(await desktop.locator(".knowledge-evidence-matrix article").count() >= 10);
    assert.match(await desktop.locator(".knowledge-evidence-matrix > summary").innerText(), /证据不足[\s\S]*需巩固[\s\S]*基本掌握[\s\S]*可迁移/);
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

      await mobile.locator(".library-question-list [data-start-question]").first().click();
      await mobile.locator("#learningLabModal[open]").waitFor({ state: "visible" });
      await mobile.locator("#labPanel").focus();
      const mobileLabBefore = await mobile.evaluate(() => ({
        documentY: window.scrollY,
        top: document.getElementById("labPanel").scrollTop,
        height: document.getElementById("labPanel").clientHeight,
        scrollHeight: document.getElementById("labPanel").scrollHeight
      }));
      assert.ok(mobileLabBefore.scrollHeight > mobileLabBefore.height, JSON.stringify(mobileLabBefore));
      await mobile.locator("#labPanel").press("End");
      await mobile.waitForTimeout(100);
      const mobileLabAfter = await mobile.evaluate(() => ({
        documentY: window.scrollY,
        top: document.getElementById("labPanel").scrollTop,
        closeTop: document.querySelector('[data-lab-action="close"]').getBoundingClientRect().top
      }));
      assert.ok(mobileLabAfter.top > mobileLabBefore.top, JSON.stringify({ mobileLabBefore, mobileLabAfter }));
      assert.equal(mobileLabAfter.documentY, mobileLabBefore.documentY);
      assert.ok(mobileLabAfter.closeTop >= 0, JSON.stringify(mobileLabAfter));
      await mobile.screenshot({ path: path.join(outputDirectory, "mobile-lab-scroll.png"), fullPage: false });
      await mobile.locator('[data-lab-action="close"]').click();

      await mobile.locator(".student-scan-fab").click();
      await mobile.locator("#studentCaptureDialog[open]").waitFor({ state: "visible" });
      await mobile.locator("#studentCaptureForm").focus();
      const mobileCaptureBefore = await mobile.locator("#studentCaptureForm").evaluate((form) => form.scrollTop);
      await mobile.locator("#studentCaptureForm").press("End");
      await mobile.waitForTimeout(100);
      const mobileCaptureAfter = await mobile.locator("#studentCaptureForm").evaluate((form) => form.scrollTop);
      assert.ok(mobileCaptureAfter > mobileCaptureBefore, JSON.stringify({ mobileCaptureBefore, mobileCaptureAfter }));
      await mobile.locator('[data-capture-action="close"]').click();

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
      questionTypeCounts,
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
