import http from "node:http";
import crypto from "node:crypto";

const PORT = boundedInteger(process.env.PORT, 8787, 1, 65535);
const HOST = process.env.HOST || "127.0.0.1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const ALLOWED_MODELS = new Set(
  (process.env.PHYSICS_ALLOWED_MODELS || DEFAULT_MODEL)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const ALLOWED_ORIGINS = new Set(
  (process.env.PHYSICS_ALLOWED_ORIGINS
    || "https://physics-studio.local,https://appassets.androidplatform.net")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const SHARED_TOKEN = process.env.PHYSICS_GATEWAY_TOKEN || "";
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 160000;
const RATE_WINDOW_MS = 60000;
const RATE_LIMIT = boundedInteger(process.env.PHYSICS_RATE_LIMIT, 20, 1, 1000);
const rateBuckets = new Map();

function assertStudentConsentVerifierAvailable() {
  // This standalone gateway has no persisted student/guardian consent store.
  // Keep personal-content endpoints closed until a server-side verifier exists.
  throw httpError(403, "student_consent_verification_unavailable");
}

const solutionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "known", "unknown", "object", "process", "laws", "steps", "answer",
    "checks", "examPoints", "similarQuestion", "reviewRequired"
  ],
  properties: {
    known: stringArray(30, 1000),
    unknown: boundedString(5000),
    object: boundedString(5000),
    process: boundedString(10000),
    laws: stringArray(20, 3000),
    steps: stringArray(40, 5000),
    answer: boundedString(10000),
    checks: stringArray(20, 3000),
    examPoints: stringArray(20, 200),
    similarQuestion: boundedString(10000),
    reviewRequired: { type: "boolean" }
  }
};

const documentQuestionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "content", "answer", "solution", "stage", "grade", "topic",
    "difficulty", "examPoints", "uncertainFragments", "requiresImageReview",
    "reviewRequired"
  ],
  properties: {
    title: boundedString(200),
    content: boundedString(60000),
    answer: boundedString(30000),
    solution: boundedString(60000),
    stage: { type: "string", enum: ["初中", "高中"] },
    grade: { type: "string", enum: ["八年级", "九年级", "高一", "高二", "高三"] },
    topic: boundedString(100),
    difficulty: { type: "string", enum: ["基础", "进阶", "挑战"] },
    examPoints: stringArray(20, 100),
    uncertainFragments: stringArray(50, 500),
    requiresImageReview: { type: "boolean" },
    reviewRequired: { type: "boolean" }
  }
};

const documentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions", "warnings", "reviewRequired"],
  properties: {
    questions: {
      type: "array",
      maxItems: 200,
      items: documentQuestionSchema
    },
    warnings: stringArray(100, 1000),
    reviewRequired: { type: "boolean" }
  }
};

const tutorTurnSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "diagnosisType", "nextPrompt", "hintLevel", "feedback", "verification",
    "canRevealSolution", "reviewRequired", "sessionState"
  ],
  properties: {
    diagnosisType: boundedString(80),
    nextPrompt: boundedString(6000),
    hintLevel: { type: "integer", minimum: 1, maximum: 5 },
    feedback: boundedString(6000),
    verification: {
      type: "object",
      additionalProperties: false,
      required: ["checks", "passed"],
      properties: {
        checks: stringArray(20, 120),
        passed: { type: ["boolean", "null"] }
      }
    },
    canRevealSolution: { type: "boolean" },
    reviewRequired: { type: "boolean" },
    sessionState: {
      type: "object",
      additionalProperties: false,
      required: ["turn", "focus", "previousPrompt"],
      properties: {
        turn: { type: "integer", minimum: 0, maximum: 50 },
        focus: boundedString(80),
        previousPrompt: boundedString(1200)
      }
    }
  }
};

const variantStepSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reasoning", "equation", "substitution", "result"],
  properties: {
    reasoning: boundedString(5000),
    equation: boundedString(1000),
    substitution: boundedString(2000),
    result: boundedString(2000)
  }
};

const variantSolutionDetailSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview", "known", "unknown", "researchObject", "process", "laws",
    "steps", "finalAnswer", "checks", "pitfalls", "parentDifference"
  ],
  properties: {
    overview: boundedString(5000),
    known: stringArray(30, 1000),
    unknown: boundedString(3000),
    researchObject: boundedString(3000),
    process: boundedString(5000),
    laws: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "condition"],
        properties: { name: boundedString(500), condition: boundedString(2000) }
      }
    },
    steps: { type: "array", minItems: 1, maxItems: 30, items: variantStepSchema },
    finalAnswer: boundedString(30000),
    checks: stringArray(20, 3000),
    pitfalls: stringArray(20, 3000),
    parentDifference: boundedString(3000)
  }
};

const generatedVariantSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "variantRole", "variantTechnique", "title", "content", "options", "stage", "grade",
    "topic", "knowledgePointId", "knowledgePoints", "examPoints", "questionType",
    "difficulty", "modelDefinitionId", "transferGroupId", "independenceGroupId",
    "changeSummary", "relationToParent", "answer", "correctAnswer", "correctAnswers",
    "solution", "solutionDetail", "reviewRequired"
  ],
  properties: {
    id: boundedString(220),
    variantRole: { type: "string", enum: ["near", "far", "counter"] },
    variantTechnique: { type: "string", enum: ["parameter", "condition", "reverse", "representation", "context", "counterexample"] },
    title: boundedString(240),
    content: boundedString(60000),
    options: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "text"],
        properties: { key: boundedString(10), text: boundedString(2000) }
      }
    },
    stage: { type: "string", enum: ["初中", "高中"] },
    grade: { type: "string", enum: ["八年级", "九年级", "高一", "高二", "高三"] },
    topic: boundedString(120),
    knowledgePointId: boundedString(200),
    knowledgePoints: stringArray(20, 160),
    examPoints: stringArray(20, 160),
    questionType: boundedString(50),
    difficulty: { type: "string", enum: ["基础", "进阶", "挑战"] },
    modelDefinitionId: boundedString(200),
    transferGroupId: boundedString(200),
    independenceGroupId: boundedString(200),
    changeSummary: boundedString(2000),
    relationToParent: boundedString(2000),
    answer: boundedString(30000),
    correctAnswer: boundedString(2000),
    correctAnswers: stringArray(12, 20),
    solution: boundedString(60000),
    solutionDetail: variantSolutionDetailSchema,
    reviewRequired: { type: "boolean" }
  }
};

const variantGenerationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["variants", "generationNotes", "reviewRequired"],
  properties: {
    variants: { type: "array", minItems: 2, maxItems: 3, items: generatedVariantSchema },
    generationNotes: boundedString(5000),
    reviewRequired: { type: "boolean" }
  }
};

