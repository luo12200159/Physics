# 物理研习室云账号与增量同步客户端 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows WebView2 与 Android WebView 中接入真实账号、班级邀请和离线优先增量同步，同时保证断网不阻塞学习、刷新令牌不进入网页存储、冲突不静默丢失。

**Architecture:** 保持 `learning-engine.js` 为纯领域规则，新增 `client-storage.js`，以 IndexedDB 同一事务保存规范学习状态快照、逐条 outbox、实体 revision 和持久命令；`localStorage` 只保留小型非秘密迁移指针/兼容镜像，不再承载云 outbox。`sync-engine.js` 负责协议、重试、游标、bootstrap 和冲突。短时 access token 只保存在 JavaScript 内存；refresh token 由 Windows DPAPI 或 Android Keystore 保存。直接以 `file://` 打开只支持离线，联网浏览器调试必须使用受允许的 localhost 或真实 HTTPS origin。

**Tech Stack:** 原生 JavaScript、IndexedDB、Fetch API、WebView2 WebMessage、.NET Framework DPAPI、Android Keystore AES/GCM、Node.js `node:test`/`assert`、Playwright、Docker Compose、ADB/Android Emulator、既有 PowerShell 构建脚本。

## Global Constraints

- 本计划的实现前置顺序固定为：先完成 `2026-07-31-school-sync-backend-v1.md` 的独立服务端协议与真实 Compose API 门禁，再依次完成 `2026-07-31-local-learning-loop-v26.md` 和 `2026-07-31-teacher-class-tools-feedback-v26.md`；随后实施本计划 Tasks 1—10。Task 11 的打包宿主联调只消费部署计划的“基础设施联调门禁（Tasks 1—4）”，不等待容量、签名和正式发布任务。不得并行创建尚不存在的 `physics-math.js`、`teacher-tools.js` 或另写一套客户端协议。
- 登录请求固定为 `{ login, password, deviceId, deviceName }`；登录响应固定为 `{ accessToken, refreshToken, user }`；刷新请求体固定为 `{ refreshToken }`，响应同登录结构；业务请求使用 `Authorization: Bearer <accessToken>`。
- `POST /v1/sync/push` 请求体固定为 `{ cursor, events }`，响应固定为 `{ acceptedEventIds, conflicts, cursor }`；`GET /v1/sync/pull?cursor=<encoded>` 响应固定为 `{ changes, cursor, hasMore }`。
- 待发事件字段固定为 `eventId, entityType, entityId, operation, baseRevision, payload, idempotencyKey, createdAt`；`actorId` 与 `deviceId` 由已认证服务端上下文和已登记设备补全，客户端不得伪造其他用户。
- `eventId` 使用 `crypto.randomUUID()`；为兼容既有离线记录，`entityId` 保留 1—160 字符的客户端稳定 ID并匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$`，不得在升级时重写旧 Attempt/Profile ID。
- `deviceId` 复用激活模块生成的设备指纹，必须是 64 位十六进制字符串；发送登录请求前规范化为小写，不生成或替换为 UUID。
- 首次使用、未登录、未配置或用户关闭云同步时不产生账号、反馈、AI 或同步网络请求；用户明确登录并启用“保持登录与自动同步”后，启动会话恢复、联网恢复、回到前台和本地证据写入可以按本计划的有界调度自动请求。反馈、AI、数据删除与外发内容仍必须逐次明确确认。
- refresh token、密码、激活码不得写入 `localStorage`、IndexedDB、日志、错误报告或备份。
- 未部署服务端时，界面必须明确显示“云同步未配置”，不得展示虚假的在线班级或成功状态。
- 学生学习证据通过一次 IndexedDB 事务同时写本地状态和 outbox；教师班级/发布/复判等在线命令写入独立持久命令队列并显示 `待发送|已接受|需处理`，不得用内存点击直接重试。网络失败只能改变同步状态，不能回滚已完成的本地学习。
- 所有非登录类业务写请求统一使用持久 `CloudCommand` 与 16—128 字符 `Idempotency-Key`；重试、刷新会话和一次重新验证不得更换键。班级、分组、邀请创建/撤销、成员审批/分组/移除、监护关联、作业草稿/发布/答案释放、题目内容创建/审核、复判、考试导入、上传 presign/complete、反馈、报告、监护授权撤回、个人数据导出/删除均不得绕过命令队列。邀请加入明码、密码、refresh token 和 presigned URL 不进入 IndexedDB；邀请明码只在一次在线兑换请求的内存中存在。
- 服务端 DTO 必须在进入领域状态前通过严格 Schema：未知字段、未知枚举、越界长度、非规范时间、错误 revision、响应总字节超限一律进入可见 `protocol` 错误，不得宽松截断或猜测。
- 每完成一个任务，运行该任务列出的测试；测试未先出现预期失败，不得写实现代码。

在 PowerShell 中统一使用以下测试运行环境：

```powershell
$node = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

---

## Task 1: 固定客户端协议与配置边界

**Files:**
- Create: `cloud-config.js`
- Create: `schemas/cloud-sync-client-v1.schema.json`
- Create: `tools/qa_cloud_contract.cjs`
- Create: `tools/qa_cloud_security.cjs`
- Modify: `index.html`
- Modify: `Launcher.cs`
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Create: `android/res/xml/network_security_config.xml`
- Modify: `android/AndroidManifest.xml`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`

- [ ] **Step 1: 写协议失败测试**

`tools/qa_cloud_contract.cjs` 读取配置与 Schema，并断言：API 根地址只允许 `https:` 或本机开发地址；事件拒绝未知字段、空幂等键和超过 64 KiB 的 payload；登录、push、pull 的字段名与 Global Constraints 完全一致；`index.html` 在业务脚本前加载配置。Schema 还必须逐项定义 `SyncConflict`、`SyncChange`、`membership`、`assignment`、带 `view` 与决定/状态映射判别的角色化 `reviewDecision`、逐题得分、上传状态、严格下载 query 联合与短时下载响应、`TeacherReviewDetail|StudentReviewDetail`、题目内容创建响应、管理员内容审核队列/详情/审核响应、已发布题目内容列表/详情、题目内容快照、家长摘要、个人数据导出/删除响应和统一 `ApiErrorBody`，禁止以 `Record<string,unknown>` 作为客户端运行时契约。下载 query 的 `questionContentReview` 分支必须要求 `contextId=contentVersion`，不能退化为任意字符串旁路。个人导出状态与服务端外部 DTO 同为 `queued|processing|ready|failed|expired`，不得直接接受数据库内部状态名。

```js
assert.deepEqual(contract.loginResponse.required.sort(), ["accessToken", "refreshToken", "user"]);
assert.deepEqual(contract.loginRequest.required.sort(), ["deviceId", "deviceName", "login", "password"]);
assert.deepEqual(contract.pushResponse.required.sort(), ["acceptedEventIds", "conflicts", "cursor"]);
assert.equal(contract.syncEvent.additionalProperties, false);
assert.ok(index.indexOf('src="cloud-config.js"') < index.indexOf('src="learning-engine.js"'));
```

- [ ] **Step 2: 运行测试并确认因文件不存在而失败**

```powershell
& $node tools\qa_cloud_contract.cjs
& $node tools\qa_cloud_security.cjs
```

- [ ] **Step 3: 实现只读配置和严格 Schema**

`cloud-config.js` 只导出非秘密配置：

```js
window.PHYSICS_CLOUD_CONFIG = Object.freeze({
  protocolVersion: 1,
  apiBaseUrl: "",
  requestTimeoutMs: 15000,
  pushBatchSize: 100,
  maxPushRequestBytes: 921600,
  pullPageSize: 200,
  maxPullResponseBytes: 921600,
  maxEventBytes: 65536
});
```

空 `apiBaseUrl` 表示未配置；开发测试允许 `http://127.0.0.1` 与 `http://localhost`，发布构建拒绝其他明文 HTTP。Schema 为 event、login response、push response、pull response 以及全部服务端专有 DTO 分别设置 `additionalProperties: false` 和长度/数量上限；push 同时满足最多 100 事件且完整 UTF-8 JSON 请求不超过 921,600 字节，pull 同时满足最多 200 变更且完整响应不超过 921,600 字节。`membership|assignment|reviewDecision` 各自使用判别联合和固定 payload；题目内容快照固定包含 `questionId,contentVersion,contentHash,title,stem,richStemV1,options,attachmentRefs,gradingMethod,answerReleasePolicy,publishedAnswer,publishedSolution,publishedRichSolutionV1`。两个 rich 字段只能是本地计划定义的严格文本/公式 AST 段落或 `null`；答案、普通解析和结构化解析未到发布条件时必须同时为 `null`。

