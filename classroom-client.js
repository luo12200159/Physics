(() => {
  "use strict";

  const CONFIG_KEY = "physics-classroom-config-v1";
  const DEVICE_ID_KEY = "physics-classroom-device-id-v1";
  const ACCESS_TOKEN_KEY = "physics-classroom-access-token-v1";
  const REFRESH_TOKEN_KEY = "physics-classroom-refresh-token-v1";
  const GUEST_SESSION_KEY = "physics-classroom-guest-session-v1";
  const USER_KEY = "physics-classroom-user-v1";
  const OWNER_CAPABILITIES_KEY = "physics-classroom-owner-capabilities-v1";
  const LOCAL_STUDENT_ID_KEY = "physics-classroom-local-student-id-v1";
  const SYNC_QUEUE_KEY = "physics-classroom-sync-queue-v1";
  const SYNC_CONFLICT_KEY = "physics-classroom-sync-conflicts-v1";
  const CLASSROOM_LAN_PORT = 8788;
  const NATIVE_BRIDGE_PENDING = new Map();
  const CONFIRMED_STALE_SERVER_URLS = new Set([
    "http://127.0.0.1:8787",
    "http://localhost:8787",
    "https://appassets.androidplatform.net"
  ]);
  const MAX_SYNC_QUEUE_ITEMS = 500;

  function settleNativeBridgeMessage(rawMessage) {
    let message = rawMessage;
    if (typeof message === "string") {
      try { message = JSON.parse(message); } catch { return; }
    }
    if (!message || message.channel !== "physics-studio-classroom"
      || !/^[A-Za-z0-9-]{8,80}$/.test(String(message.requestId || ""))) return;
    const pending = NATIVE_BRIDGE_PENDING.get(message.requestId);
    if (!pending) return;
    NATIVE_BRIDGE_PENDING.delete(message.requestId);
    clearTimeout(pending.timer);
    if (message.ok === true) pending.resolve(message.result || {});
    else pending.reject(Object.assign(new Error("LAN bridge request failed"), {
      code: sanitizeCode(message.error) || "network_error"
    }));
  }

  function installWindowsLanTransport() {
    if (globalThis.PhysicsStudioClassroomNative || window.PhysicsStudioClassroomNative) return;
    const bridge = globalThis.chrome?.webview || window.chrome?.webview;
    if (!bridge || typeof bridge.postMessage !== "function"
      || typeof bridge.addEventListener !== "function") return;
    bridge.addEventListener("message", (event) => settleNativeBridgeMessage(event?.data));
    const call = (action, payload, timeoutMs) => new Promise((resolve, reject) => {
      const requestId = `lan-${randomHex(12)}`;
      const timer = setTimeout(() => {
        NATIVE_BRIDGE_PENDING.delete(requestId);
        reject(Object.assign(new Error("LAN bridge request timed out"), { code: "request_timeout" }));
      }, timeoutMs);
      NATIVE_BRIDGE_PENDING.set(requestId, { resolve, reject, timer });
      try {
        bridge.postMessage(JSON.stringify({
          channel: "physics-studio-classroom",
          requestId,
          action,
          payload: payload || {}
        }));
      } catch {
        clearTimeout(timer);
        NATIVE_BRIDGE_PENDING.delete(requestId);
        reject(Object.assign(new Error("LAN bridge request failed"), { code: "network_error" }));
      }
    });
    const adapter = Object.freeze({
      request(input) { return call("request", input, REQUEST_TIMEOUT_MS + 1000); },
      discover() { return call("discover", {}, 4000); }
    });
    window.PhysicsStudioClassroomNative = adapter;
    try { globalThis.PhysicsStudioClassroomNative = adapter; } catch { /* window assignment is sufficient */ }
  }

  function installAndroidLanTransport() {
    if (globalThis.PhysicsStudioClassroomNative || window.PhysicsStudioClassroomNative) return;
    const bridge = globalThis.PhysicsStudioAndroid || window.PhysicsStudioAndroid;
    if (!bridge || typeof bridge.classroomRequest !== "function"
      || typeof bridge.discoverClassroomServices !== "function") return;
    const call = (action, payload, timeoutMs) => new Promise((resolve, reject) => {
      const requestId = `lan-${randomHex(12)}`;
      const timer = setTimeout(() => {
        NATIVE_BRIDGE_PENDING.delete(requestId);
        reject(Object.assign(new Error("LAN bridge request timed out"), { code: "request_timeout" }));
      }, timeoutMs);
      NATIVE_BRIDGE_PENDING.set(requestId, { resolve, reject, timer });
      try {
        if (action === "discover") bridge.discoverClassroomServices(requestId);
        else bridge.classroomRequest(requestId, JSON.stringify(payload || {}));
      } catch {
        clearTimeout(timer);
        NATIVE_BRIDGE_PENDING.delete(requestId);
        reject(Object.assign(new Error("LAN bridge request failed"), { code: "network_error" }));
      }
    });
    const adapter = Object.freeze({
      request(input) { return call("request", input, REQUEST_TIMEOUT_MS + 1000); },
      discover() { return call("discover", {}, 3000); },
      hostedServices() {
        try {
          const value = JSON.parse(String(bridge.getHostedClassroomServiceInfo?.() || "null"));
          return value && typeof value === "object" ? value : null;
        } catch {
          return null;
        }
      }
    });
    const callback = (message) => settleNativeBridgeMessage(message);
    globalThis.PhysicsStudioClassroomNativeResponse = callback;
    window.PhysicsStudioClassroomNativeResponse = callback;
    window.PhysicsStudioClassroomNative = adapter;
    try { globalThis.PhysicsStudioClassroomNative = adapter; } catch { /* window assignment is sufficient */ }
  }
  function resolveDefaultServerUrl() {
    const explicit = String(globalThis.PHYSICS_STUDIO_CLASSROOM_URL || "").trim();
    if (explicit) return explicit;
    // Hosted deployments use their own origin. Packaged native builds expose
    // their embedded LAN host through the native bridge instead of guessing a
    // loopback URL here; other devices receive a private-LAN share address.
    try {
      const hostname = String(globalThis.location?.hostname || "").toLowerCase();
      const packagedLocalOrigin = hostname === "physics-studio.local"
        || hostname === "appassets.androidplatform.net"
        || hostname.endsWith(".androidplatform.net");
      if (globalThis.location?.protocol === "https:" && globalThis.location.origin
        && !packagedLocalOrigin) {
        return globalThis.location.origin;
      }
    } catch {
      // An unconfigured packaged build is handled explicitly below.
    }
    return "";
  }
  const DEFAULT_SERVER_URL = resolveDefaultServerUrl();
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_RESPONSE_CHARS = 1_000_000;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DEVICE_ID_PATTERN = /^[0-9a-f]{64}$/i;
  const REFRESH_TOKEN_PATTERN = /^r1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
  const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
  const OWNER_CAPABILITY_PATTERN = /^oc1\.[A-Za-z0-9_-]{43,128}$/;
  const GRADES = new Set(["八年级", "九年级", "高一", "高二", "高三"]);
  const ROLES = new Set(["student", "teacher", "parent", "administrator"]);
  const SAFE_ERROR_MESSAGES = Object.freeze({
    invalid_credentials: "账号或密码错误。",
    invalid_access_token: "登录已失效，请重新登录。",
    invalid_refresh_token: "登录已失效，请重新登录。",
    refresh_token_reused: "登录已失效，请重新登录。",
    password_change_required: "账号需要先修改密码。",
    deletion_pending: "账号正在执行删除流程，暂时不能使用班级服务。",
    student_role_required: "只有学生账号可以通过邀请码加入班级。",
    resource_forbidden: "当前账号没有执行此操作的权限。",
    lan_peer_required: "学生设备必须与教师设备连接同一 Wi-Fi 或局域网。",
    reauthentication_required: "此操作需要重新验证教师身份。",
    class_not_found: "没有找到该班级，或当前账号无权访问。",
    membership_not_found: "没有找到该班级成员记录。",
    invite_not_found: "邀请码无效。",
    invite_unavailable: "邀请码已失效或不可用。",
    invite_exhausted: "邀请码使用次数已达到上限。",
    class_archived: "该班级已归档，不能继续修改。",
    group_class_mismatch: "所选分组不属于该班级。",
    group_name_conflict: "班级中已存在同名分组。",
    membership_removed: "该成员已移出班级，不能继续修改。",
    validation_error: "提交内容不符合服务端要求，请检查后重试。",
    idempotency_key_required: "请求缺少防重复提交标识。",
    idempotency_key_conflict: "该操作已提交过，但请求内容不一致。",
    rate_limit_exceeded: "操作过于频繁，请稍后再试。",
    identity_store_unavailable: "账号服务暂时不可用，请稍后再试。",
    session_store_unavailable: "登录服务暂时不可用，请稍后再试。",
    rate_limit_unavailable: "安全校验服务暂时不可用，请稍后再试。",
    internal_error: "班级服务暂时异常，请稍后再试。",
    not_found: "请求的班级资源不存在。"
  });

  let refreshInFlight = null;

  installAndroidLanTransport();
  installWindowsLanTransport();

  class ClassroomError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "ClassroomError";
      this.code = sanitizeCode(details.code) || "classroom_error";
      this.status = Number.isInteger(details.status) ? details.status : 0;
      this.requestId = sanitizeRequestId(details.requestId);
    }
  }

  function insecureLanHttpAllowed() {
    return globalThis.PHYSICS_STUDIO_ALLOW_INSECURE_LAN === true || Boolean(nativeLanTransport());
  }

  function nativeLanTransport() {
    const candidate = globalThis.PhysicsStudioClassroomNative || window.PhysicsStudioClassroomNative;
    return candidate && typeof candidate === "object" ? candidate : null;
  }

  function hostedNativeServices() {
    const native = nativeLanTransport();
    if (!native || typeof native.hostedServices !== "function") {
      return Object.freeze({ serverUrl: "", services: Object.freeze([]) });
    }
    try {
      const value = native.hostedServices();
      const services = [];
      for (const candidate of Array.isArray(value?.services) ? value.services : []) {
        try {
          const normalized = normalizeDiscoveredLanUrl(candidate);
          if (!services.includes(normalized)) services.push(normalized);
        } catch {
          // Native host addresses are still validated as private literals.
        }
      }
      let serverUrl = "";
      try { serverUrl = normalizeDiscoveredLanUrl(value?.serverUrl || ""); } catch { /* unavailable */ }
      return Object.freeze({ serverUrl, services: Object.freeze(services) });
    } catch {
      return Object.freeze({ serverUrl: "", services: Object.freeze([]) });
    }
  }

  function isPrivateLanHost(hostname) {
    const value = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
    if (value === "localhost" || value === "::1" || value.startsWith("127.")) return true;
    if (/^10(?:\.\d{1,3}){3}$/.test(value) || /^192\.168(?:\.\d{1,3}){2}$/.test(value)) return true;
    const match = value.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
    return value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
  }

  function normalizeServerUrl(value, options = {}) {
    const source = String(value ?? DEFAULT_SERVER_URL).trim();
    if (!source && options.allowEmpty) return "";
    if (!source) {
      throw new ClassroomError("尚未配置班级服务地址。", { code: "service_not_configured" });
    }
    let parsed;
    try {
      parsed = new URL(source);
    } catch {
      throw new ClassroomError("班级服务地址不是有效网址。", { code: "invalid_server_url" });
    }
    const loopbackHttp = parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    const optedInLanHttp = parsed.protocol === "http:"
      && insecureLanHttpAllowed()
      && isPrivateLanHost(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopbackHttp && !optedInLanHttp) {
      throw new ClassroomError("正式班级服务必须使用 HTTPS；私有局域网 HTTP 仅可在显式开发模式下使用。", {
        code: "insecure_server_url"
      });
    }
    if (parsed.username || parsed.password) {
      throw new ClassroomError("班级服务地址不能包含账号、密码或密钥。", {
        code: "unsafe_server_url"
      });
    }
    if (parsed.search || parsed.hash) {
      throw new ClassroomError("班级服务地址不能包含查询参数或页面片段。", {
        code: "invalid_server_url"
      });
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname === "/" ? "" : pathname}`;
  }

  function normalizeDiscoveredLanUrl(value) {
    let parsed;
    try {
      parsed = new URL(String(value || "").trim());
    } catch {
      throw inputError("未识别到有效的局域网班级服务。", "invalid_server_url");
    }
    if (parsed.protocol !== "http:" || !isPrivateLanHost(parsed.hostname)
      || Number(parsed.port || 80) !== CLASSROOM_LAN_PORT
      || parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.pathname !== "/" && parsed.pathname !== "")) {
      throw inputError("未识别到有效的局域网班级服务。", "invalid_server_url");
    }
    return `http://${parsed.host}`;
  }

  function isConfirmedStaleServerUrl(value) {
    const normalized = String(value || "").trim().replace(/\/+$/, "").toLowerCase();
    return CONFIRMED_STALE_SERVER_URLS.has(normalized);
  }

  function loadServerUrl() {
    try {
      const storage = window.PhysicsStudioStorageRepository;
      if (!storage) return normalizeServerUrl(DEFAULT_SERVER_URL, { allowEmpty: true });
      const stored = JSON.parse(storage.getItem(CONFIG_KEY) || "null");
      const candidate = stored?.serverUrl ?? DEFAULT_SERVER_URL;
      if (isConfirmedStaleServerUrl(candidate)) {
        storage.removeItem(CONFIG_KEY);
        return normalizeServerUrl(DEFAULT_SERVER_URL, { allowEmpty: true });
      }
      return normalizeServerUrl(candidate, { allowEmpty: true });
    } catch {
      return normalizeServerUrl(DEFAULT_SERVER_URL, { allowEmpty: true });
    }
  }

  function loadShareServerUrl() {
    try {
      const storage = window.PhysicsStudioStorageRepository;
      const stored = JSON.parse(storage?.getItem(CONFIG_KEY) || "null");
      const candidate = String(stored?.shareServerUrl || "").trim();
      if (!candidate) return "";
      const normalized = candidate.toLowerCase().startsWith("http://")
        ? normalizeDiscoveredLanUrl(candidate)
        : normalizeServerUrl(candidate);
      const parsed = new URL(normalized);
      return isPrivateLanHost(parsed.hostname)
        && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1")
        ? ""
        : normalized;
    } catch {
      return "";
    }
  }

  function shareableServerUrl(serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      if (parsed.protocol === "https:") return normalizeServerUrl(serverUrl);
      const normalized = normalizeDiscoveredLanUrl(serverUrl);
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1"
        ? ""
        : normalized;
    } catch {
      return "";
    }
  }

  function selectShareServerUrl(candidates, activeServerUrl) {
    for (const candidate of candidates || []) {
      const shareable = shareableServerUrl(candidate);
      if (shareable) return shareable;
    }
    return shareableServerUrl(activeServerUrl);
  }

  function saveConfirmedServerUrl(serverUrl, clearExistingSession = true, shareServerUrl) {
    const normalized = normalizeServerUrl(serverUrl);
    const previous = loadServerUrl();
    const previousShare = previous === normalized ? loadShareServerUrl() : "";
    const share = shareServerUrl === undefined
      ? (shareableServerUrl(normalized) || previousShare)
      : shareableServerUrl(shareServerUrl);
    const storage = window.PhysicsStudioStorageRepository;
    if (!storage) throw new ClassroomError("无法保存班级服务设置。", { code: "storage_unavailable" });
    try {
      storage.setItem(CONFIG_KEY, JSON.stringify({ serverUrl: normalized, ...(share ? { shareServerUrl: share } : {}) }));
    } catch {
      throw new ClassroomError("无法保存班级服务设置。", { code: "storage_unavailable" });
    }
    if (clearExistingSession && normalized !== previous) clearSession();
    return normalized;
  }

  function configure(input) {
    const serverUrl = normalizeServerUrl(
      typeof input === "string" ? input : input?.serverUrl
    );
    if (isConfirmedStaleServerUrl(serverUrl)) {
      throw new ClassroomError("该地址是旧版无效班级服务地址，请使用 8788 端口的局域网服务。", {
        code: "invalid_server_url"
      });
    }
    saveConfirmedServerUrl(serverUrl, true);
    return status();
  }

  async function login(input = {}) {
    const loginName = requiredText(input.login, "登录名", 120);
    const password = requiredPassword(input.password);
    const deviceName = requiredText(input.deviceName, "设备名称", 80);
    const deviceId = stableDeviceId();
    const result = await requestJson("/v1/auth/login", {
      method: "POST",
      auth: false,
      body: { login: loginName, password, deviceId, deviceName }
    });
    const auth = validateAuthResponse(result);
    saveSession(auth);
    void flushSyncQueue();
    return Object.freeze({ ...auth.user });
  }

  function readOwnerCapabilities() {
    try {
      const value = JSON.parse(syncStorage().getItem(OWNER_CAPABILITIES_KEY) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const now = Date.now();
      const valid = {};
      const activeServerUrl = loadServerUrl();
      for (const [classId, record] of Object.entries(value)) {
        if (!UUID_PATTERN.test(classId) || !record || typeof record !== "object") continue;
        const token = String(record.token || "");
        const expiresAt = new Date(String(record.expiresAt || "")).getTime();
        if (!OWNER_CAPABILITY_PATTERN.test(token) || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
        let recordServerUrl = "";
        try {
          recordServerUrl = record.serverUrl
            ? normalizeServerUrl(record.serverUrl, { allowEmpty: true })
            : activeServerUrl;
        } catch {
          recordServerUrl = "";
        }
        if (isConfirmedStaleServerUrl(recordServerUrl)) recordServerUrl = "";
        valid[classId.toLowerCase()] = {
          classId: classId.toLowerCase(),
          ownerUserId: String(record.ownerUserId || ""),
          token,
          expiresAt: new Date(expiresAt).toISOString(),
          class: record.class && typeof record.class === "object" ? record.class : null,
          serverUrl: recordServerUrl,
          source: recordServerUrl ? String(record.source || "server") : "legacy-unverified"
        };
      }
      if (JSON.stringify(valid) !== JSON.stringify(value)) {
        try { syncStorage().setItem(OWNER_CAPABILITIES_KEY, JSON.stringify(valid)); } catch { /* read path */ }
      }
      return valid;
    } catch {
      return {};
    }
  }

  function currentOwnerCapability(classId = "", serverUrl = loadServerUrl()) {
    const records = readOwnerCapabilities();
    const target = String(classId || "").toLowerCase();
    const normalizedServer = String(serverUrl || "");
    if (target && records[target]?.serverUrl === normalizedServer) return records[target];
    return Object.values(records).find((record) => record.serverUrl === normalizedServer) || null;
  }

  function saveOwnerCapability(classId, record) {
    const id = uuid(classId, "class id");
    const records = readOwnerCapabilities();
    records[id] = {
      ...record,
      classId: id,
      serverUrl: normalizeServerUrl(record.serverUrl || loadServerUrl()),
      source: "server"
    };
    try {
      syncStorage().setItem(OWNER_CAPABILITIES_KEY, JSON.stringify(records));
    } catch {
      throw new ClassroomError("无法保存本机班级管理能力。", { code: "storage_unavailable" });
    }
  }

  function removeOwnerCapability(classId) {
    const id = String(classId || "").toLowerCase();
    const records = readOwnerCapabilities();
    if (!records[id]) return;
    delete records[id];
    try {
      syncStorage().setItem(OWNER_CAPABILITIES_KEY, JSON.stringify(records));
    } catch {
      throw new ClassroomError("无法更新本机班级管理能力。", { code: "storage_unavailable" });
    }
  }

  function status() {
    const configuredServerUrl = loadServerUrl();
    const hosted = hostedNativeServices();
    const serverUrl = configuredServerUrl || hosted.serverUrl;
    const accessToken = readSessionValue(ACCESS_TOKEN_KEY);
    const refreshToken = readSessionValue(REFRESH_TOKEN_KEY);
    const user = readStoredUser();
    const authenticated = Boolean(accessToken && refreshToken && user);
    if (!authenticated && (accessToken || refreshToken || user)) clearSession();
    const owner = currentOwnerCapability();
    const ownerAuthenticated = Boolean(owner);
    const legacyOwnerCount = Object.values(readOwnerCapabilities())
      .filter((record) => record.source === "legacy-unverified").length;
    return Object.freeze({
      serverUrl,
      serviceConfigured: Boolean(serverUrl),
      hostedLocally: Boolean(hosted.serverUrl),
      authenticated,
      ownerAuthenticated,
      legacyOwnerCount,
      user: authenticated ? Object.freeze({ ...user }) : owner
        ? Object.freeze({ id: owner.ownerUserId, role: "teacher", displayName: "本机教师", status: "active" })
        : null,
      // The transport always attempts the configured service first.  Lack of
      // credentials only limits protected class operations; it must not turn
      // the application into an online-only or permanently offline mode.
      syncMode: "online-first",
      boundary: hosted.serverUrl
        ? "本机局域网班级主机已就绪；学生需连接同一 Wi-Fi 或局域网后通过邀请码或二维码加入。"
        : !serverUrl
        ? "班级服务尚未配置；本机学习功能可继续使用，但创建或加入班级必须联网。"
        : authenticated || ownerAuthenticated
          ? "联网优先；教师管理能力仅限于自己创建的班级，学生邀请码只授予学生权限。"
          : "班级操作以服务端确认为准；网络不可用时不会伪造创建或加入成功。"
    });
  }

  async function logout() {
    const refreshToken = readSessionValue(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      clearSession();
      return;
    }
    let failure = null;
    try {
      await requestJson("/v1/auth/logout", {
        method: "POST",
        auth: false,
        body: { refreshToken }
      });
    } catch (error) {
      failure = error;
    } finally {
      clearSession();
    }
    if (failure) throw failure;
  }

  async function listClasses(options = {}) {
    const cursor = cursorFrom(options);
    const accessToken = readSessionValue(ACCESS_TOKEN_KEY);
    if (accessToken) {
      return requestJson(`/v1/classes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
        method: "GET",
        auth: true
      });
    }
    const owners = Object.values(readOwnerCapabilities());
    if (!owners.length) {
      throw new ClassroomError("尚未创建或登录班级。", { code: "authentication_required", status: 401 });
    }
    const outcomes = await Promise.allSettled(owners.map((owner) => getClass(owner.classId)));
    const items = [];
    let firstFailure = null;
    for (let index = 0; index < outcomes.length; index += 1) {
      const outcome = outcomes[index];
      const owner = owners[index];
      if (outcome.status === "fulfilled") {
        items.push(outcome.value);
      } else {
        firstFailure ||= outcome.reason;
        if (outcome.reason?.code === "class_not_found" || outcome.reason?.status === 404) {
          removeOwnerCapability(owner.classId);
        }
      }
    }
    if (items.length) {
      items.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
      return Object.freeze({ items: items.slice(0, 100), nextCursor: null, source: "online" });
    }
    const cached = owners.map((owner) => owner.class).filter(Boolean);
    if (cached.length && ["network_error", "request_timeout"].includes(firstFailure?.code)) {
      return Object.freeze({ items: cached, nextCursor: null, source: "offline-cache" });
    }
    throw firstFailure || new ClassroomError("无法读取班级。", { code: "classroom_error" });
  }

  async function getClass(classId) {
    const id = uuid(classId, "班级编号");
    return requestJson(`/v1/classes/${encodeURIComponent(id)}`, { method: "GET" });
  }

  async function listRoster(classId, options = {}) {
    const id = uuid(classId, "班级编号");
    const cursor = cursorFrom(options);
    return requestJson(
      `/v1/classes/${encodeURIComponent(id)}/roster${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { method: "GET" }
    );
  }

  async function listGroups(classId, options = {}) {
    const id = uuid(classId, "班级编号");
    const cursor = cursorFrom(options);
    return requestJson(
      `/v1/classes/${encodeURIComponent(id)}/groups${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { method: "GET" }
    );
  }

  async function createGroup(classId, input = {}) {
    const name = requiredText(typeof input === "string" ? input : input.name, "分组名称", 80);
    return requestJson(`/v1/classes/${encodeURIComponent(uuid(classId, "班级编号"))}/groups`, {
      method: "POST",
      body: { name }
    });
  }

  async function updateMembership(membershipId, changes = {}) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw inputError("成员修改内容无效。", "invalid_membership_update");
    }
    const allowed = new Set(["status", "groupId", "studentNumber"]);
    const unknown = Object.keys(changes).filter((key) => !allowed.has(key));
    if (unknown.length) throw inputError("成员修改包含不支持的字段。", "invalid_membership_update");
    const payload = {};
    if (Object.prototype.hasOwnProperty.call(changes, "status")) {
      if (changes.status !== "active" && changes.status !== "removed") {
        throw inputError("成员状态无效。", "invalid_membership_status");
      }
      payload.status = changes.status;
    }
    if (Object.prototype.hasOwnProperty.call(changes, "groupId")) {
      payload.groupId = changes.groupId === null ? null : uuid(changes.groupId, "分组编号");
    }
    if (Object.prototype.hasOwnProperty.call(changes, "studentNumber")) {
      payload.studentNumber = changes.studentNumber === null
        ? null
        : requiredText(changes.studentNumber, "学号", 40);
    }
    if (!Object.keys(payload).length) {
      throw inputError("至少需要修改一项成员信息。", "invalid_membership_update");
    }
    return requestJson(`/v1/memberships/${encodeURIComponent(uuid(membershipId, "成员编号"))}`, {
      method: "PATCH",
      body: payload,
      authMode: "owner"
    });
  }

  async function refreshSession() {
    if (refreshInFlight) return refreshInFlight;
    const refreshToken = readSessionValue(REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new ClassroomError("登录已失效，请重新登录。", { code: "authentication_expired" });
    refreshInFlight = (async () => {
      const result = await requestJson("/v1/auth/refresh", {
        method: "POST",
        auth: false,
        body: { refreshToken }
      });
      const auth = validateAuthResponse(result);
      saveSession(auth);
      return auth;
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  async function readResponseText(response) {
    let text;
    try {
      text = await response.text();
    } catch {
      throw new ClassroomError("无法读取班级服务响应。", {
        code: "invalid_server_response",
        status: response.status
      });
    }
    if (text.length > MAX_RESPONSE_CHARS) {
      throw new ClassroomError("班级服务响应超过安全大小限制。", {
        code: "response_too_large",
        status: response.status
      });
    }
    return text;
  }

  function sanitizedServerError(statusCode, text) {
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const code = sanitizeCode(body?.code) || `http_${Number(statusCode) || 0}`;
    const statusMessage = statusCode === 401
      ? "登录信息无效。"
      : statusCode === 403
        ? "当前账号没有执行此操作的权限。"
        : statusCode === 404
          ? "请求的班级资源不存在。"
          : statusCode === 409
            ? "当前数据状态不允许该操作，请刷新后重试。"
            : statusCode === 429
              ? "操作过于频繁，请稍后再试。"
              : statusCode >= 500
                ? "班级服务暂时不可用，请稍后再试。"
                : "班级服务拒绝了本次请求。";
    return new ClassroomError(SAFE_ERROR_MESSAGES[code] || statusMessage, {
      code,
      status: Number(statusCode) || 0,
      requestId: body?.requestId
    });
  }

  function validateAuthResponse(value) {
    if (!value || typeof value !== "object") throw invalidAuthResponse();
    const accessToken = String(value.accessToken || "");
    const refreshToken = String(value.refreshToken || "");
    if (accessToken.length < 80 || accessToken.length > 4096 || !REFRESH_TOKEN_PATTERN.test(refreshToken)) {
      throw invalidAuthResponse();
    }
    const user = value.user;
    if (!user || typeof user !== "object" || !UUID_PATTERN.test(String(user.id || ""))
      || !ROLES.has(user.role) || !["active", "disabled"].includes(user.status)
      || typeof user.mustChangePassword !== "boolean" || typeof user.deletionPending !== "boolean") {
      throw invalidAuthResponse();
    }
    const displayName = requiredText(user.displayName, "用户名称", 80);
    return {
      accessToken,
      refreshToken,
      user: {
        id: String(user.id).toLowerCase(),
        role: user.role,
        displayName,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        deletionPending: user.deletionPending
      }
    };
  }

  function invalidAuthResponse() {
    return new ClassroomError("登录服务返回了无效的身份信息。", {
      code: "invalid_auth_response"
    });
  }

  function saveSession(auth) {
    try {
      window.sessionStorage.setItem(ACCESS_TOKEN_KEY, auth.accessToken);
      window.sessionStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
      window.sessionStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    } catch {
      clearSession();
      throw new ClassroomError("无法在当前会话中保存登录信息。", {
        code: "session_storage_unavailable"
      });
    }
  }

  function clearSession() {
    try {
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      window.sessionStorage.removeItem(USER_KEY);
      window.sessionStorage.removeItem(GUEST_SESSION_KEY);
    } catch {
      // 会话存储不可用时没有更多可清理的数据边界。
    }
  }

  function readSessionValue(key) {
    try {
      return String(window.sessionStorage.getItem(key) || "");
    } catch {
      return "";
    }
  }

  function readStoredUser() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(USER_KEY) || "null");
      if (!value || !UUID_PATTERN.test(String(value.id || "")) || !ROLES.has(value.role)) return null;
      return {
        id: String(value.id).toLowerCase(),
        role: value.role,
        displayName: String(value.displayName || "").slice(0, 80),
        status: value.status === "disabled" ? "disabled" : "active",
        mustChangePassword: Boolean(value.mustChangePassword),
        deletionPending: Boolean(value.deletionPending)
      };
    } catch {
      return null;
    }
  }

  function stableDeviceId() {
    let existing = "";
    try {
      const storage = window.PhysicsStudioStorageRepository;
      if (!storage) throw new ClassroomError("无法读取本机班级服务设备标识。", { code: "storage_unavailable" });
      existing = String(storage.getItem(DEVICE_ID_KEY) || "");
    } catch {
      throw new ClassroomError("无法读取本机班级服务设备标识。", {
        code: "storage_unavailable"
      });
    }
    if (DEVICE_ID_PATTERN.test(existing)) return existing.toLowerCase();
    const id = randomHex(32);
    try {
      const storage = window.PhysicsStudioStorageRepository;
      if (!storage) throw new ClassroomError("无法保存稳定的班级服务设备标识。", { code: "storage_unavailable" });
      storage.setItem(DEVICE_ID_KEY, id);
      if (storage.getItem(DEVICE_ID_KEY) !== id) throw new Error("not persisted");
    } catch {
      throw new ClassroomError("无法保存稳定的班级服务设备标识。", {
        code: "storage_unavailable"
      });
    }
    return id;
  }

  function randomIdempotencyKey() {
    return `ps-${randomHex(24)}`;
  }

  function randomHex(byteLength) {
    if (!window.crypto?.getRandomValues) {
      throw new ClassroomError("当前环境不支持安全随机数，不能连接班级服务。", {
        code: "secure_random_unavailable"
      });
    }
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function requiredText(value, label, maxLength) {
    const text = String(value ?? "").trim();
    if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
      throw inputError(`${label}不能为空，且不能超过 ${maxLength} 个字符。`, "invalid_input");
    }
    return text;
  }

  function requiredPassword(value) {
    if (typeof value !== "string" || !value.length || value.length > 1024) {
      throw inputError("密码不能为空，且不能超过 1024 个字符。", "invalid_password");
    }
    return value;
  }

  function uuid(value, label) {
    const text = String(value || "").trim();
    if (!UUID_PATTERN.test(text)) throw inputError(`${label}格式不正确。`, "invalid_identifier");
    return text.toLowerCase();
  }

  function cursorFrom(options) {
    const value = typeof options === "string" ? options : options?.cursor;
    return value ? uuid(value, "分页游标") : "";
  }

  function syncStorage() {
    if (!window.PhysicsStudioStorageRepository) {
      throw new ClassroomError("无法访问同步存储。", { code: "storage_unavailable" });
    }
    return window.PhysicsStudioStorageRepository;
  }

  function readSyncList(key) {
    try {
      const value = JSON.parse(syncStorage().getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
    } catch {
      return [];
    }
  }

  function writeSyncList(key, value) {
    try {
      syncStorage().setItem(key, JSON.stringify(value.slice(-MAX_SYNC_QUEUE_ITEMS)));
    } catch {
      throw new ClassroomError("无法保存待同步学习事件。", { code: "storage_unavailable" });
    }
  }

  function newClientEventId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const hex = randomHex(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
  }

  function isOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function syncEventFingerprint(input = {}) {
    const body = input.body && typeof input.body === "object" ? { ...input.body } : {};
    delete body.clientEventId;
    delete body.clientCreatedAt;
    return JSON.stringify({
      kind: String(input.kind || ""),
      path: String(input.path || ""),
      method: String(input.method || "POST").toUpperCase(),
      body
    });
  }

  function syncStatus() {
    const queue = readSyncList(SYNC_QUEUE_KEY);
    const conflicts = readSyncList(SYNC_CONFLICT_KEY);
    const authenticated = status().authenticated;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    let state = "synced";
    let label = "已同步";
    if (conflicts.length) {
      state = "sync-conflict";
      label = "同步冲突";
    } else if (queue.length) {
      state = "waiting-sync";
      label = "等待同步";
    } else if (!authenticated || offline) {
      state = "offline-local";
      label = "本机已保存";
    }
    return Object.freeze({
      state,
      label,
      pending: queue.length,
      conflicts: conflicts.length,
      authenticated,
      online: !offline,
      detail: conflicts.length
        ? "存在需要教师或学生确认的同步冲突，原始本机记录仍保留。"
        : queue.length
          ? `本机已保存 ${queue.length} 个事件，网络恢复后按顺序同步。`
          : authenticated && !offline
            ? "学习摘要已同步。"
            : "当前只写入本机学习记录。"
    });
  }

  function enqueueSyncEvent(input = {}) {
    const pathValue = String(input.path || "");
    if (!pathValue.startsWith("/v1/")) {
      throw inputError("同步目标不受支持。", "invalid_sync_target");
    }
    const event = {
      id: newClientEventId(),
      kind: requiredText(input.kind, "同步事件类型", 40),
      path: pathValue,
      method: String(input.method || "POST").toUpperCase(),
      body: input.body && typeof input.body === "object" ? input.body : {},
      baseRevision: Number.isInteger(input.baseRevision) && input.baseRevision >= 0 ? input.baseRevision : 0,
      idempotencyKey: randomIdempotencyKey(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: ""
    };
    const queue = readSyncList(SYNC_QUEUE_KEY);
    const fingerprint = syncEventFingerprint(event);
    const existing = queue.find((item) => syncEventFingerprint(item) === fingerprint);
    if (existing) return existing;
    event.fingerprint = fingerprint;
    queue.push(event);
    writeSyncList(SYNC_QUEUE_KEY, queue);
    return event;
  }

  function removeQueuedEvent(eventId) {
    writeSyncList(SYNC_QUEUE_KEY, readSyncList(SYNC_QUEUE_KEY).filter((item) => item.id !== eventId));
  }

  function recordSyncConflict(event, error) {
    const conflicts = readSyncList(SYNC_CONFLICT_KEY);
    conflicts.push({
      ...event,
      conflictCode: error?.code || "sync_conflict",
      conflictMessage: error?.message || "同步冲突",
      detectedAt: new Date().toISOString()
    });
    writeSyncList(SYNC_CONFLICT_KEY, conflicts);
  }

  function acknowledgeSyncConflict(eventId) {
    const conflicts = readSyncList(SYNC_CONFLICT_KEY);
    writeSyncList(SYNC_CONFLICT_KEY, conflicts.filter((item) => item.id !== eventId));
    return syncStatus();
  }

  async function flushSyncQueue() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return syncStatus();
    if (!status().authenticated) return syncStatus();
    const queue = readSyncList(SYNC_QUEUE_KEY);
    let accepted = 0;
    for (const event of queue) {
      try {
        await requestJson(event.path, {
          method: event.method,
          body: event.body
        }, true, event.idempotencyKey);
        removeQueuedEvent(event.id);
        accepted += 1;
      } catch (error) {
        const conflict = error?.status === 409 || ["sync_conflict", "sync_event_conflict", "idempotency_mismatch"].includes(error?.code);
        if (conflict) {
          recordSyncConflict(event, error);
          removeQueuedEvent(event.id);
        } else {
          const current = readSyncList(SYNC_QUEUE_KEY);
          const item = current.find((entry) => entry.id === event.id);
          if (item) {
            item.attempts = Number(item.attempts || 0) + 1;
            item.lastError = error?.code || "network_error";
            writeSyncList(SYNC_QUEUE_KEY, current);
          }
        }
        break;
      }
    }
    return Object.freeze({ ...syncStatus(), acceptedThisRun: accepted });
  }

  function syncBody(input, defaults = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw inputError("同步内容无效。", "invalid_sync_payload");
    }
    const body = { ...input, ...defaults };
    body.deviceId = body.deviceId || stableDeviceId();
    body.clientEventId = body.clientEventId || newClientEventId();
    if (!Number.isInteger(body.baseRevision) || body.baseRevision < 0) body.baseRevision = 0;
    body.clientCreatedAt = body.clientCreatedAt || new Date().toISOString();
    return body;
  }

  async function syncLearning(classId, input = {}) {
    const id = uuid(classId, "班级编号");
    const body = syncBody(input);
    const event = {
      kind: "learning-attempts",
      path: `/v1/classes/${encodeURIComponent(id)}/learning/sync`,
      method: "POST",
      body,
      baseRevision: body.baseRevision
    };
    if (isOffline() || !status().authenticated) {
      enqueueSyncEvent(event);
      return Object.freeze({ queued: true, ...syncStatus() });
    }
    try {
      const result = await requestJson(event.path, { method: event.method, body: event.body });
      return Object.freeze({ ...result, queued: false, ...syncStatus() });
    } catch (error) {
      if (error?.status === 0 || error?.code === "network_error" || error?.code === "request_timeout") {
        enqueueSyncEvent(event);
        return Object.freeze({ queued: true, ...syncStatus() });
      }
      throw error;
    }
  }

  async function syncExamRecords(classId, input = {}) {
    const id = uuid(classId, "班级编号");
    const body = syncBody(input);
    const event = {
      kind: "learning-exams",
      path: `/v1/classes/${encodeURIComponent(id)}/learning/exams`,
      method: "POST",
      body,
      baseRevision: body.baseRevision
    };
    if (isOffline() || !status().authenticated) {
      enqueueSyncEvent(event);
      return Object.freeze({ queued: true, ...syncStatus() });
    }
    try {
      const result = await requestJson(event.path, { method: event.method, body: event.body });
      return Object.freeze({ ...result, queued: false, ...syncStatus() });
    } catch (error) {
      if (error?.status === 0 || error?.code === "network_error" || error?.code === "request_timeout") {
        enqueueSyncEvent(event);
        return Object.freeze({ queued: true, ...syncStatus() });
      }
      throw error;
    }
  }

  async function listAssignments(classId) {
    const id = uuid(classId, "班级编号");
    return requestJson(`/v1/classes/${encodeURIComponent(id)}/assignments`, { method: "GET" });
  }

  async function createAssignment(classId, input = {}) {
    const id = uuid(classId, "班级编号");
    const targetType = ["class", "group", "student"].includes(input.targetType)
      ? input.targetType
      : "class";
    const body = {
      title: requiredText(input.title, "作业标题", 160),
      instructions: String(input.instructions || "").slice(0, 30000),
      dueAt: input.dueAt ? normalizeDateTime(input.dueAt, "截止时间") : null,
      targetType,
      targetId: input.targetId || null,
      questionIds: Array.isArray(input.questionIds) ? input.questionIds.map((value) => requiredText(value, "题目编号", 160)).slice(0, 100) : [],
      knowledgePointKeys: Array.isArray(input.knowledgePointKeys) ? input.knowledgePointKeys.map((value) => requiredText(value, "知识点编号", 160)).slice(0, 100) : [],
      target: requiredText(input.target, "达标条件", 1000),
      publish: Boolean(input.publish)
    };
    const event = {
      kind: "assignment-create",
      path: `/v1/classes/${encodeURIComponent(id)}/assignments`,
      method: "POST",
      body,
      baseRevision: 0
    };
    if (isOffline() || (!status().authenticated && !currentOwnerCapability(id))) {
      enqueueSyncEvent(event);
      return Object.freeze({ queued: true, ...syncStatus() });
    }
    try {
      const result = await requestJson(event.path, { method: event.method, body: event.body });
      return Object.freeze({ ...result, queued: false, ...syncStatus() });
    } catch (error) {
      if (error?.status === 0 || error?.code === "network_error" || error?.code === "request_timeout") {
        enqueueSyncEvent(event);
        return Object.freeze({ queued: true, ...syncStatus() });
      }
      throw error;
    }
  }

  async function submitAssignment(assignmentId, input = {}) {
    const id = uuid(assignmentId, "方案编号");
    const body = {
      clientEntityId: requiredText(input.clientEntityId, "提交编号", 160),
      answers: Array.isArray(input.answers) ? input.answers : []
    };
    const event = {
      kind: "assignment-submission",
      path: `/v1/assignments/${encodeURIComponent(id)}/submissions`,
      method: "POST",
      body,
      baseRevision: 0
    };
    if (isOffline() || !status().authenticated) {
      enqueueSyncEvent(event);
      return Object.freeze({ queued: true, ...syncStatus() });
    }
    try {
      const result = await requestJson(event.path, { method: event.method, body: event.body });
      return Object.freeze({ ...result, queued: false, ...syncStatus() });
    } catch (error) {
      if (error?.status === 0 || error?.code === "network_error" || error?.code === "request_timeout") {
        enqueueSyncEvent(event);
        return Object.freeze({ queued: true, ...syncStatus() });
      }
      throw error;
    }
  }

  async function getClassLearningSummary(classId) {
    const id = uuid(classId, "班级编号");
    return requestJson(`/v1/classes/${encodeURIComponent(id)}/learning/summary`, { method: "GET" });
  }

  async function listReviewCases(classId) {
    const id = uuid(classId, "班级编号");
    return requestJson(`/v1/classes/${encodeURIComponent(id)}/review-cases`, { method: "GET" });
  }

  async function decideReviewCase(reviewId, input = {}) {
    const id = uuid(reviewId, "复核编号");
    return requestJson(`/v1/review-cases/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input
    });
  }

  async function saveReportSnapshot(classId, input = {}) {
    const id = uuid(classId, "班级编号");
    const body = syncBody(input, { snapshot: input.snapshot || {} });
    delete body.deviceId;
    delete body.clientEventId;
    delete body.clientCreatedAt;
    const event = {
      kind: "learning-report",
      path: `/v1/classes/${encodeURIComponent(id)}/learning/report-snapshots`,
      method: "POST",
      body,
      baseRevision: body.baseRevision
    };
    if (isOffline() || !status().authenticated) {
      enqueueSyncEvent(event);
      return Object.freeze({ queued: true, ...syncStatus() });
    }
    try {
      const result = await requestJson(event.path, { method: event.method, body: event.body });
      return Object.freeze({ ...result, queued: false, ...syncStatus() });
    } catch (error) {
      if (error?.status === 0 || error?.code === "network_error" || error?.code === "request_timeout") {
        enqueueSyncEvent(event);
        return Object.freeze({ queued: true, ...syncStatus() });
      }
      throw error;
    }
  }

  async function listReportSnapshots(classId, profileClientEntityId) {
    const id = uuid(classId, "班级编号");
    const profileId = requiredText(profileClientEntityId, "学生档案编号", 160);
    return requestJson(
      `/v1/classes/${encodeURIComponent(id)}/learning/report-snapshots/${encodeURIComponent(profileId)}`,
      { method: "GET" },
    );
  }

  async function requestTransport(serverUrl, path, fetchOptions) {
    const parsed = new URL(serverUrl);
    const privateLanHttp = parsed.protocol === "http:" && isPrivateLanHost(parsed.hostname);
    const native = nativeLanTransport();
    if (privateLanHttp && native && typeof native.request === "function") {
      let result;
      try {
        result = await native.request({
          serverUrl,
          path,
          method: fetchOptions.method,
          headers: { ...fetchOptions.headers },
          bodyText: fetchOptions.body || "",
          timeoutMs: REQUEST_TIMEOUT_MS
        });
      } catch (error) {
        if (error?.code === "request_timeout") {
          throw new ClassroomError("班级服务请求超时。", { code: "request_timeout" });
        }
        throw new ClassroomError("无法连接班级服务；本次班级操作未完成，本机学习记录不受影响。", {
          code: "network_error"
        });
      }
      const statusCode = Number(result?.status);
      const bodyText = String(result?.bodyText || "");
      if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599
        || bodyText.length > MAX_RESPONSE_CHARS) {
        throw new ClassroomError("班级服务返回了无效响应。", { code: "invalid_server_response" });
      }
      return {
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        async text() { return bodyText; }
      };
    }
    return window.fetch(`${serverUrl}${path}`, fetchOptions);
  }

  // v3 transport: bearer sessions remain the default for student learning;
  // the scoped Owner scheme is used only for the class-management calls made
  // by the local creator.  Network retries are bounded to one GET retry so a
  // mutation is never duplicated by the client.
  async function requestJson(path, options = {}, retry = true, idempotencyKey = "", networkRetry = true) {
    const method = String(options.method || "GET").toUpperCase();
    const serverUrl = options.serverUrl
      ? normalizeServerUrl(options.serverUrl)
      : loadServerUrl();
    if (!serverUrl) {
      throw new ClassroomError("尚未配置可访问的班级服务地址。", {
        code: "service_not_configured",
      });
    }
    const auth = options.auth !== false;
    const authMode = String(options.authMode || "auto");
    const bearer = readSessionValue(ACCESS_TOKEN_KEY);
    const classMatch = String(path).match(/\/v1\/classes\/([0-9a-f-]{36})/i);
    const owner = currentOwnerCapability(classMatch?.[1] || "", serverUrl);
    const useOwner = auth && authMode !== "bearer" && Boolean(owner)
      && (authMode === "owner" || Boolean(classMatch));
    if (auth && authMode === "bearer" && !bearer) {
      throw new ClassroomError("请先登录学生账号再加入班级。", { code: "authentication_required", status: 401 });
    }
    if (auth && !bearer && !useOwner) {
      throw new ClassroomError("当前操作需要联网身份或本机班级管理能力。", { code: "authentication_required", status: 401 });
    }
    const token = useOwner ? owner?.token : bearer;
    const mutationKey = method === "GET" || method === "HEAD" ? "" : (idempotencyKey || randomIdempotencyKey());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await requestTransport(serverUrl, path, {
        method,
        headers: {
          Accept: "application/json",
          "X-Physics-Studio-Client": "physics-studio-classroom/3.1",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(auth && token ? { Authorization: `${useOwner ? "Owner" : "Bearer"} ${token}` } : {}),
          ...(mutationKey ? { "Idempotency-Key": mutationKey } : {})
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        if (networkRetry && (method === "GET" || method === "HEAD")) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return requestJson(path, options, retry, idempotencyKey, false);
        }
        throw new ClassroomError("班级服务请求超时。", { code: "request_timeout" });
      }
      if (networkRetry && (method === "GET" || method === "HEAD")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return requestJson(path, options, retry, idempotencyKey, false);
      }
      throw new ClassroomError("无法连接班级服务；本次班级操作未完成，本机学习记录不受影响。", { code: "network_error" });
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 && auth && !useOwner && retry && readSessionValue(REFRESH_TOKEN_KEY)) {
      try { await refreshSession(); } catch {
        clearSession();
        throw new ClassroomError("登录已失效，请重新登录。", { code: "authentication_expired", status: 401 });
      }
      return requestJson(path, options, false, mutationKey, false);
    }
    const text = await readResponseText(response);
    if (!response.ok) throw sanitizedServerError(response.status, text);
    if (response.status === 204 || !text) return null;
    try { return JSON.parse(text); } catch {
      throw new ClassroomError("班级服务返回了无法识别的数据。", { code: "invalid_server_response", status: response.status });
    }
  }

  async function checkHealth() {
    const result = await requestJson("/health/live", {
      method: "GET",
      auth: false,
    });
    if (result?.status !== "ok") {
      throw new ClassroomError("班级服务健康检查返回异常。", {
        code: "service_unhealthy",
      });
    }
    return Object.freeze({ ...result });
  }

  async function createClass(input = {}) {
    const name = requiredText(input.name, "班级名称", 120);
    const payload = { name };
    if (String(input.grade || "").trim()) payload.grade = String(input.grade).trim();
    if (input.schoolLabel !== undefined) payload.schoolLabel = input.schoolLabel;
    const sessionUser = readStoredUser();
    if (readSessionValue(ACCESS_TOKEN_KEY)
      && (sessionUser?.role === "teacher" || sessionUser?.role === "administrator")) {
      return requestJson("/v1/classes", { method: "POST", body: payload });
    }
    const hosted = hostedNativeServices();
    const configuredServer = loadServerUrl();
    const discoveredServers = [...hosted.services];
    const candidates = [];
    const appendCandidate = (value) => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };
    appendCandidate(hosted.serverUrl);
    appendCandidate(configuredServer);
    if (!candidates.length) {
      for (const value of await discoverServices()) {
        if (!discoveredServers.includes(value)) discoveredServers.push(value);
        appendCandidate(value);
      }
    }
    if (!candidates.length) {
      throw new ClassroomError("未发现可访问的班级服务；请确认教师电脑已打开且设备位于同一网络。", {
        code: "service_not_configured"
      });
    }
    let result = null;
    let confirmedServer = "";
    let lastUnavailable = null;
    for (const serverUrl of candidates) {
      try {
        result = await requestJson("/v1/classes/anonymous", {
          method: "POST",
          auth: false,
          body: payload,
          serverUrl,
        });
        confirmedServer = serverUrl;
        break;
      } catch (error) {
        if (error?.code !== "network_error" && error?.code !== "request_timeout") throw error;
        lastUnavailable = error;
      }
    }
    if (!result) {
      for (const serverUrl of await discoverServices()) {
        if (!discoveredServers.includes(serverUrl)) discoveredServers.push(serverUrl);
        if (candidates.includes(serverUrl)) continue;
        candidates.push(serverUrl);
        try {
          result = await requestJson("/v1/classes/anonymous", {
            method: "POST",
            auth: false,
            body: payload,
            serverUrl,
          });
          confirmedServer = serverUrl;
          break;
        } catch (error) {
          if (error?.code !== "network_error" && error?.code !== "request_timeout") throw error;
          lastUnavailable = error;
        }
      }
    }
    if (!result || !confirmedServer) {
      throw lastUnavailable || new ClassroomError("无法连接局域网班级服务。", { code: "network_error" });
    }
    if (!result?.class || !UUID_PATTERN.test(String(result.class.id || ""))
      || !UUID_PATTERN.test(String(result.ownerUserId || ""))
      || !OWNER_CAPABILITY_PATTERN.test(String(result.ownerCapability || ""))) {
      throw new ClassroomError("班级服务返回了无效的班级身份信息。", { code: "invalid_class_response" });
    }
    if (!configuredServer || confirmedServer !== configuredServer) {
      saveConfirmedServerUrl(
        confirmedServer,
        true,
        selectShareServerUrl(discoveredServers, confirmedServer),
      );
    }
    saveOwnerCapability(result.class.id, {
      ownerUserId: result.ownerUserId,
      token: result.ownerCapability,
      expiresAt: result.ownerCapabilityExpiresAt,
      class: result.class,
      serverUrl: confirmedServer
    });
    return Object.freeze({ ...result.class, ownerUserId: result.ownerUserId });
  }

  async function createInvite(classId, input = {}) {
    const id = uuid(classId, "class id");
    const expiresAt = input.expiresAt
      ? normalizeDateTime(input.expiresAt, "invite expiry")
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000).toISOString();
    const maxUses = input.maxUses == null ? 1000 : Number(input.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) throw inputError("invite maxUses is invalid", "invalid_max_uses");
    const result = await requestJson(`/v1/classes/${encodeURIComponent(id)}/invites`, {
      method: "POST", body: { expiresAt, maxUses }, authMode: "owner"
    });
    const code = String(result?.code || "");
    if (!INVITE_CODE_PATTERN.test(code)) throw new ClassroomError("邀请码格式无效。", { code: "invalid_invite_response" });
    const serverUrl = loadServerUrl();
    let shareServerUrl = loadShareServerUrl() || shareableServerUrl(serverUrl);
    if (!shareServerUrl && nativeLanTransport()) {
      shareServerUrl = selectShareServerUrl(await discoverServices(), serverUrl);
      if (shareServerUrl) saveConfirmedServerUrl(serverUrl, false, shareServerUrl);
    }
    const share = (() => {
      if (!shareServerUrl) return "";
      const parsed = new URL(shareServerUrl);
      if (parsed.protocol === "http:") return `&s=${encodeURIComponent(parsed.hostname)}`;
      return `&h=${encodeURIComponent(parsed.host)}`;
    })();
    return Object.freeze({
      ...result,
      classId: id,
      joinUrl: `physicsstudio://join?c=${encodeURIComponent(id)}&i=${encodeURIComponent(code)}${share}`
    });
  }

  function parseInvitePayload(payload) {
    const value = String(payload || "").trim();
    if (INVITE_CODE_PATTERN.test(value)) {
      return Object.freeze({ classId: "", code: value, serverUrl: "" });
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw inputError("未识别到有效班级邀请码。", "invalid_invite_code");
    }
    const code = String(parsed.searchParams.get("code") || parsed.searchParams.get("i") || "").trim();
    const classId = String(parsed.searchParams.get("class_id") || parsed.searchParams.get("c") || "").trim().toLowerCase();
    let serverUrl = "";
    const serverValue = String(parsed.searchParams.get("server") || "").trim();
    if (serverValue) {
      try {
        serverUrl = String(serverValue).toLowerCase().startsWith("https://")
          ? normalizeServerUrl(serverValue)
          : normalizeDiscoveredLanUrl(serverValue);
      } catch {
        throw inputError("未识别到有效班级邀请码。", "invalid_invite_code");
      }
    }
    if (!serverUrl && parsed.searchParams.get("s")) {
      try {
        const host = String(parsed.searchParams.get("s") || "").trim();
        serverUrl = normalizeDiscoveredLanUrl(`http://${host}:${CLASSROOM_LAN_PORT}`);
      } catch {
        throw inputError("未识别到有效班级邀请码。", "invalid_invite_code");
      }
    }
    if (!serverUrl && parsed.searchParams.get("h")) {
      try {
        serverUrl = normalizeServerUrl(`https://${String(parsed.searchParams.get("h") || "").trim()}`);
      } catch {
        throw inputError("未识别到有效班级邀请码。", "invalid_invite_code");
      }
    }
    if (!INVITE_CODE_PATTERN.test(code) || (classId && !UUID_PATTERN.test(classId))) {
      throw inputError("未识别到有效班级邀请码。", "invalid_invite_code");
    }
    return Object.freeze({ classId, code, serverUrl });
  }

  async function discoverServices() {
    const native = nativeLanTransport();
    if (!native || typeof native.discover !== "function") return Object.freeze([]);
    let result;
    try {
      result = await native.discover();
    } catch (error) {
      if (error?.code === "request_timeout") return Object.freeze([]);
      throw new ClassroomError("无法发现局域网班级服务。", { code: "network_error" });
    }
    const values = Array.isArray(result) ? result : result?.services;
    if (!Array.isArray(values)) return Object.freeze([]);
    const safe = [];
    for (const value of values.slice(0, 20)) {
      try {
        const normalized = normalizeDiscoveredLanUrl(value);
        if (!safe.includes(normalized)) safe.push(normalized);
      } catch {
        // Ignore untrusted discovery responses; no endpoint is contacted.
      }
    }
    return Object.freeze(safe);
  }

  async function deleteClass(classId) {
    const id = uuid(classId, "班级编号");
    const result = await requestJson(`/v1/classes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      authMode: "owner",
    });
    removeOwnerCapability(id);
    return Object.freeze({ ...result });
  }

  async function joinInviteAtServer(serverUrl, code, displayName) {
    const guestSession = (() => {
      try { return window.sessionStorage.getItem(GUEST_SESSION_KEY) === "1"; } catch { return false; }
    })();
    if (!readSessionValue(ACCESS_TOKEN_KEY) || guestSession) {
      const result = await requestJson("/v1/invites/join-anonymous", {
        method: "POST",
        auth: false,
        serverUrl,
        body: { code, displayName, deviceId: stableDeviceId() },
      });
      const auth = validateAuthResponse(result);
      saveConfirmedServerUrl(serverUrl, true);
      saveSession(auth);
      try { window.sessionStorage.setItem(GUEST_SESSION_KEY, "1"); } catch { /* keep the server session */ }
      return Object.freeze({ ...result, user: auth.user });
    }
    return requestJson("/v1/invites/join", {
      method: "POST",
      body: { code },
      authMode: "bearer",
      serverUrl
    });
  }

  async function joinClassByInviteCode(input) {
    const parsed = parseInvitePayload(typeof input === "string" ? input : input?.code);
    const displayName = requiredText(
      typeof input === "object" && input?.displayName
        ? input.displayName
        : readStoredUser()?.displayName || "同学",
      "备注名",
      80,
    );
    const candidates = [];
    const append = (value) => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };
    append(parsed.serverUrl);
    append(loadServerUrl());
    for (const value of await discoverServices()) append(value);
    if (!candidates.length) {
      throw new ClassroomError("未发现可访问的班级服务；请确认教师电脑已打开且设备位于同一网络。", {
        code: "service_not_configured"
      });
    }
    let lastUnavailable = null;
    let lastNotFound = null;
    for (const serverUrl of candidates) {
      try {
        return await joinInviteAtServer(serverUrl, parsed.code, displayName);
      } catch (error) {
        if (error?.code === "invite_not_found" || error?.status === 404) {
          lastNotFound = error;
          continue;
        }
        if (error?.code === "network_error" || error?.code === "request_timeout") {
          lastUnavailable = error;
          continue;
        }
        throw error;
      }
    }
    throw lastNotFound || lastUnavailable || new ClassroomError("邀请码无效。", {
      code: "invite_not_found",
      status: 404
    });
  }

  async function joinInvite(input) {
    return joinClassByInviteCode(input);
  }

  async function updateDisplayName(value) {
    const displayName = requiredText(value, "备注名", 80);
    const result = await requestJson("/v1/account/self", {
      method: "PATCH",
      body: { displayName },
    });
    if (!result?.user) throw new ClassroomError("备注名保存失败", { code: "invalid_server_response" });
    const current = readStoredUser();
    saveSession({
      accessToken: readSessionValue(ACCESS_TOKEN_KEY),
      refreshToken: readSessionValue(REFRESH_TOKEN_KEY),
      user: { ...(current || {}), ...result.user },
    });
    return result.user;
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("online", () => { void flushSyncQueue(); });
  }

  function normalizeDateTime(value, label) {
    const time = new Date(String(value || ""));
    if (!Number.isFinite(time.getTime())) throw inputError(`${label}无效。`, "invalid_datetime");
    return time.toISOString();
  }

  function inputError(message, code) {
    return new ClassroomError(message, { code, status: 0 });
  }

  function sanitizeCode(value) {
    const text = String(value || "").slice(0, 120);
    return /^[a-z0-9_:-]+$/i.test(text) ? text : "";
  }

  function sanitizeRequestId(value) {
    const text = String(value || "").slice(0, 200);
    return /^[a-z0-9_.:-]+$/i.test(text) ? text : "";
  }

  window.PhysicsStudioClassroom = Object.freeze({
    version: "3.2.0",
    configure,
    status,
    checkHealth,
    login,
    logout,
    createClass,
    listClasses,
    getClass,
    deleteClass,
    createInvite,
    parseInvitePayload,
    discoverServices,
    joinClassByInviteCode,
    joinInvite,
    updateDisplayName,
    listRoster,
    listGroups,
    createGroup,
    updateMembership,
    syncStatus,
    syncLearning,
    syncExamRecords,
    flushSyncQueue,
    acknowledgeSyncConflict,
    listAssignments,
    createAssignment,
    submitAssignment,
    getClassLearningSummary,
    listReviewCases,
    decideReviewCase,
    saveReportSnapshot,
    listReportSnapshots
  });
})();
