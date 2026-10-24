const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const project = path.resolve(__dirname, "..");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const CURSOR_ID = "55555555-5555-4555-8555-555555555555";
const ACCESS_1 = "a".repeat(100);
const ACCESS_2 = "b".repeat(100);
const REFRESH_1 = `r1.${USER_ID}.${"A".repeat(43)}`;
const REFRESH_2 = `r1.${USER_ID}.${"B".repeat(43)}`;
const PASSWORD = "Never-Store-This-Password!";
const USER = Object.freeze({
  id: USER_ID,
  role: "teacher",
  displayName: "长沙物理教师",
  status: "active",
  mustChangePassword: false,
  deletionPending: false
});

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  dump() {
    return [...this.values.entries()];
  }
}

function jsonResponse(status, payload) {
  const text = payload === undefined || payload === null ? "" : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text;
    }
  };
}

function headersOf(call) {
  return call.options.headers || {};
}

function bodyOf(call) {
  return call.options.body ? JSON.parse(call.options.body) : null;
}

function assertMutationKey(call) {
  const key = headersOf(call)["Idempotency-Key"];
  assert.match(key, /^[\x20-\x7e]{16,128}$/);
  return key;
}

async function main() {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const calls = [];
  let fetchHandler = async () => jsonResponse(500, {
    code: "unexpected_request",
    message: "Unexpected request",
    requestId: "qa-unexpected"
  });
  const window = {
    localStorage,
    sessionStorage,
    crypto: webcrypto,
    fetch: async (url, options) => {
      const call = { url: String(url), options: { ...options, headers: { ...options.headers } } };
      calls.push(call);
      return fetchHandler(call);
    }
  };
  const navigator = { onLine: true };
  const context = vm.createContext({
    window,
    localStorage,
    navigator,
    console,
    URL,
    AbortController,
    Uint8Array,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(
    fs.readFileSync(path.join(project, "storage-repository.js"), "utf8"),
    context,
    { filename: "storage-repository.js" }
  );
  window.PhysicsStudioStorageRepository = context.PhysicsStudioStorageRepository;
  vm.runInContext(
    fs.readFileSync(path.join(project, "classroom-client.js"), "utf8"),
    context,
    { filename: "classroom-client.js" }
  );

  const api = window.PhysicsStudioClassroom;
  assert.ok(api);
  assert.equal(Object.isFrozen(api), true);
  assert.deepEqual(
    Object.keys(api),
    [
      "version", "configure", "status", "checkHealth", "login", "register", "reauthenticate", "restoreSession", "logout", "createClass",
      "listClasses", "getClass", "deleteClass", "createInvite", "parseInvitePayload", "discoverServices", "joinClassByInviteCode", "joinInvite", "updateDisplayName", "listRoster", "listGroups",
      "createGroup", "updateMembership", "syncStatus", "syncLearning",
      "syncExamRecords", "syncVariantSets", "listVariantSets", "flushSyncQueue", "acknowledgeSyncConflict",
      "listAssignments", "createAssignment", "submitAssignment", "listOwnSubmissions", "listClassSubmissions", "listOwnClassSubmissions", "getClassLearningSummary",
      "listReviewCases", "decideReviewCase", "saveReportSnapshot", "listReportSnapshots", "buildClassroomAnalytics"
    ]
  );
  assert.equal(typeof api.register, "function", "split apps require explicit student/teacher account registration");
  assert.equal(typeof api.reauthenticate, "function", "sensitive teacher operations require recent authentication");
  assert.equal(typeof api.restoreSession, "function", "Android secure refresh credentials must support session restoration");
  assert.equal(api.status().serverUrl, "");
  assert.equal(api.status().serviceConfigured, false);
  assert.equal(api.status().authenticated, false);

  const androidStorage = new MemoryStorage();
  const androidWindow = {
    localStorage: androidStorage,
    sessionStorage: new MemoryStorage(),
    crypto: webcrypto,
    fetch: async () => jsonResponse(500, { code: "unexpected_request" })
  };
  const androidContext = vm.createContext({
    window: androidWindow,
    localStorage: androidStorage,
    navigator: { onLine: true },
    location: {
      protocol: "https:",
      origin: "https://appassets.androidplatform.net",
      hostname: "appassets.androidplatform.net"
    },
    console,
    URL,
    AbortController,
    Uint8Array,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(project, "storage-repository.js"), "utf8"), androidContext);
  androidWindow.PhysicsStudioStorageRepository = androidContext.PhysicsStudioStorageRepository;
  vm.runInContext(fs.readFileSync(path.join(project, "classroom-client.js"), "utf8"), androidContext);
  assert.equal(
    androidWindow.PhysicsStudioClassroom.status().serverUrl,
    "",
    "the Android appassets origin must never be mistaken for a classroom API"
  );

  assert.throws(() => api.configure("http://classroom.example"), /HTTPS/);
  assert.equal(
    api.configure("http://[::1]:8787/").serverUrl,
    "http://[::1]:8787",
    "IPv6 loopback remains available for local development without weakening remote HTTPS enforcement"
  );
  assert.throws(() => api.configure("https://admin:secret@classroom.example"), /不能包含账号/);
  assert.throws(() => api.configure("https://classroom.example?token=secret"), /不能包含查询参数/);
  assert.throws(
    () => api.configure("http://localhost:8787/"),
    (error) => error?.code === "invalid_server_url",
  );
  assert.equal(api.configure("https://classroom.example/api/").serverUrl, "https://classroom.example/api");

  fetchHandler = async (call) => {
    if (call.url.endsWith("/v1/auth/login")) {
      return jsonResponse(200, { accessToken: ACCESS_1, refreshToken: REFRESH_1, user: USER });
    }
    return jsonResponse(200, { ok: true });
  };
  const loggedInUser = await api.login({
    login: "teacher-01",
    password: PASSWORD,
    deviceName: "Windows 教师机"
  });
  assert.equal(loggedInUser.id, USER_ID);
  const loginCall = calls.at(-1);
  assert.equal(loginCall.url, "https://classroom.example/api/v1/auth/login");
  assert.equal(loginCall.options.method, "POST");
  assert.equal(headersOf(loginCall).Authorization, undefined);
  assertMutationKey(loginCall);
  const loginBody = bodyOf(loginCall);
  assert.deepEqual(Object.keys(loginBody), ["login", "password", "deviceId", "deviceName"]);
  assert.equal(loginBody.login, "teacher-01");
  assert.equal(loginBody.password, PASSWORD);
  assert.equal(loginBody.deviceName, "Windows 教师机");
  assert.match(loginBody.deviceId, /^[0-9a-f]{64}$/);

  const localSnapshot = JSON.stringify(localStorage.dump());
  const sessionSnapshot = JSON.stringify(sessionStorage.dump());
  assert.doesNotMatch(localSnapshot, new RegExp(ACCESS_1));
  assert.doesNotMatch(localSnapshot, new RegExp(REFRESH_1.replaceAll(".", "\\.")));
  assert.doesNotMatch(localSnapshot, new RegExp(PASSWORD));
  assert.match(sessionSnapshot, new RegExp(ACCESS_1));
  assert.match(sessionSnapshot, new RegExp(REFRESH_1.replaceAll(".", "\\.")));
  assert.doesNotMatch(sessionSnapshot, new RegExp(PASSWORD));
  const publicStatus = JSON.stringify(api.status());
  assert.doesNotMatch(publicStatus, new RegExp(ACCESS_1));
  assert.doesNotMatch(publicStatus, new RegExp(REFRESH_1.replaceAll(".", "\\.")));
  assert.equal(api.status().authenticated, true);

  navigator.onLine = false;
  const queuedSync = await api.syncLearning(CLASS_ID, {
    profile: {
      clientEntityId: "profile-local-1",
      displayName: "学生",
      grade: "高一",
      curriculumVersion: "2026"
    },
    attempts: []
  });
  const duplicateQueuedSync = await api.syncLearning(CLASS_ID, {
    profile: {
      clientEntityId: "profile-local-1",
      displayName: "学生",
      grade: "高一",
      curriculumVersion: "2026"
    },
    attempts: []
  });
  assert.equal(queuedSync.queued, true);
  assert.equal(duplicateQueuedSync.queued, true);
  assert.equal(api.syncStatus().state, "waiting-sync");
  assert.equal(api.syncStatus().pending, 1);
  navigator.onLine = true;
  fetchHandler = async () => jsonResponse(200, {
    profileId: USER_ID,
    accepted: 0,
    duplicates: 0,
    conflicts: [],
    lastAcceptedAt: null
  });
  const flushed = await api.flushSyncQueue();
  assert.equal(flushed.pending, 0);
  assert.equal(api.syncStatus().state, "synced");

  const syncedVariantSet = {
    id: "variant-set-local-1",
    parentQuestionId: "question-parent-1",
    sourceContentHash: "0123456789abcdef",
    cacheKey: "question-parent-1:0123456789abcdef:variant_generation_v1:1.0.0",
    specVersion: "variant_generation_v1",
    generatorVersion: "1.0.0",
    status: "approved",
    updatedAt: "2026-08-20T12:00:00.000Z",
    variants: ["near", "reverse"].map((role) => ({
      id: `variant-${role}-1`,
      variantRole: role,
      title: role === "near" ? "近迁移" : "逆向迁移",
      content: "一辆小车做匀加速直线运动，请根据给定条件求末速度。",
      options: [],
      stage: "高中",
      grade: "高一",
      topic: "匀变速直线运动",
      knowledgePointId: "hs-kinematics-uniform-acceleration",
      questionType: "计算题",
      difficulty: "基础",
      changeSummary: "改变已知量和设问组合",
      relationToParent: "保持同一运动学模型",
      answer: "4 m/s",
      solution: "以小车为研究对象，使用 v=v0+at，统一单位后代入并检验量纲，得到 4 m/s。",
      solutionDetail: { overview: "建立匀变速直线运动模型" },
      validation: { passed: true, checks: ["unit", "dimension"] },
      approvalStatus: "system-validated"
    }))
  };
  navigator.onLine = false;
  const queuedVariants = await api.syncVariantSets(CLASS_ID, { sets: [syncedVariantSet] });
  const duplicateQueuedVariants = await api.syncVariantSets(CLASS_ID, { sets: [syncedVariantSet] });
  assert.equal(queuedVariants.queued, true);
  assert.equal(duplicateQueuedVariants.queued, true);
  assert.equal(api.syncStatus().pending, 1, "offline variant sync must deduplicate the same cache payload");
  navigator.onLine = true;
  fetchHandler = async (call) => {
    assert.equal(call.url, `https://classroom.example/api/v1/classes/${CLASS_ID}/variant-sets/sync`);
    return jsonResponse(200, { accepted: 1, duplicates: 0, items: [] });
  };
  const variantFlushed = await api.flushSyncQueue();
  assert.equal(variantFlushed.pending, 0);

  const routeStart = calls.length;
  fetchHandler = async (call) => {
    if (call.url.endsWith(`/v1/classes/${CLASS_ID}/invites`)) {
      return jsonResponse(201, {
        id: "invite-qa-0001",
        code: "I".repeat(22),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxUses: 1000
      });
    }
    return jsonResponse(200, { items: [], nextCursor: null });
  };
  await api.createClass({ name: "九年级一班", grade: "九年级", schoolLabel: "长沙示例学校" });
  await api.createClass({ name: "快速创建班级" });
  const quickCreate = calls.slice(routeStart).find((item) => item.url.endsWith("/v1/classes") && item.options.method === "POST" && bodyOf(item)?.name === "快速创建班级");
  assert.deepEqual(bodyOf(quickCreate), { name: "快速创建班级" });
  await api.listClasses({ cursor: CURSOR_ID });
  const inviteCreatedAfter = Date.now();
  await api.createInvite(CLASS_ID);
  await api.joinInvite("C".repeat(22));
  await api.listRoster(CLASS_ID, { cursor: CURSOR_ID });
  await api.listGroups(CLASS_ID);
  await api.createGroup(CLASS_ID, { name: "巩固组" });
  await api.updateMembership(MEMBERSHIP_ID, {
    status: "active",
    groupId: GROUP_ID,
    studentNumber: "2026001"
  });
  await api.createAssignment(CLASS_ID, {
    title: "专项练习",
    instructions: "完成后提交完成状态",
    targetType: "class",
    questionIds: ["q-1"],
    questionItems: [],
    knowledgePointKeys: ["topic:motion"],
    target: "完成 5 题并提交迁移记录",
    publish: true
  });
  await api.listVariantSets(CLASS_ID);
  const routeCalls = calls.slice(routeStart);
  assert.deepEqual(
    routeCalls.map((call) => [call.options.method, call.url]),
      [
        ["POST", "https://classroom.example/api/v1/classes"],
        ["POST", "https://classroom.example/api/v1/classes"],
        ["GET", `https://classroom.example/api/v1/classes?cursor=${CURSOR_ID}`],
      ["POST", `https://classroom.example/api/v1/classes/${CLASS_ID}/invites`],
      ["POST", "https://classroom.example/api/v1/invites/join"],
      ["GET", `https://classroom.example/api/v1/classes/${CLASS_ID}/roster?cursor=${CURSOR_ID}`],
      ["GET", `https://classroom.example/api/v1/classes/${CLASS_ID}/groups`],
      ["POST", `https://classroom.example/api/v1/classes/${CLASS_ID}/groups`],
      ["PATCH", `https://classroom.example/api/v1/memberships/${MEMBERSHIP_ID}`],
      ["POST", `https://classroom.example/api/v1/classes/${CLASS_ID}/assignments`],
      ["GET", `https://classroom.example/api/v1/classes/${CLASS_ID}/variant-sets`]
    ]
  );
  routeCalls.forEach((call) => {
    assert.equal(headersOf(call).Authorization, `Bearer ${ACCESS_1}`);
    if (call.options.method === "GET") assert.equal(headersOf(call)["Idempotency-Key"], undefined);
    else assertMutationKey(call);
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.cache, "no-store");
    assert.equal(call.options.referrerPolicy, "no-referrer");
  });
  assert.deepEqual(bodyOf(routeCalls[0]), {
    name: "九年级一班",
    grade: "九年级",
    schoolLabel: "长沙示例学校"
  });
  const inviteBody = bodyOf(routeCalls[3]);
  assert.equal(inviteBody.maxUses, 1000);
  const inviteLifetime = new Date(inviteBody.expiresAt).getTime() - inviteCreatedAfter;
  assert.ok(inviteLifetime >= 29 * 86400000 && inviteLifetime <= 30 * 86400000);
  assert.deepEqual(bodyOf(routeCalls[4]), { code: "C".repeat(22) });
  assert.deepEqual(bodyOf(routeCalls[7]), { name: "巩固组" });
  assert.deepEqual(bodyOf(routeCalls[8]), {
    status: "active",
    groupId: GROUP_ID,
    studentNumber: "2026001"
  });
  assert.deepEqual(bodyOf(routeCalls[9]), {
    title: "专项练习",
    instructions: "完成后提交完成状态",
    dueAt: null,
    targetType: "class",
    targetId: null,
    questionIds: ["q-1"],
    questionItems: [],
    knowledgePointKeys: ["topic:motion"],
    target: "完成 5 题并提交迁移记录",
    publish: true
  });

  let submissionPage = 0;
  fetchHandler = async (call) => {
    submissionPage += 1;
    if (submissionPage === 1) {
      assert.equal(call.url, `https://classroom.example/api/v1/classes/${CLASS_ID}/assignment-submissions`);
      return jsonResponse(200, { items: [{ id: "submission-page-1" }], nextCursor: CURSOR_ID });
    }
    assert.equal(call.url, `https://classroom.example/api/v1/classes/${CLASS_ID}/assignment-submissions?cursor=${CURSOR_ID}`);
    return jsonResponse(200, { items: [{ id: "submission-page-2" }], nextCursor: null });
  };
  const pagedSubmissions = await api.listClassSubmissions(CLASS_ID);
  assert.deepEqual(
    JSON.parse(JSON.stringify(pagedSubmissions)),
    { items: [{ id: "submission-page-1" }, { id: "submission-page-2" }], nextCursor: null, complete: true },
    "teacher analytics must receive every server submission page",
  );

  const refreshCalls = [];
  let protectedAttempts = 0;
  fetchHandler = async (call) => {
    refreshCalls.push(call);
    if (call.url.endsWith("/v1/auth/refresh")) {
      assert.deepEqual(bodyOf(call), { refreshToken: REFRESH_1 });
      return jsonResponse(200, { accessToken: ACCESS_2, refreshToken: REFRESH_2, user: USER });
    }
    if (call.url.endsWith(`/v1/classes/${CLASS_ID}/groups`) && call.options.method === "POST") {
      protectedAttempts += 1;
      if (protectedAttempts === 1) {
        return jsonResponse(401, {
          code: "invalid_access_token",
          message: "Access token is invalid",
          requestId: "qa-refresh-1"
        });
      }
      return jsonResponse(201, { id: GROUP_ID });
    }
    throw new Error("unexpected refresh test route");
  };
  await api.createGroup(CLASS_ID, "进阶组");
  assert.equal(refreshCalls.length, 3);
  assert.equal(headersOf(refreshCalls[0]).Authorization, `Bearer ${ACCESS_1}`);
  assert.equal(headersOf(refreshCalls[1]).Authorization, undefined);
  assert.equal(headersOf(refreshCalls[2]).Authorization, `Bearer ${ACCESS_2}`);
  assertMutationKey(refreshCalls[1]);
  assert.equal(
    headersOf(refreshCalls[0])["Idempotency-Key"],
    headersOf(refreshCalls[2])["Idempotency-Key"],
    "a protected mutation retry must retain its idempotency key"
  );

  fetchHandler = async () => jsonResponse(409, {
    code: "invite_exhausted",
    message: "<script>secret server detail</script>",
    requestId: "qa-safe-409"
  });
  await assert.rejects(
    api.joinInvite("D".repeat(22)),
    (error) => {
      assert.equal(error.code, "invite_exhausted");
      assert.equal(error.status, 409);
      assert.equal(error.requestId, "qa-safe-409");
      assert.match(error.message, /使用次数/);
      assert.doesNotMatch(error.message, /script|secret/i);
      return true;
    }
  );
  fetchHandler = async () => jsonResponse(400, {
    code: "<script>alert(1)</script>",
    message: "internal filesystem secret",
    requestId: "<unsafe>"
  });
  await assert.rejects(
    api.listClasses(),
    (error) => {
      assert.equal(error.code, "http_400");
      assert.equal(error.requestId, "");
      assert.doesNotMatch(error.message, /script|filesystem|secret/i);
      return true;
    }
  );
  fetchHandler = async () => { throw new Error("secret network implementation detail"); };
  await assert.rejects(api.listClasses(), (error) => {
    assert.equal(error.code, "network_error");
    assert.doesNotMatch(error.message, /secret|implementation/i);
    return true;
  });
  fetchHandler = async () => {
    const error = new Error("abort detail");
    error.name = "AbortError";
    throw error;
  };
  await assert.rejects(api.listClasses(), (error) => {
    assert.equal(error.code, "request_timeout");
    assert.match(error.message, /超时/);
    return true;
  });

  await assert.rejects(api.joinInvite("short"), /未识别到有效班级邀请码/);
  await assert.rejects(api.updateMembership(MEMBERSHIP_ID, {}), /至少需要修改/);
  await assert.rejects(
    api.updateMembership(MEMBERSHIP_ID, { role: "teacher" }),
    /不支持的字段/
  );

  const analytics = api.buildClassroomAnalytics({
    now: "2026-10-23T12:00:00.000Z",
    roster: [
      { id: "m-a", userId: "student-a", displayName: "学生甲", role: "student", status: "active", groupId: null },
      { id: "m-b", userId: "student-b", displayName: "学生乙", role: "student", status: "active", groupId: null },
      { id: "m-c", userId: "student-c", displayName: "已移出学生", role: "student", status: "removed", groupId: null },
    ],
    assignments: [{
      id: "assignment-1", title: "运动学三题", status: "published", targetType: "class", targetId: null,
      dueAt: "2026-10-22T12:00:00.000Z",
      questionItems: [
        { id: "q-1", knowledgePointId: "kp-motion", difficulty: "基础" },
        { id: "q-2", knowledgePointId: "kp-motion", difficulty: "进阶" },
        { id: "q-3", knowledgePointId: "kp-force", difficulty: "基础" },
      ],
    }],
    submissions: [
      { id: "s-a-v1", assignmentId: "assignment-1", studentUserId: "student-a", version: 1,
        status: "returned", reviewStatus: "returned", score: 40, submittedAt: "2026-10-20T10:00:00.000Z",
        perQuestionScores: [{ questionId: "q-1", score: 40 }, { questionId: "q-2", score: 30 }, { questionId: "q-3", score: 50 }] },
      { id: "s-a-v2", assignmentId: "assignment-1", studentUserId: "student-a", version: 2,
        status: "accepted", reviewStatus: "approved", score: 80, submittedAt: "2026-10-21T10:00:00.000Z",
        perQuestionScores: [{ questionId: "q-1", score: 80 }, { questionId: "q-2", score: null }, { questionId: "q-3", score: 90 }] },
      { id: "s-b-v1", assignmentId: "assignment-1", studentUserId: "student-b", version: 1,
        status: "submitted", reviewStatus: "pending", score: null, submittedAt: "2026-10-21T11:00:00.000Z",
        perQuestionScores: [] },
      { id: "s-c-v1", assignmentId: "assignment-1", studentUserId: "student-c", version: 1,
        status: "accepted", reviewStatus: "approved", score: 100, submittedAt: "2026-10-21T12:00:00.000Z",
        perQuestionScores: [{ questionId: "q-1", score: 100 }] },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(analytics.classSummary)), {
    activeStudentCount: 2,
    publishedAssignmentCount: 1,
    latestSubmissionCount: 2,
    gradedSubmissionCount: 1,
    pendingReviewCount: 1,
    overdueUnsubmittedCount: 0,
  });
  assert.equal(analytics.assignments[0].submittedCount, 2);
  assert.equal(analytics.assignments[0].gradedCount, 1);
  assert.equal(analytics.assignments[0].averageScore, 80);
  assert.deepEqual(JSON.parse(JSON.stringify(analytics.assignments[0].gradedSubmissionIds)), ["s-a-v2"]);
  assert.deepEqual(JSON.parse(JSON.stringify(analytics.assignments[0].pendingSubmissionIds)), ["s-b-v1"]);
  assert.equal(analytics.students.find((item) => item.userId === "student-a").correctionCount, 1);
  assert.equal(analytics.students.find((item) => item.userId === "student-b").averageScore, null,
    "pending manual review must not enter the score average");
  assert.deepEqual(JSON.parse(JSON.stringify(analytics.knowledgePoints.find((item) => item.knowledgePointId === "kp-motion"))), {
    knowledgePointId: "kp-motion", scoredCount: 1, averageScore: 80,
    evidenceStatus: "insufficient", latestEvidenceAt: "2026-10-21T10:00:00.000Z",
    evidenceIds: ["s-a-v2:q-1"],
  });
  assert.equal(analytics.knowledgePoints.find((item) => item.knowledgePointId === "kp-force").scoredCount, 1);

  const deviceIdBeforeLogout = loginBody.deviceId;
  fetchHandler = async (call) => {
    if (call.url.endsWith("/v1/auth/logout")) return jsonResponse(204);
    if (call.url.endsWith("/v1/auth/login")) {
      return jsonResponse(200, { accessToken: ACCESS_1, refreshToken: REFRESH_1, user: USER });
    }
    throw new Error("unexpected session-boundary route");
  };
  await api.logout();
  const logoutCall = calls.at(-1);
  assert.equal(logoutCall.url, "https://classroom.example/api/v1/auth/logout");
  assert.deepEqual(bodyOf(logoutCall), { refreshToken: REFRESH_2 });
  assertMutationKey(logoutCall);
  assert.equal(api.status().authenticated, false);
  await api.login({ login: "teacher-01", password: PASSWORD, deviceName: "Windows 教师机" });
  const secondLoginBody = bodyOf(calls.at(-1));
  assert.equal(secondLoginBody.deviceId, deviceIdBeforeLogout, "device ID must remain stable");
  api.configure("https://classroom-two.example");
  assert.equal(api.status().authenticated, false, "changing servers must clear the session");

  console.log(JSON.stringify({
    status: "passed",
    apiVersion: api.version,
    defaultServerUrl: "unconfigured",
    verifiedRoutes: routeCalls.length,
    mutationKeysVerified: routeCalls.filter((call) => call.options.method !== "GET").length + 4,
    stableDeviceIdLength: deviceIdBeforeLogout.length,
    persistentStorageContainsTokens: false,
    passwordStored: false,
    automaticRefreshVerified: true,
    unsafeErrorDetailsExposed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