- [ ] **Step 4: 把新脚本纳入两端打包清单**

在 `index.html` 中将 `cloud-config.js` 放在 `security.js` 前；Windows 与 Android 构建脚本显式包含该文件，缺文件即构建失败。普通测试构建可保留空 URL 并显示“云同步未配置”；带 `-CloudApiBaseUrl` 的联网发布必须验证为 HTTPS，并在临时 staging 中生成仅含该公开 URL 的 `cloud-config.js`，不得修改工作区源文件或把任何秘密写入配置。

同时收紧宿主与页面网络边界：源 `Content-Security-Policy` 的 `connect-src` 只允许 `'self'` 和开发 loopback，联网构建只在 staging 中加入唯一 `CloudApiBaseUrl` origin；不得允许裸 `https:`、`*`、`null` origin 或任意 WebSocket。Windows 只允许虚拟 HTTPS 主机发起内部 API 请求。Android `usesCleartextTraffic=false`，仅 debug network-security-config 允许 loopback；WebView 禁止 file/content access、mixed content 和忽略 SSL 错误，JavaScript bridge 只挂载到 `https://appassets.androidplatform.net` 内部页面，外链交系统浏览器。契约测试还校验服务端预检必须精确回显允许 origin，允许 `Authorization,Content-Type,Idempotency-Key`，禁止通配凭据 CORS。直接 `file://` 打开固定为离线模式，不尝试云登录或同步。

- [ ] **Step 5: 运行协议测试**

```powershell
& $node tools\qa_cloud_contract.cjs
& $node tools\qa_cloud_security.cjs
```

预期：输出 `cloud contract QA passed`。

---

## Task 2: 建立统一的安全会话 JavaScript 适配器

**Files:**
- Create: `secure-session.js`
- Create: `tools/qa_secure_session.cjs`
- Modify: `index.html`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`

- [ ] **Step 1: 写三种宿主模式的失败测试**

测试通过 VM 注入 Windows `chrome.webview`、Android `PhysicsStudioAndroid` 和普通浏览器环境，固定公共接口：

```js
const session = window.PhysicsStudioSecureSession;
assert.equal(typeof session.readRefreshToken, "function");
assert.equal(typeof session.writeRefreshToken, "function");
assert.equal(typeof session.clearRefreshToken, "function");
assert.match(session.mode(), /^(windows-native|android-native|memory-only)$/);
```

还要断言 token 长度上限 4096、Windows 请求 5 秒超时、memory-only 不访问 localStorage/IndexedDB、错误对象不包含 token 原文。

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_secure_session.cjs
```

- [ ] **Step 3: 实现宿主选择与异步接口**

Windows 协议只允许：

```text
secure-session:read:<requestId>
secure-session:write:<requestId>:<base64url-token>
secure-session:clear:<requestId>
```

Windows 返回消息：

```json
{"channel":"physics-studio-secure-session","requestId":"req-123","ok":true,"token":"dGVzdA"}
```

Android 同步桥方法由 JavaScript 包装为 Promise：`readRefreshToken()`、`writeRefreshToken(base64urlToken)`、`clearRefreshToken()`。适配器只接受可逆 base64url 封装，不解析 JWT，也不把 token 放进 DOM。

- [ ] **Step 4: 纳入页面和安装包**

将 `secure-session.js` 放在 `cloud-api.js` 之前；两端构建脚本显式复制。

- [ ] **Step 5: 运行测试**

```powershell
& $node tools\qa_secure_session.cjs
```

预期：三种模式全部通过，测试存储中不存在 token。

---

## Task 3: Windows 使用 DPAPI 保存刷新令牌

**Files:**
- Modify: `Launcher.cs`
- Create: `tools/qa_windows_secure_session.cjs`
- Modify: `tools/build_release.ps1`

- [ ] **Step 1: 写宿主源码与编译失败测试**

测试检查：独立 `SecureSessionStorage`；目录为 `%LOCALAPPDATA%\物理研习室\Auth`；使用 `ProtectedData.Protect/Unprotect` 和 `DataProtectionScope.CurrentUser`；最大明文 4096 字节；临时文件后原子替换；只接收内部虚拟主机消息；不输出 token。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_windows_secure_session.cjs
```

- [ ] **Step 3: 实现安全存储**

新增 `SecureSessionStorage`，使用与激活存储不同的 entropy：`PhysicsStudioRefreshTokenV1`。`Write` 先写同目录随机临时文件，再用 `File.Replace` 或同卷 `File.Move` 完成替换；`Read` 解密失败时删除损坏文件并返回空；`Clear` 幂等。

- [ ] **Step 4: 扩展 WebMessage 分派**

保留既有激活协议；增加 `secure-session` 分支和严格 requestId/base64url 校验。响应只发给当前内部页面。外部导航、新窗口和非 `physics-studio.local` 来源不得调用存储。

- [ ] **Step 5: 编译并运行宿主烟雾测试**

```powershell
& $node tools\qa_windows_secure_session.cjs
powershell -ExecutionPolicy Bypass -File tools\build_release.ps1 -Version 2.6.0 -ReleaseDirectory .build\windows-test
if (-not (Test-Path -LiteralPath '.build\windows-test\物理研习室.exe')) { throw '本次构建产物不存在' }
& '.\.build\windows-test\物理研习室.exe' --smoke-test
```

预期：源码检查、编译和 WebView2 烟雾测试通过；发布目录中没有明文 token 文件。

---

## Task 4: Android 使用 Keystore AES/GCM 保存刷新令牌

**Files:**
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Create: `tools/qa_android_secure_session.cjs`

- [ ] **Step 1: 写桥接与源码失败测试**

断言 alias 固定为 `physics_studio_refresh_token_v1`；密钥存放 AndroidKeyStore；算法为 AES/GCM/NoPadding；随机 12-byte IV 与密文一起保存；桥接方法有 4096 字节上限；清除时同时删除密文和 Keystore entry；日志不含 token。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_android_secure_session.cjs
```

- [ ] **Step 3: 实现 Keystore 存储与桥接**

在 API 23+ 使用 `KeyGenParameterSpec` 创建不可导出的 AES-256 key，SharedPreferences 只保存 `base64(iv || ciphertext)`。新增：

```java
@JavascriptInterface public String readRefreshToken()
@JavascriptInterface public boolean writeRefreshToken(String base64UrlToken)
@JavascriptInterface public boolean clearRefreshToken()
```

解密异常时清理损坏数据并返回空字符串；不得降级为明文存储。

- [ ] **Step 4: 构建并验证签名 APK**

```powershell
& $node tools\qa_android_secure_session.cjs
powershell -ExecutionPolicy Bypass -File android\tools\build_android.ps1 -VersionName 2.6.0 -VersionCode 20600
```

