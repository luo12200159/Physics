(() => {
  "use strict";

  const TARGET_QUESTION_COUNT = 1900;
  const MAX_PACK_QUESTIONS = 1900;
  const ALLOWED_GRADES = ["八年级", "九年级", "高一", "高二", "高三"];
  const ALLOWED_STAGES = ["初中", "高中"];
  const ALLOWED_DIFFICULTIES = ["基础", "进阶", "挑战"];
  const ALLOWED_EXAM_LEVELS = ["中考", "高考", "中考模拟", "高考模拟", "校本练习", "原创练习"];
  const QUESTION_FIELDS = new Set([
    "id", "title", "stage", "grade", "topic", "difficulty", "content", "solution", "answer",
    "source", "sourceUrl", "answerUrl", "sourceLicense", "examLevel", "examYear", "examRegion",
    "examPaperTitle", "examQuestionNumber", "examQuestionType", "examPoints", "curriculumBook",
    "curriculumChapter", "curriculumSection", "curriculumBookId", "curriculumChapterId",
    "curriculumSectionId", "textbookUnit", "rightsEvidenceId", "verifiedAt",
    "modelFamilyId", "variantRole", "transferGroupId", "misconceptionTags", "recommendationTags"
  ]);

  function isPublishedQuestion(question = {}) {
    if (!question || question.resourceOnly || question.fullTextIncluded === false) return false;
    const status = String(question.contentReviewStatus || "");
    if (status === "待教师审核" || status === "教师已退回") return false;

    const importedContent = question.collection === "changsha-verified-content-pack"
      || question.collection === "teacher-document-import"
      || Boolean(question.contentPackId)
      || /用户自行上传|仅保存来源链接|未授权|需核验/.test(String(question.sourceLicense || ""));
    if (importedContent) return status === "教师已通过";

    const bundledOriginal = Boolean(question.originalExercise || question.originalMock)
      || ["bundled-curriculum", "bundled-original-practice", "bundled-targeted-practice", "bundled-mock-exam"].includes(question.syncOrigin)
      || /^sample-/.test(String(question.id || ""));
    const clearRights = /应用内原创|原创内容|原创题|已授权|官方公开许可|公共领域/.test(String(question.sourceLicense || ""));
    return bundledOriginal || clearRights || status === "教师已通过";
  }

  function getCoverage(questions = []) {
    const records = Array.isArray(questions) ? questions : [];
    const completeQuestions = records.filter((question) => {
      return isPublishedQuestion(question)
        && Boolean(String(question.content || "").trim())
        && Boolean(String(question.solution || "").trim())
        && Boolean(String(question.answer || "").trim());
    });
    const completeByGrade = Object.fromEntries(ALLOWED_GRADES.map((grade) => [
      grade,
      completeQuestions.filter((question) => question.grade === grade).length
    ]));
    const indexed = records.filter((question) => {
      return question.collection === "changsha-six-year-real-exam-index";
    }).length;
    const teacherVerifiedFullText = records.filter((question) => {
      return ["中考", "高考"].includes(question.examLevel)
        && question.fullTextIncluded !== false
        && question.contentReviewStatus === "教师已通过"
        && Boolean(question.sourceUrl)
        && Boolean(question.rightsEvidenceId || question.sourceLicense);
    }).length;
    const pendingReview = records.filter((question) => {
      return question.collection === "changsha-verified-content-pack"
        && question.contentReviewStatus !== "教师已通过";
    }).length;
    const classified = records.filter((question) => {
      return isPublishedQuestion(question)
        && Boolean(question.topic)
        && Array.isArray(question.examPoints)
        && question.examPoints.length > 0;
    }).length;
    return Object.freeze({
      target: TARGET_QUESTION_COUNT,
      completeQuestions: completeQuestions.length,
      completeByGrade: Object.freeze(completeByGrade),
      indexed,
      teacherVerifiedFullText,
      pendingReview,
      classified,
      remaining: Math.max(0, TARGET_QUESTION_COUNT - completeQuestions.length),
      completionRate: Math.min(100, Math.round(completeQuestions.length / TARGET_QUESTION_COUNT * 1000) / 10),
      definition: "1900题完成量统计只包含已发布、可离线作答且同时具备题干、答案和分步解析的题目；近六年真题题号索引和待审核正文不计入。原创题明确标注来源，教师已核验的授权内容另行统计。"
    });
  }

  async function parseContentPack(file) {
    const security = window.PhysicsStudioSecurity;
    if (!security) throw new Error("文件安全检查模块未加载。");
    const inspection = await security.inspectFile(file, "backup");
    let payload;
    if (inspection.kind === "json") {
      const text = await file.text();
      if (text.length > security.limits.stringLength * 20) throw new Error("内容包文本超过安全上限。");
      payload = JSON.parse(text);
    } else {
      payload = await parseZipPack(file);
    }
    return validatePayload(payload, inspection);
  }

  async function parseZipPack(file) {
    const archive = window.fflate;
    if (!archive?.unzipSync || !archive?.strFromU8) throw new Error("内容包解压模块未加载。");
    const entries = archive.unzipSync(new Uint8Array(await file.arrayBuffer()));
    const paths = Object.keys(entries);
    if (paths.some((path) => path.includes("..") || path.startsWith("/") || path.includes("\\"))) {
      throw new Error("内容包包含不安全路径。");
    }
    if (!entries["manifest.json"] || !entries["questions.json"]) {
      throw new Error("内容包必须包含 manifest.json 和 questions.json。");
    }
    const manifest = JSON.parse(archive.strFromU8(entries["manifest.json"]));
    const questionsBytes = entries["questions.json"];
    const declaration = Array.isArray(manifest.files)
      ? manifest.files.find((item) => item.path === "questions.json")
      : null;
    if (!declaration?.sha256 || declaration.size !== questionsBytes.byteLength) {
      throw new Error("内容包清单缺少 questions.json 的大小或 SHA-256。");
    }
    const actualHash = await window.PhysicsStudioSecurity.sha256(new Blob([questionsBytes]));
    if (actualHash.toLocaleLowerCase("en-US") !== String(declaration.sha256).toLocaleLowerCase("en-US")) {
      throw new Error("questions.json 的 SHA-256 与清单不一致。");
    }
    return {
      format: "physics-content-pack",
      version: manifest.schemaVersion,
      manifest,
      questions: JSON.parse(archive.strFromU8(questionsBytes))
    };
  }

  function validatePayload(payload, inspection) {
    if (!payload || payload.format !== "physics-content-pack" || Number(payload.version) !== 1) {
      throw new Error("不是受支持的 physics-content-pack v1 内容包。");
    }
    const manifest = payload.manifest;
    if (!manifest || typeof manifest !== "object") throw new Error("内容包缺少 manifest。");
    requireString(manifest.id, "manifest.id", 120);
    requireString(manifest.title, "manifest.title", 200);
    requireString(manifest.publisher, "manifest.publisher", 200);
    requireString(manifest.verifiedAt, "manifest.verifiedAt", 40);
    requireString(manifest.rightsBasis, "manifest.rightsBasis", 1000);
    if (!Array.isArray(manifest.sourceUrls) || !manifest.sourceUrls.length) {
      throw new Error("manifest.sourceUrls 至少需要一个可追溯来源。");
    }
    manifest.sourceUrls.forEach((url) => validateHttpUrl(url, "manifest.sourceUrls"));
    if (!Array.isArray(payload.questions) || !payload.questions.length) {
      throw new Error("内容包没有试题。");
    }
    if (payload.questions.length > MAX_PACK_QUESTIONS) {
      throw new Error(`单个内容包最多 ${MAX_PACK_QUESTIONS} 道题。`);
    }
    const ids = new Set();
    const questions = payload.questions.map((question, index) => {
      const path = `questions[${index}]`;
      if (!question || typeof question !== "object" || Array.isArray(question)) {
        throw new Error(`${path} 不是对象。`);
      }
      const unknown = Object.keys(question).filter((key) => !QUESTION_FIELDS.has(key));
      if (unknown.length) throw new Error(`${path} 含未知字段：${unknown.join("、")}。`);
      const id = requireString(question.id, `${path}.id`, 160);
      if (ids.has(id)) throw new Error(`内容包题号重复：${id}。`);
      ids.add(id);
      const stage = requireEnum(question.stage, ALLOWED_STAGES, `${path}.stage`);
      const grade = requireEnum(question.grade, ALLOWED_GRADES, `${path}.grade`);
      if ((stage === "初中") !== ["八年级", "九年级"].includes(grade)) {
        throw new Error(`${path} 的学段与年级不匹配。`);
      }
      const sourceUrl = validateHttpUrl(question.sourceUrl, `${path}.sourceUrl`);
      const examLevel = requireEnum(question.examLevel, ALLOWED_EXAM_LEVELS, `${path}.examLevel`);
      return {
        id,
        title: requireString(question.title, `${path}.title`, 200),
        stage,
        grade,
        topic: requireString(question.topic, `${path}.topic`, 100),
        difficulty: requireEnum(question.difficulty, ALLOWED_DIFFICULTIES, `${path}.difficulty`),
        content: requireString(question.content, `${path}.content`, 60000),
        solution: requireString(question.solution, `${path}.solution`, 60000),
        answer: String(question.answer || "").slice(0, 30000),
        source: requireString(question.source, `${path}.source`, 300),
        sourceUrl,
        answerUrl: question.answerUrl ? validateHttpUrl(question.answerUrl, `${path}.answerUrl`) : "",
        sourceLicense: requireString(question.sourceLicense || manifest.rightsBasis, `${path}.sourceLicense`, 1000),
        examLevel,
        examYear: Math.max(2000, Math.min(2100, Number(question.examYear) || new Date().getFullYear())),
        examRegion: String(question.examRegion || "长沙/湖南适用").slice(0, 100),
        examPaperTitle: String(question.examPaperTitle || manifest.title).slice(0, 300),
        examQuestionNumber: String(question.examQuestionNumber || index + 1).slice(0, 30),
        examQuestionType: String(question.examQuestionType || "未分类").slice(0, 50),
        examPoints: normalizeStringArray(question.examPoints, 20, 100),
        curriculumBook: String(question.curriculumBook || "").slice(0, 100),
        curriculumChapter: String(question.curriculumChapter || "").slice(0, 100),
        curriculumSection: String(question.curriculumSection || "").slice(0, 100),
        curriculumBookId: String(question.curriculumBookId || "").slice(0, 120),
        curriculumChapterId: String(question.curriculumChapterId || "").slice(0, 120),
        curriculumSectionId: String(question.curriculumSectionId || "").slice(0, 120),
        textbookUnit: String(question.textbookUnit || "").slice(0, 300),
        rightsEvidenceId: requireString(question.rightsEvidenceId || manifest.rightsEvidenceId, `${path}.rightsEvidenceId`, 200),
        verifiedAt: String(question.verifiedAt || manifest.verifiedAt).slice(0, 40),
        fullTextIncluded: true,
        collection: "changsha-verified-content-pack",
        contentPackId: manifest.id,
        contentPackVersion: String(manifest.contentVersion || "1").slice(0, 60),
        contentReviewStatus: "待教师审核",
        provenanceStatus: "内容包声明，待教师核验",
        attachments: [],
        videoType: "none",
        videoUrl: "",
        mastered: false,
        wrong: false,
        wrongAt: null,
        wrongCount: 0,
        transferNotes: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
    return Object.freeze({
      manifest: Object.freeze({ ...manifest }),
      questions,
      inspection,
      warning: "内容包通过结构、文件哈希和字段校验，不等于来源、答案或版权已经被软件独立认证；导入后仍进入教师审核队列。"
    });
  }

  function requireString(value, path, maxLength) {
    const text = String(value || "").trim();
    if (!text) throw new Error(`${path} 不能为空。`);
    if (text.length > maxLength) throw new Error(`${path} 超过 ${maxLength} 字符。`);
    return text;
  }

  function requireEnum(value, allowed, path) {
    if (!allowed.includes(value)) throw new Error(`${path} 不是允许值。`);
    return value;
  }

  function validateHttpUrl(value, path) {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch {
      throw new Error(`${path} 不是有效网址。`);
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${path} 只允许 HTTP/HTTPS。`);
    return url.toString();
  }

  function normalizeStringArray(value, maxItems, maxLength) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, maxItems).map((item) => String(item).trim().slice(0, maxLength)).filter(Boolean);
  }

  window.PhysicsStudioContentCatalog = Object.freeze({
    version: "1.1.0",
    targetQuestionCount: TARGET_QUESTION_COUNT,
    isPublishedQuestion,
    getCoverage,
    parseContentPack
  });
})();
