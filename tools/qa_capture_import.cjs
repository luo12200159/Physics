const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_capture_import.cjs <index.html> <output-directory>");
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2, onboarded: true, role: "teacher", displayName: "QA",
      grade: "高一", textbook: "人教版", goal: "日常巩固",
      studentExternalLinks: false, fontScale: 1, events: [], activeDates: []
    }));
  });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Number.parseInt(document.getElementById("totalCount")?.textContent || "0", 10) > 0);
    assert.equal(await page.locator("#totalCount").textContent(), "316");
    assert.equal(await page.evaluate(() => typeof window.jsQR), "function");

    await page.locator("#addQuestionButton").click();
    assert.ok(await page.locator("#questionModal").isVisible());
    assert.equal(await page.locator(".capture-method-card").count(), 4);

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl5ngAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.locator("#scanImageInput").setInputFiles({
      name: "牛顿第二定律扫描题.png",
      mimeType: "image/png",
      buffer: png
    });
    await page.waitForFunction(() => document.querySelectorAll(".attachment-item").length === 1);
    assert.equal(await page.locator("#titleInput").inputValue(), "牛顿第二定律扫描题");
    assert.equal(await page.locator("#topicInput").inputValue(), "待分类");
    assert.match(await page.locator("#contentInput").inputValue(), /扫描图片/);

    await page.locator("#attachmentFileInput").setInputFiles([
      {
        name: "题目说明.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("质量为2 kg的物体受到6 N合力，求加速度。", "utf8")
      },
      {
        name: "参考资料.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% QA attachment\n", "utf8")
      }
    ]);
    await page.waitForFunction(() => document.querySelectorAll(".attachment-item").length === 3);

    await page.evaluate(() => {
      const binary = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl5ngAAAABJRU5ErkJggg==");
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const file = new File(
        [bytes],
        "剪贴板截图.png",
        { type: "image/png" }
      );
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          items: [{ kind: "file", getAsFile: () => file }]
        }
      });
      document.getElementById("attachmentDropZone").dispatchEvent(event);
    });
    await page.waitForFunction(() => document.querySelectorAll(".attachment-item").length === 4);

    await page.evaluate(() => {
      applyQrPayload(JSON.stringify({
        format: "physics-studio-question",
        question: {
          title: "二维码结构化试题",
          stage: "高中",
          grade: "高一",
          topic: "牛顿第二定律",
          difficulty: "进阶",
          source: "二维码测试数据",
          content: "质量为 2 kg 的物体受到 6 N 合力，求加速度。",
          solution: "由牛顿第二定律 a = F/m。",
          answer: "3 m/s²",
          sourceLicense: "用户自行上传（权利状态由用户确认）"
        }
      }));
    });
    assert.equal(await page.locator("#titleInput").inputValue(), "二维码结构化试题");
    assert.equal(await page.locator("#stageInput").inputValue(), "高中");
    assert.equal(await page.locator("#gradeInput").inputValue(), "高一");
    assert.equal(await page.locator("#answerInput").inputValue(), "3 m/s²");
    assert.equal(await page.locator(".attachment-item").count(), 4);

    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-scan-file-import.png"),
      type: "png"
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('#questionForm button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "317");

    const card = page.locator(".question-card", { hasText: "二维码结构化试题" });
    assert.match(await card.textContent(), /附件 4/);
    await card.locator(".question-title-button").click();
    assert.equal(await page.locator(".detail-attachment-card").count(), 4);
    assert.equal(await page.locator(".detail-attachment-image").count(), 2);

    const attachmentDownload = page.waitForEvent("download");
    await page.locator(".detail-attachment-card").first().click();
    const attachment = await attachmentDownload;
    assert.equal(attachment.suggestedFilename(), "牛顿第二定律扫描题.png");
    await page.locator('[data-detail-action="close"]').click();

    const backupDownload = page.waitForEvent("download");
    await page.locator("#exportButton").click();
    const backup = JSON.parse(fs.readFileSync(await (await backupDownload).path(), "utf8"));
    assert.equal(backup.version, 4);
    const saved = backup.questions.find((question) => question.title === "二维码结构化试题");
    assert.ok(saved);
    assert.deepEqual(saved.attachments, []);
    assert.equal(saved.attachmentManifest.length, 4);
    assert.match(saved.exportNote, /扫描图片和附件未包含/);

    await page.locator("#addQuestionButton").click();
    await page.evaluate(() => applyQrPayload("https://example.com/changsha-physics-paper"));
    assert.equal(await page.locator("#sourceUrlInput").inputValue(), "https://example.com/changsha-physics-paper");
    assert.equal(await page.locator("#sourceLicenseInput").inputValue(), "仅保存来源链接");
    await page.locator(".close-modal").first().click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#addQuestionButton").click();
    await page.waitForTimeout(250);
    assert.deepEqual(await page.locator("dialog[open]").evaluateAll((dialogs) => dialogs.map((dialog) => dialog.id)), ["questionModal"]);
    const mobileFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      methodColumns: getComputedStyle(document.querySelector(".capture-method-grid")).gridTemplateColumns,
      modalWidth: document.getElementById("questionModal").getBoundingClientRect().width
    }));
    assert.ok(mobileFit.scrollWidth <= mobileFit.width);
    assert.equal(mobileFit.methodColumns.split(" ").length, 2);
    assert.ok(mobileFit.modalWidth < 390);
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-scan-file-import-mobile.png"),
      type: "png"
    });
    await page.locator(".close-modal").first().click();

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "passed",
      initialTotal: 316,
      savedTotal: 317,
      attachmentCount: 4,
      qrDecoder: "jsQR 1.4.0",
      mobileFit,
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