const server = http.createServer(async (request, response) => {
  const requestId = crypto.randomUUID();
  const origin = request.headers.origin || "";
  applySecurityHeaders(response, origin);

  if (request.method === "OPTIONS") {
    if (!originAllowed(origin)) return sendJson(response, 403, { error: "origin_not_allowed", requestId });
    response.statusCode = 204;
    return response.end();
  }

  try {
    if (!originAllowed(origin)) throw httpError(403, "origin_not_allowed");
    enforceRateLimit(request);
    enforceGatewayToken(request);

    if (request.method === "POST" && request.url === "/v1/physics/health") {
      if (!OPENAI_API_KEY) throw httpError(503, "openai_not_configured");
      return sendJson(response, 200, {
        ok: true,
        service: "physics-studio-ai-gateway",
        protocolVersion: 1,
        model: DEFAULT_MODEL
      });
    }

    if (request.method === "POST" && request.url === "/v1/physics/solve") {
      if (!OPENAI_API_KEY) throw httpError(503, "openai_not_configured");
      assertStudentConsentVerifierAvailable();
      const input = await readJson(request, MAX_JSON_BYTES);
      const result = await solveQuestion(input, requestId);
      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && request.url === "/v1/physics/tutor-turn") {
      if (!OPENAI_API_KEY) throw httpError(503, "openai_not_configured");
      assertStudentConsentVerifierAvailable();
      const input = await readJson(request, MAX_JSON_BYTES);
      const result = await tutorTurn(input, requestId);
      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && request.url === "/v1/physics/generate-variants") {
      if (!OPENAI_API_KEY) throw httpError(503, "openai_not_configured");
      assertStudentConsentVerifierAvailable();
      const input = await readJson(request, MAX_JSON_BYTES);
      const result = await generateVariants(input, requestId);
      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && request.url === "/v1/physics/document-analysis") {
      if (!OPENAI_API_KEY) throw httpError(503, "openai_not_configured");
      assertStudentConsentVerifierAvailable();
      const input = await readMultipart(request, MAX_DOCUMENT_BYTES + MAX_JSON_BYTES);
      const result = await analyzeDocument(input, requestId);
      return sendJson(response, 200, result);
    }

    return sendJson(response, 404, { error: "not_found", requestId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    const publicMessage = status >= 500 ? "gateway_error" : String(error?.message || "bad_request");
    if (status >= 500) {
      console.error(JSON.stringify({
        level: "error",
        requestId,
        status,
        message: String(error?.message || error).slice(0, 1000)
      }));
    }
    return sendJson(response, status, { error: publicMessage, requestId });
  }
});

server.requestTimeout = REQUEST_TIMEOUT_MS + 10000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.listen(PORT, HOST, () => {
  console.log(`Physics Studio AI gateway listening on http://${HOST}:${PORT}`);
  if (!OPENAI_API_KEY) console.warn("OPENAI_API_KEY is not configured; AI routes will return 503.");
  if (HOST !== "127.0.0.1" && HOST !== "::1" && !SHARED_TOKEN) {
    console.warn("Non-loopback binding without PHYSICS_GATEWAY_TOKEN; use an authenticated reverse proxy before production.");
  }
});

async function solveQuestion(input, requestId) {
  if (input?.protocolVersion !== 1 || input?.task !== "physics_tutoring") {
    throw httpError(400, "unsupported_protocol");
  }
  const question = input?.question;
  if (!question || typeof question !== "object") throw httpError(400, "question_required");
  const content = cleanText(question.content, 60000);
  if (!content) throw httpError(400, "question_content_required");
  const model = selectModel(input.model);

  const response = await callOpenAI({
    model,
    store: false,
    max_output_tokens: 10000,
    reasoning: { effort: "medium" },
    input: [
      {
        role: "system",
        content: [
          "你是面向中国初高中学生的物理导师。先建立研究对象、过程和模型，再分步推理。",
          "必须检查量纲、单位、方向、适用条件、守恒关系、数量级及方程与图像的一致性。",
          "若题干缺图、条件不完整、表述歧义或无法可靠校验，reviewRequired 必须为 true，并明确指出限制。",
          "不得虚构题目条件、来源或实验数据；举一反三题只改变表面情境并保留核心模型。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          question: {
            title: cleanText(question.title, 200),
            stage: cleanText(question.stage, 20),
            grade: cleanText(question.grade, 20),
            topic: cleanText(question.topic, 100),
            examPoints: cleanStringArray(question.examPoints, 20, 100),
            content
          },
          studentWork: cleanText(input.studentWork, 30000),
          hintLevelUsed: boundedInteger(input.hintLevelUsed, 0, 0, 5),
          teachingMode: "苏格拉底式提示后给出可核验的完整解答"
        })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "physics_solution_v1",
        strict: true,
        schema: solutionSchema
      }
    }
  }, requestId);

  return parseStructuredOutput(response);
}

