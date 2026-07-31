# 物理研习室受控 AI 作业队列 v1 Implementation Plan

> **For agentic workers:** Implement task-by-task with red-green-refactor. Track every checkbox and do not describe AI capacity as verified without the deployment plan's production-equivalent evidence.

**Goal:** 将现有 ChatGPT 解题与文档解析从客户端持有共享网关令牌的直连方式，改为账号鉴权、明确确认、独立排队、独立限流的异步作业；AI 故障或积压不得阻塞登录、班级、同步、作答和本地规则解题。

**Architecture:** 客户端只调用业务 API 同源的 `/v1/ai/jobs`。业务 API 校验账号、角色、字段、上传状态、幂等键、限额和用户确认，事务性写入 PostgreSQL `ai_jobs` 与 `job_outbox`；专用 BullMQ 队列和独立 `ai-worker` 调用现有 `physics-ai-gateway.mjs` 的内部地址。OpenAI 密钥只存在于 AI gateway 容器，内部 gateway token 只存在于 AI worker；业务 API、客户端和学习备份均不持有这些秘密。

**Tech Stack:** 既有 TypeScript/Fastify/PostgreSQL/Redis/BullMQ/S3 服务端、现有 Node AI gateway、原生 JavaScript 客户端、WebView2/Android WebView、Node 测试与 Playwright。

## Global Constraints

- Tasks 1–6 依赖 `school-sync-backend-v1` 以及 `cloud-sync-client-v1` Tasks 1–10 的账号、上传、队列、权限与安全会话实现，不等待云同步最终 Compose E2E。Task 7 另依赖部署计划的 `Phase Gate A: 基础设施联调门禁（Tasks 1–4）` 为 `PASS`；Task 7 完成后再由部署计划执行正式容量与发布门禁，禁止互相等待。
- 现有 `server/physics-ai-gateway.mjs` 的路由保持兼容，但正式作业协议使用本计划定义的严格题目与结果 Schema；gateway 只暴露在集群内部 TLS 网络，不再作为正式客户端入口。
- AI 公共状态固定为 `queued | running | succeeded | failed | cancelled | expired`。只有结果已经写入 PostgreSQL 后才能返回 `succeeded`。
- 请求必须包含 `confirmed:true`；提交前客户端展示外发字段。默认离线、未登录、未配置或未确认时不得发送网络请求。
- `solve` 只允许学生、教师、管理员；`documentAnalysis` 只允许教师和管理员。家长不能通过此接口读取或提交学生原始作答。
- 解题 JSON 不超过 128 KiB；`aiDocument` 只接受 verified PDF/DOCX，上传对象最大 30 MiB，不得在 JSON 或同步事件中嵌入 base64 文件。MIME/扩展名不能代替服务端文件头和容器结构检测。
- 初始运营限额是可配置的保护值，不是教育测量标准：学生解题 20 次/小时，教师解题 100 次/小时，教师文档解析 50 次/日；另有跨副本共享的全局请求/分钟（RPM）、令牌/分钟（TPM）、最大执行中数量和上游模型限额。超过个人限额返回 429；全局配额暂时不足保留 queued 并给出可见重试时间；队列槽满返回 503，不自动绕过。
- AI worker 默认集群总并发 20，而不是每副本 20；和普通 worker 使用不同进程、队列名、伸缩指标和资源配额。并发租约、RPM/TPM 预留与队列槽必须跨副本原子化并带 TTL/fencing token；gateway/OpenAI 不可用时只影响 AI 作业。
- 成功后立即清空服务端原始解题输入；文档临时对象在作业终态后 24 小时内删除；结构化结果默认保留 7 天，之后置为 `expired` 并清空结果。客户端应在成功时保存用户需要的结果。
- AI 输出始终标注 `reviewRequired`，并经过确定性的量纲、单位、有限数值、方向、结构化方程残差、显式适用条件和声明型守恒检查；主观建模、图像/OCR 正确性、隐藏假设、实验论证和开放证明不在确定性校验能力范围内，不能因 AI 输出或规则通过自动成为教师已复核证据。
- 所有 OpenAI Responses 上游请求固定 `store:false`、`background:false`，使用 `text.format={type:"json_schema",name,schema,strict:true}`，并携带稳定且保护隐私的 `safety_identifier`。该标识由 AI worker 以独立服务端秘密对 `owner_user_id` 做 HMAC-SHA-256 后 base64url 编码；不得发送原始用户 ID、姓名、学号、班级、设备指纹或客户端自报值。`store:false` 只是不保存可供应用后续检索的 Response 状态，不能消除默认滥用监测保留，也不得据此虚构组织已获 Zero Data Retention；实际数据控制以部署账号的书面配置与 OpenAI 当期政策为准。
- Node 24.15 AI gateway 唯一代理启用方式固定为环境变量 `NODE_USE_ENV_PROXY=1`，与 `HTTPS_PROXY`、`NO_PROXY` 一起由部署注入；不得同时使用 `node --use-env-proxy`、自定义全局 Agent 或代码内直连回退。`NODE_ENV=production` 缺失该变量或值不严格等于字符串 `1` 时必须在监听端口前退出。
- 客户端不得保存或传输 `OPENAI_API_KEY`、`PHYSICS_GATEWAY_TOKEN`、SMTP、数据库或对象存储凭据。

---

## Task 1: 固定 AI 作业协议、迁移和配置边界

**Files:**
- Create: `server/migrations/007_ai_jobs.ts`
- Create: `server/src/modules/ai-jobs/contracts.ts`
- Create: `server/src/modules/uploads/policy.ts`
- Create: `server/tests/unit/ai-job-contracts.test.ts`
- Create: `server/tests/unit/ai-document-policy.test.ts`
- Modify: `server/src/config.ts`
- Modify: `server/.env.business.example`
- Create: `server/.env.ai-worker.example`
- Create: `server/.env.ai-gateway.example`
- Create: `server/.env.ai-gateway.e2e.example`
- Modify: `server/tests/integration/migrations.test.ts`

- [ ] **Step 1: 写严格协议和迁移失败测试**

固定请求与响应：

