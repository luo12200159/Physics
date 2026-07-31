(() => {
  "use strict";

  const FORMAT = "physics-studio-complete-backup";
  const VERSION = 1;
  const MAX_BACKUP_BYTES = 500 * 1024 * 1024;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  async function create(app, learningEngine) {
    if (!window.fflate?.zipSync) throw new Error("完整备份压缩模块未加载。");
    const questions = app.getQuestions();
    const learning = learningEngine.loadState();
    const entries = {};
    const serializedQuestions = [];
    let estimatedBytes = 0;

    for (const question of questions) {
      const copy = { ...question, attachments: [], videoBlob: null };
      const attachmentRefs = [];
      for (const attachment of Array.isArray(question.attachments) ? question.attachments : []) {
        if (!(attachment.blob instanceof Blob)) continue;
        estimatedBytes += attachment.blob.size;
        if (estimatedBytes > MAX_BACKUP_BYTES) throw new Error("媒体总量超过 500 MB，当前浏览器内存不足以安全生成单个完整备份。");
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
        if (estimatedBytes > MAX_BACKUP_BYTES) throw new Error("媒体总量超过 500 MB，当前浏览器内存不足以安全生成单个完整备份。");
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
      appVersion: "2.5.0",
      questionCount: questions.length,
      profileCount: learning.profiles.length,
      fileCount: fileDeclarations.length,
      files: fileDeclarations
    };
    entries["manifest.json"] = textEncoder.encode(JSON.stringify(manifest, null, 2));
    const bytes = window.fflate.zipSync(entries, { level: 0 });
    return {
      blob: new Blob([bytes], { type: "application/vnd.physics-studio.backup+zip" }),
      manifest
    };
  }

  async function restore(file, app, learningEngine) {
    if (!window.fflate?.unzipSync) throw new Error("完整备份解压模块未加载。");
    const inspection = await window.PhysicsStudioSecurity.inspectFile(file, "backup");
    if (inspection.kind !== "zip") throw new Error("完整备份必须是 .pslab ZIP 文件。");
    if (file.size > MAX_BACKUP_BYTES) throw new Error("完整备份超过 500 MB 安全上限。");
    const entries = window.fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
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
    return { manifest, ...outcome };
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
      throw new Error("不是受支持的物理研习室完整备份。");
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
    version: "1.0.0",
    create,
    restore
  });
})();
