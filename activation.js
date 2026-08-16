(() => {
  "use strict";

  const PRODUCT_ID = "physics-studio";
  const CODE_PREFIX = "PSA1";
  const MAX_CODE_LENGTH = 4096;
  const PUBLIC_KEY = window.PHYSICS_STUDIO_ACTIVATION_PUBLIC_KEY;
  const LEGACY_PUBLIC_KEYS = Object.freeze([Object.freeze({
    version: 1,
    product: "physics-studio",
    algorithm: "ECDSA_P256_SHA256",
    spkiBase64: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEN9D2Z6eiihQsZxjoCsKUBM9UNUy6eVJyuQBNUYpuvUxi4aU7SzGgsNsvJW/65ke0tFvnvMe/po07kEaYLJN39Q==",
    fingerprintSha256: "1B8228FB76BA1D1ABE0A01187BC0A9C0E7129FF2F98432C1220C95FC449038F4"
  })]);
  const pendingNativeRequests = new Map();
  let nativeRequestSequence = 0;
  let importedPublicKeysPromise = null;
  let resolveActivation;
  let rejectActivation;
  let started = false;

  const whenActivated = new Promise((resolve, reject) => {
    resolveActivation = resolve;
    rejectActivation = reject;
  });

  const api = Object.freeze({
    version: "1.0.0",
    whenActivated,
    validateCode,
    formatDeviceRequest,
    publicKeyFingerprint: PUBLIC_KEY?.fingerprintSha256 || ""
  });
  window.PhysicsStudioActivation = api;

  if (window.chrome?.webview?.addEventListener) {
    window.chrome.webview.addEventListener("message", handleWindowsNativeMessage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  async function start() {
    if (started) return;
    started = true;
    const gate = renderGate();
    try {
      assertPublicKeyConfiguration();
      const native = await getNativeActivationAdapter();
      const deviceId = normalizeDeviceId(native.deviceId);
      gate.device.textContent = formatDeviceRequest(deviceId);
      gate.environment.textContent = native.description;
      gate.copy.disabled = false;
      gate.copy.addEventListener("click", () => copyDeviceRequest(deviceId, gate));

      const storedCode = String(native.storedCode || "").trim();
      if (storedCode) {
        try {
          const payload = await validateCode(storedCode, deviceId);
          unlock(payload, gate);
          return;
        } catch (error) {
          setStatus(gate, "本机已保存的激活信息无效或已过期，请输入新的激活码。", "error");
        }
      } else {
        setStatus(gate, "复制设备申请码交给软件所有者，再把签发的激活码粘贴到下方。", "info");
      }

      gate.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const code = gate.code.value.replace(/\s+/g, "");
        if (!code) {
          setStatus(gate, "请输入激活码。", "error");
          gate.code.focus();
          return;
        }
        gate.submit.disabled = true;
        setStatus(gate, "正在校验设备绑定和数字签名……", "info");
        try {
          const payload = await validateCode(code, deviceId);
          const saved = await native.save(code);
          if (!saved) throw new Error("本机无法安全保存激活信息。");
          unlock(payload, gate);
        } catch (error) {
          setStatus(gate, activationErrorMessage(error), "error");
          gate.submit.disabled = false;
        }
      });
    } catch (error) {
      setStatus(gate, activationErrorMessage(error), "error");
      gate.submit.disabled = true;
      rejectActivation(error);
    }
  }

  function renderGate() {
    let gate = document.getElementById("activationGate");
    if (!gate) {
      gate = document.createElement("section");
      gate.id = "activationGate";
      gate.className = "activation-gate";
      gate.setAttribute("role", "dialog");
      gate.setAttribute("aria-modal", "true");
      gate.setAttribute("aria-labelledby", "activationTitle");
      gate.innerHTML = `
        <div class="activation-panel">
          <div class="activation-brand">
            <span class="activation-brand-mark" aria-hidden="true">φ</span>
            <div><strong>费曼物理</strong><span>DEVICE ACTIVATION</span></div>
          </div>
          <h1 id="activationTitle">激活后开始学习</h1>
          <p class="activation-intro">本应用采用一机一码。激活码包含当前设备摘要的数字签名，不能转用于第二台设备。</p>
          <div class="activation-device-card">
            <label>设备申请码 <small id="activationEnvironment"></small></label>
            <div class="activation-device-row">
              <code class="activation-device-code" id="activationDeviceCode">正在读取本机设备摘要……</code>
              <button class="activation-copy-button" id="activationCopyButton" type="button" disabled>复制</button>
            </div>
          </div>
          <form id="activationForm" novalidate>
            <label class="activation-code-field">
              <span>激活码</span>
              <textarea id="activationCode" maxlength="${MAX_CODE_LENGTH}" spellcheck="false" autocomplete="off" placeholder="PSA1.……"></textarea>
            </label>
            <button class="activation-submit" id="activationSubmit" type="submit">校验并激活本机</button>
          </form>
          <p class="activation-status" id="activationStatus" role="status" aria-live="polite"></p>
          <p class="activation-boundary">设备申请码是单向摘要，不包含题库、学生档案或原始硬件标识。离线授权能阻止跨设备复用；卸载或清除全部应用数据后的全局一次性核销需要另行部署联网激活服务。</p>
        </div>`;
      document.body.appendChild(gate);
    }
    return {
      root: gate,
      device: gate.querySelector("#activationDeviceCode"),
      environment: gate.querySelector("#activationEnvironment"),
      copy: gate.querySelector("#activationCopyButton"),
      form: gate.querySelector("#activationForm"),
      code: gate.querySelector("#activationCode"),
      submit: gate.querySelector("#activationSubmit"),
      status: gate.querySelector("#activationStatus")
    };
  }

  function assertPublicKeyConfiguration() {
    if (!PUBLIC_KEY
      || PUBLIC_KEY.version !== 1
      || PUBLIC_KEY.product !== PRODUCT_ID
      || PUBLIC_KEY.algorithm !== "ECDSA_P256_SHA256"
      || !/^[A-F0-9]{64}$/.test(PUBLIC_KEY.fingerprintSha256 || "")
      || !PUBLIC_KEY.spkiBase64) {
      throw new Error("发布公钥缺失或格式错误，请联系软件所有者重新安装正式版本。");
    }
    if (!window.crypto?.subtle) {
      throw new Error("当前系统不支持必要的数字签名校验，请升级 Android System WebView 或 Microsoft Edge WebView2。");
    }
  }

  async function getNativeActivationAdapter() {
    const android = window.PhysicsStudioAndroid;
    if (android
      && typeof android.getActivationDeviceId === "function"
      && typeof android.getStoredActivationCode === "function"
      && typeof android.saveActivationCode === "function") {
      return {
        deviceId: String(android.getActivationDeviceId() || ""),
        storedCode: String(android.getStoredActivationCode() || ""),
        description: "Android 安全存储",
        async save(code) {
          return Boolean(android.saveActivationCode(code));
        }
      };
    }

    if (window.chrome?.webview?.postMessage) {
      const state = await requestWindowsNative("get");
      return {
        deviceId: String(state.deviceId || ""),
        storedCode: String(state.code || ""),
        description: "Windows DPAPI 安全存储",
        async save(code) {
          const response = await requestWindowsNative("save", code);
          return Boolean(response.saved);
        }
      };
    }

    const storage = window.PhysicsStudioStorageRepository;
    if (!storage) throw new Error("本地存储适配器未加载");
    const storageKey = "physics-studio-browser-activation-v1";
    const deviceSecretKey = "physics-studio-browser-device-secret-v1";
    let secret = storage.getItem(deviceSecretKey);
    if (!secret) {
      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      secret = toBase64Url(random);
      storage.setItem(deviceSecretKey, secret);
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${PRODUCT_ID}|browser-debug|${secret}`)
    );
    return {
      deviceId: bytesToHex(new Uint8Array(digest)),
      storedCode: storage.getItem(storageKey) || "",
      description: "浏览器调试存储",
      async save(code) {
        storage.setItem(storageKey, code);
        return storage.getItem(storageKey) === code;
      }
    };
  }

  function requestWindowsNative(action, value = "") {
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now().toString(36)}-${(++nativeRequestSequence).toString(36)}`;
      const timer = setTimeout(() => {
        pendingNativeRequests.delete(requestId);
        reject(new Error("Windows 安全存储响应超时。"));
      }, 5000);
      pendingNativeRequests.set(requestId, { resolve, reject, timer });
      window.chrome.webview.postMessage(
        action === "save"
          ? `activation:save:${requestId}:${value}`
          : `activation:get:${requestId}`
      );
    });
  }

  function handleWindowsNativeMessage(event) {
    const message = event.data;
    if (!message
      || message.channel !== "physics-studio-activation"
      || typeof message.requestId !== "string") return;
    const pending = pendingNativeRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingNativeRequests.delete(message.requestId);
    if (message.error) pending.reject(new Error(String(message.error)));
    else pending.resolve(message);
  }

  async function validateCode(rawCode, expectedDeviceId) {
    assertPublicKeyConfiguration();
    const code = String(rawCode || "").replace(/\s+/g, "");
    if (code.length < 80 || code.length > MAX_CODE_LENGTH) {
      throw new Error("激活码长度不正确。");
    }
    const parts = code.split(".");
    if (parts.length !== 3 || parts[0] !== CODE_PREFIX) {
      throw new Error("激活码前缀或分段格式错误。");
    }
    const payloadBytes = fromBase64Url(parts[1]);
    const signature = fromBase64Url(parts[2]);
    if (signature.length !== 64) throw new Error("激活码签名长度错误。");

    let payload;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes));
    } catch {
      throw new Error("激活码载荷不是有效的 UTF-8 JSON。");
    }
    validatePayload(payload, expectedDeviceId);

    const publicKeys = await importPublicKeys();
    const verificationResults = await Promise.all(publicKeys.map((publicKey) => {
      return crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        payloadBytes
      );
    }));
    const valid = verificationResults.some(Boolean);
    if (!valid) throw new Error("数字签名校验失败；该激活码不是由可信所有者签发。");
    return Object.freeze({ ...payload });
  }

  function validatePayload(payload, expectedDeviceId) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("激活码载荷格式错误。");
    }
    const allowed = new Set(["v", "product", "licenseId", "device", "issuedAt", "expiresAt", "note"]);
    const unknown = Object.keys(payload).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error("激活码包含不支持的字段。");
    if (payload.v !== 1 || payload.product !== PRODUCT_ID) {
      throw new Error("激活码不适用于当前产品或版本。");
    }
    if (!/^[a-f0-9]{32}$/.test(String(payload.licenseId || ""))) {
      throw new Error("激活码编号格式错误。");
    }
    const actualDevice = normalizeDeviceId(payload.device);
    const expected = normalizeDeviceId(expectedDeviceId);
    if (actualDevice !== expected) {
      throw new Error("该激活码绑定的是另一台设备。");
    }
    const issuedAt = Date.parse(payload.issuedAt);
    if (!Number.isFinite(issuedAt) || issuedAt > Date.now() + 5 * 60 * 1000) {
      throw new Error("激活码签发时间无效。");
    }
    if (payload.expiresAt !== null) {
      const expiresAt = Date.parse(payload.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
        throw new Error("激活码有效期格式错误。");
      }
      if (expiresAt < Date.now()) throw new Error("激活码已过期。");
    }
    if (typeof payload.note !== "string" || payload.note.length > 100) {
      throw new Error("激活码备注格式错误。");
    }
  }

  function importPublicKeys() {
    if (!importedPublicKeysPromise) {
      const trusted = [PUBLIC_KEY, ...LEGACY_PUBLIC_KEYS].filter((key, index, keys) => {
        return key?.spkiBase64
          && keys.findIndex((candidate) => candidate?.spkiBase64 === key.spkiBase64) === index;
      });
      importedPublicKeysPromise = Promise.all(trusted.map((key) => {
        return crypto.subtle.importKey(
          "spki",
          base64ToBytes(key.spkiBase64),
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["verify"]
        );
      }));
    }
    return importedPublicKeysPromise;
  }

  function normalizeDeviceId(value) {
    const normalized = String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (!/^[A-F0-9]{64}$/.test(normalized)) {
      throw new Error("无法取得有效的64位设备摘要。");
    }
    return normalized;
  }

  function formatDeviceRequest(deviceId) {
    const normalized = normalizeDeviceId(deviceId);
    return `PSDEV-${normalized.match(/.{8}/g).join("-")}`;
  }

  async function copyDeviceRequest(deviceId, gate) {
    const text = formatDeviceRequest(deviceId);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setStatus(gate, "设备申请码已复制。", "success");
  }

  function unlock(payload, gate) {
    setStatus(gate, "激活成功，正在进入费曼物理……", "success");
    document.body.classList.remove("activation-pending");
    document.body.classList.add("activation-complete");
    gate.root.remove();
    resolveActivation(payload);
    document.dispatchEvent(new CustomEvent("physics-studio-activated", {
      detail: { licenseId: payload.licenseId, expiresAt: payload.expiresAt }
    }));
  }

  function setStatus(gate, text, state) {
    gate.status.textContent = text;
    gate.status.dataset.state = state;
  }

  function activationErrorMessage(error) {
    const message = String(error?.message || error || "激活失败。");
    return message.length > 240 ? `${message.slice(0, 240)}…` : message;
  }

  function fromBase64Url(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value || "")) throw new Error("激活码包含无效的 Base64URL 字符。");
    const padding = value.length % 4;
    if (padding === 1) throw new Error("激活码 Base64URL 长度错误。");
    return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/") + (padding ? "=".repeat(4 - padding) : ""));
  }

  function base64ToBytes(value) {
    let binary;
    try {
      binary = atob(value);
    } catch {
      throw new Error("激活码 Base64 数据损坏。");
    }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function toBase64Url(bytes) {
    let binary = "";
    bytes.forEach((value) => { binary += String.fromCharCode(value); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function bytesToHex(bytes) {
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
})();