```ts
type AiJobKind = "solve" | "documentAnalysis";
type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";

type SolveQuestion = {
  schemaVersion: 1;
  stage: "初中" | "高中";
  grade: "八年级" | "九年级" | "高一" | "高二" | "高三";
  questionType: "choice" | "numeric" | "shortAnswer" | "proof" | "experiment" | "modeling";
  stem: string;
  options?: Array<{ id: string; text: string }>;
  diagramDescription?: string;
  knowledgePointIds: string[];
  sourceType: "userOwned" | "licensed" | "publicExam";
  sourceLabel: string;
};

type CreateAiJobRequest =
  | { kind: "solve"; request: { question: SolveQuestion; studentWork: string; hintLevelUsed: 0 | 1 | 2 | 3 | 4 | 5; rightsConfirmed: true }; confirmed: true }
  | { kind: "documentAnalysis"; uploadId: string; request: { stage: "初中" | "高中"; grade: SolveQuestion["grade"]; source: string; rightsConfirmed: true }; confirmed: true };

type CreateAiJobResponse = { jobId: string; status: "queued"; createdAt: string };

type AiJobFailureCode =
  | "upstream_rejected" | "upstream_unavailable" | "upstream_timeout"
  | "response_schema_invalid" | "physics_verification_failed"
  | "document_unreadable" | "document_policy_rejected" | "document_requires_split" | "result_too_large"
  | "attempts_exhausted" | "internal_error";

type VerificationCheckCode =
  | "finiteNumbers" | "dimensions" | "units" | "signDirection"
  | "equationResidual" | "conservation" | "orderOfMagnitude"
  | "limitCase" | "graphEquationConsistency" | "alternateMethod";

type VerificationReportV1 = {
  overall: "pass" | "warning" | "notCheckable";
  checks: Array<{
    code: VerificationCheckCode;
    status: "pass" | "warning" | "notCheckable";
    message: string;
  }>;
};

type SolveQuantityV1 = {
  symbol: string;
  value: number | null;
  expression: string | null;
  unit: string | null;
  direction: string | null;
};

type SolveResultV1 = {
  schemaVersion: 1;
  kind: "solve";
  normalizedQuestion: {
    summary: string;
    researchObject: string;
    knownQuantities: SolveQuantityV1[];
    unknowns: string[];
    processSegments: string[];
    assumptions: string[];
    coordinateSystem: string | null;
  };
  steps: Array<{
    index: number;
    phase: "read" | "model" | "law" | "derive" | "calculate" | "check" | "conclude";
    explanation: string;
    equation: string | null;
    applicableCondition: string | null;
    result: string | null;
  }>;
  finalAnswer: {
    text: string;
    value: number | null;
    unit: string | null;
    direction: string | null;
  };
  verification: VerificationReportV1;
  reviewRequired: true;
};

type SolveModelOutputV1 = Omit<SolveResultV1, "verification" | "reviewRequired">;

type DocumentQuestionCandidateV1 = {
  candidateId: string;
  sourceLocation: { pageNumber: number | null; sectionLabel: string | null };
  questionType: SolveQuestion["questionType"];
  title: string;
  stem: string;
  options: Array<{ id: string; text: string }>;
  diagramDescription: string | null;
  answer: string | null;
  solutionSteps: string[];
  knowledgePointCandidates: Array<{
    knowledgePointId: string | null;
    label: string;
    confidence: number;
  }>;
  uncertainFragments: Array<{
    field: "title" | "stem" | "option" | "diagram" | "answer" | "solution" | "knowledgePoint";
    locator: string;
    observedText: string;
    reason: "ocrLowConfidence" | "formulaAmbiguous" | "diagramMissing" | "sourceIncomplete" | "answerNotFound" | "solutionNotFound" | "knowledgePointUncertain";
  }>;
  reviewStatus: "pending";
};

type DocumentAnalysisResultV1 = {
  schemaVersion: 1;
  kind: "documentAnalysis";
  document: {
    uploadId: string;
    sha256: string;
    mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    sizeBytes: number;
    verifiedAt: string;
    pageCount: number | null;
  };
  segments: {
    processed: number;
    total: number;
    evidence: Array<{
      index: number;
      locator: string;
      sourceSha256: string;
      candidateCount: number;
      outputSha256: string;
    }>;
  };
  questions: DocumentQuestionCandidateV1[];
  warnings: Array<"noQuestionDetected" | "layoutUncertain" | "answerSectionMissing" | "solutionSectionMissing">;
  reviewRequired: true;
};

type DocumentModelQuestionCandidateV1 = Omit<DocumentQuestionCandidateV1, "candidateId" | "reviewStatus">;

type DocumentAnalysisModelOutputV1 = {
  schemaVersion: 1;
  kind: "documentAnalysisSegment";
  segmentLocator: string;
  questions: DocumentModelQuestionCandidateV1[];
  warnings: DocumentAnalysisResultV1["warnings"];
};

type AiJobBase = {
  jobId: string;
  createdAt: string;
  expiresAt: string;
};

type QueuedRetryView = { attempt: number; maxAttempts: number; nextAttemptAt: string | null };
type NonQueuedRetryView = { attempt: number; maxAttempts: number; nextAttemptAt: null };

type AiJobView =
  | (AiJobBase & { kind: "solve"; status: "succeeded"; result: SolveResultV1; failureCode: null; retry: NonQueuedRetryView; startedAt: string; completedAt: string })
  | (AiJobBase & { kind: "documentAnalysis"; status: "succeeded"; result: DocumentAnalysisResultV1; failureCode: null; retry: NonQueuedRetryView; startedAt: string; completedAt: string })
  | (AiJobBase & { kind: AiJobKind; status: "queued"; result: null; failureCode: null; retry: QueuedRetryView; startedAt: string | null; completedAt: null })
  | (AiJobBase & { kind: AiJobKind; status: "running"; result: null; failureCode: null; retry: NonQueuedRetryView; startedAt: string; completedAt: null })
  | (AiJobBase & { kind: AiJobKind; status: "failed"; result: null; failureCode: AiJobFailureCode; retry: NonQueuedRetryView; startedAt: string; completedAt: string })
  | (AiJobBase & { kind: AiJobKind; status: "cancelled"; result: null; failureCode: null; retry: NonQueuedRetryView; startedAt: string | null; completedAt: string })
  | (AiJobBase & { kind: AiJobKind; status: "expired"; result: null; failureCode: AiJobFailureCode | null; retry: NonQueuedRetryView; startedAt: string; completedAt: string });
```

所有对象 `additionalProperties:false`。请求测试固定 stem/studentWork/source/option/知识点数量和字符串长度，拒绝未知字段、空题干、重复选项 ID、不属于八年级至高三的年级、非法题型、`rightsConfirmed!==true`、`confirmed!==true`、家长角色、超限文字、未验证/他人上传和任意 model 名称。模型由服务端固定，客户端不能选模型；`rightsConfirmed` 仅是提交者的明确声明和审计证据，不等同于平台已经完成版权审核。

结果 Schema 还固定以下边界：`SolveResultV1` 的 known/unknown/process/assumption 各最多 20 项，steps 为 1—30 项且 index 从 1 连续递增，verification 每个 code 最多一次；普通说明、条件、结果和检查 message 每项最多 4,000 字符，最终答案最多 8,000 字符；所有 number 必须有限，`SolveQuantityV1` 的 value/expression 至少一个非 null。每个 `DocumentAnalysisModelOutputV1.questions` 最多 25 项，最终 `DocumentAnalysisResultV1.questions` 为 0—100 项；每项 options 最多 20、solutionSteps 最多 30、knowledgePointCandidates 最多 20、uncertainFragments 最多 50；confidence 在 0—1，pageNumber 为 1—300 或 null，候选 ID 在同一结果内唯一。题干最多 60,000 字符、选项 8,000、答案 20,000、每步解析 4,000，且完整规范 JSON result 的 UTF-8 字节数仍不得超过 1 MiB。成功结果要求 `segments.processed===segments.total`、total ≥ 1、evidence 按 index 从 0 连续递增且 locator/source/output hash 唯一对应；零候选时必须含 `noQuestionDetected`。成功 Schema 不提供 `partialExtraction`：任一缺段、截断或不完整上游响应只能失败，不能用 warning 降级。任一不确定字符必须进入 `uncertainFragments`，候选始终为 `reviewStatus:"pending"`，不得直接写正式题库。`SolveModelOutputV1` 与逐段 `DocumentAnalysisModelOutputV1` 只描述模型可生成部分；AI worker 注入确定性 `verification/reviewRequired`、可信 document 元数据和逐段证据，不得信任模型自报的校验结果、uploadId、段完成状态、摘要、MIME、大小或核验时间。

