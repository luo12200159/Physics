const DB_NAME = "physics-studio-db";
const DB_VERSION = 1;
const STORE_NAME = "questions";
const RESOURCE_VERIFIED_DATE = "2026-07-23";
const MAX_ATTACHMENT_COUNT = 12;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 80 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_LIBRARY_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
const QUESTION_PAGE_SIZE = 40;

function appStorage() {
  return window.PhysicsStudioStorageRepository || {
    getItem: () => null,
    setItem: () => {}
  };
}

const seedQuestions = [
  {
    id: "sample-force",
    title: "水平面上物体的受力与加速度",
    stage: "初中",
    grade: "八年级",
    topic: "力与运动",
    knowledgePointId: "kp:force-motion",
    questionType: "计算题",
    cognitiveDemand: "定量计算",
    representationType: "文字",
    evidenceTier: "practice-variant",
    assessmentPurpose: "practice",
    modelDefinitionId: "model:sample-force",
    modelFamilyId: "family:sample-force",
    retestGroupId: "retest:sample-force",
    independenceGroupId: "independent:sample-force",
    diagnosticEligible: false,
    autoScorable: true,
    difficulty: "基础",
    source: "示例题",
    sourceLicense: "应用内原创",
    originalExercise: true,
    fullTextIncluded: true,
    contentReviewStatus: "应用内原创已发布",
    collection: "physics-studio-bundled-samples",
    syncOrigin: "bundled-sample",
    examPoints: ["受力分析", "合力", "力与运动"],
    content: "质量为 2 kg 的物体静止在水平面上，受到水平向右、大小为 10 N 的拉力。已知物体受到的滑动摩擦力为 4 N，求物体所受合力的大小和方向。",
    solution: "【考察点】受力分析、合力、力与运动\n【分步解析】\n1. 选取物体为研究对象。\n2. 竖直方向上重力与支持力平衡。\n3. 水平方向合力 F合=F拉−f。\n4. 代入 F合=10 N−4 N=6 N，方向与较大的拉力方向相同。\n【最终结论】合力大小为6 N，方向水平向右。\n【结果复核】合力小于拉力且方向与较大的拉力一致，单位为N。",
    answer: "合力大小为 6 N，方向水平向右。",
    videoType: "none",
    videoUrl: "",
    mastered: false,
    createdAt: "2026-07-14T08:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z"
  },
  {
    id: "sample-electricity",
    title: "串联电路的电阻与电流",
    stage: "初中",
    grade: "九年级",
    topic: "欧姆定律",
    knowledgePointId: "kp:ohms-law",
    questionType: "计算题",
    cognitiveDemand: "定量计算",
    representationType: "电路文字表征",
    evidenceTier: "practice-variant",
    assessmentPurpose: "practice",
    modelDefinitionId: "model:sample-electricity",
    modelFamilyId: "family:sample-electricity",
    retestGroupId: "retest:sample-electricity",
    independenceGroupId: "independent:sample-electricity",
    diagnosticEligible: false,
    autoScorable: true,
    difficulty: "进阶",
    source: "示例题",
    sourceLicense: "应用内原创",
    originalExercise: true,
    fullTextIncluded: true,
    contentReviewStatus: "应用内原创已发布",
    collection: "physics-studio-bundled-samples",
    syncOrigin: "bundled-sample",
    examPoints: ["串联电路", "欧姆定律", "电压分配"],
    content: "将 6 Ω 和 9 Ω 两个电阻串联接在 12 V 电源两端，不计电源内阻。求电路中的电流及 9 Ω 电阻两端的电压。",
    solution: "【考察点】串联电路、欧姆定律、电压分配\n【分步解析】\n1. 串联电路总电阻 R=R₁+R₂=6 Ω+9 Ω=15 Ω。\n2. 根据欧姆定律 I=U/R=12 V÷15 Ω=0.8 A。\n3. 9 Ω电阻两端电压 U₂=IR₂=0.8 A×9 Ω=7.2 V。\n4. 另一电阻分压 U₁=0.8 A×6 Ω=4.8 V。\n【最终结论】电路电流为0.8 A；9 Ω电阻两端电压为7.2 V。\n【结果复核】U₁+U₂=4.8 V+7.2 V=12 V，与电源电压一致。",
    answer: "电路电流为 0.8 A；9 Ω 电阻两端电压为 7.2 V。",
    videoType: "none",
    videoUrl: "",
    mastered: false,
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z"
  },
  {
    id: "sample-projectile",
    title: "平抛运动的时间与水平位移",
    stage: "高中",
    grade: "高一",
    topic: "曲线运动",
    knowledgePointId: "kp:projectile-motion",
    questionType: "计算题",
    cognitiveDemand: "建模与定量计算",
    representationType: "文字",
    evidenceTier: "practice-variant",
    assessmentPurpose: "practice",
    modelDefinitionId: "model:sample-projectile",
    modelFamilyId: "family:sample-projectile",
    retestGroupId: "retest:sample-projectile",
    independenceGroupId: "independent:sample-projectile",
    diagnosticEligible: false,
    autoScorable: true,
    difficulty: "进阶",
    source: "示例题",
    sourceLicense: "应用内原创",
    originalExercise: true,
    fullTextIncluded: true,
    contentReviewStatus: "应用内原创已发布",
    collection: "physics-studio-bundled-samples",
    syncOrigin: "bundled-sample",
    examPoints: ["平抛运动", "运动分解", "时间与位移"],
    content: "小球从距水平地面 20 m 高处以 10 m/s 的初速度水平抛出，忽略空气阻力，取重力加速度 g = 10 m/s²。求小球落地时间和水平位移。",
    solution: "【考察点】平抛运动、运动分解、时间与位移\n【分步解析】\n1. 忽略空气阻力，平抛运动可分解为水平方向匀速直线运动和竖直方向自由落体运动。\n2. 竖直方向 h=½gt²，得 t=√(2h/g)=√(2×20/10)=2 s。\n3. 水平方向 x=v₀t=10 m/s×2 s=20 m。\n【最终结论】落地时间为2 s，水平位移为20 m。\n【结果复核】2 s内自由落体高度½×10×2²=20 m，恰与题设高度一致。",
    answer: "落地时间为 2 s，水平位移为 20 m。",
    videoType: "none",
    videoUrl: "",
    mastered: false,
    createdAt: "2026-07-12T08:00:00.000Z",
    updatedAt: "2026-07-12T08:00:00.000Z"
  }
];

const freeResources = [
  {
    id: "smartedu",
    title: "国家中小学智慧教育平台",
    provider: "中华人民共和国教育部",
    stage: "全部",
    year: 0,
    access: "官方免费",
    local: false,
    description: "覆盖初高中物理课程、基础作业、在线组卷、线下练习和部分解析视频。需要在平台内按年级和学科选择物理。",
    url: "https://basic.smartedu.cn/"
  },
  {
    id: "changsha-2025-xwuli",
    title: "2025年湖南省长沙市中考物理试卷",
    provider: "初中学习物理网",
    stage: "初中",
    year: 2025,
    access: "免费浏览",
    local: true,
    description: "长沙中考物理真题页面，包含题目正文；页面标注更新时间为2025年8月14日。",
    url: "https://www.xwuli.cn/Item/1030.aspx"
  },
  {
    id: "hunan-2025-zhongkao",
    title: "2025年湖南省各地中考物理真题及答案汇总",
    provider: "中考网",
    stage: "初中",
    year: 2025,
    access: "免费浏览",
    local: true,
    description: "汇总页包含湖南长沙物理真题与答案入口，适合按地区核对试卷版本。",
    url: "https://m.zhongkao.com/e/20250710/686f74056772d.shtml"
  },
  {
    id: "changsha-2025-szzx",
    title: "2025年湖南省长沙市中考物理试题（含答案）",
    provider: "江南汇教育网",
    stage: "初中",
    year: 2025,
    access: "公开页面",
    local: true,
    description: "长沙中考试题与答案的公开资料页，可作为第二来源交叉核验。",
    url: "https://szzx100.com/zkzq/ShowSoft.asp?SoftID=230568"
  },
  {
    id: "changsha-no1-2025",
    title: "长沙市一中2025届高三月考（一）物理试题及答案",
    provider: "自主选拔在线",
    stage: "高中",
    year: 2025,
    access: "免费浏览",
    local: true,
    description: "长沙市一中高三阶段性检测资料，页面提供试题和答案下载入口。",
    url: "https://www.zizzs.com/gk/shitiku/178031.html"
  },
  {
    id: "changsha-no1-2026",
    title: "长沙市一中2025—2026学年高三3月阶段检测物理试题",
    provider: "考生网",
    stage: "高中",
    year: 2026,
    access: "页面标示免费下载",
    local: true,
    description: "2026年长沙高中物理阶段检测资料，页面注明含答案；下载条件以网站实时提示为准。",
    url: "https://down.kaosheng.com/show.php?itemid=28178"
  },
  {
    id: "changjun-2025-grade9-mock2",
    title: "长沙市长郡中学2025届九年级第二次模拟考试物理试卷",
    provider: "21世纪教育网",
    stage: "初中",
    year: 2025,
    access: "公开预览；下载条件以平台为准",
    local: true,
    description: "长沙学校九年级模拟卷题源页。应用仅保留可核验入口，不把未取得再发行许可的正文计入离线题库。",
    url: "https://zy.21cnjy.com/25308770"
  },
  {
    id: "hnsdfz-physics-resources",
    title: "湖南师大附中物理学科资源",
    provider: "湖南师范大学附属中学",
    stage: "高中",
    year: 0,
    access: "学校官网公开页面",
    local: true,
    description: "长沙学校官网的物理学科资源目录，可用于教师核对题源；具体文件的使用与再发行条件需逐项确认。",
    url: "https://www.hnsdfz.org/a/jiaoyanzu/physics/xuekeziyuan/list_102_2.html"
  }
];

const realExamSourceCatalog = Array.isArray(window.PHYSICS_REAL_EXAM_INDEX?.exams)
  ? window.PHYSICS_REAL_EXAM_INDEX.exams.map((exam) => ({
    id: `real-exam-source-${exam.key}`,
    title: exam.title,
    provider: exam.source,
    stage: exam.level === "中考" ? "初中" : "高中",
    year: exam.year,
    access: "公开题源",
    local: exam.level === "中考" || /湖南|长沙/.test(exam.region),
    description: `${exam.scopeNote} 已保留原卷入口和 ${exam.questionCount} 个题号的考点索引；未核实正文再发行许可，因此不把试卷正文计入离线题库。`,
    url: exam.sourceUrl,
    rightsStatus: "公开可访问；完整正文的再发行许可未核实",
    tags: [exam.level, exam.region, "真题", "题源"]
  }))
  : [];

const resourceCatalog = [
  ...freeResources,
  ...(Array.isArray(window.PHYSICS_SOURCE_CATALOG) ? window.PHYSICS_SOURCE_CATALOG : []),
  ...realExamSourceCatalog
].filter((resource, index, resources) => {
  return resources.findIndex((item) => item.id === resource.id) === index;
});

const state = {
  db: null,
  questions: [],
  sourceRecords: [],
  view: "library",
  search: "",
  stage: "all",
  difficulty: "all",
  videoSource: "file",
  retainedVideoBlob: null,
  retainedVideoName: "",
  pendingAttachments: [],
  attachmentPreviewUrls: [],
  activeObjectUrls: [],
  cameraStream: null,
  cameraMode: "",
  qrScanFrame: 0,
  qrScanLastAt: 0,
  pendingDeleteId: null,
  cardObjectUrls: [],
  activeTransfer: null,
  resourceFilters: { year: "all", stage: "all", keyword: "" },
  curriculumGrade: "all",
  questionPage: 1,
  questionListSignature: "",
  questionSearchIndex: new Map(),
  masteryEvidence: new Map(),
  masterySummary: null
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  const activation = window.PhysicsStudioActivation;
  if (!activation?.whenActivated) {
    console.error("应用未启动：激活校验模块缺失。");
    return;
  }
  activation.whenActivated.then(init).catch((error) => {
    console.error("应用未启动：激活校验未通过。", error);
  });
});

async function init() {
  let learningStorageError = null;
  const learningRepository = window.PhysicsStudioStorageRepository;
  const learningEngine = window.PHYSICS_LEARNING_ENGINE;
  if (!learningRepository?.prepareLearningState || !learningRepository?.stageLearningState || !learningEngine?.storageKey) {
    learningStorageError = new Error("学习档案存储模块未就绪");
  } else {
    try {
      await learningRepository.prepareLearningState(learningEngine.storageKey);
      await learningRepository.stageLearningState(learningEngine.storageKey, learningEngine.loadState());
    } catch (error) {
      learningStorageError = error;
    }
  }
  if (learningStorageError) {
    learningRepository?.enterReadOnlyFault?.(learningStorageError, "startup");
    console.error("学习数据存储初始化失败；为防止覆盖历史记录，已停止学习写入。", learningStorageError);
    renderLearningStorageReadOnlyFault();
    return;
  }
  cacheElements();
  bindEvents();
  updateCurriculumBookOptions("八年级");
  try {
    state.db = await openDatabase();
    await seedDatabaseIfEmpty();
    await upgradeBundledSamples();
    // v2.9.0 keeps legacy v2.8 records intact.  Retired grade-seven records
    // remain in IndexedDB for backup/restore compatibility; active v2.9
    // learning views continue to filter them out without deleting data.
    const installedCurriculumCount = await installCurriculumBank();
    const installedMockCount = await installMockExamBank();
    const installedOriginalPracticeCount = await installOriginalPracticeBank();
    const installedTargetedPracticeCount = await installTargetedPracticeBank();
    const installedRealExamCount = await installRealExamQuestionIndex();
    const migratedSourceCount = await migrateManagedSourceRecords();
    await refreshQuestions();
    try {
      await auditLegacyAutoGrading();
    } catch (error) {
      learningStorageError = error;
      console.error("旧自动评分核验标记未保存；原始作答仍保留。", error);
    }
    initResourceCenter();
    publishAppApi();
    document.dispatchEvent(new CustomEvent("physics-learning-state-changed", { detail: { restored: true } }));
    if (learningStorageError) showToast("学习数据未保存：长期存储初始化失败，请先导出备份并检查可用空间。", true);
    if (installedCurriculumCount > 0 || installedMockCount > 0 || installedOriginalPracticeCount > 0 || installedTargetedPracticeCount > 0 || installedRealExamCount > 0 || migratedSourceCount > 0) {
      const parts = [];
      if (installedCurriculumCount > 0) parts.push(`${installedCurriculumCount} 道原创同步练习`);
      if (installedMockCount > 0) parts.push(`${installedMockCount} 道原创模拟题`);
      if (installedOriginalPracticeCount > 0) parts.push(`${installedOriginalPracticeCount} 道长沙课程适配原创变式题`);
      if (installedTargetedPracticeCount > 0) parts.push(`${installedTargetedPracticeCount} 道母题—迁移—反例专项题`);
      if (installedRealExamCount > 0) parts.push(`${installedRealExamCount} 道真题题号与考点索引`);
      if (migratedSourceCount > 0) parts.push(`${migratedSourceCount} 条无正文或授权未核实记录已移至题源`);
      showToast(`题库已更新：${parts.join("，")}。`);
    }
  } catch (error) {
    console.error(error);
    showToast("无法打开浏览器本地数据库，请检查隐私或存储设置。", true);
  }
}

function renderLearningStorageReadOnlyFault() {
  if (document.getElementById("learningStorageReadOnlyFault")) return;
  const notice = document.createElement("div");
  notice.id = "learningStorageReadOnlyFault";
  notice.setAttribute("role", "alert");
  notice.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#f8f8f4;color:#173c31;font:16px/1.65 system-ui,sans-serif";
  const message = document.createElement("div");
  message.style.cssText = "max-width:560px;padding:24px;border:2px solid #ad4b37;border-radius:16px;background:white";
  const title = document.createElement("h1");
  title.textContent = "学习档案已进入只读保护";
  const explanation = document.createElement("p");
  explanation.textContent = "本机学习记录暂时无法安全读取。为避免覆盖原有作答，当前不能继续作答或保存；旧迁移备份未被自动写回。请勿清理应用数据，检查设备存储权限和剩余空间后重新打开应用。";
  message.append(title, explanation);
  notice.append(message);
  document.body.append(notice);
}

function publishAppApi() {
  window.PhysicsStudioApp = Object.freeze({
    getQuestions() {
      return state.questions.map((question) => ({ ...question }));
    },
    async getBackupRecords() {
      // Practice views intentionally hide source-only records. A complete
      // backup reads the committed store so those records survive a restore.
      return getAllQuestions();
    },
    getQuestion(questionId) {
      const question = state.questions.find((item) => item.id === questionId);
      return question ? { ...question } : null;
    },
    openQuestion(questionId) {
      const question = state.questions.find((item) => item.id === questionId);
      if (question) openDetail(question);
      return Boolean(question);
    },
    openTransferPractice(questionId) {
      const question = state.questions.find((item) => item.id === questionId);
      if (!question) return false;
      openTransferPractice(question);
      return true;
    },
    editQuestion(questionId) {
      const question = state.questions.find((item) => item.id === questionId);
      if (question) openForm(question);
      return Boolean(question);
    },
    openQuestionForm() {
      openForm();
      return true;
    },
    async addQuestion(input) {
      if (!input || typeof input !== "object") throw new Error("缺少试题数据。");
      const content = String(input.content || "").trim();
      if (!content) throw new Error("请先确认题目文字。");
      const now = new Date().toISOString();
      const grade = ["八年级", "九年级", "高一", "高二", "高三"].includes(input.grade)
        ? input.grade
        : "八年级";
      const stage = /^高/.test(grade) ? "高中" : "初中";
      const question = {
        id: createId(),
        title: String(input.title || content.split(/\r?\n/)[0] || "学生拍入的物理题").trim().slice(0, 80),
        stage,
        grade,
        topic: String(input.topic || "待教师核对").trim().slice(0, 40),
        difficulty: ["基础", "进阶", "挑战"].includes(input.difficulty) ? input.difficulty : "进阶",
        source: "学生拍题收录",
        sourceUrl: "",
        sourceLicense: "用户自行上传（权利状态由用户确认）",
        content,
        solution: String(input.solution || "待订正：先独立完成建模与作答，再按提示修正。").trim(),
        answer: String(input.answer || "").trim(),
        attachments: normalizeAttachments(input.attachments),
        videoType: "none",
        videoUrl: "",
        videoBlob: null,
        videoName: "",
        mastered: false,
        wrong: input.reason !== "收藏典型题",
        wrongAt: input.reason !== "收藏典型题" ? now : null,
        wrongCount: input.reason === "我做错了" ? 1 : 0,
        captureReason: String(input.reason || "我不会"),
        studentOriginalAnswer: String(input.studentOriginalAnswer || "").trim(),
        recognitionStatus: String(input.recognitionStatus || "学生已人工确认题目文字"),
        metadataReviewStatus: "系统推荐，待学生或教师核对",
        fullTextIncluded: true,
        userEdited: true,
        createdAt: now,
        updatedAt: now
      };
      question.contentAudit = window.PHYSICS_LEARNING_ENGINE?.auditQuestion?.(question) || null;
      question.contentReviewStatus = question.contentAudit?.requiresTeacherReview
        ? "待教师审核"
        : "规则检查未发现风险";
      await putQuestion(question);
      await refreshQuestions();
      return { ...question };
    },
    async updateQuestion(questionId, changes) {
      const question = state.questions.find((item) => item.id === questionId);
      if (!question || !changes || typeof changes !== "object") return false;
      await putQuestion({
        ...question,
        ...changes,
        id: question.id,
        updatedAt: new Date().toISOString()
      });
      await refreshQuestions();
      return true;
    },
    async importQuestionBatch(records, options = {}) {
      if (!Array.isArray(records) || !records.length) throw new Error("没有可导入的题目。");
      if (records.length > 1900) throw new Error("单次最多导入 1900 道题。");
      const existingIds = new Set((await getAllQuestions()).map((question) => question.id));
      const added = [];
      const skipped = [];
      for (const input of records) {
        if (!isValidImportedQuestion(input)) {
          skipped.push({ id: String(input?.id || ""), reason: "字段或年级不符合要求" });
          continue;
        }
        if (existingIds.has(input.id)) {
          skipped.push({ id: input.id, reason: "题号已存在" });
          continue;
        }
        const now = new Date().toISOString();
        const question = {
          ...input,
          attachments: normalizeAttachments(input.attachments),
          videoType: input.videoType === "url" && isValidHttpUrl(input.videoUrl) ? "url" : "none",
          videoUrl: input.videoType === "url" && isValidHttpUrl(input.videoUrl) ? input.videoUrl : "",
          videoBlob: null,
          videoName: "",
          mastered: false,
          wrong: false,
          wrongAt: null,
          wrongCount: 0,
          transferNotes: {},
          fullTextIncluded: input.fullTextIncluded !== false,
          contentReviewStatus: String(input.contentReviewStatus || options.reviewStatus || "待教师审核"),
          createdAt: input.createdAt || now,
          updatedAt: now
        };
        question.contentAudit = window.PHYSICS_LEARNING_ENGINE?.auditQuestion?.(question) || null;
        await putQuestion(question);
        existingIds.add(question.id);
        added.push(question.id);
      }
      await refreshQuestions();
      return { added, skipped };
    },
    async restoreCompleteBackup(records, learningState) {
      if (!Array.isArray(records) || records.length > 5000) {
        throw new Error("完整备份题目数量不符合要求。");
      }
      const ids = records.map((question) => question?.id);
      if (new Set(ids).size !== ids.length || records.some((question) => {
        if (question?.resourceOnly === true) {
          return !(typeof question.id === "string" && question.id.trim()
            && typeof question.title === "string" && question.title.trim()
            && (question.sourceUrl == null || typeof question.sourceUrl === "string"));
        }
        return !isValidImportedQuestion(question);
      })) {
        throw new Error("完整备份含无效字段。");
      }
      const repository = window.PhysicsStudioStorageRepository;
      const learningEngine = window.PHYSICS_LEARNING_ENGINE;
      await repository?.flush?.();
      const previousQuestions = await getAllQuestions();
      const previousLearning = learningEngine?.loadState?.();
      try {
        await replaceAllQuestions(records.map((question) => ({
          ...question,
          attachments: normalizeAttachments(question.attachments),
          videoBlob: question.videoBlob instanceof Blob ? question.videoBlob : null
        })));
        if (learningState && learningEngine) {
          learningEngine.saveState(learningState);
          await repository?.flush?.();
        }
        await refreshQuestions();
        return { restored: records.length };
      } catch (error) {
        const rollbackFailures = [];
        try { await replaceAllQuestions(previousQuestions); } catch (rollbackError) { rollbackFailures.push(rollbackError); }
        if (previousLearning && learningEngine) {
          try {
            learningEngine.saveState(previousLearning);
            await repository?.flush?.();
          } catch (rollbackError) { rollbackFailures.push(rollbackError); }
        }
        try { await refreshQuestions(); } catch (rollbackError) { rollbackFailures.push(rollbackError); }
        if (rollbackFailures.length) {
          throw new Error("完整备份导入失败且回滚未全部完成；请停止操作并保留原备份文件。");
        }
        throw error;
      }
    },
    getStats() {
      const evidence = state.masterySummary;
      const completeQuestions = state.questions.filter(isCompletePracticeQuestion);
      return {
        total: completeQuestions.length,
        records: state.questions.length,
        sourceIndexes: state.questions.length - completeQuestions.length,
        mastered: evidence?.mastered || 0,
        wrong: completeQuestions.filter((question) => question.wrong).length,
        videos: completeQuestions.filter(hasVideo).length,
        mastery: evidence ? {
          counts: { ...evidence.counts },
          masteryRate: evidence.masteryRate,
          rules: evidence.rules
        } : null,
        knowledgePointEvidence: state.knowledgePointEvidence || null
      };
    },
    getContentCoverage() {
      return window.PhysicsStudioContentCatalog?.getCoverage?.(state.questions) || null;
    },
    getMasteryEvidence(questionId) {
      const item = state.masteryEvidence.get(questionId);
      return item ? { ...item, question: undefined } : null;
    },
    auditQuestion(questionOrId) {
      const question = typeof questionOrId === "string"
        ? state.questions.find((item) => item.id === questionOrId)
        : questionOrId;
      return window.PHYSICS_LEARNING_ENGINE?.auditQuestion?.(question || {}) || null;
    }
  });
  document.dispatchEvent(new CustomEvent("physics-studio-ready"));
}

