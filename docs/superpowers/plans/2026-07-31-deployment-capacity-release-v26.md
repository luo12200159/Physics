# 物理研习室部署、容量验证与双端发布 v2.6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把按前置计划实现并通过各自门禁的本地学习、教师工具、业务服务端和云同步客户端组成可重复部署、可观测、可恢复、可压测的 v2.6.0 双端发布物，并用生产等价环境验证“50,000 个云账号、任意滚动 5 分钟内至少 5000 个不同账号完成一次成功业务操作”的容量目标。

**Architecture:** 普通班级业务采用无状态 TypeScript API 多副本，连接 PostgreSQL、Redis、对象存储和独立后台 worker；AI 作业使用独立 BullMQ 队列、`ai-worker`、内部 gateway、限额和伸缩指标，不能耗尽班级同步资源。生产部署以 Kubernetes/Kustomize 基础清单与外部托管依赖为基线，本地集成以 Docker Compose 为基线。Windows 使用签名 MSIX + `.appinstaller` 作为正式发布路径，并保留签名兼容安装器；Android 使用既有 release keystore 构建并校验 APK。

**Tech Stack:** Docker Compose、Kubernetes/Kustomize、PostgreSQL、Redis、S3-compatible object storage、Prometheus metrics、OpenTelemetry trace context、k6、Node.js、PowerShell、MSIX/App Installer、SignTool、Android build-tools/apksigner。

## Global Constraints

- 本计划分为两个可独立引用的阶段，禁止再以“其余五份计划全部完成后才开始部署”形成循环依赖：`基础设施联调门禁（Tasks 1–4）` 在本地学习闭环、教师工具、业务服务端完成，且云同步客户端 Tasks 1–10、受控 AI 作业队列 Tasks 1–6 已实现并通过各自静态/单元/集成测试后执行；它只提供真实 TLS Compose/Kubernetes 联调入口。`正式容量与发布门禁（Tasks 5–12）` 必须等待云同步客户端最终 Compose E2E 与受控 AI 作业队列 Task 7 完成并记录状态后再执行。任一阶段未实际运行的验收项仍为 `NOT_RUN`。
- “5 万用户”口径固定为 50,000 个云账号：49,500 个学生账号与 500 个教师账号；学生分布固定为 1,238 个班，其中 1,237 个班各 40 人、最后 1 个班 20 人，合计 `1,237 × 40 + 20 = 49,500`。不得把教师重复计入学生数，也不得以“已安装设备”替代账号数。
- “峰值 5000”固定为任意滚动 5 分钟窗口内，至少有 5,000 个不同账号各自成功完成一次登录、同步、查看作业或提交记录；只创建 5,000 个 VU、会话或连接不算通过，也不表示 5000 人同时调用 AI。
- AI 请求使用独立队列、并发池和限额；普通登录、班级、同步、作业与反馈容量测试不得依赖 OpenAI 可用性。
- 容量阈值固定为：稳态 300 RPS、短时 600 RPS；普通读取与增量同步 P95 ≤ 500 ms、P99 ≤ 1.5 s；非预期限流错误率 < 0.5%；作答/成绩/审核零丢失；重复请求不产生重复实体。
- 这些数字在生产等价环境报告状态为 `PASS` 前只能称为“验收目标”，不能称为“已经保证”或“已经支持”。本地 Docker 结果不能替代生产等价报告。
- 不把数据库、Redis、对象存储、SMTP、OpenAI、签名证书或激活私钥写入仓库、镜像、客户端或测试报告。
- 生产全链路加密是发布门禁：公网只接受 TLS 1.2+；PostgreSQL 强制校验证书的 TLS、Redis 使用 `rediss://`、S3/SMTP/API/更新时间戳均使用可验证证书的 TLS；内部 AI gateway 采用集群内 TLS。开发用明文只允许隔离 loopback/Compose 网络，不能进入正式清单。
- 对外 HTTPS 访问只允许经受控出口代理；Node 24.15 AI gateway 唯一代理启用方式为 `NODE_USE_ENV_PROXY=1` 配合 `HTTPS_PROXY/NO_PROXY`，禁止同时使用 `node --use-env-proxy`、自定义全局 Agent 或无代理重试。AI gateway 不得直连任意公网地址，出口代理只允许经 DNS/SNI 白名单访问批准的 OpenAI API 主机并记录不含请求正文的连接审计。`NODE_ENV=production` 缺失 `NODE_USE_ENV_PROXY`、值不严格等于字符串 `1` 或缺少批准的 `HTTPS_PROXY` 时启动失败；代理不可用时 AI 失败关闭且不得直连，普通业务与本地学习不受影响。
- `/health/live` 只证明进程存活；`/health/ready` 按业务服务固定协议仅检查 PostgreSQL、Redis 和对象存储；队列连通性与积压由 `/metrics` 和告警单独监测；`/metrics` 仅内网或受认证采集器访问。
- Windows 正式发布必须使用同一真实发布者代码签名证书并带可信时间戳；没有该证书时只允许生成“测试构建”，不得标注正式签名。
- 联网正式包必须显式提供同一个真实 HTTPS `CloudApiBaseUrl`；构建只在临时 staging 中写公开地址，源代码默认仍为空。未提供时可以生成离线测试包，但不得标注“已连接云服务”。
- 所有故障注入只允许在标记为 `production-like` 的隔离环境执行，脚本必须拒绝 `production` 上下文。
- 自动化与人工验收尚未实际运行前均保持 `NOT_RUN`；本计划中的命令、阈值和矩阵只定义验收方法，不代表已经通过。

PowerShell 统一运行环境：

```powershell
$node = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
$env:NODE_PATH = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

---

## Task 1: 固定部署配置、健康检查和秘密边界

**Files:**
- Create: `deploy/production.env.example`
- Create: `deploy/config.schema.json`
- Create: `deploy/README.md`
- Create: `tools/qa_deploy_config.cjs`
- Create: `deploy/security/tls-policy.md`
- Create: `deploy/security/egress-proxy-policy.md`
- Modify: `server/src/config.ts`
- Modify: `server/.env.business.example`
- Modify: `server/src/app.ts`
- Modify: `server/src/modules/health/routes.ts`
- Modify: `server/src/infrastructure/metrics.ts`

- [ ] **Step 1: 写部署配置失败测试**

测试要求 `deploy/config.schema.json`、`server/src/config.ts` 与 `server/.env.business.example` 的变量集合一致，并在业务服务端既有变量上增加 `TRUSTED_PROXY_CIDRS`：`NODE_ENV, BUSINESS_HOST, BUSINESS_PORT, DATABASE_URL, REDIS_URL, JWT_SECRET, CURSOR_HMAC_SECRET, AUDIT_IP_KEY, CREDENTIAL_ARTIFACT_KEY, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS, ACCOUNT_DELETION_GRACE_DAYS, PRIVACY_EXPORT_RETENTION_DAYS, CORS_ALLOWED_ORIGINS, TRUSTED_PROXY_CIDRS, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_FORCE_PATH_STYLE, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, FEEDBACK_TO_EMAIL, METRICS_TOKEN, TOMBSTONE_RETENTION_DAYS, SYNC_OUTBOX_RETENTION_DAYS, AI_JOBS_ENABLED, AI_QUEUE_MAX_DEPTH, AI_STUDENT_SOLVE_PER_HOUR, AI_TEACHER_SOLVE_PER_HOUR, AI_TEACHER_DOCUMENT_PER_DAY`。QA 从服务端配置定义和环境示例解析实际键名，发现缺失、未知字段或默认值漂移即失败，不能只检查部署示例自身。QA 还单独读取 AI 计划创建的生产 `server/.env.ai-gateway.example`，断言同时存在唯一 `NODE_USE_ENV_PROXY=1`、非空 `HTTPS_PROXY` 和受控 `NO_PROXY`，但不存在 `NODE_EXTRA_CA_CERTS`、测试 CA 路径或测试桩地址；另检查 `server/.env.ai-gateway.e2e.example` 只在 `NODE_ENV=e2e + AI_ALLOW_TEST_UPSTREAM=true` 时增加固定只读桩 CA 路径。静态检查拒绝 gateway 启动参数 `--use-env-proxy`、自定义全局 Agent、代理失败后的直连分支，以及生产镜像/清单中的测试 CA 字节、指纹、环境变量或 mount；这些 gateway 专属变量不得混入业务环境 Schema。示例文件只含变量名和安全说明，不含可用凭据；`FEEDBACK_TO_EMAIL` 固定为 `luo865265@gmail.com`。发布环境 CORS 精确包含 Windows 的 `https://physics-studio.local` 与 Android 的 `https://appassets.androidplatform.net`，只允许实际路由所需方法和 `Authorization, Content-Type, Idempotency-Key` 等明确请求头，OPTIONS 预检必须自动化验证；不得使用通配、`null` 或反射来源。S3 bucket CORS 使用同一双端 origin，只允许预签名 PUT/GET 以及 `content-type`、`x-amz-checksum-sha256` 等签名响应明确列出的请求头，不开放凭据或任意来源。密钥类字段在生产不得为空或使用默认值。AI gateway/worker 使用独立的 secret/config：只有 AI worker 获得独立至少 32 字节的 `AI_SAFETY_IDENTIFIER_KEY`，gateway、业务 API、普通 worker 和双端客户端均不得获得；不得把 `OPENAI_API_KEY` 或内部 gateway token 注入业务 API/普通 worker。

