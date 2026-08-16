const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installQaActivationStub, launchBrowser } = require("./browser-launcher.cjs");

// This is deliberately an interaction regression test rather than a benchmark.
// A dashboard click must yield control back to the WebView quickly enough for
// the loading state to paint; the expensive derived metrics may be computed
// after that first response.
const project = path.resolve(__dirname, "..");

(async () => {
  const browser = await launchBrowser({ headless: true, args: ["--allow-file-access-from-files"] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await installQaActivationStub(page, "interaction-latency-qa");
    await page.addInitScript(() => {
      localStorage.setItem("physics-experience-v2", JSON.stringify({
        version: 2,
        onboarded: true,
        role: "student",
        displayName: "QA",
        grade: "\u9ad8\u4e00",
        textbook: "\u4eba\u6559\u7248",
        goal: "\u65e5\u5e38\u5de9\u56fa",
        examDate: "",
        weeklyGoal: 12,
        studentExternalLinks: false,
        fontScale: 1,
        events: [],
        activeDates: []
      }));
    });
    await page.goto(pathToFileURL(path.join(project, "index.html")).href);
    await page.waitForFunction(() => (window.PhysicsStudioApp?.getQuestions?.() ?? []).length > 0);
    await page.waitForTimeout(5000);

    const result = await page.evaluate(async () => {
      const tasks = [];
      const observer = typeof PerformanceObserver === "function"
        ? new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => tasks.push(entry.duration));
        })
        : null;
      observer?.observe({ type: "longtask", buffered: false });
      const startedAt = performance.now();
      document.dispatchEvent(new CustomEvent("physics-studio-open-lab", { detail: { tab: "dashboard" } }));
      const loadingPainted = Boolean(document.querySelector(".lab-opening-state"));
      await new Promise((resolve) => setTimeout(resolve, 350));
      observer?.disconnect();
      return {
        dispatchMs: performance.now() - startedAt,
        maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
        longTaskCount: tasks.length,
        loadingPainted
      };
    });
    assert.ok(result.loadingPainted, JSON.stringify(result));
    assert.ok(result.maxLongTaskMs <= 180, `dashboard interaction blocked the WebView: ${JSON.stringify(result)}`);

    const navigationResult = await page.evaluate(async () => {
      const originalHeader = document.querySelector("#experienceShell .student-header");
      const originalNavigation = document.querySelector("#experienceShell .student-bottom-nav");
      const tasks = [];
      const observer = typeof PerformanceObserver === "function"
        ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => tasks.push(entry.duration)))
        : null;
      observer?.observe({ type: "longtask", buffered: false });
      const clickDurations = [];
      for (const view of ["practice", "wrong", "profile", "today", "practice", "today"]) {
        const button = document.querySelector(`[data-student-view="${view}"]`);
        const startedAt = performance.now();
        button?.click();
        clickDurations.push(performance.now() - startedAt);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      observer?.disconnect();
      return {
        headerPreserved: originalHeader === document.querySelector("#experienceShell .student-header"),
        navigationPreserved: originalNavigation === document.querySelector("#experienceShell .student-bottom-nav"),
        maxClickHandlerMs: Math.max(...clickDurations),
        maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
        activeView: document.querySelector(".student-bottom-nav button.active")?.dataset.studentView || ""
      };
    });
    assert.equal(navigationResult.headerPreserved, true,
      `student navigation must not rebuild the persistent header: ${JSON.stringify(navigationResult)}`);
    assert.equal(navigationResult.navigationPreserved, true,
      `student navigation must not rebuild the persistent bottom navigation: ${JSON.stringify(navigationResult)}`);
    assert.ok(navigationResult.maxClickHandlerMs <= 80,
      `student navigation click handler is too slow: ${JSON.stringify(navigationResult)}`);
    assert.ok(navigationResult.maxLongTaskMs <= 120,
      `student navigation produced a blocking task: ${JSON.stringify(navigationResult)}`);
    assert.equal(navigationResult.activeView, "today", JSON.stringify(navigationResult));

    const analysisResult = await page.evaluate(async () => {
      document.querySelector('[data-student-view="profile"]')?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tasks = [];
      const observer = typeof PerformanceObserver === "function"
        ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => tasks.push(entry.duration)))
        : null;
      observer?.observe({ type: "longtask", buffered: false });
      const startedAt = performance.now();
      document.querySelector('.my-learning-subareas [data-student-view="analysis"]')?.click();
      const clickReturnedMs = performance.now() - startedAt;
      await new Promise((resolve) => setTimeout(resolve, 1400));
      observer?.disconnect();
      return {
        clickReturnedMs,
        hydrated: Boolean(document.querySelector(".analysis-evidence-note")),
        currentView: document.querySelector(".student-main")?.dataset.currentStudentView || "",
        maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
        longTaskCount: tasks.length
      };
    });
    assert.equal(analysisResult.hydrated, true, JSON.stringify(analysisResult));
    assert.equal(analysisResult.currentView, "analysis", JSON.stringify(analysisResult));
    assert.ok(analysisResult.clickReturnedMs <= 80,
      `analysis navigation did not return promptly: ${JSON.stringify(analysisResult)}`);
    assert.ok(analysisResult.maxLongTaskMs <= 180,
      `analysis hydration blocked the WebView: ${JSON.stringify(analysisResult)}`);
    await context.close();

    const teacherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const teacherPage = await teacherContext.newPage();
    await installQaActivationStub(teacherPage, "teacher-interaction-latency-qa");
    await teacherPage.addInitScript(() => {
      localStorage.setItem("physics-experience-v2", JSON.stringify({
        version: 2,
        onboarded: true,
        role: "teacher",
        displayName: "教师 QA",
        grade: "高一",
        textbook: "人教版",
        goal: "日常巩固",
        examDate: "",
        weeklyGoal: 12,
        studentExternalLinks: false,
        fontScale: 1,
        events: [],
        activeDates: []
      }));
      sessionStorage.setItem("physics-teacher-mode-session-v1", "unlocked");
    });
    await teacherPage.goto(pathToFileURL(path.join(project, "index.html")).href);
    await teacherPage.waitForFunction(() => (window.PhysicsStudioApp?.getQuestions?.() ?? []).length > 0);
    await teacherPage.waitForTimeout(800);
    const teacherResult = await teacherPage.evaluate(async () => {
      const tasks = [];
      const observer = typeof PerformanceObserver === "function"
        ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => tasks.push(entry.duration)))
        : null;
      observer?.observe({ type: "longtask", buffered: false });
      const startedAt = performance.now();
      document.dispatchEvent(new CustomEvent("physics-studio-open-lab", { detail: { tab: "teacher" } }));
      const loadingPainted = Boolean(document.querySelector(".lab-opening-state"));
      await new Promise((resolve) => setTimeout(resolve, 1400));
      observer?.disconnect();
      return {
        dispatchMs: performance.now() - startedAt,
        maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
        longTaskCount: tasks.length,
        loadingPainted,
        hydrated: Boolean(document.querySelector(".teacher-dashboard"))
      };
    });
    assert.ok(teacherResult.loadingPainted, JSON.stringify(teacherResult));
    assert.ok(teacherResult.hydrated, JSON.stringify(teacherResult));
    assert.ok(teacherResult.maxLongTaskMs <= 120, `teacher center blocked the WebView: ${JSON.stringify(teacherResult)}`);
    const teacherNavigationResult = await teacherPage.evaluate(async () => {
      const tasks = [];
      const observer = typeof PerformanceObserver === "function"
        ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => tasks.push(entry.duration)))
        : null;
      observer?.observe({ type: "longtask", buffered: false });
      const startedAt = performance.now();
      document.querySelector('[data-teacher-view="students"]')?.click();
      const clickReturnedMs = performance.now() - startedAt;
      await new Promise((resolve) => setTimeout(resolve, 800));
      observer?.disconnect();
      return {
        clickReturnedMs,
        activeView: document.querySelector(".teacher-primary-nav button.active")?.dataset.teacherView || "",
        workspaceLoaded: document.querySelector(".teacher-dashboard")?.dataset.teacherRenderMode === "workspace",
        maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
        longTaskCount: tasks.length
      };
    });
    assert.equal(teacherNavigationResult.activeView, "students", JSON.stringify(teacherNavigationResult));
    assert.equal(teacherNavigationResult.workspaceLoaded, true, JSON.stringify(teacherNavigationResult));
    assert.ok(teacherNavigationResult.clickReturnedMs <= 80,
      `teacher navigation did not return promptly: ${JSON.stringify(teacherNavigationResult)}`);
    assert.ok(teacherNavigationResult.maxLongTaskMs <= 120,
      `teacher workspace navigation blocked the WebView: ${JSON.stringify(teacherNavigationResult)}`);
    const teacherViewResults = await teacherPage.evaluate(async () => {
      const results = [];
      for (const view of ["class", "manage", "today"]) {
        const tasks = [];
        const observer = typeof PerformanceObserver === "function"
          ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => tasks.push(entry.duration)))
          : null;
        observer?.observe({ type: "longtask", buffered: false });
        const startedAt = performance.now();
        document.querySelector(`[data-teacher-view="${view}"]`)?.click();
        const clickReturnedMs = performance.now() - startedAt;
        await new Promise((resolve) => setTimeout(resolve, 800));
        observer?.disconnect();
        results.push({
          view,
          clickReturnedMs,
          activeView: document.querySelector(".teacher-primary-nav button.active")?.dataset.teacherView || "",
          renderedView: document.querySelector(".teacher-dashboard")?.dataset.teacherRenderView || "today",
          maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
          longTaskCount: tasks.length
        });
      }
      return results;
    });
    teacherViewResults.forEach((result) => {
      assert.equal(result.activeView, result.view, JSON.stringify(result));
      assert.equal(result.renderedView, result.view, JSON.stringify(result));
      assert.ok(result.clickReturnedMs <= 80,
        `teacher ${result.view} navigation did not return promptly: ${JSON.stringify(result)}`);
      assert.ok(result.maxLongTaskMs <= 120,
        `teacher ${result.view} navigation blocked the WebView: ${JSON.stringify(result)}`);
    });
    await teacherContext.close();
    console.log(`Interaction latency QA passed: ${JSON.stringify({ student: result, navigation: navigationResult, analysis: analysisResult, teacher: teacherResult, teacherNavigation: teacherNavigationResult, teacherViews: teacherViewResults })}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