function cacheElements() {
  [
    "addQuestionButton", "emptyAddButton", "questionModal", "questionForm", "questionId",
    "formTitle", "titleInput", "stageInput", "gradeInput", "topicInput", "difficultyInput",
    "sourceInput", "bookInput", "chapterInput", "sectionInput", "sourceLicenseInput", "sourceUrlInput",
    "contentInput", "solutionInput", "answerInput", "videoFileInput",
    "openPhotoScannerButton", "scanImageInput", "openQrScannerButton", "attachmentFileInput",
    "attachmentDropZone", "attachmentList", "photoScanModal", "photoCameraVideo", "photoCameraCanvas",
    "photoCameraStatus", "capturePhotoButton", "qrScannerModal", "qrCameraVideo", "qrCameraCanvas",
    "qrScannerStatus", "qrImageInput", "qrManualInput", "applyQrTextButton",
    "videoUrlInput", "selectedFile", "filePanel", "urlPanel", "unifiedSearchForm", "searchInput",
    "edgeSearchButton", "searchStatus", "stageFilter",
    "difficultyFilter", "questionGrid", "emptyState", "totalCount", "videoCount",
    "masteredCount", "masteryRate", "resultCount", "listHeading", "pageTitle", "viewKicker",
    "viewDescription", "detailModal", "detailContent", "confirmDialog", "cancelDeleteButton",
    "confirmDeleteButton", "exportButton", "importInput", "fullBackupButton", "fullBackupPassword", "fullRestoreInput",
    "toast", "menuButton", "drawerBackdrop",
    "syncCenterButton", "quickSyncButton", "quickSyncStatus", "syncDot", "syncModal", "workspace", "toolbar",
    "progressPanel", "progressSummary", "progressRate", "progressTrack", "progressBarFill",
    "progressMasteredCount", "progressPendingCount", "wrongNavCount", "analysisPanel", "analysisTitle",
    "analysisMasteryRate", "analysisWrongCount", "analysisTopicCount", "analysisTransferCount",
    "analysisPriority", "analysisAdviceList", "knowledgePanel", "knowledgeTitle", "knowledgeGrid",
    "curriculumPanel", "curriculumTitle", "curriculumSummary", "curriculumGrid", "curriculumGradeFilter",
    "questionListSection", "transferModal", "transferContent", "contentAuditPanel"
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  window.addEventListener("physics-storage-error", (event) => {
    const reason = String(event.detail?.reason || "本地存储事务失败").slice(0, 160);
    showToast(`数据未保存：${reason}。请先导出备份并检查可用空间。`, true);
  });
  els.addQuestionButton.addEventListener("click", () => openForm());
  els.emptyAddButton.addEventListener("click", handleEmptyAction);
  document.querySelectorAll(".close-modal").forEach((button) => {
    button.addEventListener("click", () => els.questionModal.close());
  });
  document.querySelectorAll(".source-tab").forEach((tab) => {
    tab.addEventListener("click", () => setVideoSource(tab.dataset.source));
  });
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => navigateToView(button.dataset.view));
  });
  document.querySelectorAll(".stat-card[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => navigateToView(button.dataset.viewTarget, true));
  });
  els.progressPanel.addEventListener("click", handleProgressClick);
  els.analysisPanel.addEventListener("click", handleInsightNavigation);
  els.knowledgePanel.addEventListener("click", handleInsightNavigation);
  els.curriculumPanel.addEventListener("click", handleCurriculumClick);
  els.curriculumGradeFilter.addEventListener("change", () => {
    state.curriculumGrade = els.curriculumGradeFilter.value;
    renderCurriculum();
  });
  els.transferContent.addEventListener("click", handleTransferClick);

  els.questionForm.addEventListener("submit", saveQuestion);
  els.questionForm.addEventListener("input", renderContentAuditPreview);
  els.questionForm.addEventListener("change", renderContentAuditPreview);
  els.videoFileInput.addEventListener("change", onVideoSelected);
  els.openPhotoScannerButton.addEventListener("click", openPhotoScanner);
  els.scanImageInput.addEventListener("change", handleScanImageFiles);
  els.openQrScannerButton.addEventListener("click", openQrScanner);
  els.attachmentFileInput.addEventListener("change", handleAttachmentFiles);
  els.attachmentDropZone.addEventListener("dragenter", handleAttachmentDrag);
  els.attachmentDropZone.addEventListener("dragover", handleAttachmentDrag);
  els.attachmentDropZone.addEventListener("dragleave", handleAttachmentDragLeave);
  els.attachmentDropZone.addEventListener("drop", handleAttachmentDrop);
  els.attachmentDropZone.addEventListener("paste", handleAttachmentPaste);
  els.attachmentDropZone.addEventListener("click", () => els.attachmentFileInput.click());
  els.attachmentDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.attachmentFileInput.click();
    }
  });
  els.attachmentList.addEventListener("click", handleAttachmentListClick);
  els.capturePhotoButton.addEventListener("click", capturePhoto);
  document.querySelectorAll(".close-photo-scan").forEach((button) => {
    button.addEventListener("click", () => els.photoScanModal.close());
  });
  document.querySelectorAll(".close-qr-scanner").forEach((button) => {
    button.addEventListener("click", () => els.qrScannerModal.close());
  });
  els.qrImageInput.addEventListener("change", decodeSelectedQrImage);
  els.applyQrTextButton.addEventListener("click", () => applyQrPayload(els.qrManualInput.value));
  els.bookInput.addEventListener("change", () => updateCurriculumChapterOptions(els.bookInput.value));
  els.chapterInput.addEventListener("change", () => updateCurriculumSectionOptions(els.chapterInput.value));
  els.sectionInput.addEventListener("change", syncTopicFromCurriculumSection);
  els.unifiedSearchForm.addEventListener("submit", searchLocalQuestions);
  els.searchInput.addEventListener("input", updateLocalSearch);
  els.edgeSearchButton.addEventListener("click", searchWithEdge);
  document.addEventListener("physics-learning-state-changed", () => {
    refreshMasteryEvidence();
    render();
  });
  els.stageFilter.addEventListener("change", () => {
    state.stage = els.stageFilter.value;
    render();
  });
  els.difficultyFilter.addEventListener("change", () => {
    state.difficulty = els.difficultyFilter.value;
    render();
  });

  els.questionGrid.addEventListener("click", handleGridClick);
  els.detailContent.addEventListener("click", handleDetailClick);
  els.cancelDeleteButton.addEventListener("click", () => els.confirmDialog.close());
  els.confirmDeleteButton.addEventListener("click", confirmDelete);
  els.exportButton.addEventListener("click", exportQuestions);
  els.importInput.addEventListener("change", importQuestions);
  els.fullBackupButton.addEventListener("click", exportCompleteBackup);
  els.fullRestoreInput.addEventListener("change", importCompleteBackup);
  els.menuButton.addEventListener("click", () => document.body.classList.add("drawer-open"));
  els.drawerBackdrop.addEventListener("click", closeDrawer);
  els.syncCenterButton.addEventListener("click", openResourceCenter);
  els.quickSyncButton.addEventListener("click", openResourceCenter);

  els.questionModal.addEventListener("close", resetForm);
  els.detailModal.addEventListener("close", releaseActiveVideo);
  els.photoScanModal.addEventListener("close", stopCamera);
  els.qrScannerModal.addEventListener("close", stopCamera);
  els.transferModal.addEventListener("close", () => { state.activeTransfer = null; });
  els.questionModal.addEventListener("click", closeDialogFromBackdrop);
  els.detailModal.addEventListener("click", closeDialogFromBackdrop);
  els.photoScanModal.addEventListener("click", closeDialogFromBackdrop);
  els.qrScannerModal.addEventListener("click", closeDialogFromBackdrop);
  els.transferModal.addEventListener("click", closeDialogFromBackdrop);
  els.confirmDialog.addEventListener("click", closeDialogFromBackdrop);
  els.syncModal.addEventListener("click", closeDialogFromBackdrop);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".card-menu")) closeAllPopovers();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllQuestions() {
  return new Promise((resolve, reject) => {
    const request = state.db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putQuestion(question) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(question);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error || request.error || new Error("题目保存事务失败。"));
    transaction.onabort = () => reject(transaction.error || new Error("题目保存事务已中止。"));
  });
}

function putQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    questions.forEach((question) => store.put(question));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("批量写入题库事务已中止。"));
  });
}

function deleteQuestion(id) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || request.error || new Error("题目删除事务失败。"));
    transaction.onabort = () => reject(transaction.error || new Error("题目删除事务已中止。"));
  });
}

function replaceAllQuestions(questions) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    questions.forEach((question) => store.put(question));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("数据库事务已中止。"));
  });
}

async function seedDatabaseIfEmpty() {
  const existing = await getAllQuestions();
  if (existing.length > 0) return;
  await Promise.all(seedQuestions.map((question) => putQuestion(question)));
}

async function upgradeBundledSamples() {
  const existing = await getAllQuestions();
  const byId = new Map(existing.map((question) => [question.id, question]));
  const updates = seedQuestions.flatMap((bundled) => {
    const stored = byId.get(bundled.id);
    if (!stored || stored.userEdited) return [];
    return [{
      ...stored,
      ...bundled,
      attachments: normalizeAttachments(stored.attachments),
      videoType: stored.videoType || bundled.videoType || "none",
      videoUrl: stored.videoUrl || "",
      videoBlob: stored.videoBlob || null,
      videoName: stored.videoName || "",
      mastered: Boolean(stored.mastered),
      wrong: Boolean(stored.wrong),
      wrongAt: stored.wrongAt || null,
      wrongCount: Number(stored.wrongCount) || 0,
      transferNotes: stored.transferNotes || {},
      createdAt: stored.createdAt || bundled.createdAt,
      updatedAt: new Date().toISOString()
    }];
  });
  await putQuestions(updates);
  return updates.length;
}

async function installCurriculumBank() {
  const bank = window.PHYSICS_CURRICULUM_BANK;
  if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) return 0;

  const markerKey = `physics-curriculum-bank-v${bank.version}`;
  const existing = await getAllQuestions();
  const repairPlan = window.PHYSICS_SOLUTION_FORMAT?.repairBundledSolutions(existing);
  const repairedIds = new Set(repairPlan?.repairedIds || []);
  try {
    if (appStorage().getItem(markerKey) === bank.contentVersion && repairedIds.size === 0) return 0;
  } catch (error) {
    console.warn("无法读取题库安装标记，将通过试题编号安全去重。", error);
  }

  const existingById = new Map((repairPlan?.questions || existing).map((question) => [question.id, question]));
  const missing = bank.questions.filter((question) => !existingById.has(question.id));
  const managedFields = [
    "title", "stage", "grade", "topic", "difficulty", "content", "answer",
    "sourceUrl", "sourceLicense", "textbookUnit", "curriculumBasis", "copyrightNote",
    "collection", "originalExercise", "curriculumBook", "curriculumChapter", "curriculumSection",
    "curriculumBookId", "curriculumChapterId", "curriculumSectionId"
  ];
  const identityFields = [
    "sourceUrl", "sourceLicense", "curriculumBasis", "copyrightNote", "collection",
    "originalExercise", "curriculumBook", "curriculumChapter", "curriculumSection",
    "curriculumBookId", "curriculumChapterId", "curriculumSectionId"
  ];
  const updates = bank.questions.flatMap((bundledQuestion) => {
    const storedQuestion = existingById.get(bundledQuestion.id);
    if (!storedQuestion || storedQuestion.collection !== "changsha-curriculum-original") return [];
    const fieldsToApply = storedQuestion.userEdited ? identityFields : managedFields;
    const safeBundledSolution = repairedIds.has(bundledQuestion.id)
      || storedQuestion.solution === bundledQuestion.solution;
    const merged = {
      ...storedQuestion,
      ...Object.fromEntries(fieldsToApply.map((field) => [field, bundledQuestion[field]])),
      ...(safeBundledSolution ? {
        solution: bundledQuestion.solution,
        contentVersion: bundledQuestion.contentVersion,
        contentHash: bundledQuestion.contentHash
      } : {}),
      examPoints: storedQuestion.userEdited
        ? [...(Array.isArray(storedQuestion.examPoints) ? storedQuestion.examPoints : bundledQuestion.examPoints)]
        : [...bundledQuestion.examPoints],
      attachments: normalizeAttachments(storedQuestion.attachments),
      updatedAt: storedQuestion.userEdited ? storedQuestion.updatedAt : bundledQuestion.updatedAt
    };
    const needsUpgrade = repairedIds.has(bundledQuestion.id)
      || fieldsToApply.some((field) => storedQuestion[field] !== bundledQuestion[field])
      || (safeBundledSolution && (storedQuestion.contentVersion !== bundledQuestion.contentVersion
        || storedQuestion.contentHash !== bundledQuestion.contentHash))
      || (!storedQuestion.userEdited
        && JSON.stringify(storedQuestion.examPoints || []) !== JSON.stringify(bundledQuestion.examPoints));
    return needsUpgrade ? [merged] : [];
  });
  await putQuestions([...missing.map((question) => ({ ...question })), ...updates]);

  try {
    appStorage().setItem(markerKey, bank.contentVersion);
  } catch (error) {
    console.warn("无法保存题库安装标记，但试题已按编号去重写入。", error);
  }
  return missing.length;
}

async function installMockExamBank() {
  const bank = window.PHYSICS_MOCK_EXAM_BANK;
  if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) return 0;

  const existing = await getAllQuestions();
  const repairPlan = window.PHYSICS_SOLUTION_FORMAT?.repairBundledSolutions(existing);
  const repairedIds = new Set(repairPlan?.repairedIds || []);
  const existingById = new Map((repairPlan?.questions || existing).map((question) => [question.id, question]));
  const additions = [];
  const updates = [];
  const managedFields = [
    "title", "stage", "grade", "topic", "difficulty", "content", "answer",
    "source", "sourceUrl", "sourceLicense", "curriculumBasis", "copyrightNote", "collection",
    "syncOrigin", "originalExercise", "originalMock", "examLevel", "examYear", "examRegion",
    "examPaperTitle", "examQuestionNumber", "examQuestionType", "examPaperStatus",
    "resourceRightsStatus", "fullTextIncluded"
  ];

  bank.questions.forEach((bundledQuestion) => {
    const stored = existingById.get(bundledQuestion.id);
    if (!stored) {
      additions.push({
        ...bundledQuestion,
        examPoints: [...bundledQuestion.examPoints],
        attachments: normalizeAttachments(bundledQuestion.attachments)
      });
      return;
    }
    if (stored.collection !== "changsha-original-mock-exams") return;

    const metadataFields = [
      "curriculumBasis", "copyrightNote", "collection", "syncOrigin", "originalExercise",
      "originalMock", "examLevel", "examYear", "examRegion", "examPaperTitle",
      "examQuestionNumber", "examQuestionType", "examPaperStatus"
    ];
    const fieldsToApply = stored.userEdited ? metadataFields : managedFields;
    const safeBundledSolution = repairedIds.has(bundledQuestion.id)
      || stored.solution === bundledQuestion.solution;
    const merged = {
      ...stored,
      ...Object.fromEntries(fieldsToApply.map((field) => [field, bundledQuestion[field]])),
      ...(safeBundledSolution ? {
        solution: bundledQuestion.solution,
        contentVersion: bundledQuestion.contentVersion,
        contentHash: bundledQuestion.contentHash
      } : {}),
      examPoints: stored.userEdited
        ? [...(Array.isArray(stored.examPoints) ? stored.examPoints : bundledQuestion.examPoints)]
        : [...bundledQuestion.examPoints],
      attachments: normalizeAttachments(stored.attachments),
      videoType: stored.videoType || "none",
      videoUrl: stored.videoUrl || "",
      videoBlob: stored.videoBlob || null,
      videoName: stored.videoName || "",
      mastered: Boolean(stored.mastered),
      wrong: Boolean(stored.wrong),
      wrongAt: stored.wrongAt || null,
      wrongCount: Number(stored.wrongCount) || 0,
      transferNotes: stored.transferNotes || {},
      createdAt: stored.createdAt || bundledQuestion.createdAt,
      updatedAt: stored.updatedAt || bundledQuestion.updatedAt
    };
    const needsUpdate = repairedIds.has(bundledQuestion.id)
      || fieldsToApply.some((field) => stored[field] !== bundledQuestion[field])
      || (safeBundledSolution && (stored.contentVersion !== bundledQuestion.contentVersion
        || stored.contentHash !== bundledQuestion.contentHash))
      || (!stored.userEdited
        && JSON.stringify(stored.examPoints || []) !== JSON.stringify(bundledQuestion.examPoints));
    if (needsUpdate) updates.push(merged);
  });

  await putQuestions([...additions, ...updates]);
  try {
    appStorage().setItem(`physics-mock-exam-bank-v${bank.version}`, bank.contentVersion);
  } catch (error) {
    console.warn("无法保存原创模拟卷安装标记，但试题已按编号安全去重写入。", error);
  }
  return additions.length;
}