```js
assert.equal(env.FEEDBACK_TO_EMAIL, "luo865265@gmail.com");
assert.equal(schema.properties.JWT_SECRET.minLength >= 32, true);
assert.equal(source.includes("OPENAI_API_KEY"), false);
assert.equal(source.includes("sk-"), false);
```

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_deploy_config.cjs
```

- [ ] **Step 3: 实现配置启动校验**

生产进程启动时一次性校验所有必需配置；缺失、弱密钥、明文外部 API URL、通配 CORS、空 trusted-proxy 列表或生产默认密码时直接退出。生产校验还必须拒绝未强制证书验证的 PostgreSQL、明文 Redis、非 HTTPS S3、未启用 STARTTLS/TLS 的 SMTP 和未受出口代理约束的 OpenAI 上游。`trustProxy` 只接受部署注入的 ingress/reverse-proxy CIDR，不信任任意 `X-Forwarded-For`；日志只打印变量名，不打印值。

- [ ] **Step 4: 完成三个运维端点**

`GET /health/live` 不访问依赖并返回进程版本；`GET /health/ready` 在 1 秒预算内检查 PostgreSQL、Redis、对象存储并严格返回服务端计划规定的 `ReadyResponse`；`GET /metrics` 以 Prometheus 文本格式暴露请求、延迟、连接池、sync 冲突、outbox/worker 队列、反馈邮件状态，标签禁止包含姓名、账号、班级、题干或 token。

- [ ] **Step 5: 运行测试**

```powershell
& $node tools\qa_deploy_config.cjs
pnpm --dir server test:integration -- tests/integration/health.test.ts
pnpm --dir server test:integration -- tests/integration/security.test.ts
```

预期：配置边界、健康语义和指标隐私测试通过。

---

## Task 2: 建立可重复的本地生产近似环境

**Files:**
- Create: `deploy/compose/compose.production-like.yml`
- Create: `deploy/compose/compose.ai-e2e-overlay.yml`
- Create: `deploy/compose/compose.env.example`
- Create: `deploy/compose/reverse-proxy.conf`
- Create: `deploy/compose/egress-proxy.conf`
- Create: `deploy/compose/init-object-storage.ps1`
- Create: `deploy/scripts/generate-integration-test-ca.ps1`
- Create: `deploy/scripts/cleanup-integration-test-pki.ps1`
- Create: `deploy/scripts/reset-production-like.ps1`
- Create: `tools/qa_compose_stack.cjs`
- Create: `tools/qa_ai_egress_proxy.cjs`
- Modify: `server/Dockerfile`
- Create: `server/.dockerignore`

- [ ] **Step 1: 写容器清单失败测试**

断言核心 profile 包含 `reverse-proxy`、`api`、`worker`、`postgres`、`redis`、`object-storage`、`mail-capture`；AI opt-in profile 另含 `ai-worker`、`ai-gateway` 与 `egress-proxy`。API/普通 worker/AI worker 使用同一不可变业务镜像 digest但使用不同启动命令；只有反向代理 TLS 端口对宿主开放；PostgreSQL/Redis/对象存储/内部 AI gateway 不暴露公网端口；每个持久服务有 volume 和 healthcheck。反向代理覆盖并重新生成转发链，只把自身固定容器网段列入 `TRUSTED_PROXY_CIDRS`，测试伪造 `X-Forwarded-For` 不得绕过登录限流。只有 `ai-gateway` 获得 `OPENAI_API_KEY`，只有 `ai-worker` 获得内部 gateway token 与 `AI_SAFETY_IDENTIFIER_KEY`，普通 API/worker、gateway 和客户端均没有该 HMAC 秘密。基础 Compose 必须向 `ai-gateway` 精确注入 `NODE_USE_ENV_PROXY=1`、`HTTPS_PROXY`、`NO_PROXY`，且明确不含 `NODE_EXTRA_CA_CERTS` 或上游桩 CA mount；gateway 只连接 `internal:true` 的 `ai-egress` 网络，`egress-proxy` 同时连接该内部网络与唯一外连网络，因此 gateway 没有可用的直接公网路由。`compose.ai-e2e-overlay.yml` 是唯一允许增加 `NODE_ENV=e2e`、`AI_ALLOW_TEST_UPSTREAM=true`、固定 `NODE_EXTRA_CA_CERTS=/run/physics-studio/test-upstream-ca/ca.pem`、只读 upstream-stub-ca mount 和 HTTPS stub service 的 Compose 文件；它不得改变 API/worker/客户端信任或把 CA 安装进系统证书库。出口代理只允许批准的 HTTPS 上游。AI gateway 进程直接终止 TLS 1.2+，不再依赖未定义的 sidecar：隔离测试 CA 为 `localhost` 反向代理和 `physics-ai-gateway`/`ai-gateway` DNS SAN 分别签发服务端证书、为 `ai-worker` 签发客户端证书，双方只从只读挂载文件读取证书与私钥，gateway 要求有效客户端证书并继续校验服务 token；明文 gateway 监听、关闭证书校验和把测试私钥提交到仓库均使 QA 失败。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_compose_stack.cjs
```

- [ ] **Step 3: 实现多阶段非 root 镜像**

镜像固定 Node 24.15.0、通过 Corepack 使用服务端锁文件声明的 pnpm 11.18.0 并执行 `pnpm install --frozen-lockfile`、编译 TypeScript、仅复制生产依赖和 `dist`，以 UID 10001 运行，启用只读根文件系统兼容的 `/tmp`。启动命令分别固定为 API `pnpm start`、普通 worker `pnpm start:worker`、AI worker `pnpm start:ai-worker`，数据库迁移由一次性 job 执行。正式镜像层逐层扫描不得包含任何测试 CA、私钥、固定测试路径或 `NODE_EXTRA_CA_CERTS` 默认值。`generate-integration-test-ca.ps1` 只可在 `production-like` 隔离环境向仓库忽略的 `.build/integration-pki/<runId>` 生成三个密码学独立、指纹不同的短期根及清单：业务入口 CA、worker↔gateway mTLS CA、上游桩 CA；桩 CA 只签发 `openai-responses-stub` DNS SAN 的服务端证书，不能签发客户端/业务证书。Compose 通过 `PHYSICS_INTEGRATION_PKI_DIR` 按用途只读挂载，只有 AI E2E overlay 把桩 CA 挂到 gateway 固定路径。`cleanup-integration-test-pki.ps1` 强制校验 `EnvironmentLabel=production-like`、runId、清单和目标解析路径位于仓库 `.build/integration-pki/<runId>` 后删除整个 run 目录；拒绝链接、通配路径、production 或不匹配指纹。正式环境证书只能来自外部秘密管理系统，不能调用测试 CA 脚本。`init-object-storage.ps1` 创建专用 bucket、启用版本/加密，并写入双端精确 origin、PUT/GET 方法和 checksum/content-type 请求头的最小 S3 CORS；静态测试拒绝 `*` origin/header。

