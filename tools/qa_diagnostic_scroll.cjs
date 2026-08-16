const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_diagnostic_scroll.cjs <index.html> <output-directory>");
}

function experienceInit() {
  return {
    version: 2,
    onboarded: true,
    role: "student",
    displayName: "诊断滚动验收",
    grade: "高一",
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

async function openDiagnostic(page) {
  await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return !document.body.classList.contains("activation-pending")
      && window.PhysicsStudioApp?.getQuestions?.().length >= 1900;
  });
  const openStarted = Date.now();
  const quickButton = page.locator("#learningLabQuickButton");
  if (await quickButton.isVisible()) {
    await quickButton.click();
  } else {
    await page.locator(".student-module-grid [data-student-view=lab]").click();
    await page.locator(".student-lab-grid [data-open-lab-tab=diagnostic]").click();
  }
  await page.locator("#learningLabModal[open]").waitFor({ state: "visible" });
  const dashboard = page.locator("#learningLabModal[open] .lab-dashboard");
  if (await dashboard.count()) await dashboard.waitFor({ state: "visible" });
  const diagnostic = page.locator("#learningLabModal[open] .lab-diagnostic-card");
  if (!(await diagnostic.count())) await page.locator(".lab-tabs [data-lab-tab=diagnostic]").click();
  await diagnostic.waitFor({ state: "visible" });
  return Date.now() - openStarted;
}

async function measurePage(page) {
  return page.evaluate(() => {
    const strip = document.querySelector(".diagnostic-selector");
    const question = document.querySelector(".diagnostic-question");
    const modal = document.querySelector("#learningLabModal");
    if (!strip || !question || !modal) return null;
    const stripBefore = strip.scrollLeft;
    const stripBox = strip.getBoundingClientRect();
    const dragStartX = Math.max(stripBox.left + 16, stripBox.right - 16);
    const dragEndX = Math.max(stripBox.left + 8, dragStartX - 260);
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 901,
      pointerType: "touch",
      clientX: dragStartX,
      button: 0
    });
    const pointerMove = new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 901,
      pointerType: "touch",
      clientX: dragEndX,
      button: 0
    });
    const pointerUp = new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 901,
      pointerType: "touch",
      clientX: dragEndX,
      button: 0
    });
    strip.dispatchEvent(pointerDown);
    strip.dispatchEvent(pointerMove);
    strip.dispatchEvent(pointerUp);
    const questionBox = question.getBoundingClientRect();
    const layoutChain = [strip, strip.parentElement, strip.parentElement?.parentElement, question, question.parentElement]
      .filter(Boolean)
      .map((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return {
          tag: node.tagName,
          className: node.className,
          width: box.width,
          clientWidth: node.clientWidth,
          minWidth: style.minWidth,
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns
        };
      });
    const h4 = [...question.querySelectorAll("h4")].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        rightWithinQuestion: box.right <= questionBox.right + 1,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth
      };
    });
    return {
      stripBefore,
      stripAfter: strip.scrollLeft,
      stripScrollWidth: strip.scrollWidth,
      stripClientWidth: strip.clientWidth,
      questionClientWidth: question.clientWidth,
      questionScrollWidth: question.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      modalWidth: modal.getBoundingClientRect().width,
      modalHeight: modal.getBoundingClientRect().height,
      viewportHeight: document.documentElement.clientHeight,
      layoutChain,
      h4
    };
  });
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  const errors = [];
  try {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const mobile = await mobileContext.newPage();
    await mobile.addInitScript((value) => {
      localStorage.setItem("physics-experience-v2", JSON.stringify(value));
    }, experienceInit());
    await installQaActivationStub(mobile, "diagnostic-scroll-mobile-qa");
    mobile.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    mobile.on("pageerror", (error) => errors.push(error.message));
    const mobileOpenMs = await openDiagnostic(mobile);
    const mobileMetrics = await measurePage(mobile);
    assert.ok(mobileMetrics);
    assert.ok(mobileMetrics.stripScrollWidth > mobileMetrics.stripClientWidth);
    assert.ok(mobileMetrics.stripAfter > mobileMetrics.stripBefore);
    assert.ok(mobileMetrics.stripClientWidth <= mobileMetrics.viewportWidth + 1);
    assert.ok(mobileMetrics.questionClientWidth <= mobileMetrics.viewportWidth + 1);
    assert.ok(mobileMetrics.questionScrollWidth <= mobileMetrics.questionClientWidth + 1);
    assert.ok(mobileMetrics.documentWidth <= mobileMetrics.viewportWidth);
    assert.ok(mobileMetrics.modalWidth <= mobileMetrics.viewportWidth + 1);
    assert.ok(mobileMetrics.modalHeight <= mobileMetrics.viewportHeight + 1);
    assert.ok(mobileMetrics.h4.every((item) => item.rightWithinQuestion && item.scrollWidth <= item.clientWidth + 1));
    await mobile.screenshot({ path: path.join(outputDirectory, "diagnostic-mobile.png"), fullPage: false });
    await mobileContext.close();

    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktop = await desktopContext.newPage();
    await desktop.addInitScript((value) => {
      localStorage.setItem("physics-experience-v2", JSON.stringify(value));
    }, experienceInit());
    await installQaActivationStub(desktop, "diagnostic-scroll-desktop-qa");
    desktop.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    desktop.on("pageerror", (error) => errors.push(error.message));
    const desktopOpenMs = await openDiagnostic(desktop);
    const desktopMetrics = await measurePage(desktop);
    assert.ok(desktopMetrics);
    assert.ok(desktopMetrics.stripScrollWidth > desktopMetrics.stripClientWidth);
    assert.ok(desktopMetrics.stripAfter > desktopMetrics.stripBefore);
    assert.ok(desktopMetrics.stripClientWidth <= desktopMetrics.viewportWidth + 1);
    assert.ok(desktopMetrics.questionClientWidth <= desktopMetrics.viewportWidth + 1);
    assert.ok(desktopMetrics.questionScrollWidth <= desktopMetrics.questionClientWidth + 1);
    assert.ok(desktopMetrics.documentWidth <= desktopMetrics.viewportWidth);
    assert.ok(desktopMetrics.modalWidth <= desktopMetrics.viewportWidth + 1);
    assert.ok(desktopMetrics.modalHeight <= desktopMetrics.viewportHeight + 1);
    assert.ok(desktopMetrics.h4.every((item) => item.rightWithinQuestion && item.scrollWidth <= item.clientWidth + 1));
    await desktop.screenshot({ path: path.join(outputDirectory, "diagnostic-desktop.png"), fullPage: false });
    await desktopContext.close();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "passed",
      mobileOpenMs,
      desktopOpenMs,
      mobileMetrics,
      desktopMetrics,
      errors
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
