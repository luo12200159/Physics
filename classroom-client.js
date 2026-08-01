(() => {
  "use strict";

  const CONFIG_KEY = "physics-classroom-config-v1";
  const DEVICE_ID_KEY = "physics-classroom-device-id-v1";
  const ACCESS_TOKEN_KEY = "physics-classroom-access-token-v1";
  const REFRESH_TOKEN_KEY = "physics-classroom-refresh-token-v1";
  const USER_KEY = "physics-classroom-user-v1";
  const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_RESPONSE_CHARS = 1_000_000;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DEVICE_ID_PATTERN = /^[0-9a-f]{64}$/i;
  const REFRESH_TOKEN_PATTERN = /^r1\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
  const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
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

  class ClassroomError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "ClassroomError";
      this.code = sanitizeCode(details.code) || "classroom_error";
      this.status = Number.isInteger(details.status) ? details.status : 0;
      this.requestId = sanitizeRequestId(details.requestId);
    }
  }

  function normalizeServerUrl(value) {
    const source = String(value || DEFAULT_SERVER_URL).trim();
    let parsed;
    try {
      parsed = new URL(source);
    } catch {
      throw new ClassroomError("班级服务地址不是有效网址。", { code: "invalid_server_url" });
    }
    const localHttp = parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (parsed.protocol !== "https:" && !localHttp) {
      throw new ClassroomError("班级服务必须使用 HTTPS；仅本机 localhost 或 127.0.0.1 可使用 HTTP。", {
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

  function loadServerUrl() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(CONFIG_KEY) || "null");
      return normalizeServerUrl(stored?.serverUrl || DEFAULT_SERVER_URL);
    } catch (error) {
      if (error instanceof ClassroomError) return DEFAULT_SERVER_URL;
      return DEFAULT_SERVER_URL;
    }
  }

  function configure(input) {
    const serverUrl = normalizeServerUrl(
      typeof input === "string" ? input : input?.serverUrl
    );
    const previous = loadServerUrl();
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify({ serverUrl }));
    } catch {
      throw new ClassroomError("无法保存班级服务设置。", { code: "storage_unavailable" });
    }
    if (serverUrl !== previous) clearSession();
    return status();
  }

  function status() {
    const serverUrl = loadServerUrl();
    const accessToken = readSessionValue(ACCESS_TOKEN_KEY);
    const refreshToken = readSessionValue(REFRESH_TOKEN_KEY);
    const user = readStoredUser();
    const authenticated = Boolean(accessToken && refreshToken && user);
    if (!authenticated && (accessToken || refreshToken || user)) clearSession();
    return Object.freeze({
      serverUrl,
      authenticated,
      user: authenticated ? Object.freeze({ ...user }) : null,
      syncMode: authenticated ? "authenticated-server" : "offline-local",
      boundary: authenticated
        ? "班级数据仅通过已配置的服务端账号权限访问；本机学生档案不会自动上传。"
        : "尚未登录班级服务；应用继续使用本机离线数据。"
    });
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
    return Object.freeze({ ...auth.user });
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

  async function createClass(input = {}) {
    const grade = String(input.grade || "").trim();
    if (!GRADES.has(grade)) throw inputError("年级必须为八年级至高三。", "invalid_grade");
    const payload = {
      name: requiredText(input.name, "班级名称", 120),
      grade,
      subject: "物理"
    };
    if (input.schoolLabel === null) payload.schoolLabel = null;
    else if (input.schoolLabel !== undefined && String(input.schoolLabel).trim()) {
      payload.schoolLabel = requiredText(input.schoolLabel, "学校名称", 120);
    }
    return requestJson("/v1/classes", { method: "POST", body: payload });
  }

  async function listClasses(options = {}) {
    const cursor = cursorFrom(options);
    return requestJson(`/v1/classes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
      method: "GET"
    });
  }

  async function createInvite(classId, input = {}) {
    const expiresAt = normalizeDateTime(input.expiresAt, "邀请码到期时间");
    const maxUses = Number(input.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
      throw inputError("邀请码使用次数必须是 1 至 1000 的整数。", "invalid_max_uses");
    }
    return requestJson(`/v1/classes/${encodeURIComponent(uuid(classId, "班级编号"))}/invites`, {
      method: "POST",
      body: { expiresAt, maxUses }
    });
  }

  async function joinInvite(input) {
    const code = String(typeof input === "string" ? input : input?.code || "").trim();
    if (!INVITE_CODE_PATTERN.test(code)) {
      throw inputError("邀请码格式不正确。", "invalid_invite_code");
    }
    return requestJson("/v1/invites/join", { method: "POST", body: { code } });
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
      body: payload
    });
  }

  async function requestJson(path, options = {}, retry = true, idempotencyKey = "") {
    const method = String(options.method || "GET").toUpperCase();
    const auth = options.auth !== false;
    const token = readSessionValue(ACCESS_TOKEN_KEY);
    if (auth && !token) {
      throw new ClassroomError("请先登录班级服务。", { code: "authentication_required", status: 401 });
    }
    const mutationKey = method === "GET" || method === "HEAD"
      ? ""
      : (idempotencyKey || randomIdempotencyKey());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await window.fetch(`${loadServerUrl()}${path}`, {
        method,
        headers: {
          "Accept": "application/json",
          "X-Physics-Studio-Client": "physics-studio-classroom/1.0",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(auth && token ? { "Authorization": `Bearer ${token}` } : {}),
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
        throw new ClassroomError("班级服务响应超时。", { code: "request_timeout" });
      }
      throw new ClassroomError("无法连接班级服务，请检查服务地址和网络。", {
        code: "network_error"
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 && auth && retry && readSessionValue(REFRESH_TOKEN_KEY)) {
      try {
        await refreshSession();
      } catch {
        clearSession();
        throw new ClassroomError("登录已失效，请重新登录。", {
          code: "authentication_expired",
          status: 401
        });
      }
      return requestJson(path, options, false, mutationKey);
    }

    const text = await readResponseText(response);
    if (!response.ok) throw sanitizedServerError(response.status, text);
    if (response.status === 204 || !text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new ClassroomError("班级服务返回了无法识别的数据。", {
        code: "invalid_server_response",
        status: response.status
      });
    }
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
      existing = String(window.localStorage.getItem(DEVICE_ID_KEY) || "");
    } catch {
      throw new ClassroomError("无法读取本机班级服务设备标识。", {
        code: "storage_unavailable"
      });
    }
    if (DEVICE_ID_PATTERN.test(existing)) return existing.toLowerCase();
    const id = randomHex(32);
    try {
      window.localStorage.setItem(DEVICE_ID_KEY, id);
      if (window.localStorage.getItem(DEVICE_ID_KEY) !== id) throw new Error("not persisted");
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
    version: "1.0.0",
    configure,
    status,
    login,
    logout,
    createClass,
    listClasses,
    createInvite,
    joinInvite,
    listRoster,
    listGroups,
    createGroup,
    updateMembership
  });
})();