async function tutorTurn(input, requestId) {
  if (input?.protocolVersion !== 1 || input?.task !== "physics_tutor_turn") {
    throw httpError(400, "unsupported_protocol");
  }
  const question = input?.question;
  const content = cleanText(question?.content, 60000);
  if (!content) throw httpError(400, "question_content_required");
  const currentLevel = boundedInteger(input.hintLevelUsed, 0, 0, 5);
  const revealRequested = input.revealSolutionRequested === true;
  const maximumLevel = revealRequested ? 5 : Math.min(4, currentLevel + 1);
  const response = await callOpenAI({
    model: selectModel(input.model),
    store: false,
    max_output_tokens: 4000,
    reasoning: { effort: "medium" },
    input: [
      {
        role: "system",
        content: [
          "你是初高中物理苏格拉底式导师。每轮只推进一个主要认知步骤。",
          "优先追问研究对象、物理过程、规律适用条件和符号方程。",
          "学生未明确请求完整解法时，不得展示最终答案或完整推导。",
          "必须遵守服务端给出的最大提示等级；完整解法只能使用第5级。",
          "你只能给学习建议，不能修改正式评分、掌握状态或教师结论。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          question: {
            title: cleanText(question.title, 200),
            stage: cleanText(question.stage, 20),
            grade: cleanText(question.grade, 20),
            topic: cleanText(question.topic, 120),
            content
          },
          studentWork: cleanText(input.studentWork, 12000),
          modeling: input.modeling && typeof input.modeling === "object" ? input.modeling : {},
          sessionState: input.sessionState && typeof input.sessionState === "object" ? input.sessionState : {},
          currentHintLevel: currentLevel,
          maximumHintLevel: maximumLevel,
          revealSolutionRequested: revealRequested,
          verificationRequired: [
            "dimension", "unit", "sign_direction", "limit_case", "conservation_laws",
            "order_of_magnitude", "equation_graph_consistency"
          ]
        })
      }
    ],
    text: {
      format: { type: "json_schema", name: "physics_tutor_turn_v1", strict: true, schema: tutorTurnSchema }
    }
  }, requestId);
  const result = parseStructuredOutput(response);
  result.hintLevel = Math.max(currentLevel, Math.min(maximumLevel, boundedInteger(result.hintLevel, maximumLevel, 1, 5)));
  result.canRevealSolution = revealRequested && result.hintLevel === 5;
  return result;
}

async function generateVariants(input, requestId) {
  if (input?.protocolVersion !== 1 || input?.task !== "physics_variant_generation") {
    throw httpError(400, "unsupported_protocol");
  }
  const parent = input?.parentQuestion;
  const content = cleanText(parent?.content, 60000);
  if (!content) throw httpError(400, "question_content_required");
  const requestedCount = boundedInteger(input.requestedCount, 3, 2, 3);
  const itemModel = input?.itemModel && typeof input.itemModel === "object" ? input.itemModel : {};
  const model = selectModel(input.model);
  const generation = await callOpenAI({
    model,
    store: false,
    max_output_tokens: 30000,
    reasoning: { effort: "high" },
    input: [
      {
        role: "system",
        content: [
          "你是初高中物理试题设计员。生成完整、可独立作答、可核验的原创变式题。",
          "默认依次生成近迁移、远迁移、反例辨析；用 variantTechnique 区分条件变化、逆向、表征、情境或反例。若第三题无法可靠完成可只返回两题。",
          "近迁移必须改变至少两项有教学意义的条件、方向、约束或设问组合，不能只换一个数字。",
          "不得虚构真实考试、学校或题源；source 由应用统一标记为应用内 AI 生成变式。",
          "没有实际图形数据时不得生成缺图题。每道题必须给出研究对象、规律条件、逐步推导和结果检验。",
          "所有题都必须标记 reviewRequired=true，教师审核前不能用于正式训练。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          requestedCount,
          parentQuestion: {
            id: cleanText(parent.id, 200),
            title: cleanText(parent.title, 240),
            stage: cleanText(parent.stage, 20),
            grade: cleanText(parent.grade, 20),
            topic: cleanText(parent.topic, 120),
            knowledgePointId: cleanText(parent.knowledgePointId, 200),
            questionType: cleanText(parent.questionType, 50),
            difficulty: cleanText(parent.difficulty, 30),
            examPoints: cleanStringArray(parent.examPoints, 20, 160),
            content
          },
          itemModel,
          requiredRoles: ["near", "far", "counter"].slice(0, requestedCount),
          verificationBoundary: "这是出题阶段；生成后还会由独立调用和客户端确定性质量门禁复核。"
        })
      }
    ],
    text: {
      format: { type: "json_schema", name: "variant_generation_v1", strict: true, schema: variantGenerationSchema }
    }
  }, `${requestId}-generate`);
  const draft = parseStructuredOutput(generation);
  draft.reviewRequired = true;
  draft.variants = (Array.isArray(draft.variants) ? draft.variants : []).map((variant) => ({ ...variant, reviewRequired: true }));
  if (draft.variants.length < 2 || draft.variants.length > requestedCount) throw httpError(502, "variant_count_invalid");

  const verificationSchema = {
    type: "object",
    additionalProperties: false,
    required: ["results", "reviewRequired"],
    properties: {
      results: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "passed", "criticalIssues", "checks"],
          properties: {
            id: boundedString(220),
            passed: { type: "boolean" },
            criticalIssues: stringArray(20, 1000),
            checks: stringArray(30, 500)
          }
        }
      },
      reviewRequired: { type: "boolean" }
    }
  };
  const verification = await callOpenAI({
    model,
    store: false,
    max_output_tokens: 10000,
    reasoning: { effort: "high" },
    input: [
      {
        role: "system",
        content: [
          "你是独立物理校验员，不参与出题。逐题重新求解并检查数值、单位、量纲、方向、守恒、数量级、极限情况和选项唯一性。",
          "发现任何题干—答案—解析冲突、缺图、年级越界或无法确定的问题，passed 必须为 false。",
          "此校验只是补充证据；所有 AI 题仍必须由教师审核。"
        ].join("\n")
      },
      { role: "user", content: JSON.stringify({ parentQuestion: parent, variants: draft.variants }) }
    ],
    text: {
      format: { type: "json_schema", name: "variant_cross_verification_v1", strict: true, schema: verificationSchema }
    }
  }, `${requestId}-verify`);
  const verified = parseStructuredOutput(verification);
  const checksById = new Map((verified.results || []).map((item) => [item.id, item]));
  const accepted = draft.variants
    .filter((variant) => {
      const result = checksById.get(variant.id);
      return result?.passed === true
        && Array.isArray(result.checks)
        && result.checks.length > 0
        && Array.isArray(result.criticalIssues)
        && result.criticalIssues.length === 0;
    })
    .map((variant) => {
      const result = checksById.get(variant.id);
      return {
        ...variant,
        crossVerification: {
          passed: true,
          checks: cleanStringArray(result?.checks, 30, 500),
          criticalIssues: cleanStringArray(result?.criticalIssues, 20, 1000),
          verifier: "independent-second-pass"
        }
      };
    });
  if (accepted.length < 2) throw httpError(422, "variants_failed_cross_verification");
  return {
    variants: accepted.slice(0, requestedCount),
    generationNotes: cleanText(draft.generationNotes, 5000),
    reviewRequired: true
  };
}

