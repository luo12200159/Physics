(() => {
  "use strict";

  const MiB = 1024 * 1024;
  const limits = Object.freeze({
    documentBytes: 30 * MiB,
    imageBytes: 20 * MiB,
    attachmentBytes: 20 * MiB,
    attachmentsPerQuestionBytes: 80 * MiB,
    videoBytes: 200 * MiB,
    libraryMediaBytes: 2 * 1024 * MiB,
    importBytes: 250 * MiB,
    questionCount: 5000,
    stringLength: 120000
  });

  const signatures = [
    ["jpeg", [0xff, 0xd8, 0xff]],
    ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["gif", [0x47, 0x49, 0x46, 0x38]],
    ["pdf", [0x25, 0x50, 0x44, 0x46, 0x2d]],
    ["zip", [0x50, 0x4b, 0x03, 0x04]],
    ["ole", [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
    ["webm", [0x1a, 0x45, 0xdf, 0xa3]]
  ];

  const purposeRules = Object.freeze({
    image: { max: limits.imageBytes, kinds: ["jpeg", "png", "gif", "webp"] },
    document: { max: limits.documentBytes, kinds: ["jpeg", "png", "gif", "webp", "pdf", "zip", "ole"] },
    attachment: { max: limits.attachmentBytes, kinds: ["jpeg", "png", "gif", "webp", "pdf", "zip", "ole"] },
    video: { max: limits.videoBytes, kinds: ["mp4", "webm", "mov"] },
    backup: { max: limits.importBytes, kinds: ["zip", "json"] }
  });

  function startsWithBytes(bytes, expected) {
    return expected.every((value, index) => bytes[index] === value);
  }

  function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.slice(start, start + length));
  }

  function detectKind(bytes, fileName = "") {
    const lowerName = String(fileName).toLocaleLowerCase("en-US");
    for (const [kind, signature] of signatures) {
      if (startsWithBytes(bytes, signature)) return kind;
    }
    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
    if (ascii(bytes, 4, 4) === "ftyp") {
      const brand = ascii(bytes, 8, 8).toLocaleLowerCase("en-US");
      if (/qt\s{2}/.test(brand) || lowerName.endsWith(".mov")) return "mov";
      return "mp4";
    }
    const first = ascii(bytes, 0, Math.min(bytes.length, 80)).trimStart();
    if (/^[\[{]/.test(first) && /\.(?:json|pscontent)$/i.test(lowerName)) return "json";
    return "unknown";
  }

  function extensionOf(fileName) {
    const match = String(fileName || "").toLocaleLowerCase("en-US").match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function expectedKindsForExtension(extension) {
    return {
      jpg: ["jpeg"], jpeg: ["jpeg"], png: ["png"], gif: ["gif"], webp: ["webp"],
      pdf: ["pdf"], doc: ["ole"], docx: ["zip"],
      mp4: ["mp4"], m4v: ["mp4"], mov: ["mov", "mp4"], webm: ["webm"],
      json: ["json"], pslab: ["zip"], pscontent: ["zip", "json"]
    }[extension] || [];
  }

  async function inspectFile(file, purpose = "attachment") {
    if (!(file instanceof Blob)) throw new Error("没有可检查的文件。");
    const rule = purposeRules[purpose] || purposeRules.attachment;
    if (!file.size) throw new Error("文件为空。");
    if (file.size > rule.max) {
      throw new Error(`文件超过 ${formatBytes(rule.max)} 上限。`);
    }
    const bytes = new Uint8Array(await file.slice(0, 96).arrayBuffer());
    const kind = detectKind(bytes, file.name || "");
    const extension = extensionOf(file.name || "");
    const expected = expectedKindsForExtension(extension);
    if (kind === "unknown" || !rule.kinds.includes(kind)) {
      throw new Error("文件头与允许的文件类型不匹配。");
    }
    if (expected.length && !expected.includes(kind)) {
      throw new Error("文件扩展名与实际文件头不一致。");
    }
    if (String(file.type || "").toLocaleLowerCase("en-US").includes("svg")) {
      throw new Error("不接受可执行脚本的 SVG 文件。请转换为 PNG 或 JPEG。");
    }
    return Object.freeze({
      kind,
      extension,
      mime: safeMimeForKind(kind),
      size: file.size,
      name: sanitizeFileName(file.name || `file.${extension || "bin"}`)
    });
  }

  function safeMimeForKind(kind) {
    return {
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      pdf: "application/pdf",
      zip: "application/zip",
      ole: "application/msword",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      json: "application/json"
    }[kind] || "application/octet-stream";
  }

  async function sha256(blob) {
    if (!globalThis.crypto?.subtle) throw new Error("当前运行环境不支持 SHA-256 校验。");
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function ensureStorageCapacity(requiredBytes) {
    if (!navigator.storage?.estimate) {
      return { supported: false, enough: true, requiredBytes };
    }
    const estimate = await navigator.storage.estimate();
    const quota = Number(estimate.quota) || 0;
    const usage = Number(estimate.usage) || 0;
    const available = Math.max(0, quota - usage);
    if (quota && requiredBytes > available) {
      throw new Error(`本机可用存储约 ${formatBytes(available)}，不足以保存 ${formatBytes(requiredBytes)}。`);
    }
    return { supported: true, enough: true, quota, usage, available, requiredBytes };
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) return false;
    try {
      return Boolean(await navigator.storage.persist());
    } catch {
      return false;
    }
  }

  function sanitizeFileName(value) {
    return String(value || "file")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\.+$/g, "")
      .slice(0, 120) || "file";
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
  }

  window.PhysicsStudioSecurity = Object.freeze({
    version: "1.0.0",
    limits,
    detectKind,
    inspectFile,
    sha256,
    ensureStorageCapacity,
    requestPersistentStorage,
    sanitizeFileName,
    safeMimeForKind,
    formatBytes
  });
})();