预期：Java 编译和 APK 签名校验通过；桥接源码测试通过。

---

## Task 5: 实现认证恢复、统一持久命令与并发刷新锁

**Files:**
- Create: `cloud-api.js`
- Create: `cloud-command-queue.js`
- Create: `tools/qa_cloud_api.cjs`
- Create: `tools/qa_cloud_commands.cjs`
- Modify: `index.html`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`

- [ ] **Step 1: 写认证状态机失败测试**

使用可注入的 `fetch`、时钟和 secure-session，覆盖：成功登录、应用重启后恢复会话、损坏/撤销 refresh token、401 后只刷新一次、10 个并发 401 共用一个 refresh Promise、refresh token 轮换后覆盖旧值、重新验证只替换 10 分钟高强度 access token 且不改 refresh token、刷新失败清空云会话但保留本地资料、超时、429 `Retry-After`、离线、登出。命令测试覆盖所有业务写类别、同命令在网络重试/401 刷新/重新验证后仍使用同一 Idempotency-Key、正文改变不得复用键、进程重启后续传、服务端接受后才移除、4xx 转 `needs-attention`，以及秘密字段拒绝持久化。

公共接口固定为：

```js
PhysicsStudioCloudApi.configure({ baseUrl, fetchImpl, secureSession, deviceContext, clock });
PhysicsStudioCloudApi.restoreSession();
PhysicsStudioCloudApi.login({ login, password });
PhysicsStudioCloudApi.reauthenticate({ password });
PhysicsStudioCloudApi.logout();
PhysicsStudioCloudApi.request(path, options);
PhysicsStudioCloudApi.session(); // { status, user, accessExpiresAt, lastError }

PhysicsStudioCloudCommands.enqueue({ kind, method, path, body, requiresReauthentication });
PhysicsStudioCloudCommands.flush({ reason });
PhysicsStudioCloudCommands.status(commandId);
```

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_cloud_api.cjs
& $node tools\qa_cloud_commands.cjs
```

- [ ] **Step 3: 实现内存 access token 与安全 refresh token**

`login` 通过 `deviceContext()` 读取当前激活后的 `deviceId` 与受限长度的 `deviceName`；验证 `deviceId` 匹配 `^[0-9A-Fa-f]{64}$` 并转为小写后组成固定请求体，绝不把它转换成 UUID。校验严格响应后才把完整 refresh token 编码为 base64url 并写入 secure-session；读取时反向解码。用户上次明确启用“保持登录”且当前不是 `file://` 时，`restoreSession()` 在页面初始化后读取 secure refresh token，调用一次 rotate refresh，严格校验响应并恢复内存 access token；失败时清理失效令牌并显示重新登录，不循环刷新。`reauthenticate` 只接受当次密码并调用 `/v1/auth/reauthenticate`，成功后替换内存 access token，不写密码、不替换 refresh token。`request` 自动带 Bearer；401 只重放一次；`logout` 以 `{ refreshToken }` 请求服务端撤销，再无条件清本机 refresh token。密码和 deviceId 不进入状态对象、DOM、日志或反馈。

- [ ] **Step 4: 实现统一持久命令状态机**

`CloudCommand` 固定为 `{commandId,kind,method,path,bodyDigest,body,idempotencyKey,status,attemptCount,nextAttemptAt,requiresReauthentication,createdAt,updatedAt,lastErrorCode}`；status 只能是 `pending|awaiting-secret|sending|accepted|needs-attention|cancelled`。创建命令时在保存业务意图的同一 IndexedDB transaction 中生成一次 UUID idempotency key，之后任何自动重试、401 refresh 和一次高强度重新验证都复用原键。只有严格成功响应或同键服务端 replay 才写 accepted；网络/5xx/429 按有界退避，其他 4xx 保留命令与安全错误码供人工处理。

本任务先以注入的 `commandRepository` 定义和测试纯状态机；Task 6 的 `client-storage.js` 提供正式 IndexedDB repository 并在同一事务保存业务意图与命令。未注入持久 repository 时，发布构建必须禁用在线写操作，不得退化为只存在内存的命令。

允许的 `kind` 至少包含 `class.create|group.create|group.update|invite.create|invite.revoke|invite.join|membership.approve|membership.group|membership.remove|guardian.create|guardian.revoke|assignment.save|assignment.publish|assignment.release-solutions|question-content.create|question-content.review|review.decide|exam-record.import|upload.presign|upload.complete|feedback.submit|report.create|privacy.export|privacy.delete|privacy.delete.cancel|privacy.membership.withdraw|privacy.guardian.withdraw`。上传命令只持久化安全元数据、Blob 引用和业务 API 请求，不持久化 presigned URL；URL 过期时用原业务命令重新取得。`invite.join` 只持久化 commandId、Idempotency-Key、code 的 SHA-256 摘要和 `awaiting-secret` 状态，不保存明码；网络结果不确定时要求用户重新输入，摘要一致才以原键重试。重新验证密码同样只存在当前内存。所有命令响应必须通过 Task 1 的严格 DTO 后才能修改本地投影。

- [ ] **Step 5: 实现错误分类**

统一错误码：`not-configured | offline | timeout | unauthorized | forbidden | rate-limited | validation | server | protocol`。用户可见信息不包含响应头中的秘密、堆栈或请求体。

- [ ] **Step 6: 运行测试**

```powershell
& $node tools\qa_cloud_api.cjs
& $node tools\qa_cloud_commands.cjs
```

预期：所有认证、并发刷新和失败保留本地数据测试通过。

---

## Task 6: 迁移到事务型 IndexedDB 状态、outbox、revision 与冲突存储

**Files:**
- Modify: `learning-engine.js`
- Create: `client-storage.js`
- Create: `sync-state.js`
- Create: `tools/qa_sync_state.cjs`
- Modify: `backup.js`
- Create: `schemas/physics-studio-complete-backup-v2.schema.json`
- Create: `tools/qa_complete_backup_v2.cjs`
- Modify: `index.html`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`

- [ ] **Step 1: 写 v2.5→v2.6 迁移失败测试**

逻辑状态新增：

```js
cloudSync: {
  schemaVersion: 1,
  accountLink: null,
  cursor: "",
  outboxSummary: { count: 0, bytes: 0 },
  commandSummary: { pending: 0, needsAttention: 0 },
  pendingPush: null,
  entityRevisions: {},
  backfill: { profileId: "", status: "not-started", completedEntityKeys: [] },
  requiresBootstrap: false,
  conflictSummary: { count: 0 },
  lastAttemptAt: "",
  lastSuccessAt: ""
}
```

测试旧档案迁移不伪造 `accountId/classId/groupId`；未知字段被规范化；从 `localStorage` 分批迁入 IndexedDB 后原数据可校验；outbox 同时限制 10,000 条和 50 MiB，达到 10,001 条或字节高水位时绝不截断；单事件不超过 64 KiB；备份默认排除令牌且可完整恢复未同步事件、revision、backfill 水位和 bootstrap 标记。覆盖 IndexedDB transaction abort、`QuotaExceededError`、崩溃重开和兼容镜像损坏。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_sync_state.cjs
```

- [ ] **Step 3: 实现事件构造和 IndexedDB 事务提交**

`client-storage.js` 固定数据库 `physics-studio-client-v2`，object stores 为 `state, outbox, commands, conflicts, metadata, uploadBlobs, contentSnapshots`；`sync-state.js` 导出：