`AiJobView` 以 `kind + status` 判别：只有 succeeded 可携带对应 kind 的非空结果；failed 必须携带固定 failureCode；queued/running/cancelled/expired 的 result 均为 null。expired 保留原 failed 的稳定 failureCode，若由 succeeded 过期则为 null。非 queued 状态的 `retry.nextAttemptAt` 必须为 null；queued 只有确有下一次调度时才非空；attempt 为 0—maxAttempts，maxAttempts 为 1—10。所有 ID、SHA-256、时间、数组唯一性、枚举、条件 nullability 和总字节数均进入共享 TypeBox/JSON Schema 与服务端、客户端契约测试。

- [ ] **Step 2: 运行并确认失败**

```powershell
pnpm --dir server test:unit -- tests/unit/ai-job-contracts.test.ts
pnpm --dir server test:integration -- tests/integration/migrations.test.ts
```

- [ ] **Step 3: 实现第七个可逆迁移**

`ai_jobs` 至少包含：`id, owner_user_id, kind, upload_id, status, request_payload, result_payload, failure_code, last_retry_code, attempt_count, max_attempts, next_attempt_at, locked_by, lock_token, lease_until, heartbeat_at, confirmed_at, created_at, started_at, completed_at, expires_at, cancelled_at`。约束要求 request JSON 文本表示不超过 131072 字节、result 不超过 1 MiB、document job 必须有 upload、solve job 不得有 upload、终态时间字段一致；索引覆盖 owner/status/created、status/next_attempt_at、lease_until、expires。007 新增 `ai_document_segments(job_id, segment_index, locator, source_sha256, primary_start, primary_end, context_start, context_end, status, attempt_count, max_attempts, next_attempt_at, accepted_output, output_sha256, candidate_count, locked_by, lock_token, lease_until, completed_at)` 或等价结构，唯一约束覆盖 `(job_id,segment_index)`、`(job_id,locator)`，每段状态固定 `queued|running|succeeded|failed`；逐段接受结果、重试和聚合均以 job/segment fencing token 条件更新。007 还新增单行 `ai_queue_capacity(name,reserved,max_depth,revision)` 或等价受行锁保护的容量表，使创建 job、预留槽和写 outbox 在同一 PostgreSQL 事务完成；槽从写入 outbox 起覆盖 `outbox + BullMQ waiting/delayed + active`，仅在 cancelled/failed/succeeded/expired 终态事务中释放。007 同时以命名约束替换方式把 `uploads.purpose` 扩展为 `aiDocument`、把 `job_outbox.topic` 扩展为 `runAiJob`；down migration 必须先确认没有 007 数据，再恢复原 006 约束，不能留下无法回滚的隐式修改。

迁移从空库执行、回滚 007、重放 007 均通过；不得修改既有 001—006 的已发布含义。

- [ ] **Step 4: 分离业务与 AI worker 配置**

业务配置只新增 `AI_JOBS_ENABLED=false`, `AI_QUEUE_MAX_DEPTH=2000`, `AI_STUDENT_SOLVE_PER_HOUR=20`, `AI_TEACHER_SOLVE_PER_HOUR=100`, `AI_TEACHER_DOCUMENT_PER_DAY=50`。`server/.env.ai-worker.example` 固定包含 `NODE_ENV, DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_FORCE_PATH_STYLE, AI_GATEWAY_INTERNAL_URL=https://physics-ai-gateway.physics-studio.svc.cluster.local:8787, AI_GATEWAY_SERVICE_TOKEN, AI_GATEWAY_INTERNAL_ORIGIN=https://ai-worker.physics-studio.internal, AI_GATEWAY_CA_FILE, AI_GATEWAY_CLIENT_CERT_FILE, AI_GATEWAY_CLIENT_KEY_FILE, AI_SAFETY_IDENTIFIER_KEY, AI_WORKER_LOCAL_CONCURRENCY=40, AI_CLUSTER_MAX_INFLIGHT=20, AI_GLOBAL_RPM, AI_GLOBAL_TPM, AI_QUOTA_RESERVATION_TTL_SECONDS=120, AI_MAX_ATTEMPTS=4, AI_RESULT_RETENTION_HOURS=168, AI_DOCUMENT_PDF_PRIMARY_PAGES=8, AI_DOCUMENT_PDF_CONTEXT_PAGES=1, AI_DOCUMENT_DOCX_PRIMARY_BLOCKS=200, AI_DOCUMENT_DOCX_CONTEXT_BLOCKS=10, AI_DOCUMENT_SEGMENT_MAX_BYTES=8388608, AI_DOCUMENT_SEGMENT_MAX_CANDIDATES=25`；禁止 `OPENAI_API_KEY`。这些分段值是首版资源保护参数，不是格式或教学标准；修改时必须版本化 locator 规则并重跑边界夹具。`AI_SAFETY_IDENTIFIER_KEY` 必须是独立的至少 32 字节随机秘密，不得复用 JWT、游标、激活或网关 token，也不得进入 gateway、客户端、日志或报告。生产 `server/.env.ai-gateway.example` 固定包含 `NODE_ENV, HOST, PORT, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL=https://api.openai.com/v1, AI_ALLOW_TEST_UPSTREAM=false, PHYSICS_GATEWAY_TOKEN, PHYSICS_ALLOWED_ORIGINS=https://ai-worker.physics-studio.internal, AI_GATEWAY_TLS_CERT_FILE, AI_GATEWAY_TLS_KEY_FILE, AI_GATEWAY_CLIENT_CA_FILE, AI_GATEWAY_REQUIRE_CLIENT_CERT=true, NODE_USE_ENV_PROXY=1, HTTPS_PROXY, NO_PROXY, AI_SOLVE_MAX_OUTPUT_TOKENS=6000, AI_DOCUMENT_SEGMENT_MAX_OUTPUT_TOKENS=12000`，明确不得包含 `NODE_EXTRA_CA_CERTS` 或测试 CA 路径。`NO_PROXY` 只含内部健康/服务地址，`HTTPS_PROXY` 指向批准的受控出口代理。`NODE_ENV=production` 的 gateway 必须把 `OPENAI_BASE_URL` 规范化为精确 `https://api.openai.com/v1`，并要求 `NODE_USE_ENV_PROXY` 严格等于字符串 `1`、`HTTPS_PROXY` 为批准的受控代理地址；缺失、其他值、出现其他 OpenAI origin、userinfo、查询、片段、明文 URL、`AI_ALLOW_TEST_UPSTREAM=true`、存在 `NODE_EXTRA_CA_CERTS` 或保留测试 CA 挂载路径时启动失败。只有隔离环境中 `NODE_ENV=test|e2e` 且显式 `AI_ALLOW_TEST_UPSTREAM=true` 时才允许由 `server/.env.ai-gateway.e2e.example` 额外注入 `NODE_EXTRA_CA_CERTS=/run/physics-studio/test-upstream-ca/ca.pem`；该文件只读挂载独立上游桩 CA，不能复用业务入口 CA 或 worker↔gateway mTLS CA。外层 `EnvironmentLabel=production-like` 仍用于禁止脚本接触生产资源，不等同于放宽生产进程配置。gateway 在监听前校验测试 CA 指纹等于本次运行清单、固定路径存在且没有额外证书；该变量、测试 CA 和测试开关不能进入客户端、业务 API、worker 或正式镜像。内部 URL/Origin 必须完全匹配，不能使用 `*`、浏览器 origin 或客户端可改值；OpenAI 密钥只属于 gateway 自身部署。

- [ ] **Step 5: 固定 `aiDocument` 上传检测策略**