async function installOriginalPracticeBank() {
  const bank = window.PHYSICS_ORIGINAL_PRACTICE_BANK;
  if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) return 0;

  const existing = await getAllQuestions();
  const existingById = new Map(existing.map((question) => [question.id, question]));
  const additions = [];
  const updates = [];
  const managedFields = [
    "title", "stage", "grade", "topic", "difficulty", "questionType", "content", "solution",
    "answer", "source", "sourceUrl", "sourceLicense", "curriculumBasis", "copyrightNote",
    "curriculumBook", "curriculumChapter", "curriculumSection", "collection", "syncOrigin",
    "originalExercise", "fullTextIncluded", "contentReviewStatus", "metadataReviewStatus"
  ];
  const identityFields = [
    "source", "sourceUrl", "sourceLicense", "curriculumBasis", "copyrightNote", "collection",
    "syncOrigin", "originalExercise", "fullTextIncluded", "contentReviewStatus", "metadataReviewStatus"
  ];

  bank.questions.forEach((bundledQuestion) => {
    const stored = existingById.get(bundledQuestion.id);
    if (!stored) {
      additions.push({
        ...bundledQuestion,
        examPoints: [...bundledQuestion.examPoints],
        attachments: normalizeAttachments(bundledQuestion.attachments)
      });
      return;
    }
    if (stored.collection !== "changsha-original-practice-1500") return;

    const fieldsToApply = stored.userEdited ? identityFields : managedFields;
    const merged = {
      ...stored,
      ...Object.fromEntries(fieldsToApply.map((field) => [field, bundledQuestion[field]])),
      examPoints: stored.userEdited
        ? [...(Array.isArray(stored.examPoints) ? stored.examPoints : bundledQuestion.examPoints)]
        : [...bundledQuestion.examPoints],
      attachments: normalizeAttachments(stored.attachments),
      videoType: stored.videoType || "none",
      videoUrl: stored.videoUrl || "",
      videoBlob: stored.videoBlob || null,
      videoName: stored.videoName || "",
      mastered: Boolean(stored.mastered),
      wrong: Boolean(stored.wrong),
      wrongAt: stored.wrongAt || null,
      wrongCount: Number(stored.wrongCount) || 0,
      transferNotes: stored.transferNotes || {},
      createdAt: stored.createdAt || bundledQuestion.createdAt,
      updatedAt: stored.updatedAt || bundledQuestion.updatedAt
    };
    const needsUpdate = fieldsToApply.some((field) => stored[field] !== bundledQuestion[field])
      || (!stored.userEdited
        && JSON.stringify(stored.examPoints || []) !== JSON.stringify(bundledQuestion.examPoints));
    if (needsUpdate) updates.push(merged);
  });

  await putQuestions([...additions, ...updates]);
  try {
    appStorage().setItem(`physics-original-practice-bank-v${bank.version}`, bank.contentVersion);
  } catch (error) {
    console.warn("无法保存原创变式题库安装标记，但题目已按编号安全去重写入。", error);
  }
  return additions.length;
}

async function installTargetedPracticeBank() {
  const bank = window.PHYSICS_TARGETED_PRACTICE_BANK;
  if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) return 0;

  const existing = await getAllQuestions();
  const existingById = new Map(existing.map((question) => [question.id, question]));
  const additions = [];
  const updates = [];
  const managedFields = [
    "title", "stage", "grade", "topic", "difficulty", "questionType", "content", "solution",
    "answer", "source", "sourceUrl", "sourceLicense", "curriculumBasis", "copyrightNote",
    "curriculumBook", "curriculumChapter", "curriculumSection", "collection", "syncOrigin",
    "originalExercise", "fullTextIncluded", "contentReviewStatus", "metadataReviewStatus",
    "modelFamilyId", "variantRole", "transferGroupId"
  ];
  const identityFields = [
    "source", "sourceUrl", "sourceLicense", "curriculumBasis", "copyrightNote", "collection",
    "syncOrigin", "originalExercise", "fullTextIncluded", "contentReviewStatus", "metadataReviewStatus",
    "modelFamilyId", "variantRole", "transferGroupId"
  ];

  bank.questions.forEach((bundledQuestion) => {
    const stored = existingById.get(bundledQuestion.id);
    if (!stored) {
      additions.push({
        ...bundledQuestion,
        examPoints: [...bundledQuestion.examPoints],
        misconceptionTags: [...bundledQuestion.misconceptionTags],
        recommendationTags: [...bundledQuestion.recommendationTags],
        attachments: normalizeAttachments(bundledQuestion.attachments)
      });
      return;
    }
    if (stored.collection !== "changsha-targeted-transfer-400") return;

    const fieldsToApply = stored.userEdited ? identityFields : managedFields;
    const merged = {
      ...stored,
      ...Object.fromEntries(fieldsToApply.map((field) => [field, bundledQuestion[field]])),
      examPoints: stored.userEdited
        ? [...(Array.isArray(stored.examPoints) ? stored.examPoints : bundledQuestion.examPoints)]
        : [...bundledQuestion.examPoints],
      misconceptionTags: stored.userEdited
        ? [...(Array.isArray(stored.misconceptionTags) ? stored.misconceptionTags : bundledQuestion.misconceptionTags)]
        : [...bundledQuestion.misconceptionTags],
      recommendationTags: stored.userEdited
        ? [...(Array.isArray(stored.recommendationTags) ? stored.recommendationTags : bundledQuestion.recommendationTags)]
        : [...bundledQuestion.recommendationTags],
      attachments: normalizeAttachments(stored.attachments),
      videoType: stored.videoType || "none",
      videoUrl: stored.videoUrl || "",
      videoBlob: stored.videoBlob || null,
      videoName: stored.videoName || "",
      mastered: Boolean(stored.mastered),
      wrong: Boolean(stored.wrong),
      wrongAt: stored.wrongAt || null,
      wrongCount: Number(stored.wrongCount) || 0,
      transferNotes: stored.transferNotes || {},
      createdAt: stored.createdAt || bundledQuestion.createdAt,
      updatedAt: stored.updatedAt || bundledQuestion.updatedAt
    };
    const needsUpdate = fieldsToApply.some((field) => stored[field] !== bundledQuestion[field])
      || (!stored.userEdited
        && (JSON.stringify(stored.examPoints || []) !== JSON.stringify(bundledQuestion.examPoints)
          || JSON.stringify(stored.misconceptionTags || []) !== JSON.stringify(bundledQuestion.misconceptionTags)
          || JSON.stringify(stored.recommendationTags || []) !== JSON.stringify(bundledQuestion.recommendationTags)));
    if (needsUpdate) updates.push(merged);
  });

  await putQuestions([...additions, ...updates]);
  try {
    appStorage().setItem(`physics-targeted-practice-bank-v${bank.version}`, bank.contentVersion);
  } catch (error) {
    console.warn("无法保存专项迁移题库安装标记，但题目已按编号安全去重写入。", error);
  }
  return additions.length;
}

function shouldMoveManagedRecordToSource(question) {
  if (!question || question.resourceOnly) return false;
  const managedSourceCollections = new Set([
    "changsha-internet-source-index"
  ]);
  if (managedSourceCollections.has(question.collection)) return true;

  const appManaged = question.syncOrigin === "source-index";
  if (!appManaged) return false;
  const rightsText = [question.sourceLicense, question.resourceRightsStatus].filter(Boolean).join(" ");
  const hasNoRedistributionClearance = /未授权|未核实|需核验|仅保存来源链接/.test(rightsText);
  const hasNoFullText = question.fullTextIncluded === false
    || question.sourceLicense === "仅保存来源链接";
  return hasNoRedistributionClearance || hasNoFullText;
}

async function migrateManagedSourceRecords() {
  const existing = await getAllQuestions();
  const candidates = existing.filter(shouldMoveManagedRecordToSource);
  if (candidates.length === 0) return 0;

  const migratedAt = new Date().toISOString();
  await Promise.all(candidates.map((question) => putQuestion({
    ...question,
    resourceOnly: true,
    migratedToSourceAt: migratedAt,
    migrationReason: question.fullTextIncluded === false || question.sourceLicense === "仅保存来源链接"
      ? "没有可离线练习的完整题目正文"
      : "正文再发行授权状态未核实"
  })));
  return candidates.length;
}

function sourceRecordToResource(question) {
  if (!isValidHttpUrl(question.sourceUrl)) return null;
  const title = question.examPaperTitle
    || String(question.title || "互联网物理题源").replace(/^试卷索引｜/, "");
  const description = question.examPaperTitle
    ? `原题号和考点索引已保留在本地题源记录中；因没有完整题干或正文再发行许可未核实，不计入离线练习题库。`
    : String(question.content || "已从题库迁移到题源。").split(/\n+/)[0];
  return {
    id: `archived-source-${question.id}`,
    title,
    provider: question.source || "互联网公开来源",
    stage: question.stage || "全部",
    year: Number(question.examYear || question.resourceYear) || 0,
    access: question.resourceAccess || "题源链接",
    local: /长沙|湖南/.test([question.examRegion, question.title, question.source].join(" ")),
    description,
    url: question.sourceUrl,
    rightsStatus: question.resourceRightsStatus || question.sourceLicense || "授权状态需核验",
    tags: [
      question.examLevel,
      question.examRegion,
      question.topic,
      ...(Array.isArray(question.examPoints) ? question.examPoints : [])
    ].filter(Boolean)
  };
}

function getResourceCatalog() {
  const archivedResources = state.sourceRecords.map(sourceRecordToResource).filter(Boolean);
  return [...resourceCatalog, ...archivedResources].filter((resource, index, resources) => {
    const resourceKey = isValidHttpUrl(resource.url)
      ? resource.url.trim().toLocaleLowerCase("en-US")
      : resource.id;
    return resources.findIndex((item) => {
      const itemKey = isValidHttpUrl(item.url)
        ? item.url.trim().toLocaleLowerCase("en-US")
        : item.id;
      return itemKey === resourceKey;
    }) === index;
  });
}

async function installInternetSourceIndex() {
  const candidates = resourceCatalog.filter((resource) => {
    return resource.local
      && ["初中", "高中"].includes(resource.stage)
      && isValidHttpUrl(resource.url)
      && /(试卷|试题|真题|模拟|检测|月考|期中|期末|资料包|更新索引|中考|高考|一模|二模|预测|联考|阶段)/.test(resource.title)
      && !/(教材|课程标准|评议公告|考试说明)/.test(resource.title);
  });
  const existing = await getAllQuestions();
  const existingById = new Map(existing.map((question) => [question.id, question]));
  const now = new Date().toISOString();
  const additions = [];
  const updates = [];
  candidates.forEach((resource) => {
    const id = `source-index-${resource.id}`;
    const stored = existingById.get(id);
    const grade = inferResourceGrade(resource);
    const answerStatus = inferResourceAnswerStatus(resource);
    const indexedQuestion = {
      id,
      title: `试卷索引｜${resource.title}`,
      stage: resource.stage,
      grade,
      topic: grade === "九年级" ? "中考综合"
        : grade === "高三" ? "高考综合"
          : "阶段综合",
      difficulty: "进阶",
      source: resource.provider,
      sourceUrl: resource.url,
      sourceLicense: "仅保存来源链接",
      content: `互联网试卷索引：${resource.description || resource.title}\n\n本记录保存可追溯来源、年份和答案状态，不包含尚未取得转载许可的试卷正文。`,
      solution: "点击题目详情中的“查看原始来源”核对试卷正文、参考答案和解析。取得相应许可后，可使用拍照扫描、文件上传或 JSON 导入把正文归入教材知识点。",
      answer: answerStatus,
      attachments: normalizeAttachments(stored?.attachments),
      videoType: stored?.videoType || "none",
      videoUrl: stored?.videoUrl || "",
      videoBlob: stored?.videoBlob || null,
      videoName: stored?.videoName || "",
      mastered: stored?.mastered || false,
      wrong: Boolean(stored?.wrong),
      wrongAt: stored?.wrongAt || null,
      wrongCount: Number(stored?.wrongCount) || 0,
      transferNotes: stored?.transferNotes || {},
      collection: "changsha-internet-source-index",
      syncOrigin: "source-index",
      resourceYear: resource.year,
      resourceAccess: resource.access,
      resourceRightsStatus: resource.rightsStatus || "授权状态需核验",
      createdAt: stored?.createdAt || now,
      updatedAt: stored?.updatedAt || now
    };
    if (!stored) {
      additions.push(indexedQuestion);
      return;
    }
    if (stored.collection !== "changsha-internet-source-index") return;
    const comparableFields = [
      "title", "stage", "grade", "topic", "source", "sourceUrl", "sourceLicense",
      "content", "solution", "answer", "resourceYear", "resourceAccess", "resourceRightsStatus"
    ];
    if (comparableFields.some((field) => stored[field] !== indexedQuestion[field])) {
      updates.push({ ...stored, ...indexedQuestion, updatedAt: now });
    }
  });
  await Promise.all([...additions, ...updates].map((question) => putQuestion(question)));
  return additions.length;
}

async function installRealExamQuestionIndex() {
  const bank = window.PHYSICS_REAL_EXAM_INDEX;
  if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0) return 0;

  const markerKey = `physics-real-exam-index-v${bank.version}`;
  try {
    appStorage().getItem(markerKey);
  } catch (error) {
    console.warn("无法读取近六年真题安装标记，将通过题目编号安全去重。", error);
  }

  const existing = await getAllQuestions();
  const existingById = new Map(existing.map((question) => [question.id, question]));
  const additions = [];
  const updates = [];
  const now = new Date().toISOString();

  bank.questions.forEach((bundledQuestion) => {
    const stored = existingById.get(bundledQuestion.id);
    if (!stored) {
      additions.push({
        ...bundledQuestion,
        examPoints: [...bundledQuestion.examPoints],
        resourceOnly: false
      });
      return;
    }
    if (stored.collection !== "changsha-six-year-real-exam-index") return;

    const managedFields = [
      "title", "stage", "grade", "topic", "difficulty", "source", "sourceUrl", "answerUrl",
      "sourceLicense", "content", "solution", "answer", "collection", "syncOrigin",
      "examLevel", "examYear", "examRegion", "examPaperTitle", "examQuestionNumber",
      "examQuestionType", "examScopeNote", "examPaperStatus", "resourceRightsStatus",
      "fullTextIncluded", "verifiedAt"
    ];
    const identityFields = [
      "collection", "syncOrigin", "examLevel", "examYear", "examRegion", "examPaperTitle",
      "examQuestionNumber", "examQuestionType", "examScopeNote", "verifiedAt"
    ];
    const fieldsToApply = stored.userEdited ? identityFields : managedFields;
    const merged = {
      ...stored,
      ...Object.fromEntries(fieldsToApply.map((field) => [field, bundledQuestion[field]])),
      examPoints: stored.userEdited
        ? [...(Array.isArray(stored.examPoints) ? stored.examPoints : bundledQuestion.examPoints)]
        : [...bundledQuestion.examPoints],
      attachments: normalizeAttachments(stored.attachments),
      videoType: stored.videoType || "none",
      videoUrl: stored.videoUrl || "",
      videoBlob: stored.videoBlob || null,
      videoName: stored.videoName || "",
      mastered: Boolean(stored.mastered),
      wrong: Boolean(stored.wrong),
      wrongAt: stored.wrongAt || null,
      wrongCount: Number(stored.wrongCount) || 0,
      transferNotes: stored.transferNotes || {},
      resourceOnly: false,
      migratedToSourceAt: null,
      migrationReason: "",
      createdAt: stored.createdAt || bundledQuestion.createdAt,
      updatedAt: now
    };
    const needsUpdate = stored.resourceOnly === true
      || fieldsToApply.some((field) => stored[field] !== bundledQuestion[field])
      || (!stored.userEdited
        && JSON.stringify(stored.examPoints || []) !== JSON.stringify(bundledQuestion.examPoints));
    if (needsUpdate) updates.push(merged);
  });

  await Promise.all([...additions, ...updates].map((question) => putQuestion(question)));
  try {
    appStorage().setItem(markerKey, bank.contentVersion);
  } catch (error) {
    console.warn("无法保存近六年真题安装标记，但题目已按编号去重写入。", error);
  }
  return additions.length;
}

function inferResourceGrade(resource) {
  const text = [resource.title, ...(resource.tags || [])].join(" ");
  if (/八年级|初二/.test(text)) return "八年级";
  if (/九年级|初三|中考/.test(text)) return "九年级";
  if (/高一/.test(text)) return "高一";
  if (/高二/.test(text)) return "高二";
  if (/高三|高考/.test(text)) return "高三";
  return resource.stage === "初中" ? "九年级" : "高三";
}

function inferResourceAnswerStatus(resource) {
  const text = [resource.title, resource.description, ...(resource.tags || [])].join(" ");
  if (/无答案/.test(text)) return "来源页面标注无答案。";
  if (/含解析|解析版|答案解析|详解/.test(text)) {
    return "来源页面标注含参考答案或解析；具体内容以打开后的原页面为准。";
  }
  if (/含答案|答案/.test(text)) {
    return "来源页面标注含参考答案；具体内容以打开后的原页面为准。";
  }
  return "答案状态请在来源页面核对。";
}

function inferQuestionTypeMetadata(question = {}) {
  const explicit = String(question.questionType || question.examQuestionType || "").trim();
  if (explicit) return explicit;
  const text = [question.title, question.content, question.solution, question.answer].join(" ");
  if (/选择题|单选|多选|\b[A-D][.、)]/.test(text)) return "单项选择题";
  if (/填空|（\s*）|\(\s*\)|____|横线上/.test(text)) return "填空题";
  if (/实验|探究|器材|测量|装置|数据处理/.test(text)) return "实验题";
  if (/判断/.test(text)) return "判断题";
  if (/简答|说明|解释|为什么|比较|论述/.test(text)) return "简答题";
  if (/求|计算|速度|质量|电流|电压|功率|能量|周期|距离|时间/.test(text)) return "计算题";
  return "未标注";
}

function canonicalKnowledgePointId(question = {}) {
  const taxonomyResolver = window.PHYSICS_CURRICULUM_TAXONOMY?.resolveKnowledgePoint;
  if (typeof taxonomyResolver === "function") {
    const resolved = taxonomyResolver(question);
    if (resolved.id) return resolved.id;
  }
  const explicit = String(question.knowledgePointId || "").trim();
  if (explicit) return explicit;
  const section = String(question.curriculumSectionId || question.curriculumSection || "").trim();
  if (section && /^[-A-Za-z0-9_:.]+$/.test(section)) return `kp:section:${section}`;
  const label = String(question.topic || question.knowledgePoint || question.topicLabel || "")
    .normalize("NFKC").replace(/[\s\u3000]+/g, "").trim();
  if (!label) return "";
  // Semantic aliases stay in one evidence bucket even when source wording
  // differs (e.g. “带电粒子在磁场中运动/中的运动”).
  const compact = label.replace(/中的?/g, "").replace(/运动运动/g, "运动");
  if (/带电粒子.*磁场.*运动/.test(compact)) return "kp:带电粒子-磁场运动";
  return `kp:${compact.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 120)}`;
}

function normalizeQuestionMetadata(question = {}) {
  const questionType = inferQuestionTypeMetadata(question);
  const collection = String(question.collection || "local").trim() || "local";
  const modelDefinitionId = String(question.modelDefinitionId || question.modelFamilyId || `${collection}:${question.topic || question.id}`).slice(0, 160);
  const retestGroupId = String(question.retestGroupId || question.transferGroupId || modelDefinitionId).slice(0, 160);
  const diagnosticEligible = question.diagnosticEligible != null
    ? Boolean(question.diagnosticEligible)
    : ["diagnostic-anchor", "retest-anchor"].includes(question.evidenceTier);
  const autoScorable = question.autoScorable != null
    ? Boolean(question.autoScorable)
    : ["单项选择题", "多项选择题", "填空题", "判断题", "计算题"].some((type) => questionType.includes(type));
  return {
    ...question,
    questionType,
    knowledgePointId: canonicalKnowledgePointId(question),
    cognitiveDemand: String(question.cognitiveDemand || question.cognitiveRequirement || (question.difficulty === "挑战" ? "迁移" : question.difficulty === "进阶" ? "应用" : "基础")),
    representationType: String(question.representationType || (/实验|探究/.test(questionType) ? "实验" : /图|图像/.test(String(question.content || "")) ? "图像" : "文字/公式")),
    independenceGroupId: String(question.independenceGroupId || modelDefinitionId).slice(0, 160),
    assessmentPurpose: String(question.assessmentPurpose || (question.diagnosticEligible ? "diagnostic" : "practice")),
    evidenceTier: String(question.evidenceTier || (question.variantRole === "core" ? "diagnostic-anchor" : "practice-variant")),
    modelDefinitionId,
    retestGroupId,
    diagnosticEligible,
    autoScorable
  };
}

async function normalizeStoredQuestionMetadata(records) {
  const normalized = (records || []).map(normalizeQuestionMetadata);
  const updates = normalized.filter((question, index) => {
    const previous = records[index];
    return ["questionType", "knowledgePointId", "evidenceTier", "modelDefinitionId", "retestGroupId", "diagnosticEligible", "autoScorable", "cognitiveDemand", "representationType", "independenceGroupId", "assessmentPurpose"]
      .some((field) => previous[field] !== question[field]);
  });
  if (updates.length) await putQuestions(updates);
  return normalized;
}

async function refreshQuestions() {
  const storedRecords = await normalizeStoredQuestionMetadata(await getAllQuestions());
  state.sourceRecords = storedRecords.filter((question) => question.resourceOnly);
  state.questions = storedRecords.filter((question) => !question.resourceOnly).sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  state.questionSearchIndex.clear();
  refreshMasteryEvidence();
  render();
  document.dispatchEvent(new CustomEvent("physics-studio-questions-changed", {
    detail: { total: state.questions.length }
  }));
}