- [ ] **Step 4: 启动并验证环境**

```powershell
powershell -ExecutionPolicy Bypass -File deploy\scripts\generate-integration-test-ca.ps1 -EnvironmentLabel production-like -RunId compose-v26 -OutputDirectory .build\integration-pki\compose-v26
$env:PHYSICS_INTEGRATION_PKI_DIR = (Resolve-Path .build\integration-pki\compose-v26).Path
docker compose --profile ai -f deploy\compose\compose.production-like.yml --env-file deploy\compose\compose.env.example config
docker compose --profile ai -f deploy\compose\compose.production-like.yml -f deploy\compose\compose.ai-e2e-overlay.yml --env-file deploy\compose\compose.env.example up -d --build
curl.exe --fail --cacert .build\integration-pki\compose-v26\ca.pem https://localhost:8788/health/live
curl.exe --fail --cacert .build\integration-pki\compose-v26\ca.pem https://localhost:8788/health/ready
& $node tools\qa_ai_egress_proxy.cjs --mode static --compose deploy\compose\compose.production-like.yml --test-overlay deploy\compose\compose.ai-e2e-overlay.yml
& $node tools\qa_ai_egress_proxy.cjs --mode real --compose deploy\compose\compose.production-like.yml --test-overlay deploy\compose\compose.ai-e2e-overlay.yml --upstream-stub server\tests\fixtures\openai-responses-stub.mjs --result .build\ai-egress-proxy\compose-result.json
```

预期：live/ready 都为 200；反向代理后的真实客户端地址只来自受信代理；双端 origin 的业务 API 与 S3 预检成功，其他 origin 失败。代理测试以新启动、无上游连接复用的 gateway 实例串行发送一个固定请求，要求出口代理新增且仅新增一条来自该实例、指向桩主机的 CONNECT/连接审计，同时桩计数增加一；HTTPS 隧道不要求代理读取或注入应用层请求头。停止 `egress-proxy` 后 AI 请求稳定失败并进入可重试状态、桩计数不增加、网络审计无 gateway 直连，恢复代理后才成功。停止 Redis 后 live 仍为 200、ready 为 503；在线认证与同步暂时不可用，但客户端本地学习和 outbox 保留正常；恢复后 ready 自动回到 200并可追平。

- [ ] **Step 5: 运行集成测试并清理**

```powershell
& $node tools\qa_compose_stack.cjs --running
docker compose --profile ai -f deploy\compose\compose.production-like.yml -f deploy\compose\compose.ai-e2e-overlay.yml --env-file deploy\compose\compose.env.example down
powershell -ExecutionPolicy Bypass -File deploy\scripts\cleanup-integration-test-pki.ps1 -EnvironmentLabel production-like -RunId compose-v26 -Directory .build\integration-pki\compose-v26
```

不加 `--volumes`，避免误删调试数据；需要清空测试卷时使用专门的 `deploy/scripts/reset-production-like.ps1`。该脚本强制 `-EnvironmentLabel production-like -ProjectName physics-studio-production-like -AcknowledgeDataLoss`，解析 Compose 实际 project label 并拒绝默认/空 project、`production` 环境或仓库外未识别清单；只删除该 project 的容器和具名测试 volumes，不使用通配资源名，不接触外部数据库、bucket 或其他 Compose project。

---

## Task 3: 建立 Kubernetes/Kustomize 生产基线

**Files:**
- Create: `deploy/kubernetes/base/kustomization.yaml`
- Create: `deploy/kubernetes/base/api.yaml`
- Create: `deploy/kubernetes/base/worker.yaml`
- Create: `deploy/kubernetes/base/ai-worker.yaml`
- Create: `deploy/kubernetes/base/ai-gateway.yaml`
- Create: `deploy/kubernetes/base/ai-service.yaml`
- Create: `deploy/kubernetes/base/egress-proxy.yaml`
- Create: `deploy/kubernetes/base/hpa.yaml`
- Create: `deploy/kubernetes/base/service.yaml`
- Create: `deploy/kubernetes/base/ingress.yaml`
- Create: `deploy/kubernetes/base/migrate-job.yaml`
- Create: `deploy/kubernetes/base/network-policy.yaml`
- Create: `deploy/kubernetes/base/pod-disruption-budget.yaml`
- Create: `deploy/kubernetes/base/service-monitor.yaml`
- Create: `deploy/kubernetes/production-like/kustomization.yaml`
- Create: `deploy/kubernetes/ai-e2e/kustomization.yaml`
- Create: `deploy/kubernetes/ai-e2e/ai-gateway-patch.yaml`
- Create: `deploy/kubernetes/ai-e2e/openai-responses-stub.yaml`
- Create: `deploy/kubernetes/ai-e2e/network-policy-patch.yaml`
- Create: `deploy/scripts/run-kubernetes-ai-e2e-overlay.ps1`
- Create: `tools/qa_kubernetes_manifests.cjs`

- [ ] **Step 1: 写安全与可用性失败测试**

测试要求：API 至少 3 副本、普通 worker 至少 2 副本、AI worker/gateway 各自独立部署；滚动更新 `maxUnavailable: 0`；readiness/liveness 分离；requests/limits 均设置；runAsNonRoot、readOnlyRootFilesystem、drop ALL capabilities；NetworkPolicy 默认拒绝并只开放 DNS、依赖和入口。客户端不能访问内部 AI service，AI worker 只能访问 TLS PostgreSQL/Redis/S3 与内部 TLS gateway；生产 base/production-like gateway Deployment 必须精确注入 `NODE_USE_ENV_PROXY=1`、`HTTPS_PROXY`、`NO_PROXY`，但不得包含 `NODE_EXTRA_CA_CERTS`、测试 CA Secret/volume/mount、测试桩 service 或测试指纹；其 NetworkPolicy 只允许 DNS 和受控 HTTPS 出口代理 service，不能访问公网 CIDR 或直接访问测试桩/OpenAI。只有 `deploy/kubernetes/ai-e2e` overlay 可增加 `NODE_ENV=e2e`、`AI_ALLOW_TEST_UPSTREAM=true`、固定 `NODE_EXTRA_CA_CERTS`、上游桩 CA Secret 只读 mount、HTTPS stub 和本次桩 DNS/SNI 代理白名单；仍禁止 gateway 直接访问 stub。出口代理只允许批准的 OpenAI API 主机或该隔离 overlay 的单一桩主机。Ingress 必须终止受信 TLS、覆盖客户端转发头，并把其 pod CIDR 作为业务 API 唯一 trusted proxy；PDB 保证至少 2 个 API 可用；秘密只通过 `secretKeyRef`。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_kubernetes_manifests.cjs
```

- [ ] **Step 3: 实现无供应商秘密的基础清单**

基础清单使用 `physics-studio-api`、`physics-studio-worker`、`physics-studio-runtime` 等稳定名称。镜像由 CI 用 digest 注入；Ingress 只声明 TLS secret 引用，不提交私钥；PostgreSQL、Redis 与对象存储作为外部托管地址注入，不在生产 base 中部署单节点数据库。生产 overlay 只接受带证书校验的数据库连接、`rediss://`、HTTPS S3/AI gateway/出口代理和启用 TLS 的 SMTP；根证书通过受控 ConfigMap/Secret 挂载并设置轮换说明，不允许 `rejectUnauthorized=false`、跳过主机名校验或明文降级。`AI_SAFETY_IDENTIFIER_KEY` 使用独立 Kubernetes Secret 仅注入 AI worker；同一镜像的 API/普通 worker 通过独立 Deployment 环境变量清单确保不可见，gateway 和客户端也不得获得。AI gateway 与 Compose 使用同一“进程直接终止双向 TLS”合同：Kubernetes Secret 分别挂载 gateway 服务端证书/私钥、worker 客户端证书/私钥与双方信任 CA，证书包含 Service DNS SAN；NetworkPolicy 只允许 AI worker 访问该 TLS Service，轮换采用重启滚动加载且 `maxUnavailable:0`。AI E2E overlay 引用的 `physics-ai-upstream-stub-ca` Secret 由运行器从本次 `.build/integration-pki/<runId>/upstream-stub` 临时创建，不提交 CA 字节；清理必须删除该 Secret、stub workload 和本地 PKI run 目录。生产渲染检查固定拒绝 Secret 名、mount path、`NODE_EXTRA_CA_CERTS` 和 stub service。`run-kubernetes-ai-e2e-overlay.ps1` 强制 `-EnvironmentLabel production-like`、显式 kube context 和集群 annotation，使用专用临时 namespace；它从本次 PKI 清单核对桩 CA/证书指纹后创建 ephemeral Secret、应用 AI E2E overlay、运行真实 gateway→egress-proxy→HTTPS stub 请求及代理中断失败关闭检查，并在 `try/finally` 删除 namespace/Secret/workload和本地 PKI run 目录，任何清理失败都使结果为 FAIL。脚本还以生产 base 启动校验夹具确认注入测试变量、固定挂载或测试 CA 会在监听前失败。若部署方改用 service mesh，必须提供等价 mTLS、身份校验、证书轮换和禁止明文旁路的独立 overlay 及同一 QA 断言，不能同时保留两套不确定终止路径。

