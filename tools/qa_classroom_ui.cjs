const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const project = path.resolve(__dirname, "..");
const outputDirectory = path.join(project, "qa-output", "classroom-ui");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const classId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";
const inviteCode = "AbCdEfGhIjKlMnOpQrStUv";
const accessToken = `access.${"x".repeat(100)}`;
const refreshToken = `r1.44444444-4444-4444-8444-444444444444.${"a".repeat(43)}`;

function experience(role) {
  return {
    version: 2,
    onboarded: true,
    role,
    displayName: role === "teacher" ? "验收教师" : "验收学生",
    grade: "九年级",
    textbook: "人教版",
    goal: "中考",
    examDate: "",
    weeklyGoal: 12,
    studentExternalLinks: false,
    fontScale: 1,
    events: [],
    activeDates: []
  };
}

async function installActivationStub(page) {
  await page.route("**/activation.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `(() => {
        const whenActivated = Promise.resolve({ licenseId: "classroom-ui-qa", expiresAt: 0 });
        window.PhysicsStudioActivation = Object.freeze({
          version: "classroom-ui-qa",
          whenActivated,
          validateCode: async () => true,
          formatDeviceRequest: (value) => String(value || ""),
          publicKeyFingerprint: "classroom-ui-qa"
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
}

function json(route, status, body) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-Physics-Studio-Client",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
    },
    body: body == null ? "" : JSON.stringify(body)
  });
}

async function installServerMock(page, role, calls) {
  let memberStatus = "pending";
  let groups = [];
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "OPTIONS") return json(route, 204, null);
    const headers = request.headers();
    const body = request.postDataJSON?.() || null;
    calls.push({ method, path: url.pathname, headers, body });
    if (url.pathname === "/v1/auth/login" && method === "POST") {
      return json(route, 200, {
        accessToken,
        refreshToken,
        user: {
          id: role === "teacher" ? "55555555-5555-4555-8555-555555555555" : "66666666-6666-4666-8666-666666666666",
          role,
          displayName: role === "teacher" ? "服务端教师" : "服务端学生",
          status: "active",
          mustChangePassword: false,
          deletionPending: false
        }
      });
    }
    if (url.pathname === "/v1/classes" && method === "GET") {
      return json(route, 200, {
        items: role === "teacher" ? [{
          id: classId,
          name: "九年级物理一班",
          grade: "九年级",
          subject: "物理",
          schoolLabel: "验收学校",
          status: "active",
          revision: 1,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }] : [],
        nextCursor: null
      });
    }
    if (url.pathname === `/v1/classes/${classId}/roster` && method === "GET") {
      return json(route, 200, {
        items: [{
          id: membershipId,
          classId,
          groupId: groups[0]?.id || null,
          userId: "66666666-6666-4666-8666-666666666666",
          displayName: "待审核学生",
          memberRole: "student",
          studentNumber: "2026001",
          status: memberStatus,
          revision: 1,
          joinedAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }],
        nextCursor: null
      });
    }
    if (url.pathname === `/v1/classes/${classId}/groups` && method === "GET") {
      return json(route, 200, { items: groups, nextCursor: null });
    }
    if (url.pathname === `/v1/classes/${classId}/groups` && method === "POST") {
      groups = [{ id: groupId, classId, name: body.name, revision: 1, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }];
      return json(route, 201, groups[0]);
    }
    if (url.pathname === `/v1/classes/${classId}/invites` && method === "POST") {
      return json(route, 201, {
        id: "77777777-7777-4777-8777-777777777777",
        code: inviteCode,
        expiresAt: body.expiresAt,
        maxUses: body.maxUses
      });
    }
    if (url.pathname === `/v1/memberships/${membershipId}` && method === "PATCH") {
      if (body.status) memberStatus = body.status;
      return json(route, 200, {
        id: membershipId,
        classId,
        groupId: body.groupId ?? groups[0]?.id ?? null,
        userId: "66666666-6666-4666-8666-666666666666",
        displayName: "待审核学生",
        memberRole: "student",
        studentNumber: "2026001",
        status: memberStatus,
        revision: 2,
        joinedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:01:00.000Z"
      });
    }
    if (url.pathname === "/v1/invites/join" && method === "POST") {
      return json(route, 201, { membershipId, status: "pending" });
    }
    if (url.pathname === "/v1/auth/logout" && method === "POST") return json(route, 204, null);
    return json(route, 404, { code: "not_found", requestId: "classroom-ui-qa" });
  });
}