```js
PhysicsStudioSyncState.createEvent({ entityType, entityId, operation, baseRevision, payload, now });
PhysicsStudioSyncState.createOutboxRecord({ event, syncEligibility });
PhysicsStudioSyncState.beginPush(state, eventIds, requestKey);
PhysicsStudioSyncState.acceptEvents(state, acceptedEventIds);
PhysicsStudioSyncState.recordPullPage(state, changes, cursor);
PhysicsStudioSyncState.addConflicts(state, conflicts);
PhysicsStudioSyncState.applyPullChange(state, change);
```

调用方通过 `PhysicsStudioClientStorage.commitMutation({nextState,events,commands})` 在一个 IndexedDB transaction 中提交状态快照和逐条记录；`state.cloudSync` 只保存小型摘要与水位，完整 outbox/commands/conflicts 均按独立 object-store 记录保存。成功后才更新内存状态与 best-effort `localStorage` 兼容镜像。`localStorage` 兼容镜像不含 outbox、command、conflict、revision、内容快照或任何凭据，不能作为云同步事实来源。append-only 实体按 ID 去重；可修订实体读取/更新 `entityRevisions[entityType+":"+entityId]`；删除记录保留 tombstone。启动时 `initialize()` 完成旧数据迁移、未完成 transaction 恢复、`navigator.storage.estimate()` 与可用时的 `persist()` 请求，再允许正式作答。

达到 outbox 条数/字节上限时仍提交领域状态，但在同一事务写 `requiresBootstrap=true` 和明确的 sync gap；不生成会被截断的事件，界面持续显示“本地学习已保存，需联网重建同步”。空间不足时先清理可重建缓存，仍失败则尝试有界 emergency journal；任何存储均失败时必须阻止“已保存”提示并引导导出/释放空间，不能静默丢证据。IndexedDB 不可用的浏览器只进入 localStorage 离线兼容模式，云同步禁用。

首次关联旧档案时，用户确认后在一个事务中按 `profileId + entityType + entityId` 生成并持久化一次性 backfill event/idempotencyKey；完成一项即记录 watermark，崩溃后继续而不重新生成。换账号前必须完成导出或清除旧关联，不能复用另一账号的 backfill。

- [ ] **Step 4: 扩展备份 Schema**

`.pslab` 完整备份通过 storage snapshot transaction 读取，包含 cloud sync 的非秘密元数据、未同步 outbox、持久命令、entity revisions、backfill 水位和冲突副本；明确排除 access/refresh token、密码、邀请明码。轻量 JSON 导出继续排除整个云同步内部状态。

- [ ] **Step 5: 按最终依赖顺序加载并打包脚本**

最终依赖顺序固定为 `cloud-config.js` → `security.js` → `secure-session.js` → `cloud-api.js` → `client-storage.js` → `cloud-command-queue.js`，以及 `diagnostic-bank.js` → `content-catalog.js` → `learning-evidence.js` → `learning-planner.js` → `learning-engine.js` → `physics-math.js` → `teacher-tools.js` → `sync-state.js` → `sync-engine.js` → `cloud-content-cache.js` → `feedback-client.js` → `feedback-cloud.js` → `app.js` → `learning-lab.js` → `account-class-ui.js` → `experience-shell.js`；既有题库、备份和导入脚本保持它们当前的前置位置。本任务先加入已创建到 `sync-engine.js` 的脚本，Task 9 创建 `cloud-content-cache.js` 后按上述最终位置补入；每个任务完成时，Windows 与 Android 构建脚本都对当时已创建的根级脚本显式复制，缺失即失败。

- [ ] **Step 6: 运行迁移与备份回归**

```powershell
& $node tools\qa_sync_state.cjs
& $node tools\qa_cloud_commands.cjs
& $node tools\qa_complete_backup_v2.cjs
& $node tools\qa_backup_validator_fields.cjs
```

预期：旧档案无损迁移，事件和实体同存，备份不含凭据。

---

## Task 7: 实现增量推送、拉取、退避和冲突保留

**Files:**
- Create: `sync-engine.js`
- Create: `tools/qa_sync_engine.cjs`
- Modify: `index.html`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`

- [ ] **Step 1: 写同步状态机失败测试**

公共接口固定为：

```js
PhysicsStudioSync.configure({ api, engine, syncState, clock, random, online });
PhysicsStudioSync.enqueue(state, input);       // 返回 SyncEvent
PhysicsStudioSync.syncNow({ reason });         // 返回 { pushed, pulled, conflicts, cursor }
PhysicsStudioSync.status();                    // idle|offline|syncing|attention|error|disabled
PhysicsStudioSync.subscribe(listener);         // 返回 unsubscribe
```

覆盖：按 outbox 稳定顺序动态装批、100 条和 921,600 UTF-8 字节双上限、accepted 后才移除、相同事件 idempotencyKey 和相同批次 `Idempotency-Key` 请求头重试、push 响应 cursor 绝不改变 pull cursor、pull 多页、游标恢复、create/update/delete 全路径 revision、accepted 后尚未 pull 的修订阻塞、append-only 合并、revision 冲突保留双方、教师复核优先、tombstone、`cursor_expired` bootstrap、不支持的服务端版本停止同步、1/2/4/8/16/30 分钟带抖动退避，以及登录/恢复会话/online/前台/写后触发的单飞自动同步。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_sync_engine.cjs
```

- [ ] **Step 3: 实现单飞同步与批处理**

同一时刻只允许一个 `syncNow`；先 push 再 pull。本地空游标在 push 请求中序列化为 `null`，非空游标原样发送。选批必须按 `(createdAt,eventId)` 稳定排序逐条追加，每次用 `TextEncoder` 计算完整 `JSON.stringify({cursor,events})` 的 UTF-8 字节；加入下一条将超过 100 条或 921,600 字节时立即结束当前批次。单条合法 event 加 envelope 后仍超限时转为本地 validation conflict，不能阻塞其后事件或切断 JSON。测试固定覆盖 99/100/101 条、多个接近 64 KiB 事件、中文多字节正文和崩溃后相同分批边界。

push 批次首次发送时生成 16—128 字符的 `Idempotency-Key` 请求头并与精确 eventId 列表持久化，重试不得换键。服务端 push 响应中的 cursor 只做格式校验和诊断记录，**绝不写入 `cloudSync.cursor`**；客户端 pull 水位只能由成功应用的 pull 页面或 bootstrap 响应推进，防止漏过 push 之前已存在的 membership、assignment 或 reviewDecision。pull 循环到 `hasMore === false`，每一页先严格校验总字节/DTO，再与 cursor 在一个 IndexedDB transaction 中应用。仅网络/5xx/429 进入退避，401 交给 cloud-api，Schema/权限冲突进入 `attention`。

`entityRevisions` 的键固定为 `scope|entityType|entityId`。本地 create 使用 baseRevision 0；update/delete 必须读取已确认 revision。accepted push 只将该实体标记 `awaitingPullRevision`，不能猜测 revision；在对应自有 pull change 到达前，后续修订保留本地命令但不发送。每个 pull/create/update/delete 和 bootstrap snapshot 在同一事务写 revision/tombstone；conflict 使用 `serverRevision/serverPayload` 更新冲突基线但不覆盖本地值；人工解决后以该 serverRevision 创建新事件。append-only 类型永远保持 baseRevision 0，不能进入 revisioned update 路径。

- [ ] **Step 4: 实现过期游标 bootstrap 与冲突规则**

