# Windows LAN Classroom Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Windows and Android builds in which a Windows computer hosts a persistent LAN classroom service and both clients can create, invite, join, refresh, and delete classes without an administrator account or fake offline success.

**Architecture:** Add a standalone .NET Framework LAN service with atomic JSON persistence, scoped owner capabilities, anonymous student sessions, and UDP discovery. Keep `classroom-client.js` as the public contract, but route validated private-LAN traffic through asynchronous Windows/Android native adapters so existing WebView mixed-content protections remain enabled. Preserve the existing public HTTPS/Fastify transport as an optional alternative.

**Tech Stack:** ES2020 browser JavaScript, Node.js QA scripts, .NET Framework 4.x C# (`TcpListener`, WebView2), Android Java/WebView, PowerShell release scripts.

## Global Constraints

- Preserve all existing question IDs, learning records, activation data, and v3.1.6 local-storage compatibility.
- Never report class creation, invitation, joining, deletion, or rotation as successful without a server response.
- Creating a class requires only a non-empty trimmed name; duplicate names are allowed and identity is the UUID class ID.
- Owner capabilities never appear in an invite code, QR payload, log, error, or student response.
- Students can join only with a valid invite and can never acquire owner/teacher authority by changing client fields.
- Keep WebView mixed-content, arbitrary-navigation, file-access, and safe-browsing protections unchanged.
- LAN HTTP is restricted to loopback/private/link-local hosts, port 8788, and classroom API paths.
- Windows is the LAN host. Android can create/manage only while connected to a Windows host or an explicitly configured public HTTPS service.
- Core learning remains offline-first; classroom operations are online-first with explicit offline fallback, not online-only.
- Use `version.json` as the only release version source and advance the deliverables to 3.1.7.

---

## File Structure

- Create `LanClassroomService.cs`: standalone HTTP/UDP service, persistence, identities, authorization, and classroom API.
- Create `tools/qa_lan_classroom_service.cjs`: compiles and exercises the real service process over HTTP.
- Create `tools/qa_classroom_lan_transport.cjs`: VM/browser contract tests for migration, discovery, QR server selection, and no fake success.
- Modify `classroom-client.js`: storage migration, server-scoped credentials, native LAN transport, discovery, and QR parsing.
- Modify `classroom-config.js`: declare LAN port/protocol defaults without a fake API origin.
- Modify `Launcher.cs`: start/monitor the service and implement asynchronous WebView2 LAN request/discovery messages.
- Modify `Installer.cs`: install the LAN service executable.
- Modify `tools/build_release.ps1`: compile, test, package, and document the LAN service.
- Modify `android/src/com/physicsstudio/studyroom/MainActivity.java`: asynchronous private-LAN HTTP and UDP-discovery bridge.
- Modify `android/tools/build_android.ps1`: package the synchronized Web assets and include LAN bridge QA in the gate.
- Modify `experience-shell.js` and `experience-shell.css`: truthful connection state, immediate detail navigation, legacy-cache handling, and responsive controls.
- Modify root QA scripts/package scripts, `README.md`, `CHANGELOG.md`, and `version.json` for the new release gate and user instructions.

---

### Task 1: Lock the Client Regression Contract

**Files:**
- Create: `tools/qa_classroom_lan_transport.cjs`
- Modify: `tools/qa_classroom_client.cjs`
- Modify: `tools/qa_class_invite_join.cjs`
- Modify: `classroom-client.js`
- Modify: `classroom-config.js`

**Interfaces:**
- Produces: `PhysicsStudioClassroom.discoverServices()`, `joinClassByInviteCode(input)`, and `parseInvitePayload(payload)` returning `{ classId, code, serverUrl }`.
- Produces: owner records shaped as `{ classId, ownerUserId, token, expiresAt, class, serverUrl, source }`.
- Consumes: optional `globalThis.PhysicsStudioClassroomNative.request(input)` and `.discover()` Promise APIs.