`aiDocument` 单对象硬上限为 `30 * 1024 * 1024` 字节，客户端声明的扩展名/MIME 只作提示。首版操作性硬上限固定为 PDF 300 页；PDF 必须以 `%PDF-` 开头、结构可解析、未加密，并拒绝 JavaScript、Launch action、嵌入文件和超限页数。DOCX 必须是 ZIP 文件头且包含 `[Content_Types].xml` 与 `word/document.xml`，拒绝 `vbaProject.bin`、OLE/嵌入包、外部 relationship、路径穿越、加密文档、超过 10,000 个条目、解压后总量超过 200 MiB 或压缩比超过 100:1。检测在隔离进程中有 CPU/内存/页数/解压比限制；失败对象保持 quarantined，不能创建 AI job。保存的 SHA-256、检测 MIME、大小、verifiedAt 和 upload owner 必须与 job 创建事务重新核对。这些是防资源耗尽的首版产品阈值，不是文件格式标准；调整必须同步版本化策略与边界测试。

- [ ] **Step 6: 运行测试并提交**

```powershell
pnpm --dir server typecheck
pnpm --dir server test:unit -- tests/unit/ai-job-contracts.test.ts tests/unit/ai-document-policy.test.ts
pnpm --dir server test:integration -- tests/integration/migrations.test.ts
```

---

## Task 2: 实现创建、查询、取消、限流和权限隔离

**Files:**
- Create: `server/src/modules/ai-jobs/repository.ts`
- Create: `server/src/modules/ai-jobs/service.ts`
- Create: `server/src/modules/ai-jobs/quota.ts`
- Create: `server/src/modules/ai-jobs/routes.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/modules/jobs/repository.ts`
- Test: `server/tests/integration/ai-jobs.test.ts`
- Test: `server/tests/integration/ai-quota.test.ts`

- [ ] **Step 1: 写所有权、幂等和队列上限失败测试**

覆盖：相同 `Idempotency-Key`/相同正文返回原 job；同 key 不同正文返回 409；另一用户查询 404；家长 403；队列满 503；学生文档解析 403；未验证或非本人 upload 409；取消 queued 成功，同一取消 `Idempotency-Key` 重放返回首次 200 响应且不重复释放队列槽，同 key 用于不同 job 返回 409；另一个新 key 取消已经 cancelled 的同一 job 返回当前 cancelled 状态且不产生新副作用；running/succeeded 不能伪装为已取消。另以至少 8 个并发 API 实例同时创建作业，验证队列槽预留不超过 2000、没有负数/泄漏；个人限额与全局 RPM/TPM 预留由 Redis Lua 原子执行，过期预留可回收，重复 idempotency key 不二次扣额。

- [ ] **Step 2: 运行并确认失败**

```powershell
pnpm --dir server test:integration -- tests/integration/ai-jobs.test.ts
```

- [ ] **Step 3: 实现固定路由**

- `POST /v1/ai/jobs`：严格接收 `CreateAiJobRequest`，要求 Bearer 与 16—128 字符 `Idempotency-Key`，返回 202 `CreateAiJobResponse`。
- `GET /v1/ai/jobs/:id`：仅 owner/administrator，返回严格 `AiJobView`；非 owner 返回 404，避免泄露存在性。
- `POST /v1/ai/jobs/:id/cancel`：要求 Bearer 与 16—128 字符稳定 `Idempotency-Key`；只取消 owner 的 queued job并返回 `{jobId,status:"cancelled"}`，running 返回 409 `ai_job_already_running`，非 owner 返回 404。幂等记录以 `actor + route + jobId + requestHash` 为作用域，与状态变更、队列槽释放和审计写入同一 PostgreSQL 事务提交；同 key/同 job 重放首次响应，同 key/不同 job 或不同请求摘要返回 409 `idempotency_key_reused`，不同 key 请求已 cancelled job 返回 200 当前状态且不得再次释放槽位。

同一 PostgreSQL 事务锁定 `ai_queue_capacity`、以 `reserved < max_depth` 条件原子增加槽位，并写 `ai_jobs` 与 `job_outbox(topic='runAiJob')`；不得以分别读取 Redis、BullMQ waiting/delayed/active 数量后再判断的竞态方式限深。该槽从 outbox 尚未派发时就计入，覆盖 outbox、waiting、delayed、active 全生命周期，终态事务只释放一次；定期对账任务从非终态 jobs 重算并对异常报警，不静默改写历史。

个人次数限制和集群级 RPM/TPM 使用 Redis Lua 原子预留：请求创建先扣个人次数，执行前 worker 以服务端 tokenizer 的保守估算预留 RPM/TPM，成功后按上游实际 usage 对账，失败/过期按固定规则返还尚未消费的 TPM。跨副本最大 inflight 使用带 TTL、随机 lease ID 和 fencing token 的 Redis semaphore，`AI_CLUSTER_MAX_INFLIGHT=20` 是整个集群上限而非每 worker 副本上限。Redis 不可用时 AI 创建/执行失败关闭或保留 queued，但普通业务不受影响。审计只记录 kind、状态、actor、jobId、确认时间、限额类别和稳定错误码，不记录题干、作答或文件内容。

- [ ] **Step 4: 验证并提交**

```powershell
pnpm --dir server test:integration -- tests/integration/ai-jobs.test.ts tests/integration/ai-quota.test.ts
pnpm --dir server test:integration -- tests/integration/security.test.ts
```

---

## Task 3: 建立独立 BullMQ AI worker 和内部 gateway 适配器

**Files:**
- Create: `server/src/infrastructure/ai-gateway.ts`
- Create: `server/src/modules/physics-verification/contracts.ts`
- Create: `server/src/modules/physics-verification/verify.ts`
- Create: `server/src/modules/ai-jobs/document-segmentation.ts`
- Create: `server/src/modules/ai-jobs/document-aggregation.ts`
- Create: `server/src/workers/ai-job-worker.ts`
- Create: `server/src/ai-worker-main.ts`
- Modify: `server/physics-ai-gateway.mjs`
- Modify: `server/src/infrastructure/queues.ts`
- Modify: `server/src/modules/jobs/dispatcher.ts`
- Modify: `server/package.json`
- Create: `server/tests/fixtures/openai-responses-stub.mjs`
- Test: `server/tests/integration/ai-worker.test.ts`
- Test: `server/tests/unit/ai-gateway-config.test.ts`
- Test: `server/tests/unit/ai-gateway-upstream-contract.test.ts`
- Test: `server/tests/unit/ai-document-segmentation.test.ts`
- Test: `server/tests/unit/ai-document-aggregation.test.ts`
- Test: `server/tests/unit/physics-verification.test.ts`

- [ ] **Step 1: 写并发、重试和真状态失败测试**