async function auditLegacyAutoGrading() {
  const engine = window.PHYSICS_LEARNING_ENGINE;
  if (!engine?.markLegacyGradingForReview || !engine?.gradeFinalAnswer) return 0;
  const learning = engine.loadState();
  learning.settings = learning.settings || {};
  if (learning.settings.legacyGradeAuditVersion === "4.0.2") return 0;
  const byId = new Map(state.questions.map((question) => [question.id, question]));
  const uncertain = [];
  for (const attempt of learning.attempts || []) {
    if (attempt.grading?.status !== "correct" || attempt.grading?.manualReview
      || attempt.grading?.gradingVersion === engine.gradingVersion) continue;
    const question = byId.get(attempt.questionId);
    try {
      if (!question || !String(attempt.finalAnswer || "").trim()
        || engine.gradeFinalAnswer(question, attempt.finalAnswer).status !== "correct") {
        uncertain.push(attempt.id);
      }
    } catch (_error) {
      uncertain.push(attempt.id);
    }
  }
  if (uncertain.length) engine.markLegacyGradingForReview(learning, uncertain,
    "旧自动判题与当前题目规范不一致或无法复核；保留原结果，等待教师确认");
  learning.settings.legacyGradeAuditVersion = "4.0.2";
  engine.saveState(learning);
  await engine.awaitLastSave?.();
  if (uncertain.length) {
    refreshMasteryEvidence();
    render();
  }
  return uncertain.length;
}

function refreshMasteryEvidence() {
  const engine = window.PHYSICS_LEARNING_ENGINE;
  if (!engine?.loadState || !engine?.masterySummary) {
    state.masteryEvidence = new Map();
    state.masterySummary = null;
    state.knowledgePointEvidence = null;
    return;
  }
  const learningState = engine.loadState();
  state.masterySummary = engine.masterySummary(
    learningState,
    state.questions.filter(isCompletePracticeQuestion)
  );
  state.knowledgePointEvidence = engine.knowledgePointEvidenceSummary?.(
    learningState,
    state.questions.filter(isCompletePracticeQuestion)
  ) || null;
  state.masteryEvidence = new Map(
    state.masterySummary.profile.map((item) => [item.questionId, item])
  );
}

function getMasteryEvidence(question) {
  return state.masteryEvidence.get(question.id) || {
    questionId: question.id,
    code: "not-started",
    status: "未开始",
    reasons: ["尚无正式作答记录"]
  };
}

function render() {
  renderStats();
  renderProgress();
  renderInsights();
  renderCurriculum();
  renderViewLayout();
  renderQuestions();
}

function renderStats() {
  let total = 0;
  let video = 0;
  let wrong = 0;
  state.questions.forEach((question) => {
    if (isCompletePracticeQuestion(question)) total += 1;
    if (hasVideo(question)) video += 1;
    if (question.wrong) wrong += 1;
  });
  const mastered = state.masterySummary?.mastered || 0;
  els.totalCount.textContent = total;
  els.videoCount.textContent = video;
  els.masteredCount.textContent = mastered;
  els.masteryRate.textContent = state.knowledgePointEvidence?.coverageLabel || "0/0";
  els.wrongNavCount.textContent = wrong;
}

function renderProgress() {
  const coverage = state.knowledgePointEvidence;
  const total = coverage?.totalKnowledgePoints || 0;
  const evidenced = coverage?.evidencedKnowledgePoints || 0;
  const pending = Math.max(0, total - evidenced);
  const rate = coverage?.coverageRate || 0;
  els.progressPanel.classList.toggle("hidden", state.view !== "progress");
  els.progressRate.textContent = coverage?.coverageLabel || "0/0";
  els.progressMasteredCount.textContent = evidenced;
  els.progressPendingCount.textContent = pending;
  els.progressSummary.textContent = total
    ? `已有证据 ${evidenced}/${total} 个知识点；其中基本掌握 ${coverage.basic}、可迁移 ${coverage.transferable}、需巩固 ${coverage.reinforce}、证据不足 ${coverage.insufficient}。`
    : "当前年级没有可评估知识点，暂不能形成覆盖结论。";
  els.progressBarFill.style.width = `${rate}%`;
  els.progressTrack.setAttribute("aria-valuenow", String(rate));
}

function renderInsights() {
  const analysisVisible = state.view === "analysis";
  const knowledgeVisible = state.view === "knowledge";
  els.analysisPanel.classList.toggle("hidden", !analysisVisible);
  els.knowledgePanel.classList.toggle("hidden", !knowledgeVisible);
  if (!analysisVisible && !knowledgeVisible) return;

  const learningQuestions = state.questions.filter(isCompletePracticeQuestion);
  const wrong = learningQuestions.filter((question) => Boolean(question.wrong)).length;
  const topics = getTopicStats();
  const learningState = window.PHYSICS_LEARNING_ENGINE?.loadState?.();
  const activeProfileId = learningState?.activeProfileId;
  const completedVariantCount = (learningState?.variantAttempts || [])
    .filter((record) => record.profileId === activeProfileId && record.completedAt).length;
  const legacyTransferCount = learningQuestions.reduce((sum, question) => {
    return sum + Object.keys(question.transferNotes || {}).length;
  }, 0);
  const transferCount = completedVariantCount + legacyTransferCount;
  const coverage = state.knowledgePointEvidence;

  els.analysisMasteryRate.textContent = coverage?.coverageLabel || "0/0";
  els.analysisWrongCount.textContent = wrong;
  els.analysisTopicCount.textContent = topics.length;
  els.analysisTransferCount.textContent = transferCount;

  const priority = topics[0];
  if (priority) {
    els.analysisPriority.innerHTML = `
      <div class="priority-topic-row"><strong>${escapeHtml(priority.topic)}</strong><span>${escapeHtml(priority.evidenceStatus)}</span></div>
      <p>当前为${escapeHtml(priority.evidenceStatus)}，已有 ${priority.evidenceSampleSize} 条可追溯证据；该知识点可评估题目 ${priority.total} 道，当前错题 ${priority.wrong} 道。证据不足时不会推断总体能力。</p>`;
  } else {
    els.analysisPriority.innerHTML = "<p>题库中还没有可分析的知识点。添加题目并记录掌握情况后，这里会给出优先级。</p>";
  }

  const advice = buildLearningAdvice({ total: learningQuestions.length, mastered: coverage?.evidencedKnowledgePoints || 0, wrong, topics, transferCount });
  els.analysisAdviceList.innerHTML = advice.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  els.knowledgeGrid.innerHTML = topics.length
    ? topics.map(knowledgeTopicTemplate).join("")
    : '<div class="knowledge-empty">暂无知识点数据。添加试题并填写知识点后即可形成掌握图谱。</div>';
}

function renderViewLayout() {
  const standaloneView = ["analysis", "knowledge", "curriculum"].includes(state.view);
  els.toolbar.classList.toggle("hidden", standaloneView);
  els.questionListSection.classList.toggle("hidden", standaloneView);
}

function getTopicStats() {
  const engine = window.PHYSICS_LEARNING_ENGINE;
  const learningState = engine?.loadState?.();
  const activeProfileId = learningState?.activeProfileId;
  const variantCountByParent = new Map();
  (learningState?.variantAttempts || []).forEach((record) => {
    if (record.profileId !== activeProfileId || !record.completedAt) return;
    variantCountByParent.set(record.parentQuestionId, (variantCountByParent.get(record.parentQuestionId) || 0) + 1);
  });
  const evidenceByKey = new Map((state.knowledgePointEvidence?.byTopic || [])
    .map((item) => [item.key, item]));
  const topicMap = new Map();
  state.questions.forEach((question) => {
    const topic = question.topic || "未分类";
    const topicKey = engine?.topicKeyForQuestion?.(question)
      || `topic:${String(topic).trim().toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "-")}`;
    const current = topicMap.get(topicKey) || {
      topic,
      topicKey,
      total: 0,
      mastered: 0,
      wrong: 0,
      videos: 0,
      transfer: 0
    };
    current.total += 1;
    if (["mastered", "due"].includes(getMasteryEvidence(question).code)) current.mastered += 1;
    if (question.wrong) current.wrong += 1;
    if (hasVideo(question)) current.videos += 1;
    current.transfer += Object.keys(question.transferNotes || {}).length + (variantCountByParent.get(question.id) || 0);
    topicMap.set(topicKey, current);
  });

  const statusLabels = {
    insufficient: "证据不足",
    reinforce: "需巩固",
    basic: "基本掌握",
    transferable: "可迁移"
  };
  return Array.from(topicMap.values()).map((item) => {
    const evidence = evidenceByKey.get(item.topicKey);
    const evidenceCode = evidence?.code || "insufficient";
    return {
      ...item,
      evidenceCode,
      evidenceStatus: statusLabels[evidenceCode] || "证据不足",
      evidenceSampleSize: evidence?.sampleSize || 0,
      evidenceAttemptCount: evidence?.attemptCount || 0,
      evidenceTransferCount: evidence?.transferCount || 0,
      evidenceExamCount: evidence?.examCount || 0,
      evidenceLatestDate: evidence?.latestEvidenceDate || "暂无"
    };
  }).sort((a, b) => {
    const order = { reinforce: 0, insufficient: 1, basic: 2, transferable: 3 };
    return (order[a.evidenceCode] ?? 1) - (order[b.evidenceCode] ?? 1)
      || b.wrong - a.wrong
      || b.evidenceSampleSize - a.evidenceSampleSize
      || a.topic.localeCompare(b.topic, "zh-CN");
  });
}

function knowledgeTopicTemplate(topic) {
  return `
    <button class="knowledge-topic-card" data-topic="${escapeHtml(topic.topic)}" type="button">
      <div class="knowledge-topic-head">
        <div><strong>${escapeHtml(topic.topic)}</strong><span class="knowledge-status status-${escapeHtml(topic.evidenceCode)}">${escapeHtml(topic.evidenceStatus)}</span></div>
        <b>${topic.evidenceSampleSize} 条证据</b>
      </div>
      <div class="knowledge-topic-meta">
        <span>可评估题目 ${topic.total} 道</span>
        <span>正式作答 ${topic.evidenceAttemptCount} 次</span>
        <span>最近证据 ${escapeHtml(topic.evidenceLatestDate)}</span>
        <span>${topic.wrong} 道错题</span>
        <span>已验证迁移 ${topic.evidenceTransferCount} 条</span>
      </div>
      <small>打开该知识点试题 →</small>
    </button>`;
}

function getCurriculumBooks() {
  return Array.isArray(window.PHYSICS_CURRICULUM_TAXONOMY?.books)
    ? window.PHYSICS_CURRICULUM_TAXONOMY.books
    : [];
}

function questionMatchesCurriculum(question, book, chapter = null, section = null) {
  const bookMatches = question.curriculumBookId === book.id
    || question.curriculumBook === book.title
    || String(question.textbookUnit || "").startsWith(`${book.title}·`);
  if (!bookMatches) return false;

  if (chapter) {
    const chapterMatches = question.curriculumChapterId === chapter.id
      || question.curriculumChapter === chapter.title
      || String(question.textbookUnit || "").includes(`·${chapter.title}`);
    if (!chapterMatches) return false;
  }

  if (section) {
    const fields = [question.curriculumSectionId, question.curriculumSection, question.topic]
      .filter(Boolean)
      .map((value) => String(value));
    return fields.some((value) => value === section.id
      || value === section.title
      || value.includes(section.title)
      || section.title.includes(value));
  }
  return true;
}

function renderCurriculum() {
  const isVisible = state.view === "curriculum";
  els.curriculumPanel.classList.toggle("hidden", !isVisible);
  if (!isVisible) return;

  const allBooks = getCurriculumBooks();
  const books = state.curriculumGrade === "all"
    ? allBooks
    : allBooks.filter((book) => book.grades.includes(state.curriculumGrade));
  const chapters = books.flatMap((book) => book.chapters);
  const sections = chapters.flatMap((chapter) => chapter.sections);
  const mappedQuestionIds = new Set();
  books.forEach((book) => {
    state.questions.forEach((question) => {
      if (questionMatchesCurriculum(question, book)) mappedQuestionIds.add(question.id);
    });
  });

  els.curriculumSummary.innerHTML = `
    <article><span>教材与复习模板</span><strong>${books.length}</strong><small>当前年级范围</small></article>
    <article><span>章 / 专题</span><strong>${chapters.length}</strong><small>按教材顺序展开</small></article>
    <article><span>节 / 知识点</span><strong>${sections.length}</strong><small>可点击筛选题目</small></article>
    <article><span>已映射试题</span><strong>${mappedQuestionIds.size}</strong><small>当前题库中已归类</small></article>`;

  els.curriculumGrid.innerHTML = books.map((book) => {
    const bookCount = state.questions.filter((question) => questionMatchesCurriculum(question, book)).length;
    const gradeLabel = book.grades.join("、");
    return `
      <article class="curriculum-book-card" data-book-id="${escapeHtml(book.id)}">
        <header class="curriculum-book-head">
          <div>
            <span class="tag">${escapeHtml(book.stage)} · ${escapeHtml(gradeLabel)}</span>
            <h3>${escapeHtml(book.title)}</h3>
            <p>${escapeHtml(book.publisher)} · ${escapeHtml(book.structureBasis)}</p>
          </div>
          <span class="curriculum-book-count">${bookCount} 道已归类</span>
        </header>
        <div class="curriculum-chapters">
          ${book.chapters.map((chapter) => {
            const chapterCount = state.questions.filter((question) => {
              return questionMatchesCurriculum(question, book, chapter);
            }).length;
            return `
              <section class="curriculum-chapter">
                <div class="curriculum-chapter-head">
                  <button class="curriculum-query-button" data-curriculum-query="${escapeHtml(chapter.title)}" data-curriculum-stage="${escapeHtml(book.stage)}" type="button">
                    ${escapeHtml(chapter.chapterNo)}　${escapeHtml(chapter.title)}
                  </button>
                  <span class="curriculum-count-badge">${chapterCount} 道</span>
                </div>
                <div class="curriculum-section-list">
                  ${chapter.sections.map((section) => {
                    const sectionCount = state.questions.filter((question) => {
                      return questionMatchesCurriculum(question, book, chapter, section);
                    }).length;
                    return `<button data-curriculum-query="${escapeHtml(section.title)}" data-curriculum-stage="${escapeHtml(book.stage)}" title="题库内 ${sectionCount} 道" type="button">${escapeHtml(section.title)} · ${sectionCount}</button>`;
                  }).join("")}
                </div>
              </section>`;
          }).join("")}
        </div>
        <div class="curriculum-book-actions">
          <a class="curriculum-web-button" href="${escapeHtml(book.officialUrl)}" target="_blank" rel="noopener noreferrer">查看教材依据 ↗</a>
          <button class="curriculum-web-button" data-curriculum-web="${escapeHtml(`${gradeLabel} ${book.title}`)}" type="button">Edge 搜索本册长沙题源 ↗</button>
        </div>
      </article>`;
  }).join("");
}

function handleCurriculumClick(event) {
  const localTarget = event.target.closest("[data-curriculum-query]");
  if (localTarget) {
    const query = localTarget.dataset.curriculumQuery;
    resetListFilters();
    state.search = query.toLocaleLowerCase("zh-CN");
    state.stage = localTarget.dataset.curriculumStage || "all";
    els.searchInput.value = query;
    els.stageFilter.value = state.stage;
    setView("library");
    showToast(`已筛选“${query}”相关站内试题。`);
    return;
  }

  const webTarget = event.target.closest("[data-curriculum-web]");
  if (webTarget) {
    const query = `长沙 ${webTarget.dataset.curriculumWeb} 物理 试题 答案`;
    openExternalPage(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      "已在 Edge/Bing 中打开教材定向题源搜索。"
    );
  }
}

function buildLearningAdvice({ total, wrong, topics, transferCount }) {
  if (!total) return [
    "先收录有代表性的题目，并准确填写知识点。",
    "练习后及时标记错题与已掌握状态。",
    "数据积累后再查看薄弱知识点，避免样本过少造成误判。"
  ];

  const advice = [];
  if (wrong > 0) advice.push(`先复盘当前 ${wrong} 道错题，写清错误原因后再标记掌握。`);
  if (topics[0]) advice.push(`优先检查“${topics[0].topic}”，当前为${topics[0].evidenceStatus}，已有 ${topics[0].evidenceSampleSize} 条可追溯证据。`);
  const wrongWithoutVideo = state.questions.filter((question) => question.wrong && !hasVideo(question)).length;
  if (wrongWithoutVideo > 0) advice.push(`为 ${wrongWithoutVideo} 道缺少视频的错题补充方法视频，便于复盘关键步骤。`);
  if (transferCount === 0) advice.push("完成一道典型题后，进入专项变式并独立完成至少一题，检验方法是否能够迁移。");
  if (advice.length < 3) advice.push("定期复查已掌握题目，确认能够在不看解析的情况下重建推理过程。");
  return advice.slice(0, 4);
}

function isCompletePracticeQuestion(question) {
  const published = window.PhysicsStudioContentCatalog?.isPublishedQuestion
    ? window.PhysicsStudioContentCatalog.isPublishedQuestion(question)
    : Boolean(question && !question.resourceOnly && question.fullTextIncluded !== false);
  return Boolean(
    published
    && String(question.questionType || question.examQuestionType || "").trim()
    && String(question.questionType || question.examQuestionType || "") !== "未标注"
    && String(question.content || "").trim()
    && String(question.solution || "").trim()
    && String(question.answer || "").trim()
  );
}

function getFilteredQuestions() {
  return state.questions.filter((question) => {
    let searchable = state.questionSearchIndex.get(question.id);
    if (!searchable) {
      searchable = [
        question.title,
        question.stage,
        question.grade,
        question.topic,
        question.difficulty,
        question.source,
        question.content,
        question.solution,
        question.answer,
        question.textbookUnit,
        question.curriculumBook,
        question.curriculumChapter,
        question.curriculumSection,
        question.curriculumBasis,
        question.copyrightNote,
        question.sourceLicense,
        question.sourceUrl,
        question.answerUrl,
        question.examLevel,
        question.examYear,
        question.examRegion,
        question.examPaperTitle,
        question.examQuestionNumber,
        question.examQuestionType,
        question.examScopeNote,
        question.examPaperStatus,
        ...(Array.isArray(question.examPoints) ? question.examPoints : []),
        ...(Array.isArray(question.attachments) ? question.attachments.map((attachment) => attachment.name) : []),
        ...Object.values(question.transferNotes || {})
      ].join(" ").toLocaleLowerCase("zh-CN");
      state.questionSearchIndex.set(question.id, searchable);
    }
    const matchesSearch = !state.search || searchable.includes(state.search);
    const matchesStage = state.stage === "all" || question.stage === state.stage;
    const matchesDifficulty = state.difficulty === "all" || question.difficulty === state.difficulty;
    const matchesView = state.view === "library"
      || state.view === "progress"
      || (state.view === "videos" && hasVideo(question))
      || (state.view === "wrong" && Boolean(question.wrong))
      || (state.view === "mastered" && ["mastered", "due"].includes(getMasteryEvidence(question).code))
      || (state.view === "pending" && !["mastered", "due"].includes(getMasteryEvidence(question).code));
    return matchesSearch && matchesStage && matchesDifficulty && matchesView;
  });
}

function renderQuestions() {
  releaseCardVideos();
  if (["analysis", "knowledge", "curriculum"].includes(state.view)) {
    els.questionGrid.innerHTML = "";
    return;
  }
  const questions = getFilteredQuestions();
  const pageSize = QUESTION_PAGE_SIZE;
  const signature = [state.view, state.search, state.stage, state.difficulty].join("\u0000");
  if (signature !== state.questionListSignature) {
    state.questionListSignature = signature;
    state.questionPage = 1;
  }
  const totalPages = Math.max(1, Math.ceil(questions.length / pageSize));
  state.questionPage = Math.max(1, Math.min(totalPages, state.questionPage));
  const pageStart = (state.questionPage - 1) * pageSize;
  const visibleQuestions = questions.slice(pageStart, pageStart + pageSize);
  const completeCount = questions.filter(isCompletePracticeQuestion).length;
  const indexCount = questions.length - completeCount;
  els.resultCount.textContent = indexCount > 0
    ? `${completeCount} 道完整题 · ${indexCount} 条题源索引`
    : `${completeCount} 道完整题`;
  els.searchStatus.textContent = state.search
    ? `当前条件找到 ${questions.length} 道匹配记录，正在显示第 ${state.questionPage}/${totalPages} 页。`
    : `输入关键词可实时筛选站内试题；当前显示第 ${state.questionPage}/${totalPages} 页。`;
  els.questionGrid.classList.toggle("hidden", questions.length === 0);
  els.emptyState.classList.toggle("hidden", questions.length !== 0);
  els.questionGrid.innerHTML = visibleQuestions.map(questionCardTemplate).join("")
    + (questions.length > pageSize ? questionPaginationTemplate(state.questionPage, totalPages, questions.length) : "");
  const emptyCopy = {
    videos: ["还没有附带方法视频的题目", "可返回全部试题，从题目旁边的“添加方法视频”进入编辑。", "返回全部试题"],
    wrong: ["错题集目前是空的", "在题目卡片或解析页点击“加入错题集”，题目会集中显示在这里。", "返回全部试题"],
    mastered: ["还没有达到掌握证据标准的题目", "需要在不同日期低提示独立答对，并完成一道迁移练习。", "返回全部试题"],
    pending: ["当前题目都已达到掌握证据标准", "到期复习后，状态会根据新的作答证据继续更新。", "查看已掌握题目"]
  }[state.view] || ["这里还没有匹配的题目", "可以调整筛选条件，或添加一道新的物理试题。", "添加第一道题"];
  const emptyTitle = els.emptyState.querySelector("h3");
  const emptyDescription = els.emptyState.querySelector("p");
  emptyTitle.textContent = emptyCopy[0];
  emptyDescription.textContent = emptyCopy[1];
  els.emptyAddButton.textContent = emptyCopy[2];
}

