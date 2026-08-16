const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { launchBrowser } = require("./browser-launcher.cjs");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_android_bridge.cjs <index.html> <output-directory>");
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const projectDirectory = path.dirname(path.resolve(appPath));
  const managerPath = path.join(
    projectDirectory,
    "发布",
    "仅限管理员",
    "费曼物理-激活码管理器-v1.0.0.exe"
  );
  const activationDeviceId = "A1".repeat(32);
  const activationCodePath = path.join(outputDirectory, "android-bridge-activation-code.txt");
  const issued = childProcess.spawnSync(
    managerPath,
    ["--issue", `PSDEV-${activationDeviceId.match(/.{8}/g).join("-")}`, activationCodePath],
    { encoding: "utf8", windowsHide: true, timeout: 15000 }
  );
  if (issued.error) throw issued.error;
  assert.equal(issued.status, 0, issued.stderr || "activation issue command failed");
  const activationCode = fs.readFileSync(activationCodePath, "utf8").trim();
  assert.match(activationCode, /^PSA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  const browser = await launchBrowser({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const consoleErrors = [];
  let downloadTriggered = false;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("download", () => { downloadTriggered = true; });
  await page.addInitScript(({ deviceId, code }) => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2, onboarded: true, role: "teacher", displayName: "QA",
      grade: "高一", textbook: "人教版", goal: "日常巩固",
      studentExternalLinks: false, fontScale: 1, events: [], activeDates: []
    }));
    window.PhysicsStudioAndroid = {
      getActivationDeviceId() {
        return deviceId;
      },
      getStoredActivationCode() {
        return code;
      },
      saveActivationCode(nextCode) {
        window.__androidActivationCode = nextCode;
        return true;
      },
      saveTextFile(fileName, content, mimeType) {
        window.__androidExport = [fileName, content, mimeType];
      },
      saveBase64File(fileName, mimeType, base64Data) {
        window.__androidAttachmentExport = [fileName, mimeType, base64Data];
      }
    };
  }, { deviceId: activationDeviceId, code: activationCode });

  try {
    const androidSourcePath = path.join(
      path.dirname(path.resolve(appPath)),
      "android",
      "src",
      "com",
      "physicsstudio",
      "studyroom",
      "MainActivity.java"
    );
    const androidSource = fs.readFileSync(androidSourcePath, "utf8");
    assert.match(androidSource, /EDGE_PACKAGE = "com\.microsoft\.emmx"/);
    assert.match(androidSource, /setPackage\(EDGE_PACKAGE\)/);
    assert.match(androidSource, /isWebUri\(uri\)/);
    assert.match(androidSource, /openWithEdge\(uri\)/);
    assert.match(androidSource, /openWithDefaultHandler\(uri\)/);
    assert.doesNotMatch(androidSource, /PhysicsStudioAndroid\/\d+\.\d+\.\d+/,
      "Android user-agent must use the installed package version");
    assert.match(androidSource, /Manifest\.permission\.CAMERA/);
    assert.match(androidSource, /Manifest\.permission\.RECORD_AUDIO/);
    assert.match(androidSource, /RESOURCE_AUDIO_CAPTURE/);
    assert.match(androidSource, /saveBase64File/);
    assert.match(androidSource, /getActivationDeviceId/);
    assert.match(androidSource, /getStoredActivationCode/);
    assert.match(androidSource, /saveActivationCode/);
    assert.match(androidSource, /Settings\.Secure\.ANDROID_ID/);

    await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "1900");
    assert.equal(await page.locator("#activationGate").count(), 0);
    const expectedCompleteTotal = Number.parseInt(await page.locator("#totalCount").textContent(), 10);
    assert.equal(expectedCompleteTotal, 1900);
    await page.waitForFunction(
      (expected) => document.getElementById("totalCount")?.textContent === String(expected),
      expectedCompleteTotal
    );
    await page.evaluate(() => {
      window.__qaOpenedUrl = "";
      window.open = (url) => {
        window.__qaOpenedUrl = String(url);
        return {};
      };
    });
    await page.locator("#searchInput").fill("长沙 初中物理");
    await page.locator("#edgeSearchButton").click();
    const openedSearchUrl = new URL(await page.evaluate(() => window.__qaOpenedUrl));
    assert.equal(openedSearchUrl.hostname, "www.bing.com");
    assert.equal(openedSearchUrl.searchParams.get("q"), "长沙 初中物理");
    await page.locator("#searchInput").fill("");

    await page.locator("#menuButton").click();
    await page.waitForFunction(() => document.body.classList.contains("drawer-open"));
    await page.locator("#exportButton").click();
    await page.waitForFunction(() => Array.isArray(window.__androidExport));

    const exported = await page.evaluate(() => {
      const [fileName, content, mimeType] = window.__androidExport;
      return { fileName, mimeType, payload: JSON.parse(content) };
    });
    assert.match(exported.fileName, /^物理题库备份-\d{8}\.json$/);
    assert.equal(exported.mimeType, "application/json");
    assert.equal(exported.payload.format, "physics-studio-backup");
    assert.equal(exported.payload.version, 4);
    assert.equal(exported.payload.questions.length, 2132);
    assert.equal(
      exported.payload.questions.filter((question) => {
        return !question.resourceOnly
          && question.fullTextIncluded !== false
          && String(question.content || "").trim()
          && String(question.solution || "").trim()
          && String(question.answer || "").trim();
      }).length,
      expectedCompleteTotal
    );
    assert.ok(exported.payload.questions.every((question) => typeof question.id === "string"));
    await page.waitForTimeout(250);
    assert.equal(downloadTriggered, false);
    await page.waitForFunction(() => document.getElementById("toast")?.textContent.includes("保存位置"));

    const mobileFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      androidBridgeAvailable: typeof window.PhysicsStudioAndroid?.saveTextFile === "function"
    }));
    assert.ok(mobileFit.scrollWidth <= mobileFit.width);
    assert.equal(mobileFit.androidBridgeAvailable, true);
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-android-export.png"),
      type: "png"
    });
    assert.deepEqual(consoleErrors, []);

    console.log(JSON.stringify({
      status: "passed",
      fileName: exported.fileName,
      completeQuestionCount: expectedCompleteTotal,
      storedRecordCount: exported.payload.questions.length,
      activationBridge: "passed",
      downloadTriggered,
      mobileFit,
      consoleErrors
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