使用本地假 gateway，覆盖 queued→running→succeeded；429/502/503/504 与网络超时进入 queued retry 状态后最终 succeeded；永久 4xx 直接 failed；超过最大重试次数才 failed；重复投递只有一个结果；取消 race；worker 崩溃后 lease 到期由另一副本接管；旧 worker 的 fencing token 不能覆盖新 owner；集群总并发 20、RPM/TPM 原子预留；业务队列在 AI gateway 卡住时仍可处理反馈 job。文档夹具覆盖 PDF 1/8/9/300 页、跨页题目、单页超过 8 MiB、DOCX 段落/表格/分页符/节、超过 200 blocks、单个不可拆表格超限、重复上下文候选、段中途超时和 worker 接管；断言每个原始页或顶层 block 恰好属于一个 primary range、locator 和顺序稳定、context 只重叠不漏主范围、相同段重试只接受一个输出。配置测试还必须覆盖：gateway 缺证书/私钥/客户端 CA 时拒绝启动，worker 不信任 CA 或缺客户端证书时握手失败；`NODE_ENV=production` 缺失 `NODE_USE_ENV_PROXY`、值不是字符串 `1`、缺少批准的 `HTTPS_PROXY`、使用非官方 `OPENAI_BASE_URL`、打开测试开关、出现 `NODE_EXTRA_CA_CERTS` 或保留测试 CA 固定挂载路径时均在监听前失败；仅隔离的 test/e2e 进程加显式开关且测试 CA 指纹匹配本次运行清单时可使用 HTTPS 本地确定性桩。任何环境均拒绝 HTTP、userinfo、重定向到新 origin 和客户端传入上游 URL。静态测试还拒绝 `node --use-env-proxy`、自定义全局 Agent 和捕获代理错误后再无代理重试的代码路径。上游请求契约测试必须断言 `store:false`、`background:false`、完整 `text.format={type:"json_schema",name,schema,strict:true}`、kind 对应的固定 `max_output_tokens` 和 43 字符 base64url `safety_identifier` 始终存在；solve 的 name 固定 `physics_solve_model_output_v1` 并使用展开后的 `SolveModelOutputV1` Schema，documentAnalysis 的 name 固定 `physics_document_candidates_v1` 并使用展开后的逐段 `DocumentAnalysisModelOutputV1` Schema。同一 owner 稳定得到同一标识，不同 owner 得到不同标识，请求、日志和测试快照均不出现原始用户 ID、姓名、学号、班级或设备标识。

- [ ] **Step 2: 运行并确认失败**

```powershell
pnpm --dir server test:integration -- tests/integration/ai-worker.test.ts
```

- [ ] **Step 3: 实现内部调用边界**

`job_outbox.topic='runAiJob'` 唯一映射到 BullMQ queue `physics-ai-v1`、job name `run-ai-job`、确定性 BullMQ job ID `ai:<aiJobId>`，payload 只含 `{aiJobId}`；未知 topic 不得投递到 AI 队列。dispatcher 只有在 BullMQ 确认相同 job ID 已存在或新增成功后才把 outbox 标为 dispatched，重跑不会创建第二个执行实体。

`server/package.json` 明确定义 `"start:ai-worker": "node dist/ai-worker-main.js"`，容器和 Kubernetes 只能调用该脚本启动 AI worker，不能复用普通 `start:worker`。`ai-worker-main.ts` 只消费 `physics-ai-v1` 队列，本地 BullMQ concurrency 可以大于 20 以便等待租约，但真正调用 gateway 前必须取得集群 semaphore、RPM 与 TPM 预留；集群默认 active 上限为 20。内部请求固定携带 `X-Physics-Gateway-Token` 与精确 `Origin: https://ai-worker.physics-studio.internal`；URL 只允许配置的内部 HTTPS 地址，不跟随重定向，不接受客户端 URL。worker 使用 `AI_GATEWAY_CA_FILE` 校验 gateway DNS SAN，并提供 `AI_GATEWAY_CLIENT_CERT_FILE/KEY_FILE`；`physics-ai-gateway.mjs` 使用 Node HTTPS server 直接加载服务端证书/私钥，以 `AI_GATEWAY_CLIENT_CA_FILE` 和 `requestCert/rejectUnauthorized` 强制客户端证书，再校验服务 token。不得监听可由其他容器访问的并行明文端口，不得设置 `rejectUnauthorized=false`。证书由部署计划 Phase Gate A 的测试 PKI或正式秘密管理系统只读挂载并按滚动重启轮换。gateway 对该内部 mTLS/服务 token 路径禁用原有按来源 IP 的单进程客户端限流，避免多个 worker 经同一出口 IP 互相挤占；安全边界改由 Redis 原子用户/RPM/TPM/并发配额和 gateway token 共同承担，公网/旧直连路径仍关闭或保留独立开发限流。solve 调用现有 `/v1/physics/solve`；document worker 从已验证对象存储读取最大 30 MiB 有界流，构造 multipart 调用 `/v1/physics/document-analysis`，gateway 再次执行大小和文件类型防御检查。

document worker 在任何模型调用前完成确定性分段并一次性写入全部 `ai_document_segments`：PDF 以原始页序为主轴，初始每段 8 个连续 primary pages，并带前后各最多 1 页只读 context；使用固定版本 PDF 子集序列化器复制页面及其可达资源，清除易变 metadata，以规范字节计算 `source_sha256`。若 primary 子集超过 8 MiB，按页数中点递归二分；单页仍超限、页面资源无法封闭复制或页映射不唯一时以 `document_requires_split` 失败。DOCX 只按 `word/document.xml` 顶层 paragraph/table 顺序编号，初始每段 200 个连续 primary blocks，并带前后各最多 10 blocks context；表格和单个顶层 block 不拆分，同时复制确定性排序的 styles/numbering、显式内部 relationships 和被引用媒体。若 primary 子集超过 8 MiB则按 block 中点递归二分；单个原子 block、关系图或必要资源仍超限，或无法把内容安全映射回原始 block 时以 `document_requires_split` 失败。每一原始页/block 必须恰好出现在一个 primary range，context 不计入覆盖；不得按 OCR/模型输出决定边界。

segment 顺序固定为 primaryStart 升序，index 从 0 连续递增；locator 固定为 `pdf:<documentSha256>:pages:<start>-<end>:v1` 或 `docx:<documentSha256>:blocks:<start>-<end>:v1`，不使用临时文件名、时间或模型内容。每次逐段调用只发送一个规范子文档和 locator，内部执行键固定为 `ai-doc-segment:<jobId>:<index>:<sourceSha256>`；失败只重试该段。重复投递、超时后迟到响应和 lease 接管通过 segment fencing token 只允许首个有效响应落库，已经 succeeded 的段不再调用或重复计入配额/聚合。逐段 accepted output 保存规范 JSON hash、候选数和 attempt 证据；不得把任一中间候选暴露为公共 `result`。

AI worker 在服务端以内存中的 `owner_user_id` 计算 `base64url(HMAC-SHA-256(AI_SAFETY_IDENTIFIER_KEY, owner_user_id))`，只把结果字段 `safetyIdentifier` 发送给内部 gateway；数据库、客户端和同步事件不保存该派生值。gateway 严格要求 `^[A-Za-z0-9_-]{43}$`，将它映射为 OpenAI Responses 请求的 `safety_identifier`。gateway 构造的上游对象至少固定为 `{model:serverConfiguredModel,input:serverBuiltInput,max_output_tokens:kindLimit,store:false,background:false,safety_identifier,text:{format:{type:"json_schema",name,schema,strict:true}}}`；solve 的 kindLimit 固定读取 `AI_SOLVE_MAX_OUTPUT_TOKENS=6000`，每个 document segment 固定读取 `AI_DOCUMENT_SEGMENT_MAX_OUTPUT_TOKENS=12000`，正整数范围和上限由配置测试锁定，客户端不能提高。name/schema 按 job kind 选择前述两个固定版本，运行时 Schema 与 Task 1 的源定义生成并以快照哈希校验，不能手抄漂移。客户端、业务 API 或 worker 传入的 model、`max_output_tokens`、`store`、`background`、name/schema/strict、自由格式输出配置、原始用户字段或自报 safety 标识均必须拒绝或忽略，不能覆盖 gateway 固定策略。

