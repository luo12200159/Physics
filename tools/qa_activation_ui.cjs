const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const project = path.resolve(__dirname, "..");
const indexPath = path.join(project, "index.html");
const outputDirectory = path.join(project, "qa-output");
const managerPath = path.join(
  project,
  "发布",
  "仅限管理员",
  "费曼物理-激活码管理器-v1.0.0.exe"
);

async function storedQuestions(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("physics-studio-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const questions = await new Promise((resolve, reject) => {
      const request = database.transaction("questions", "readonly").objectStore("questions").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return questions;
  });
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  assert.ok(fs.existsSync(managerPath), "activation manager is missing");
  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2,
      onboarded: true,
      role: "teacher",
      displayName: "QA",
      grade: "高一",
      textbook: "人教版",
      goal: "日常巩固",
      studentExternalLinks: false,
      fontScale: 1,
      events: [],
      activeDates: []
    }));
  });

  try {
    await page.goto(pathToFileURL(indexPath).href, { waitUntil: "domcontentloaded" });
    await page.locator("#activationDeviceCode").waitFor();
    await page.waitForFunction(() => {
      return document.getElementById("activationDeviceCode")?.textContent?.startsWith("PSDEV-");
    });
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-activation-gate.png"),
      type: "png"
    });

    const deviceRequest = (await page.locator("#activationDeviceCode").textContent()).trim();
    const codePath = path.join(outputDirectory, "activation-ui-test-code.txt");
    const issued = childProcess.spawnSync(
      managerPath,
      ["--issue", deviceRequest, codePath],
      { encoding: "utf8", windowsHide: true, timeout: 15000 }
    );
    if (issued.error) throw issued.error;
    assert.equal(issued.status, 0, issued.stderr || "activation issue command failed");
    const code = fs.readFileSync(codePath, "utf8").trim();
    assert.match(code, /^PSA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    await page.locator("#activationCode").fill(code);
    await page.locator("#activationSubmit").click();
    await page.waitForFunction(() => !document.body.classList.contains("activation-pending"));
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "1900");

    const questions = await storedQuestions(page);
    const complete = questions.filter((question) => {
      return !question.resourceOnly
        && question.fullTextIncluded !== false
        && String(question.content || "").trim()
        && String(question.solution || "").trim()
        && String(question.answer || "").trim();
    });
    const byGrade = {};
    complete.forEach((question) => {
      byGrade[question.grade] = (byGrade[question.grade] || 0) + 1;
    });
    assert.equal(questions.length, 2132);
    assert.equal(complete.length, 1900);
    assert.deepEqual(byGrade, { 八年级: 300, 九年级: 500, 高一: 300, 高二: 300, 高三: 500 });
    assert.equal(
      questions.filter((question) => question.collection === "changsha-six-year-real-exam-index").length,
      232
    );
    assert.equal(
      questions.filter((question) => question.collection === "changsha-original-practice-1500").length,
      1416
    );
    assert.equal(
      questions.filter((question) => question.collection === "changsha-targeted-transfer-400").length,
      400
    );
    assert.match(await page.locator("#resultCount").textContent(), /1900 道完整题 · 232 条题源索引/);

    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-1900-question-library.png"),
      type: "png"
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "1900");
    assert.equal(await page.locator("#activationGate").count(), 0);
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      status: "passed",
      deviceRequest,
      completeQuestions: complete.length,
      byGrade,
      totalRecords: questions.length,
      originalPracticeQuestions: 1416,
      targetedTransferQuestions: 400,
      realExamIndexes: 232,
      reloadAutoActivation: true,
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
