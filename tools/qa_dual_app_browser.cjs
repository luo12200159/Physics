"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const project = path.resolve(__dirname, "..");

async function checkEdition(browser, edition, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await installQaActivationStub(page, `v330-parity-${edition}`);
  if (edition === "teacher") {
    await page.route("**/teacher-mode-lock.js", async (route) => {
      await route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: `window.PhysicsStudioTeacherLock = Object.freeze({
          hasPin: () => true,
          isUnlocked: () => true,
          setup: async () => true,
          unlock: async () => true,
          lock: () => true
        });`,
      });
    });
  }
  await page.addInitScript((fixedEdition) => {
    globalThis.PHYSICS_STUDIO_APP_EDITION = fixedEdition;
    try {
      localStorage.setItem("physics-experience-v2", JSON.stringify({
        version: 2,
        onboarded: true,
        role: fixedEdition,
        displayName: fixedEdition === "teacher" ? "教师" : "同学",
        grade: "高一",
        textbook: "人教版",
        goal: "日常巩固",
        weeklyGoal: 12,
        events: [],
        activeDates: [],
      }));
    } catch {
      // The init script also runs in the initial opaque document.
    }
  }, edition);

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(pathToFileURL(path.join(project, "index.html")).href);
  await page.waitForFunction((expected) => (
    document.body.classList.contains(`role-${expected}`)
      && window.PhysicsExperience?.getState?.().edition === expected
  ), edition, { timeout: 30_000 });

  const scripts = await page.evaluate(() => [...document.scripts].map((script) => script.src.split("/").pop()));
  for (const required of ["app.js", "learning-lab.js", "experience-shell.js"]) {
    assert.ok(scripts.includes(required), `${edition} must load v3.3 module ${required}`);
  }
  assert.equal(scripts.includes("student-app.js"), false);
  assert.equal(scripts.includes("teacher-app.js"), false);

  if (edition === "student") {
    const nav = await page.locator(".student-bottom-nav button").allTextContents();
    assert.deepEqual(nav.map((item) => item.replace(/\s+/g, "")), ["⌂今日", "▤练习", "!错题", "○我的"]);
    assert.equal(await page.locator("#teacherExperienceBar").count(), 0);
    for (const target of ["practice", "wrong", "profile", "today"]) {
      await page.locator(`.student-bottom-nav [data-student-view="${target}"]`).click();
      await page.waitForFunction((name) => (
        document.querySelector(".student-main")?.dataset.currentStudentView === name
      ), target, { timeout: 5_000 });
    }
  } else {
    const teacherBar = page.locator("#teacherExperienceBar");
    await teacherBar.waitFor({ state: "visible" });
    assert.match(await teacherBar.textContent(), /打开教师中心/);
    assert.match(await teacherBar.textContent(), /打开班级/);
    assert.doesNotMatch(await teacherBar.textContent(), /切换身份/);
    await teacherBar.locator('[data-teacher-action="center"]').click();
    await page.waitForFunction(() => document.querySelector("#learningLabModal")?.open, null, { timeout: 10_000 });
    await page.waitForFunction(() => document.querySelectorAll(".teacher-primary-nav button").length === 4, null, { timeout: 15_000 });
    const teacherNav = await page.locator(".teacher-primary-nav button").allTextContents();
    assert.deepEqual(teacherNav.map((item) => item.trim()), ["今日", "学生", "班级", "管理"]);
  }

  const state = await page.evaluate(() => window.PhysicsExperience.getState());
  assert.equal(state.edition, edition);
  assert.equal(state.role, edition);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
  assert.equal(errors.length, 0, errors.join("\n"));
  await context.close();
}

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    await checkEdition(browser, "student", { width: 390, height: 844 });
    await checkEdition(browser, "teacher", { width: 1280, height: 800 });
    console.log("v3.3 student/teacher interface browser parity checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