- [ ] **Step 1: Write failing migration and transport tests**

  Build a VM fixture with literal persisted values and assert observable behavior:

  ```js
  storage.setItem("physics-classroom-config-v1", JSON.stringify({ serverUrl: "http://127.0.0.1:8787" }));
  storage.setItem("physics-learning-state-v9", "learning-sentinel");
  const client = loadClient({ nativeServers: ["http://192.168.1.20:8788"] });
  assert.equal(client.status().serverUrl, "");
  assert.equal(storage.getItem("physics-learning-state-v9"), "learning-sentinel");
  assert.deepEqual(client.parseInvitePayload(
    "physicsstudio://join?class_id=11111111-1111-4111-8111-111111111111&code=abcdefghijklmnopqrstuv&server=http%3A%2F%2F192.168.1.20%3A8788"
  ), {
    classId: "11111111-1111-4111-8111-111111111111",
    code: "abcdefghijklmnopqrstuv",
    serverUrl: "http://192.168.1.20:8788"
  });
  ```

  Add cases for `appassets.androidplatform.net`, owner records from a different server, no mutation response, invalid public HTTP, redirect rejection, discovery timeout, and one discovered host accepting the invite while another returns `invite_not_found`.

- [ ] **Step 2: Run the tests and verify RED**

  Run: `node tools/qa_classroom_lan_transport.cjs`

  Expected: FAIL because stale config is still trusted, QR parsing omits `serverUrl`, and no native discovery transport exists.

- [ ] **Step 3: Implement the minimal client migration and transport**

  Add one-time normalization that removes only confirmed bad class-service URLs and scopes owner/session state to its server. Introduce this contract:

  ```js
  async function sendTransportRequest(serverUrl, path, options) {
    if (isPrivateLanServerUrl(serverUrl) && globalThis.PhysicsStudioClassroomNative?.request) {
      return globalThis.PhysicsStudioClassroomNative.request({ serverUrl, path, ...options });
    }
    return requestWithFetch(serverUrl, path, options);
  }

  async function joinClassByInviteCode(input) {
    const parsed = parseInvitePayload(input.code || input);
    const candidates = await candidateServers(parsed.serverUrl);
    return joinFirstMatchingServer(candidates, parsed.code, input.displayName);
  }
  ```

  Treat only 404/`invite_not_found` as permission to try the next discovered host. Stop immediately on success, 400, 401, 403, 409, 429, or 5xx. Do not persist class/session state before a validated server response.

- [ ] **Step 4: Re-run narrow client tests and verify GREEN**

  Run: `node tools/qa_classroom_lan_transport.cjs`

  Run: `node tools/qa_classroom_client.cjs`

  Run: `node tools/qa_class_invite_join.cjs`

  Expected: all PASS with no learning-key mutation and no offline fake success.

- [ ] **Step 5: Commit the client contract**

  ```powershell
  git add classroom-client.js classroom-config.js tools/qa_classroom_lan_transport.cjs tools/qa_classroom_client.cjs tools/qa_class_invite_join.cjs
  git commit -m "fix: migrate classroom transport to discovered LAN services"
  ```

### Task 2: Implement the Persistent LAN Classroom Service

**Files:**
- Create: `LanClassroomService.cs`
- Create: `tools/qa_lan_classroom_service.cjs`

**Interfaces:**
- CLI: `物理研习室-班级服务.exe --bind <ip> --port <port> --data-dir <dir> [--ready-file <path>]`.
- HTTP: current `/health/live`, `/v1/classes`, `/v1/invites`, roster, group, account, and compatibility paths.
- UDP: request `PHYSICS_STUDIO_CLASSROOM_DISCOVER_V1:<nonce>` and response JSON `{ protocol, nonce, instanceId, port, addresses }`.