async function analyzeDocument(input, requestId) {
  const requestMetadata = safeJsonParse(input.request);
  if (requestMetadata?.protocolVersion !== 1
      || requestMetadata?.task !== "physics_document_analysis") {
    throw httpError(400, "unsupported_protocol");
  }
  if (!(input.file instanceof File)) throw httpError(400, "document_required");
  if (input.file.size < 1 || input.file.size > MAX_DOCUMENT_BYTES) {
    throw httpError(413, "document_size_out_of_range");
  }
  const fileName = sanitizeFileName(input.file.name || "document");
  const mimeType = cleanText(input.file.type || "application/octet-stream", 120);
  if (!allowedDocument(fileName, mimeType)) throw httpError(415, "unsupported_document_type");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const fileData = `data:${mimeType};base64,${bytes.toString("base64")}`;
  const model = selectModel(requestMetadata.model);
  const fileInput = mimeType.startsWith("image/")
    ? { type: "input_image", image_url: fileData, detail: "high" }
    : { type: "input_file", filename: fileName, file_data: fileData, detail: "high" };

  const response = await callOpenAI({
    model,
    store: false,
    max_output_tokens: 30000,
    reasoning: { effort: "medium" },
    input: [
      {
        role: "system",
        content: [
          "你是物理试卷数字化与校对助手。逐题忠实提取，不得补写无法辨认的内容。",
          "保留题号、条件、单位、上下标、选项和小问；不确定字符写入 uncertainFragments。",
          "图、电路、受力图、光路图或实验图不清晰时 requiresImageReview 必须为 true。",
          "解析必须包含研究对象、物理过程、规律适用条件、代入步骤、答案及至少一种合理性检查。",
          "所有结果均进入教师审核，reviewRequired 必须为 true。"
        ].join("\n")
      },
      {
        role: "user",
        content: [
          fileInput,
          {
            type: "input_text",
            text: JSON.stringify({
              instruction: "识别并结构化该文件中的物理题目与解答。",
              stage: ["初中", "高中"].includes(requestMetadata.stage)
                ? requestMetadata.stage
                : "初中",
              grade: cleanText(requestMetadata.grade, 20),
              source: cleanText(requestMetadata.source, 200),
              rightsConfirmed: Boolean(requestMetadata.rightsConfirmed)
            })
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "physics_document_questions_v1",
        strict: true,
        schema: documentSchema
      }
    }
  }, requestId);

  const result = parseStructuredOutput(response);
  result.reviewRequired = true;
  result.questions = Array.isArray(result.questions)
    ? result.questions.map((question) => ({ ...question, reviewRequired: true }))
    : [];
  return result;
}

async function callOpenAI(body, requestId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Client-Request-Id": requestId
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw httpError(502, `openai_${response.status}:${text.slice(0, 500)}`);
    }
    return JSON.parse(text);
  } catch (error) {
    if (error?.name === "AbortError") throw httpError(504, "openai_timeout");
    if (error instanceof SyntaxError) throw httpError(502, "openai_invalid_json");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseStructuredOutput(response) {
  for (const item of response?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "refusal") throw httpError(422, "model_refused");
      if (content?.type === "output_text" && typeof content.text === "string") {
        try {
          return JSON.parse(content.text);
        } catch {
          throw httpError(502, "structured_output_invalid_json");
        }
      }
    }
  }
  if (response?.status === "incomplete") throw httpError(502, "openai_incomplete_response");
  throw httpError(502, "structured_output_missing");
}

