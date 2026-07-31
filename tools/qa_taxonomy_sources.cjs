const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const appPath = process.argv[2];
const outputDirectory = process.argv[3];
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_taxonomy_sources.cjs <index.html> <output-directory>");
}

async function waitForTitle(page, title) {
  await page.waitForFunction(
    (expected) => document.getElementById("pageTitle")?.textContent === expected,
    title
  );
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
    args: ["--allow-file-access-from-files"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
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
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "316");

    const taxonomy = await page.evaluate(() => {
      const books = window.PHYSICS_CURRICULUM_TAXONOMY.books;
      return {
        books: books.length,
        chapters: books.flatMap((book) => book.chapters).length,
        sections: books.flatMap((book) => book.chapters).flatMap((chapter) => chapter.sections).length,
        duplicateIds: (() => {
          const ids = books.flatMap((book) => [
            book.id,
            ...book.chapters.flatMap((chapter) => [
              chapter.id,
              ...chapter.sections.map((section) => section.id)
            ])
          ]);
          return ids.length - new Set(ids).size;
        })(),
        sources: window.PHYSICS_SOURCE_CATALOG.length
      };
    });
    assert.deepEqual(taxonomy, {
      books: 10,
      chapters: 55,
      sections: 231,
      duplicateIds: 0,
      sources: 24
    });

    await page.locator('.nav-item[data-view="curriculum"]').click();
    await waitForTitle(page, "教材知识目录");
    assert.ok(await page.locator("#curriculumPanel").isVisible());
    assert.equal(await page.locator(".curriculum-book-card").count(), 10);
    assert.match(await page.locator("#curriculumSummary").textContent(), /231/);
    assert.match(await page.locator("#curriculumSummary").textContent(), /43/);

    await page.locator("#curriculumGradeFilter").selectOption("八年级");
    assert.equal(await page.locator(".curriculum-book-card").count(), 2);
    assert.match(await page.locator("#curriculumSummary").textContent(), /12/);
    assert.match(await page.locator("#curriculumSummary").textContent(), /46/);

    await page.locator('.curriculum-book-card[data-book-id="pep-g8-1"] .curriculum-query-button').first().click();
    await waitForTitle(page, "我的物理题库");
    assert.equal(await page.locator("#searchInput").inputValue(), "机械运动");
    assert.ok(Number.parseInt(await page.locator("#resultCount").textContent(), 10) >= 1);

    await page.locator('.nav-item[data-view="curriculum"]').click();
    await waitForTitle(page, "教材知识目录");
    await page.locator("#curriculumGradeFilter").selectOption("八年级");
    await page.evaluate(() => {
      window.__qaOpenedUrl = "";
      window.open = (url) => {
        window.__qaOpenedUrl = String(url);
        return {};
      };
    });
    await page.locator('.curriculum-book-card[data-book-id="pep-g8-1"] [data-curriculum-web]').click();
    const curriculumSearch = new URL(await page.evaluate(() => window.__qaOpenedUrl));
    assert.equal(curriculumSearch.hostname, "www.bing.com");
    assert.match(curriculumSearch.searchParams.get("q"), /长沙.*八年级.*八年级上册.*试题.*答案/);

    await page.locator("#syncCenterButton").click();
    assert.ok(await page.locator("#syncModal").isVisible());
    assert.equal(await page.locator(".resource-card").count(), 42);
    assert.equal(await page.locator(".resource-rights").count(), 42);
    await page.locator("#resourceKeywordInput").fill("明德");
    assert.equal(await page.locator(".resource-card").count(), 1);
    assert.match(await page.locator(".resource-card h4").textContent(), /明德教育集团/);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#downloadImportTemplateButton").click();
    const download = await downloadPromise;
    const template = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(template.format, "physics-studio-backup");
    assert.equal(template.version, 3);
    assert.equal(template.template, "licensed-question-import");
    assert.deepEqual(template.questions, []);
    assert.equal(template.exampleQuestion.curriculumSectionId, "pep-g8-1-c01-s03");
    assert.ok(template.instructions.some((item) => item.includes("书面授权")));
    await page.locator(".close-resource-modal").first().click();

    await page.locator("#addQuestionButton").click();
    await page.locator("#gradeInput").selectOption({ label: "九年级" });
    assert.equal(await page.locator("#bookInput").inputValue(), "pep-g9");
    await page.locator("#chapterInput").selectOption("pep-g9-c05");
    await page.locator("#sectionInput").selectOption("pep-g9-c05-s02");
    await page.locator("#titleInput").fill("授权导入映射校验题");
    await page.locator("#topicInput").fill("欧姆定律");
    await page.locator("#sourceInput").fill("QA授权试卷");
    await page.locator("#sourceLicenseInput").selectOption("已取得书面授权");
    await page.locator("#sourceUrlInput").fill("https://example.com/authorized-question");
    await page.locator("#contentInput").fill("用于验证教材知识点和授权状态字段能够保存。");
    await page.locator("#solutionInput").fill("读取教材册、章、节和授权状态字段。");
    await page.locator("#answerInput").fill("字段保存正确。");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('#questionForm button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("totalCount")?.textContent === "317");
    await page.locator('.stat-card[data-view-target="library"]').click();
    await waitForTitle(page, "我的物理题库");
    const savedCard = page.locator(".question-card", { hasText: "授权导入映射校验题" });
    await savedCard.locator(".question-title-button").click();
    assert.match(await page.locator("#detailContent").textContent(), /九年级全一册 · 欧姆定律 · 欧姆定律/);
    assert.match(await page.locator("#detailContent").textContent(), /正文收录依据：已取得书面授权/);
    assert.equal(
      await page.locator('#detailContent a[href="https://example.com/authorized-question"]').count(),
      1
    );
    await page.locator('[data-detail-action="close"]').click();

    await page.locator('.nav-item[data-view="curriculum"]').click();
    await page.locator("#curriculumPanel").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-textbook-taxonomy.png"),
      type: "png"
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#menuButton").click();
    await page.locator('.nav-item[data-view="curriculum"]').click();
    await waitForTitle(page, "教材知识目录");
    await page.locator("#curriculumPanel").scrollIntoViewIfNeeded();
    const mobileFit = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      chapterColumns: getComputedStyle(document.querySelector(".curriculum-chapters")).gridTemplateColumns,
      panelWidth: document.getElementById("curriculumPanel").getBoundingClientRect().width
    }));
    assert.ok(mobileFit.scrollWidth <= mobileFit.width);
    assert.equal(mobileFit.chapterColumns.split(" ").length, 1);
    assert.ok(mobileFit.panelWidth > 320 && mobileFit.panelWidth < 390);
    await page.screenshot({
      path: path.join(outputDirectory, "physics-studio-textbook-taxonomy-mobile.png"),
      type: "png"
    });

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      status: "passed",
      taxonomy,
      resourceCount: 42,
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
