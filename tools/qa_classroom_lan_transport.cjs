const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const CLASS_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";
const CODE = "abcdefghijklmnopqrstuv";
const ACCESS_TOKEN = "a".repeat(100);
const REFRESH_TOKEN = `r1.${USER_ID}.${"R".repeat(43)}`;

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function loadClient({ initial = {}, native, webview, android } = {}) {
  const localStorage = new MemoryStorage(initial);
  const sessionStorage = new MemoryStorage();
  const window = {
    localStorage,
    sessionStorage,
    crypto: webcrypto,
    fetch: async () => { throw new TypeError("fetch must not handle private LAN HTTP"); },
    PhysicsStudioClassroomNative: native,
    PhysicsStudioAndroid: android,
    chrome: webview ? { webview } : undefined,
    PHYSICS_STUDIO_ALLOW_INSECURE_LAN: true,
  };
  const context = vm.createContext({
    window,
    localStorage,
    navigator: { onLine: true },
    location: {
      protocol: "https:",
      origin: "https://appassets.androidplatform.net",
      hostname: "appassets.androidplatform.net",
    },
    PhysicsStudioClassroomNative: native,
    PhysicsStudioAndroid: android,
    chrome: webview ? { webview } : undefined,
    PHYSICS_STUDIO_ALLOW_INSECURE_LAN: true,
    console,
    URL,
    AbortController,
    Uint8Array,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(fs.readFileSync(path.join(root, "storage-repository.js"), "utf8"), context, {
    filename: "storage-repository.js",
  });
  window.PhysicsStudioStorageRepository = context.PhysicsStudioStorageRepository;
  vm.runInContext(fs.readFileSync(path.join(root, "classroom-client.js"), "utf8"), context, {
    filename: "classroom-client.js",
  });
  return { api: window.PhysicsStudioClassroom, localStorage, sessionStorage, context };
}

function authPayload(serverUrl) {
  return {
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    user: {
      id: USER_ID,
      role: "student",
      displayName: "同学",
      status: "active",
      mustChangePassword: false,
      deletionPending: false,
    },
    class: {
      id: CLASS_ID,
      name: "高三物理一班",
      grade: "高三",
      subject: "物理",
      status: "active",
    },
    membership: { id: MEMBERSHIP_ID, classId: CLASS_ID, role: "student", status: "active" },
    serverUrl,
  };
}

async function main() {
  for (const staleUrl of [
    "http://127.0.0.1:8787",
    "http://localhost:8787",
    "https://appassets.androidplatform.net",
  ]) {
    const learningSentinel = JSON.stringify({ attempts: [{ id: "attempt-preserved" }] });
    const { api, localStorage } = loadClient({
      initial: {
        "physics-classroom-config-v1": JSON.stringify({ serverUrl: staleUrl }),
        "physics-learning-state-v9": learningSentinel,
        "physics-studio-activation-v1": "activation-preserved",
      },
    });
    assert.equal(api.status().serverUrl, "", `${staleUrl} must not survive the migration`);
    assert.equal(localStorage.getItem("physics-learning-state-v9"), learningSentinel);
    assert.equal(localStorage.getItem("physics-studio-activation-v1"), "activation-preserved");
  }

  const qrServer = "http://192.168.1.20:8788";
  const qr = `physicsstudio://join?class_id=${CLASS_ID}&code=${CODE}&server=${encodeURIComponent(qrServer)}`;
  const parsedClient = loadClient().api;
  assert.deepEqual(
    { ...parsedClient.parseInvitePayload(qr) },
    { classId: CLASS_ID, code: CODE, serverUrl: qrServer },
  );
  assert.throws(
    () => parsedClient.parseInvitePayload(
      `physicsstudio://join?class_id=${CLASS_ID}&code=${CODE}&server=${encodeURIComponent("http://8.8.8.8:8788")}`,
    ),
    (error) => error?.code === "invalid_invite_code",
  );

  let windowsListener = null;
  const windowsMessages = [];
  const webview = {
    addEventListener(type, listener) {
      if (type === "message") windowsListener = listener;
    },
    postMessage(message) {
      windowsMessages.push(JSON.parse(message));
      const request = windowsMessages.at(-1);
      setTimeout(() => windowsListener({
        data: {
          channel: "physics-studio-classroom",
          requestId: request.requestId,
          ok: true,
          result: { services: ["http://192.168.1.21:8788"] },
        },
      }), 0);
    },
  };
  const windowsClient = loadClient({ webview });
  assert.deepEqual(
    [...(await windowsClient.api.discoverServices())],
    ["http://192.168.1.21:8788"],
  );
  assert.equal(windowsMessages[0].channel, "physics-studio-classroom");
  assert.equal(windowsMessages[0].action, "discover");

  const androidMessages = [];
  let deliverAndroid = null;
  const androidBridge = {
    discoverClassroomServices(requestId) {
      androidMessages.push({ action: "discover", requestId });
      setTimeout(() => deliverAndroid({
        channel: "physics-studio-classroom",
        requestId,
        ok: true,
        result: { services: ["http://192.168.1.22:8788"] },
      }), 0);
    },
    classroomRequest(requestId, payloadJson) {
      androidMessages.push({ action: "request", requestId, payload: JSON.parse(payloadJson) });
      setTimeout(() => deliverAndroid({
        channel: "physics-studio-classroom",
        requestId,
        ok: true,
        result: { status: 200, bodyText: JSON.stringify({ status: "ok" }) },
      }), 0);
    },
  };
  const androidClient = loadClient({ android: androidBridge });
  deliverAndroid = (message) => androidClient.context.PhysicsStudioClassroomNativeResponse(message);
  assert.deepEqual(
    [...(await androidClient.api.discoverServices())],
    ["http://192.168.1.22:8788"],
  );
  androidClient.api.configure({ serverUrl: "http://192.168.1.22:8788" });
  assert.equal((await androidClient.api.checkHealth()).status, "ok");
  assert.equal(androidMessages[0].action, "discover");
  assert.equal(androidMessages[1].action, "request");
  assert.equal(androidMessages[1].payload.path, "/health/live");

  const localServer = "http://127.0.0.1:8788";
  const localClassId = "44444444-4444-4444-8444-444444444444";
  const localOwnerId = "55555555-5555-4555-8555-555555555555";
  const localOwnerCapability = `oc1.${"O".repeat(43)}`;
  const createCalls = [];
  const creator = loadClient({
    native: {
      hostedServices() {
        return { serverUrl: localServer, services: [localServer, "http://192.168.1.22:8788"] };
      },
      async discover() { throw new Error("local teacher creation must not wait for UDP discovery"); },
      async request(input) {
        createCalls.push(input);
        assert.equal(input.serverUrl, localServer);
        assert.equal(input.method, "POST");
        if (input.path === "/v1/classes/anonymous") {
          return {
            status: 201,
            bodyText: JSON.stringify({
              class: {
                id: localClassId,
                name: "高三物理一班",
                grade: "未设置",
                subject: "物理",
                status: "active",
              },
              ownerUserId: localOwnerId,
              ownerCapability: localOwnerCapability,
              ownerCapabilityExpiresAt: "2036-08-11T00:00:00.000Z",
            }),
          };
        }
        if (input.path === `/v1/classes/${localClassId}/invites`) {
          assert.equal(input.headers.Authorization, `Owner ${localOwnerCapability}`);
          return {
            status: 201,
            bodyText: JSON.stringify({
              id: "66666666-6666-4666-8666-666666666666",
              code: CODE,
              expiresAt: "2036-09-01T00:00:00.000Z",
              maxUses: 1000,
            }),
          };
        }
        if (input.path === `/v1/classes/${localClassId}/assignments`) {
          assert.equal(input.headers.Authorization, `Owner ${localOwnerCapability}`);
          return {
            status: 201,
            bodyText: JSON.stringify({
              id: "77777777-7777-4777-8777-777777777777",
              classId: localClassId,
              title: "局域网专项任务",
              status: "published",
            }),
          };
        }
        throw new Error(`unexpected create flow path ${input.path}`);
      },
    },
  });
  const createdClass = await creator.api.createClass({ name: " 高三物理一班 " });
  assert.equal(createdClass.id, localClassId, "Android teacher flow must create on its local host immediately");
  assert.equal(createCalls.length, 1);
  assert.equal(creator.api.status().serverUrl, localServer);
  const localInvite = await creator.api.createInvite(localClassId);
  assert.ok(localInvite.joinUrl.length <= 108, "the structured join payload must fit the verified QR encoder");
  assert.match(localInvite.joinUrl, /[?&]s=192\.168\.1\.22(?:&|$)/,
    "a Windows-hosted QR must advertise the reachable LAN address, not loopback");
  assert.equal(creator.api.parseInvitePayload(localInvite.joinUrl).serverUrl, "http://192.168.1.22:8788");
  assert.equal(createCalls.length, 2);
  const localAssignment = await creator.api.createAssignment(localClassId, {
    title: "局域网专项任务",
    instructions: "完成后提交",
    targetType: "class",
    target: "独立完成",
    publish: true,
  });
  assert.equal(localAssignment.queued, false, "local owners must send assignments instead of leaving them queued");
  assert.equal(createCalls.length, 3);

  const requestCalls = [];
  const servers = ["http://192.168.1.10:8788", qrServer];
  const native = {
    async discover() { return { services: servers }; },
    async request(input) {
      requestCalls.push(input);
      assert.equal(input.path, "/v1/invites/join-anonymous");
      if (input.serverUrl === servers[0]) {
        return { status: 404, bodyText: JSON.stringify({ code: "invite_not_found", requestId: "qa-first" }) };
      }
      if (input.serverUrl === servers[1]) {
        return { status: 200, bodyText: JSON.stringify(authPayload(servers[1])) };
      }
      throw new Error(`unexpected server ${input.serverUrl}`);
    },
  };
  const discovered = loadClient({ native });
  assert.deepEqual([...(await discovered.api.discoverServices())], servers);
  const joined = await discovered.api.joinClassByInviteCode({ code: CODE, displayName: "同学" });
  assert.equal(joined.class.id, CLASS_ID);
  assert.equal(requestCalls.length, 2, "invite_not_found may advance to the next discovered host");
  assert.equal(discovered.api.status().serverUrl, qrServer, "the confirmed host becomes the active server");
  assert.equal(
    JSON.parse(discovered.localStorage.getItem("physics-classroom-config-v1")).serverUrl,
    qrServer,
  );

  const unavailable = loadClient({
    native: {
      async discover() { return { services: ["http://192.168.1.30:8788"] }; },
      async request() { throw Object.assign(new Error("offline"), { code: "network_error" }); },
    },
  });
  await assert.rejects(
    unavailable.api.joinClassByInviteCode({ code: CODE, displayName: "同学" }),
    (error) => error?.code === "network_error",
  );
  assert.equal(unavailable.localStorage.getItem("physics-classroom-config-v1"), null);
  assert.equal(unavailable.sessionStorage.getItem("physics-classroom-access-token-v1"), null);

  console.log(JSON.stringify({
    status: "passed",
    staleUrlsMigrated: 3,
    privateQrServerValidated: true,
    createAfterDiscovery: true,
    immediateAndroidHostCreate: true,
    ownerAssignmentDelivery: true,
    discoveryFallback: true,
    noUnconfirmedJoinPersistence: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