async function readJson(request, limit) {
  const contentType = String(request.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw httpError(415, "application_json_required");
  }
  const buffer = await readBody(request, limit);
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw httpError(400, "invalid_json");
  }
}

async function readMultipart(request, limit) {
  const contentType = String(request.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw httpError(415, "multipart_form_data_required");
  }
  const buffer = await readBody(request, limit);
  const webRequest = new Request("http://gateway.local/upload", {
    method: "POST",
    headers: { "content-type": contentType },
    body: buffer
  });
  const form = await webRequest.formData();
  return {
    file: form.get("file"),
    request: String(form.get("request") || "")
  };
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, "request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function enforceGatewayToken(request) {
  if (!SHARED_TOKEN) return;
  const provided = String(request.headers["x-physics-gateway-token"] || "");
  const expectedBuffer = Buffer.from(SHARED_TOKEN);
  const providedBuffer = Buffer.from(provided);
  if (providedBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw httpError(401, "gateway_auth_required");
  }
}

function enforceRateLimit(request) {
  const address = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(address);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(address, { startedAt: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) throw httpError(429, "rate_limit_exceeded");
  if (rateBuckets.size > 5000) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
}

function applySecurityHeaders(response, origin) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (originAllowed(origin) && origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Physics-Studio-Client, X-Physics-Gateway-Token"
    );
    response.setHeader("Access-Control-Max-Age", "600");
  }
}

function originAllowed(origin) {
  if (!origin) return HOST === "127.0.0.1" || HOST === "::1";
  return ALLOWED_ORIGINS.has(origin);
}

function selectModel(requested) {
  const value = cleanText(requested || DEFAULT_MODEL, 80);
  return ALLOWED_MODELS.has(value) ? value : DEFAULT_MODEL;
}

function allowedDocument(name, mime) {
  const extension = name.toLowerCase().split(".").pop();
  return ["pdf", "doc", "docx", "png", "jpg", "jpeg", "webp"].includes(extension)
    && (
      mime === "application/pdf"
      || mime === "application/msword"
      || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || mime.startsWith("image/")
      || mime === "application/octet-stream"
    );
}

function sanitizeFileName(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\.+$/g, "")
    .slice(0, 180) || "document";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanStringArray(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => cleanText(item, maxLength))
    : [];
}

function boundedString(maxLength) {
  return { type: "string", maxLength };
}

function stringArray(maxItems, maxLength) {
  return {
    type: "array",
    maxItems,
    items: boundedString(maxLength)
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    throw httpError(400, "invalid_request_metadata");
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(response, status, body) {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
