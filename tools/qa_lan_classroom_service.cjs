const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const dgram = require("node:dgram");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "LanClassroomService.cs");
const cscCandidates = [
  "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
  "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER_RE = /^oc1\.[A-Za-z0-9_-]{43}$/;
const INVITE_RE = /^[A-Za-z0-9_-]{22}$/;
const DEVICE_A = "a".repeat(64);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForFile(file, timeoutMs = 10_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (fs.existsSync(file)) return resolve(JSON.parse(fs.readFileSync(file, "utf8")));
      if (Date.now() - started > timeoutMs) return reject(new Error("LAN service readiness timeout"));
      setTimeout(poll, 40);
    };
    poll();
  });
}

async function request(baseUrl, method, route, { body, authorization, idempotencyKey } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authorization) headers.Authorization = authorization;
  if (method !== "GET" && method !== "HEAD") {
    headers["Idempotency-Key"] = idempotencyKey || `qa-${crypto.randomUUID()}`;
  }
  let response;
  try {
    response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    throw new Error(`${method} ${route}: ${error.message}`, { cause: error });
  }
  const text = await response.text();
  let parsed = null;
  if (text) parsed = JSON.parse(text);
  return { status: response.status, body: parsed, text };
}

async function discover(port, nonce) {
  const socket = dgram.createSocket("udp4");
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("UDP discovery timeout")), 3_000);
    socket.once("message", (message) => {
      clearTimeout(timer);
      resolve(JSON.parse(message.toString("utf8")));
    });
    socket.once("error", reject);
  });
  await new Promise((resolve, reject) => {
    socket.send(Buffer.from(`PHYSICS_STUDIO_CLASSROOM_DISCOVER_V1:${nonce}`), port, "127.0.0.1", (error) => {
      if (error) reject(error); else resolve();
    });
  });
  try { return await result; } finally { socket.close(); }
}

