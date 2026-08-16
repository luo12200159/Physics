const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_experience_shell.cjs <index.html> <output-directory>");
}

fs.mkdirSync(outputDirectory, { recursive: true });

async function waitForReady(page) {
  await page.waitForFunction(() => Boolean(window.PhysicsStudioApp?.getQuestions?.().length));
}

async function chooseRole(page, role, options = {}) {
  const dialog = page.locator("#experienceOnboarding");
  await dialog.waitFor({ state: "visible" });
  await dialog.locator(`input[name="experienceRole"][value="${role}"]`).check({ force: true });
  if (options.name != null) await dialog.locator("#experienceName").fill(options.name);
  if (options.grade) await dialog.locator("#experienceGrade").selectOption({ label: options.grade });
  if (options.textbook) await dialog.locator("#experienceTextbook").selectOption({ label: options.textbook });
  if (options.goal) await dialog.locator("#experienceGoal").selectOption({ label: options.goal });
  await dialog.getByRole("button", { name: "进入应用" }).click();
  await page.waitForFunction((expected) => document.body.classList.contains(`role-${expected}`), role);
}

async function run() {
  const browser = await launchBrowser({
    headless: true
  });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/activation.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `(() => {
        window.PhysicsStudioActivation = Object.freeze({
          version: "experience-shell-qa",
          whenActivated: Promise.resolve({ licenseId: "experience-shell-qa", expiresAt: 0 }),
          validateCode: async () => true,
          formatDeviceRequest: (value) => String(value || ""),
          publicKeyFingerprint: "experience-shell-qa"
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

  try {
    await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
    await page.locator("#experienceOnboarding").waitFor({ state: "visible" });
    assert.equal(await page.locator('.role-choice input[name="experienceRole"]').count(), 2);

    await chooseRole(page, "student", {
      name: "测试同学",
      grade: "高一",
      textbook: "人教版",
      goal: "日常巩固"
    });
    await waitForReady(page);
    await page.locator(".continue-card").waitFor({ state: "visible" });

    assert.equal(await page.locator(".sidebar").isVisible(), false);
    assert.equal(await page.locator(".main").isVisible(), false);
    assert.deepEqual(
      await page.locator(".student-bottom-nav button strong").allTextContents(),
      ["今日", "练习", "错题", "我的"]
    );
    assert.match(await page.locator(".today-intro").innerText(), /15 分钟/);

    const desktopFit = await page.evaluate(() => {
      const nav = document.querySelector(".student-bottom-nav").getBoundingClientRect();
      const fab = document.querySelector(".student-scan-fab").getBoundingClientRect();
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        navBottom: nav.bottom,
        fabWidth: fab.width,
        fabHeight: fab.height
      };
    });
    assert.ok(desktopFit.scrollWidth <= desktopFit.width + 1);
    assert.ok(desktopFit.navBottom <= 901);
    assert.ok(desktopFit.fabWidth >= 48 && desktopFit.fabHeight >= 48);
    await page.screenshot({ path: path.join(outputDirectory, "student-desktop-today.png") });

    await page.locator(".continue-card").click();
    await page.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    assert.equal(await page.locator(".hint-ladder pre").count(), 0, "answer and hints should be hidden initially");
    assert.equal(await page.locator(".lab-tabs").isVisible(), false, "student lab should not expose a second primary navigation");
    await page.locator(".hint-ladder button").first().click();
    assert.equal(await page.locator(".hint-ladder pre").count(), 1);
    await page.screenshot({ path: path.join(outputDirectory, "student-tutor-first-hint.png") });
    await page.locator('[data-lab-action="close"]').click();

    await page.locator('[data-student-view="practice"]').first().click();
    await page.locator("#studentPracticeSearch").fill("平抛");
    assert.match(await page.locator(".student-external-search").innerText(), /联网检索默认开启/);
    await page.locator('.student-search-submit[data-student-view="library"]').click();
    await page.waitForTimeout(120);
    assert.ok(await page.locator(".student-question-card").count() >= 1);

    await page.locator(".student-scan-fab").click();
    await page.locator("#studentCaptureDialog[open]").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "尝试设备文字识别" }).click();
    assert.match(await page.locator("#studentRecognitionStatus").innerText(), /请先拍照|先拍照/);
    const capturedText = "质量为2 kg的物体受到向右10 N拉力和向左4 N摩擦力，求物体所受合力的大小和方向。";
    await page.locator("#studentCaptureText").fill(capturedText);
    await page.locator("#studentOriginalAnswer").fill("我原来写成 14 N，方向向右。");
    let blockedByConfirmation = false;
    page.once("dialog", async (dialog) => {
      blockedByConfirmation = /逐字检查|人工确认/.test(dialog.message());
      await dialog.accept();
    });
    await page.locator("#studentCaptureForm .experience-primary").click();
    assert.equal(blockedByConfirmation, true);
    assert.equal(await page.locator("#studentCaptureDialog").evaluate((element) => element.open), true);
    await page.locator("#studentCaptureConfirmed").check();
    await page.locator("#studentCaptureForm .experience-primary").click();
    await page.locator("#learningLabModal[open]").waitFor({ state: "visible" });
    assert.match(await page.locator(".tutor-stem").innerText(), /质量为2 kg/);
    await page.locator('[data-lab-action="close"]').click();

    await page.locator('[data-student-view="wrong"]').first().click();
    assert.equal(await page.locator(".wrong-cause-guide").count(), 1);

    await page.locator('[data-student-view="profile"]').first().click();
    assert.match(await page.locator(".mastery-status-card").innerText(), /学习中|熟练|已掌握|待复习|薄弱/);
    assert.match(await page.locator(".student-safety-note").innerText(), /不允许手动勾选/);

    await page.locator('[data-shell-action="open-settings"]').first().click();
    const teacherPinHandler = async (dialog) => {
      if (dialog.type() === "prompt" && /PIN/.test(dialog.message())) await dialog.accept("246810");
      else await dialog.dismiss();
    };
    page.on("dialog", teacherPinHandler);
    await chooseRole(page, "teacher");
    page.off("dialog", teacherPinHandler);
    assert.equal(await page.locator(".main").isVisible(), true);
    assert.equal(await page.locator("#teacherExperienceBar").isVisible(), true);
    await page.locator('[data-teacher-action="center"]').click();
    await page.locator(".teacher-dashboard").waitFor({ state: "visible" });
    await page.locator('[data-lab-action="close"]').click();

    await page.locator("#addQuestionButton").click();
    await page.locator("#titleInput").fill("水平面上物体的受力与加速度");
    await page.locator("#topicInput").fill("力与运动");
    await page.locator("#sourceInput").fill("教师自编测试");
    await page.locator("#contentInput").fill("质量为2 kg的物体受到水平向右10 N的拉力和向左4 N的摩擦力，求合力的大小和方向。");
    await page.locator("#solutionInput").fill("研究对象为物体。水平方向由合力定义 F合=F拉-f，代入得6 N，方向水平向右。");
    await page.locator("#answerInput").fill("6 N，方向水平向右。");
    await page.waitForTimeout(80);
    assert.match(await page.locator("#contentAuditPanel").innerText(), /题名与设问可能不一致/);
    await page.screenshot({ path: path.join(outputDirectory, "teacher-content-audit.png") });
    await page.locator("#questionModal .close-modal").first().click();

    await page.locator('[data-teacher-action="switch"]').click();
    assert.equal(await page.locator('.role-choice input[value="parent"]').count(), 0);
    assert.equal(await page.locator('.parent-main').count(), 0);
    if (false) {
    await chooseRole(page, "parent");
    assert.equal(await page.locator(".parent-main").isVisible(), true);
    assert.match(await page.locator(".parent-intro").innerText(), /不贴负面标签/);
    assert.equal(await page.getByText(/排名/, { exact: false }).count() > 0, true);
    await page.screenshot({ path: path.join(outputDirectory, "parent-summary.png") });
    }

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    await mobile.addInitScript(() => {
      localStorage.setItem("physics-experience-v2", JSON.stringify({
        version: 2,
        onboarded: true,
        role: "student",
        displayName: "小林",
        grade: "高一",
        textbook: "人教版",
        goal: "日常巩固",
        weeklyGoal: 12,
        studentExternalLinks: false,
        fontScale: 1,
        events: [],
        activeDates: []
      }));
    });
    const mobilePage = await mobile.newPage();
    await mobilePage.route("**/activation.js", async (route) => {
      await route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: `(() => {
          window.PhysicsStudioActivation = Object.freeze({
            version: "experience-shell-mobile-qa",
            whenActivated: Promise.resolve({ licenseId: "experience-shell-mobile-qa", expiresAt: 0 }),
            validateCode: async () => true,
            formatDeviceRequest: (value) => String(value || ""),
            publicKeyFingerprint: "experience-shell-mobile-qa"
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
    await mobilePage.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
    await waitForReady(mobilePage);
    await mobilePage.locator(".continue-card").waitFor({ state: "visible" });
    const mobileFit = await mobilePage.evaluate(() => {
      const required = [
        document.querySelector(".student-header"),
        document.querySelector(".continue-card"),
        document.querySelector(".student-bottom-nav"),
        document.querySelector(".student-scan-fab")
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const buttons = [...document.querySelectorAll(".student-bottom-nav button, .student-scan-fab")]
        .map((element) => element.getBoundingClientRect())
        .map((rect) => ({ width: rect.width, height: rect.height }));
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        required,
        buttons,
        bodyFont: parseFloat(getComputedStyle(document.body).fontSize)
      };
    });
    assert.ok(mobileFit.scrollWidth <= mobileFit.innerWidth + 1, "mobile page should not scroll horizontally");
    assert.ok(mobileFit.required.every((rect) => rect.left >= -1 && rect.right <= 391));
    assert.ok(mobileFit.buttons.every((rect) => rect.width >= 48 && rect.height >= 48));
    assert.ok(mobileFit.bodyFont >= 16);
    await mobilePage.screenshot({ path: path.join(outputDirectory, "student-mobile-today.png") });
    await mobile.close();

    assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
    console.log(JSON.stringify({
      status: "passed",
      desktopFit,
      mobileFit: {
        scrollWidth: mobileFit.scrollWidth,
        innerWidth: mobileFit.innerWidth,
        bodyFont: mobileFit.bodyFont,
        minButtonHeight: Math.min(...mobileFit.buttons.map((item) => item.height))
      },
      screenshots: fs.readdirSync(outputDirectory).filter((name) => name.endsWith(".png")).sort()
    }, null, 2));
  } finally {
    await desktop.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