- [ ] **Step 1: Write a failing real-process integration test**

  The QA script must compile `LanClassroomService.cs` with the repository's .NET Framework compiler, start it on a temporary port/data directory, and assert literal outcomes over real HTTP:

  ```js
  const created = await post("/v1/classes/anonymous", { name: "  高三物理一班  " });
  assert.equal(created.class.name, "高三物理一班");
  assert.match(created.class.id, UUID_RE);
  assert.match(created.ownerCapability, OWNER_RE);
  const duplicateName = await post("/v1/classes/anonymous", { name: "高三物理一班" });
  assert.notEqual(duplicateName.class.id, created.class.id);
  ```

  Continue through owner-only invitation, anonymous join, duplicate join, roster, wrong-owner 403, invite rotation, delete, old-invite 404, persistence after process restart, body limit 413, path traversal 404, and absence of owner tokens in persisted JSON/QR-facing responses.

- [ ] **Step 2: Run the service test and verify RED**

  Run: `node tools/qa_lan_classroom_service.cjs`

  Expected: FAIL because `LanClassroomService.cs` does not yet exist.

- [ ] **Step 3: Implement storage and HTTP parsing**

  Implement focused types inside the standalone source:

  ```csharp
  internal sealed class ClassroomStore {
      public CreateClassResult CreateClass(string name);
      public InviteResult RotateInvite(Guid classId, string ownerCapability);
      public JoinResult Join(string inviteCode, string displayName, string deviceId);
      public void ArchiveClass(Guid classId, string ownerCapability);
      public StoreSnapshot ReadSnapshot();
  }

  internal sealed class ClassroomHttpServer {
      public void Start(IPAddress address, int port);
      public Task StopAsync();
  }
  ```

  Use `RandomNumberGenerator`, constant-time hash comparison, 22-character Base64URL invitations, 43-character owner/student tokens, UUID class/member IDs, bounded JSON input, and atomic temp-file replacement. Persist token hashes only.

- [ ] **Step 4: Implement authorization and the client-compatible endpoints**

  Support owner authorization as `Authorization: Owner <capability>` and student authorization as `Bearer <session-token>`. Implement class list/detail/delete, rotate invite, anonymous join, roster, membership patch, group list/create, account display-name patch, and empty-or-persisted compatibility responses for the detail page's assignment/learning/review/report calls. Enforce class isolation in every repository lookup.

- [ ] **Step 5: Implement UDP discovery and rate limits**

  Reply only to a well-formed nonce packet, never include classroom data, and advertise only active IPv4 private addresses. Bound discovery work and apply per-IP fixed-window limits to anonymous create/join and invitation lookup.

- [ ] **Step 6: Run the service test and verify GREEN**

  Run: `node tools/qa_lan_classroom_service.cjs`

  Expected: PASS for create/invite/join/delete/persistence/authorization and protocol-limit cases.

- [ ] **Step 7: Commit the service**

  ```powershell
  git add LanClassroomService.cs tools/qa_lan_classroom_service.cjs
  git commit -m "feat: add persistent Windows LAN classroom service"
  ```

### Task 3: Host the Service and Bridge Windows WebView2

**Files:**
- Modify: `Launcher.cs`
- Modify: `Installer.cs`
- Modify: `tools/build_release.ps1`
- Create: `tools/qa_windows_lan_classroom.cjs`

**Interfaces:**
- Web message request: `{ channel: "physics-studio-classroom", requestId, action: "request"|"discover", payload }`.
- Web message response: `{ channel: "physics-studio-classroom", requestId, ok, result?, error? }`.
- Launcher lifecycle: start/reuse verified local service before navigating WebView; terminate only the child process it created.

- [ ] **Step 1: Write failing launcher/installer behavior tests**

  Compile the real launcher/installer inputs and assert that `--check` fails when the service executable is missing, succeeds when present, the installed payload contains it, and WebView messages reject external sources and unsafe endpoints. The test must launch the service with a temporary data directory rather than inspect source strings only.

- [ ] **Step 2: Run the Windows LAN QA and verify RED**

  Run: `node tools/qa_windows_lan_classroom.cjs`

  Expected: FAIL because the launcher neither requires nor starts the service and has no classroom message channel.

