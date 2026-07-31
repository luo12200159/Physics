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
      const input = await readJson(request, MAX_JSON_BYTES);
      const result = await solveQuestion(input, requestId);
      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && request.url === "/v1/physics/document-analysis") {
      if (!OPENAI_API_KEY) throw httpError(503, "openai_not_configured");
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
