"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const root = path.resolve(__dirname, "..");
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
    && document.querySelectorAll(".student-bottom-nav button").length === 5, null, { timeout: 30_000 });
  await page.waitForFunction(() => (globalThis.PhysicsStudioApp?.getQuestions?.() || []).length >= 1900, null, { timeout: 30_000 });

  assert.deepEqual(
    await page.locator(".student-bottom-nav button strong").allTextContents(),
    ["首页", "课程", "训练", "学情", "我的"],
  );
  assert.equal(await page.locator("#teacherExperienceBar").count(), 0);

  const views = ["home", "course", "training", "analysis", "profile"];
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  for (const view of views) {
    await page.locator(`.student-bottom-nav [data-student-view="${view}"]`).click();
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
  assert.equal(errors.length, 0, errors.join("\n"));

  console.log(JSON.stringify({
    status: "passed",
    navigation: views,
    horizontalScroll: true,
    verticalScroll: true,
    clickable: true,
    screenshots: screenshotDirectory,
  }, null, 2));
  await context.close();
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