遇到 `409 cursor_expired` 或本地 `requiresBootstrap=true` 时停止普通 pull，显示原因并调用服务端授权 bootstrap 协议；bootstrap 分页必须返回严格 `{snapshotId,items,nextPageToken,cursor,complete}`，每项含实体类型、稳定 ID、revision、payload 和 tombstone。所有页的 `snapshotId` 必须一致，`complete=false` 时 `nextPageToken` 必须非空，最终页必须是 `complete=true,nextPageToken=null`；页 token 由服务端签名并绑定账号、固定 cutoff 和稳定排序键。客户端先写临时 server projection，全部页面连续、严格 DTO 校验通过后，才在一个 IndexedDB transaction 中原子替换云端投影、revision map 和 pull cursor；始终保留本地领域记录、未上传 outbox、持久 commands、conflicts、反馈草稿与附件。相同 append-only ID 合并去重，可修订实体有本地未发送修改时生成显式冲突，成员移除和无权实体从云投影删除。中断、缺页、账号不一致或校验失败时丢弃临时 projection 并维持原状态，不能部分重建。

作答、提示、迁移、复习和审核历史为 append-only；资料与复习计划使用 revision；教师审核不得被学生临时状态覆盖；普通资料冲突保留 `serverValue` 与 `localValue`，由有权限用户显式选择。未知实体类型隔离在冲突队列，不写入领域状态。

- [ ] **Step 5: 接入有界自动同步调度**

用户已启用自动同步时，成功 login/restoreSession 后立即调度一次；`window.online`、页面从 hidden 回到 visible、应用宿主 resume 以及 `commitMutation` 成功写入新 event/command 后用 2 秒 debounce 调度。调度只合并 reason，不并发运行；离线、未配置、未关联档案、`file://`、当前已有退避或用户暂停时零请求。Android 原生 `onResume` 和 Windows WebView2 激活只发送无数据的内部生命周期消息，不携带 token。失败遵守退避，手动“立即同步”可在不绕过服务端 Retry-After 的前提下提前触发。

- [ ] **Step 6: 运行同步测试**

```powershell
& $node tools\qa_sync_engine.cjs
```

预期：离线重连、幂等、冲突、墓碑和游标用例全部通过。

---

## Task 8: 把学习证据、方案和复核接入 outbox

**Files:**
- Modify: `learning-engine.js`
- Modify: `learning-lab.js`
- Modify: `experience-shell.js`
- Modify: `app.js`
- Create: `tools/qa_sync_domain_events.cjs`

- [ ] **Step 1: 写领域事件失败测试**

覆盖允许客户端推送的 `studentProfile`、`attempt`、`hintEvent`、`transferAttempt`、`correction`、`reviewSchedule`、`examRecord`、`submission`。测试一次正式作答只产生一个 Attempt create，重复 UI 提交不产生重复 event，待教师复核记录不被标记正确；另外逐项断言本地 1—5 信心不缩放、0—1 作答比例转成 0—100、`modelScore.total` 转成数值评分、`totalScore` 转成 `maxScore`、复习记录的 `ease/repetitions/lapses` 映射正确，并覆盖“实验选择题按 choice、数值填空按 numeric、需教师判分的计算过程按 modeling/shortAnswer”的评分方式优先规则。`growthRecord` 与本地推荐 `learningPlan` 不上传；教师 `assignment` 与 `reviewDecision` 走专用接口，服务端接受后通过 pull 变更下发。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_sync_domain_events.cjs
```

- [ ] **Step 3: 在领域写入点生成事件**

所有实体先由 `learning-engine.js` 规范化，再由本文件中的纯映射函数生成最小必要 payload，最后交给 `PhysicsStudioSync.enqueue`。映射规则固定为：

- `studentProfile` 将本地 `name` 映射为 `displayName`，并原样发送已规范化的 `grade` 与经用户确认的 `curriculumVersion`。缺少教材版本的旧档案由 state v5 迁移为 `curriculumVersion="未确认", curriculumVersionConfirmed=false`，不得猜测为“人教版”；此时不生成 `studentProfile` 云事件，并在账号关联界面要求学生或教师确认真实版本。确认后才置 `curriculumVersionConfirmed=true`、生成首个资料事件并上传。
- `confidenceBefore/confidenceAfter` 保持本地 1—5 整数；本地 `score` 必须在 0—1，上传时乘以 100；`modelScore` 只上传 `modelScore.total` 的 0—100 数值。
- `questionType` 首先由实际评分方式决定：固定选项/布尔答案→`choice`；带数值、单位与容差的结构化答案→`numeric`；要求证明→`proof`；实验数据、图像或实验论证且需过程评价→`experiment`；显式研究对象/受力/过程/方程建模量表→`modeling`；其余教师主观评分→`shortAnswer`。只有题目缺少 `gradingMethod/gradingSpec` 时才使用中文题型名称作为后备映射；“实验选择题”不得因标题含实验而覆盖 choice，“计算题”若评分过程而非单值不得误映射 numeric。无法确定时进入可见 validation conflict，不能静默猜测。
- `verificationIssues` 只取每项的稳定 `code|type` 字符串；`modelEvidence` 只允许服务端 `ModelEvidenceV1` 的九个字符串键 `researchObject,processSegmentation,idealizedAssumptions,coordinateSystem,forceAnalysis,stateProcessDistinction,equations,applicabilityConditions,resultCheck`，每项规范化后最多 2,000 字符、总 JSON 最多 12 KiB。未知键、对象、数组和非字符串标量进入可见 validation conflict，不得 stringify 或静默丢弃；本地迁移专用的 `legacyModelEvidence/legacyEvidenceNeedsReview` 明确不进入 payload 或 outbox。学生上行的 `teacherReviewStatus` 只能是客观题的 `notRequired` 或主观题的 `pending`，`teacherReviewedAt` 固定为 `null`，不得上行 `approved/returned`。
- 本地复习记录映射为 `{profileId,questionId,knowledgePointIds,dueAt,intervalDays,easeFactor: ease,repetition: repetitions,lapses,lastRating,lastReviewedAt,sourceAttemptId}`；知识点 ID 必须已满足客户端稳定 ID 规则。
- 每条 `correction` 必须映射为 `{submissionId,questionId,answer,explanation}`；`questionId` 只能来自该 submission 已固定的 answers，不能取当前打开页面或同名本机题作为后备值。多题作业按题分别追加订正，缺少或不属于该提交的题目 ID 进入可见 validation conflict，不能发送整卷含糊订正。
- 本地考试的 `totalScore` 映射为 `maxScore`；所有分项知识点标识先通过稳定 ID 校验。任何数值越界或 ID 不合规都生成本地 `validation` 冲突，不发送部分或篡改后的证据。

草稿图片和附件只生成元数据/上传引用，不塞进 64 KiB 事件。`local-only` 只能存在于 IndexedDB `OutboxRecord` 包装层 `{event,syncEligibility}`，不得写入严格 SyncEvent、payload 或 HTTP JSON；未关联账号、教材版本尚未确认或账号关联确认未完成时，领域状态照常保存但所有学习事件保持 `local-only`，不得先上传引用一个尚不存在的云端 `studentProfile`。历史 backfill 只在用户明确确认教材版本、账号与档案关联后按“资料事件先成功，再传其余证据”的顺序生成和发送。发送前测试必须对 envelope 做字段白名单序列化，保证包装元数据永不越过协议边界。

- [ ] **Step 4: 增加账号关联确认**

首次登录显示将要同步的资料类别、记录数和云班级；用户确认后写 `accountLink`。拒绝时继续本地使用，不自动上传。换账号必须先解除旧关联，不能把 A 学生档案上传到 B 账号。

- [ ] **Step 5: 运行领域和原有学习回归**

```powershell
& $node tools\qa_sync_domain_events.cjs
& $node tools\qa_learning_engine.cjs
& $node tools\qa_targeted_learning.cjs
```

预期：原有离线学习不变，已关联档案产生严格事件。

---

## Task 9: 实现账号、班级邀请码和同步状态界面

**Files:**
- Create: `account-class-ui.js`
- Create: `cloud-content-cache.js`
- Modify: `experience-shell.js`
- Modify: `experience-shell.css`
- Modify: `learning-lab.js`
- Modify: `index.html`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`
- Create: `tools/qa_cloud_account_ui.cjs`
- Create: `tools/qa_cloud_content_snapshots.cjs`
- Create: `tools/qa_cloud_privacy_ui.cjs`