documentAnalysis 构造的每个 Responses 文件内容项必须深度等值于 `{type:"input_file",filename,file_data}`，键集合也必须精确等于这三个字段；`filename` 来自服务端已验证上传元数据，`file_data` 由同一已验证对象的有界字节生成，客户端不得覆盖。`input_file` 明确禁止 `detail` 以及 `file_id`、`file_url`、MIME、uploadId 等任何未知字段；`detail` 仅允许出现在 `input_image` 内容项。`ai-gateway-upstream-contract.test.ts` 对完整 documentAnalysis 上游 request 使用深度等值断言，并逐一注入 `detail` 和未知字段确认严格构造器/校验器拒绝，不能只比较字段是否存在。

每段上游响应只有在 Responses `status === "completed"`、`incomplete_details === null`、严格逐段 Schema 通过、返回的 segmentLocator 与请求精确相同且候选数小于 25 时才可接受。`status:"incomplete"`、非空 `incomplete_details`、因 `max_output_tokens` 截止、候选数恰好达到 25 或任何截断迹象均立即把整个 document job 置为 failed/`document_requires_split`，不得把该段当作可重试成功或静默截断。所有段成功后，worker 在单事务中按 segment index 聚合：把候选 source location 规范化回原文 locator，以 `SHA-256(canonical(questionType,normalized source location,title,stem,options))` 识别 context 重复；同 fingerprint 只保留 primary range 拥有者，若没有唯一 primary owner 则保留最早 segment 并添加 `layoutUncertain`，不得拼接两个模型答案。candidateId 由 worker 基于 fingerprint 生成，忽略模型 ID。聚合后候选超过 100，或加入 document/segments/reviewRequired 后的规范 JSON UTF-8 大于 1 MiB，整个 job 分别稳定失败为 `result_too_large`，result 必须为 null。只有全部段 succeeded、`processed===total`、候选少于等于 100且规范 JSON 小于等于 1 MiB 时才能原子写入公共 succeeded 结果。

gateway 上游客户端默认只访问精确 `https://api.openai.com/v1`，Node 24.15 进程仅以 `NODE_USE_ENV_PROXY=1` 启用环境代理，所有请求必须经过 `HTTPS_PROXY` 并遵守受控 `NO_PROXY`；不跟随跨 origin 重定向，不实现无代理重试。仅 `NODE_ENV=test|e2e`、`AI_ALLOW_TEST_UPSTREAM=true` 且上游桩 CA 指纹与本次 PKI 清单一致时读取测试 `OPENAI_BASE_URL` 和 `NODE_EXTRA_CA_CERTS=/run/physics-studio/test-upstream-ca/ca.pem`，并仍要求 HTTPS、受控代理白名单且桩地址不在 `NO_PROXY`。该 CA 只扩展 gateway→stub 的进程信任，不进入系统信任库。production 在监听前检查环境变量和固定保留挂载路径；发现非官方地址、代理开关缺失/非 `1`、代理地址缺失、测试开关、`NODE_EXTRA_CA_CERTS`、测试 CA 文件或指纹时必须退出，不能回退到直连或静默忽略。真实代理测试使用新启动且无复用上游连接的 gateway 实例串行发送一个固定请求，断言出口代理新增且仅新增一条来自该实例、指向桩主机的 CONNECT/连接审计，桩请求计数同时增加一；HTTPS 隧道不要求代理读取或注入 TLS 内的应用请求头。停止代理后新请求必须进入稳定可重试失败，桩计数不增加，网络流量审计不得出现 gateway 直连。

每个 job 以数据库条件更新取得执行权并写入 `locked_by, lock_token, lease_until, heartbeat_at`；续租和终态更新均要求 owner 与 fencing token 同时匹配。worker 退出时只释放自己持有的 Redis 配额租约，不能清除其他副本租约。solve 只有结果通过严格结果 Schema、1 MiB 大小、`reviewRequired:true` 和确定性物理校验后才能标记 succeeded；documentAnalysis 另必须满足前述全部分段和聚合门禁。任何 document 永久段失败都以 result null 终止整个 job，不存在部分 succeeded。

结果 Schema 固定为版本、题目规范化摘要、分步推理、结构化物理量（数值/符号/单位/方向）、方程及适用条件、最终答案和 `verification`。`physics-verification/verify.ts` 是不调用模型/网络的纯模块，确定性检查：数值有限性、单位可换算性、声明量纲一致、代入后的方程残差、明确坐标系下的符号/方向、显式声明封闭系统后的能量/动量/电荷守恒、结果数量级边界。若输入缺少结构化量或模型前提则返回 `notCheckable`/`warning`，不能猜测；它不能证明 OCR/图像识别正确、隐藏假设完备、受力图正确、开放证明成立或实验论证充分。任何 `warning/notCheckable` 均保留 `reviewRequired:true`，规则 `pass` 也不等于教师复核。

临时上游失败把数据库从 running 原子改回 queued，增加 `attempt_count`，写稳定 `last_retry_code` 与带 full jitter 的 `next_attempt_at`（基线 2/4/8/16 分钟且尊重上游 `Retry-After` 上限）；此时公开 `failureCode` 仍为 null，`AiJobView.retry` 显示次数和下次时间。永久 4xx 或达到 `AI_MAX_ATTEMPTS` 才进入 failed 并释放队列槽。上游错误只保存稳定 failure code，不保存 OpenAI 响应原文、堆栈或密钥。业务 API/普通 worker 环境中断言不存在 gateway token。

- [ ] **Step 4: 验证隔离**

```powershell
pnpm --dir server test:integration -- tests/integration/ai-worker.test.ts
pnpm --dir server test:unit -- tests/unit/physics-verification.test.ts tests/unit/ai-gateway-config.test.ts tests/unit/ai-gateway-upstream-contract.test.ts tests/unit/ai-document-segmentation.test.ts tests/unit/ai-document-aggregation.test.ts
pnpm --dir server test:integration -- tests/integration/jobs.test.ts
```

---

## Task 4: 实现结果保留、上传清理、指标与故障恢复

**Files:**
- Create: `server/src/workers/ai-retention-worker.ts`
- Modify: `server/src/infrastructure/metrics.ts`
- Modify: `server/src/worker-main.ts`
- Test: `server/tests/integration/ai-retention.test.ts`

- [ ] **Step 1: 写保留期失败测试**

断言 succeeded/failed 后 `request_payload` 被清空；文档 upload 在终态 24 小时后删除对象并标记 deleted；7 天后清空 result、状态变 expired，原 failed 的稳定 failureCode 保留、原 succeeded 的 failureCode 仍为 null；queued/running/retry-waiting 不被提前删除；每个终态只释放一次队列槽和配额租约；过期 worker lease 可恢复但活跃 owner 不被抢占；删除/对账 job 重跑幂等。

- [ ] **Step 2: 实现独立清理任务和低基数指标**

每小时批量 100 条、`FOR UPDATE SKIP LOCKED` 清理。另以受控周期任务核对 `ai_queue_capacity.reserved` 与全部非终态 AI job 数量；不一致先告警并保存前后证据，再在单事务中修复，禁止静默改数。指标只按 `kind/status/retryReasonClass` 统计创建量、完成量、失败量、重试量、排队时长、执行时长、队列深度、集群 inflight、RPM/TPM 预留与最老年龄；禁止 user/class/question/job ID 标签。AI 队列深度、最老任务 5 分钟、配额长期耗尽、lease 异常和连续上游失败有独立告警，不能把业务 API readiness 置为 down。

