"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const project = path.resolve(__dirname, "..");

async function checkEdition(browser, edition, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await installQaActivationStub(page, `dual-${edition}`);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push(`${request.failure()?.errorText || "request_failed"}: ${request.url()}`));
  await page.goto(pathToFileURL(path.join(project, `${edition}-index.html`)).href);
  const rootSelector = edition === "student" ? "#studentHome" : "#teacherClasses";
  await page.waitForFunction((selector) => {
    const root = document.querySelector(selector);
    return Boolean(root && root.textContent.trim().length > 20);
  }, rootSelector, { timeout: 30_000 });
  const result = await page.evaluate((expected) => ({
    edition: window.FeynmanDualApp?.edition?.(),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hasTeacherScript: Boolean([...document.scripts].some((script) => /teacher-app\.js$/.test(script.src))),
    hasStudentScript: Boolean([...document.scripts].some((script) => /student-app\.js$/.test(script.src))),
    nav: [...document.querySelectorAll(".role-nav button")].map((button) => button.textContent.trim()),
    expected,
  }), edition);
  assert.equal(result.edition, edition);
  assert.ok(result.horizontalOverflow <= 1, `${edition} viewport overflows horizontally by ${result.horizontalOverflow}px`);
  assert.equal(result.hasTeacherScript, edition === "teacher");
  assert.equal(result.hasStudentScript, edition === "student");
  assert.deepEqual(result.nav, edition === "student"
    ? ["首页", "任务", "查漏补缺", "错题", "我的学情"]
    : ["班级", "任务", "学情", "题库", "我的"]);
  const pages = edition === "student"
    ? ["tasks", "gaps", "wrong", "analysis", "home"]
    : ["tasks", "insights", "bank", "me", "classes"];
  let maxNavigationMs = 0;
  for (const target of pages) {
    const startedAt = Date.now();
    await page.locator(`.role-nav [data-nav="${target}"]`).click();
    await page.waitForFunction((name) => {
      const active = document.querySelector(`.role-page[data-page="${name}"].active`);
      return Boolean(active && active.textContent.trim().length > 10);
    }, target, { timeout: 5_000 });
    maxNavigationMs = Math.max(maxNavigationMs, Date.now() - startedAt);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${edition}/${target} overflows horizontally by ${overflow}px`);
  }
  assert.ok(maxNavigationMs < 1_500, `${edition} navigation took ${maxNavigationMs}ms`);
  assert.equal(errors.length, 0, errors.join("\n"));
  await context.close();
  return maxNavigationMs;
}

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    const studentNavigationMs = await checkEdition(browser, "student", { width: 390, height: 844 });
    const teacherNavigationMs = await checkEdition(browser, "teacher", { width: 1280, height: 800 });
    console.log(`Dual student/teacher browser smoke checks passed (max navigation: student ${studentNavigationMs}ms, teacher ${teacherNavigationMs}ms)`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