- [ ] **Step 3: Implement service lifecycle**

  Add a `LanClassroomHost` responsible for `ProcessStartInfo`, readiness polling against `/health/live`, child ownership, diagnostic states, and graceful disposal. Use `-WindowStyle Hidden` semantics and do not kill an unrelated process found on 8788; reuse it only after validating the health response protocol and instance metadata.

- [ ] **Step 4: Implement the asynchronous WebView2 bridge**

  Extend `HandleWebMessageReceived` to parse bounded JSON messages from the existing internal virtual host only. Run network/discovery work away from the UI thread and reply on the UI thread. Apply a native endpoint policy before making any request:

  ```csharp
  if (!LanEndpointPolicy.TryValidate(serverUrl, path, out Uri uri)) {
      Reply(requestId, false, null, "lan_endpoint_rejected");
      return;
  }
  ```

  Never include exception stack traces, tokens, bodies, or raw network errors in logs/replies.

- [ ] **Step 5: Package the service executable**

  Compile `LanClassroomService.cs` before `Launcher.cs`, add it to `Installer.Payload`, launcher required files, release checks, and SHA-256/source-package validation. Add the required .NET references explicitly in `build_release.ps1`.

- [ ] **Step 6: Run Windows LAN QA and verify GREEN**

  Run: `node tools/qa_windows_lan_classroom.cjs`

  Run: `powershell -ExecutionPolicy Bypass -File tools/build_windows_current.ps1`

  Expected: PASS; the built app starts a healthy local service and unsafe bridge requests are rejected.

- [ ] **Step 7: Commit the Windows host**

  ```powershell
  git add Launcher.cs Installer.cs tools/build_release.ps1 tools/qa_windows_lan_classroom.cjs
  git commit -m "feat: host LAN classrooms in the Windows app"
  ```

### Task 4: Add the Android Private-LAN Bridge