- [ ] **Step 3: 验证**

```powershell
pnpm --dir server test:integration -- tests/integration/ai-retention.test.ts
pnpm --dir server test:integration -- tests/integration/health.test.ts
```

---

## Task 5: 客户端改用同源认证 AI 作业并保留离线回退

**Files:**
- Create: `ai-cloud.js`
- Modify: `ai-tutor.js`
- Modify: `learning-lab.js`
- Modify: `document-import.js`
- Modify: `index.html`
- Create: `tools/qa_ai_cloud.cjs`
- Create: `tools/qa_ai_cloud_ui.cjs`

- [ ] **Step 1: 写零请求、确认、轮询和隐私失败测试**

覆盖：未登录/未配置/离线/未确认或 `rightsConfirmed!==true` 时 fetch 次数为 0；确认预览逐项显示题干、学生作答、来源声明或文档名称/大小/检测类型，但不含学生名、班级、设备 ID、refresh token；202 后按 1/2/4/8 秒最多 15 秒间隔轮询；queued retry 显示次数与下次重试时间，不误报 failed；failed/cancelled/expired 文案准确；`document_requires_split` 与 `result_too_large` 分别显示明确拆分 PDF/DOCX 提示且部分候选始终不可见；页面关闭后可凭 jobId 恢复；结果只在 succeeded 且 `segments.processed===segments.total` 后进入本地导入审核页；所有文档候选与主观解题结果、确定性校验 pass 均保持待教师复核。

- [ ] **Step 2: 实现固定客户端接口**

```js
PhysicsStudioAiCloud.configure({ api, uploads, clock, online });
PhysicsStudioAiCloud.submitSolve(input, { confirmed: true });
PhysicsStudioAiCloud.submitDocument(input, file, { confirmed: true });
PhysicsStudioAiCloud.resume(jobId);
PhysicsStudioAiCloud.cancel(jobId);
PhysicsStudioAiCloud.subscribe(listener);
```

`ai-cloud.js` 复用 `PhysicsStudioCloudApi` 的 Bearer 会话和业务 API base URL。解题与文档都必须构造 Task 1 的严格 Schema，并在最终确认页收集 `rightsConfirmed:true`；不得由历史勾选默认确认。文档只接受 PDF/DOCX，客户端先做 30 MiB 和基础文件头预检以便尽早提示，再以 `purpose=aiDocument` 走 verified upload；客户端预检不替代服务端隔离检测，只有服务端状态 verified 才创建 AI job。只在本地保存 jobId/kind/status/createdAt，不把题干、答案或结果写入云同步 outbox；成功结果由现有学习/导入流程在用户确认后保存。`document_requires_split` 明确提示“文档无法安全完整处理，请按章节或较小页段拆分 PDF/DOCX 后重新上传”；`result_too_large` 提示“识别候选或解析内容超过单次结果上限，请拆分文档”，不得展示部分候选、伪装为成功或自动丢弃尾部。

- [ ] **Step 3: 收紧旧直连入口**

正式模式删除客户端共享 token 输入与 sessionStorage token；`ai-tutor.js` 默认委托 `ai-cloud.js`。仅开发模式允许显式 loopback `http://localhost|127.0.0.1` 直连现有 gateway，入口放入“高级工具”并标注不属于云班级能力；任意远程 HTTPS gateway 不能绕过账号 API。

- [ ] **Step 4: 运行客户端测试**

```powershell
& $node tools\qa_ai_cloud.cjs
& $node tools\qa_ai_cloud_ui.cjs
& $node tools\qa_learning_engine.cjs
```

---

## Task 6: 收紧 CSP 并把 AI 客户端纳入双端包

**Files:**
- Modify: `index.html`
- Modify: `Launcher.cs`
- Modify: `Installer.cs`
- Modify: `tools/build_release.ps1`
- Modify: `android/tools/build_android.ps1`
- Create: `tools/qa_release_csp.cjs`
- Modify: `tools/qa_android_bridge.cjs`

- [ ] **Step 1: 写 CSP 和资产失败测试**

源文件 `connect-src` 只允许 `'self'` 与开发 loopback，不允许裸 `https:`、`*`、`data:` 或 `blob:`。联网构建在 staging 中加入唯一 `CloudApiBaseUrl` origin；Windows/Android 产物均包含 `ai-cloud.js`，且打包后不含 gateway/OpenAI token。

- [ ] **Step 2: 实现 staging CSP**

两个构建脚本接受同一 `-CloudApiBaseUrl`；验证 HTTPS 后把 origin 写入 staging 的 `connect-src` 和 `cloud-config.js`。不修改工作区 `index.html/cloud-config.js`。若配置 URL 带路径，CSP 只写 origin，API 配置保留规范化 base path。脚本依赖顺序固定为 `cloud-config.js → security.js → secure-session.js → cloud-api.js → ai-cloud.js → ai-tutor.js → document-import.js`；其余题库、学习和教师脚本继续遵守云客户端计划的总顺序。外部页面仍只交系统浏览器，不进入 WebView。Windows/Android 临时联网 E2E 包只连接业务 API，最多只信任该次业务入口测试 CA，因此无需且禁止打包、安装或信任 gateway→stub 的独立上游桩 CA；正式双端包不得包含或信任业务入口、内部 mTLS、上游桩中的任何测试 CA，也不得包含其指纹、`NODE_EXTRA_CA_CERTS` 或测试桩地址。

- [ ] **Step 3: 构建验证**

```powershell
& $node tools\qa_release_csp.cjs
powershell -ExecutionPolicy Bypass -File tools\build_release.ps1 -Version 2.6.0 -ReleaseDirectory .build\windows-ai-test
powershell -ExecutionPolicy Bypass -File android\tools\build_android.ps1 -VersionName 2.6.0 -VersionCode 20600
& $node tools\qa_android_bridge.cjs index.html qa-output\android-bridge-v26
```

离线测试包允许空 API URL；联网正式包由部署发布计划提供 HTTPS URL。

---

## Task 7: 完成服务端与双端端到端验收

**Prerequisite:** 部署计划 `Phase Gate A: 基础设施联调门禁（Tasks 1–4）` 已实际记录为 `PASS`；否则本 Task 保持 `NOT_RUN`，不能用本地假 gateway 或明文网络绕过。

**Files:**
- Create: `tools/qa_ai_jobs_e2e.cjs`
- Create: `tools/run_ai_jobs_compose_e2e.ps1`
- Modify: `server/tests/fixtures/openai-responses-stub.mjs`
- Create: `docs/capacity/ai-provider-smoke.md`
- Modify: `README.md`
- Modify: `android/README.md`
- Modify: `server/README.md`

- [ ] **Step 1: 运行完整端到端场景**