- [ ] **Step 1: 写 UI 失败测试**

覆盖学生登录/退出、启动恢复会话、教师登录、家长只读登录、创建班级与分组、生成只显示一次的邀请码、加入班级、邀请过期/撤销/次数耗尽、待教师确认、确认/分组/移除成员、逐学生 assignment 下发、班级→作答下钻、复核队列/详情、上传状态轮询、题目内容快照缓存与答案延迟发布、监护授权撤回、个人数据导出/删除、同步中/离线/冲突/未配置、档案关联确认、重新验证、持久命令状态、键盘焦点、48dp 点击区和不暴露 refresh token。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_cloud_account_ui.cjs
```

- [ ] **Step 3: 实现“我的—账号与班级”**

学生只显示自己的班级、教师下发任务和同步状态。`POST /v1/invites/join` 的邀请码明码只放当次在线请求内存 `{ code }`，命令队列仅保存摘要、原 Idempotency-Key 和结果状态；结果不确定时由用户重新输入并核对摘要后重试，明码不进入 IndexedDB、备份或日志。成功后以服务端 membership 为准，本机 `classId/groupId` 只是只读缓存投影。

教师界面必须形成可操作的真实班级闭环：创建班级，创建/改名分组，生成和撤销限时限次邀请码（明码只显示一次），查看待确认与已加入花名册，确认/分组/移除成员，以及按班级→分组→学生→知识点→单次作答下钻。所有写入都先落持久 CloudCommand；`teacherRelease` 作业只允许通过 `assignment.release-solutions` 命令调用 `POST /v1/assignments/:id/release-solutions`，重试保持同一 Idempotency-Key。敏感操作收到 `reauthentication_required` 时只在当次对话框收集密码，调用 `PhysicsStudioCloudApi.reauthenticate()` 后以原 commandId/Idempotency-Key 重试一次，密码不保存。

本地教师工具批量生成的个别专项方案不直接上传为 `learningPlan`；教师确认下发时将每份方案的已发布题目快照转换成服务端 assignment：整班目标用 `target.type="class"`，分组目标用 `group`，逐学生方案用该学生的 active membership ID 和 `student`。同一知识范围的基础/进阶/挑战三档可以一次预览，但每一档发布前仍须教师确认。assignment 发布和教师复判走专用服务端接口；学生的 submission/correction 仍先本地落盘再通过 sync outbox 上传，完成状态与复判结果通过 pull 回到花名册，不能依赖 JSON 手工导入。

- [ ] **Step 4: 接入版本化题目内容快照与离线缓存**

`question-content.create` 严格发送 `{questionId,title,stem,richStemV1,options,attachmentRefs,gradingMethod,answer,solution,richSolutionV1,knowledgePointIds,source:{title,url,rightsBasis}}`，不得发送 `publishedRichSolutionV1`、status、hash、审核人或其他服务端字段；只接受严格响应 `{contentVersion,questionId,status:"draft",createdAt}`，并把服务端 `contentVersion` 绑定到原 CloudCommand 结果。管理员内容中心必须先调用 `GET /v1/question-content/review-queue?status=draft|published|withdrawn&cursor=` 取得严格分页项，再以 `GET /v1/question-content/:id/review-detail` 读取当前状态、内容、verified 附件元数据和审核历史；两条读取都要求管理员高强度会话。审核详情中的草稿附件只能以严格 `GET /v1/uploads/:id/download?contextType=questionContentReview&contextId=<contentVersion>` 下载；客户端只使用详情返回且属于该版本的 uploadId，不能把元数据、上传者身份或猜测 ID 当作授权。`question-content.review` 只能使用创建响应或队列/详情返回的 `contentVersion`，严格发送 `{decision:"approve"|"reject"|"withdraw"|"quarantine",reason}`，并严格校验服务端审核响应；不得从本机 questionId 推导、构造或猜测 UUID。界面按详情中的当前状态只开放合法转换，仍以 409 作为并发状态冲突事实，不能在客户端强行改写。扫描/AI 候选必须先进入教师确认后的 create 草稿，再由管理员审核；AI `reviewRequired:true` 不能替代内容审核。

assignment 不得只依赖本机 `questionId`。教师发布预览先通过 `GET /v1/question-content?status=published&cursor=` 取得严格的已审核版本元数据，再以 `GET /v1/question-content/:id` 读取获授权的完整版本；创建作业只提交该详情返回的服务端 `contentVersion`，不得由客户端猜测 UUID。学生收到的作业快照严格 DTO 固定为 `{questionId,contentVersion,contentHash,title,stem,richStemV1,options,attachmentRefs,gradingMethod,answerReleasePolicy,publishedAnswer,publishedSolution,publishedRichSolutionV1}`；`contentHash` 对包含结构化公式段落的规范 JSON 计算 SHA-256。内置题、教师新增题、扫描/AI 解析后经审核题都以不可变版本引用下发。客户端验证 hash 后在 `contentSnapshots` store 缓存，结构化公式只交给 `physics-math.js` 的白名单 AST 渲染器。附件不能拼对象存储地址：每次按当前资源调用严格 `GET /v1/uploads/:id/download?contextType=assignment|review|questionContent&contextId=...`，只接受 `{uploadId,method:"GET",url,expiresAt}`，在 60 秒内下载有界 Blob 并重新校验 size/SHA-256 后才缓存；URL 不进入 IndexedDB、日志或备份。离线作答只读 assignment 固定版本，缓存缺失或 hash 不符时显示“内容尚未完整同步”，不得用同 ID 的其他本机题替代。

`cloud-content-cache.js` 在 `sync-engine.js` 后加载，并显式加入 `index.html`、Windows payload/source ZIP 和 Android assets；安装包缺少该脚本或缓存 Schema 时构建失败。

`answerReleasePolicy` 只能是 `afterSubmit|afterDue|teacherRelease|never`。服务端未授权前 `publishedAnswer/publishedSolution/publishedRichSolutionV1` 必须为 `null`，客户端不得从教师草稿、本地内置答案或缓存旧版本提前拼出；授权的后续 revision 到达后才展示。提交时同时记录 `questionId+contentVersion+contentHash`，保证教师复判看到同一题面。内容被撤回时保留已提交记录所需的最小审计快照，但禁止新作答。

- [ ] **Step 5: 接入上传状态与教师复核读取协议**

上传固定状态查询 `GET /v1/uploads/:id`，严格返回 `{uploadId,status,failureCode,verifiedAt}`，status 只能是 `presigned|uploaded|verifying|verified|rejected|deleted`；complete 后按 1/2/4/8 秒、最长 2 分钟轮询，页面关闭后由持久命令恢复，只有 verified 可用于反馈、作业、内容或 AI。presigned URL 不持久化，过期后重新 presign。

教师复核使用 `GET /v1/reviews?classId=&status=&cursor=` 的严格 `{items,nextCursor}` 和 `GET /v1/reviews/:id` 详情。队列项严格为 `{reviewId,submissionId,assignmentId,membershipId,studentUserId,studentDisplayName,status,score,revision,submittedAt,latestDecisionAt}`；`score` 始终是服务端从逐题得分按 assignment 固定 `points` 加权并按协议舍入得到的 0—100 百分制，列表不重复下发答案或历史。详情必须按服务端判别字段 `view` 通过 `TeacherReviewDetail | StudentReviewDetail` JSON Schema：共用 assignment、学生作答时固定且 hash 一致的题目投影、答案、逐题得分、已验证附件元数据、追加订正、安全自动问题和时间字段；teacher view 另含 membership/student、同 contentVersion 的独立 `gradingReferences`、决定操作者及前状态/分数，student view 明确拒绝这些字段并只从 assignment release projection 获得获准答案。决定命令调用 `POST /v1/reviews/:id/decision`，body 不接受客户端总分，严格为 `{decision,perQuestionScores:[{questionId,scoreEarned,pointsPossible}],reason,annotation:{overallComment,items:[{questionId,category,visibility,location,comment}]},baseRevision}`；逐题数组必须唯一覆盖当前 submission 的全部 answers，`pointsPossible` 必须与固定作业快照相等，且 `0≤scoreEarned≤pointsPossible`。决定/响应使用服务端严格判别联合 `approve→approved | return→returned | rejudge→rejudged`，不得产生 `pending`。`reason` 与 `overallComment` 均明确对学生可见，内部说明只能放在 `teacherOnly` item；所有 annotation questionId 必须属于当前提交，`teacherOnly` item 只在 teacher view 存在，student view 只接受 `visibility:"student"` 的投影。订正按 `(createdAt,correctionId)`、决定按 `(revision,decisionId)` 排序；两类历史各到 100 条时界面禁用新增并显示协议上限，服务端仍以固定 409 拒绝并发越界。没有 reviewId/revision 时按钮禁用。另一班级、家长和非本人学生不能读取教师队列；未知 DTO 不进入界面。

- [ ] **Step 6: 实现家长只读摘要、授权撤回与个人数据权利入口**

家长先从 `GET /v1/parents/students` 取得仍有有效授权的学生显示资料，再只消费严格摘要 `{studentId,periodStart,periodEnd,learningMinutes,reviewDue,reviewCompleted,assignmentDue,assignmentCompleted,knowledgeModules:[{knowledgePointId,label,evidenceLevel,latestEvidenceAt}],generatedAt}`。完成率和“需要支持的模块”只能由这些计数与 `needsWork` 模块在本机展示层派生；不得下发题干、原始答案、错题全文、班级排名、教师内部批注或负面标签。授权关系显示授予班级、学生、时间和状态；教师/管理员通过 `POST /v1/guardian-links/:id/revoke`，已关联家长或学生通过 `POST /v1/privacy/guardian-links/:id/withdraw`，均以持久命令撤回；家长端收到 tombstone 后立即清除缓存摘要。客户端不得把本机角色切换当作云端家长权限。

“我的—数据与隐私”提供：`POST /v1/privacy/exports` `{format:"json"}`、`GET /v1/privacy/exports/:id` 状态/短时下载；高强度重新验证后 `POST /v1/privacy/deletion-requests` `{confirmed:true}`，以及撤销宽限期内请求的 `POST /v1/privacy/deletion-requests/:id/cancel`。导出走持久命令并只显示服务端外部状态 `queued|processing|ready|failed|expired`；删除创建只显示已确认返回的 `gracePeriod` 与 `graceEndsAt`，取消只显示已确认返回的 `cancelled` 与 `cancelledAt`。v1 没有删除状态 GET 路由，客户端不得根据时间、本机定时器或登录失败猜测内部 `processing|completed|failed`，也不得把本地备份冒充云端导出；最终注销后的会话失效只触发安全退出与中性说明。删除确认明确说明本机离线数据与云数据边界；用户另行明确选择时才清本机学习档案，不得把云端注销扩张为静默删除离线数据。

- [ ] **Step 7: 实现冲突处理页**

只有可修订资料展示“采用云端/保留本机副本”；作答和审核历史不得提供覆盖按钮。每次选择生成新的 revision 事件并保留审计理由。

- [ ] **Step 8: 运行 UI、内容与隐私测试**

```powershell
& $node tools\qa_cloud_account_ui.cjs
& $node tools\qa_cloud_content_snapshots.cjs
& $node tools\qa_cloud_privacy_ui.cjs
```

预期：各角色只能看到有权限的操作，所有失败状态可恢复且不影响本地学习。

---

## Task 10: 接入用户反馈服务和本机邮件备用路径

**Files:**
- Create: `feedback-cloud.js`
- Modify: `experience-shell.js`
- Modify: `Launcher.cs`
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Modify: `index.html`
- Modify: `android/tools/build_android.ps1`
- Modify: `tools/build_release.ps1`
- Create: `tools/qa_feedback_cloud.cjs`

- [ ] **Step 1: 写反馈隐私与状态失败测试**

`feedback-client.js` 继续只负责本地草稿、预览、截图上限与 `mailto:`，源码保持无 `fetch`；新的 `feedback-cloud.js` 组合其白名单预览与 `PhysicsStudioCloudApi`。发送给业务服务端的严格字段固定为 `category, description, currentPage, contact, appVersion, systemType, redactedLogs, attachmentIds, confirmed`，其中 `systemType` 只能是 `windows|android`，`confirmed` 必须为 `true`。默认 `redactedLogs` 与 `attachmentIds` 均为空数组，payload 不含题干、答案、学生名、班级、设备指纹和 token；本机的同意版本可保留为草稿审计元数据，但不得作为未知字段发给严格 API。离线只存草稿且恢复联网后仍须再次确认。

- [ ] **Step 2: 运行并确认失败**

```powershell
& $node tools\qa_feedback_cloud.cjs
```

- [ ] **Step 3: 实现 HTTPS 发送与真实状态**

已登录用户确认预览后把 `POST /v1/feedback` 写成持久 `feedback.submit` CloudCommand；未登录、云服务未配置或离线且尚未确认时只保留本地草稿与系统邮件备用路径，不后台匿名提交。若用户主动选择截图，先按 `feedbackAttachment` 用途通过 `upload.presign`、对象 PUT、`upload.complete` 和 `GET /v1/uploads/:id` 状态轮询，只把严格状态为 verified 的 upload ID 放入 `attachmentIds`；未选择截图时保持空数组。每个业务 API 写阶段复用各自已持久 Idempotency-Key，presigned URL 不落盘。只在服务端返回 `queued` 后显示“已受理，编号 …”，随后严格轮询 `GET /v1/feedback/:id`；服务端状态为 `sent` 才显示“邮件已发送”。网络或邮件队列失败显示可重试状态，禁止把“已保存草稿”写成“已发送”。目标邮箱只配置在服务端，不下发邮件凭据。

- [ ] **Step 4: 实现系统邮件备用入口**

Windows `OpenExternal` 安全允许 `mailto:`，Android 延用系统 Intent；收件人为 `luo865265@gmail.com`，主题和正文经 URL 编码，正文仍遵守默认脱敏。没有邮件客户端时显示可复制的收件地址和反馈编号。

同时按 Task 6 定义的最终脚本顺序在 `feedback-client.js` 后加载并打包 `feedback-cloud.js`；构建测试必须确认 Windows 和 Android 产物中均同时存在本地与云反馈模块。

- [ ] **Step 5: 运行反馈测试与宿主回归**

```powershell
& $node tools\qa_feedback_client.cjs
& $node tools\qa_feedback_cloud.cjs
& $node tools\qa_android_bridge.cjs index.html qa-output\android-bridge-v26
powershell -ExecutionPolicy Bypass -File tools\build_release.ps1 -Version 2.6.0 -ReleaseDirectory .build\windows-test
```

预期：反馈状态准确，两端备用路径可用，不泄露学习资料。

---

## Task 11: 完成端到端离线、重连与跨设备验收

**Files:**
- Create: `tools/qa_cloud_sync_e2e.cjs`
- Create: `tools/qa_cloud_sync_playwright.cjs`
- Create: `tools/run_cloud_compose_e2e.ps1`
- Create: `tools/qa_windows_webview2_cloud_e2e.ps1`
- Create: `android/tools/qa_android_cloud_e2e.ps1`
- Modify: `README.md`
- Modify: `android/README.md`

- [ ] **Step 1: 建立严格假服务单元测试与真实 Compose 契约环境**

轻量假服务只用于可控的超时、畸形 DTO、超大响应和网络中断单元测试，不得作为发布端到端证据。契约 E2E 先启动后端计划已经独立通过的 `server/compose.yaml`，再叠加部署计划“基础设施联调门禁（Tasks 1—4）”提供的 production-like TLS 入口、受控 origin 与依赖配置；环境必须包含 TypeScript Fastify API、PostgreSQL、Redis、对象存储、普通 worker 与邮件捕获服务，运行真实迁移并创建 `student-a`、`teacher-a`、`parent-a` 和两个相互隔离班级。测试客户端读取服务端实际 Schema/响应；不得复制一套会自行通过的内存协议，也不得等待部署计划 Tasks 5—12 的容量或正式发布结果。

- [ ] **Step 2: 写并运行浏览器与真实后端端到端场景**

```powershell
& $node tools\qa_cloud_sync_e2e.cjs
& $node tools\qa_cloud_sync_playwright.cjs
powershell -ExecutionPolicy Bypass -File tools\run_cloud_compose_e2e.ps1
```

必须覆盖：离线完成作答→关闭重开→IndexedDB 数据仍在→启动恢复会话→确认关联/backfill→动态 900 KiB 分批同步→第二设备 bootstrap/pull；push cursor 不跳过预先存在 assignment；重复 push/command 不重复；revision update/delete/conflict；过期游标原子 bootstrap 且保留本地 outbox/conflicts；上传 verified 轮询；教师取得 reviewId/revision 后以唯一覆盖全部题目的逐题得分复判，服务端派生百分制，决定状态映射、学生可见理由、teacherOnly 裁剪、错误 annotation questionId 与第 101 条历史均按严格契约处理；多题 submission 的逐题 correction 带正确 questionId，缺失或跨题 ID 被拒；教师创建题目后从严格响应取得 contentVersion，管理员从审核队列发现同一草稿、读取 review-detail 并以 `questionContentReview` 上下文下载该草稿实际引用的 verified 附件后审核，教师/学生/猜测版本或非引用附件均为 404，任何客户端均不得猜 ID；自定义题目快照和附件离线打开、答案按策略延迟；家长只见摘要且撤权后缓存清除；个人数据导出/删除真实状态；跨班级读取 403；登出后本地学习仍可用；未配置和 `file://` 时零云请求。Compose 结束前从 PostgreSQL 核验无重复实体、无跨班记录，并核对 Redis 幂等/会话与对象存储授权。