**Files:**
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/qa_android_bridge.cjs`
- Create: `tools/qa_android_lan_policy.cjs`

**Interfaces:**
- JavaScript bridge calls: `PhysicsStudioAndroid.classroomRequest(requestId, requestJson)` and `PhysicsStudioAndroid.discoverClassroomServices(requestId)`.
- Callback: `globalThis.PhysicsStudioClassroomNative.resolve(requestId, responseJson)` executed only into the trusted `appassets` page.

- [ ] **Step 1: Write failing Android policy/bridge tests**

  Add table-driven cases that exercise the actual endpoint validator with literals:

  ```js
  ["http://192.168.1.20:8788/v1/classes", true],
  ["http://127.0.0.1:8788/health/live", true],
  ["http://8.8.8.8:8788/v1/classes", false],
  ["http://192.168.1.20:8080/v1/classes", false],
  ["http://192.168.1.20:8788/admin", false],
  ["http://user:secret@192.168.1.20:8788/v1/classes", false]
  ```

  Extend the Android bridge QA to require asynchronous request IDs, bounded response sizes, disabled redirects, no token logging, and unchanged `MIXED_CONTENT_NEVER_ALLOW`.

- [ ] **Step 2: Run Android LAN tests and verify RED**

  Run: `node tools/qa_android_lan_policy.cjs`

  Run: `node tools/qa_android_bridge.cjs`

  Expected: FAIL because the LAN request/discovery adapter does not exist.

- [ ] **Step 3: Implement asynchronous network and discovery work**

  Use a bounded single-purpose executor. Validate URL/port/path before `HttpURLConnection`; disable redirects; cap headers/body; set connect/read timeouts; send response through `webView.post(...)` only while the Activity is alive. UDP discovery sends one nonce to the current Wi-Fi broadcast addresses and returns deduplicated validated service URLs.

- [ ] **Step 4: Add lifecycle cleanup and explicit errors**

  Cancel outstanding futures and close sockets in `onDestroy`. Map permission/network/timeouts to stable non-sensitive codes. Do not log request bodies, Authorization headers, owner capability, invite code, or student data.

- [ ] **Step 5: Run Android tests/build and verify GREEN**

  Run: `node tools/qa_android_lan_policy.cjs`

  Run: `node tools/qa_android_bridge.cjs`

  Run: `powershell -ExecutionPolicy Bypass -File android/tools/build_android.ps1`

  Expected: tests and APK build PASS while existing WebView security settings remain unchanged.

- [ ] **Step 6: Commit the Android bridge**

  ```powershell
  git add android/src/com/physicsstudio/studyroom/MainActivity.java android/tools/build_android.ps1 tools/qa_android_bridge.cjs tools/qa_android_lan_policy.cjs
  git commit -m "feat: connect Android to private LAN classrooms"
  ```

### Task 5: Complete the Teacher and Student UI Flow

**Files:**
- Modify: `experience-shell.js`
- Modify: `experience-shell.css`
- Modify: `tools/qa_classroom_ui.cjs`
- Modify: `tools/qa_student_guest_join.cjs`
- Modify: `tools/qa_interaction_latency.cjs`

**Interfaces:**
- Create success: set `selectedClassId`, create initial invitation, load detail, render detail.
- Delete success: remove owner record and selected card only after 2xx server confirmation.
- QR/manual/image/camera join: all call `PhysicsStudioClassroom.joinClassByInviteCode({ code, displayName })`.

- [ ] **Step 1: Write failing browser interaction tests**

  Use the existing browser harness with real DOM events. Assert one network mutation per click, immediate busy feedback in one animation frame, class detail after create, QR containing `server`, manual and decoded QR reaching the same function, delete confirmation and removal only after a resolved response, and truthful legacy/offline messages.

- [ ] **Step 2: Run the UI tests and verify RED**

  Run: `node tools/qa_classroom_ui.cjs`

  Run: `node tools/qa_student_guest_join.cjs`

  Expected: FAIL for server-bearing QR, discovered manual join, and legacy-cache status.

- [ ] **Step 3: Implement the minimal UI state changes**

  Keep the current visual language. Disable only the active mutation control, preserve scroll position, render busy state before awaiting network work, and avoid rebuilding the entire dialog for a status-only update. Display class name, class ID, student count, invitation, QR, copy, refresh, roster, and delete in the selected detail.

- [ ] **Step 4: Make all join paths converge**

  Camera and image handlers pass the decoded payload unchanged to `joinClassByInviteCode`; manual input passes the code. After success, replace the list with server-returned membership/classes and permit display-name updates. Never switch the experience role to teacher during student join.

- [ ] **Step 5: Run UI and latency tests and verify GREEN**

  Run: `node tools/qa_classroom_ui.cjs`

  Run: `node tools/qa_student_guest_join.cjs`

  Run: `node tools/qa_interaction_latency.cjs`

  Expected: all PASS and no blocking discovery/network work on the WebView UI thread.

- [ ] **Step 6: Commit the UI flow**

  ```powershell
  git add experience-shell.js experience-shell.css tools/qa_classroom_ui.cjs tools/qa_student_guest_join.cjs tools/qa_interaction_latency.cjs
  git commit -m "fix: complete classroom create join and delete flows"
  ```

### Task 6: Version, Documentation, and Release Gates

**Files:**
- Modify: `version.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `android/README.md`
- Modify: `tools/qa_node.cjs`
- Modify: `tools/qa_version_source.cjs`
- Modify: `tools/qa_release_packaging.cjs`

**Interfaces:**
- Version source: `version.json.appVersion === "3.1.7"`.
- Root gate includes `qa:classroom-lan-service`, `qa:classroom-lan-transport`, Windows LAN host QA, existing browser/mobile/teacher checks, and Android security.

- [ ] **Step 1: Write failing release-gate assertions**

  Assert that a release without the service executable, its source, its tests, or matching Web resources fails packaging QA. Assert all generated Windows/Android version fields equal the literal `3.1.7` read from the version source rather than duplicated hard-coded readiness strings.

