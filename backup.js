(() => {
  "use strict";

  const FORMAT = "physics-studio-complete-backup";
  const VERSION = 1;
  const MAX_BACKUP_BYTES = window.PhysicsStudioSecurity?.limits?.completeBackupBytes || 500 * 1024 * 1024;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const ENCRYPTED_MAGIC = textEncoder.encode("PSLABE1\n");
  const ENCRYPTED_VERSION = 1;
  const KDF_ITERATIONS = 310000;
  const SALT_BYTES = 16;
  const NONCE_BYTES = 12;
  const HEADER_BYTES = ENCRYPTED_MAGIC.length + 1 + 4 + SALT_BYTES + NONCE_BYTES;

  async function create(app, learningEngine, options = {}) {
    if (!window.fflate?.zipSync) throw new Error("完整备份压缩模块未加载。");
    const password = String(options.password || "");
    if (password.length < 12) throw new Error("加密完整备份需要至少 12 个字符的独立密码。");
    // The public practice list excludes resourceOnly records, but a complete
    // backup must include every record stored in the question database.
    const questions = app.getBackupRecords
      ? await app.getBackupRecords()
      : app.getQuestions(); // Compatibility with older app facades and tests.
    const learning = learningEngine.loadState();
    const platformLimit = window.PhysicsStudioAndroid
      ? window.PhysicsStudioSecurity?.limits?.androidExportBytes || 100 * 1024 * 1024
      : MAX_BACKUP_BYTES;
    const outputLimit = Math.min(
      MAX_BACKUP_BYTES,
      platformLimit,
      Number.isFinite(options.maxOutputBytes) && options.maxOutputBytes > 0
        ? Math.floor(options.maxOutputBytes)
        : MAX_BACKUP_BYTES
    );
    // Reject an impossible single-file export before reading any media into memory.
    // This is only a lower bound; the final ZIP and encrypted envelope are checked below.
    const mediaBytes = questions.reduce((total, question) => total
      + (Array.isArray(question.attachments) ? question.attachments : [])
        .reduce((sum, attachment) => sum + (attachment.blob instanceof Blob ? attachment.blob.size : 0), 0)
      + (question.videoBlob instanceof Blob ? question.videoBlob.size : 0), 0);
    const metadataFloor = textEncoder.encode(JSON.stringify({
      format: "physics-studio-questions",
      version: 4,
      questions: questions.map((question) => ({ ...question, attachments: [], videoBlob: null }))
    })).byteLength + textEncoder.encode(JSON.stringify({
      format: "physics-learning-state",
      version: learning.version,
      state: learning
    })).byteLength;
    if (mediaBytes + metadataFloor + HEADER_BYTES + 16 > outputLimit) {
      throw new Error(`媒体与记录合计超过当前单文件导出上限 ${Math.floor(outputLimit / 1048576)} MB；本次未读取媒体，也未生成不完整备份。请在支持完整备份容量的桌面端导出。`);
    }
    const entries = {};
    const serializedQuestions = [];
    let estimatedBytes = 0;

    for (const question of questions) {
      const copy = { ...question, attachments: [], videoBlob: null };
      const attachmentRefs = [];
      for (const attachment of Array.isArray(question.attachments) ? question.attachments : []) {
        if (!(attachment.blob instanceof Blob)) continue;
        estimatedBytes += attachment.blob.size;
        if (estimatedBytes > outputLimit) throw new Error("媒体总量超过当前单文件导出上限，未生成不完整备份。");
        const path = mediaPath("attachments", question.id, attachment.id, attachment.name);
        entries[path] = new Uint8Array(await attachment.blob.arrayBuffer());
        attachmentRefs.push({
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          size: attachment.blob.size,
          kind: attachment.kind,
          createdAt: attachment.createdAt,
          path
        });
      }
      let videoRef = null;
      if (question.videoBlob instanceof Blob) {
        estimatedBytes += question.videoBlob.size;
        if (estimatedBytes > outputLimit) throw new Error("媒体总量超过当前单文件导出上限，未生成不完整备份。");
        const path = mediaPath("videos", question.id, "video", question.videoName || "method-video.mp4");
        entries[path] = new Uint8Array(await question.videoBlob.arrayBuffer());
        videoRef = {
          name: question.videoName || "method-video.mp4",
          type: question.videoBlob.type || "video/mp4",
          size: question.videoBlob.size,
          path
        };
      }
      serializedQuestions.push({
        ...copy,
        attachments: attachmentRefs,
        videoRef
      });
    }

    entries["questions.json"] = textEncoder.encode(JSON.stringify({
      format: "physics-studio-questions",
      version: 4,
      questions: serializedQuestions
    }));
    entries["learning-profile.json"] = textEncoder.encode(JSON.stringify({
      format: "physics-learning-state",
      version: learning.version,
      state: learning
    }));

    const fileDeclarations = [];
    for (const [path, bytes] of Object.entries(entries)) {
      fileDeclarations.push({
        path,
        size: bytes.byteLength,
        mime: mimeForPath(path),
        sha256: await window.PhysicsStudioSecurity.sha256(new Blob([bytes]))
      });
    }
    const manifest = {
      format: FORMAT,
      version: VERSION,
      createdAt: new Date().toISOString(),
      appVersion: String(learningEngine.version || "unknown"),
      questionCount: questions.length,
      sourceRecordCount: questions.filter((question) => question.resourceOnly === true).length,
      practiceQuestionCount: questions.filter((question) => question.resourceOnly !== true).length,
      profileCount: learning.profiles.length,
      fileCount: fileDeclarations.length,
      files: fileDeclarations
    };
    entries["manifest.json"] = textEncoder.encode(JSON.stringify(manifest, null, 2));
    const bytes = window.fflate.zipSync(entries, { level: 0 });
    if (bytes.byteLength > outputLimit) throw new Error("完整备份压缩后超过当前单文件导出上限，未保存文件。");
    const encryptedBytes = await encryptBackup(bytes, password);
    if (encryptedBytes.byteLength > outputLimit) throw new Error("完整备份加密后超过当前单文件导出上限，未保存文件。");
    return {
      blob: new Blob([encryptedBytes], { type: "application/octet-stream" }),
      manifest
    };
  }

  async function deriveKey(password, salt, iterations) {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
      throw new Error("当前环境不支持 Web Crypto，不能安全处理完整备份。");
    }
    const base = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
      name: "PBKDF2", hash: "SHA-256", salt, iterations
    }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function encryptBackup(plainBytes, password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const header = new Uint8Array(HEADER_BYTES);
    header.set(ENCRYPTED_MAGIC);
    header[ENCRYPTED_MAGIC.length] = ENCRYPTED_VERSION;
    new DataView(header.buffer).setUint32(ENCRYPTED_MAGIC.length + 1, KDF_ITERATIONS, false);
    header.set(salt, ENCRYPTED_MAGIC.length + 5);
    header.set(nonce, ENCRYPTED_MAGIC.length + 5 + SALT_BYTES);
    const key = await deriveKey(password, salt, KDF_ITERATIONS);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM", iv: nonce, additionalData: header, tagLength: 128
    }, key, plainBytes));
    const output = new Uint8Array(header.length + cipher.length);
    output.set(header);
    output.set(cipher, header.length);
    return output;
  }

  function isEncrypted(bytes) {
    return bytes.length >= ENCRYPTED_MAGIC.length
      && ENCRYPTED_MAGIC.every((value, index) => bytes[index] === value);
  }

  async function decryptBackup(bytes, password) {
    if (bytes.length <= HEADER_BYTES + 16) throw new Error("加密备份文件不完整。");
    const header = bytes.slice(0, HEADER_BYTES);
    if (header[ENCRYPTED_MAGIC.length] !== ENCRYPTED_VERSION) throw new Error("加密备份版本不受支持。");
    const iterations = new DataView(header.buffer).getUint32(ENCRYPTED_MAGIC.length + 1, false);
    if (iterations < 200000 || iterations > 1000000) throw new Error("加密备份 KDF 参数不受支持。");
    if (!password) throw new Error("恢复加密备份必须输入密码。");
    const salt = header.slice(ENCRYPTED_MAGIC.length + 5, ENCRYPTED_MAGIC.length + 5 + SALT_BYTES);
    const nonce = header.slice(ENCRYPTED_MAGIC.length + 5 + SALT_BYTES);
    const key = await deriveKey(password, salt, iterations);
    try {
      return new Uint8Array(await crypto.subtle.decrypt({
        name: "AES-GCM", iv: nonce, additionalData: header, tagLength: 128
      }, key, bytes.slice(HEADER_BYTES)));
    } catch (_error) {
      throw new Error("密码错误或备份文件已被篡改；本机数据未更改。");
    }
  }

  async function restore(file, app, learningEngine, options = {}) {
    if (!window.fflate?.unzipSync) throw new Error("完整备份解压模块未加载。");
    if (file.size > MAX_BACKUP_BYTES + HEADER_BYTES + 16) throw new Error("完整备份超过 500 MB 安全上限。");
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const encrypted = isEncrypted(sourceBytes);
    if (!encrypted && options.allowLegacyUnencrypted !== true) {
      throw new Error("检测到旧版未加密 .pslab；确认其包含明文学习档案后，才可选择导入。");
    }
    if (!encrypted) {
      const inspection = await window.PhysicsStudioSecurity.inspectFile(file, "backup");
      if (inspection.kind !== "zip") throw new Error("完整备份必须是 .pslab ZIP 文件。");
    }
    const plainBytes = encrypted ? await decryptBackup(sourceBytes, String(options.password || "")) : sourceBytes;
    const extractionLimit = Math.min(
      MAX_BACKUP_BYTES,
      Number.isFinite(options.maxUncompressedBytes) && options.maxUncompressedBytes > 0
        ? Math.floor(options.maxUncompressedBytes)
        : MAX_BACKUP_BYTES
    );
    let extractedBytes = 0;
    let entryCount = 0;
    // fflate calls filter with central-directory sizes before inflating each entry.
    const entries = window.fflate.unzipSync(plainBytes, { filter(entry) {
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) {
        throw new Error("备份 ZIP 文件大小无效，未修改本机数据。");
      }
      entryCount += 1;
      extractedBytes += entry.originalSize;
      if (entryCount > 25000 || extractedBytes > extractionLimit) {
        throw new Error("备份解压总量或文件数量超过安全上限，未修改本机数据。");
      }
      return true;
    } });
    validatePaths(Object.keys(entries));
    if (!entries["manifest.json"] || !entries["questions.json"] || !entries["learning-profile.json"]) {
      throw new Error("完整备份缺少 manifest.json、questions.json 或 learning-profile.json。");
    }
    const manifest = JSON.parse(textDecoder.decode(entries["manifest.json"]));
    validateManifest(manifest);
    const declaredPaths = new Set(manifest.files.map((item) => item.path));
    const actualPaths = Object.keys(entries).filter((path) => path !== "manifest.json");
    if (actualPaths.some((path) => !declaredPaths.has(path)) || declaredPaths.size !== actualPaths.length) {
      throw new Error("备份文件清单与压缩包内容不一致。");
    }
    for (const declaration of manifest.files) {
      const bytes = entries[declaration.path];
      if (!bytes || bytes.byteLength !== declaration.size) {
        throw new Error(`备份文件大小不一致：${declaration.path}`);
      }
      const hash = await window.PhysicsStudioSecurity.sha256(new Blob([bytes]));
      if (hash.toLocaleLowerCase("en-US") !== String(declaration.sha256).toLocaleLowerCase("en-US")) {
        throw new Error(`备份文件校验失败：${declaration.path}`);
      }
    }

    const questionPayload = JSON.parse(textDecoder.decode(entries["questions.json"]));
    const learningPayload = JSON.parse(textDecoder.decode(entries["learning-profile.json"]));
    if (questionPayload?.format !== "physics-studio-questions" || Number(questionPayload.version) !== 4 || !Array.isArray(questionPayload.questions)) {
      throw new Error("questions.json 格式不受支持。");
    }
    if (questionPayload.questions.length > 5000 || manifest.questionCount !== questionPayload.questions.length) {
      throw new Error("题目数量与清单不一致或超过上限。");
    }
    if (learningPayload?.format !== "physics-learning-state" || !learningPayload.state) {
      throw new Error("learning-profile.json 格式不受支持。");
    }
    const fileMap = new Map(manifest.files.map((item) => [item.path, item]));
    const questions = questionPayload.questions.map((question) => hydrateQuestion(question, entries, fileMap));
    const normalizedLearning = learningEngine.normalizeState(learningPayload.state);
    const outcome = await app.restoreCompleteBackup(questions, normalizedLearning);
    return { manifest, encrypted, ...outcome };
  }

  function hydrateQuestion(question, entries, fileMap) {
    const attachments = (Array.isArray(question.attachments) ? question.attachments : []).map((attachment) => {
      const declaration = fileMap.get(attachment.path);
      if (!declaration || !entries[attachment.path]) throw new Error(`附件缺失：${attachment.path}`);
      return {
        id: String(attachment.id || ""),
        name: window.PhysicsStudioSecurity.sanitizeFileName(attachment.name),
        type: declaration.mime || "application/octet-stream",
        size: declaration.size,
        kind: attachment.kind === "image" ? "image" : "document",
        createdAt: attachment.createdAt || new Date().toISOString(),
        blob: new Blob([entries[attachment.path]], { type: declaration.mime || "application/octet-stream" })
      };
    });
    let videoBlob = null;
    let videoName = "";
    if (question.videoRef?.path) {
      const declaration = fileMap.get(question.videoRef.path);
      if (!declaration || !entries[question.videoRef.path]) throw new Error(`视频缺失：${question.videoRef.path}`);
      videoBlob = new Blob([entries[question.videoRef.path]], { type: declaration.mime || "video/mp4" });
      videoName = window.PhysicsStudioSecurity.sanitizeFileName(question.videoRef.name);
    }
    const { videoRef, ...rest } = question;
    return {
      ...rest,
      attachments,
      videoBlob,
      videoName,
      videoType: videoBlob ? "file" : rest.videoType === "url" ? "url" : "none"
    };
  }

  function validateManifest(manifest) {
    if (manifest?.format !== FORMAT || Number(manifest.version) !== VERSION) {
      throw new Error("不是受支持的费曼物理（含旧版物理研习室）完整备份。");
    }
    if (!Array.isArray(manifest.files) || manifest.files.length > 10000) {
      throw new Error("备份清单文件数量不符合要求。");
    }
    const seen = new Set();
    manifest.files.forEach((item) => {
      if (!item || typeof item.path !== "string" || !/^[a-f0-9]{64}$/i.test(item.sha256 || "")) {
        throw new Error("备份清单字段无效。");
      }
      if (!Number.isSafeInteger(item.size) || item.size < 0 || item.size > MAX_BACKUP_BYTES) {
        throw new Error(`备份文件大小无效：${item.path}`);
      }
      if (seen.has(item.path)) throw new Error(`备份清单路径重复：${item.path}`);
      seen.add(item.path);
    });
    validatePaths([...seen]);
  }

  function validatePaths(paths) {
    paths.forEach((path) => {
      if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
        throw new Error(`备份包含不安全路径：${path}`);
      }
    });
  }

  function mediaPath(folder, questionId, itemId, fileName) {
    const safeQuestion = String(questionId || "question").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    const safeItem = String(itemId || "item").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    const safeName = window.PhysicsStudioSecurity.sanitizeFileName(fileName);
    return `${folder}/${safeQuestion}/${safeItem}-${safeName}`;
  }

  function mimeForPath(path) {
    if (path.endsWith(".json")) return "application/json";
    const extension = path.split(".").pop().toLocaleLowerCase("en-US");
    return {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
      pdf: "application/pdf", doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      txt: "text/plain", md: "text/markdown"
    }[extension] || "application/octet-stream";
  }

  window.PhysicsStudioBackup = Object.freeze({
    version: "2.0.0",
    create,
    restore,
    isEncrypted
  });
})();