- [ ] **Step 3: 在 Windows WebView2 与 Android 宿主执行同一契约**

Windows 脚本构建测试 launcher，以 `https://physics-studio.local` 虚拟主机连接 Compose HTTPS 测试入口；运行器只把本次业务入口测试 CA 临时导入隔离测试账号的 `CurrentUser\Root`，先核对清单指纹，并在 `try/finally` 删除证书和测试账号/资料，Windows 包本身不携带测试 CA。Android 脚本在 API 23 与当前目标 API 的受控 emulator/device 安装独立 test applicationId、测试签名 APK；其 test-only network security config 只对 Compose 精确主机信任本次打包的业务入口测试 CA，测试后卸载并清除应用数据。该 CA 与 gateway 上游桩 CA、内部 mTLS CA 必须不同；两端临时包不得包含或信任后两者，正式包不得包含或信任任何测试 CA。Windows 验证 DPAPI session restore、CSP exact origin、滚动/前台恢复、离线写后重连、外链只交系统浏览器和 refresh token 不在 WebView 存储。Android 通过 `https://appassets.androidplatform.net` 执行相同登录、自动同步、内容快照、上传和复判场景；用 ADB 切断/恢复网络并触发 background/resume，验证 Keystore session restore、明文 HTTP/混合内容/非受控 SSL error 拒绝、非内部页面不能调用 JavaScript bridge。两端都直接请求真实 Compose API，不使用 mocked fetch；证书导入、指纹、清理和产物扫描任一失败均使 E2E 为 FAIL。

