(() => {
  "use strict";

  const STORAGE_KEY = "physics-ai-gateway-v1";
  const SESSION_TOKEN_KEY = "physics-ai-gateway-token-v1";
  const DEFAULT_MODEL = "gpt-5.6-sol";
  const MAX_RESPONSE_CHARS = 180000;

  function appVersion() {
    return String(window.PHYSICS_LEARNING_ENGINE?.version || globalThis.PHYSICS_STUDIO_VERSION?.appVersion || "3.4.0");
  }

  function storage() {
    const repository = window.PhysicsStudioStorageRepository;
    if (!repository) throw new Error("本地存储适配器未加载");
    return repository;
  }

  const solutionSchema = Object.freeze({
    name: "physics_solution_v1",
    required: [
      "known", "unknown", "object", "process", "laws", "steps", "answer",
      "checks", "examPoints", "similarQuestion", "reviewRequired"
    ]
  });

  const documentSchema = Object.freeze({
    name: "physics_document_questions_v1",
    required: ["questions", "warnings", "reviewRequired"]
  });

  const tutorTurnSchema = Object.freeze({
    name: "physics_tutor_turn_v1",
    required: [
      "diagnosisType", "nextPrompt", "hintLevel", "feedback",
      "verification", "canRevealSolution", "reviewRequired"
    ]
  });

  const variantGenerationSchema = Object.freeze({
    name: "variant_generation_v1",
    required: ["variants", "generationNotes", "reviewRequired"],
    variantRequired: [
      "id", "variantRole", "title", "content", "options", "stage", "grade",
      "topic", "knowledgePointId", "knowledgePoints", "examPoints", "questionType",
      "difficulty", "changeSummary", "relationToParent", "answer", "solution",
      "solutionDetail", "crossVerification", "reviewRequired"
    ]
  });

  function loadConfig() {
    try {
      const value = storage().getJson(STORAGE_KEY, null);
      return normalizeConfig(value);
    } catch {
      return normalizeConfig(null);
    }
  }

  function normalizeConfig(value) {
    return {
      endpoint: String(value?.endpoint || "").trim().replace(/\/+$/, "").slice(0, 500),
      model: String(value?.model || DEFAULT_MODEL).trim().slice(0, 80) || DEFAULT_MODEL,
      enabled: Boolean(value?.enabled && value?.endpoint),
      updatedAt: value?.updatedAt || ""
    };
  }

  function validateEndpoint(endpoint) {
    let parsed;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error("服务地址不是有效网址。");
    }
    const localHttp = parsed.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp) {
      throw new Error("服务地址必须使用 HTTPS；本机开发可使用 localhost HTTP。");
    }
    if (parsed.username || parsed.password) throw new Error("服务地址不能包含账号或密钥。");
    return parsed.toString().replace(/\/+$/, "");
  }

  function saveConfig(input) {
    const endpoint = input?.endpoint ? validateEndpoint(String(input.endpoint).trim()) : "";
    const next = {
      endpoint,
      model: String(input?.model || DEFAULT_MODEL).trim().slice(0, 80) || DEFAULT_MODEL,
      enabled: Boolean(input?.enabled && endpoint),
      updatedAt: new Date().toISOString()
    };
    storage().setJson(STORAGE_KEY, next);
    const accessToken = String(input?.accessToken || "").trim().slice(0, 500);
    if (accessToken) sessionStorage.setItem(SESSION_TOKEN_KEY, accessToken);
    return Object.freeze({ ...next });
  }

  function status() {
    const config = loadConfig();
    return Object.freeze({
      ...config,
      ready: Boolean(config.enabled && config.endpoint),
      mode: config.enabled && config.endpoint ? "gateway" : "offline",
      boundary: config.enabled && config.endpoint
        ? "请求只发送到已配置的受控服务端；客户端不保存 OpenAI API 密钥。"
        : "当前使用离线规则引擎。配置受控服务端后才能调用 ChatGPT 深度解析。"
    });
  }

  async function requestJson(path, body, timeoutMs = 90000) {
    const config = loadConfig();
    if (!config.enabled || !config.endpoint) {
      throw new Error("尚未配置 ChatGPT 服务端。离线规则解题仍可使用。");
    }
    const accessToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.endpoint}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Physics-Studio-Client": `physics-studio/${appVersion()}`,
          ...(accessToken ? { "X-Physics-Gateway-Token": accessToken } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) throw new Error(`解题服务返回 ${response.status}。`);
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARS) throw new Error("服务返回内容超过安全上限。");
      return JSON.parse(text);
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("解题服务响应超时。");
      if (error instanceof SyntaxError) throw new Error("解题服务返回的不是有效 JSON。");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function solveQuestion(input) {
    if (input?.minorUnder14 === true && input?.guardianConsentStatus !== "granted") {
      throw new Error("未满14周岁学生尚无有效监护人授权，不能发送内容到 AI 服务。");
    }
    const question = normalizeQuestionInput(input?.question);
    const redactedStudentWork = redactPersonalData(input?.studentWork, input?.personalIdentifiers);
    const payload = await requestJson("/v1/physics/solve", {
      protocolVersion: 1,
      model: loadConfig().model,
      task: "physics_tutoring",
      teachingMode: "socratic_then_solution",
      question,
      studentWork: redactedStudentWork.slice(0, 30000),
      hintLevelUsed: Math.max(0, Math.min(5, Number(input?.hintLevelUsed) || 0)),
      responseSchema: solutionSchema,
      verificationRequired: [
        "dimension", "unit", "sign_direction", "limit_case",
        "conservation_laws", "order_of_magnitude", "equation_graph_consistency"
      ]
    });
    return validateSolution(payload);
  }

  function assertAiConsent(input) {
    if (input?.minorUnder14 === true && input?.guardianConsentStatus !== "granted") {
      throw new Error("未满14周岁学生尚无有效监护人授权，不能发送内容到 AI 服务。");
    }
  }

  function normalizedHintLevel(value) {
    return Math.max(0, Math.min(5, Math.trunc(Number(value) || 0)));
  }

  function minimalModeling(value) {
    const source = value && typeof value === "object" ? value : {};
    const allowed = [
      "object", "known", "unknown", "process", "assumptions",
      "coordinates", "forces", "equations", "reasonableness"
    ];
    return Object.fromEntries(allowed
      .filter((key) => String(source[key] || "").trim())
      .map((key) => [key, String(source[key]).slice(0, 4000)]));
  }

  function minimalTutorSession(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      turn: Math.max(0, Math.min(50, Math.trunc(Number(source.turn) || 0))),
      focus: String(source.focus || "").slice(0, 80),
      previousPrompt: String(source.previousPrompt || "").slice(0, 1200)
    };
  }

  function offlineTutorTurn(input, gatewayUnavailable = false) {
    const used = normalizedHintLevel(input?.hintLevelUsed);
    const reveal = input?.revealSolutionRequested === true;
    const nextLevel = reveal ? 5 : Math.min(4, Math.max(1, used + 1));
    const hints = Array.isArray(input?.offlineHints) ? input.offlineHints : [];
    const fallbackPrompts = [
      "先说明研究对象是谁，并写出系统边界。",
      "这个过程满足哪条物理规律？请同时写出规律的适用条件。",
      "请先写符号方程，再检查每个物理量的方向和单位。",
      "完成一个局部步骤后，用量纲、方向或极限情况检验它。",
      "完整解法已由你明确请求；本次记录的提示等级为 5，不能计为独立完成。"
    ];
    const hintText = String(hints[nextLevel - 1] || fallbackPrompts[nextLevel - 1] || fallbackPrompts[0]);
    return {
      diagnosisType: used === 0 ? "modeling-start" : "next-scaffold",
      nextPrompt: hintText.slice(0, 6000),
      hintLevel: nextLevel,
      feedback: gatewayUnavailable
        ? "受控导师服务当前不可用，已切换到本机五级提示；学习过程可继续。"
        : "当前使用本机五级提示，只推进一个主要思考步骤。",
      verification: {
        checks: ["dimension", "unit", "sign_direction", "limit_case", "conservation_laws", "order_of_magnitude", "equation_graph_consistency"],
        passed: null
      },
      canRevealSolution: reveal,
      reviewRequired: false,
      source: "offline-hint",
      gatewayUnavailable: Boolean(gatewayUnavailable),
      independentCompletionEligible: nextLevel < 5,
      sessionState: {
        turn: Math.max(0, Math.min(50, Math.trunc(Number(input?.sessionState?.turn) || 0))) + 1,
        focus: nextLevel === 1 ? "object" : nextLevel === 2 ? "law-condition" : nextLevel === 3 ? "equation" : nextLevel === 4 ? "local-step" : "solution",
        previousPrompt: hintText.slice(0, 1200)
      }
    };
  }

  function validateTutorTurn(value, input) {
    if (!value || typeof value !== "object") throw new Error("导师服务缺少结构化结果。");
    tutorTurnSchema.required.forEach((field) => {
      if (!(field in value)) throw new Error(`导师结果缺少字段：${field}。`);
    });
    const currentLevel = normalizedHintLevel(input?.hintLevelUsed);
    const reveal = input?.revealSolutionRequested === true;
    const requestedLevel = normalizedHintLevel(value.hintLevel);
    const maximumLevel = reveal ? 5 : Math.min(4, currentLevel + 1);
    const hintLevel = Math.max(currentLevel, Math.min(maximumLevel, requestedLevel || currentLevel + 1));
    if (typeof value.nextPrompt !== "string" || typeof value.feedback !== "string") {
      throw new Error("导师文本字段类型错误。");
    }
    if (!value.verification || typeof value.verification !== "object") {
      throw new Error("导师结果缺少物理校验信息。");
    }
    const verificationChecks = Array.isArray(value.verification.checks)
      ? value.verification.checks.slice(0, 20).map((item) => String(item).slice(0, 120))
      : [];
    return {
      diagnosisType: String(value.diagnosisType || "next-scaffold").slice(0, 80),
      nextPrompt: value.nextPrompt.slice(0, 6000),
      hintLevel,
      feedback: value.feedback.slice(0, 6000),
      verification: {
        checks: verificationChecks,
        passed: typeof value.verification.passed === "boolean" ? value.verification.passed : null
      },
      canRevealSolution: reveal && Boolean(value.canRevealSolution),
      reviewRequired: Boolean(value.reviewRequired),
      source: "gateway",
      gatewayUnavailable: false,
      independentCompletionEligible: hintLevel < 5,
      sessionState: minimalTutorSession(value.sessionState)
    };
  }

  async function tutorTurn(input) {
    const question = normalizeQuestionInput(input?.question);
    const config = loadConfig();
    if (!config.enabled || !config.endpoint) return offlineTutorTurn(input, false);
    assertAiConsent(input);
    const hintLevelUsed = normalizedHintLevel(input?.hintLevelUsed);
    const revealSolutionRequested = input?.revealSolutionRequested === true;
    try {
      const payload = await requestJson("/v1/physics/tutor-turn", {
        protocolVersion: 1,
        model: config.model,
        task: "physics_tutor_turn",
        teachingMode: "single_step_socratic",
        question,
        studentWork: redactPersonalData(input?.studentWork, input?.personalIdentifiers).slice(0, 12000),
        sessionState: minimalTutorSession(input?.sessionState),
        hintLevelUsed,
        modeling: minimalModeling(input?.modeling),
        revealSolutionRequested,
        responseSchema: tutorTurnSchema,
        rules: [
          "每轮只推进一个主要认知步骤",
          "优先追问研究对象、过程、规律适用条件和方程",
          "未明确请求完整解法时不得输出完整答案",
          "完整解法必须把 hintLevel 记为 5",
          "AI 不能修改正式评分或掌握状态"
        ],
        verificationRequired: [
          "dimension", "unit", "sign_direction", "limit_case",
          "conservation_laws", "order_of_magnitude", "equation_graph_consistency"
        ]
      }, 30000);
      return validateTutorTurn(payload, input);
    } catch {
      return offlineTutorTurn(input, true);
    }
  }

  async function analyzeDocument(file, context = {}) {
    if (!(file instanceof Blob)) throw new Error("没有可解析的文档。");
    const security = window.PhysicsStudioSecurity;
    const inspection = await security?.inspectFile?.(file, "document");
    const config = loadConfig();
    if (!config.enabled || !config.endpoint) {
      throw new Error("PDF、旧版 Word 和复杂扫描件需要配置受控 ChatGPT 服务端；DOCX 纯文本和设备 OCR 可离线预解析。");
    }
    if (context.uploadConfirmed !== true) {
      throw new Error("文件尚未确认发送到受控服务；未执行网络上传。");
    }
    if (context.minorUnder14 === true && context.guardianConsentStatus !== "granted") {
      throw new Error("未满14周岁学生尚无有效监护人授权，不能上传文档到 AI 服务。");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);
    try {
      const accessToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
      const form = new FormData();
      form.append("file", file, inspection?.name || file.name || "document");
      form.append("request", JSON.stringify({
        protocolVersion: 1,
        model: config.model,
        task: "physics_document_analysis",
        stage: ["初中", "高中"].includes(context.stage) ? context.stage : "初中",
        grade: String(context.grade || "八年级").slice(0, 12),
        source: redactPersonalData(context.source || "教师上传资料", context.personalIdentifiers).slice(0, 200),
        rightsConfirmed: Boolean(context.rightsConfirmed),
        responseSchema: documentSchema,
        rules: [
          "保留题号、全部条件、单位、上下标和选项",
          "不确定字符写入 uncertainFragments，禁止猜填",
          "逐题给出考点、已知量、未知量、物理过程、公式条件、步骤、答案和校验",
          "图形缺失或无法辨认时必须标记 requiresImageReview"
        ]
      }));
      const response = await fetch(`${config.endpoint}/v1/physics/document-analysis`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "X-Physics-Studio-Client": `physics-studio/${appVersion()}`,
          ...(accessToken ? { "X-Physics-Gateway-Token": accessToken } : {})
        },
        body: form,
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) throw new Error(`文档解析服务返回 ${response.status}。`);
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARS) throw new Error("文档解析结果超过安全上限。");
      return validateDocumentResult(JSON.parse(text));
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("文档解析服务响应超时。");
      if (error instanceof SyntaxError) throw new Error("文档解析服务返回的不是有效 JSON。");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function validateVariantGeneration(value, parentQuestion, requestedCount) {
    if (!value || typeof value !== "object" || !Array.isArray(value.variants)) {
      throw new Error("变式生成服务缺少 variants 数组。 ");
    }
    if (value.variants.length < 2 || value.variants.length > Math.min(3, requestedCount)) {
      throw new Error("变式生成服务必须返回 2 至 3 道完整题。 ");
    }
    const roles = new Set();
    const variants = value.variants.map((variant, index) => {
      if (!variant || typeof variant !== "object") throw new Error(`第 ${index + 1} 道变式结构无效。`);
      variantGenerationSchema.variantRequired.forEach((field) => {
        if (!(field in variant)) throw new Error(`第 ${index + 1} 道变式缺少字段：${field}。`);
      });
      const role = ["near", "reverse", "context"].includes(variant.variantRole)
        ? variant.variantRole
        : "";
      if (!role || roles.has(role)) throw new Error("变式角色缺失或重复。 ");
      roles.add(role);
      if (variant.stage !== parentQuestion.stage || variant.grade !== parentQuestion.grade) {
        throw new Error("AI 变式超出母题学段或年级。 ");
      }
      const detail = variant.solutionDetail;
      const detailRequired = ["overview", "known", "unknown", "researchObject", "process", "laws", "steps", "finalAnswer", "checks", "pitfalls", "parentDifference"];
      if (!detail || typeof detail !== "object") throw new Error("AI 变式缺少结构化解题过程。 ");
      detailRequired.forEach((field) => {
        if (!(field in detail)) throw new Error(`结构化解题过程缺少字段：${field}。`);
      });
      if (!Array.isArray(detail.steps) || !detail.steps.length) throw new Error("AI 变式没有分步推导。 ");
      const steps = detail.steps.slice(0, 30).map((step) => {
        if (!step || typeof step !== "object" || typeof step.reasoning !== "string") {
          throw new Error("AI 变式推导步骤格式错误。 ");
        }
        return {
          reasoning: String(step.reasoning).slice(0, 5000),
          equation: String(step.equation || "").slice(0, 1000),
          substitution: String(step.substitution || "").slice(0, 2000),
          result: String(step.result || "").slice(0, 2000)
        };
      });
      const content = String(variant.content || "").trim();
      const answer = String(variant.answer || "").trim();
      const solution = String(variant.solution || "").trim();
      if (!content || !answer || !solution) throw new Error("AI 变式题干、答案或解析为空。 ");
      const crossVerification = variant.crossVerification;
      if (!crossVerification || crossVerification.passed !== true
        || !Array.isArray(crossVerification.checks)
        || crossVerification.checks.length === 0
        || !Array.isArray(crossVerification.criticalIssues)
        || crossVerification.criticalIssues.length > 0) {
        throw new Error("AI 变式缺少独立求解校验证据。 ");
      }
      return {
        id: String(variant.id).slice(0, 220),
        variantRole: role,
        title: String(variant.title || `专项变式 ${index + 1}`).slice(0, 240),
        content: content.slice(0, 60000),
        options: Array.isArray(variant.options) ? variant.options.slice(0, 12) : [],
        stage: variant.stage,
        grade: variant.grade,
        topic: String(variant.topic || parentQuestion.topic).slice(0, 120),
        knowledgePointId: String(variant.knowledgePointId || parentQuestion.knowledgePointId || "").slice(0, 200),
        knowledgePoints: Array.isArray(variant.knowledgePoints) ? variant.knowledgePoints.slice(0, 20).map((item) => String(item).slice(0, 160)) : [],
        examPoints: Array.isArray(variant.examPoints) ? variant.examPoints.slice(0, 20).map((item) => String(item).slice(0, 160)) : [],
        questionType: String(variant.questionType || "未标注").slice(0, 50),
        difficulty: ["基础", "进阶", "挑战"].includes(variant.difficulty) ? variant.difficulty : "进阶",
        modelDefinitionId: String(variant.modelDefinitionId || "").slice(0, 200),
        transferGroupId: String(variant.transferGroupId || "").slice(0, 200),
        independenceGroupId: String(variant.independenceGroupId || "").slice(0, 200),
        changeSummary: String(variant.changeSummary || "").slice(0, 2000),
        relationToParent: String(variant.relationToParent || "").slice(0, 2000),
        answer: answer.slice(0, 30000),
        correctAnswer: String(variant.correctAnswer || "").slice(0, 2000),
        correctAnswers: Array.isArray(variant.correctAnswers) ? variant.correctAnswers.slice(0, 12).map(String) : [],
        solution: solution.slice(0, 60000),
        solutionDetail: {
          overview: String(detail.overview || "").slice(0, 5000),
          known: Array.isArray(detail.known) ? detail.known.slice(0, 30).map(String) : [],
          unknown: String(detail.unknown || "").slice(0, 3000),
          researchObject: String(detail.researchObject || "").slice(0, 3000),
          process: String(detail.process || "").slice(0, 5000),
          laws: Array.isArray(detail.laws) ? detail.laws.slice(0, 20) : [],
          steps,
          finalAnswer: String(detail.finalAnswer || answer).slice(0, 30000),
          checks: Array.isArray(detail.checks) ? detail.checks.slice(0, 20).map(String) : [],
          pitfalls: Array.isArray(detail.pitfalls) ? detail.pitfalls.slice(0, 20).map(String) : [],
          parentDifference: String(detail.parentDifference || variant.changeSummary || "").slice(0, 3000)
        },
        crossVerification: {
          passed: true,
          checks: crossVerification.checks.slice(0, 30).map((item) => String(item).slice(0, 500)),
          criticalIssues: Array.isArray(crossVerification.criticalIssues)
            ? crossVerification.criticalIssues.slice(0, 20).map((item) => String(item).slice(0, 1000))
            : [],
          verifier: "independent-second-pass"
        },
        source: "应用内 AI 生成变式",
        reviewRequired: true
      };
    });
    return {
      variants,
      generationNotes: String(value.generationNotes || "").slice(0, 5000),
      reviewRequired: true
    };
  }

  async function generateVariants(input = {}) {
    assertAiConsent(input);
    const question = normalizeQuestionInput(input.question);
    const requestedCount = Math.max(2, Math.min(3, Number(input.count) || 3));
    const identifiers = Array.isArray(input.personalIdentifiers) ? input.personalIdentifiers : [];
    const redactedQuestion = {
      ...question,
      title: redactPersonalData(question.title, identifiers),
      content: redactPersonalData(question.content, identifiers)
    };
    const rawModel = input.itemModel && typeof input.itemModel === "object" ? input.itemModel : {};
    const itemModel = {
      sourceQuestionId: String(rawModel.sourceQuestionId || question.id).slice(0, 200),
      questionType: String(rawModel.questionType || question.questionType).slice(0, 50),
      stage: question.stage,
      grade: question.grade,
      topic: question.topic,
      knowledgePointId: String(rawModel.knowledgePointId || question.knowledgePointId || "").slice(0, 200),
      examPoints: Array.isArray(rawModel.examPoints) ? rawModel.examPoints.slice(0, 20).map(String) : question.examPoints,
      difficulty: String(rawModel.difficulty || question.difficulty).slice(0, 30),
      modelDefinitionId: String(rawModel.modelDefinitionId || question.modelDefinitionId || "").slice(0, 200),
      researchObject: String(rawModel.researchObject || "").slice(0, 1000),
      knownQuantities: Array.isArray(rawModel.knownQuantities) ? rawModel.knownQuantities.slice(0, 20).map(String) : [],
      unknownQuantity: String(rawModel.unknownQuantity || "").slice(0, 1000),
      coreLaws: Array.isArray(rawModel.coreLaws) ? rawModel.coreLaws.slice(0, 20).map(String) : [],
      lawConditions: Array.isArray(rawModel.lawConditions) ? rawModel.lawConditions.slice(0, 20).map(String) : [],
      variableRelations: Array.isArray(rawModel.variableRelations) ? rawModel.variableRelations.slice(0, 20).map(String) : [],
      constraints: Array.isArray(rawModel.constraints) ? rawModel.constraints.slice(0, 20).map(String) : [],
      representationType: String(rawModel.representationType || question.representationType || "文字/公式").slice(0, 80),
      visualDependency: Boolean(rawModel.visualDependency)
    };
    const payload = await requestJson("/v1/physics/generate-variants", {
      protocolVersion: 1,
      model: loadConfig().model,
      task: "physics_variant_generation",
      generationMode: "generate_then_independently_verify",
      requestedCount,
      parentQuestion: redactedQuestion,
      itemModel,
      responseSchema: variantGenerationSchema,
      rules: [
        "返回2至3道完整可作答题，不得返回泛化练习建议",
        "近迁移不能只机械替换一个数字",
        "逆向题必须改变已知—未知结构",
        "情境题不得缺图；没有受支持图形时使用可完整验证的文字题",
        "不得虚构中高考、学校或试卷来源",
        "每道题必须重新求解并给出结构化步骤",
        "所有 AI 题必须进入教师审核，不得自行写入正式掌握状态"
      ]
    }, 120000);
    return validateVariantGeneration(payload, question, requestedCount);
  }

  async function testConnection() {
    const result = await requestJson("/v1/physics/health", {
      protocolVersion: 1,
      model: loadConfig().model
    }, 15000);
    return Boolean(result?.ok);
  }

  function normalizeQuestionInput(question) {
    if (!question || typeof question !== "object") throw new Error("缺少待解析题目。");
    const content = String(question.content || "").trim();
    if (!content) throw new Error("题干为空。");
    return {
      id: String(question.id || "").slice(0, 160),
      title: String(question.title || "物理题").slice(0, 200),
      stage: ["初中", "高中"].includes(question.stage) ? question.stage : "初中",
      grade: String(question.grade || "八年级").slice(0, 12),
      topic: String(question.topic || "待分类").slice(0, 100),
      knowledgePointId: String(question.knowledgePointId || question.topicKey || "").slice(0, 200),
      questionType: String(question.questionType || "未标注").slice(0, 50),
      difficulty: String(question.difficulty || "进阶").slice(0, 30),
      modelDefinitionId: String(question.modelDefinitionId || question.modelFamilyId || "").slice(0, 200),
      representationType: String(question.representationType || "文字/公式").slice(0, 80),
      examPoints: Array.isArray(question.examPoints)
        ? question.examPoints.slice(0, 20).map((item) => String(item).slice(0, 100))
        : [],
      content: content.slice(0, 60000)
    };
  }

  function redactPersonalData(value, identifiers = []) {
    let text = String(value || "");
    (Array.isArray(identifiers) ? identifiers : []).forEach((identifier) => {
      const literal = String(identifier || "").trim();
      if (!literal) return;
      text = text.split(literal).join("[已脱敏]");
    });
    return text
      .replace(/(姓名|学生姓名|学号|班级|家庭住址|住址|监护人|家长)\s*[:：]\s*[^\n,，;；]{1,80}/gu, "$1：[已脱敏]")
      .replace(/\b1[3-9]\d{9}\b/g, "[手机号已脱敏]")
      .replace(/\b\d{17}[\dXx]\b/g, "[证件号已脱敏]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[邮箱已脱敏]");
  }

  function validateSolution(value) {
    if (!value || typeof value !== "object") throw new Error("解题服务缺少结构化结果。");
    solutionSchema.required.forEach((field) => {
      if (!(field in value)) throw new Error(`解题结果缺少字段：${field}。`);
    });
    const textFields = ["unknown", "object", "process", "answer"];
    textFields.forEach((field) => {
      if (typeof value[field] !== "string") throw new Error(`解题字段 ${field} 类型错误。`);
      value[field] = value[field].slice(0, 30000);
    });
    ["known", "laws", "steps", "checks", "examPoints"].forEach((field) => {
      if (!Array.isArray(value[field])) throw new Error(`解题字段 ${field} 类型错误。`);
      value[field] = value[field].slice(0, 50).map((item) => String(item).slice(0, 3000));
    });
    value.reviewRequired = Boolean(value.reviewRequired);
    return value;
  }

  function validateDocumentResult(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.questions)) {
      throw new Error("文档解析结果缺少 questions 数组。");
    }
    if (value.questions.length > 200) throw new Error("单次文档解析题量超过 200 道上限。");
    return {
      questions: value.questions.map((question, index) => ({
        clientIndex: index + 1,
        title: String(question.title || `文档第 ${index + 1} 题`).slice(0, 200),
        content: String(question.content || "").slice(0, 60000),
        answer: String(question.answer || "").slice(0, 30000),
        solution: String(question.solution || "").slice(0, 60000),
        stage: ["初中", "高中"].includes(question.stage) ? question.stage : "初中",
        grade: ["八年级", "九年级", "高一", "高二", "高三"].includes(question.grade)
          ? question.grade
          : "八年级",
        topic: String(question.topic || "待教师核对").slice(0, 100),
        difficulty: ["基础", "进阶", "挑战"].includes(question.difficulty) ? question.difficulty : "进阶",
        examPoints: Array.isArray(question.examPoints)
          ? question.examPoints.slice(0, 20).map((item) => String(item).slice(0, 100))
          : [],
        uncertainFragments: Array.isArray(question.uncertainFragments)
          ? question.uncertainFragments.slice(0, 50).map((item) => String(item).slice(0, 500))
          : [],
        requiresImageReview: Boolean(question.requiresImageReview),
        reviewRequired: question.reviewRequired !== false
      })).filter((question) => question.content.trim()),
      warnings: Array.isArray(value.warnings)
        ? value.warnings.slice(0, 100).map((item) => String(item).slice(0, 1000))
        : [],
      reviewRequired: value.reviewRequired !== false
    };
  }

  window.PhysicsStudioAITutor = Object.freeze({
    version: "2.0.0",
    defaultModel: DEFAULT_MODEL,
    loadConfig,
    saveConfig,
    status,
    redactPersonalData,
    tutorTurn,
    generateVariants,
    solveQuestion,
    analyzeDocument,
    testConnection
  });
})();