async function startService(exe, dataDir, port, discoveryPort, readyFile) {
  if (fs.existsSync(readyFile)) fs.rmSync(readyFile, { force: true });
  const child = childProcess.spawn(exe, [
    "--bind", "127.0.0.1",
    "--port", String(port),
    "--discovery-port", String(discoveryPort),
    "--data-dir", dataDir,
    "--ready-file", readyFile,
  ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.once("exit", (code) => {
    if (code && !fs.existsSync(readyFile)) process.stderr.write(`LAN service exited ${code}: ${stderr}\n`);
  });
  const ready = await waitForFile(readyFile);
  assert.equal(ready.status, "ok");
  assert.equal(ready.port, port);
  return child;
}

async function main() {
  assert.equal(fs.existsSync(source), true, "LanClassroomService.cs must exist before the service can be tested");
  const csc = cscCandidates.find(fs.existsSync);
  assert.ok(csc, "the .NET Framework C# compiler is required");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "physics-lan-classroom-"));
  const exe = path.join(temp, "lan-classroom-test.exe");
  const dataDir = path.join(temp, "data");
  const readyFile = path.join(temp, "ready.json");
  const compile = childProcess.spawnSync(csc, [
    "/nologo",
    "/target:exe",
    "/optimize+",
    "/codepage:65001",
    "/reference:System.Web.Extensions.dll",
    `/out:${exe}`,
    source,
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);

  const port = await freePort();
  const discoveryPort = await freePort();
  let child = await startService(exe, dataDir, port, discoveryPort, readyFile);
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await request(base, "GET", "/health/live");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: "ok", service: "physics-studio-lan-classroom", protocolVersion: 1 });

    const createdA = await request(base, "POST", "/v1/classes/anonymous", {
      body: { name: "  高三物理一班  " },
    });
    assert.equal(createdA.status, 201);
    assert.equal(createdA.body.class.name, "高三物理一班");
    assert.match(createdA.body.class.id, UUID_RE);
    assert.match(createdA.body.ownerUserId, UUID_RE);
    assert.match(createdA.body.ownerCapability, OWNER_RE);

    const createdB = await request(base, "POST", "/v1/classes/anonymous", {
      body: { name: "高三物理一班" },
    });
    assert.equal(createdB.status, 201);
    assert.notEqual(createdB.body.class.id, createdA.body.class.id, "duplicate names use different class IDs");

    const ownerA = `Owner ${createdA.body.ownerCapability}`;
    const ownerB = `Owner ${createdB.body.ownerCapability}`;
    const forbiddenDelete = await request(base, "DELETE", `/v1/classes/${createdA.body.class.id}`, {
      authorization: ownerB,
    });
    assert.equal(forbiddenDelete.status, 403);
    assert.equal(forbiddenDelete.body.code, "resource_forbidden");

    const invite1 = await request(base, "POST", `/v1/classes/${createdA.body.class.id}/invites`, {
      authorization: ownerA,
      body: { maxUses: 1000, expiresAt: "2099-01-01T00:00:00.000Z" },
    });
    assert.equal(invite1.status, 201);
    assert.match(invite1.body.code, INVITE_RE);
    assert.doesNotMatch(JSON.stringify(invite1.body), /oc1\.|ownerCapability/);

    const joined1 = await request(base, "POST", "/v1/invites/join-anonymous", {
      body: { code: invite1.body.code, displayName: "学生甲", deviceId: DEVICE_A },
    });
    assert.equal(joined1.status, 200);
    assert.equal(joined1.body.user.role, "student");
    assert.equal(joined1.body.class.id, createdA.body.class.id);
    assert.match(joined1.body.membership.id, UUID_RE);
    assert.doesNotMatch(JSON.stringify(joined1.body), /oc1\.|ownerCapability/);

    const joinedAgain = await request(base, "POST", "/v1/invites/join-anonymous", {
      body: { code: invite1.body.code, displayName: "学生甲", deviceId: DEVICE_A },
    });
    assert.equal(joinedAgain.status, 200);
    assert.equal(joinedAgain.body.membership.id, joined1.body.membership.id);

    const assignment = await request(base, "POST", `/v1/classes/${createdA.body.class.id}/assignments`, {
      authorization: ownerA,
      body: {
        title: "同网专项任务",
        instructions: "完成后提交",
        dueAt: null,
        targetType: "class",
        targetId: null,
        questionIds: ["q-1"],
        knowledgePointKeys: ["kp-force"],
        target: "独立完成",
        publish: true,
      },
    });
    assert.equal(assignment.status, 201);
    assert.match(assignment.body.id, UUID_RE);
    const studentAssignments = await request(base, "GET", `/v1/classes/${createdA.body.class.id}/assignments`, {
      authorization: `Bearer ${joinedAgain.body.accessToken}`,
    });
    assert.equal(studentAssignments.status, 200);
    assert.equal(studentAssignments.body.items.length, 1);
    assert.equal(studentAssignments.body.items[0].title, "同网专项任务");
    const assignmentSubmission = await request(base, "POST", `/v1/assignments/${assignment.body.id}/submissions`, {
      authorization: `Bearer ${joinedAgain.body.accessToken}`,
      body: { clientEntityId: "qa-assignment-complete", answers: [{ status: "completed" }] },
    });
    assert.equal(assignmentSubmission.status, 201);
    assert.equal(assignmentSubmission.body.status, "submitted");

    const roster = await request(base, "GET", `/v1/classes/${createdA.body.class.id}/roster`, {
      authorization: ownerA,
    });
    assert.equal(roster.status, 200);
    assert.equal(roster.body.items.length, 1);
    assert.equal(roster.body.items[0].displayName, "学生甲");
    assert.equal(roster.body.items[0].role, "student");

    const additionalDevices = Array.from({ length: 8 }, (_, index) => ({
      displayName: `并发学生${index + 1}`,
      deviceId: (index + 2).toString(16).repeat(64).slice(0, 64),
    }));
    const concurrentJoins = await Promise.all(additionalDevices.map((student) => request(
      base,
      "POST",
      "/v1/invites/join-anonymous",
      { body: { code: invite1.body.code, ...student } },
    )));
    assert.ok(concurrentJoins.every((item) => item.status === 200));
    assert.equal(new Set(concurrentJoins.map((item) => item.body.membership.id)).size, 8,
      "each physical device receives its own membership");
    const concurrentRoster = await request(base, "GET", `/v1/classes/${createdA.body.class.id}/roster`, {
      authorization: ownerA,
    });
    assert.equal(concurrentRoster.status, 200);
    assert.equal(concurrentRoster.body.items.length, 9,
      "the teacher sees students joined concurrently from multiple devices");

    const studentDelete = await request(base, "DELETE", `/v1/classes/${createdA.body.class.id}`, {
      authorization: `Bearer ${joined1.body.accessToken}`,
    });
    assert.equal(studentDelete.status, 403);

    const invite2 = await request(base, "POST", `/v1/classes/${createdA.body.class.id}/invites`, {
      authorization: ownerA,
      body: { maxUses: 1000, expiresAt: "2099-01-01T00:00:00.000Z" },
    });
    assert.equal(invite2.status, 201);
    assert.notEqual(invite2.body.code, invite1.body.code);
    const oldInvite = await request(base, "POST", "/v1/invites/join-anonymous", {
      body: { code: invite1.body.code, displayName: "旧码学生", deviceId: "b".repeat(64) },
    });
    assert.equal(oldInvite.status, 404);
    assert.equal(oldInvite.body.code, "invite_not_found");

    const discovery = await discover(discoveryPort, "qa-nonce-12345678");
    assert.equal(discovery.protocol, "physics-studio-classroom-lan-v1");
    assert.equal(discovery.nonce, "qa-nonce-12345678");
    assert.equal(discovery.port, port);
    assert.ok(discovery.addresses.includes("127.0.0.1"));

    const tooLarge = await fetch(`${base}/v1/classes/anonymous`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "qa-large-body-123456" },
      body: JSON.stringify({ name: "x".repeat(70_000) }),
    });
    assert.equal(tooLarge.status, 413);

    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    child = await startService(exe, dataDir, port, discoveryPort, readyFile);
    const persisted = await request(base, "GET", `/v1/classes/${createdA.body.class.id}`, {
      authorization: ownerA,
    });
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.name, "高三物理一班");
    const persistedText = fs.readFileSync(path.join(dataDir, "classroom-data-v1.json"), "utf8");
    assert.doesNotMatch(persistedText, new RegExp(createdA.body.ownerCapability.replaceAll(".", "\\.")));
    assert.doesNotMatch(persistedText, new RegExp(invite2.body.code));
    assert.doesNotMatch(persistedText, new RegExp(joined1.body.accessToken.replaceAll(".", "\\.")));

    const deleted = await request(base, "DELETE", `/v1/classes/${createdA.body.class.id}`, {
      authorization: ownerA,
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.status, "archived");
    const deletedInvite = await request(base, "POST", "/v1/invites/join-anonymous", {
      body: { code: invite2.body.code, displayName: "删除后学生", deviceId: "c".repeat(64) },
    });
    assert.equal(deletedInvite.status, 404);
    assert.equal(deletedInvite.body.code, "invite_not_found");

    console.log(JSON.stringify({
      status: "passed",
      duplicateNames: "isolated-by-uuid",
      ownerIsolation: true,
      membershipIdempotent: true,
      concurrentDevices: 9,
      assignmentDelivery: true,
      inviteRotation: true,
      persistedSecrets: false,
      deletedInviteRejected: true,
    }, null, 2));
  } finally {
    if (child && child.exitCode == null) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