- [ ] **Step 4: 配置横向扩展**

API HPA 以 CPU 和 `http_inflight_requests` 扩展 3→20；普通 worker 以普通队列深度扩展 2→30；AI worker 以 `physics_ai_queue_depth` 扩展 1→10；AI gateway 以独立并发/CPU 指标扩展 2→10，并受上游配额和 `AI_CLUSTER_MAX_INFLIGHT=20` 硬上限约束。自定义指标由集群 Prometheus Adapter 提供，`deploy/README.md` 的预检命令必须先确认这些指标可由 Custom Metrics API 查询；缺少指标适配器时部署停止，不能静默退化为未经验证的扩容策略。连接池按总预算校验：`API最大副本×API池 + 普通worker最大副本×普通池 + AI worker最大副本×AI池 + migration/report/运维保留连接 ≤ PostgreSQL max_connections × 80%`；默认每 API 20、每普通/AI worker 10，AI gateway 不建立数据库池，并另外保留 100 个管理、迁移、报告和故障恢复连接。默认最大副本预算为 `20×20 + 30×10 + 10×10 + 100 = 900`，因此 PostgreSQL `max_connections` 必须至少为 `ceil(900/0.8)=1125`；若托管数据库上限更低，必须先降低副本或池大小并由 QA 重新计算，不能超配上线。任何单项公式通过但总和超限都必须阻止部署。

- [ ] **Step 5: 构建并检查渲染结果**

```powershell
kubectl kustomize deploy\kubernetes\base | Out-File -Encoding utf8 .build\kubernetes-base.yaml
& $node tools\qa_kubernetes_manifests.cjs .build\kubernetes-base.yaml
& $node tools\qa_ai_egress_proxy.cjs --mode static --kubernetes .build\kubernetes-base.yaml
kubectl kustomize deploy\kubernetes\ai-e2e | Out-File -Encoding utf8 .build\kubernetes-ai-e2e.yaml
& $node tools\qa_kubernetes_manifests.cjs .build\kubernetes-ai-e2e.yaml --test-overlay
& $node tools\qa_ai_egress_proxy.cjs --mode static --kubernetes .build\kubernetes-base.yaml --test-overlay .build\kubernetes-ai-e2e.yaml
powershell -ExecutionPolicy Bypass -File deploy\scripts\run-kubernetes-ai-e2e-overlay.ps1 -EnvironmentLabel production-like -KubeContext $env:PHYSICS_KUBE_TEST_CONTEXT -RunId kubernetes-ai-e2e-v26 -PkiDirectory .build\integration-pki\kubernetes-ai-e2e-v26 -Result .build\ai-egress-proxy\kubernetes-result.json
```

预期：清单可渲染，无 `latest` 镜像、明文 Secret、特权容器或公网 metrics。

---

## Task 4: 增加可观测性、告警和审计关联

**Files:**
- Create: `deploy/monitoring/prometheus-rules.yaml`
- Create: `deploy/monitoring/dashboard.json`
- Create: `deploy/runbooks/alerts.md`
- Create: `tools/qa_observability.cjs`
- Create: `tools/qa_infrastructure_integration_gate.cjs`
- Create: `docs/releases/infrastructure-integration-gate-v26.md`
- Modify: `server/package.json`
- Modify: `server/src/app.ts`
- Modify: `server/src/common/request-context.ts`
- Create: `server/src/infrastructure/observability.ts`
- Modify: `server/src/infrastructure/metrics.ts`

- [ ] **Step 1: 写低基数指标与告警失败测试**

禁止以 `userId/classId/questionId/requestId` 作为 metrics label；结构化日志只允许 hash 后的 actor correlation ID，且不记录请求体。告警至少覆盖 5xx、P95/P99、readiness、数据库池耗尽、Redis 错误、sync conflict 激增、worker backlog/oldest age、邮件持续失败、磁盘/对象存储错误。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_observability.cjs
```

- [ ] **Step 3: 实现 request/trace/audit 关联**

入口生成或验证 128-bit trace ID，响应返回 `x-request-id`；审计日志只保存操作、资源类型、结果、服务器时间和受控 actor ID。错误日志按 error code 聚合，用户反馈可由反馈编号关联脱敏日志，但默认不关联学生内容。

- [ ] **Step 4: 实现告警阈值和处置说明**

持续 5 分钟 5xx > 1%、P95 > 500 ms 或 ready 实例不足触发高优先级；队列最老任务 > 5 分钟或反馈失败 > 10 分钟触发中优先级。每条告警在 runbook 中写清验证、缓解、回滚和数据完整性检查。

- [ ] **Step 5: 运行测试**

```powershell
& $node tools\qa_observability.cjs
```

预期：所有标签低基数、隐私字段不进入日志，告警均有对应 runbook 锚点。

---

## Phase Gate A: 基础设施联调门禁（Tasks 1–4）

这是云同步客户端最终 Compose E2E 与受控 AI 作业队列 Task 7 唯一可引用的部署前置阶段。只有 Tasks 1–4 的配置一致性、真实服务 Compose、内部 AI 双向 TLS、受控出口代理、Kubernetes 渲染和低基数观测测试均执行成功，且 `docs/releases/infrastructure-integration-gate-v26.md` 记录 commit、镜像 digest、Compose/Kubernetes 清单 hash、测试 CA runId、三个独立 CA 的用途/指纹/SAN/有效期、命令、清理结果和证据路径时，状态才能从 `NOT_RUN` 改为 `PASS`。联调入口必须提供隔离 HTTPS API origin、内部 `https://physics-ai-gateway...`、受控出口代理和可复现的启动/清理命令；不得把明文 gateway、内存 fake、复用 CA 或残留上游桩 CA 记为通过。

```powershell
powershell -ExecutionPolicy Bypass -File deploy\scripts\generate-integration-test-ca.ps1 -EnvironmentLabel production-like -RunId gate-v26 -OutputDirectory .build\integration-pki\gate-v26
$env:PHYSICS_INTEGRATION_PKI_DIR = (Resolve-Path .build\integration-pki\gate-v26).Path
docker compose --profile ai -f deploy\compose\compose.production-like.yml -f deploy\compose\compose.ai-e2e-overlay.yml --env-file deploy\compose\compose.env.example up -d --build
& $node tools\qa_deploy_config.cjs
& $node tools\qa_compose_stack.cjs --running
& $node tools\qa_ai_egress_proxy.cjs --mode real --compose deploy\compose\compose.production-like.yml --test-overlay deploy\compose\compose.ai-e2e-overlay.yml --upstream-stub server\tests\fixtures\openai-responses-stub.mjs --result .build\ai-egress-proxy\gate-result.json
& $node tools\qa_kubernetes_manifests.cjs .build\kubernetes-base.yaml
& $node tools\qa_observability.cjs
& $node tools\qa_infrastructure_integration_gate.cjs --report docs\releases\infrastructure-integration-gate-v26.md
docker compose --profile ai -f deploy\compose\compose.production-like.yml -f deploy\compose\compose.ai-e2e-overlay.yml --env-file deploy\compose\compose.env.example down
powershell -ExecutionPolicy Bypass -File deploy\scripts\cleanup-integration-test-pki.ps1 -EnvironmentLabel production-like -RunId gate-v26 -Directory .build\integration-pki\gate-v26
```

