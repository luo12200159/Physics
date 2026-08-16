const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const project = path.resolve(__dirname, "..");
const outputDirectory = path.join(project, "qa-output", "targeted-teacher-flow");
const learningLabSource = fs.readFileSync(path.join(project, "learning-lab.js"), "utf8");
assert.match(learningLabSource, /draftToken: engine\.createId\("roster-draft"\)/,
  "each roster import preview must have an isolated draft batch token");
assert.match(learningLabSource, /draftToken: engine\.createId\("document-draft"\)/,
  "each parsed document must have an isolated draft batch token");
assert.match(learningLabSource, /lab\.pendingDocumentImport\?\.draftToken \|\| "no-document-draft"/,
  "document correction field keys must include the active document batch");
assert.match(learningLabSource, /lab\.studentImportDraft\?\.draftToken \|\| "no-roster-draft"/,
  "roster mapping field keys must include the active roster batch");
assert.match(learningLabSource, /new Set\(\["documentReviewConfirmed", "documentImportRights", "documentRemoteUploadConfirmed"\]\)/,
  "file-specific rights and review confirmations must be isolated per document batch");

function experience(role, grade = "九年级") {
  return {
    version: 2,
    onboarded: true,
    role,
    displayName: role === "teacher" ? "验收教师" : "专项学生",
    grade,
    textbook: "人教版",
    goal: grade === "九年级" ? "中考" : "日常巩固",
    examDate: "",
    weeklyGoal: 12,
    studentExternalLinks: false,
    fontScale: 1,
    events: [],
    activeDates: []
  };
}

async function waitForReady(page) {
  await page.waitForFunction(() => {
    return !document.body.classList.contains("activation-pending")
      && window.PhysicsStudioApp?.getQuestions?.().length === 2132
      && typeof window.PHYSICS_LEARNING_ENGINE?.buildTargetedLearningPlan === "function"
      && typeof window.PHYSICS_LEARNING_ENGINE?.buildComparableInterventionOutcome === "function";
  });
}