function questionPaginationTemplate(currentPage, totalPages, totalRecords) {
  const firstVisible = (currentPage - 1) * QUESTION_PAGE_SIZE + 1;
  const lastVisible = Math.min(totalRecords, currentPage * QUESTION_PAGE_SIZE);
  return `
    <nav class="question-pagination" aria-label="题库分页">
      <span>显示 ${firstVisible}–${lastVisible} / ${totalRecords}</span>
      <div>
        <button data-question-page="${currentPage - 1}" type="button"${currentPage <= 1 ? " disabled" : ""}>上一页</button>
        <strong>第 ${currentPage} / ${totalPages} 页</strong>
        <button data-question-page="${currentPage + 1}" type="button"${currentPage >= totalPages ? " disabled" : ""}>下一页</button>
      </div>
    </nav>`;
}

function questionCardTemplate(question) {
  const videoMarkup = buildCardVideoMarkup(question);
  const mastery = getMasteryEvidence(question);
  return `
    <article class="question-card ${question.wrong ? "wrong-card" : ""}" data-id="${escapeHtml(question.id)}">
      <div class="question-card-main">
        <div class="card-top">
          <div class="card-meta">
            <span class="tag">${escapeHtml(question.stage)} · ${escapeHtml(question.grade || "未设年级")}</span>
            <span class="tag difficulty-${escapeHtml(question.difficulty)}">${escapeHtml(question.difficulty)}</span>
            <span class="tag">${escapeHtml(question.topic)}</span>
            ${question.curriculumChapter ? `<span class="tag">${escapeHtml(question.curriculumChapter)}</span>` : ""}
            ${question.originalMock ? '<span class="tag">模拟卷原创</span>' : question.originalExercise ? '<span class="tag">长沙同步原创</span>' : ""}
            ${question.collection === "changsha-six-year-real-exam-index" ? `<span class="tag tag-real-exam">${escapeHtml(String(question.examYear))} ${escapeHtml(question.examLevel)} · 第${escapeHtml(String(question.examQuestionNumber))}题</span>` : ""}
            ${question.collection === "changsha-six-year-real-exam-index" && question.fullTextIncluded === false ? '<span class="tag">原卷入口</span>' : ""}
            ${Array.isArray(question.attachments) && question.attachments.length ? `<span class="tag">附件 ${question.attachments.length}</span>` : ""}
            ${question.wrong ? '<span class="tag tag-wrong">错题</span>' : ""}
            <span class="tag evidence-${escapeHtml(mastery.code)}">掌握证据：${escapeHtml(window.PHYSICS_LEARNING_ENGINE?.masteryDisplayLabel?.(mastery) || mastery.status)}</span>
          </div>
          <div class="card-menu">
            <button class="more-button" data-action="menu" type="button" aria-label="题目操作">···</button>
            <div class="menu-popover hidden">
              <button data-action="edit" type="button">编辑</button>
              <button class="delete-action" data-action="delete" type="button">删除</button>
            </div>
          </div>
        </div>
        <h3><button class="question-title-button" data-action="view" type="button">${escapeHtml(question.title)}</button></h3>
        ${Array.isArray(question.examPoints) && question.examPoints.length ? `<div class="card-exam-points"><strong>考察点</strong>${question.examPoints.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>` : ""}
        <p class="question-preview">${escapeHtml(question.content)}</p>
        <div class="card-footer">
          <span class="card-source">${escapeHtml(question.source || "个人题库")}</span>
          <div class="card-actions">
            ${question.syncOrigin === "changsha-api" ? '<span class="remote-badge">↗ 网络来源</span>' : ""}
            <button class="wrong-button ${question.wrong ? "active" : ""}" data-action="wrong" type="button">${question.wrong ? "移出错题" : "加入错题"}</button>
            <button class="transfer-button" data-action="transfer" type="button">专项变式</button>
            <button class="coach-button" data-action="learn" type="button">分步训练</button>
            <span class="mastery-evidence-badge evidence-${escapeHtml(mastery.code)}" title="${escapeHtml(mastery.reasons.join("；"))}">${escapeHtml(window.PHYSICS_LEARNING_ENGINE?.masteryDisplayLabel?.(mastery) || mastery.status)}</span>
            <button class="view-button" data-action="view" type="button">查看解析</button>
          </div>
        </div>
      </div>
      <aside class="card-video-panel" aria-label="${escapeHtml(question.title)}的方法视频">
        <div class="card-video-heading"><span>方法视频</span><small>${hasVideo(question) ? "点击画面直接播放" : "可上传本地视频"}</small></div>
        ${videoMarkup}
      </aside>
    </article>`;
}

function buildCardVideoMarkup(question) {
  if (!hasVideo(question)) {
    return `
      <button class="card-video-empty" data-action="add-video" type="button">
        <span aria-hidden="true">＋</span>
        <strong>添加方法视频</strong>
        <small>为这道题上传讲解视频</small>
      </button>`;
  }

  let src = "";
  let label = "在线方法视频";
  if (question.videoType === "file" && question.videoBlob instanceof Blob) {
    src = URL.createObjectURL(question.videoBlob);
    state.cardObjectUrls.push(src);
    label = question.videoName || "本地方法视频";
  } else if (question.videoType === "url" && isValidHttpUrl(question.videoUrl)) {
    src = question.videoUrl;
  }

  if (!src) {
    return '<button class="card-video-empty error" data-action="add-video" type="button"><span aria-hidden="true">!</span><strong>视频无法读取</strong><small>点击重新添加视频</small></button>';
  }

  return `
    <video class="card-video-player" controls preload="metadata" src="${escapeHtml(src)}" aria-label="${escapeHtml(question.title)}的解题方法视频">当前浏览器无法播放此视频。</video>
    <div class="card-video-meta"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><button data-action="view" type="button">展开解析</button></div>`;
}

function setView(view) {
  state.view = view;
  const copy = {
    library: ["题目不是答案，是通往规律的路径。", "我的物理题库", "把典型问题、推理过程与方法视频沉淀在一起，让每次练习都留下可复用的理解。", "全部试题"],
    videos: ["把抽象步骤变成可暂停、可回看的推理过程。", "方法视频", "集中查看已经关联解题视频的试题，复盘受力、建模、列式与检验的完整过程。", "含视频试题"],
    wrong: ["错误是定位认知断点的证据。", "我的错题集", "集中复盘尚未订正的题目，补齐错误原因、正确方法与同类变式。", "待订正错题"],
    mastered: ["真正的掌握，是能够独立重建并迁移推理。", "已掌握题目", "状态来自跨日独立正确、提示依赖、迁移记录和复习时间，不接受手动勾选。", "已掌握试题"],
    progress: ["看见证据，才能安排下一次有效练习。", "掌握进度", "根据正式作答、提示依赖、迁移训练和间隔复习形成分层状态。", "学习进度清单"],
    pending: ["薄弱处不是失败，而是下一轮练习的起点。", "待掌握题目", "集中练习尚未达到证据标准的题目，完成闭环后自动更新状态。", "待掌握试题"],
    knowledge: ["把零散题目连接成可见的知识结构。", "知识点掌握", "按本机真实作答证据查看各知识点状态，并可点击进入对应试题。", "知识点掌握"],
    curriculum: ["先确定教材位置，再选择有代表性的练习。", "教材知识目录", "按册、章、节组织初高中物理题库，并把已授权题目归入稳定的知识结构。", "教材知识目录"],
    analysis: ["分析只描述已有学习证据，不替代正式测评。", "学情分析", "依据错题、掌握标记、视频与变式练习记录，确定下一步复习优先级。", "学情分析"]
  }[view];
  if (!copy) return;
  els.viewKicker.textContent = copy[0];
  els.pageTitle.textContent = copy[1];
  els.viewDescription.textContent = copy[2];
  els.listHeading.textContent = copy[3];
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".stat-card[data-view-target]").forEach((item) => {
    const target = item.dataset.viewTarget;
    item.classList.toggle("active", target === view || (target === "progress" && view === "pending"));
  });
  closeDrawer();
  render();
}

function navigateToView(view, resetFilters = false) {
  if (resetFilters) resetListFilters();
  setView(view);
  requestAnimationFrame(() => {
    els.workspace.scrollIntoView({ behavior: "auto", block: "start" });
    const focusTarget = state.view === "analysis"
      ? els.analysisTitle
      : state.view === "knowledge"
        ? els.knowledgeTitle
        : state.view === "curriculum"
          ? els.curriculumTitle
          : els.listHeading;
    focusTarget.focus({ preventScroll: true });
  });
}

function resetListFilters() {
  state.search = "";
  state.stage = "all";
  state.difficulty = "all";
  els.searchInput.value = "";
  els.stageFilter.value = "all";
  els.difficultyFilter.value = "all";
}

let localSearchRenderFrame = 0;

function updateLocalSearch() {
  state.search = els.searchInput.value.trim().toLocaleLowerCase("zh-CN");
  if (localSearchRenderFrame) return;
  const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback) => setTimeout(callback, 0);
  localSearchRenderFrame = schedule(() => {
    localSearchRenderFrame = 0;
    render();
  });
}

function searchLocalQuestions(event) {
  event.preventDefault();
  state.search = els.searchInput.value.trim().toLocaleLowerCase("zh-CN");
  setView("library");
  const count = getFilteredQuestions().length;
  showToast(state.search
    ? `站内找到 ${count} 道匹配试题。`
    : `已显示 ${count} 道站内试题。`);
  requestAnimationFrame(() => {
    els.questionListSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function searchWithEdge() {
  const query = els.searchInput.value.trim();
  if (!query) {
    showToast("请先输入需要联网搜索的关键词。", true);
    els.searchInput.focus();
    return;
  }
  const questionAnswerService = window.PhysicsStudioQuestionAnswerService;
  if (questionAnswerService?.searchOnline) {
    const result = questionAnswerService.searchOnline(query);
    showToast(result.answer || "已在 Microsoft Edge 中打开搜索。", !result.networkSearched);
    return;
  }
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  openExternalPage(searchUrl, "已在 Edge/Bing 中打开全网搜索。");
}

function openExternalPage(url, successMessage = "") {
  const opened = window.open(url, "_blank");
  if (!opened) {
    showToast("无法打开 Edge/Bing，请检查弹出窗口或默认浏览器设置。", true);
    return false;
  }
  try {
    opened.opener = null;
  } catch (error) {
    console.debug("无法清除外部窗口引用。", error);
  }
  if (successMessage) showToast(successMessage);
  return true;
}

function handleProgressClick(event) {
  const target = event.target.closest("[data-progress-view]");
  if (!target) return;
  navigateToView(target.dataset.progressView, true);
}

function handleInsightNavigation(event) {
  const topicTarget = event.target.closest("[data-topic]");
  if (topicTarget) {
    const topic = topicTarget.dataset.topic;
    resetListFilters();
    state.search = topic.toLocaleLowerCase("zh-CN");
    els.searchInput.value = topic;
    setView("library");
    requestAnimationFrame(() => els.workspace.scrollIntoView({ behavior: "smooth", block: "start" }));
    return;
  }

  const viewTarget = event.target.closest("[data-analysis-view]");
  if (viewTarget) navigateToView(viewTarget.dataset.analysisView, true);
}

function handleEmptyAction() {
  if (state.view === "pending") {
    navigateToView("mastered", true);
  } else if (["videos", "wrong", "mastered"].includes(state.view)) {
    navigateToView("library", true);
  } else {
    openForm();
  }
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
}

function handleGridClick(event) {
  const pageTarget = event.target.closest("[data-question-page]");
  if (pageTarget && !pageTarget.disabled) {
    state.questionPage = Number(pageTarget.dataset.questionPage) || 1;
    renderQuestions();
    els.questionListSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const card = event.target.closest(".question-card");
  const actionTarget = event.target.closest("[data-action]");
  if (!card || !actionTarget) return;
  const question = state.questions.find((item) => item.id === card.dataset.id);
  if (!question) return;

  const action = actionTarget.dataset.action;
  if (action === "menu") {
    const popover = actionTarget.nextElementSibling;
    const willOpen = popover.classList.contains("hidden");
    closeAllPopovers();
    popover.classList.toggle("hidden", !willOpen);
  } else if (action === "view") {
    openDetail(question);
  } else if (action === "edit") {
    closeAllPopovers();
    openForm(question);
  } else if (action === "delete") {
    closeAllPopovers();
    requestDelete(question.id);
  } else if (action === "wrong") {
    toggleWrong(question);
  } else if (action === "transfer") {
    openTransferPractice(question, "condition");
  } else if (action === "learn") {
    document.dispatchEvent(new CustomEvent("physics-studio-start-learning", {
      detail: { questionId: question.id }
    }));
  } else if (action === "add-video") {
    openForm(question);
    setTimeout(() => {
      const videoSection = els.videoFileInput.closest(".form-section");
      videoSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector('.source-tab[data-source="file"]')?.focus();
    }, 80);
  }
}

function closeAllPopovers() {
  document.querySelectorAll(".menu-popover").forEach((popover) => popover.classList.add("hidden"));
}

function openForm(question = null) {
  resetForm();
  if (question) {
    els.formTitle.textContent = "编辑物理试题";
    els.questionId.value = question.id;
    els.titleInput.value = question.title;
    els.stageInput.value = question.stage;
    updateGradeOptions(question.stage, question.grade);
    els.topicInput.value = question.topic;
    els.difficultyInput.value = question.difficulty;
    els.sourceInput.value = question.source || "";
    updateCurriculumBookOptions(
      question.grade,
      question.curriculumBookId || "",
      question.curriculumBook || question.textbookUnit?.split("·")[0] || ""
    );
    updateCurriculumChapterOptions(
      els.bookInput.value,
      question.curriculumChapterId || "",
      question.curriculumChapter || question.textbookUnit?.split("·")[1] || ""
    );
    updateCurriculumSectionOptions(
      els.chapterInput.value,
      question.curriculumSectionId || "",
      question.curriculumSection || ""
    );
    els.sourceLicenseInput.value = question.sourceLicense || (question.originalExercise ? "应用内原创" : "个人原创");
    els.sourceUrlInput.value = question.sourceUrl || "";
    els.contentInput.value = question.content;
    els.solutionInput.value = question.solution;
    els.answerInput.value = question.answer || "";
    els.videoUrlInput.value = question.videoUrl || "";
    state.pendingAttachments = normalizeAttachments(question.attachments);
    renderAttachmentList();
    state.retainedVideoBlob = question.videoBlob || null;
    state.retainedVideoName = question.videoName || "";
    if (question.videoType === "url") setVideoSource("url");
    if (question.videoType === "file" && question.videoName) {
      showSelectedFile(question.videoName, question.videoBlob?.size || 0, true);
    }
  }
  renderContentAuditPreview();
  els.questionModal.showModal();
  setTimeout(() => els.titleInput.focus(), 50);
}

function resetForm() {
  els.questionForm.reset();
  els.questionId.value = "";
  els.formTitle.textContent = "添加物理试题";
  els.videoFileInput.value = "";
  els.selectedFile.classList.add("hidden");
  els.selectedFile.textContent = "";
  state.retainedVideoBlob = null;
  state.retainedVideoName = "";
  state.pendingAttachments = [];
  releaseAttachmentPreviews();
  renderAttachmentList();
  els.scanImageInput.value = "";
  els.attachmentFileInput.value = "";
  els.qrImageInput.value = "";
  els.qrManualInput.value = "";
  setVideoSource("file");
  updateGradeOptions("初中", "八年级");
  updateCurriculumBookOptions("八年级");
  renderContentAuditPreview();
}

function buildQuestionDraftForAudit() {
  const curriculum = getSelectedCurriculum();
  return {
    title: els.titleInput?.value.trim() || "",
    stage: els.stageInput?.value || "初中",
    grade: els.gradeInput?.value || "八年级",
    topic: els.topicInput?.value.trim() || "",
    difficulty: els.difficultyInput?.value || "进阶",
    source: els.sourceInput?.value.trim() || "",
    sourceLicense: els.sourceLicenseInput?.value || "",
    sourceUrl: els.sourceUrlInput?.value.trim() || "",
    curriculumChapter: curriculum.chapter?.title || "",
    textbookUnit: [curriculum.book?.title, curriculum.chapter?.title, curriculum.section?.title]
      .filter(Boolean)
      .join("·"),
    content: els.contentInput?.value.trim() || "",
    solution: els.solutionInput?.value.trim() || "",
    answer: els.answerInput?.value.trim() || "",
    attachments: state.pendingAttachments,
    fullTextIncluded: true
  };
}

function renderContentAuditPreview() {
  if (!els.contentAuditPanel || !window.PHYSICS_LEARNING_ENGINE?.auditQuestion) return;
  const audit = window.PHYSICS_LEARNING_ENGINE.auditQuestion(buildQuestionDraftForAudit());
  const riskCount = audit.errorCount + audit.warningCount;
  els.contentAuditPanel.className = `content-audit-panel audit-${audit.status}`;
  els.contentAuditPanel.innerHTML = `
    <div class="content-audit-summary">
      <strong>${escapeHtml(audit.label)}</strong>
      <span>${audit.errorCount} 项高风险 · ${audit.warningCount} 项需复核${audit.infoCount ? ` · ${audit.infoCount} 项建议` : ""}</span>
    </div>
    ${audit.issues.length ? `
      <ul>${audit.issues.slice(0, 8).map((issue) => `
        <li class="audit-${escapeHtml(issue.severity)}">
          <span>${issue.severity === "error" ? "高风险" : issue.severity === "warning" ? "复核" : "建议"}</span>
          <div><strong>${escapeHtml(issue.label)}</strong><p>${escapeHtml(issue.detail)}</p><small>处理建议：${escapeHtml(issue.next)}</small></div>
        </li>`).join("")}</ul>
      ${audit.issues.length > 8 ? `<p class="audit-more">另有 ${audit.issues.length - 8} 项，请先处理上方关键问题。</p>` : ""}
    ` : "<p>当前输入未触发内置结构规则；仍需教师核对物理正确性和来源凭证。</p>"}
    <small class="audit-boundary">${escapeHtml(audit.boundary)}</small>`;
  els.contentAuditPanel.dataset.riskCount = String(riskCount);
}

function updateGradeOptions(stage, selected = "") {
  const options = stage === "初中" ? ["八年级", "九年级"] : ["高一", "高二", "高三"];
  els.gradeInput.innerHTML = options.map((grade) => `<option${grade === selected ? " selected" : ""}>${grade}</option>`).join("");
}

function updateCurriculumBookOptions(grade, selectedId = "", selectedTitle = "") {
  const books = getCurriculumBooks().filter((book) => book.grades.includes(grade));
  const selectedBook = books.find((book) => book.id === selectedId || book.title === selectedTitle) || books[0];
  els.bookInput.innerHTML = books.map((book) => {
    return `<option value="${escapeHtml(book.id)}"${book.id === selectedBook?.id ? " selected" : ""}>${escapeHtml(book.title)}</option>`;
  }).join("");
  updateCurriculumChapterOptions(selectedBook?.id || "");
}

function updateCurriculumChapterOptions(bookId, selectedId = "", selectedTitle = "") {
  const book = getCurriculumBooks().find((item) => item.id === bookId);
  const selectedChapter = book?.chapters.find((chapter) => {
    return chapter.id === selectedId || chapter.title === selectedTitle;
  });
  els.chapterInput.innerHTML = [
    '<option value="">未指定章</option>',
    ...(book?.chapters || []).map((chapter) => {
      return `<option value="${escapeHtml(chapter.id)}"${chapter.id === selectedChapter?.id ? " selected" : ""}>${escapeHtml(`${chapter.chapterNo} ${chapter.title}`)}</option>`;
    })
  ].join("");
  updateCurriculumSectionOptions(selectedChapter?.id || "");
}

function updateCurriculumSectionOptions(chapterId, selectedId = "", selectedTitle = "") {
  const chapter = getCurriculumBooks().flatMap((book) => book.chapters)
    .find((item) => item.id === chapterId);
  const selectedSection = chapter?.sections.find((section) => {
    return section.id === selectedId || section.title === selectedTitle;
  });
  els.sectionInput.innerHTML = [
    '<option value="">未指定节</option>',
    ...(chapter?.sections || []).map((section) => {
      return `<option value="${escapeHtml(section.id)}"${section.id === selectedSection?.id ? " selected" : ""}>${escapeHtml(section.title)}</option>`;
    })
  ].join("");
}

function syncTopicFromCurriculumSection() {
  if (els.topicInput.value.trim() || !els.sectionInput.value) return;
  const section = getCurriculumBooks().flatMap((book) => book.chapters)
    .flatMap((chapter) => chapter.sections)
    .find((item) => item.id === els.sectionInput.value);
  if (section) els.topicInput.value = section.title;
}

function getSelectedCurriculum() {
  const book = getCurriculumBooks().find((item) => item.id === els.bookInput.value);
  const chapter = book?.chapters.find((item) => item.id === els.chapterInput.value);
  const section = chapter?.sections.find((item) => item.id === els.sectionInput.value);
  return { book, chapter, section };
}

elsProxyStageListener();
function elsProxyStageListener() {
  document.addEventListener("change", (event) => {
    if (event.target?.id === "stageInput") {
      updateGradeOptions(event.target.value);
      updateCurriculumBookOptions(els.gradeInput.value);
    } else if (event.target?.id === "gradeInput") {
      updateCurriculumBookOptions(event.target.value);
    }
  });
}

function setVideoSource(source) {
  state.videoSource = source;
  document.querySelectorAll(".source-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.source === source);
  });
  els.filePanel?.classList.toggle("hidden", source !== "file");
  els.urlPanel?.classList.toggle("hidden", source !== "url");
}

async function onVideoSelected() {
  const file = els.videoFileInput.files[0];
  if (!file) return;
  try {
    const security = window.PhysicsStudioSecurity;
    if (security) await security.inspectFile(file, "video");
    if (file.size > MAX_VIDEO_BYTES) throw new Error("单个视频不能超过 200 MB。");
    const existingVideoBytes = state.questions.reduce((sum, question) => {
      return sum + (question.videoBlob instanceof Blob ? question.videoBlob.size : 0);
    }, 0);
    if (existingVideoBytes + file.size > MAX_LIBRARY_MEDIA_BYTES) {
      throw new Error("本地视频总量不能超过 2 GB。");
    }
    await security?.ensureStorageCapacity?.(file.size * 1.1);
  } catch (error) {
    els.videoFileInput.value = "";
    showToast(error.message || "请选择真实的 MP4、WebM 或 MOV 视频文件。", true);
    return;
  }
  showSelectedFile(file.name, file.size, false);
}

function showSelectedFile(name, size, retained) {
  const sizeLabel = size ? formatBytes(size) : "大小未知";
  els.selectedFile.textContent = `${retained ? "已保存：" : "已选择："}${name} · ${sizeLabel}`;
  els.selectedFile.classList.remove("hidden");
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment) => attachment && attachment.blob instanceof Blob)
    .slice(0, MAX_ATTACHMENT_COUNT)
    .map((attachment) => ({
      id: typeof attachment.id === "string" && attachment.id ? attachment.id : createId(),
      name: sanitizeAttachmentName(attachment.name),
      type: String(attachment.type || attachment.blob.type || "application/octet-stream"),
      size: Number(attachment.size) || attachment.blob.size || 0,
      kind: attachment.kind === "image" || isImageAttachment(attachment)
        ? "image"
        : "document",
      createdAt: attachment.createdAt || new Date().toISOString(),
      blob: attachment.blob
    }));
}

function sanitizeAttachmentName(value) {
  const cleaned = String(value || "试题附件")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 120);
  return cleaned || "试题附件";
}