该阶段只证明所列基础设施联调入口可用，不证明云同步或 AI 端到端通过，不证明 50,000/5,000 容量、正式域名、可信签名、自动更新或发布就绪。未实际运行时报告必须为 `NOT_RUN`。

## Phase Gate B: 正式容量与发布门禁（Tasks 5–12）

Tasks 5–12 只能在 Phase Gate A 为 `PASS`、云同步客户端最终真实 Compose E2E 为 `PASS`、受控 AI 作业队列 Task 7 的标准确定性桩 E2E 为 `PASS` 后开始；可选真实 OpenAI provider smoke 可以保持独立 `NOT_RUN`，但不得据此作真实提供商或 AI 容量声明。这样部署底座先供云/AI 联调，容量、签名、回退与最终发布验收后置，避免三份计划互相等待。

---

## Task 5: 生成 50,000 个云账号、5,000 个活跃账号的隔离压测数据

**Files:**
- Create: `server/scripts/seed-load-test.ts`
- Create: `load/generate-fixture.ps1`
- Create: `load/README.md`
- Create: `load/.gitignore`
- Create: `tools/qa_load_fixture.cjs`

- [ ] **Step 1: 写安全种子失败测试**

脚本只有 `NODE_ENV=load-test` 且数据库名以 `_loadtest` 结尾才运行；固定 `runId` 前缀；精确创建 50,000 个账号，其中 49,500 个学生、500 个教师。学生精确分配至 1,238 个班：1,237 班各 40 人、最后一班 20 人；教师只作为教师/班级所有者，不重复计入学生账号。输出 5,000 个互不重复的活跃测试账号到 `.build/load/<runId>/users.json`，并记录角色分布与 SHA-256；仓库忽略该目录。QA 必须断言总账号数、角色数、班级数、每班人数和外键均精确相等。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_load_fixture.cjs
```

- [ ] **Step 3: 实现批量种子和可追踪清理**

使用 PostgreSQL bulk insert/COPY；密码为每次运行随机生成的测试秘密并使用与生产相同的哈希参数；每行带 `loadTestRunId`。清理只删除该 runId 数据，先检查数据库环境标签，禁止模糊匹配或全表清空。

- [ ] **Step 4: 在生产近似环境生成数据**

```powershell
powershell -ExecutionPolicy Bypass -File load\generate-fixture.ps1 -RunId 'capacity-v26-local' -RegisteredUsers 50000 -ActiveUsers 5000
& $node tools\qa_load_fixture.cjs .build\load\capacity-v26-local\users.json
```

预期：`49,500 + 500 = 50,000`、`1,237 × 40 + 20 = 49,500`，班级隔离、密码哈希成本和测试数据标记均通过。

---

## Task 6: 编写 k6 业务负载、阈值和完整性标记

**Files:**
- Create: `load/k6/common.js`
- Create: `load/k6/smoke.js`
- Create: `load/k6/ramp.js`
- Create: `load/k6/capacity-5000.js`
- Create: `load/k6/spike-10000.js`
- Create: `load/k6/soak-8h.js`
- Create: `load/k6/auth-isolation.js`
- Create: `load/verify-integrity.mjs`
- Create: `tools/qa_k6_scenarios.cjs`

- [ ] **Step 1: 写场景与阈值失败测试**

业务权重固定为：登录/刷新 5%、sync pull 30%、sync push 25%、查看作业/班级 20%、提交作答 15%、教师复核/发布 5%。所有写请求带 `runId`、唯一实体 ID 和 idempotencyKey；AI、文档解析和大文件不进入普通业务阈值。另设最多 50 个虚拟用户的 AI 队列烟雾场景，只验证隔离、排队、限流与状态真实性，不作为 5000 人 AI 容量声明。

```js
export const thresholds = {
  "http_req_duration{business:true}": ["p(95)<500", "p(99)<1500"],
  unexpected_error_rate: ["rate<0.005"],
  lost_write_rate: ["rate==0"],
  duplicate_write_rate: ["rate==0"]
};
```

- [ ] **Step 2: 运行静态测试并确认失败**

```powershell
& $node tools\qa_k6_scenarios.cjs
```

- [ ] **Step 3: 实现六个可重复场景**

`smoke`: 50 活跃用户 5 分钟；`ramp`: 100→500→2000→5000；`capacity-5000`: 以 5,000 个互不重复的账号执行 300 RPS 持续 30 分钟，并在每个滚动 5 分钟窗口记录成功业务行为的 distinct account ID 计数；`spike-10000`: 600 RPS、最多 10,000 VU 的两倍短时峰值；`soak-8h`: 300 RPS 8 小时；`auth-isolation`: 跨班级/跨角色越权请求必须全部 403 且不泄露资源存在性。`capacity-5000` 只有在验收窗口内 distinct 成功账号数至少 5,000 时才通过，VU、TCP 连接或令牌数量不能替代该证据。

- [ ] **Step 4: 实现测试后数据库完整性核验**

`verify-integrity.mjs` 以只读连接检查：客户端成功写入标记数与服务端实体数相等；每个 idempotencyKey 只有一个效果；Attempt、ExamRecord、ReviewDecision 外键完整；同步游标可继续拉取；无跨班级记录；滚动 5 分钟 distinct 成功账号证据与原始请求日志一致且不含账号明文。任何差异使进程非零退出。

- [ ] **Step 5: 运行静态场景检查**

```powershell
& $node tools\qa_k6_scenarios.cjs
```

预期：所有场景均包含固定阈值、数据回收标记和完整性阶段。

---

## Task 7: 实现隔离环境故障恢复测试

**Files:**
- Create: `load/run-failure-suite.ps1`
- Create: `load/k6/reconnect-conflict.js`
- Create: `deploy/runbooks/failure-testing.md`
- Create: `tools/qa_failure_guard.cjs`

- [ ] **Step 1: 写环境保护失败测试**

脚本强制参数 `-EnvironmentLabel production-like -AcknowledgeNonProduction`，读取集群 annotation `physics-studio/environment=production-like`；任何一项不符立即退出。脚本不得删除 namespace、PVC、数据库或对象存储 bucket。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_failure_guard.cjs
```

- [ ] **Step 3: 实现受控故障矩阵**

依次验证：终止一个 API pod、滚动重启所有 API、Redis 30 秒不可用、worker 2 分钟暂停、SMTP 失败、对象存储超时、AI 网关不可用、受控出口代理不可用、客户端离线后重连、两个设备并发修改资料、重复 push。出口代理故障期间 AI gateway 必须失败关闭，不得直连确定性桩/OpenAI；以桩请求计数、代理审计和网络流量证据确认。PostgreSQL 主故障和区域级故障由托管平台演练，不用脚本擅自破坏。

- [ ] **Step 4: 定义通过条件**

普通本地学习始终可用；API pod 故障期间无已确认写入丢失。Redis 不可用时，因认证正向会话与共享限流必须失败关闭，在线登录、已认证业务和同步可以暂时返回 503，所有 API 实例 readiness 应反映不可用；客户端必须保留本地作答与 outbox，Redis 恢复后重新认证/刷新并追平且不丢失、不重复。SMTP 或 AI 故障不得使普通业务 readiness 失败；反馈/AI 保持可重试真状态。所有队列恢复后追平，冲突保留双方，readiness 和告警与实际故障一致。

- [ ] **Step 5: 运行保护测试**

```powershell
& $node tools\qa_failure_guard.cjs
```

