const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_interactions.cjs <index.html> <output-directory>");
}

async function waitForView(page, title) {
  await page.waitForFunction(
    (expected) => document.getElementById("pageTitle")?.textContent === expected,
    title
  );
}

async function stagePlayableVideo(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    const stream = canvas.captureStream(12);
    const mimeCandidates = ["video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("No supported WebM MediaRecorder format");

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(100);

    for (let frame = 0; frame < 16; frame += 1) {
      context.fillStyle = "#155d44";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ddef9a";
      context.font = "bold 24px sans-serif";
      context.fillText("F = ma", 112, 82);
      context.fillStyle = "#ffffff";
      context.font = "16px sans-serif";
      context.fillText(`方法演示 ${frame + 1}/16`, 100, 118);
      await new Promise((resolve) => setTimeout(resolve, 75));
    }

    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size < 100) throw new Error("Recorded QA video is empty");

    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("physics-studio-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const question = await new Promise((resolve, reject) => {
      const request = database.transaction("questions", "readonly").objectStore("questions").get("sample-force");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    question.videoType = "file";
    question.videoBlob = blob;
    question.videoName = "QA-方法演示.webm";
    question.updatedAt = new Date().toISOString();
    await new Promise((resolve, reject) => {
      const request = database.transaction("questions", "readwrite").objectStore("questions").put(question);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    database.close();
    return blob.size;
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("physics-experience-v2", JSON.stringify({
      version: 2, onboarded: true, role: "teacher", displayName: "QA",
      grade: "高一", textbook: "人教版", goal: "日常巩固",
      studentExternalLinks: false, fontScale: 1, events: [], activeDates: []
    }));
  });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    const launcherSource = fs.readFileSync(
      path.join(path.dirname(path.resolve(appPath)), "Launcher.cs"),
      "utf8"
    );
    assert.match(launcherSource, /FindMicrosoftEdge\(\)/);
    assert.match(launcherSource, /msedge\.exe/);
    assert.doesNotMatch(launcherSource, /chrome\.exe|BraveSoftware/);
    assert.match(launcherSource, /FileName = indexPath/);
    assert.match(launcherSource, /curriculum-taxonomy\.js/);
    assert.match(launcherSource, /curriculum-bank\.js/);
    assert.match(launcherSource, /exam-question-index\.js/);
    assert.match(launcherSource, /mock-exam-bank\.js/);
    assert.match(launcherSource, /vendor\\jsQR\.js/);

    await page.goto(pathToFileURL(path.resolve(appPath)).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Number.parseInt(document.getElementById("totalCount")?.textContent || "0", 10) > 0);
    const expectedTotal = Number.parseInt(await page.locator("#totalCount").textContent(), 10);
    assert.equal(expectedTotal, 316);
    const expectedRate = 0;
    await page.waitForFunction(
      (expected) => document.getElementById("totalCount")?.textContent === String(expected),
      expectedTotal
    );
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-clickable-stats.png"), type: "png" });

    assert.equal(await page.locator(".stat-card[data-view-target]").count(), 4);
    assert.equal(await page.locator('.nav-item[data-view="progress"]').count(), 1);

    await page.evaluate(() => {
      window.__qaOpenedUrl = "";
      window.open = (url) => {
        window.__qaOpenedUrl = String(url);
        return {};
      };
    });

    await page.locator("#searchInput").fill("校验");
    assert.equal(await page.locator("#resultCount").textContent(), "1 道题");
    assert.equal(await page.locator(".question-card").getAttribute("data-id"), "sample-electricity");
    assert.match(await page.locator("#searchStatus").textContent(), /1 道匹配试题/);

    await page.locator('.stat-card[data-view-target="videos"]').click();
    await waitForView(page, "方法视频");
    await page.locator("#searchInput").fill("平抛");
    assert.equal(await page.locator("#resultCount").textContent(), "0 道题");
    await page.locator(".search-local-button").click();
    await waitForView(page, "我的物理题库");
    assert.equal(await page.locator("#resultCount").textContent(), "4 道题");
    assert.equal(await page.locator('.question-card[data-id="sample-projectile"]').count(), 1);

    await page.locator("#searchInput").fill("长沙 高中物理 电磁感应");
    await page.locator("#edgeSearchButton").click();
    const edgeSearchUrl = new URL(await page.evaluate(() => window.__qaOpenedUrl));
    assert.equal(edgeSearchUrl.protocol, "https:");
    assert.equal(edgeSearchUrl.hostname, "www.bing.com");
    assert.equal(edgeSearchUrl.pathname, "/search");
    assert.equal(edgeSearchUrl.searchParams.get("q"), "长沙 高中物理 电磁感应");

    await page.locator("#searchInput").fill("");
    await page.evaluate(() => { window.__qaOpenedUrl = ""; });
    await page.locator("#edgeSearchButton").click();
    assert.equal(await page.evaluate(() => window.__qaOpenedUrl), "");
    assert.match(await page.locator("#toast").textContent(), /请先输入/);

    await page.locator("#quickSyncButton").click();
    assert.ok(await page.locator("#syncModal").isVisible());
    assert.equal(await page.locator(".resource-card").count(), 42);
    assert.equal(
      await page.locator('.resource-source-links a').first().getAttribute("href"),
      "https://basic.smartedu.cn/"
    );
    await page.locator("#resourceKeywordInput").fill("长沙市一中");
    await page.locator("#searchWebButton").click();
    const openedSearchUrl = await page.evaluate(() => window.__qaOpenedUrl);
    const parsedSearchUrl = new URL(openedSearchUrl);
    assert.equal(parsedSearchUrl.protocol, "https:");
    assert.equal(parsedSearchUrl.hostname, "www.bing.com");
    assert.match(parsedSearchUrl.searchParams.get("q"), /长沙市一中/);
    await page.locator(".close-resource-modal").first().click();

    await page.locator("#searchInput").fill("不存在的筛选词");
    await page.locator('.stat-card[data-view-target="library"]').click();
    await waitForView(page, "我的物理题库");
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.equal(await page.locator("#resultCount").textContent(), `${expectedTotal} 道题`);

    await page.locator('.stat-card[data-view-target="videos"]').click();
    await waitForView(page, "方法视频");
    assert.equal(await page.locator("#resultCount").textContent(), "0 道题");
    assert.ok(await page.locator("#emptyState").isVisible());

    await page.locator('.stat-card[data-view-target="mastered"]').click();
    await waitForView(page, "已掌握题目");
    assert.equal(await page.locator("#resultCount").textContent(), "0 道题");

    await page.locator('.stat-card[data-view-target="progress"]').click();
    await waitForView(page, "掌握进度");
    assert.ok(await page.locator("#progressPanel").isVisible());
    assert.equal(await page.locator("#progressRate").textContent(), `${expectedRate}%`);
    assert.equal(await page.locator("#progressMasteredCount").textContent(), "0");
    assert.equal(await page.locator("#progressPendingCount").textContent(), String(expectedTotal));
    assert.equal(await page.locator("#progressTrack").getAttribute("aria-valuenow"), String(expectedRate));

    await page.locator('[data-progress-view="pending"]').click();
    await waitForView(page, "待掌握题目");
    assert.equal(await page.locator("#resultCount").textContent(), `${expectedTotal} 道题`);

    await page.locator('.nav-item[data-view="progress"]').click();
    await waitForView(page, "掌握进度");
    assert.ok(await page.locator("#progressPanel").isVisible());

    await page.locator('.stat-card[data-view-target="library"]').click();
    await waitForView(page, "我的物理题库");
    assert.equal(await page.locator(".question-card").count(), expectedTotal);
    assert.equal(await page.locator(".card-video-panel").count(), expectedTotal);
    assert.equal(await page.locator(".card-video-empty").count(), expectedTotal);

    await page.locator('.question-card[data-id="sample-force"] .card-video-empty').click();
    assert.ok(await page.locator("#questionModal").isVisible());
    assert.equal(await page.locator("#formTitle").textContent(), "编辑物理试题");
    assert.equal(await page.locator("#questionId").inputValue(), "sample-force");
    await page.locator("#questionModal .close-modal").first().click();

    await page.locator('.question-card[data-id="sample-force"] .question-title-button').click();
    assert.ok(await page.locator("#detailModal").isVisible());
    assert.match(await page.locator("#detailContent h2").textContent(), /水平面上物体/);
    await page.locator('[data-detail-action="close"]').click();

    const stagedVideoSize = await stagePlayableVideo(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("videoCount")?.textContent === "1");
    await page.locator('.stat-card[data-view-target="library"]').click();
    const videoCard = page.locator('.question-card[data-id="sample-force"]');
    const video = videoCard.locator("video.card-video-player");
    await video.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const element = document.querySelector('.question-card[data-id="sample-force"] video');
      return element && element.readyState >= 1;
    });

    const videoBox = await video.boundingBox();
    assert.ok(videoBox && videoBox.width > 200 && videoBox.height > 100);
    await video.click({ position: { x: Math.round(videoBox.width / 2), y: Math.round(videoBox.height / 2) } });
    if (await video.evaluate((element) => element.paused)) {
      await video.press("Space");
    }
    await page.waitForFunction(() => {
      const element = document.querySelector('.question-card[data-id="sample-force"] video');
      return element && !element.paused && element.currentTime > 0.1;
    });

    await page.locator('.stat-card[data-view-target="videos"]').click();
    await waitForView(page, "方法视频");
    assert.equal(await page.locator("#resultCount").textContent(), "1 道题");
    assert.equal(await page.locator("video.card-video-player").count(), 1);

    await page.locator('.stat-card[data-view-target="library"]').click();
    await videoCard.scrollIntoViewIfNeeded();
    const desktopFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cardColumns: getComputedStyle(document.querySelector(".question-card")).gridTemplateColumns
    }));
    assert.ok(desktopFit.scrollWidth <= desktopFit.width);
    assert.ok(desktopFit.cardColumns.split(" ").length >= 2);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-inline-video.png"), type: "png" });

    await page.locator('.stat-card[data-view-target="progress"]').click();
    await page.locator("#progressPanel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-progress-view.png"), type: "png" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.stat-card[data-view-target="library"]').click();
    await page.locator("#toolbar").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-mobile-search.png"), type: "png" });
    await videoCard.scrollIntoViewIfNeeded();
    const mobileFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cardColumns: getComputedStyle(document.querySelector(".question-card")).gridTemplateColumns,
      videoWidth: document.querySelector(".card-video-player")?.getBoundingClientRect().width || 0
    }));
    assert.ok(mobileFit.scrollWidth <= mobileFit.width);
    assert.equal(mobileFit.cardColumns.split(" ").length, 1);
    assert.ok(mobileFit.videoWidth > 250 && mobileFit.videoWidth < 390);
    await page.screenshot({ path: path.join(outputDirectory, "physics-studio-mobile-video.png"), type: "png" });

    assert.deepEqual(consoleErrors, []);
    console.log(JSON.stringify({
      status: "passed",
      stagedVideoSize,
      desktopFit,
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