标准 E2E 必须复用 Phase Gate A 的真实业务 API、PostgreSQL、Redis、BullMQ dispatcher、AI worker、S3、内部双向 TLS AI gateway 和受控出口代理；只把最外层 OpenAI Responses 上游替换为本地确定性协议桩，不能把业务 API、队列、worker、gateway、对象存储或数据库替换为内存 fake。运行器在 `EnvironmentLabel=production-like` 的隔离资源中为 gateway 进程设置 `NODE_ENV=e2e`、`NODE_USE_ENV_PROXY=1`、`AI_ALLOW_TEST_UPSTREAM=true`、受控 `HTTPS_PROXY/NO_PROXY`、测试桩的 HTTPS `OPENAI_BASE_URL` 和只读 `NODE_EXTRA_CA_CERTS=/run/physics-studio/test-upstream-ca/ca.pem`；测试桩地址不得进入 `NO_PROXY`，并把其 DNS/SNI 精确加入本次隔离出口代理白名单。上游桩 CA 必须是本次 PKI 清单中独立于业务入口和内部 mTLS 的根，gateway 启动时核对指纹；以同一镜像切换为 `NODE_ENV=production` 后，环境变量、固定挂载路径或测试 CA 任一存在都必须在监听前失败。桩实现固定 Responses 协议、usage 与错误序列，gateway 仍实际完成请求构造、环境代理、TLS 和响应 Schema 校验；桩必须逐请求深度等值断言 `max_output_tokens`、`store:false`、`background:false`、与 kind 匹配的固定 name、完整 schema、`strict:true` 和合法 `safety_identifier`。对 documentAnalysis，桩还必须断言文件项键集合和深度值精确为 `{type:"input_file",filename,file_data}`，出现 `detail` 或任何未知字段立即返回测试失败；`detail` 只接受于 `input_image`。桩按夹具脚本返回：正常段、重复响应、临时失败后成功、`status:"incomplete"`/`incomplete_details`、达到 25 个候选和超大候选；E2E 断言逐段 locator/顺序、只重试失败段、重复段只聚合一次、processed/total 证据和候选去重稳定。任何段 incomplete、候选恰达 25、无法安全分段必须使整个 job 以 `document_requires_split`/result null 失败；聚合候选 >100 或规范 JSON >1 MiB 必须以 `result_too_large`/result null 失败；客户端出现拆分文档提示，绝不显示部分候选。代理路径证明使用新启动且不复用上游连接的 gateway 实例串行发出一个固定请求：出口代理必须新增且仅新增一条来自该实例、指向桩主机的 CONNECT/连接审计，桩请求计数同时增加一；不要求隧道代理读取或注入 TLS 内部请求头。随后停止 `egress-proxy` 再提交固定请求，必须得到稳定可重试失败、桩请求计数不增加、网络审计没有 gateway→stub/OpenAI 直连，恢复代理后原 job 才能重试成功。测试还断言正文、请求头与日志中没有原始用户 ID、姓名、学号、班级或设备标识；临时 Windows/Android 客户端包及正式产物扫描均不得包含或信任上游桩 CA。其余场景：学生登录→确认严格题目与 rights 字段→queued→running→succeeded→确定性物理校验→结果本地保存；教师 verified PDF/DOCX→documentAnalysis→worker 注入可信文件元数据且所有候选题保持待审核；错 kind/result、未知字段、超限数组、非有限数值和错误 Schema 哈希不能进入 succeeded；恶意文件头/宏 DOCX/主动 PDF 被拒；另一账号无法读取 job；AI gateway 短时断开时 job 回到 queued 并显示 attempt/nextAttemptAt，超过重试上限后才 failed，且本地学习、同步和反馈始终照常；重复提交不重复扣额/执行；取消接口稳定幂等键重放不重复释放槽位；达到个人限额返回 429；全局 RPM/TPM 不超配；8 个并发 API/worker 副本下队列槽与集群 active 不超上限；worker lease 接管时旧 owner 不能写终态；队列满返回 503；`runAiJob → physics-ai-v1/run-ai-job` 映射无遗漏和重复。

```powershell
pnpm --dir server typecheck
pnpm --dir server test:unit
pnpm --dir server test:integration
& $node tools\qa_ai_cloud.cjs
& $node tools\qa_ai_cloud_ui.cjs
powershell -ExecutionPolicy Bypass -File tools\run_ai_jobs_compose_e2e.ps1 -EnvironmentLabel production-like -UpstreamMode deterministic-stub
& $node tools\qa_ai_jobs_e2e.cjs .build\ai-jobs-e2e\result.json
```

另设显式 opt-in 的生产等价 provider smoke：只发送仓库内固定、无个人信息、无版权正文的合成物理题，验证真实 DNS/TLS、受控出口代理、OpenAI 鉴权、RPM/TPM usage 对账和单作业返回。该 smoke 需要独立环境凭据与操作者确认，默认 `NOT_RUN`，不得在普通 CI 中访问 OpenAI；其 PASS 只证明所列时间和模型的单请求链路，不构成 AI 并发或教学正确率声明。

- [ ] **Step 2: 更新事实边界**

README 明确区分：离线规则解题、登录后的排队 AI 解题、教师文档解析、人工复核；说明外发字段、保留期、取消与失败状态。不得写“5000 人可同时使用 AI”；AI 容量只引用单独实测的队列/上游配额报告。

## Completion Criteria

- 客户端不再持有生产 gateway token，OpenAI 密钥只在独立 gateway。
- AI 创建需要账号、角色、幂等键、明确确认、共享限流和队列深度保护。
- 创建与取消接口都使用稳定 `Idempotency-Key`；取消重放、冲突和队列槽单次释放由同一事务合同约束。
- `aiDocument` 的 30 MiB、文件头/容器结构、隔离检测、所有权和清理策略有服务端证据；客户端 MIME/扩展名不作为信任依据。
- PDF/DOCX 使用版本化确定性分段、逐段 fencing/retry 和全段聚合；只有 processed/total 完整、候选 ≤100且规范 JSON ≤1 MiB 才 succeeded，任何截断或上限风险均稳定失败并提示拆分文档。
- 队列槽覆盖 outbox/waiting/delayed/active，跨副本 RPM/TPM/并发预留和 worker fencing 均为原子合同；重试状态与终态严格区分。
- 严格题目/结果 Schema、`rightsConfirmed:true` 和确定性物理校验已定义能力边界，任何规则结果都不自动等于教师审核。
- AI worker/gateway 故障不改变业务 API readiness，不阻塞本地学习和普通同步。
- AI worker 由独立 `start:ai-worker` 启动；worker 与 gateway 使用受控证书的双向 TLS。生产 gateway 只接受官方 OpenAI base URL，确定性桩注入仅限显式隔离 test/e2e。
- 独立上游桩 CA 只以 test/e2e gateway 的只读 `NODE_EXTRA_CA_CERTS` 挂载；production、正式镜像/清单及 Windows/Android 临时联网包和正式包均不含、不信任该 CA。
- Node 24.15 gateway 仅以 `NODE_USE_ENV_PROXY=1` 使用 `HTTPS_PROXY/NO_PROXY`；静态与真实代理测试证明无直连回退，代理不可用时 AI 失败关闭。
- OpenAI Responses 上游调用由 gateway 强制使用 `store:false`、`background:false`、固定 name/schema、`strict:true` 和服务端 HMAC 派生的 `safety_identifier`；原始用户身份字段、派生秘密和客户端自报标识均不外发。
- documentAnalysis 上游文件项严格为 `{type:"input_file",filename,file_data}`，未知字段和 `detail` 被拒绝；`detail` 只属于 `input_image`，单元契约与标准桩均执行深度等值断言。
- `max_output_tokens` 按 solve/文档段固定上限由 gateway 注入；模型输出、分段成功和 processed/total 证据均不能证明 OCR 完整性或内容正确性，所有候选继续要求教师审核。
- 结果、状态、保留和清理均有数据库与自动化证据；主观结果不自动成为教师复核证据。
- 双端只连接构建时允许的同一 HTTPS API origin，CSP 不再允许任意 HTTPS 连接。
- Compose E2E 与可选真实 provider smoke 分开记录 `NOT_RUN/PASS/FAIL`；未运行时不能声称真实链路或 AI 容量已经通过。