function isImageAttachment(value) {
  const type = String(value?.type || value?.blob?.type || "").toLocaleLowerCase("en-US");
  const name = String(value?.name || "").toLocaleLowerCase("en-US");
  return type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(name);
}

function isAllowedAttachment(file) {
  if (!(file instanceof Blob)) return false;
  const name = String(file.name || "");
  const type = String(file.type || "").toLocaleLowerCase("en-US");
  return type.startsWith("image/")
    || ["application/pdf", "text/plain", "text/markdown", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(type)
    || /\.(jpe?g|png|webp|gif|pdf|txt|md|docx?)$/i.test(name);
}

function releaseAttachmentPreviews() {
  state.attachmentPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.attachmentPreviewUrls = [];
}

function renderAttachmentList() {
  releaseAttachmentPreviews();
  if (!state.pendingAttachments.length) {
    els.attachmentList.innerHTML = "";
    els.attachmentList.classList.add("hidden");
    return;
  }
  els.attachmentList.classList.remove("hidden");
  els.attachmentList.innerHTML = state.pendingAttachments.map((attachment) => {
    let preview = `<span class="attachment-file-icon">${escapeHtml(getAttachmentExtension(attachment.name))}</span>`;
    if (attachment.kind === "image") {
      const url = URL.createObjectURL(attachment.blob);
      state.attachmentPreviewUrls.push(url);
      preview = `<span class="attachment-preview"><img src="${escapeHtml(url)}" alt=""></span>`;
    }
    return `
      <div class="attachment-item" data-attachment-id="${escapeHtml(attachment.id)}">
        ${preview}
        <span class="attachment-item-copy">
          <strong title="${escapeHtml(attachment.name)}">${escapeHtml(attachment.name)}</strong>
          <small>${escapeHtml(attachment.kind === "image" ? "扫描图片" : "题目文件")} · ${formatBytes(attachment.size)}</small>
        </span>
        <button class="attachment-remove-button" data-attachment-remove="${escapeHtml(attachment.id)}" type="button" aria-label="移除${escapeHtml(attachment.name)}">×</button>
      </div>`;
  }).join("");
}

function getAttachmentExtension(name) {
  const match = String(name || "").match(/\.([^.]+)$/);
  return (match?.[1] || "FILE").slice(0, 5).toLocaleUpperCase("en-US");
}

function handleAttachmentListClick(event) {
  const button = event.target.closest("[data-attachment-remove]");
  if (!button) return;
  state.pendingAttachments = state.pendingAttachments.filter((attachment) => {
    return attachment.id !== button.dataset.attachmentRemove;
  });
  renderAttachmentList();
}

async function handleScanImageFiles() {
  const files = Array.from(els.scanImageInput.files || []);
  els.scanImageInput.value = "";
  await addAttachmentFiles(files, "相册图片导入");
}

async function handleAttachmentFiles() {
  const files = Array.from(els.attachmentFileInput.files || []);
  els.attachmentFileInput.value = "";
  await addAttachmentFiles(files, "本地文件导入");
}

function handleAttachmentDrag(event) {
  event.preventDefault();
  event.stopPropagation();
  els.attachmentDropZone.classList.add("dragging");
}

function handleAttachmentDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!els.attachmentDropZone.contains(event.relatedTarget)) {
    els.attachmentDropZone.classList.remove("dragging");
  }
}

async function handleAttachmentDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  els.attachmentDropZone.classList.remove("dragging");
  await addAttachmentFiles(Array.from(event.dataTransfer?.files || []), "拖拽文件导入");
}

async function handleAttachmentPaste(event) {
  const files = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (!files.length) return;
  event.preventDefault();
  await addAttachmentFiles(files, "剪贴板截图导入");
}

async function addAttachmentFiles(files, originLabel) {
  if (!files.length) return;
  const accepted = [];
  const rejected = [];
  let totalBytes = state.pendingAttachments.reduce((sum, attachment) => sum + attachment.size, 0);
  for (const file of files) {
    if (state.pendingAttachments.length + accepted.length >= MAX_ATTACHMENT_COUNT) {
      rejected.push(`${file.name || "未命名文件"}（超过数量限制）`);
      continue;
    }
    if (!isAllowedAttachment(file)) {
      rejected.push(`${file.name || "未命名文件"}（格式不支持）`);
      continue;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      rejected.push(`${file.name || "未命名文件"}（超过 20 MB）`);
      continue;
    }
    if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      rejected.push(`${file.name || "未命名文件"}（本题附件总量超过 80 MB）`);
      continue;
    }
    let inspection = null;
    try {
      if (!/^text\/(plain|markdown)$/i.test(file.type || "") && !/\.(txt|md)$/i.test(file.name || "")) {
        inspection = await window.PhysicsStudioSecurity?.inspectFile?.(
          file,
          isImageAttachment(file) ? "image" : "attachment"
        );
      }
      await window.PhysicsStudioSecurity?.ensureStorageCapacity?.(file.size * 1.1);
    } catch (error) {
      rejected.push(`${file.name || "未命名文件"}（${error.message}）`);
      continue;
    }
    const attachment = {
      id: createId(),
      name: sanitizeAttachmentName(file.name || `${originLabel}-${Date.now()}.jpg`),
      type: inspection?.mime || file.type || "application/octet-stream",
      size: file.size,
      kind: isImageAttachment(file) ? "image" : "document",
      createdAt: new Date().toISOString(),
      blob: file
    };
    accepted.push(attachment);
    totalBytes += file.size;
  }

  if (accepted.length) {
    state.pendingAttachments.push(...accepted);
    await populateDraftFromAttachment(accepted[0], originLabel);
    renderAttachmentList();
    showToast(`已加入 ${accepted.length} 个扫描图片或文件。`);
  }
  if (rejected.length) {
    showToast(`有 ${rejected.length} 个文件未加入，请检查格式、数量或大小。`, true);
  }
}

async function populateDraftFromAttachment(attachment, originLabel) {
  const baseName = attachment.name.replace(/\.[^.]+$/, "").trim();
  if (!els.titleInput.value.trim()) els.titleInput.value = baseName.slice(0, 80) || "扫描导入的物理试题";
  if (!els.topicInput.value.trim()) els.topicInput.value = "待分类";
  if (!els.sourceInput.value.trim()) els.sourceInput.value = originLabel;
  if (!els.contentInput.value.trim()) {
    if (/^text\/(plain|markdown)$/i.test(attachment.type) && attachment.blob.size <= 1024 * 1024) {
      try {
        const text = (await attachment.blob.text()).trim();
        els.contentInput.value = text || "题目正文见上传附件。";
      } catch (error) {
        console.warn("无法读取文本附件内容。", error);
        els.contentInput.value = "题目正文见上传附件。";
      }
    } else {
      els.contentInput.value = attachment.kind === "image"
        ? "题目正文见扫描图片。"
        : "题目正文见上传附件。";
    }
  }
  if (!els.solutionInput.value.trim()) els.solutionInput.value = "待补充：请结合扫描图片或附件记录解题方法。";
  els.sourceLicenseInput.value = "用户自行上传（权利状态由用户确认）";
}

async function openPhotoScanner() {
  els.photoCameraStatus.classList.remove("error");
  els.photoCameraStatus.textContent = "正在准备摄像头…";
  els.photoScanModal.showModal();
  await startCamera("photo");
}

async function openQrScanner() {
  els.qrScannerStatus.classList.remove("error");
  els.qrScannerStatus.textContent = "正在准备摄像头，请将二维码放入取景框内。";
  els.qrScannerModal.showModal();
  await startCamera("qr");
}

async function startCamera(mode) {
  stopCamera();
  const status = mode === "qr" ? els.qrScannerStatus : els.photoCameraStatus;
  const video = mode === "qr" ? els.qrCameraVideo : els.photoCameraVideo;
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = mode === "qr"
      ? "当前环境不能直接调用摄像头，请选择二维码图片。"
      : "当前环境不能直接调用摄像头，请返回后从相册选择图片。";
    status.classList.add("error");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    const modal = mode === "qr" ? els.qrScannerModal : els.photoScanModal;
    if (!modal.open) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.cameraStream = stream;
    state.cameraMode = mode;
    video.srcObject = stream;
    await video.play();
    status.classList.remove("error");
    status.textContent = mode === "qr" ? "将二维码保持清晰、完整地放入方框。" : "对准试题后点击“拍摄并加入题目”。";
    if (mode === "qr") {
      state.qrScanLastAt = 0;
      state.qrScanFrame = requestAnimationFrame(scanQrCameraFrame);
    }
  } catch (error) {
    console.error("Camera access failed", error);
    status.textContent = error?.name === "NotAllowedError"
      ? "摄像头权限未获允许，请在系统设置中授权，或改用图片上传。"
      : "无法启动摄像头，请改用相册或二维码图片。";
    status.classList.add("error");
  }
}

function stopCamera() {
  if (state.qrScanFrame) cancelAnimationFrame(state.qrScanFrame);
  state.qrScanFrame = 0;
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
  }
  state.cameraStream = null;
  state.cameraMode = "";
  [els.photoCameraVideo, els.qrCameraVideo].forEach((video) => {
    if (video) video.srcObject = null;
  });
}

async function capturePhoto() {
  const video = els.photoCameraVideo;
  if (!video.videoWidth || !video.videoHeight) {
    els.photoCameraStatus.textContent = "摄像头画面尚未就绪，请稍后再拍。";
    els.photoCameraStatus.classList.add("error");
    return;
  }
  const scale = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = els.photoCameraCanvas;
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) {
    els.photoCameraStatus.textContent = "拍摄失败，请重试或改用相册上传。";
    els.photoCameraStatus.classList.add("error");
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = new File([blob], `试题扫描-${timestamp}.jpg`, { type: "image/jpeg" });
  await addAttachmentFiles([file], "拍照扫描导入");
  els.photoCameraStatus.classList.remove("error");
  els.photoCameraStatus.textContent = `已加入扫描图片（${formatBytes(file.size)}），可继续拍摄下一页。`;
}

function scanQrCameraFrame(timestamp) {
  if (state.cameraMode !== "qr" || !els.qrScannerModal.open) return;
  if (timestamp - state.qrScanLastAt >= 240) {
    state.qrScanLastAt = timestamp;
    const result = decodeQrVideoFrame();
    if (result) {
      applyQrPayload(result);
      return;
    }
  }
  state.qrScanFrame = requestAnimationFrame(scanQrCameraFrame);
}

function decodeQrVideoFrame() {
  const video = els.qrCameraVideo;
  if (!video.videoWidth || !video.videoHeight || typeof window.jsQR !== "function") return "";
  const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = els.qrCameraCanvas;
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return decodeQrCanvas(canvas);
}

function decodeQrCanvas(canvas) {
  if (typeof window.jsQR !== "function") return "";
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = window.jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth"
  });
  return result?.data ? String(result.data) : "";
}

async function decodeSelectedQrImage() {
  const file = els.qrImageInput.files[0];
  els.qrImageInput.value = "";
  if (!file) return;
  try {
    const image = await loadImageForCanvas(file);
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = els.qrCameraCanvas;
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
    if (typeof image.close === "function") image.close();
    const result = decodeQrCanvas(canvas);
    if (!result) {
      els.qrScannerStatus.textContent = "这张图片中没有识别到清晰的二维码，请重新选择。";
      els.qrScannerStatus.classList.add("error");
      return;
    }
    applyQrPayload(result);
  } catch (error) {
    console.error("QR image decode failed", error);
    els.qrScannerStatus.textContent = "二维码图片读取失败，请换一张清晰图片。";
    els.qrScannerStatus.classList.add("error");
  }
}

async function loadImageForCanvas(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function applyQrPayload(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    els.qrScannerStatus.textContent = "没有可导入的二维码内容。";
    els.qrScannerStatus.classList.add("error");
    return;
  }

  let draft = null;
  let multiCount = 0;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.format === "physics-studio-backup" && Array.isArray(parsed.questions)) {
      draft = parsed.questions[0] || null;
      multiCount = parsed.questions.length;
    } else if (parsed?.format === "physics-studio-question" && parsed.question) {
      draft = parsed.question;
    } else if (parsed?.question && typeof parsed.question === "object") {
      draft = parsed.question;
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      draft = parsed;
    }
  } catch (error) {
    draft = isValidHttpUrl(raw)
      ? {
          title: `二维码来源：${getUrlHost(raw)}`,
          topic: "待分类",
          source: "二维码网页链接",
          sourceUrl: raw,
          sourceLicense: "仅保存来源链接",
          content: "题目正文与答案请打开二维码来源网页查看。",
          solution: "待补充：请核对来源网页中的解析后记录解题方法。"
        }
      : parseQuestionText(raw);
  }

  if (!draft || typeof draft !== "object") {
    els.qrScannerStatus.textContent = "二维码内容不是可识别的试题、文字或网页链接。";
    els.qrScannerStatus.classList.add("error");
    return;
  }
  applyQuestionDraft(draft);
  stopCamera();
  if (els.qrScannerModal.open) els.qrScannerModal.close();
  showToast(multiCount > 1
    ? `二维码中有 ${multiCount} 道题，已载入第一道；多题请使用 JSON 导入。`
    : "二维码内容已载入试题表单。");
}

function parseQuestionText(raw) {
  const fieldNames = {
    "题目": "content",
    "题干": "content",
    "内容": "content",
    "答案": "answer",
    "解析": "solution",
    "解题方法": "solution",
    "方法": "solution",
    "知识点": "topic",
    "标题": "title",
    "来源": "source",
    "链接": "sourceUrl",
    "学段": "stage",
    "年级": "grade"
  };
  const draft = {};
  let activeField = "";
  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(题目|题干|内容|答案|解析|解题方法|方法|知识点|标题|来源|链接|学段|年级)\s*[:：]\s*(.*)$/);
    if (match) {
      activeField = fieldNames[match[1]];
      draft[activeField] = match[2].trim();
    } else if (activeField && line.trim()) {
      draft[activeField] = `${draft[activeField] || ""}\n${line.trim()}`.trim();
    }
  });
  if (!draft.content) draft.content = raw;
  if (!draft.title) draft.title = (draft.content.split(/\r?\n/)[0] || "二维码导入试题").slice(0, 80);
  if (!draft.topic) draft.topic = "待分类";
  if (!draft.solution) draft.solution = "待补充：请根据题目记录解题方法。";
  draft.source = draft.source || "二维码文字导入";
  draft.sourceLicense = draft.sourceLicense || "用户自行上传（权利状态由用户确认）";
  return draft;
}

function applyQuestionDraft(draft) {
  const stage = ["初中", "高中"].includes(draft.stage) ? draft.stage : els.stageInput.value;
  const grades = stage === "初中" ? ["八年级", "九年级"] : ["高一", "高二", "高三"];
  const grade = grades.includes(draft.grade) ? draft.grade : grades.includes(els.gradeInput.value)
    ? els.gradeInput.value
    : grades[0];
  els.stageInput.value = stage;
  updateGradeOptions(stage, grade);
  updateCurriculumBookOptions(grade, draft.curriculumBookId || "", draft.curriculumBook || "");
  if (draft.curriculumChapterId || draft.curriculumChapter) {
    updateCurriculumChapterOptions(
      els.bookInput.value,
      draft.curriculumChapterId || "",
      draft.curriculumChapter || ""
    );
  }
  if (draft.curriculumSectionId || draft.curriculumSection) {
    updateCurriculumSectionOptions(
      els.chapterInput.value,
      draft.curriculumSectionId || "",
      draft.curriculumSection || ""
    );
  }
  els.titleInput.value = String(draft.title || "二维码导入的物理试题").slice(0, 80);
  els.topicInput.value = String(draft.topic || "待分类").slice(0, 40);
  if (["基础", "进阶", "挑战"].includes(draft.difficulty)) els.difficultyInput.value = draft.difficulty;
  els.sourceInput.value = String(draft.source || "二维码导入").slice(0, 60);
  els.contentInput.value = String(draft.content || "题目内容见二维码来源。");
  els.solutionInput.value = String(draft.solution || "待补充：请记录解题方法。");
  els.answerInput.value = String(draft.answer || "");
  els.sourceUrlInput.value = isValidHttpUrl(draft.sourceUrl) ? draft.sourceUrl : "";
  const license = Array.from(els.sourceLicenseInput.options).some((option) => option.value === draft.sourceLicense)
    ? draft.sourceLicense
    : (els.sourceUrlInput.value ? "仅保存来源链接" : "用户自行上传（权利状态由用户确认）");
  els.sourceLicenseInput.value = license;
}

function getUrlHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch (error) {
    return "网页";
  }
}

