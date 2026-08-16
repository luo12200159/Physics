const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const classId = "22222222-2222-4222-8222-222222222222";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const ownerToken = `oc1.${"A".repeat(43)}`;
const inviteCode = "C".repeat(22);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
  dump() { return [...this.values.entries()]; }
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body == null ? "" : JSON.stringify(body); },
  };
}

function makeClient({ explicitUrl = "", allowLanHttp = false, fetchImpl } = {}) {
  const storage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const window = {
    localStorage: storage,
    sessionStorage,
    crypto: webcrypto,
    fetch: fetchImpl || (async () => { throw new TypeError("network unavailable"); }),
    PHYSICS_STUDIO_CLASSROOM_URL: explicitUrl,
    PHYSICS_STUDIO_ALLOW_INSECURE_LAN: allowLanHttp,
  };
  const context = vm.createContext({
    window,
    PHYSICS_STUDIO_CLASSROOM_URL: explicitUrl,
    PHYSICS_STUDIO_ALLOW_INSECURE_LAN: allowLanHttp,
    localStorage: storage,
    navigator: { onLine: true },
    console,
    URL,
    AbortController,
    Uint8Array,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(fs.readFileSync(path.join(root, "storage-repository.js"), "utf8"), context);
  window.PhysicsStudioStorageRepository = context.PhysicsStudioStorageRepository;
  vm.runInContext(fs.readFileSync(path.join(root, "classroom-client.js"), "utf8"), context, {
    filename: "classroom-client.js",
  });
  return { api: window.PhysicsStudioClassroom, storage, sessionStorage };
}

async function main() {
  const unconfigured = makeClient();
  assert.equal(unconfigured.api.status().serverUrl, "");
  assert.equal(unconfigured.api.status().serviceConfigured, false);
  await assert.rejects(
    unconfigured.api.createClass({ name: "未配置服务班级" }),
    (error) => error?.code === "service_not_configured",
  );
  assert.equal(
    unconfigured.storage.getItem("physics-classroom-local-classes-v1"),
    null,
    "a failed server operation must not create a local multiplayer class",
  );

  const offline = makeClient({ explicitUrl: "https://classroom.example" });
  offline.storage.setItem("physics-learning-state", "preserve-me");
  await assert.rejects(
    offline.api.createClass({ name: "网络失败班级" }),
    (error) => error?.code === "network_error",
  );
  assert.equal(offline.storage.getItem("physics-learning-state"), "preserve-me");
  assert.equal(offline.storage.getItem("physics-classroom-local-classes-v1"), null);
  assert.equal(offline.storage.getItem("physics-classroom-owner-capabilities-v1"), null);

  const production = makeClient({ explicitUrl: "https://classroom.example" });
  assert.throws(
    () => production.api.configure("http://192.168.1.20:8788"),
    (error) => error?.code === "insecure_server_url",
  );
  const development = makeClient({
    explicitUrl: "http://192.168.1.20:8788",
    allowLanHttp: true,
  });
  assert.equal(development.api.status().serverUrl, "http://192.168.1.20:8788");

  const calls = [];
  const online = makeClient({
    explicitUrl: "https://classroom.example",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/health/live")) {
        return response(200, { status: "ok", service: "physics-studio-business" });
      }
      if (String(url).endsWith("/v1/classes/anonymous")) {
        return response(201, {
          class: {
            id: classId,
            name: "高三物理一班",
            grade: "高一",
            subject: "物理",
            schoolLabel: null,
            status: "active",
            revision: 1,
            createdAt: "2026-08-11T00:00:00.000Z",
            updatedAt: "2026-08-11T00:00:00.000Z",
          },
          ownerUserId,
          ownerCapability: ownerToken,
          ownerCapabilityExpiresAt: "2099-01-01T00:00:00.000Z",
        });
      }
      if (String(url).endsWith(`/v1/classes/${classId}/invites`)) {
        return response(201, {
          id: "33333333-3333-4333-8333-333333333333",
          code: inviteCode,
          expiresAt: "2099-01-01T00:00:00.000Z",
          maxUses: 1000,
        });
      }
      if (String(url).endsWith(`/v1/classes/${classId}`) && options.method === "DELETE") {
        return response(200, { id: classId, status: "archived" });
      }
      throw new Error(`unexpected request: ${url}`);
    },
  });
  assert.equal((await online.api.checkHealth()).status, "ok");
  const created = await online.api.createClass({ name: "高三物理一班" });
  assert.equal(created.id, classId);
  const invite = await online.api.createInvite(classId);
  assert.equal(invite.code, inviteCode);
  assert.equal(
    invite.joinUrl,
    `physicsstudio://join?c=${classId}&i=${inviteCode}&h=classroom.example`,
  );
  assert.deepEqual(
    { ...online.api.parseInvitePayload(invite.joinUrl) },
    { classId, code: inviteCode, serverUrl: "https://classroom.example" },
  );
  assert.deepEqual(
    { ...online.api.parseInvitePayload(inviteCode) },
    { classId: "", code: inviteCode, serverUrl: "" },
  );
  assert.doesNotMatch(invite.joinUrl, /oc1\.|owner|token/i);
  await online.api.deleteClass(classId);
  const deleteCall = calls.at(-1);
  assert.equal(deleteCall.options.headers.Authorization, `Owner ${ownerToken}`);
  assert.match(deleteCall.options.headers["Idempotency-Key"], /^[\x20-\x7e]{16,128}$/);

  const source = fs.readFileSync(path.join(root, "classroom-client.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const windowsBuild = fs.readFileSync(path.join(root, "tools", "build_release.ps1"), "utf8");
  const androidBuild = fs.readFileSync(path.join(root, "android", "tools", "build_android.ps1"), "utf8");
  const installer = fs.readFileSync(path.join(root, "Installer.cs"), "utf8");
  const launcher = fs.readFileSync(path.join(root, "Launcher.cs"), "utf8");
  assert.doesNotMatch(source, /return\s+createLocalClass\s*\(/);
  assert.doesNotMatch(source, /return\s+createLocalInvite\s*\(/);
  assert.doesNotMatch(source, /return\s+"http:\/\/127\.0\.0\.1:8787"/);
  assert.ok(index.indexOf('src="classroom-config.js"') < index.indexOf('src="classroom-client.js"'));
  assert.match(windowsBuild, /ClassroomServerUrl/);
  assert.match(windowsBuild, /PhysicsStudio\.Payload\.ClassroomConfig/);
  assert.match(androidBuild, /classroom-config\.js/);
  assert.match(androidBuild, /ClassroomServerUrl/);
  assert.match(installer, /PhysicsStudio\.Payload\.ClassroomConfig/);
  assert.match(launcher, /"classroom-config\.js"/);
  console.log(JSON.stringify({
    status: "passed",
    unconfiguredIsExplicit: true,
    noFakeOfflineClass: true,
    lanHttpRequiresOptIn: true,
    ownerScopedDelete: true,
    qrPayloadContainsNoSecret: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
