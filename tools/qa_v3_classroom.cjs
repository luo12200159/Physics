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
const accessToken = `access.${"x".repeat(100)}`;
const refreshToken = `r1.33333333-3333-4333-8333-333333333333.${"r".repeat(43)}`;
class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } };
}
const storage = new MemoryStorage();
const calls = [];
const window = {
  localStorage: storage,
  sessionStorage: new MemoryStorage(),
  crypto: webcrypto,
  fetch: async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/v1/classes/anonymous")) {
      return response(201, {
        class: { id: classId, name: "  高三物理一班  ", grade: "高三", subject: "物理", status: "active" },
        ownerUserId,
        ownerCapability: ownerToken,
        ownerCapabilityExpiresAt: "2099-01-01T00:00:00.000Z"
      });
    }
    if (String(url).endsWith(`/v1/classes/${classId}/invites`)) {
      return response(201, { id: "invite-1", code: inviteCode, classId });
    }
    if (String(url).endsWith("/v1/invites/join-anonymous")) {
      return response(201, {
        accessToken,
        refreshToken,
        user: {
          id: "44444444-4444-4444-8444-444444444444",
          role: "student",
          displayName: "测试学生",
          status: "active",
          mustChangePassword: false,
          deletionPending: false
        },
        membershipId: "55555555-5555-4555-8555-555555555555",
        classId,
        status: "pending"
      });
    }
    if (String(url).endsWith("/v1/classes")) return response(200, { items: [], nextCursor: null });
    return response(200, { ok: true });
  },
  PHYSICS_STUDIO_CLASSROOM_URL: "https://classroom.example"
};
const context = vm.createContext({ window, PHYSICS_STUDIO_CLASSROOM_URL: "https://classroom.example", localStorage: storage, navigator: { onLine: true }, console, URL, AbortController, Uint8Array, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(path.join(root, "storage-repository.js"), "utf8"), context);
window.PhysicsStudioStorageRepository = context.PhysicsStudioStorageRepository;
vm.runInContext(fs.readFileSync(path.join(root, "classroom-client.js"), "utf8"), context, { filename: "classroom-client.js" });
const api = window.PhysicsStudioClassroom;

async function main() {
  const created = await api.createClass({ name: "  高三物理一班  " });
  assert.equal(created.id, classId);
  assert.equal(api.status().ownerAuthenticated, true);
  assert.equal(api.status().syncMode, "online-first");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  const invite = await api.createInvite(classId);
  assert.equal(invite.classId, classId);
  assert.equal(invite.joinUrl, `physicsstudio://join?c=${classId}&i=${inviteCode}&h=classroom.example`);
  assert.match(invite.joinUrl, /[?&]c=/);
  assert.match(invite.joinUrl, /[?&]i=/);
  assert.doesNotMatch(invite.joinUrl, /oc1\./);
  assert.equal(calls[1].options.headers.Authorization, `Owner ${ownerToken}`);
  await api.listClasses();
  assert.equal(calls[2].options.headers.Authorization, `Owner ${ownerToken}`);
  const joined = await api.joinInvite({ code: inviteCode, displayName: "测试学生" });
  assert.equal(joined.classId, classId);
  assert.equal(api.status().user.role, "student");
  assert.match(calls[3].url, /join-anonymous$/);
  assert.equal(calls[3].options.headers.Authorization, undefined, "owner capability must never be sent to student join");

  const shell = fs.readFileSync(path.join(root, "experience-shell.js"), "utf8");
  const clientSource = fs.readFileSync(path.join(root, "classroom-client.js"), "utf8");
  const classService = fs.readFileSync(path.join(root, "server", "src", "modules", "classes", "service.ts"), "utf8");
  const policy = fs.readFileSync(path.join(root, "server", "src", "modules", "authorization", "policy.ts"), "utf8");
  assert.match(clientSource, /physicsstudio:\/\/join\?c=/);
  assert.match(shell, /data-classroom-action="refresh-invite"/);
  assert.match(shell, /status\.ownerAuthenticated/);
  assert.doesNotMatch(classService, /actor\.role\s*!==\s*"teacher"[\s\S]{0,180}Only teachers can create classes/);
  assert.match(classService, /createAnonymousClass/);
  assert.match(policy, /actor\.role\s*!==\s*"parent"\s*&&\s*resource\.ownerTeacherId\s*===\s*actor\.userId/);

  console.log(JSON.stringify({ status: "passed", anonymousCreate: true, ownerScope: true, studentBoundary: true, deepLink: true }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