async function saveQuestion(event) {
  event.preventDefault();
  if (!els.questionForm.reportValidity()) return;

  const existing = state.questions.find((question) => question.id === els.questionId.value);
  const chosenFile = els.videoFileInput.files[0];
  const url = els.videoUrlInput.value.trim();
  const sourceUrl = els.sourceUrlInput.value.trim();
  if (state.pendingAttachments.length > MAX_ATTACHMENT_COUNT) {
    showToast(`每道题最多保存 ${MAX_ATTACHMENT_COUNT} 个附件。`, true);
    return;
  }
  if (state.videoSource === "url" && url && !isValidHttpUrl(url)) {
    showToast("视频链接必须以 http:// 或 https:// 开头。", true);
    els.videoUrlInput.focus();
    return;
  }
  if (sourceUrl && !isValidHttpUrl(sourceUrl)) {
    showToast("来源网页必须以 http:// 或 https:// 开头。", true);
    els.sourceUrlInput.focus();
    return;
  }

  let videoType = "none";
  let videoBlob = null;
  let videoName = "";
  let videoUrl = "";
  if (state.videoSource === "file" && (chosenFile || state.retainedVideoBlob)) {
    videoType = "file";
    videoBlob = chosenFile || state.retainedVideoBlob;
    videoName = chosenFile?.name || state.retainedVideoName;
  } else if (state.videoSource === "url" && url) {
    videoType = "url";
    videoUrl = url;
  }

  const now = new Date().toISOString();
  const curriculum = getSelectedCurriculum();
  const curriculumPath = [curriculum.book?.title, curriculum.chapter?.title, curriculum.section?.title]
    .filter(Boolean)
    .join("·");
  const savedContent = els.contentInput.value.trim();
  const savedSolution = els.solutionInput.value.trim();
  const savedAnswer = els.answerInput.value.trim();
  const savedSourceLicense = els.sourceLicenseInput.value;
  const isRealExamRecord = existing?.collection === "changsha-six-year-real-exam-index";
  const hasVerifiedFullTextBasis = ["官方公开许可", "已取得书面授权"].includes(savedSourceLicense);
  const hasConcreteFullText = savedContent.length >= 30
    && savedSolution.length >= 30
    && savedAnswer.length >= 2
    && !/本应用未收录|查看原始来源后作答|本应用未猜填/.test(
      [savedContent, savedSolution, savedAnswer].join(" ")
    );
  const fullTextIncluded = isRealExamRecord
    ? hasVerifiedFullTextBasis && hasConcreteFullText
    : existing?.fullTextIncluded;
  const question = {
    ...(existing || {}),
    id: existing?.id || createId(),
    title: els.titleInput.value.trim(),
    stage: els.stageInput.value,
    grade: els.gradeInput.value,
    topic: els.topicInput.value.trim(),
    difficulty: els.difficultyInput.value,
    source: els.sourceInput.value.trim(),
    sourceUrl,
    sourceLicense: savedSourceLicense,
    textbookUnit: curriculumPath || existing?.textbookUnit || "",
    curriculumBook: curriculum.book?.title || existing?.curriculumBook || "",
    curriculumChapter: curriculum.chapter?.title || existing?.curriculumChapter || "",
    curriculumSection: curriculum.section?.title || existing?.curriculumSection || "",
    curriculumBookId: curriculum.book?.id || existing?.curriculumBookId || "",
    curriculumChapterId: curriculum.chapter?.id || existing?.curriculumChapterId || "",
    curriculumSectionId: curriculum.section?.id || existing?.curriculumSectionId || "",
    content: savedContent,
    solution: savedSolution,
    answer: savedAnswer,
    attachments: normalizeAttachments(state.pendingAttachments),
    videoType,
    videoUrl,
    videoBlob,
    videoName,
    mastered: existing?.mastered || false,
    wrong: Boolean(existing?.wrong),
    wrongAt: existing?.wrongAt || null,
    wrongCount: Number(existing?.wrongCount) || 0,
    transferNotes: existing?.transferNotes || {},
    fullTextIncluded,
    resourceRightsStatus: isRealExamRecord && fullTextIncluded
      ? `用户标注：${savedSourceLicense}；授权凭证由用户自行留存`
      : existing?.resourceRightsStatus,
    userEdited: existing
      ? Boolean(existing.userEdited || existing.collection || existing.syncOrigin)
      : false,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const audit = window.PHYSICS_LEARNING_ENGINE?.auditQuestion?.(question);
  if (audit) {
    question.contentAudit = audit;
    question.contentReviewStatus = audit.requiresTeacherReview
      ? "待教师审核"
      : "规则检查未发现风险";
    if (audit.requiresTeacherReview) {
      renderContentAuditPreview();
      const proceed = window.confirm(
        `自动检查发现 ${audit.errorCount} 项高风险、${audit.warningCount} 项需复核。\n\n`
        + "这些提示不能替代教师审核。是否仍将试题保存为“待教师审核”？"
      );
      if (!proceed) {
        els.contentAuditPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }

  try {
    await putQuestion(question);
    els.questionModal.close();
    await refreshQuestions();
    showToast(existing ? "试题已更新。" : "试题已加入题库。");
  } catch (error) {
    console.error(error);
    showToast("保存失败。视频或附件可能超过当前设备可用存储空间，请尝试较小文件。", true);
  }
}

function buildDetailedSolutionMarkup(question) {
  const lines = String(question.solution || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const steps = [];
  let finalConclusion = "";
  let verification = "";
  let currentHeading = "";
  lines.forEach((line) => {
    const heading = line.match(/^【([^】]+)】\s*(.*)$/);
    if (heading) {
      currentHeading = heading[1];
      const text = heading[2].trim();
      if (currentHeading === "最终结论") finalConclusion = text;
      else if (currentHeading === "结果复核") verification = text;
      else if (text && currentHeading !== "考察点") steps.push({ title: currentHeading, text });
      return;
    }
    if (currentHeading === "最终结论") {
      finalConclusion = [finalConclusion, line].filter(Boolean).join(" ");
      return;
    }
    if (currentHeading === "结果复核") {
      verification = [verification, line].filter(Boolean).join(" ");
      return;
    }
    const numbered = line.match(/^(?:第\s*)?(\d+)(?:\s*步)?[.、：:]\s*(.*)$/);
    steps.push({
      title: numbered ? `第 ${numbered[1]} 步` : `第 ${steps.length + 1} 步`,
      text: numbered ? numbered[2] : line
    });
  });
  if (!steps.length) {
    steps.push({
      title: "解析说明",
      text: "当前题目没有可拆分的解析步骤，请由教师复核内容完整性。"
    });
  }
  const conclusion = finalConclusion || question.answer || "题目尚未提供最终结论。";
  const checkText = verification
    || "把结论代回题意，核对研究对象、公式适用条件、单位、方向和数量级。";
  return `
    <div class="detail-solution-flow">
      ${steps.map((step, index) => `
        <article>
          <i>${index + 1}</i>
          <div><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.text)}</p></div>
        </article>`).join("")}
    </div>
    <div class="detail-conclusion-card"><span>解析结论</span><strong>${escapeHtml(conclusion)}</strong></div>
    <div class="detail-verification-card">
      <span>结果复核</span><p>${escapeHtml(checkText)}</p>
      <ul><li>所求物理量与题目设问一致</li><li>公式满足适用条件</li><li>单位、方向和正负号已核对</li><li>数值数量级符合题目情境</li></ul>
    </div>`;
}

function openDetail(question) {
  releaseActiveVideo();
  const mastery = getMasteryEvidence(question);
  const videoMarkup = buildVideoMarkup(question);
  const attachmentMarkup = buildAttachmentMarkup(question);
  const studentMode = document.body.classList.contains("role-student");
  const curriculumPath = [
    question.curriculumBook,
    question.curriculumChapter,
    question.curriculumSection
  ].filter(Boolean).join(" · ") || question.textbookUnit || "";
  els.detailContent.innerHTML = `
    <header class="detail-cover">
      <button class="icon-button close-detail" data-detail-action="close" type="button" aria-label="关闭">×</button>
      <div class="detail-tags">
        <span class="tag">${escapeHtml(question.stage)} · ${escapeHtml(question.grade || "未设年级")}</span>
        <span class="tag">${escapeHtml(question.difficulty)}</span>
        <span class="tag">${escapeHtml(question.topic)}</span>
        ${question.curriculumChapter ? `<span class="tag">${escapeHtml(question.curriculumChapter)}</span>` : ""}
        ${question.originalMock ? '<span class="tag">模拟卷原创</span>' : question.originalExercise ? '<span class="tag">长沙同步原创</span>' : ""}
        ${question.collection === "changsha-six-year-real-exam-index" ? `<span class="tag tag-real-exam">${escapeHtml(String(question.examYear))} ${escapeHtml(question.examLevel)} · 第${escapeHtml(String(question.examQuestionNumber))}题</span>` : ""}
        ${question.collection === "changsha-six-year-real-exam-index" && question.fullTextIncluded === false ? '<span class="tag">原卷入口 · 正文待许可</span>' : ""}
        ${question.wrong ? '<span class="tag tag-wrong">错题集中</span>' : ""}
      </div>
      <h2>${escapeHtml(question.title)}</h2>
      <span class="detail-source">来源：${escapeHtml(question.source || "个人题库")}${question.syncedAt ? ` · 收录于 ${escapeHtml(formatDateTime(question.syncedAt))}` : ""}</span>
    </header>
    <div class="detail-body">
      ${Array.isArray(question.examPoints) && question.examPoints.length ? `
        <section class="detail-section exam-points-section">
          <h3>考察点</h3>
          <div class="exam-point-list">${question.examPoints.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>
          ${question.examScopeNote ? `<p class="exam-scope-note">${escapeHtml(question.examScopeNote)}</p>` : ""}
      </section>` : ""}
      <section class="detail-section">
        <h3>题目</h3>
        <div class="detail-text">${escapeHtml(question.content)}</div>
      </section>
      <section class="detail-section">
        <h3>分步解析</h3>
        ${buildDetailedSolutionMarkup(question)}
      </section>
      ${question.answer ? `<section class="detail-section"><h3>参考答案</h3><div class="detail-text answer-box"><strong>${escapeHtml(question.answer)}</strong><small>答案应与上述推理过程、单位和方向一并核对；只抄最终结论不计为独立掌握。</small></div></section>` : ""}
      ${attachmentMarkup}
      ${curriculumPath || question.sourceLicense || question.originalExercise ? `
        <section class="detail-section">
          <h3>${question.collection === "changsha-six-year-real-exam-index" ? "真题定位与来源" : "教材知识定位"}</h3>
          <div class="detail-text">
            ${curriculumPath ? `<strong>${escapeHtml(curriculumPath)}</strong><br>` : ""}
            ${question.curriculumBasis ? `${escapeHtml(question.curriculumBasis)}<br>` : ""}
            ${question.sourceLicense ? `正文收录依据：${escapeHtml(question.sourceLicense)}<br>` : ""}
            ${question.resourceRightsStatus ? `来源授权状态：${escapeHtml(question.resourceRightsStatus)}<br>` : ""}
            ${question.originalExercise ? escapeHtml(question.copyrightNote || "原创同步练习，非教材原题。") : ""}
          </div>
        </section>` : ""}
      ${videoMarkup}
      ${buildTransferMarkup(question)}
      ${question.sourceUrl && isValidHttpUrl(question.sourceUrl) ? `<section class="detail-section"><h3>来源链接</h3><div class="detail-text source-links"><a href="${escapeHtml(question.sourceUrl)}" target="_blank" rel="noopener noreferrer">${question.originalExercise ? "查看长沙教材使用依据 ↗" : "查看原始来源 ↗"}</a>${question.answerUrl && question.answerUrl !== question.sourceUrl && isValidHttpUrl(question.answerUrl) ? `<a href="${escapeHtml(question.answerUrl)}" target="_blank" rel="noopener noreferrer">查看参考答案来源 ↗</a>` : ""}</div></section>` : ""}
      <div class="detail-actions">
        ${studentMode ? "" : `<button class="ghost-button" data-detail-action="edit" data-id="${escapeHtml(question.id)}" type="button">编辑题目</button>`}
        <button class="coach-button" data-detail-action="learn" data-id="${escapeHtml(question.id)}" type="button">进入分步训练</button>
        <button class="wrong-detail-button ${question.wrong ? "active" : ""}" data-detail-action="wrong" data-id="${escapeHtml(question.id)}" type="button">${question.wrong ? "移出错题集" : "加入错题集"}</button>
        <span class="mastery-evidence-badge evidence-${escapeHtml(mastery.code)}" title="${escapeHtml(mastery.reasons.join("；"))}">掌握证据：${escapeHtml(window.PHYSICS_LEARNING_ENGINE?.masteryDisplayLabel?.(mastery) || mastery.status)}</span>
      </div>
    </div>`;
  els.detailModal.showModal();
}

function buildVideoMarkup(question) {
  if (!hasVideo(question)) return "";
  let src = "";
  if (question.videoType === "file" && question.videoBlob instanceof Blob) {
    src = URL.createObjectURL(question.videoBlob);
    state.activeObjectUrls.push(src);
  } else if (question.videoType === "url" && isValidHttpUrl(question.videoUrl)) {
    src = question.videoUrl;
  }
  if (!src) {
    return '<section class="detail-section"><h3>方法视频</h3><div class="video-error">视频信息无法读取，请由教师重新关联视频文件或地址。</div></section>';
  }
  return `<section class="detail-section"><h3>方法视频</h3><video class="detail-video" controls preload="metadata" src="${escapeHtml(src)}">当前浏览器无法播放此视频。</video></section>`;
}

function buildAttachmentMarkup(question) {
  const attachments = normalizeAttachments(question.attachments);
  if (!attachments.length) return "";
  const cards = attachments.map((attachment, index) => {
    let preview = `<span class="detail-attachment-file">${escapeHtml(getAttachmentExtension(attachment.name))}</span>`;
    if (attachment.kind === "image") {
      const url = URL.createObjectURL(attachment.blob);
      state.activeObjectUrls.push(url);
      preview = `<img class="detail-attachment-image" src="${escapeHtml(url)}" alt="${escapeHtml(attachment.name)}" loading="lazy">`;
    }
    return `
      <button class="detail-attachment-card" data-detail-action="attachment" data-id="${escapeHtml(question.id)}" data-attachment-index="${index}" type="button">
        ${preview}
        <span class="detail-attachment-copy">
          <strong title="${escapeHtml(attachment.name)}">${escapeHtml(attachment.name)}</strong>
          <small>${formatBytes(attachment.size)} · 点击另存文件</small>
        </span>
      </button>`;
  }).join("");
  return `<section class="detail-section"><h3>题目附件</h3><div class="detail-attachments">${cards}</div></section>`;
}

async function downloadAttachment(question, index) {
  const attachment = normalizeAttachments(question.attachments)[index];
  if (!attachment) {
    showToast("附件不存在或已损坏。", true);
    return;
  }
  if (window.PhysicsStudioAndroid && typeof window.PhysicsStudioAndroid.saveBase64File === "function") {
    try {
      const dataUrl = await readBlobAsDataUrl(attachment.blob);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      window.PhysicsStudioAndroid.saveBase64File(attachment.name, attachment.type, base64);
      showToast("请选择附件的保存位置。");
      return;
    } catch (error) {
      console.error("Android attachment export failed", error);
      showToast("附件保存失败，请稍后重试。", true);
      return;
    }
  }
  const url = URL.createObjectURL(attachment.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = attachment.name;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("附件已开始保存。");
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(blob);
  });
}

function buildTransferMarkup(question) {
  const notes = question.transferNotes || {};
  const variantSet = getTransferVariantSet(question);
  const variants = getTransferVariants(question);
  return `
    <section class="detail-section transfer-detail-section">
      <h3>TRANSFER</h3>
      <div>
        <div class="transfer-intro"><strong>专项变式训练</strong><span>完整试题 · 独立作答 · 分步解析 · 正确性门禁</span></div>
        ${variants.length >= 2 ? `
          <div class="transfer-variant-grid">
            ${variants.map((variant, index) => `
              <button class="transfer-variant-card" data-detail-action="transfer" data-id="${escapeHtml(question.id)}" type="button">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(variant.variantRoleLabel || variant.variantRole)}</strong>
                <small>${escapeHtml(variant.changeSummary || variant.title)}</small>
                <em>${escapeHtml(variantSet?.status === "approved" ? "开始独立作答 →" : "查看审核状态 →")}</em>
              </button>`).join("")}
          </div>` : `
          <div class="transfer-empty-state">
            <p>系统会先匹配已审核题模并独立校验；找不到合格题时不会用文字任务冒充变式题。</p>
            <button class="primary-button" data-detail-action="transfer" data-id="${escapeHtml(question.id)}" type="button">生成专项变式</button>
          </div>`}
        ${Object.keys(notes).length ? `
          <details class="legacy-transfer-notes">
            <summary>旧版手工迁移记录（${Object.keys(notes).length}）</summary>
            ${Object.entries(notes).map(([key, note]) => `<article><strong>${escapeHtml(key)}</strong><p>${escapeHtml(note?.text || "")}</p></article>`).join("")}
            <small>旧记录继续保留；未经教师通过或有效核验时不计入正式掌握证据。</small>
          </details>` : ""}
      </div>
    </section>`;
}

function getTransferVariantSet(question) {
  const engine = window.PHYSICS_LEARNING_ENGINE;
  const generator = window.PhysicsStudioVariantGenerator;
  if (!engine || !generator || !question) return null;
  const learningState = engine.loadState();
  const contentHash = generator.sourceContentHash(question);
  return engine.variantSetForParent(learningState, question.id, contentHash);
}

function getTransferVariants(question) {
  return getTransferVariantSet(question)?.variants || [];
}

async function openTransferPractice(question) {
  const engine = window.PHYSICS_LEARNING_ENGINE;
  const generator = window.PhysicsStudioVariantGenerator;
  if (!engine || !generator) {
    showToast("专项变式模块未完整加载，请重新启动应用。", true);
    return;
  }
  let learningState = engine.loadState();
  let set = engine.variantSetForParent(learningState, question.id, generator.sourceContentHash(question));
  if (!set || set.variants.length < 2) {
    showToast("正在匹配并校验完整变式题…");
    const profile = engine.activeProfile(learningState);
    set = await generator.generateVariantSet(question, {
      questions: state.questions,
      existingSets: learningState.variantSets,
      count: 3,
      allowAi: document.body.classList.contains("role-teacher"),
      minorUnder14: profile?.minorAgeBand === "under14",
      minorAgeBand: profile?.minorAgeBand || "unknown",
      guardianConsentStatus: profile?.guardianConsentStatus,
      personalIdentifiers: [profile?.name, profile?.studentNumber].filter(Boolean)
    });
    if (!set.variants?.length) {
      showToast(set.message || "当前没有可验证的完整变式题", true);
      return;
    }
    engine.saveVariantSet(learningState, set);
    engine.saveState(learningState);
    await engine.awaitLastSave?.();
  }
  if (els.detailModal.open) els.detailModal.close();
  document.dispatchEvent(new CustomEvent("physics-studio-start-learning", {
    detail: { questionId: question.id, tab: "transfer", variantSetId: set.id, generateVariants: false }
  }));
}

function handleTransferClick(event) {
  const target = event.target.closest("[data-transfer-action]");
  if (!target) return;
  const action = target.dataset.transferAction;
  if (action === "close") {
    els.transferModal.close();
  } else if (action === "original") {
    const question = state.questions.find((item) => item.id === state.activeTransfer?.questionId);
    els.transferModal.close();
    if (question) openDetail(question);
  } else if (action === "save") {
    saveTransferPractice();
  }
}

async function saveTransferPractice() {
  const active = state.activeTransfer;
  const noteInput = document.getElementById("transferNoteInput");
  const note = noteInput?.value.trim() || "";
  if (!active || !note) {
    showToast("请先填写推理过程或答案。", true);
    noteInput?.focus();
    return;
  }

  const question = state.questions.find((item) => item.id === active.questionId);
  if (!question) return;
  const updated = {
    ...question,
    transferNotes: {
      ...(question.transferNotes || {}),
      [active.variantKey]: { text: note, updatedAt: new Date().toISOString() }
    },
    updatedAt: new Date().toISOString()
  };
  try {
    await putQuestion(updated);
    els.transferModal.close();
    await refreshQuestions();
    showToast("举一反三练习记录已保存。");
  } catch (error) {
    console.error(error);
    showToast("练习记录保存失败，请稍后重试。", true);
  }
}

function handleDetailClick(event) {
  const target = event.target.closest("[data-detail-action]");
  if (!target) return;
  const action = target.dataset.detailAction;
  if (action === "close") {
    els.detailModal.close();
    return;
  }
  const question = state.questions.find((item) => item.id === target.dataset.id);
  if (!question) return;
  if (action === "edit") {
    if (document.body.classList.contains("role-student") || document.body.classList.contains("role-parent")) {
      showToast("学生和家长模式不能编辑题库内容。", true);
      return;
    }
    els.detailModal.close();
    openForm(question);
  } else if (action === "learn") {
    els.detailModal.close();
    document.dispatchEvent(new CustomEvent("physics-studio-start-learning", {
      detail: { questionId: question.id }
    }));
  } else if (action === "wrong") {
    toggleWrong(question, true);
  } else if (action === "transfer") {
    openTransferPractice(question, target.dataset.variant);
  } else if (action === "attachment") {
    downloadAttachment(question, Number(target.dataset.attachmentIndex));
  }
}

function releaseActiveVideo() {
  state.activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.activeObjectUrls = [];
}

function releaseCardVideos() {
  state.cardObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.cardObjectUrls = [];
}

async function toggleMastered(question, reopenDetail = false) {
  const willMaster = !question.mastered;
  const updated = {
    ...question,
    mastered: willMaster,
    wrong: willMaster ? false : Boolean(question.wrong),
    wrongAt: willMaster ? null : question.wrongAt || null,
    updatedAt: new Date().toISOString()
  };
  try {
    await putQuestion(updated);
    await refreshQuestions();
    showToast(updated.mastered
      ? (question.wrong ? "已标记为掌握，并移出错题集。" : "已标记为掌握。")
      : "已取消掌握标记。");
    if (reopenDetail) openDetail(updated);
  } catch (error) {
    console.error(error);
    showToast("状态更新失败，请稍后重试。", true);
  }
}

async function toggleWrong(question, reopenDetail = false) {
  const willMarkWrong = !Boolean(question.wrong);
  const now = new Date().toISOString();
  const updated = {
    ...question,
    wrong: willMarkWrong,
    wrongAt: willMarkWrong ? now : null,
    wrongCount: willMarkWrong ? (Number(question.wrongCount) || 0) + 1 : Number(question.wrongCount) || 0,
    mastered: willMarkWrong ? false : question.mastered,
    updatedAt: now
  };
  try {
    await putQuestion(updated);
    await refreshQuestions();
    showToast(willMarkWrong ? "已加入错题集。" : "已移出错题集。");
    if (reopenDetail) openDetail(updated);
  } catch (error) {
    console.error(error);
    showToast("错题状态更新失败，请稍后重试。", true);
  }
}

function requestDelete(id) {
  state.pendingDeleteId = id;
  els.confirmDialog.showModal();
}

async function confirmDelete() {
  if (!state.pendingDeleteId) return;
  try {
    await deleteQuestion(state.pendingDeleteId);
    state.pendingDeleteId = null;
    els.confirmDialog.close();
    await refreshQuestions();
    showToast("试题已删除。");
  } catch (error) {
    console.error(error);
    showToast("删除失败，请稍后重试。", true);
  }
}

async function exportCompleteBackup() {
  if (!window.PhysicsStudioBackup || !window.PHYSICS_LEARNING_ENGINE) {
    showToast("完整备份模块未加载。", true);
    return;
  }
  const password = els.fullBackupPassword.value;
  if (password.length < 12) {
    showToast("请先填写至少 12 个字符的完整备份密码；密码丢失后无法恢复加密备份。", true);
    return;
  }
  els.fullBackupButton.disabled = true;
  showToast("正在校验并生成完整备份，请保持应用打开。");
  try {
    await window.PhysicsStudioSecurity?.requestPersistentStorage?.();
    const result = await window.PhysicsStudioBackup.create(
      window.PhysicsStudioApp,
      window.PHYSICS_LEARNING_ENGINE,
      { password, maxOutputBytes: window.PhysicsStudioAndroid
        ? window.PhysicsStudioSecurity?.limits?.androidExportBytes || 100 * 1024 * 1024
        : undefined }
    );
    await downloadBlob(`费曼物理完整备份-${formatDateForFile(new Date())}.pslab`, result.blob);
    showToast(`完整备份已生成：${result.manifest.questionCount} 道题、${result.manifest.profileCount} 份档案。`);
  } catch (error) {
    console.error(error);
    showToast(`完整备份失败：${error.message}`, true);
  } finally {
    els.fullBackupPassword.value = "";
    els.fullBackupButton.disabled = false;
  }
}

async function importCompleteBackup() {
  const file = els.fullRestoreInput.files?.[0];
  els.fullRestoreInput.value = "";
  if (!file) return;
  const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const encrypted = window.PhysicsStudioBackup.isEncrypted(prefix);
  if (!encrypted && !window.confirm("这是旧版未加密 .pslab，学习档案以明文保存在 ZIP 内。仅在确认来源可信时导入。是否继续？")) return;
  const password = encrypted ? els.fullBackupPassword.value : "";
  if (encrypted && !password) {
    showToast("请先在完整备份密码框输入恢复密码，再选择文件。", true);
    return;
  }
  const confirmed = window.confirm("恢复完整备份会替换当前题库、附件、视频和学习档案。是否继续？");
  if (!confirmed) return;
  try {
    showToast("正在校验完整备份；校验完成前不会改写现有数据。");
    const outcome = await window.PhysicsStudioBackup.restore(
      file,
      window.PhysicsStudioApp,
      window.PHYSICS_LEARNING_ENGINE,
      { password, allowLegacyUnencrypted: !encrypted }
    );
    document.dispatchEvent(new CustomEvent("physics-learning-state-changed", {
      detail: { restored: true }
    }));
    showToast(`完整备份恢复成功：${outcome.restored} 道题。`);
  } catch (error) {
    console.error(error);
    showToast(`完整备份未恢复：${error.message}`, true);
  } finally {
    els.fullBackupPassword.value = "";
  }
}

async function downloadBlob(filename, blob) {
  if (window.PhysicsStudioAndroid) {
    if (typeof window.PhysicsStudioAndroid.saveBase64FileWithAck !== "function") {
      throw new Error("当前安卓版本无法确认文件是否写入成功；请更新应用后再导出完整备份。");
    }
    if (blob.size > (window.PhysicsStudioSecurity?.limits?.androidExportBytes || 100 * 1024 * 1024)) {
      throw new Error("安卓端单次完整备份不能超过 100 MB；请先移除或分批保存大型本地视频。");
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("备份文件读取失败。"));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(",")[1] || "";
    const requestId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    await new Promise((resolve, reject) => {
      const previous = window.PhysicsStudioAndroidExportResponse;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.PhysicsStudioAndroidExportResponse = previous;
        if (error) reject(error); else resolve();
      };
      const timer = window.setTimeout(() => finish(new Error("未收到安卓文件保存确认；请检查目标位置，不要把本次导出视为成功。")), 60_000);
      window.PhysicsStudioAndroidExportResponse = (response) => {
        if (response?.requestId !== requestId) {
          if (typeof previous === "function") previous(response);
          return;
        }
        if (response.status === "saved") finish();
        else if (response.status === "canceled") finish(new Error("已取消文件保存；备份未导出。"));
        else finish(new Error(`安卓文件保存失败（${String(response?.errorCode || "unknown")}）；备份未导出。`));
      };
      try {
        window.PhysicsStudioAndroid.saveBase64FileWithAck(
          requestId, filename, blob.type || "application/vnd.physics-studio.backup+zip", base64
        );
      } catch (error) {
        finish(error);
      }
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportQuestions() {
  const exportable = state.questions.map(({ videoBlob, attachments = [], ...question }) => {
    const exportNotes = [];
    const attachmentManifest = normalizeAttachments(attachments).map(({ blob, ...attachment }) => attachment);
    let exported = {
      ...question,
      attachments: [],
      attachmentManifest
    };
    if (question.videoType === "file") {
      exported = { ...exported, videoType: "none", videoName: "" };
      exportNotes.push("本地视频未包含在备份中");
    }
    if (attachmentManifest.length > 0) exportNotes.push("本地扫描图片和附件未包含在备份中");
    return exportNotes.length ? { ...exported, exportNote: exportNotes.join("；") } : exported;
  });
  const payload = {
    format: "physics-studio-backup",
    version: 4,
    exportedAt: new Date().toISOString(),
    questions: exportable
  };
  const validation = window.PhysicsStudioBackupValidator?.validate?.(payload);
  if (validation && !validation.valid) {
    console.error("轻量备份结构校验失败", validation.errors);
    showToast(`轻量备份未导出：${validation.errors[0]?.path || "/"} ${validation.errors[0]?.message || "字段无效"}`, true);
    return;
  }
  const serialized = JSON.stringify(payload, null, 2);
  const filename = `物理题库备份-${formatDateForFile(new Date())}.json`;
  if (window.PhysicsStudioAndroid && typeof window.PhysicsStudioAndroid.saveTextFile === "function") {
    try {
      window.PhysicsStudioAndroid.saveTextFile(filename, serialized, "application/json");
      showToast("请选择题库备份的保存位置；本地视频和扫描附件不包含在备份中。");
      return;
    } catch (error) {
      console.error("Android export bridge failed", error);
    }
  }
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("题库备份已导出；本地视频和扫描附件不包含在备份中。");
}

async function importQuestions() {
  const file = els.importInput.files[0];
  els.importInput.value = "";
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("Backup exceeds 20 MB");
    const parsed = JSON.parse(await file.text());
    if (parsed.format !== "physics-studio-backup" || ![1, 2, 3, 4].includes(Number(parsed.version)) || !Array.isArray(parsed.questions)) {
      throw new Error("Invalid backup format");
    }
    if (Number(parsed.version) === 4) {
      const validation = window.PhysicsStudioBackupValidator?.validate?.(parsed);
      if (!validation?.valid) throw new Error(`Schema validation failed at ${validation?.errors?.[0]?.path || "/"}`);
    }
    if (parsed.questions.length > 5000) throw new Error("Too many questions");
    const valid = parsed.questions.filter((question) => {
      return isValidImportedQuestion(question)
        && question.id.length <= 160
        && question.title.length <= 200
        && question.content.length <= 60000
        && question.solution.length <= 60000;
    });
    if (valid.length !== parsed.questions.length) throw new Error("Invalid question fields");
    if (new Set(valid.map((question) => question.id)).size !== valid.length) {
      throw new Error("Duplicate question ids");
    }
    if (valid.length === 0) throw new Error("No valid questions");
    const now = new Date().toISOString();
    await Promise.all(valid.map((question) => {
      const curriculum = resolveImportedCurriculum(question);
      return putQuestion({
        ...question,
        ...curriculum,
        id: state.questions.some((item) => item.id === question.id) ? createId() : question.id,
        sourceUrl: isValidHttpUrl(question.sourceUrl) ? question.sourceUrl : "",
        sourceLicense: question.sourceLicense || "授权状态未填写",
        attachments: [],
        videoBlob: null,
        videoType: question.videoType === "url" && isValidHttpUrl(question.videoUrl) ? "url" : "none",
        wrong: Boolean(question.wrong),
        wrongAt: question.wrong ? question.wrongAt || now : null,
        wrongCount: Number(question.wrongCount) || 0,
        mastered: Boolean(question.mastered) && !Boolean(question.wrong),
        transferNotes: question.transferNotes && typeof question.transferNotes === "object"
          && !Array.isArray(question.transferNotes) ? question.transferNotes : {},
        updatedAt: now
      });
    }));
    await refreshQuestions();
    showToast(`成功导入 ${valid.length} 道题。`);
  } catch (error) {
    console.error(error);
    showToast("导入失败：请选择由本应用导出的有效备份文件。", true);
  }
}

function initResourceCenter() {
  const currentYear = new Date().getFullYear();
  const availableResourceCount = getResourceCatalog().length;
  els.syncModal.innerHTML = `
    <section>
      <div class="modal-header">
        <div>
          <span class="modal-index">SOURCE & RIGHTS INDEX</span>
          <h2>长沙互联网物理题源</h2>
        </div>
        <button class="icon-button close-resource-modal" type="button" aria-label="关闭">×</button>
      </div>
      <div class="sync-hero">
        <div class="sync-hero-mark" aria-hidden="true">湘</div>
        <div>
          <strong>教材、考试与平台题源索引已就绪</strong>
          <p>按长沙、学段和年份检索，并明确区分官方信息、公开页面和需要授权的平台题源。</p>
        </div>
        <span class="sync-state-pill ready">${availableResourceCount} 个入口</span>
      </div>
      <div class="modal-body sync-modal-body resource-modal-body">
        <div class="source-notice">
          <strong>收录规则</strong>
          <p>应用不会绕过登录、付费或下载限制。未取得正文转载许可时只保存题源链接；取得书面授权、平台许可或明确开放许可后，可按下方模板批量导入题目并映射到教材知识点。</p>
          <button class="text-link-button" id="downloadImportTemplateButton" type="button">下载授权题库导入模板 →</button>
        </div>
        <form class="resource-search" id="resourceSearchForm">
          <div class="resource-search-fields">
            <label class="field">
              <span>年份</span>
              <select id="resourceYearInput">
                <option value="all">不限年份</option>
                <option value="${currentYear}">${currentYear} 年</option>
                <option value="${currentYear - 1}">${currentYear - 1} 年</option>
                <option value="${currentYear - 2}">${currentYear - 2} 年</option>
              </select>
            </label>
            <label class="field">
              <span>学段</span>
              <select id="resourceStageInput">
                <option value="all">初中和高中</option>
                <option value="初中">初中物理</option>
                <option value="高中">高中物理</option>
              </select>
            </label>
            <label class="field resource-keyword-field">
              <span>知识点或学校</span>
              <input id="resourceKeywordInput" maxlength="40" placeholder="例如：力学、长沙市一中" />
            </label>
            <button class="primary-button resource-web-search" id="searchWebButton" type="submit"><span aria-hidden="true">⌕</span> 搜索互联网最新资料</button>
          </div>
        </form>
        <div class="resource-section-heading">
          <div><span class="heading-index">01</span><h3>已核验的题源与教材入口</h3></div>
          <span id="resourceResultCount"></span>
        </div>
        <div class="resource-grid" id="resourceGrid"></div>
        <div class="resource-empty hidden" id="resourceEmpty">当前筛选条件下没有预置入口，可使用上方互联网搜索。</div>
        <div class="source-links resource-source-links">
          <span>官方核验</span>
          <a href="https://basic.smartedu.cn/" target="_blank" rel="noopener noreferrer">国家中小学智慧教育平台 ↗</a>
          <a href="https://www.pep.com.cn/" target="_blank" rel="noopener noreferrer">人民教育出版社 ↗</a>
          <a href="https://jyj.changsha.gov.cn/" target="_blank" rel="noopener noreferrer">长沙市教育局 ↗</a>
          <span class="resource-verified">入口核验日期：${RESOURCE_VERIFIED_DATE}</span>
        </div>
      </div>
      <div class="modal-footer sync-footer">
        <span>题源并非互联网全集；网站内容、授权与访问条件以实时页面和书面合同为准</span>
        <div><button class="ghost-button close-resource-modal" type="button">关闭</button></div>
      </div>
    </section>`;

  els.resourceSearchForm = document.getElementById("resourceSearchForm");
  els.resourceYearInput = document.getElementById("resourceYearInput");
  els.resourceStageInput = document.getElementById("resourceStageInput");
  els.resourceKeywordInput = document.getElementById("resourceKeywordInput");
  els.resourceGrid = document.getElementById("resourceGrid");
  els.resourceEmpty = document.getElementById("resourceEmpty");
  els.resourceResultCount = document.getElementById("resourceResultCount");
  els.downloadImportTemplateButton = document.getElementById("downloadImportTemplateButton");

  document.querySelectorAll(".close-resource-modal").forEach((button) => {
    button.addEventListener("click", () => els.syncModal.close());
  });
  [els.resourceYearInput, els.resourceStageInput, els.resourceKeywordInput].forEach((input) => {
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", renderFreeResources);
  });
  els.resourceSearchForm.addEventListener("submit", searchFreeResourcesOnline);
  els.downloadImportTemplateButton.addEventListener("click", downloadAuthorizedImportTemplate);
  els.syncDot.classList.add("ready");
  els.quickSyncStatus.textContent = `${availableResourceCount} 个题源入口`;
  renderFreeResources();
}

function openResourceCenter() {
  closeDrawer();
  renderFreeResources();
  els.syncModal.showModal();
}

function renderFreeResources() {
  const year = els.resourceYearInput?.value || "all";
  const stage = els.resourceStageInput?.value || "all";
  const keyword = (els.resourceKeywordInput?.value || "").trim().toLocaleLowerCase("zh-CN");
  const filtered = getResourceCatalog().filter((resource) => {
    const matchesYear = year === "all" || resource.year === 0 || resource.year === Number(year);
    const matchesStage = stage === "all" || resource.stage === "全部" || resource.stage === stage;
    const searchable = [
      resource.title,
      resource.provider,
      resource.description,
      resource.stage,
      resource.year,
      resource.rightsStatus,
      ...(resource.tags || [])
    ]
      .join(" ").toLocaleLowerCase("zh-CN");
    return matchesYear && matchesStage && (!keyword || searchable.includes(keyword));
  });

  els.resourceResultCount.textContent = `${filtered.length} 个入口`;
  els.resourceGrid.classList.toggle("hidden", filtered.length === 0);
  els.resourceEmpty.classList.toggle("hidden", filtered.length !== 0);
  els.resourceGrid.innerHTML = filtered.map((resource) => `
    <article class="resource-card">
      <div class="resource-card-top">
        <span class="resource-access ${resource.access.startsWith("官方") ? "official" : ""}">${escapeHtml(resource.access)}</span>
        <span>${resource.year || "持续更新"}</span>
      </div>
      <h4>${escapeHtml(resource.title)}</h4>
      <p>${escapeHtml(resource.description)}</p>
      <p class="resource-rights">授权状态：${escapeHtml(resource.rightsStatus || "打开页面后核验")}</p>
      <div class="resource-card-footer">
        <span>${escapeHtml(resource.provider)}${resource.local ? " · 长沙" : ""}</span>
        <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">打开资源 ↗</a>
      </div>
    </article>`).join("");
}

function searchFreeResourcesOnline(event) {
  event.preventDefault();
  const year = els.resourceYearInput.value === "all" ? "最新" : els.resourceYearInput.value;
  const stage = els.resourceStageInput.value === "all" ? "初中 高中" : els.resourceStageInput.value;
  const keyword = els.resourceKeywordInput.value.trim();
  const query = [year, "长沙", stage, "物理", "试卷", "题库", "含答案", keyword]
    .filter(Boolean)
    .join(" ");
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  openExternalPage(searchUrl, "已在 Edge/Bing 中打开互联网检索。");
}

function downloadAuthorizedImportTemplate() {
  const payload = {
    format: "physics-studio-backup",
    version: 3,
    template: "licensed-question-import",
    generatedAt: new Date().toISOString(),
    instructions: [
      "只把已取得正文转载许可、明确开放许可或自有版权的题目放入 questions 数组。",
      "每道题必须填写唯一 id、title、stage、grade、topic、difficulty、content 和 solution。",
      "curriculumBookId、curriculumChapterId、curriculumSectionId 可从应用的教材知识目录获得；不确定时可先留空。",
      "sourceLicense 应填写许可依据，例如“已取得书面授权”；sourceUrl 填写可追溯的来源网页。",
      "导入前请保留许可合同、发票、授权邮件或平台许可条款作为内部存档。"
    ],
    fieldGuide: {
      stage: "初中或高中",
      grade: "八年级、九年级、高一、高二或高三",
      difficulty: "基础、进阶或挑战",
      sourceLicense: "个人原创、官方公开许可、已取得书面授权或仅保存来源链接",
      videoType: "none 或 url；本地视频不能通过 JSON 批量导入"
    },
    exampleQuestion: {
      id: "authorized-source-unique-id-001",
      title: "请替换为已获授权的题目名称",
      stage: "初中",
      grade: "八年级",
      topic: "机械运动",
      difficulty: "基础",
      source: "请填写试卷、学校或出版社",
      sourceUrl: "https://example.com/source",
      sourceLicense: "已取得书面授权",
      curriculumBookId: "pep-g8-1",
      curriculumChapterId: "pep-g8-1-c01",
      curriculumSectionId: "pep-g8-1-c01-s03",
      curriculumBook: "八年级上册",
      curriculumChapter: "机械运动",
      curriculumSection: "运动的快慢",
      content: "请替换为已获授权的题目正文",
      solution: "请替换为已获授权或自行编写的解析",
      answer: "请填写答案",
      videoType: "none",
      videoUrl: "",
      mastered: false,
      wrong: false,
      transferNotes: {}
    },
    questions: []
  };
  const serialized = JSON.stringify(payload, null, 2);
  const filename = "费曼物理-授权题库导入模板.json";
  if (window.PhysicsStudioAndroid && typeof window.PhysicsStudioAndroid.saveTextFile === "function") {
    window.PhysicsStudioAndroid.saveTextFile(filename, serialized, "application/json");
    showToast("请选择授权题库导入模板的保存位置。");
    return;
  }
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("授权题库导入模板已下载。");
}

function isValidImportedQuestion(question) {
  return question && typeof question.id === "string" && typeof question.title === "string"
    && typeof question.content === "string" && typeof question.solution === "string"
    && ["初中", "高中"].includes(question.stage)
    // 七年级仅作为 v2.8 legacy data 接受导入/恢复，不进入 v2.9 当前学习统计。
    && ["七年级", "八年级", "九年级", "高一", "高二", "高三"].includes(question.grade)
    && (question.stage === "初中") === ["七年级", "八年级", "九年级"].includes(question.grade)
    && ["基础", "进阶", "挑战"].includes(question.difficulty);
}

function resolveImportedCurriculum(question) {
  const books = getCurriculumBooks();
  const book = books.find((item) => {
    return item.id === question.curriculumBookId || item.title === question.curriculumBook;
  });
  const chapter = book?.chapters.find((item) => {
    return item.id === question.curriculumChapterId || item.title === question.curriculumChapter;
  });
  const section = chapter?.sections.find((item) => {
    return item.id === question.curriculumSectionId || item.title === question.curriculumSection;
  });
  return {
    curriculumBookId: book?.id || question.curriculumBookId || "",
    curriculumChapterId: chapter?.id || question.curriculumChapterId || "",
    curriculumSectionId: section?.id || question.curriculumSectionId || "",
    curriculumBook: book?.title || question.curriculumBook || "",
    curriculumChapter: chapter?.title || question.curriculumChapter || "",
    curriculumSection: section?.title || question.curriculumSection || "",
    textbookUnit: [
      book?.title || question.curriculumBook,
      chapter?.title || question.curriculumChapter,
      section?.title || question.curriculumSection
    ].filter(Boolean).join("·") || question.textbookUnit || ""
  };
}

function closeDialogFromBackdrop(event) {
  const dialog = event.currentTarget;
  const bounds = dialog.getBoundingClientRect();
  const clickedOutside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (clickedOutside) dialog.close();
}

function hasVideo(question) {
  return (question.videoType === "file" && question.videoBlob instanceof Blob)
    || (question.videoType === "url" && isValidHttpUrl(question.videoUrl));
}

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `question-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateForFile(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.style.background = isError ? "#8b3e35" : "";
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3000);
}