```powershell
powershell -ExecutionPolicy Bypass -File tools\qa_windows_webview2_cloud_e2e.ps1
powershell -ExecutionPolicy Bypass -File android\tools\qa_android_cloud_e2e.ps1
```

- [ ] **Step 4: 运行全量客户端回归**

```powershell
& $node tools\qa_learning_engine.cjs
& $node tools\qa_learning_features.cjs index.html qa-output\learning-features-v26
& $node tools\qa_student_complete_experience.cjs
& $node tools\qa_targeted_teacher_ui.cjs
& $node tools\qa_cloud_contract.cjs
& $node tools\qa_cloud_security.cjs
& $node tools\qa_secure_session.cjs
& $node tools\qa_cloud_api.cjs
& $node tools\qa_cloud_commands.cjs
& $node tools\qa_sync_state.cjs
& $node tools\qa_sync_engine.cjs
& $node tools\qa_sync_domain_events.cjs
& $node tools\qa_cloud_account_ui.cjs
& $node tools\qa_cloud_content_snapshots.cjs
& $node tools\qa_cloud_privacy_ui.cjs
& $node tools\qa_feedback_client.cjs
& $node tools\qa_feedback_cloud.cjs
```

- [ ] **Step 5: 更新能力边界说明**

README 必须区分：本地离线能力、配置服务端后的云同步能力、`file://` 离线限制、未部署时不可用的功能；说明 refresh token 的两端存储与启动恢复方式、档案关联/backfill、自动同步触发、退出行为、revision/冲突/bootstrap、题目快照与答案发布、家长只读边界、数据导出删除入口。不得写“已支持 5 万人”或“保证 5 万人同时使用”，容量声明只能引用实际完成的生产等价压测报告。

---

## Plan Completion Criteria

- Windows 与 Android 的真实 Compose 契约 E2E 通过；浏览器 `file://` 明确只支持离线，联网浏览器测试仅使用受允许的 localhost/HTTPS origin；任何网页存储和备份中都找不到 refresh token。
- 本地正式作答、outbox 与持久 command 使用 IndexedDB 事务保存；断网、崩溃、900 KiB 动态分批、重复提交、revision、游标恢复和 cursor-expired bootstrap 测试不丢作答、不跳变更，push cursor 从不推进 pull 水位。
- membership 是云端权限事实来源，修改本地 `classId/groupId` 不能取得班级数据。
- 班级、邀请、成员、作业、复判、上传、反馈、报告、监护撤权和隐私请求全部通过可恢复 Idempotency-Key command queue；服务端专有 DTO 未经严格验证不能进入状态。
- 教师自定义题以不可变内容版本和 SHA-256 快照下发并可离线打开；答案/解析严格遵守发布策略；教师能取得真实 reviewId/revision，家长只获得授权摘要。
- 启动恢复、login、online、前台和写后自动同步在单飞/退避边界内工作；直接浏览器打开、未登录、未配置或用户暂停时零云请求。
- 个人云数据导出、删除与监护授权撤回有真实状态和客户端入口，本机离线数据不会被云端操作静默删除。
- 云服务未配置或不可达时，两端题库、作答、错题、复习和报告仍可正常使用。
- 反馈只在服务端真实入队/送达后展示对应状态，目标邮箱为 `luo865265@gmail.com`。
- CSP、CORS、Android cleartext/mixed-content/bridge/SSL 和 Windows virtual-host 边界测试通过；全量客户端 QA 与两端构建通过，容量结论留给部署容量计划的生产等价测试。
