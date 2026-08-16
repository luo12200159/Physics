(() => {
  "use strict";

  const STORAGE_KEY = "physics-teacher-mode-lock-v1";
  const SESSION_KEY = "physics-teacher-mode-session-v1";
  const ITERATIONS = 150000;
  let unlocked = false;

  function storage() {
    return window.PhysicsStudioStorageRepository || window.localStorage;
  }

  function readLock() {
    try {
      const value = JSON.parse(storage()?.getItem(STORAGE_KEY) || "null");
      return value && typeof value === "object" && value.salt && value.hash ? value : null;
    } catch (_) {
      return null;
    }
  }

  function bytesToBase64(bytes) {
    let binary = "";
    new Uint8Array(bytes).forEach((item) => { binary += String.fromCharCode(item); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function derive(pin, salt, iterations = ITERATIONS) {
    if (!window.crypto?.subtle || !window.TextEncoder) throw new Error("当前环境不支持教师 PIN 加密。");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
    return diff === 0;
  }

  function pinValid(pin) {
    return /^\d{6,12}$/.test(String(pin || ""));
  }

  const api = {
    hasPin() { return Boolean(readLock()); },
    isUnlocked() {
      if (unlocked) return true;
      try { return sessionStorage.getItem(SESSION_KEY) === "unlocked"; } catch (_) { return false; }
    },
    async setup(pin) {
      if (!pinValid(pin)) throw new Error("PIN需为6至12位数字。");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(String(pin), salt);
      storage()?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: ITERATIONS }));
      unlocked = true;
      try { sessionStorage.setItem(SESSION_KEY, "unlocked"); } catch (_) { /* session storage may be unavailable in file mode */ }
      return true;
    },
    async unlock(pin) {
      const record = readLock();
      if (!record || !pinValid(pin)) return false;
      try {
        const actual = new Uint8Array(await derive(String(pin), base64ToBytes(record.salt), Number(record.iterations) || ITERATIONS));
        const ok = constantTimeEqual(actual, base64ToBytes(record.hash));
        if (ok) {
          unlocked = true;
          try { sessionStorage.setItem(SESSION_KEY, "unlocked"); } catch (_) { /* ignore */ }
        }
        return ok;
      } catch (_) {
        return false;
      }
    },
    lock() {
      unlocked = false;
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
    },
    status() { return { configured: Boolean(readLock()), unlocked: api.isUnlocked(), iterations: ITERATIONS }; }
  };

  window.PhysicsStudioTeacherLock = Object.freeze(api);
})();
