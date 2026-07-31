const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const project = path.resolve(__dirname, "..");
const outputDirectory = path.join(project, "qa-output", "targeted-teacher-flow");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

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
      && window.PHYSICS_LEARNING_ENGINE?.version === "2.5.0";
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
  const browser = await chromium.launch({
    executablePath: edgePath,
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

    const layout = await page.locator(".teacher-dashboard").evaluate((dashboard) => {
      const children = [...dashboard.children];
      const indexOf = (selector) => children.findIndex((child) => child.matches(selector)
        || Boolean(child.querySelector(selector)));
      return {
        student: indexOf(".student-manager-card"),
        plan: indexOf(".targeted-plan-card"),
        history: indexOf(".exam-record-card"),
        advanced: indexOf(".teacher-advanced-tools")
      };
    });
    assert.ok(layout.student > 0);
    assert.ok(layout.student < layout.plan && layout.plan < layout.history && layout.history < layout.advanced);
    assert.equal(await page.locator(".teacher-advanced-tools").evaluate((node) => node.open), false);
    assert.equal(await page.locator(".teacher-advanced-body .content-coverage-card").count(), 1);
    assert.equal(await page.locator(".teacher-advanced-body .document-import-card").count(), 1);
    assert.equal(await page.locator(".teacher-advanced-body .ai-gateway-card").count(), 1);
    assert.equal(await page.locator(".teacher-advanced-body .content-review-list").count(), 1);
    await assertNoOverflow(page, "#learningLabModal", "desktop teacher modal");
    await page.screenshot({
      path: path.join(outputDirectory, "teacher-core-flow.png"),
      fullPage: false
    });

    await page.locator(".teacher-advanced-tools > summary").click();
    assert.equal(await page.locator(".teacher-advanced-tools").evaluate((node) => node.open), true);
    assert.match(await page.locator(".teacher-advanced-body").innerText(), /本地题库[\s\S]*PDF、Word与扫描卷解析[\s\S]*ChatGPT 解题服务/);

    await page.locator("#managedStudentName").fill("专项学生");
    await page.locator("#managedStudentGrade").selectOption({ label: "九年级" });
    await page.locator("#managedStudentGoal").selectOption({ label: "中考" });
    await page.locator("#managedStudentAnalysis").fill("最近试卷显示欧姆定律建模步骤不稳定，先用少量题核对证据。");
    await page.locator('[data-lab-action="add-student"]').click();
    await page.waitForFunction(() => {
      return [...document.querySelectorAll(".student-profile-list article")]
        .some((node) => node.textContent.includes("专项学生") && node.classList.contains("active"));
    });

    await page.locator("#examRecordTitle").fill("中考专项诊断");
    await page.locator("#examRecordScore").fill("55");
    await page.locator("#examRecordTotal").fill("100");
    await page.locator("#examRecordWeakTopics").fill("欧姆定律");
    await page.locator("#examRecordNote").fill("串并联关系和公式条件需要复核。");
    await page.locator('[data-lab-action="add-exam-record"]').click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("physics-learning-loop-v1") || "{}");
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
      const state = JSON.parse(localStorage.getItem("physics-learning-loop-v1") || "{}");
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
    assert.equal(await page.locator(".assigned-plan-card li").count(), 5);
    assert.match(await page.locator(".assigned-plan-card").innerText(), /教师已确认的专项方案[\s\S]*欧姆定律专项微循环/);
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
