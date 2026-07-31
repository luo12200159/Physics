(() => {
  "use strict";

  const STORAGE_KEY = "physics-ai-gateway-v1";
  const SESSION_TOKEN_KEY = "physics-ai-gateway-token-v1";
  const DEFAULT_MODEL = "gpt-5.6-sol";
  const MAX_RESPONSE_CHARS = 180000;

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

  function loadConfig() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
          "X-Physics-Studio-Client": "physics-studio/2.2",
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
    const question = normalizeQuestionInput(input?.question);
    const payload = await requestJson("/v1/physics/solve", {
      protocolVersion: 1,
      model: loadConfig().model,
      task: "physics_tutoring",
      teachingMode: "socratic_then_solution",
      question,
      studentWork: String(input?.studentWork || "").slice(0, 30000),
      hintLevelUsed: Math.max(0, Math.min(5, Number(input?.hintLevelUsed) || 0)),
      responseSchema: solutionSchema,
      verificationRequired: [
        "dimension", "unit", "sign_direction", "limit_case",
        "conservation_laws", "order_of_magnitude", "equation_graph_consistency"
      ]
    });
    return validateSolution(payload);
  }

  async function analyzeDocument(file, context = {}) {
    if (!(file instanceof Blob)) throw new Error("没有可解析的文档。");
    const security = window.PhysicsStudioSecurity;
    const inspection = await security?.inspectFile?.(file, "document");
    const config = loadConfig();
    if (!config.enabled || !config.endpoint) {
      throw new Error("PDF、旧版 Word 和复杂扫描件需要配置受控 ChatGPT 服务端；DOCX 纯文本和设备 OCR 可离线预解析。");
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
        source: String(context.source || "教师上传资料").slice(0, 200),
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
          "X-Physics-Studio-Client": "physics-studio/2.2",
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
      examPoints: Array.isArray(question.examPoints)
        ? question.examPoints.slice(0, 20).map((item) => String(item).slice(0, 100))
        : [],
      content: content.slice(0, 60000)
    };
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
    version: "1.0.0",
    defaultModel: DEFAULT_MODEL,
    loadConfig,
    saveConfig,
    status,
    solveQuestion,
    analyzeDocument,
    testConnection
  });
})();
