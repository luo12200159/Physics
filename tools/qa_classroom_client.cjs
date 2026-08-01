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
  const context = vm.createContext({
    window,
    console,
    URL,
    AbortController,
    Uint8Array,
    setTimeout,
    clearTimeout
  });
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
      "version", "configure", "status", "login", "logout", "createClass",
      "listClasses", "createInvite", "joinInvite", "listRoster", "listGroups",
      "createGroup", "updateMembership"
    ]
  );
  assert.equal(api.register, undefined, "client must not expose account registration");
  assert.equal(api.status().serverUrl, "http://127.0.0.1:8787");
  assert.equal(api.status().authenticated, false);

  assert.throws(() => api.configure("http://classroom.example"), /HTTPS/);
  assert.throws(() => api.configure("http://[::1]:8787"), /HTTPS/);
  assert.throws(() => api.configure("https://admin:secret@classroom.example"), /不能包含账号/);
  assert.throws(() => api.configure("https://classroom.example?token=secret"), /不能包含查询参数/);
  assert.equal(api.configure("http://localhost:8787/").serverUrl, "http://localhost:8787");
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

  const routeStart = calls.length;
  fetchHandler = async () => jsonResponse(200, { items: [], nextCursor: null });
  await api.createClass({ name: "九年级一班", grade: "九年级", schoolLabel: "长沙示例学校" });
  await api.listClasses({ cursor: CURSOR_ID });
  await api.createInvite(CLASS_ID, { expiresAt: "2026-08-02T12:00:00.000Z", maxUses: 30 });
  await api.joinInvite("C".repeat(22));
  await api.listRoster(CLASS_ID, { cursor: CURSOR_ID });
  await api.listGroups(CLASS_ID);
  await api.createGroup(CLASS_ID, { name: "巩固组" });
  await api.updateMembership(MEMBERSHIP_ID, {
    status: "active",
    groupId: GROUP_ID,
    studentNumber: "2026001"
  });
  const routeCalls = calls.slice(routeStart);
  assert.deepEqual(
    routeCalls.map((call) => [call.options.method, call.url]),
    [
      ["POST", "https://classroom.example/api/v1/classes"],
      ["GET", `https://classroom.example/api/v1/classes?cursor=${CURSOR_ID}`],
      ["POST", `https://classroom.example/api/v1/classes/${CLASS_ID}/invites`],
      ["POST", "https://classroom.example/api/v1/invites/join"],
      ["GET", `https://classroom.example/api/v1/classes/${CLASS_ID}/roster?cursor=${CURSOR_ID}`],
      ["GET", `https://classroom.example/api/v1/classes/${CLASS_ID}/groups`],
      ["POST", `https://classroom.example/api/v1/classes/${CLASS_ID}/groups`],
      ["PATCH", `https://classroom.example/api/v1/memberships/${MEMBERSHIP_ID}`]
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
    subject: "物理",
    schoolLabel: "长沙示例学校"
  });
  assert.deepEqual(bodyOf(routeCalls[2]), {
    expiresAt: "2026-08-02T12:00:00.000Z",
    maxUses: 30
  });
  assert.deepEqual(bodyOf(routeCalls[3]), { code: "C".repeat(22) });
  assert.deepEqual(bodyOf(routeCalls[6]), { name: "巩固组" });
  assert.deepEqual(bodyOf(routeCalls[7]), {
    status: "active",
    groupId: GROUP_ID,
    studentNumber: "2026001"
  });

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

  await assert.rejects(api.joinInvite("short"), /格式不正确/);
  await assert.rejects(api.updateMembership(MEMBERSHIP_ID, {}), /至少需要修改/);
  await assert.rejects(
    api.updateMembership(MEMBERSHIP_ID, { role: "teacher" }),
    /不支持的字段/
  );

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
    defaultServerUrl: "http://127.0.0.1:8787",
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