真实故障套件只在已验明的 production-like 集群执行并保存 runId。

---

## Task 8: 建立备份、恢复和回滚验证

**Files:**
- Create: `deploy/scripts/backup-postgres.ps1`
- Create: `deploy/scripts/restore-postgres-test.ps1`
- Create: `deploy/scripts/verify-object-storage.ps1`
- Create: `deploy/runbooks/backup-restore.md`
- Create: `deploy/runbooks/release-rollback.md`
- Create: `tools/qa_backup_restore.cjs`

- [ ] **Step 1: 写路径、环境和加密保护失败测试**

备份脚本要求显式 DSN secret reference 和输出目录；文件名包含 UTC、schema version、runId；生成 SHA-256；输出目录禁止位于仓库；日志不含连接串。恢复脚本只允许新建的 `_restoretest_<runId>` 数据库，禁止覆盖源数据库。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_backup_restore.cjs
```

- [ ] **Step 3: 实现数据库与对象存储验证**

PostgreSQL 使用自定义格式 `pg_dump`；恢复到临时数据库后运行迁移检查、行数/外键/审计/幂等完整性检查。对象存储要求 versioning、服务端加密、生命周期和定期清单；随机抽样下载后校验保存的 SHA-256。

- [ ] **Step 4: 定义 RPO/RTO 验收**

初始目标：数据库 RPO ≤ 15 分钟、对象附件 RPO ≤ 24 小时、核心班级与作答恢复 RTO ≤ 4 小时。只有演练测得数据满足目标后才在报告中标记 PASS；否则记录实测值和整改项。

- [ ] **Step 5: 运行本地恢复演练**

```powershell
& $node tools\qa_backup_restore.cjs
powershell -ExecutionPolicy Bypass -File deploy\scripts\backup-postgres.ps1 -EnvironmentLabel production-like -OutputDirectory 'C:\PhysicsStudioBackups\local-test'
powershell -ExecutionPolicy Bypass -File deploy\scripts\restore-postgres-test.ps1 -EnvironmentLabel production-like -BackupDirectory 'C:\PhysicsStudioBackups\local-test'
```

预期：恢复库通过一致性检查，源库未被修改。

---

## Task 9: 运行容量套件并生成可校验结论报告

**Files:**
- Create: `load/run-capacity-suite.ps1`
- Create: `load/report.schema.json`
- Create: `load/render-report.mjs`
- Create: `docs/capacity/README.md`
- Create: `tools/qa_capacity_report.cjs`

- [ ] **Step 1: 写报告状态机失败测试**

每项状态只能为 `NOT_RUN | PASS | FAIL`；报告记录 commit SHA、镜像 digest、Kubernetes 清单 hash、数据库/Redis/S3规格与版本、TLS 模式、连接池总预算、API/普通 worker/AI worker/gateway 副本与资源 requests/limits、节点类型与数量、Ingress/LB/WAF/出口代理及版本、HPA 配置与扩缩事件、Prometheus Adapter、压测机规格和所在网络/区域、到入口 RTT、测试日期、runId、原始 k6 JSON hash、distinct-account 窗口证据和完整性结果。`businessCapacity` 与 `aiIsolationSmoke` 分开记录：AI 烟雾未运行不阻止对普通业务容量作结论，但不得产生任何 AI 容量声明。缺任何对应原始证据时不得为 PASS。

报告只能称为“可校验”：渲染器为报告及每个原始证据生成 SHA-256 清单，并可选使用 CI 发布身份签署证明；没有外部签名、可信时间戳或只读/WORM 证据存储时不得使用“不可篡改”表述。修改任一原始文件后校验必须失败。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_capacity_report.cjs
```

- [ ] **Step 3: 实现受门控执行顺序**

顺序固定为 smoke→ramp→capacity-5000→spike-10000→soak-8h→failure→backup restore→auth isolation。任一核心数据完整性失败立即停止后续放量；性能阈值失败可保存报告但不得发布容量声明。

- [ ] **Step 4: 运行生产等价测试**

```powershell
powershell -ExecutionPolicy Bypass -File load\run-capacity-suite.ps1 -EnvironmentLabel production-like -BaseUrl $env:PHYSICS_LOAD_BASE_URL -FixturePath $env:PHYSICS_LOAD_FIXTURE -ResultsDirectory $env:PHYSICS_LOAD_RESULTS
```

该命令只在具备生产等价资源的隔离环境执行；不得用本机结果替代。生产等价至少要求与拟发布环境相同的镜像 digest、Kubernetes 清单、TLS/Ingress/出口路径、HPA 与连接池参数以及同等级数据库、Redis、对象存储和节点规格；任何差异必须写入报告并由验收人判断为 `FAIL` 或限定结论范围。

- [ ] **Step 5: 生成和校验报告**

```powershell
& $node load\render-report.mjs --input $env:PHYSICS_LOAD_RESULTS --output docs\capacity\capacity-v26-report.md
& $node tools\qa_capacity_report.cjs docs\capacity\capacity-v26-report.md
```

只有全部固定阈值、零丢失、幂等、权限隔离、故障恢复和备份恢复均 PASS，才可写“已在所列生产等价配置上验证 50,000 个云账号，且任意验收用滚动 5 分钟窗口内至少 5,000 个不同账号完成一次成功业务操作”。

---

## Task 10: 制作 Windows 签名 MSIX 与自动更新清单

**Files:**
- Create: `windows/package/Assets/`
- Create: `windows/package/generate-manifest.ps1`
- Create: `windows/package/build-msix.ps1`
- Create: `windows/package/generate-appinstaller.ps1`
- Create: `windows/package/test-install-matrix.ps1`
- Create: `windows/package/README.md`
- Create: `tools/qa_windows_package.cjs`
- Create: `tools/generate_release_manifest.ps1`
- Create: `schemas/release-manifest-v1.schema.json`
- Create: `docs/releases/2.6.0-windows-install-matrix.md`
- Modify: `tools/build_release.ps1`
- Modify: `Launcher.cs`
- Modify: `Installer.cs`
- Modify: `Uninstaller.cs`

- [ ] **Step 1: 写版本、签名和更新失败测试**