async function preparePage(context, role, calls) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript((value) => {
    localStorage.setItem("physics-experience-v2", JSON.stringify(value));
  }, experience(role));
  await installActivationStub(page);
  await installServerMock(page, role, calls);
  await page.goto(pathToFileURL(path.join(project, "index.html")).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return !document.body.classList.contains("activation-pending")
      && window.PhysicsStudioApp?.getQuestions?.().length >= 1900
      && Boolean(window.PhysicsStudioClassroom);
  });
  return { page, errors };
}

async function login(page, loginName) {
  await page.locator('#classroomLoginForm input[name="login"]').fill(loginName);
  await page.locator('#classroomLoginForm input[name="password"]').fill("correct horse battery staple");
  await page.locator('#classroomLoginForm button[type="submit"]').click();
  await page.locator(".classroom-session-bar").waitFor({ state: "visible" });
}

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const teacherCalls = [];
  const studentCalls = [];
  try {
    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const teacher = await preparePage(teacherContext, "teacher", teacherCalls);
    await teacher.page.locator('[data-teacher-action="classroom"]').click();
    await teacher.page.locator("#classroomDialog[open]").waitFor({ state: "visible" });
    await login(teacher.page, "teacher.qa");
    assert.match(await teacher.page.locator(".classroom-session-bar").innerText(), /服务端教师[\s\S]*教师账号/);
    assert.match(await teacher.page.locator(".classroom-class-head").innerText(), /九年级物理一班/);
    await teacher.page.locator('#classroomInviteForm button[type="submit"]').click();
    await teacher.page.locator(".classroom-invite-code").waitFor({ state: "visible" });
    assert.match(await teacher.page.locator(".classroom-invite-code").innerText(), new RegExp(inviteCode));
    await teacher.page.locator('#classroomGroupForm input[name="name"]').fill("基础巩固组");
    await teacher.page.locator('#classroomGroupForm button[type="submit"]').click();
    await teacher.page.locator(".classroom-group-list").getByText("基础巩固组").waitFor();
    await teacher.page.locator(`[data-classroom-member="${membershipId}"][data-classroom-status="active"]`).click();
    await teacher.page.waitForTimeout(300);
    const approvedText = await teacher.page.locator("#classroomContent").innerText();
    assert.match(approvedText, /已批准学生加入。[\s\S]*已加入/, approvedText);
    await teacher.page.screenshot({ path: path.join(outputDirectory, "teacher-classroom.png"), fullPage: false });
    assert.deepEqual(teacher.errors, []);
    await teacherContext.close();

    const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const student = await preparePage(studentContext, "student", studentCalls);
    await student.page.locator('.student-bottom-nav [data-student-view="profile"]').click();
    await student.page.locator('[data-shell-action="classroom"]').click();
    await student.page.locator("#classroomDialog[open]").waitFor({ state: "visible" });
    await login(student.page, "student.qa");
    await student.page.locator('#classroomJoinForm input[name="code"]').fill(inviteCode);
    await student.page.locator('#classroomJoinForm button[type="submit"]').click();
    await student.page.getByText("加入申请已提交，等待老师批准。", { exact: true }).waitFor();
    const mobileFit = await student.page.locator("#classroomDialog").evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight
    }));
    assert.ok(mobileFit.scrollWidth <= mobileFit.clientWidth + 1, JSON.stringify(mobileFit));
    assert.ok(mobileFit.scrollHeight >= mobileFit.clientHeight, JSON.stringify(mobileFit));
    await student.page.screenshot({ path: path.join(outputDirectory, "student-join.png"), fullPage: false });
    assert.deepEqual(student.errors, []);
    await studentContext.close();

    const mutations = [...teacherCalls, ...studentCalls].filter((call) => ["POST", "PATCH"].includes(call.method));
    assert.ok(mutations.length >= 6, JSON.stringify(mutations));
    assert.ok(mutations.every((call) => /^[\x21-\x7e]{16,128}$/.test(call.headers["idempotency-key"] || "")));
    const protectedCalls = [...teacherCalls, ...studentCalls].filter((call) => !call.path.startsWith("/v1/auth/"));
    assert.ok(protectedCalls.every((call) => call.headers.authorization === `Bearer ${accessToken}`));
    console.log(JSON.stringify({
      status: "passed",
      teacherMutations: teacherCalls.filter((call) => ["POST", "PATCH"].includes(call.method)).map((call) => call.path),
      studentMutations: studentCalls.filter((call) => ["POST", "PATCH"].includes(call.method)).map((call) => call.path),
      inviteCodeShownOnce: true,
      pendingApprovalFlow: true,
      mobileFit,
      screenshots: fs.readdirSync(outputDirectory).filter((name) => name.endsWith(".png")).sort()
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