- [ ] **Step 2: Run release/version QA and verify RED**

  Run: `node tools/qa_version_source.cjs`

  Run: `node tools/qa_release_packaging.cjs`

  Expected: FAIL until the version and required service artifacts are wired into the gates.

- [ ] **Step 3: Update version and release documentation**

  Update the canonical version, generated assembly/package metadata, README setup/operation/troubleshooting, Android LAN join instructions, and CHANGELOG. State the same-Wi-Fi limitation, Windows host requirement, firewall/client-isolation diagnosis, public HTTPS alternative, storage location, migration behavior, and unsigned-build status accurately.

- [ ] **Step 4: Add all new checks to the root gate**

  Add executable npm scripts and invoke them from `npm run qa`. Do not replace or weaken existing gates.

- [ ] **Step 5: Re-run release/version QA and verify GREEN**

  Run: `node tools/qa_version_source.cjs`

  Run: `node tools/qa_release_packaging.cjs`

  Expected: PASS with 3.1.7 everywhere and the service present in release manifests.

- [ ] **Step 6: Commit release metadata**

  ```powershell
  git add version.json package.json README.md CHANGELOG.md android/README.md tools/qa_node.cjs tools/qa_version_source.cjs tools/qa_release_packaging.cjs
  git commit -m "release: prepare LAN classroom build 3.1.7"
  ```

### Task 7: Full Verification and Dual-Platform Builds

**Files:**
- Modify only files required to correct failures found by the specified gates.
- Produce: `发布/Windows-v3.1.7/` artifacts.
- Produce: `发布/Android/物理研习室-Android-v3.1.7.apk`.

**Interfaces:**
- Release artifacts must contain the same synchronized Web assets and version.
- Test report distinguishes code defects, environment limitations, and unsigned-package status.

- [ ] **Step 1: Run narrow service and transport checks**

  Run: `node tools/qa_lan_classroom_service.cjs`

  Run: `node tools/qa_classroom_lan_transport.cjs`

  Run: `node tools/qa_windows_lan_classroom.cjs`

  Run: `node tools/qa_android_lan_policy.cjs`

  Expected: all PASS.

- [ ] **Step 2: Run the complete repository gate**

  Run: `npm run qa`

  Expected: PASS without skipped permission, browser, mobile, interaction, or packaging checks.

- [ ] **Step 3: Run existing server checks**

  Run: `pnpm --dir server run typecheck`

  Run: `pnpm --dir server run test:unit`

  Run: `pnpm --dir server run build`

  Expected: PASS. PostgreSQL/Redis container integration is reported separately if the current machine still lacks those services.

- [ ] **Step 4: Build Android and Windows releases**

  Run: `powershell -ExecutionPolicy Bypass -File android/tools/build_android.ps1`

  Run: `powershell -ExecutionPolicy Bypass -File tools/build_release.ps1 -ReleaseDirectory "发布/Windows-v3.1.7"`

  Expected: APK, installer, ZIP, source ZIP, SHA-256, install guide, and signature-status files are generated.

- [ ] **Step 5: Execute a local two-client integration smoke**

  Start the packaged service with a temporary data directory; use two independent client storage fixtures to execute:

  `teacher create -> invite -> student A manual join -> student B QR join -> rotate -> old code rejected -> delete -> both student lists exclude class`.

  Expected: every mutation is server-confirmed and the learning-storage sentinel remains unchanged.

- [ ] **Step 6: Review the final diff and artifact hashes**

  Run: `git diff --check`

  Run: `git status --short`

  Review permissions, token leakage, path/address validation, duplicate memberships, atomic persistence, stale URL migration, and package timestamps. Record SHA-256 values from generated manifests.

- [ ] **Step 7: Close verification fixes through their owning task**

  If Step 6 finds a defect, return to the task that owns that behavior, add a failing regression case,
  implement the minimum fix, rerun that task's checks, and include the fix in that task's scoped commit.
  If no defect is found, do not create an empty verification commit.