断言三份 EXE 与 MSIX 版本均为 `2.6.0.0`；MSIX identity publisher 必须从实际证书 Subject 读取；`.appinstaller` 只能使用 HTTPS，配置启动/后台检查、损坏修复和可回退版本；联网正式模式没有证书 thumbprint、时间戳 URL、更新 URI 或 HTTPS `CloudApiBaseUrl` 时构建直接失败。检查打包后的 `cloud-config.js` 只含公开 API 地址且工作区源文件仍为空配置。逐文件及压缩包扫描：Windows 临时联网 E2E 包最多只允许该次业务入口测试 CA，拒绝独立上游桩 CA；正式包拒绝业务入口、内部 mTLS、上游桩中的任何测试 CA。两类产物都拒绝上游桩 CA 指纹、固定 mount path、`NODE_EXTRA_CA_CERTS` 和测试桩主机；正式客户端必须依赖公开受信业务 API 证书链，不得通过安装测试 CA 才能运行。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_windows_package.cjs
```

- [ ] **Step 3: 实现签名顺序和一致发布者**

先构建 launcher→签名 launcher→构建并签名 uninstaller→把已签名 payload 嵌入 installer→签名 installer→打包 MSIX→签名 MSIX。所有签名使用同一证书和 RFC 3161 时间戳；每一步执行 `signtool verify /pa /all /v`，失败即停止。

- [ ] **Step 4: 生成 `.appinstaller`**

`generate-appinstaller.ps1` 强制传入环境变量 `$env:PHYSICS_UPDATE_BASE_URI` 对应的真实 HTTPS 地址，生成启动检查和每 8 小时后台检查策略；URI、版本和 MSIX 文件名来自同一构建元数据，不手工重复填写。没有 HTTPS 发布地址时跳过并明确标记“未配置自动更新”，不生成假的地址。

- [ ] **Step 5: 运行测试构建与正式门控检查**

```powershell
powershell -ExecutionPolicy Bypass -File windows\package\build-msix.ps1 -Configuration Test -Version 2.6.0.0 -OutputDirectory .build\windows-package\2.6.0
powershell -ExecutionPolicy Bypass -File tools\generate_release_manifest.ps1 -ArtifactDirectory .build\windows-package\2.6.0 -Version 2.6.0.0 -Output .build\windows-package\release-manifest-2.6.0.json
powershell -ExecutionPolicy Bypass -File windows\package\build-msix.ps1 -Configuration Test -Version 2.6.1.0 -OutputDirectory .build\windows-package\2.6.1
powershell -ExecutionPolicy Bypass -File tools\generate_release_manifest.ps1 -ArtifactDirectory .build\windows-package\2.6.1 -Version 2.6.1.0 -Output .build\windows-package\release-manifest-2.6.1.json
& $node tools\qa_windows_package.cjs -PackageDirectory .build\windows-package -BaselineManifest .build\windows-package\release-manifest-2.6.0.json -UpgradeManifest .build\windows-package\release-manifest-2.6.1.json
```

两个测试版本必须使用同一测试发布者身份和隔离 HTTPS 更新源；2.6.1 仅作为回退矩阵夹具，清单标记 `test-only`，不得进入正式发布目录或被宣传为正式版本。`generate_release_manifest.ps1` 在安装矩阵之前创建并按 `schemas/release-manifest-v1.schema.json` 校验两个清单，测试不得消费尚未生成的 Task 12 产物。

正式构建命令必须显式提供 `-CertificateThumbprint`、`-TimestampUrl`、`-UpdateBaseUri`、`-CloudApiBaseUrl` 和 `-RequireTrustedSignature`；这些外部发布资料到位前，不得声称正式签名、自动更新或云连接已完成。

- [ ] **Step 6: 在干净 Windows 环境验证安装、升级、修复与回退**

矩阵至少覆盖仍在支持期内的 Windows 10 与 Windows 11 x64 干净虚拟机，并分别验证：系统已有/没有 WebView2 Evergreen Runtime；通过 HTTPS `.appinstaller` 首装；签名兼容安装器首装；2.5.0→2.6.0 保留激活、本地题库、作答、附件和安全会话；启动检查与 8 小时后台检查；故意破坏一个非数据文件后的 App Installer 修复；先从隔离 HTTPS 更新源安装 Task 10 明确构建的 2.6.1 `test-only` 包，再按受控回退策略回到同一发布者签名的 2.6.0 基线包；卸载后用户数据保留/删除选择与说明一致。下载端必须返回正确 MIME、TLS 证书链和不可变文件字节，安装前后均复核签名和 SHA-256。若缺 WebView2，安装路径应使用微软正式 Evergreen bootstrapper 或给出可操作的离线运行时依赖，不得只在开发机已有运行时的情况下通过。

```powershell
powershell -ExecutionPolicy Bypass -File windows\package\test-install-matrix.ps1 -BaselineManifest .build\windows-package\release-manifest-2.6.0.json -UpgradeManifest .build\windows-package\release-manifest-2.6.1.json -RollbackTargetVersion 2.6.0.0 -Result docs\releases\2.6.0-windows-install-matrix.md
```

自动化只能记录机器、命令和结果；所有未实际运行的 OS/安装方式/修复/回退单元保持 `NOT_RUN`，任一正式目标单元不是 `PASS` 时不得标注“可在其他电脑正常安装和升级”。

---

## Task 11: 构建 Android v2.6.0 并校验升级连续性

**Files:**
- Modify: `android/tools/build_android.ps1`
- Modify: `android/AndroidManifest.xml`
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Modify: `android/res/xml/network_security_config.xml`
- Modify: `android/README.md`
- Create: `tools/qa_android_release_v26.cjs`

- [ ] **Step 1: 写版本和签名连续性失败测试**

测试要求 versionName `2.6.0`、versionCode `20600`；包名不变；release APK 使用已有同一签名身份；签名配置文件/keystore 不进入发布 ZIP、日志或 SHA 列表；API 23–36 元数据不回退。正式构建必须显式传入已有 keystore 与上一正式版证书 SHA-256；缺任一项、指纹不符或脚本尝试临时生成密钥时立即失败。临时自动生成的签名只允许 `-Configuration Test`，产物必须标记 `test-only` 且不能进入正式发布目录。联网正式构建要求 `-CloudApiBaseUrl` 为 HTTPS，并断言 APK 内 staging 配置与 Windows 使用同一 API origin。

安全测试还要求正式 manifest `usesCleartextTraffic=false` 并绑定 release network security config；不信任用户自装 CA、不忽略 SSL 错误、不允许 mixed content；WebView 关闭 file/content access，只允许 `https://appassets.androidplatform.net/assets/` 作为内部主文档，任何 `data:`, `blob:`, `file:`, `content:` 或外部 HTTP(S) 顶层导航都不得获得 `PhysicsStudioAndroid` 接口，外链只交系统浏览器。开发 loopback 明文只能存在于单独 test manifest，不能合并进 release APK。反编译扫描时，Android 临时联网 E2E 包最多只允许该次业务入口测试 CA，绝不信任 gateway→stub 专用 CA；正式 APK 拒绝业务入口、内部 mTLS、上游桩中的任何测试 CA。两类产物均拒绝上游桩 CA 指纹、非预期 network-security trust anchor、`NODE_EXTRA_CA_CERTS`、固定 mount path或测试桩主机。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_android_release_v26.cjs
```

- [ ] **Step 3: 构建并验证 APK**

```powershell
powershell -ExecutionPolicy Bypass -File android\tools\build_android.ps1 -Configuration Release -VersionName 2.6.0 -VersionCode 20600 -CloudApiBaseUrl $env:PHYSICS_API_BASE_URL -ReleaseKeystorePath $env:PHYSICS_ANDROID_KEYSTORE -ExpectedSignerSha256 $env:PHYSICS_ANDROID_PREVIOUS_SIGNER_SHA256 -RequireExistingReleaseKey
& $node tools\qa_android_release_v26.cjs -ApkPath 发布\Android\物理研习室-Android-v2.6.0.apk
```

使用 `apksigner verify --verbose --print-certs` 保存证书 SHA-256，并与独立保存的上一正式版证书指纹比对；不一致则阻止发布，避免用户无法覆盖升级。QA 同时反编译检查 release manifest/network security config 和 WebView 源码策略，确认没有明文例外、通配信任锚或测试签名回退。

- [ ] **Step 4: 真机升级回归**

在至少一台 Android 8/10/13/16 设备或对应受控模拟环境验证：从 2.5.0 覆盖安装、激活状态保留、本地题库/作答/附件保留、账号重新授权逻辑正确、离线启动、云同步、反馈和滚动页面。结果写入发布清单，不以编译成功代替真机验证。

---

## Task 12: 生成双端发布清单、哈希和最终验收报告

**Files:**
- Modify: `tools/generate_release_manifest.ps1`
- Modify: `schemas/release-manifest-v1.schema.json`
- Create: `tools/qa_release_v26.cjs`
- Create: `tools/qa-suite-v26.json`
- Create: `tools/run_qa_suite_v26.cjs`
- Create: `tools/run_real_cross_end_compose_e2e.ps1`
- Create: `tools/qa_real_cross_end_compose_e2e.cjs`
- Modify: `tools/qa_accessibility_v26.cjs`
- Create: `tools/accessibility/package.json`
- Create: `tools/accessibility/pnpm-lock.yaml`
- Modify: `tools/build_release.ps1`
- Modify: `README.md`
- Create: `docs/releases/2.6.0-verification.md`
- Create: `docs/releases/2.6.0-accessibility.md`

- [ ] **Step 1: 写发布清单失败测试**

清单为每个产物记录 `fileName, size, sha256, version, platform, signatureStatus, signerSubject, signerCertificateSha256, timestampStatus, apiBaseOrigin, cloudConfigSha256, buildCommit, builtAt`。`signatureStatus` 只能为 `trusted | test-only | unsigned`；只有 trusted 才能进入正式发布目录。SHA-256 从最终字节计算，签名后不得再修改文件；Windows 与 Android 联网正式包的 `apiBaseOrigin` 必须一致。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_release_v26.cjs
```