async function assertNoOverflow(page, selector, label) {
  const dimensions = await page.locator(selector).evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`
  );
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("physics-experience-v2")) {
      localStorage.setItem("physics-experience-v2", JSON.stringify(value));
    }
    if (value.role === "teacher") {
      sessionStorage.setItem("physics-teacher-mode-session-v1", "unlocked");
    }
  }, experience("teacher"));
  await page.route("**/activation.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `(() => {
        const whenActivated = Promise.resolve({ licenseId: "feature-qa", expiresAt: 0 });
        window.PhysicsStudioActivation = Object.freeze({
          version: "feature-qa",
          whenActivated,
          validateCode: async () => true,
          formatDeviceRequest: (value) => String(value || ""),
          publicKeyFingerprint: "feature-qa"
        });
        const unlock = () => {
          document.body.classList.remove("activation-pending");
          document.body.classList.add("activation-complete");
        };
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", unlock, { once: true });
        } else {
          unlock();
        }
      })();`
    });
  });

  try {
    await page.goto(pathToFileURL(path.join(project, "index.html")).href, {
      waitUntil: "domcontentloaded"
    });
    await waitForReady(page);
    await page.locator('[data-teacher-action="center"]').click();
    await page.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    await page.locator('.lab-tabs [data-lab-tab="teacher"]').click();
    await page.locator(".teacher-dashboard").waitFor({ state: "visible" });
    assert.equal(await page.locator('.teacher-dashboard[data-teacher-render-mode="today"] .teacher-todo-card').count(), 1);
    assert.equal(await page.locator(".student-decision-loop").count(), 0,
      "the lightweight Today view must not eagerly build the student workspace");
    await page.locator('[data-teacher-view="students"]').click();
    await page.locator('.teacher-dashboard[data-teacher-render-view="students"]').waitFor({ state: "visible" });

    const layout = await page.locator(".teacher-dashboard").evaluate((dashboard) => {
      const children = [...dashboard.children];
      const indexOf = (selector) => children.findIndex((child) => child.matches(selector)
        || Boolean(child.querySelector(selector)));
      return {
        decision: indexOf(".student-decision-loop"),
        student: indexOf(".student-manager-card"),
        plan: indexOf(".targeted-plan-card"),
        matrix: indexOf(".class-matrix-card"),
        history: indexOf(".exam-record-card"),
        advanced: indexOf(".teacher-advanced-tools")
      };
    });
    assert.ok(layout.decision > 0);
    assert.ok(layout.decision < layout.plan && layout.plan < layout.student && layout.student < layout.history);
    assert.equal(layout.matrix, -1);
    assert.equal(layout.advanced, -1);
    await page.locator("#managedStudentAnalysis").fill("未保存的学生分析草稿");
    await page.locator("#studentRosterPaste").fill("未保存的名单草稿");
    await page.locator("#targetedPlanCount").selectOption("7");
    await page.locator('[data-teacher-view="class"]').click();
    await page.locator('.teacher-dashboard[data-teacher-render-view="class"]').waitFor({ state: "visible" });
    await page.locator('[data-teacher-view="students"]').click();
    await page.locator('.teacher-dashboard[data-teacher-render-view="students"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("#managedStudentAnalysis").inputValue(), "未保存的学生分析草稿");
    assert.equal(await page.locator("#studentRosterPaste").inputValue(), "未保存的名单草稿");
    assert.equal(await page.locator("#targetedPlanCount").inputValue(), "7");
    await assertNoOverflow(page, "#learningLabModal", "desktop teacher modal");
    await page.screenshot({
      path: path.join(outputDirectory, "teacher-core-flow.png"),
      fullPage: false
    });

    await page.locator('[data-teacher-view="manage"]').click();
    await page.locator(".teacher-advanced-tools").waitFor({ state: "visible" });
    assert.equal(await page.locator(".teacher-advanced-tools").evaluate((node) => node.open), true);
    assert.equal(await page.locator(".teacher-advanced-body .content-coverage-card").count(), 1);
    assert.equal(await page.locator(".teacher-advanced-body .document-import-card").count(), 1);
    assert.equal(await page.locator(".teacher-advanced-body .ai-gateway-card").count(), 1);
    assert.equal(await page.locator(".teacher-advanced-body .content-review-list").count(), 1);
    assert.match(await page.locator(".teacher-advanced-body").innerText(), /本地题库[\s\S]*PDF、Word与扫描卷解析[\s\S]*ChatGPT 解题服务/);
    await page.locator("#assignmentTitle").fill("未保存的分层作业草稿");
    await page.locator('[data-teacher-view="class"]').click();
    await page.locator('.teacher-dashboard[data-teacher-render-view="class"]').waitFor({ state: "visible" });
    await page.locator('[data-teacher-view="manage"]').click();
    await page.locator('.teacher-dashboard[data-teacher-render-view="manage"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("#assignmentTitle").inputValue(), "未保存的分层作业草稿");

    await page.locator('[data-teacher-view="students"]').click();
    await page.locator("#managedStudentName").fill("专项学生");
    await page.locator("#managedStudentGrade").selectOption({ label: "九年级" });
    await page.locator("#managedStudentGoal").selectOption({ label: "中考" });
    await page.locator("#managedStudentAnalysis").fill("最近试卷显示欧姆定律建模步骤不稳定，先用少量题核对证据。");
    await page.locator('[data-lab-action="add-student"]').click();
    await page.waitForFunction(() => {
      return [...document.querySelectorAll(".student-profile-list article")]
        .some((node) => node.textContent.includes("专项学生") && node.classList.contains("active"));
    });
    const draftedProfileId = await page.locator('.student-profile-list article.active [data-lab-action="select-student"]').getAttribute("data-profile-id");
    const otherStudent = page.locator('.student-profile-list article:not(.active) [data-lab-action="select-student"]').first();
    assert.ok(draftedProfileId && await otherStudent.count(), "the draft isolation test requires two distinct students");
    await page.locator("#managedStudentAnalysis").fill("专项学生尚未保存的独立草稿");
    await otherStudent.click();
    await page.waitForFunction(() => document.querySelector("#managedStudentName")?.value !== "专项学生");
    assert.notEqual(await page.locator("#managedStudentAnalysis").inputValue(), "专项学生尚未保存的独立草稿",
      "student A's unsaved draft must never be restored into student B's form");
    await page.locator(`.student-profile-list [data-lab-action="select-student"][data-profile-id="${draftedProfileId}"]`).click();
    await page.waitForFunction(() => document.querySelector("#managedStudentName")?.value === "专项学生");
    assert.equal(await page.locator("#managedStudentAnalysis").inputValue(), "专项学生尚未保存的独立草稿");
    await page.locator("#managedStudentAnalysis").fill("按 Esc 关闭后仍需保留的草稿");
    await page.keyboard.press("Escape");
    await page.locator("#learningLabModal:not([open])").waitFor({ state: "attached" });
    await page.locator('[data-teacher-action="center"]').click();
    await page.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    await page.locator('.teacher-dashboard[data-teacher-render-view="students"]').waitFor({ state: "visible" });
    assert.equal(await page.locator("#managedStudentAnalysis").inputValue(), "按 Esc 关闭后仍需保留的草稿");

    await page.locator("#examRecordTitle").fill("中考专项诊断");
    await page.locator("#examRecordScore").fill("55");
    await page.locator("#examRecordTotal").fill("100");
    const ohmTopic = page.locator('#examRecordTopicOptions label').filter({ hasText: "欧姆定律" }).locator("input");
    assert.equal(await ohmTopic.count(), 1);
    await ohmTopic.check();
    await page.locator("#examRecordNote").fill("串并联关系和公式条件需要复核。");
    await page.locator('[data-lab-action="add-exam-record"]').click();
    await page.waitForFunction(() => {
      const state = window.PHYSICS_LEARNING_ENGINE.loadState();
      return state.examRecords?.some((record) => record.title === "中考专项诊断");
    });

    await page.locator("#targetedPlanCount").selectOption("5");
    await page.locator('[data-lab-action="preview-targeted-plan"]').click();
    await page.locator(".targeted-plan-preview").waitFor({ state: "visible" });
    assert.equal(await page.locator(".targeted-plan-preview li").count(), 5);
    assert.match(await page.locator(".targeted-plan-preview").innerText(), /欧姆定律专项微循环[\s\S]*最近试卷记录/);
    await page.locator('[data-lab-action="approve-targeted-plan"]').click();
    await page.locator(".active-targeted-plan").waitFor({ state: "visible" });

    const planEvidence = await page.evaluate(() => {
      const state = window.PHYSICS_LEARNING_ENGINE.loadState();
      const profile = state.profiles.find((item) => item.name === "专项学生");
      const plan = state.learningPlans.find((item) => item.profileId === profile?.id && item.status === "active");
      const questions = new Map(window.PhysicsStudioApp.getQuestions().map((item) => [item.id, item]));
      return {
        activeProfileId: state.activeProfileId,
        profileId: profile?.id,
        plan,
        grades: plan?.questionIds.map((id) => questions.get(id)?.grade),
        roles: plan?.items.map((item) => item.variantRole)
      };
    });
    assert.equal(planEvidence.activeProfileId, planEvidence.profileId);
    assert.equal(planEvidence.plan.questionCount, 5);
    assert.equal(planEvidence.plan.focusTopics[0], "欧姆定律");
    assert.ok(planEvidence.grades.every((grade) => grade === "九年级"));
    assert.ok(planEvidence.roles.includes("core"));
    assert.ok(planEvidence.roles.includes("near"));
    assert.ok(planEvidence.roles.includes("far"));
    assert.ok(planEvidence.roles.includes("counter"));

    await page.evaluate((value) => {
      localStorage.setItem("physics-experience-v2", JSON.stringify(value));
    }, experience("student"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await page.locator(".assigned-plan-card").waitFor({ state: "visible" });
    assert.equal(await page.locator(".assigned-plan-card li").count(), planEvidence.plan.sessions[0].questionIds.length,
      "student home must show only the current intervention session");
    assert.match(await page.locator(".assigned-plan-card").innerText(), /当前学习时段[\s\S]*欧姆定律专项微循环/);
    await page.screenshot({
      path: path.join(outputDirectory, "student-assigned-plan-desktop.png"),
      fullPage: true
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    await assertNoOverflow(page, "html", "mobile student page");
    assert.ok(await page.locator(".assigned-plan-card li button").evaluateAll((buttons) => {
      return buttons.every((button) => button.getBoundingClientRect().height >= 48);
    }));
    await page.screenshot({
      path: path.join(outputDirectory, "student-assigned-plan-mobile.png"),
      fullPage: true
    });
    await page.locator(".assigned-plan-card li button").first().click();
    await page.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    // The lab paints a lightweight loading state first, then commits the tutor
    // panel on the next animation frame so the click remains responsive on
    // low-end WebViews.
    await page.locator(".tutor-layout").waitFor({ state: "visible" });
    assert.ok(await page.locator(".tutor-layout").count() >= 1);
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      status: "passed",
      layout,
      plan: {
        title: planEvidence.plan.title,
        count: planEvidence.plan.questionCount,
        grades: planEvidence.grades,
        roles: planEvidence.roles
      },
      advancedToolsCollapsedByDefault: true,
      studentPlanVisibleDesktopAndMobile: true,
      activationScope: "feature UI only; production signature verification is covered separately",
      errors
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