- [ ] **Step 3: 运行真实跨端 Compose E2E 门禁**

测试启动真实 `reverse-proxy + api + worker + PostgreSQL + Redis + S3 + mail-capture` Compose 组件和真实迁移，不得替换为内存假服务。使用隔离业务入口测试 CA 的 HTTPS 地址分别构建临时 Windows WebView2 包和 Android APK；该客户端入口 CA 与仅供 gateway 使用的上游桩 CA、内部 mTLS CA 必须不同。Windows 运行器只把本次业务入口根证书临时导入隔离测试账号的 `CurrentUser\Root`，导入前核对 PKI 清单指纹，并在 `try/finally` 删除证书及测试账号/资料；Windows 包本身不得携带任何测试 CA。Android E2E APK 使用独立 test applicationId 和测试签名，只有 test-only network security config 可为 Compose 精确主机引用本次业务入口根证书，测试后必须卸载并清除数据；它不得信任上游桩或内部 mTLS CA。正式双端包不得包含或信任任何测试 CA。在 Windows 干净测试机与受控 Android 模拟器/真机上完成：教师/学生登录、邀请码入班、离线作答入 outbox、重启、恢复网络后 push/pull、另一端拉取相同证据、教师下发/复核、S3 预签名上传及文件校验、反馈进入 mail-capture、跨班读取被拒绝、错误 origin/CORS/S3 预检被拒绝。数据库最终状态、客户端本地状态、审计和幂等记录必须一致；证书导入/指纹/清理和 Android 卸载任一失败均使 E2E 为 FAIL，产物扫描同时证明临时包和正式包均无桩 CA 字节、指纹、测试变量或地址。

```powershell
powershell -ExecutionPolicy Bypass -File tools\run_real_cross_end_compose_e2e.ps1 -EnvironmentLabel production-like -WindowsArtifact .build\windows-package -AndroidApk 发布\Android\物理研习室-Android-v2.6.0.apk
& $node tools\qa_real_cross_end_compose_e2e.cjs .build\real-cross-end-e2e\result.json
```

该门禁证明指定测试拓扑上的真实组件互通，不替代生产容量、正式 TLS 或真实设备覆盖结论；未实际启动双端和 Compose 时状态必须为 `NOT_RUN`。

- [ ] **Step 4: 运行全量自动化回归**

```powershell
& $node tools\run_qa_suite_v26.cjs
```

`qa-suite-v26.json` 为每个测试显式记录命令和参数；`run_qa_suite_v26.cjs` 按清单顺序运行并在首个失败处退出，因此不会误把需要参数的脚本当作无参数测试调用。全量清单必须包含 AI job 服务端/客户端/CSP 测试、桌面滚轮、触控板、Android 单指滑动、键盘/Page Down、320×568 至 1440×900 响应式检查。

- [ ] **Step 5: 执行 WCAG 2.2 自动化与人工无障碍验收**

`tools/accessibility/package.json` 只声明精确版本的 `axe-core` 与 `playwright-core` 开发依赖，生成并提交锁文件；CI 先在该目录执行 `pnpm install --frozen-lockfile`，不得使用未固定版本的 `pnpm dlx` 或远程脚本。在本地学习计划已建立的 `qa_accessibility_v26.cjs` 上增加兼容的 `--standard/--output` 参数和 axe 注入，不删除原有 index/输出目录调用方式。扩展后的脚本使用这份本地 axe-core 对学生首页、题目作答、分级提示、错题、报告、教师花名册、弹窗和反馈页在桌面与移动视口执行 WCAG 2.2 AA 规则；阻止 `critical/serious` 自动化问题进入正式发布，并另测键盘顺序、焦点可见、弹窗焦点锁定/恢复、状态非仅颜色表达、200% 放大、减少动画和 48dp 点击区。自动化不能替代辅助技术人工验收。

人工矩阵至少包括 Windows 11 + 当前受支持 NVDA 的全键盘任务，以及一台受支持 Android 设备 + TalkBack 的首次使用、完成一道题、读取公式/单位、查看反馈、提交错题和返回首页任务；记录版本、设备、任务、阻断问题与证据。只有 axe 自动化和 NVDA/TalkBack 必需任务均实际 `PASS`，才能表述“已按所列范围完成 WCAG 2.2 AA 验收”；否则保持 `NOT_RUN/FAIL` 并列出范围，不能宣称完整无障碍合规。

```powershell
& $pnpm --dir tools\accessibility install --frozen-lockfile
& $node tools\qa_accessibility_v26.cjs --standard wcag22aa --output docs\releases\2.6.0-accessibility.md
```

- [ ] **Step 6: 构建并生成哈希**

测试发布可生成 `test-only` 产物；正式发布只有取得可信证书和 HTTPS 更新地址后执行。Android APK、Windows MSIX、`.appinstaller`、兼容安装器分别生成 SHA-256；发布页展示这些值。

- [ ] **Step 7: 编写事实型验收报告**

`docs/releases/2.6.0-verification.md` 逐项记录命令、日期、结果和证据路径，并明确区分：

- `源代码/本地 QA NOT_RUN/PASS/FAIL`；
- `测试签名构建 NOT_RUN/PASS/FAIL`；
- `可信发布者签名 NOT_RUN/PASS/FAIL/BLOCKED_EXTERNAL_CERTIFICATE`；
- `生产等价容量 NOT_RUN/PASS/FAIL`；
- `真实跨端 Compose E2E NOT_RUN/PASS/FAIL`；
- `Windows 安装/升级/修复/回退矩阵 NOT_RUN/PASS/FAIL`；
- `axe 自动化与 NVDA/TalkBack 人工无障碍验收分别为 NOT_RUN/PASS/FAIL`；
- `生产域名、SMTP、对象存储和云资源是否已配置`。

任何未执行项保持 `NOT_RUN`，不能由代码检查推断为通过。

---

## Plan Completion Criteria

- `Phase Gate A: 基础设施联调门禁（Tasks 1–4）` 与 `Phase Gate B: 正式容量与发布门禁（Tasks 5–12）` 有独立状态和证据；前者可先供云/AI 联调，后者不在云同步与 AI 标准 E2E 通过前启动。
- 本地生产近似环境可重复启动，健康检查、指标、迁移、队列和反馈邮件链路有自动化证据。
- Node 24.15 AI gateway 在 env example、Compose 与 Kubernetes 中均只以 `NODE_USE_ENV_PROXY=1` 使用 `HTTPS_PROXY/NO_PROXY`；静态与真实代理测试证明流量经过受控出口代理，代理不可用时无直连回退。
- 上游桩 CA 与业务入口、内部 mTLS CA 独立，只在 AI test/e2e overlay 通过 gateway 的只读 `NODE_EXTRA_CA_CERTS` 使用并在测试后清理；生产镜像/清单及 Windows/Android 临时与正式包均无该 CA。
- 真实 Windows 与 Android 客户端对 Compose 全组件的登录、离线重连、同步、上传、反馈和班级权限 E2E 已实际执行并有可校验证据；未执行时明确 `NOT_RUN`。
- Kubernetes 清单满足无状态扩展、秘密隔离、最小权限、滚动更新、PDB、HPA 与低基数监控要求。
- 50,000/5,000 数据模型和 k6 套件可重复运行，报告只能由原始结果生成，未运行时明确 `NOT_RUN`。
- 数据库/缓存/队列/上游故障、离线重连、幂等、冲突、权限和备份恢复都有隔离环境验收路径。
- Windows 正式包只有在同一可信发布者证书、可信时间戳和 HTTPS 更新地址齐备时才标记 `trusted`；Android 签名身份与上一版一致。
- Windows 安装/升级/修复/回退矩阵及 axe、NVDA、TalkBack 验收均保留独立状态，不能用静态检查或编译成功代替人工/真机结果。
- 双端 v2.6.0 最终产物、SHA-256、签名状态和验证报告一致；容量目标未获生产等价 PASS 前不作保证性声明。
