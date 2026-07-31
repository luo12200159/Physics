# 物理研习室本地学习闭环 v2.6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有题库与设备激活机制的前提下，为 Windows WebView2 和 Android WebView 建成可迁移、可核验、可解释的本地学习闭环，并修复学习实验室滚动。

**Architecture:** 保留 `PHYSICS_LEARNING_ENGINE` 作为兼容门面，把规范化证据与掌握/能力计算放入新的纯规则模块 `learning-evidence.js`，把摸底、每日快照、双周广覆盖与徽章放入新的纯规划模块 `learning-planner.js`；UI 仍由 `learning-lab.js` 与 `experience-shell.js` 消费同一份离线状态。`diagnostic-bank.js` 是与现有 1900 道正式题完全分离的原创前概念内容包；所有学习写入先落本机，任何联网能力均不参与本计划。

**Tech Stack:** 原生 JavaScript、Web Storage、HTML/CSS、Node.js `assert`/`vm`、Playwright Core、Microsoft Edge、Windows WebView2、Android WebView、PowerShell、既有 `.pslab` ZIP 备份。

## Global Constraints

- 目标版本固定为 `2.6.0（本地能力）`；本计划不实现账号、班级、同步、服务端、反馈、邮件、部署或容量压测。
- 保持 Windows 与 Android 的离线可用性；联网能力不得成为本地学习的单点故障。
- 不取消现有离线模式、设备激活机制、Windows 版或 Android 版。
- 不修改 `activation-public-key.js`、`activation.js`、`activation.css`、`ActivationManager.cs`，也不改变一机一码或现有公钥指纹。
- 不修改 `curriculum-bank.js`、`mock-exam-bank.js`、`original-practice-bank.js`、`targeted-practice-bank.js`、`exam-question-index.js` 中的既有题目；正式完整题仍为 1900 道、索引 232 条、总记录 2132 条。
- `diagnostic-bank.js` 是独立前概念诊断库，不计入上述正式题库数量；至少 75 道原创诊断覆盖当前 55 章，每章至少 1 道，高频误区章节配置第 2 道。
- 不把本地关键词评分表述为标准化能力测评；所有能力结论固定显示“形成性学习建议，不是标准化测评分数”。
- 不把待教师复核的主观题计作正确或错误证据；未复核记录不得覆盖已经形成的可靠状态。
- 掌握规则固定为：至少两个不同日期的低提示独立正确，并至少一次经自动可靠核验或教师核验为正确的迁移；最高提示等级不高于 1 才属于低提示独立正确。
- 旧 `errorType` 映射到新的主要错误类型；无法映射时保留原文本并标记待整理。
- 旧迁移记录保持待复核，不自动变成掌握证据；迁移后的旧审核文字只作为 `legacyVerificationStatus` 保存。
- 本地学习状态升级时保留现有题库、作答、复习、试卷、成长记录和实验记录；完整 `.pslab` 备份继续支持旧状态导入并迁移到 state v5。
- 每个年级的摸底快照最多 30 题，正常蓝图为 24 道核心知识题和 6 道前概念辨析题；结果保存知识点结论、样本量、题型覆盖和最近证据日期，而不是只有总分。
- 每日任务固定为 15—25 分钟微循环，顺序为诊断、同类基础、条件变式、跨情境复测、到期复习；生成后保存快照，当天不因状态变化换题。
- 每 14 天插入广覆盖检测，优先长期没有证据的知识点；最多顺延 7 天且只允许顺延一次，专项推荐不得删除、替换或重置该检测。
- 徽章仅有“完成完整闭环”“完成错题订正”“按期完成复习”三种；每个本机档案每种最多授予一次，不提供排行榜、抽奖、积分、连续签到、惩罚或重复刷题奖励。
- 学习实验室高度链固定为：`#learningLabContent { height: 100%; min-height: 0; }`、`.lab-shell { height: 100%; min-height: 0; }`、`.lab-panel { min-height: 0; overflow-y: auto; touch-action: pan-y; }`；`touch-action: none` 只允许出现在草稿画布。
- UI 必须验证 320×568、360×640、390×844、1440×900；Windows 覆盖滚轮、触控板等价滚动、键盘焦点和 Page Down，移动端覆盖单指慢滑、快速滑动、反向滑动与横竖屏切换。
- 正文计算字号不低于 16px、辅助文字通常不低于 14px、可操作控件可触区域不低于 48×48px；普通文字对比度至少 4.5:1，并提供可见焦点、非颜色状态、减少动画和题干三档字号。
- “高级工具”继续保留并默认折叠；标题栏、当前档案和关闭按钮在滚动、换页和旋转后始终可达。
- 不新增第三方运行时依赖；QA 使用当前仓库已有的 Node.js、Playwright Core 和 Microsoft Edge。
- 每个任务严格执行红—绿 TDD：先运行所列测试并观察到指定失败，再写最小实现，再运行同一命令确认通过；每个任务结束前运行其回归命令。

PowerShell 测试环境统一为：

```powershell
$node = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

---

## File Map

### New production files

- `learning-evidence.js`：state v5 实体规范化、旧记录迁移、Attempt/HintEvent/TransferAttempt、掌握判定、知识点证据汇总和七维能力画像；不访问 DOM 或网络。
- `learning-planner.js`：年级摸底、每日任务快照、14 天广覆盖检测和克制徽章；只消费题目只读视图、诊断库、课程目录与 `learning-evidence.js`。
- `diagnostic-bank.js`：75 道以上原创“答案＋理由＋置信度”前概念题及真实审核元数据；与正式题库分离。
- `physics-math.js`：从严格白名单的结构化公式 AST 安全创建 MathML/HTML 回退节点和可读 `aria-label`，不解析任意 HTML，不猜测旧题字符串。

### Existing production files to modify

- `learning-engine.js`：将 `STATE_VERSION` 升为 5，保存新集合，并作为兼容门面导出新模块接口；保留现有评分、复习、组卷、实验与高级工具接口。
- `learning-lab.js`：采集提示事件，写规范 Attempt/TransferAttempt，提供本地教师迁移核验，呈现摸底/能力/广覆盖/徽章，并管理面板滚动位置。
- `learning-lab.css`：修复弹窗高度链、触摸滚动和新增本地学习卡片样式。
- `experience-shell.js`：用持久化每日快照替代首页临时 `dailyTest`，展示能力画像、摸底、双周检测与徽章，同时保留 `dailyTest()` 兼容 API。
- `experience-shell.css`：新增学生首页与能力画像布局，保证指定小屏无横向溢出。
- `styles.css`：统一字号、对比度、48px 触控目标、焦点和减少动画 token。
- `app.js`：继续通过 `getMasteryEvidence()` 消费门面，并在学习状态变化后刷新规范掌握证据。
- `index.html`：最终按 `curriculum-taxonomy.js` → `diagnostic-bank.js` → `content-catalog.js` → `learning-evidence.js` → `learning-planner.js` → `learning-engine.js` → `physics-math.js` 的依赖顺序加载新增脚本。
- `backup.js`：完整备份写出 state v5、question backup v5 与应用版本 2.6.0，并继续恢复 v4 学习状态和 question backup v4。
- `Launcher.cs`、`Installer.cs`、`tools/build_release.ps1`、`android/tools/build_android.ps1`：把四个新脚本加入 Windows/Android 发布资产清单。
- `android/src/com/physicsstudio/studyroom/MainActivity.java`：仅把 UA 中的应用版本改为 2.6.0，不改激活桥接和权限逻辑。
- `README.md`：记录本地能力、证据边界和 QA 命令。

### New QA files

- `tools/qa_learning_state_v5.cjs`
- `tools/qa_learning_evidence_v26.cjs`
- `tools/qa_transfer_mastery_v26.cjs`
- `tools/qa_capability_profile_v26.cjs`
- `tools/qa_diagnostic_program_v26.cjs`
- `tools/qa_learning_planner_v26.cjs`
- `tools/qa_learning_badges_v26.cjs`
- `tools/qa_local_learning_ui.cjs`
- `tools/qa_learning_lab_scroll.cjs`
- `tools/qa_math_rendering_v26.cjs`
- `tools/qa_accessibility_v26.cjs`
- `tools/qa_local_learning_release_v26.cjs`

## Shared Interfaces

所有日期字段均为 ISO 8601 字符串；所有集合均为普通 JSON，可直接进入 `localStorage` 与 `.pslab`。2.6 迁移期保留旧 `durationSeconds`、`hintLevel`、`grading`、`errorType` 字段，但新计算只能读下列规范字段：

```js
// Attempt
{
  id, profileId, questionId, sessionId, assignmentId,
  knowledgePointIds, questionType, modelFamilyId,
  variantRole, difficulty, startedAt, completedAt,
  activeDurationSeconds, hintViewCount, maxHintLevel,
  confidenceBefore, confidenceAfter, finalAnswer,
  gradingStatus, score, verificationIssues,
  primaryErrorType, secondaryErrorTypes,
  reflection, selfExplanation, modelEvidence, modelScore,
  legacyModelEvidence, legacyEvidenceNeedsReview,
  teacherReviewStatus, teacherReviewedAt, createdAt
}

// HintEvent
{ id, attemptId, level, openedAt }

// TransferAttempt
{
  id, profileId, sourceQuestionId, variantId, variantType,
  response, gradingStatus, verificationMethod,
  reviewComment, reviewedBy, reviewedAt, createdAt
}
```

Attempt 的 `confidenceBefore/confidenceAfter` 固定为 1—5 整数或 `null`；`score` 固定为 0—1 的作答得分比例或 `null`；`modelScore` 固定为 `{total:0—100,detail:{...}}`。云同步若采用百分制，必须在协议适配层显式转换，不能改写本地历史值。

新写入的 `modelEvidence` 固定为严格可选字符串对象，只允许 `researchObject,processSegmentation,idealizedAssumptions,coordinateSystem,forceAnalysis,stateProcessDistinction,equations,applicabilityConditions,resultCheck` 九个键；每项 trim 后最多 2,000 字符，完整 JSON 最多 12 KiB。未知键、对象、数组或非字符串值不得进入新 Attempt。新记录固定 `legacyModelEvidence=null,legacyEvidenceNeedsReview=false`。迁移若遇到既有未知字段，先以拒绝 `__proto__/constructor/prototype` 的安全 JSON 解析器读取，再将原值规范序列化为最多 12 KiB 的字符串保存在本机 `legacyModelEvidence` 并标记 `legacyEvidenceNeedsReview=true`；超限值整体隔离到备份迁移报告而不是截断。新画像和云同步均不解析、读取或上传该兼容字符串，避免无损迁移与严格协议互相冲突。

固定接口：

```js
migrateState(rawState) => LearningStateV5
recordAttempt(state, input) => Attempt
recordTransferAttempt(state, input) => TransferAttempt
reviewTransferAttempt(state, input) => TransferAttempt
verifiedTransferAttempts(state, sourceQuestionId, profileId) => TransferAttempt[]
summarizeKnowledgeEvidence(state, questions, profileId) => KnowledgeEvidenceSummary[]
buildCapabilityProfile(state, questions, profileId) => CapabilityProfile
getOrCreateBaselineSnapshot(state, questions, options) => BaselineSnapshot
recordBaselineResponse(state, input) => BaselineSnapshot
getOrCreateDailyTaskSnapshot(state, questions, options) => DailyTaskSnapshot
getOrCreateBroadCoverageCheck(state, questions, options) => BroadCoverageCheck | null
deferBroadCoverageCheck(state, checkId, input) => BroadCoverageCheck
recordBroadCoverageResponse(state, input) => BroadCoverageCheck
evaluateBadgeEligibility(state, event, now) => BadgeAward[]
```

证据口径依据已确认规格 §§5.3、7、8、9、11、18、19：待复核记录只显示“包含待复核”，不进入正误分子；跨日期、低提示和经核验迁移共同构成掌握；题型覆盖、样本量、来源和最近日期共同约束形成性结论；不可变快照避免推荐过程中移动目标；双周广覆盖用于减少个性化推荐的选择盲区。

---

### Task 1: 建立 state v5 无损迁移与兼容门面

**Files:**
- Create: `learning-evidence.js`
- Create: `tools/qa_learning_state_v5.cjs`
- Modify: `learning-engine.js:4-14,341-414,2088-2144`
- Modify: `experience-shell.js:160-205`
- Modify: `index.html:569-585`
- Test: `tools/qa_learning_state_v5.cjs`

**Interfaces:**
- Consumes: `physics-learning-loop-v1` 中 version 4 的普通 JSON；`defaultState()` 的既有 `profiles/diagnosticAttempts/attempts/reviews/assignments/learningPlans/examRecords/growthRecords/importedReports/contentReviews/experimentRecords/settings`。
- Produces: `window.PhysicsStudioLearningEvidence.migrateState(rawState)`；state v5 新集合 `hintEvents`, `transferAttempts`, `baselineSnapshots`, `dailyTaskSnapshots`, `broadCoverageChecks`, `badgeAwards`；规范化学生档案新增 `curriculumVersion` 与 `curriculumVersionConfirmed`，旧档案迁移为“未确认”且不得据此筛选课程或上传云端；`PHYSICS_LEARNING_ENGINE.normalizeState()` 与 `loadState()` 始终返回 version 5。

- [ ] **Step 1: 写 v4→v5 失败测试**

创建自包含的 VM 测试，保留一个旧作答、旧迁移、旧复习和旧考试，并验证迁移不改变原输入：

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const storage = new Map();
const context = vm.createContext({
  console, Date, Math, JSON, Object, Array, Map, Set, RegExp, String, Number, Boolean,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value))
  }
});
context.window = context;
for (const file of ["learning-evidence.js", "learning-engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const engine = context.PHYSICS_LEARNING_ENGINE;
const legacy = {
  version: 4,
  activeProfileId: "student-default",
  profiles: [{ id: "student-default", name: "本机学生", role: "student", grade: "高一" }],
  attempts: [{ id: "old-a1", profileId: "student-default", questionId: "q1", hintLevel: 1 }],
  diagnosticAttempts: [],
  reviews: { q1: { questionId: "q1", dueAt: "2026-08-01T00:00:00.000Z" } },
  examRecords: [{ id: "exam-1", profileId: "student-default", score: 80, totalScore: 100 }],
  experimentRecords: [{ id: "old-t1", type: "transfer", profileId: "student-default", questionId: "q1", verificationStatus: "教师已通过" }]
};
const original = JSON.parse(JSON.stringify(legacy));
const migrated = engine.normalizeState(legacy);
assert.equal(migrated.version, 5);
for (const key of ["hintEvents", "transferAttempts", "baselineSnapshots", "dailyTaskSnapshots", "broadCoverageChecks", "badgeAwards"]) {
  assert.ok(Array.isArray(migrated[key]), key);
}
assert.equal(migrated.attempts[0].id, "old-a1");
assert.equal(migrated.profiles[0].curriculumVersion, "未确认");
assert.equal(migrated.profiles[0].curriculumVersionConfirmed, false);
assert.equal(migrated.reviews.q1.questionId, "q1");
assert.equal(migrated.examRecords[0].id, "exam-1");
assert.deepEqual(legacy, original, "migration must not mutate v4 input");
assert.deepEqual(engine.normalizeState(migrated), migrated, "v5 normalization must be idempotent");
const shellSource = fs.readFileSync(path.join(root, "experience-shell.js"), "utf8");
assert.match(shellSource, /<option>人教版<\/option>/);
assert.match(shellSource, /<option>未确认<\/option>/);
assert.doesNotMatch(shellSource, /<option>教科版<\/option>|<option>沪科版<\/option>/);
console.log("learning state v5 migration QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_learning_state_v5.cjs
```

预期：首次因 `learning-evidence.js` 不存在失败；创建空模块后应因 `4 !== 5` 或缺少 `hintEvents` 失败。

- [ ] **Step 3: 写最小迁移函数和 v5 默认集合**

`learning-evidence.js` 不直接访问存储，且每次返回新顶层对象和新集合；`learning-engine.js` 的 `normalizeProfile()` 对 `curriculumVersion` 做 1—40 字符白名单文本规范化。旧值缺失时设为“未确认”并令 `curriculumVersionConfirmed=false`，不根据姓名、班级或年级猜测教材版本；学生或教师明确选择当前真实支持的版本后才置为 `true`。未确认档案只能使用按课标/年级组织的通用内容，不能按教材版本推荐，也不能把猜测值上传云端。

同时把首次启动和“我的—身份与学习设置”的教材版本选项收敛为“人教版”和“未确认”：选择“人教版”写入 `curriculumVersionConfirmed=true`，选择“未确认”写入 `false`。不得继续展示当前并无对应课程目录的“教科版/沪科版”选项；后续只有在实际内容包和映射表存在后才能增加版本。

```js
(() => {
  "use strict";
  const STATE_VERSION = 5;
  const ARRAY_KEYS = [
    "hintEvents", "transferAttempts", "baselineSnapshots",
    "dailyTaskSnapshots", "broadCoverageChecks", "badgeAwards"
  ];

  function migrateState(rawState) {
    const source = rawState && typeof rawState === "object" && !Array.isArray(rawState)
      ? rawState
      : {};
    const migrated = { ...source, version: STATE_VERSION };
    for (const key of ARRAY_KEYS) {
      migrated[key] = Array.isArray(source[key]) ? source[key].map((item) => ({ ...item })) : [];
    }
    return migrated;
  }

  window.PhysicsStudioLearningEvidence = Object.freeze({
    stateVersion: STATE_VERSION,
    migrateState
  });
})();
```

在 `learning-engine.js` 中保持 `STORAGE_KEY = "physics-learning-loop-v1"` 不变；把 `STATE_VERSION` 改为 5，`defaultState()` 加入六个新数组，`normalizeState(raw)` 的第一句改为调用 `PhysicsStudioLearningEvidence.migrateState(raw)`，随后沿用既有长度限制和档案规范化。

- [ ] **Step 4: 固定脚本加载顺序和门面导出**

`index.html` 在 `learning-engine.js` 前加载新模块：

```html
<script src="content-catalog.js"></script>
<script src="learning-evidence.js"></script>
<script src="learning-engine.js"></script>
```

`PHYSICS_LEARNING_ENGINE` 增加 `stateVersion: 5` 与 `migrateState`，但保留现有全部导出名称。

- [ ] **Step 5: 运行迁移测试和既有引擎测试**

```powershell
& $node tools\qa_learning_state_v5.cjs
& $node tools\qa_learning_engine.cjs
```

预期：第一条输出 `learning state v5 migration QA passed`；第二条输出 JSON 且 `status` 为 `passed`。

- [ ] **Step 6: 提交本任务**

```powershell
git add learning-evidence.js learning-engine.js experience-shell.js index.html tools\qa_learning_state_v5.cjs
git commit -m "feat: add lossless learning state v5 migration"
```

---

### Task 2: 规范 Attempt 与 HintEvent 证据并迁移旧字段

**Files:**
- Modify: `learning-evidence.js`
- Modify: `learning-engine.js:372-398,873-933,1028-1184,1402-1481,2021-2085`
- Modify: `learning-lab.js:10-45,440-568,1426-1465,1673-1713,1792-1848`
- Modify: `experience-shell.js:479-528,1178-1195,1347-1414`
- Create: `tools/qa_learning_evidence_v26.cjs`
- Test: `tools/qa_learning_evidence_v26.cjs`

**Interfaces:**
- Consumes: Task 1 的 state v5、`recordAttempt(state,input)` 旧调用、题目只读元数据 `curriculumSectionId/curriculumChapterId/examPoints/questionType/examQuestionType/modelFamilyId/variantRole/difficulty`。
- Produces: `normalizeAttempt(record)`, `createAttempt(input, context) => { attempt, hintEvents }`, `attemptGradingStatus(attempt)`, `attemptMaxHintLevel(attempt)`, `attemptDurationSeconds(attempt)`；门面 `recordAttempt()` 仍返回 Attempt，并同时追加 HintEvent。

- [ ] **Step 1: 写规范字段、重复提示和主观题边界失败测试**

`tools/qa_learning_evidence_v26.cjs` 使用与 Task 1 相同的 VM 装载方式，核心断言如下：

```js
const state = engine.defaultState();
const attempt = engine.recordAttempt(state, {
  questionId: "q-force",
  sessionId: "session-1",
  knowledgePointIds: ["pep-h-required-1-c03-s05", "kp-h1-cf322f389390948c"],
  questionType: "计算题",
  modelFamilyId: "force-family-1",
  variantRole: "core",
  difficulty: "基础",
  startedAt: "2026-07-31T08:00:00.000Z",
  completedAt: "2026-07-31T08:03:00.000Z",
  activeDurationSeconds: 180,
  hintEvents: [
    { level: 1, openedAt: "2026-07-31T08:01:00.000Z" },
    { level: 1, openedAt: "2026-07-31T08:01:10.000Z" },
    { level: 3, openedAt: "2026-07-31T08:02:00.000Z" }
  ],
  confidenceBefore: 2,
  confidenceAfter: 4,
  finalAnswer: "6 N，方向向右",
  gradingStatus: "correct",
  score: 1,
  verificationIssues: [],
  primaryErrorType: "方向或符号",
  secondaryErrorTypes: ["单位"],
  modelEvidence: { equations: "F合=F拉-f" },
  modelScore: { total: 80, detail: {} },
  selfExplanation: "先规定正方向，再对共线力作代数求和。"
});
assert.equal(attempt.hintViewCount, 3);
assert.equal(attempt.maxHintLevel, 3);
assert.equal(state.hintEvents.length, 3);
assert.ok(state.hintEvents.every((event) => event.attemptId === attempt.id));
assert.equal(attempt.activeDurationSeconds, 180);
assert.equal(attempt.gradingStatus, "correct");
assert.equal(attempt.questionType, "计算题");
assert.deepEqual([...attempt.knowledgePointIds], ["pep-h-required-1-c03-s05", "kp-h1-cf322f389390948c"]);

const legacyPending = evidence.normalizeAttempt({
  id: "old-subjective", profileId: "student-default", questionId: "open-1",
  durationSeconds: 90, hintLevel: 2,
  grading: { status: "review-required", score: null, issues: [{ type: "manual" }] },
  errorType: "表述不清"
});
assert.equal(legacyPending.activeDurationSeconds, 90);
assert.equal(legacyPending.maxHintLevel, 2);
assert.equal(legacyPending.gradingStatus, "pending");
assert.equal(legacyPending.teacherReviewStatus, "pending");
assert.equal(legacyPending.primaryErrorType, "");
assert.equal(legacyPending.legacyErrorType, "表述不清");
assert.equal(legacyPending.errorTypeMigrationStatus, "pending");
console.log("learning evidence v2.6 QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_learning_evidence_v26.cjs
```

预期：`evidence.normalizeAttempt is not a function`，或 `hintViewCount` 实际为 `undefined` 而期望为 3。

- [ ] **Step 3: 实现状态枚举、旧错因映射与规范作答工厂**

在 `learning-evidence.js` 固定下列枚举和适配器；无法映射的旧错因不得删除：

```js
const GRADING_STATUSES = new Set(["pending", "correct", "partial", "incorrect"]);
const ERROR_TYPES = new Set([
  "审题", "概念", "建模", "规律适用条件", "计算",
  "单位", "方向或符号", "图像或实验", "表达", "猜测作答"
]);
const LEGACY_ERROR_MAP = Object.freeze({
  "读题": "审题", "概念不清": "概念", "模型": "建模",
  "公式": "规律适用条件", "运算": "计算", "单位错误": "单位",
  "方向": "方向或符号", "图像": "图像或实验", "表述": "表达", "猜测": "猜测作答"
});

function canonicalGradingStatus(record) {
  const value = record.gradingStatus || record.grading?.status;
  if (value === "review-required") return "pending";
  return GRADING_STATUSES.has(value) ? value : "pending";
}

function normalizeLegacyError(record) {
  const value = String(record.primaryErrorType || record.errorType || "").trim();
  if (!value) return { primaryErrorType: "", legacyErrorType: "", errorTypeMigrationStatus: "empty" };
  if (ERROR_TYPES.has(value)) return { primaryErrorType: value, legacyErrorType: "", errorTypeMigrationStatus: "mapped" };
  if (LEGACY_ERROR_MAP[value]) return { primaryErrorType: LEGACY_ERROR_MAP[value], legacyErrorType: value, errorTypeMigrationStatus: "mapped" };
  return { primaryErrorType: "", legacyErrorType: value, errorTypeMigrationStatus: "pending" };
}
```

`createAttempt()` 以 `completedAt` 为唯一完成时间，分别计算提示次数与最高提示等级，并为每次打开生成独立 HintEvent；同时写旧字段作为 2.6 兼容投影，新计算不得再读取旧字段。

- [ ] **Step 4: 把 UI 提示点击改为事件列表**

`newSession(question)` 增加 `sessionId` 和 `hintEvents`；每次允许的提示点击都追加事件，即使同一级被再次打开：

```js
const openedAt = new Date().toISOString();
lab.session.hintEvents.push({ level, openedAt });
lab.session.hintLevel = Math.max(lab.session.hintLevel, level);
```

`completeAttempt()` 传入规范题目元数据、`activeDurationSeconds`、`hintEvents`、规范 grading 字段以及上述严格 `modelEvidence`；QA 覆盖九个合法键、未知键、非字符串值、单项与总字节边界，以及旧未知对象只进入本地 legacy 字段。知识点 ID 优先使用现有 `curriculumSectionId/curriculumChapterId`；对仅有 `examPoints` 的题目，先把 `<gradeCode>|<label>` 做 Unicode NFKC、首尾去空格、连续空白折叠，再按 UTF-8 字节分别以 `0x811c9dc5` 和 `0x9e3779b9` 为初值计算 32 位 FNV-1a，各输出 8 位小写十六进制并串联为 `kp-<gradeCode>-<16hex>`。年级代码固定为 `g8|g9|h1|h2|h3`，算法用跨 Node/浏览器测试向量锁定，并在 QA 中检查当前目录无碰撞；若检测到碰撞，内容构建必须失败，不能运行时改 ID。不得把中文、百分号编码文本或运行时猜测的教材节 ID 写进稳定标识；显示名称和版本化 `knowledgePointCatalog` 映射仍保留原 `examPoints` 文本。

- [ ] **Step 5: 切换所有学习计算到规范适配器**

`questionMasteryEvidence()`、`summarizeLearning()`、`topicPerformance()`、`studentAnalysis()`、`growthTimeline()` 和 `experience-shell.js` 的有效练习统计改用 `attemptGradingStatus/attemptMaxHintLevel/attemptDurationSeconds`。`gradingStatus === "pending"` 不增加正确或错误数量，只将相关结论标为包含待复核。

- [ ] **Step 6: 运行新旧证据测试**

```powershell
& $node tools\qa_learning_evidence_v26.cjs
& $node tools\qa_learning_engine.cjs
& $node tools\qa_targeted_learning.cjs
```

预期：第一条输出 `learning evidence v2.6 QA passed`；后两条保持 `status: "passed"`。

- [ ] **Step 7: 提交本任务**

```powershell
git add learning-evidence.js learning-engine.js learning-lab.js experience-shell.js tools\qa_learning_evidence_v26.cjs
git commit -m "feat: normalize attempts and hint events"
```

---

### Task 3: 建立 TransferAttempt、教师核验与可达掌握路径

**Files:**
- Modify: `learning-evidence.js`
- Modify: `learning-engine.js:1018-1094,2088-2144`
- Modify: `learning-lab.js:881-920,1077-1334,1426-1525,1852-1899`
- Modify: `experience-shell.js:2476-2486`
- Modify: `app.js:1227-1257`
- Create: `tools/qa_transfer_mastery_v26.cjs`
- Test: `tools/qa_transfer_mastery_v26.cjs`

**Interfaces:**
- Consumes: Task 2 的规范 Attempt、state v5 `transferAttempts`、旧 `experimentRecords[type="transfer"]`；`PhysicsExperience.getState().role/displayName`。
- Produces: `recordTransferAttempt`, `reviewTransferAttempt`, `verifiedTransferAttempts`；教师审核输入固定为 `{ transferAttemptId, gradingStatus, reviewComment, reviewedBy, reviewedAt? }`，其中 gradingStatus 仅允许 `correct|partial|incorrect`。

- [ ] **Step 1: 写旧迁移隔离与教师通过可达失败测试**

```js
const state = engine.defaultState();
const questionId = "mastery-q";
for (const completedAt of ["2026-07-29T10:00:00.000Z", "2026-07-30T10:00:00.000Z"]) {
  const attempt = engine.recordAttempt(state, {
    questionId, sessionId: `s-${completedAt}`, knowledgePointIds: ["kp-h1-95258c82e6adc746"],
    questionType: "计算题", variantRole: "core", difficulty: "基础",
    completedAt, activeDurationSeconds: 180, hintEvents: [],
    gradingStatus: "correct", score: 1, verificationIssues: [],
    finalAnswer: "2 s", selfExplanation: "竖直分运动满足自由落体规律。"
  });
  attempt.createdAt = completedAt;
}
const pending = engine.recordTransferAttempt(state, {
  profileId: state.activeProfileId,
  sourceQuestionId: questionId,
  variantId: `${questionId}:variant:far:0`,
  variantType: "far",
  response: "把平抛模型迁移到不同高度，竖直方向仍由 h=gt²/2 决定时间。"
});
assert.equal(pending.gradingStatus, "pending");
assert.equal(engine.questionMasteryEvidence(state, questionId).status, "熟练");
engine.reviewTransferAttempt(state, {
  transferAttemptId: pending.id,
  gradingStatus: "correct",
  reviewComment: "模型、适用条件与关键方程完整。",
  reviewedBy: "本机教师QA",
  reviewedAt: "2026-07-31T09:00:00.000Z"
});
assert.equal(engine.questionMasteryEvidence(state, questionId).status, "已掌握");

const legacyState = engine.normalizeState({
  version: 4,
  activeProfileId: "student-default",
  profiles: [{ id: "student-default", name: "学生", role: "student", grade: "高一" }],
  attempts: state.attempts,
  experimentRecords: [{
    id: "legacy-transfer", type: "transfer", profileId: "student-default",
    questionId, response: "旧迁移回答", verificationStatus: "教师已通过",
    createdAt: "2026-07-28T10:00:00.000Z"
  }]
});
const migratedLegacy = legacyState.transferAttempts.find((item) => item.legacyRecordId === "legacy-transfer");
assert.equal(migratedLegacy.gradingStatus, "pending");
assert.equal(migratedLegacy.legacyVerificationStatus, "教师已通过");
assert.equal(engine.verifiedTransferAttempts(legacyState, questionId, "student-default").length, 0);
assert.equal(engine.normalizeState(legacyState).transferAttempts.length, legacyState.transferAttempts.length);
console.log("transfer review and mastery QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_transfer_mastery_v26.cjs
```

预期：`engine.recordTransferAttempt is not a function`；若只迁移旧状态，则应先看到旧“教师已通过”被错误计证据的断言失败。

- [ ] **Step 3: 实现追加写迁移记录与严格核验过滤器**

```js
function isVerifiedTransfer(record) {
  if (record.gradingStatus !== "correct") return false;
  if (record.verificationMethod === "automatic") return record.automaticReliability === "reliable";
  return record.verificationMethod === "teacher"
    && Boolean(String(record.reviewedBy || "").trim())
    && !Number.isNaN(new Date(record.reviewedAt || "").getTime());
}

function reviewTransferAttempt(state, input) {
  const record = state.transferAttempts.find((item) => item.id === input.transferAttemptId);
  if (!record) throw new Error("未找到迁移记录。");
  if (!["correct", "partial", "incorrect"].includes(input.gradingStatus)) throw new Error("迁移复核结论无效。");
  const reviewedBy = String(input.reviewedBy || "").trim();
  if (!reviewedBy) throw new Error("迁移复核必须记录实际审核者。");
  record.gradingStatus = input.gradingStatus;
  record.verificationMethod = "teacher";
  record.reviewComment = String(input.reviewComment || "").trim().slice(0, 2000);
  record.reviewedBy = reviewedBy.slice(0, 160);
  record.reviewedAt = new Date(input.reviewedAt || Date.now()).toISOString();
  return record;
}
```

`recordTransferAttempt()` 每次提交追加一条记录，不覆盖旧回答；初始 `gradingStatus="pending"`、`verificationMethod="teacher"`。迁移 v4 时按 `legacyRecordId` 去重，所有旧记录一律 pending，并保留原状态文字。

- [ ] **Step 4: 把掌握判定改为只消费核验迁移**

删除 `experimentRecords` 字符串状态对掌握的直接影响；`questionMasteryEvidence()` 只调用 `verifiedTransferAttempts()`。待复核、partial、incorrect 或缺少教师审核者/时间的迁移均不增加掌握证据。理由文字区分“有待复核迁移”与“有经核验正确迁移”。

- [ ] **Step 5: 增加本地教师迁移审核队列**

`renderTeacher()` 展示所有 `gradingStatus === "pending"` 的 TransferAttempt，包含学生、母题、变式、完整回答、审核意见以及“通过/部分/退回”。点击处理器必须同时满足 `PhysicsExperience.getState().role === "teacher"` 和非空 `displayName`；`PhysicsExperience.getState()` 增加真实本机 `displayName` 返回值。学生模式不渲染审核按钮，且不能通过修改表单字段直接设置 `reviewedBy/reviewedAt`。

- [ ] **Step 6: 切换迁移 UI 到规范接口**

`saveTransferRecord()` 调用 `recordTransferAttempt()`，`variantId` 固定为 `${sourceQuestionId}:variant:${variantType}:${index}`；界面只展示最新提交，但审核历史保留。教师决定后调用 `saveLearningState()` 并派发 `physics-learning-state-changed`，使 `app.js` 立即刷新 mastery map。

- [ ] **Step 7: 运行掌握与旧 UI 回归**

```powershell
& $node tools\qa_transfer_mastery_v26.cjs
& $node tools\qa_learning_engine.cjs
& $node tools\qa_learning_features.cjs index.html qa-output\learning-features-v26
```

预期：第一条输出 `transfer review and mastery QA passed`；浏览器回归不得再依赖 `experimentRecords.verificationStatus` 伪造掌握，原测试数据应改为调用 `reviewTransferAttempt()` 后通过。

- [ ] **Step 8: 提交本任务**

```powershell
git add learning-evidence.js learning-engine.js learning-lab.js experience-shell.js app.js tools\qa_transfer_mastery_v26.cjs tools\qa_learning_features.cjs
git commit -m "feat: make teacher-verified transfer mastery reachable"
```

---

### Task 4: 生成知识点证据索引与七维形成性能力画像

**Files:**
- Modify: `learning-evidence.js`
- Modify: `learning-engine.js:1129-1481,2021-2085,2088-2144`
- Modify: `learning-lab.js:922-1000`
- Modify: `experience-shell.js:1347-1414`
- Modify: `experience-shell.css:3350-3850`
- Create: `tools/qa_capability_profile_v26.cjs`
- Test: `tools/qa_capability_profile_v26.cjs`

**Interfaces:**
- Consumes: 规范 Attempt/HintEvent/TransferAttempt、现有试卷记录、题目只读元数据；Task 3 的 `verifiedTransferAttempts()`。
- Produces: `summarizeKnowledgeEvidence(state, questions, profileId)`，每项固定为 `{ knowledgePointId,label,sampleSize,correctCount,independentCorrectCount,verifiedTransferCount,coveredQuestionTypes,latestEvidenceAt,evidenceSources,includesPendingTeacherReview }`；`buildCapabilityProfile()` 返回七个 CapabilityConclusion。

- [ ] **Step 1: 写来源、样本、题型和待复核边界失败测试**

```js
const empty = engine.buildCapabilityProfile(engine.defaultState(), [], "student-default");
assert.equal(empty.dimensions.length, 7);
assert.ok(empty.dimensions.every((item) => item.status === "证据不足"));

const state = engine.defaultState();
state.attempts.push(
  evidence.normalizeAttempt({
    id: "a-correct", profileId: "student-default", questionId: "q1",
    knowledgePointIds: ["kp-h1-17a687b67bbc80b2"], questionType: "计算题",
    gradingStatus: "correct", maxHintLevel: 0,
    completedAt: "2026-07-29T10:00:00.000Z", createdAt: "2026-07-29T10:00:00.000Z",
    modelScore: { total: 82, detail: {} }
  }),
  evidence.normalizeAttempt({
    id: "a-pending", profileId: "student-default", questionId: "q2",
    knowledgePointIds: ["kp-h1-17a687b67bbc80b2"], questionType: "论述题",
    gradingStatus: "pending", teacherReviewStatus: "pending",
    completedAt: "2026-07-30T10:00:00.000Z", createdAt: "2026-07-30T10:00:00.000Z"
  })
);
const [knowledge] = engine.summarizeKnowledgeEvidence(state, [
  { id: "q1", examPoints: ["牛顿第二定律"] },
  { id: "q2", examPoints: ["牛顿第二定律"] }
], "student-default");
assert.equal(knowledge.sampleSize, 1, "pending review is not a reliable sample");
assert.equal(knowledge.correctCount, 1);
assert.deepEqual([...knowledge.coveredQuestionTypes], ["计算题"]);
assert.equal(knowledge.latestEvidenceAt, "2026-07-29T10:00:00.000Z");
assert.deepEqual([...knowledge.evidenceSources], ["formal-attempt"]);
assert.equal(knowledge.includesPendingTeacherReview, true);

const profile = engine.buildCapabilityProfile(state, [], "student-default");
assert.deepEqual(profile.dimensions.map((item) => item.key), [
  "conceptual-understanding", "physical-modeling", "law-conditions",
  "calculation-units-direction", "graphs-experiments",
  "cross-context-transfer", "confidence-hint-independence"
]);
for (const item of profile.dimensions) {
  for (const key of ["status", "sampleSize", "coveredQuestionTypes", "latestEvidenceAt", "evidenceSources", "includesPendingTeacherReview", "knowledgePointIds"]) {
    assert.ok(Object.hasOwn(item, key), `${item.key}.${key}`);
  }
}
assert.match(profile.boundary, /形成性学习建议，不是标准化测评分数/);
console.log("capability profile v2.6 QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_capability_profile_v26.cjs
```

预期：`engine.buildCapabilityProfile is not a function` 或维度数量为 0 而期望为 7。

- [ ] **Step 3: 固定七维映射和试运行阈值**

```js
const CAPABILITY_DIMENSIONS = Object.freeze([
  ["conceptual-understanding", "概念理解"],
  ["physical-modeling", "物理建模"],
  ["law-conditions", "规律和适用条件"],
  ["calculation-units-direction", "计算、单位和方向"],
  ["graphs-experiments", "图像与实验分析"],
  ["cross-context-transfer", "跨情境迁移"],
  ["confidence-hint-independence", "信心校准与提示依赖"]
]);

function classifyCapability(summary) {
  if (summary.sampleSize < 3 || summary.coveredQuestionTypes.length < 2) return "证据不足";
  if (summary.verifiedTransferCount >= 1 && summary.independentCorrectCount >= 2) return "可迁移";
  if (summary.independentCorrectCount >= 2 && summary.correctCount / summary.sampleSize >= 0.7) return "基本掌握";
  return "需巩固";
}
```

这组阈值明确标记为 `experimental: true`，与掌握规则共用“跨日、低提示、核验迁移”证据，但不输出总分、百分位或标准化等级。不同维度的证据选择必须是确定规则：建模读 `modelScore`，规律条件读 `modelEvidence/selfExplanation` 与相应错因，计算维度读计算/单位/方向错因，图像实验读题型/考点，迁移维度只读核验 TransferAttempt，信心提示读 before/after 与 HintEvent。

- [ ] **Step 4: 替换按总次数计算的 evidenceLevel**

`studentAnalysis()` 不再使用“作答 ≥12 或试卷 ≥3”为较充分的单一门槛；它消费七维结论并返回 `capabilityProfile`。兼容字段 `evidenceLevel` 只能由七维中非“证据不足”的维度数量派生，并在 `conclusion` 中同时写样本、题型覆盖和最近日期。

- [ ] **Step 5: 在学生与实验室报告中呈现完整字段**

每个能力卡固定显示状态、可靠样本量、覆盖题型、最近证据日期、证据来源、是否含待复核。低样本统一显示“证据不足”；页面底部固定显示形成性边界。不得用雷达面积或彩色等级暗示标准化分数；现有建模雷达可以保留为步骤完成度辅助图，但不能替代七维结论。

- [ ] **Step 6: 运行能力画像和学生中心回归**

```powershell
& $node tools\qa_capability_profile_v26.cjs
& $node tools\qa_experience_shell.cjs index.html qa-output\experience-v26
```

预期：第一条输出 `capability profile v2.6 QA passed`；学生中心无脚本错误且分析页仍可打开。

- [ ] **Step 7: 提交本任务**

```powershell
git add learning-evidence.js learning-engine.js learning-lab.js experience-shell.js experience-shell.css tools\qa_capability_profile_v26.cjs
git commit -m "feat: add source-aware capability profile"
```

---

### Task 5: 建立 75 道按章原创前概念诊断库与审核门槛

**Files:**
- Create: `diagnostic-bank.js`
- Create: `tools/qa_diagnostic_program_v26.cjs`
- Modify: `learning-engine.js:16-225,484-533,2088-2144`
- Modify: `index.html:569-585`
- Test: `tools/qa_diagnostic_program_v26.cjs`

**Interfaces:**
- Consumes: `PHYSICS_CURRICULUM_TAXONOMY.books` 中 10 册、55 章；现有 8 道诊断的文字和历史 `diagnosticId`。
- Produces: `window.PHYSICS_DIAGNOSTIC_BANK = { version, items, eligibleItems(), manifest }`；每个 DiagnosticItem 固定包含 `id,misconceptionCode,title,statement,correction,grades,textbookBookId,textbookChapterId,knowledgePointIds,questionType,prompt,choices,correctAnswer,reasons,correctReason,explanation,sourceType,reviewStatus,reviewedBy,reviewedAt`。

- [ ] **Step 1: 写数量、章节、原创性、唯一性与审核门槛失败测试**

```js
const assert = require("node:assert/strict");
global.window = global;
require("../curriculum-taxonomy.js");
require("../diagnostic-bank.js");
const taxonomy = global.PHYSICS_CURRICULUM_TAXONOMY;
const bank = global.PHYSICS_DIAGNOSTIC_BANK;
const chapters = taxonomy.books.flatMap((book) => book.chapters);
assert.equal(chapters.length, 55);
assert.ok(bank.items.length >= 75);
const covered = new Set(bank.items.map((item) => item.textbookChapterId));
for (const chapter of chapters) assert.ok(covered.has(chapter.id), `missing chapter ${chapter.id}`);
const secondQuestionChapters = [...bank.items.reduce((map, item) => {
  map.set(item.textbookChapterId, (map.get(item.textbookChapterId) || 0) + 1);
  return map;
}, new Map())].filter(([, count]) => count >= 2).map(([id]) => id);
assert.equal(secondQuestionChapters.length, 20);
const prompts = new Set();
for (const item of bank.items) {
  assert.equal(item.sourceType, "应用内原创");
  assert.equal(item.questionType, "reasoned-choice");
  assert.ok(Array.isArray(item.grades) && item.grades.length > 0, item.id);
  assert.ok(item.knowledgePointIds.length > 0, item.id);
  assert.ok(item.choices.length >= 3, item.id);
  assert.ok(item.reasons.length >= 3, item.id);
  assert.ok(item.choices.some(([value]) => value === item.correctAnswer), item.id);
  assert.ok(item.reasons.some(([value]) => value === item.correctReason), item.id);
  const normalized = item.prompt.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
  assert.equal(prompts.has(normalized), false, `duplicate prompt ${item.id}`);
  prompts.add(normalized);
}
assert.ok(bank.eligibleItems().every((item) => item.reviewStatus === "approved" && item.reviewedBy && item.reviewedAt));
assert.equal(bank.eligibleItems().length, bank.items.length, "release requires actual teacher review for every bundled diagnostic");
console.log("diagnostic program v2.6 QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_diagnostic_program_v26.cjs
```

预期：首次因 `diagnostic-bank.js` 不存在失败；录入内容但尚未实际审核时，明确失败于 `release requires actual teacher review for every bundled diagnostic`。

- [ ] **Step 3: 迁出既有 8 题并录入 75 个字面量记录**

保留既有 `diag-force-motion` 等 8 个 ID，避免历史 `diagnosticAttempts` 失联。其余记录按以下确定映射录入，不在运行时用模板拼题：55 章各用 `${chapterId}-diag-01`，下列 20 个高频章节再用 `${chapterId}-diag-02`：

```js
const EXTRA_DIAGNOSTIC_CHAPTER_IDS = Object.freeze([
  "pep-g8-1-c01", "pep-g8-1-c02", "pep-g8-1-c05",
  "pep-g8-2-c02", "pep-g8-2-c03", "pep-g8-2-c04",
  "pep-g8-2-c05", "pep-g8-2-c06", "pep-g9-c03",
  "pep-g9-c05", "pep-g9-c06", "pep-g9-c08",
  "pep-h-required-1-c02", "pep-h-required-1-c04",
  "pep-h-required-2-c04", "pep-h-required-3-c02",
  "pep-h-elective-1-c01", "pep-h-elective-1-c03",
  "pep-h-elective-2-c02", "pep-h-elective-3-c04"
]);
```

每题必须针对该章一个可命名的误概念，选项和理由分别独立；以下对象固定字段形态，新增题在完成真实审核前保持 pending：

```js
{
  id: "pep-g8-1-c02-diag-01",
  misconceptionCode: "sound-needs-air-to-be-created",
  title: "混淆声音产生与传播条件",
  statement: "没有空气，物体就不能振动发声。",
  correction: "发声来自物体振动；空气等介质只影响声音能否传播到接收者。",
  grades: ["八年级"],
  textbookBookId: "pep-g8-1",
  textbookChapterId: "pep-g8-1-c02",
  knowledgePointIds: ["pep-g8-1-c02-s01"],
  questionType: "reasoned-choice",
  prompt: "真空罩中的电铃接通电源后仍在振动，但罩外听到的声音逐渐减弱。哪项解释正确？",
  choices: [["A", "电铃不再振动"], ["B", "振动仍产生，但真空不能传播声音"], ["C", "真空吸收了声音"], ["D", "电流在真空中变小"]],
  correctAnswer: "B",
  reasons: [["R1", "声音产生和传播都必须依靠空气"], ["R2", "发声体振动产生声音，声音传播需要介质"], ["R3", "真空会让电铃失去振动能力"], ["R4", "听不到就说明没有产生声音"]],
  correctReason: "R2",
  explanation: "电铃的振动没有因抽气而停止；空气减少使声波难以传到罩外。",
  sourceType: "应用内原创",
  reviewStatus: "pending",
  reviewedBy: "",
  reviewedAt: null
}
```

内容覆盖必须显式包含规格列出的声学、机械波、压强浮力、简单机械、功和能、动量、电场、磁场、电磁感应、透镜、原子物理、实验设计、图像和数据处理；每条 prompt、选项、理由、解释均写成完整中文，不复制教材或第三方试卷原文。

- [ ] **Step 4: 完成真实教师审核并写入实际审阅元数据**

由具备相应学段物理教学资格的审阅者逐题核对物理正确性、年级适配、答案与理由唯一性、误概念指向和语言歧义。只有实际通过的记录才把 `reviewStatus` 改为 `approved`，并写审阅者实际标识与实际 ISO 时间；不得批量填入虚构审核者或统一伪造时间。退回题维持 pending，修订后重新审核。

- [ ] **Step 5: 用独立库替换引擎内联数组并保留历史关联**

`learning-engine.js` 的 `misconceptionCatalog` 改为从 `PHYSICS_DIAGNOSTIC_BANK.eligibleItems()` 读取；`recordDiagnostic()` 将 `textbookChapterId/knowledgePointIds/questionType="reasoned-choice"` 写入 DiagnosticAttempt。`misconceptionProfile()` 仍按 `misconceptionCode` 聚合，旧 8 题历史继续可见。

`index.html` 在课程目录之后、引擎之前加载：

```html
<script src="curriculum-taxonomy.js"></script>
<script src="diagnostic-bank.js"></script>
```

- [ ] **Step 6: 运行诊断与题库不变回归**

```powershell
& $node tools\qa_diagnostic_program_v26.cjs
& $node tools\qa_activation_and_1900.cjs
```

预期：第一条输出 `diagnostic program v2.6 QA passed`；第二条仍报告 `completeQuestionCount: 1900`、`sourceIndexCount: 232`、`totalStoredRecords: 2132`。

- [ ] **Step 7: 提交本任务**

```powershell
git add diagnostic-bank.js learning-engine.js index.html tools\qa_diagnostic_program_v26.cjs
git commit -m "feat: add reviewed chapter diagnostic bank"
```

---

### Task 6: 生成每年级最多 30 题的摸底与基线快照

**Files:**
- Create: `learning-planner.js`
- Create: `tools/qa_learning_planner_v26.cjs`
- Modify: `learning-engine.js:341-398,484-533,2088-2144`
- Modify: `learning-lab.js:359-439,1426-1525,1654-1671`
- Modify: `learning-lab.css:310-720`
- Modify: `index.html:569-585`
- Test: `tools/qa_learning_planner_v26.cjs`

**Interfaces:**
- Consumes: Task 4 的 `summarizeKnowledgeEvidence()`、Task 5 的已审核诊断、现有已发布完整题、课程目录、`profile.grade`。
- Produces: `getOrCreateBaselineSnapshot(state,questions,{profileId,grade,date,now?})`；`recordBaselineResponse(state,{snapshotId,itemId,evidenceId,submittedAt?})`。BaselineSnapshot 固定字段为 `id,profileId,grade,blueprintVersion,status,items,coreCount,misconceptionCount,answeredItemIds,responseEvidenceIds,createdAt,completedAt,conclusions`。

- [ ] **Step 1: 扩展规划 QA，先写五年级蓝图和完成判据失败测试**

在 `tools/qa_learning_planner_v26.cjs` 装载全部现有题库、内容目录、诊断库、证据模块、规划模块和引擎，加入：

```js
const grades = ["八年级", "九年级", "高一", "高二", "高三"];
for (const grade of grades) {
  const state = engine.defaultState();
  state.profiles[0].grade = grade;
  const first = engine.getOrCreateBaselineSnapshot(state, publishedQuestions, {
    profileId: state.activeProfileId,
    grade,
    date: "2026-07-31",
    now: "2026-07-31T08:00:00.000Z"
  });
  assert.equal(first.items.length, 30, grade);
  assert.equal(first.coreCount, 24, grade);
  assert.equal(first.misconceptionCount, 6, grade);
  assert.ok(first.items.every((item) => item.grade === grade), grade);
  assert.equal(new Set(first.items.map((item) => item.itemId)).size, 30, grade);
  assert.equal(first.status, "in-progress");
  const second = engine.getOrCreateBaselineSnapshot(state, publishedQuestions, {
    profileId: state.activeProfileId, grade, date: "2026-07-31"
  });
  assert.deepEqual(second, first, `${grade} snapshot changed during the same baseline`);
  for (const item of first.items) {
    engine.recordBaselineResponse(state, {
      snapshotId: first.id,
      itemId: item.itemId,
      evidenceId: `evidence-${item.itemId}`,
      submittedAt: "2026-07-31T09:00:00.000Z"
    });
  }
  assert.equal(first.status, "completed");
  assert.equal(first.answeredItemIds.length, 30);
  assert.equal(first.completedAt, "2026-07-31T09:00:00.000Z");
}
console.log("learning planner baseline QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_learning_planner_v26.cjs
```

预期：首次因 `learning-planner.js` 不存在，或 `engine.getOrCreateBaselineSnapshot is not a function` 失败。

- [ ] **Step 3: 实现确定性五域蓝图与已发布内容门槛**

核心题配额总和必须为 24，且从当前年级、已发布、正文/答案/解析完整的正式题只读抽取：

```js
const BASELINE_CORE_QUOTAS = Object.freeze({
  foundation: 6,
  lawApplication: 5,
  integratedModeling: 5,
  graphExperiment: 4,
  confusingCases: 4
});
const BASELINE_MISCONCEPTION_COUNT = 6;
const BASELINE_MAX_ITEMS = 30;
```

`classifyBaselineDomain(question)` 依次使用明确元数据：实验/图像/数据类 `examQuestionType/examPoints` → `graphExperiment`；`variantRole === "counter"` → `confusingCases`；`variantRole === "far"` 或挑战难度 → `integratedModeling`；考点含定律/守恒/条件/关系 → `lawApplication`；其余 → `foundation`。某域不足时函数必须抛出包含年级和域名的错误，不得用其他域静默填满。抽取顺序由 `${profileId}|${grade}|${date}|baseline-v1` 的稳定种子确定。

- [ ] **Step 4: 保存不可变题目清单与逐知识点结论**

快照 item 只保存稳定引用和当时可见理由：核心题为 `{ itemId,kind:"core",questionId,grade,domain,knowledgePointIds,questionType,reason }`，前概念题为 `{ itemId,kind:"misconception",diagnosticId,grade,textbookChapterId,knowledgePointIds,questionType:"reasoned-choice",reason }`。完成状态只表示 30 项均已提交，不表示全部判对；pending 主观题不阻止完成，但 `conclusions.includesPendingTeacherReview` 必须为 true，且不计正误样本。

- [ ] **Step 5: 接入诊断界面并记录 response evidence**

诊断页增加“学期初摸底”与“按章前概念练习”两个明确入口。摸底开始后只读当前 BaselineSnapshot，显示 `已完成 n/30`；核心题跳转分步导师并把 `snapshotId/itemId` 带入 Attempt，前概念提交把 DiagnosticAttempt ID 交给 `recordBaselineResponse()`。刷新、换标签或同日重开不得重抽。

- [ ] **Step 6: 运行规划、诊断和备份回归**

```powershell
& $node tools\qa_learning_planner_v26.cjs
& $node tools\qa_diagnostic_program_v26.cjs
& $node tools\qa_feature_upgrade.cjs index.html qa-output\feature-upgrade-v26
```

预期：规划测试输出 `learning planner baseline QA passed`；完整备份创建/恢复仍通过，恢复后的 BaselineSnapshot 保留 30 个 item 与完成状态。

- [ ] **Step 7: 提交本任务**

```powershell
git add learning-planner.js learning-engine.js learning-lab.js learning-lab.css index.html tools\qa_learning_planner_v26.cjs
git commit -m "feat: add stable grade baseline snapshots"
```

---

### Task 7: 保存 15—25 分钟五段每日任务快照

**Files:**
- Modify: `learning-planner.js`
- Modify: `learning-engine.js:1210-1297,1484-1543,2088-2144`
- Modify: `experience-shell.js:479-564,626-707,1635-1753,1940-1960`
- Modify: `experience-shell.css:3000-3850`
- Modify: `tools/qa_learning_planner_v26.cjs`
- Test: `tools/qa_learning_planner_v26.cjs`

**Interfaces:**
- Consumes: 已审核诊断、规范作答/复习、现有正式题、`transferVariants(question)`；保留原 `dailyTest(state,questions,options)` 供旧调用与回归使用。
- Produces: `getOrCreateDailyTaskSnapshot(state,questions,{profileId,date,now?})`，DailyTaskSnapshot 固定为 `{ id,profileId,date,targetMinutes,estimatedMinutes,items,recommendationReasons,evidenceAsOf,createdAt,status }`。

- [ ] **Step 1: 写同日不可变与五段时长失败测试**

```js
const state = engine.defaultState();
state.profiles[0].grade = "高一";
const first = engine.getOrCreateDailyTaskSnapshot(state, publishedQuestions, {
  profileId: state.activeProfileId,
  date: "2026-07-31",
  now: "2026-07-31T07:00:00.000Z"
});
assert.deepEqual(first.items.map((item) => item.role), ["diagnostic", "core", "near", "far", "review"]);
assert.ok(first.estimatedMinutes >= 15 && first.estimatedMinutes <= 25);
assert.equal(first.items.length, 5);
assert.ok(first.items.every((item) => item.reason && item.title));
const frozen = JSON.parse(JSON.stringify(first));
state.attempts.push(evidence.normalizeAttempt({
  id: "midday-change", profileId: state.activeProfileId, questionId: first.items[1].sourceQuestionId,
  gradingStatus: "incorrect", maxHintLevel: 4, completedAt: "2026-07-31T12:00:00.000Z"
}));
const second = engine.getOrCreateDailyTaskSnapshot(state, publishedQuestions, {
  profileId: state.activeProfileId, date: "2026-07-31", now: "2026-07-31T12:01:00.000Z"
});
assert.deepEqual(second, frozen);
assert.equal(state.dailyTaskSnapshots.length, 1);
console.log("daily snapshot QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_learning_planner_v26.cjs
```

预期：`engine.getOrCreateDailyTaskSnapshot is not a function`，或当前临时 `dailyTest()` 因中途状态改变而返回不同题组。

- [ ] **Step 3: 实现五段选择与 20 分钟估算**

```js
const DAILY_ROLES = Object.freeze([
  { role: "diagnostic", minutes: 3 },
  { role: "core", minutes: 4 },
  { role: "near", minutes: 4 },
  { role: "far", minutes: 5 },
  { role: "review", minutes: 4 }
]);
```

诊断项选当前薄弱或最长无证据章节；core 优先到期/近期错题/低提示证据不足的正式题；near 与 far 优先同 `modelFamilyId` 的已发布题，缺少成套题时使用 `transferVariants(core)` 生成并在快照中固化 prompt；review 优先到期复习，暂无到期时选择最早可靠证据题作提取练习。五项共 20 分钟，任何降级都要在 `reason` 明示，不得用未审核题。

- [ ] **Step 4: 只在首次生成时写 state**

查找键固定为 `${profileId}|${date}`；命中即原样返回，不重新读取当天后来证据。首次生成写 `evidenceAsOf` 与完整 item 标题、prompt/题目引用、理由和分钟数；每个档案只保留最近 90 天快照。`saveState()` 后重载必须深度相等。

- [ ] **Step 5: 学生首页切换到快照并保持旧 API**

`getStudentData()` 首次创建后立即 `engine.saveState()`；`renderDailyTest()` 改名为 `renderDailyTaskSnapshot()`，按五段顺序显示时间和推荐理由，并为 diagnostic/transfer/question/review 使用对应启动动作。原 `dailyTest()` 不删除、不改返回结构，现有专项学习 QA 继续通过。

- [ ] **Step 6: 运行每日快照与兼容回归**

```powershell
& $node tools\qa_learning_planner_v26.cjs
& $node tools\qa_targeted_learning.cjs
& $node tools\qa_feature_upgrade.cjs index.html qa-output\feature-upgrade-v26
```

预期：规划脚本包含 `daily snapshot QA passed`；旧测试仍验证 `dailyTest()` 最大 8 题且当前年级隔离。

- [ ] **Step 7: 提交本任务**

```powershell
git add learning-planner.js learning-engine.js experience-shell.js experience-shell.css tools\qa_learning_planner_v26.cjs
git commit -m "feat: persist daily learning loop snapshots"
```

---

### Task 8: 加入 14 天广覆盖检测与有限顺延

**Files:**
- Modify: `learning-planner.js`
- Modify: `learning-engine.js:1210-1297,1545-1705,2088-2144`
- Modify: `experience-shell.js:626-713,1635-1753`
- Modify: `experience-shell.css:3000-3850`
- Modify: `tools/qa_learning_planner_v26.cjs`
- Test: `tools/qa_learning_planner_v26.cjs`

**Interfaces:**
- Consumes: 课程目录的当前年级章节、Task 4 知识点最近证据、Task 5 已审核诊断、Task 6 BaselineSnapshot、现有专项 learningPlan。
- Produces: `getOrCreateBroadCoverageCheck`, `deferBroadCoverageCheck`, `recordBroadCoverageResponse`；BroadCoverageCheck 固定为 `{ id,profileId,grade,dueAt,status,items,coveredChapterIds,createdAt,deferredUntil,deferralCount,completedItemIds,completedAt }`。

- [ ] **Step 1: 写 14 天、长期空白优先和不可替代失败测试**

```js
const state = engine.defaultState();
state.profiles[0].grade = "高一";
state.profiles[0].createdAt = "2026-07-01T00:00:00.000Z";
const beforeDue = engine.getOrCreateBroadCoverageCheck(state, publishedQuestions, {
  profileId: state.activeProfileId, now: "2026-07-14T23:59:59.000Z"
});
assert.equal(beforeDue, null);
const due = engine.getOrCreateBroadCoverageCheck(state, publishedQuestions, {
  profileId: state.activeProfileId, now: "2026-07-15T00:00:00.000Z"
});
assert.equal(due.status, "due");
assert.equal(due.items.length, 10);
assert.equal(new Set(due.coveredChapterIds).size, 10);
assert.ok(due.items.every((item) => item.reason.includes("长期无证据")));
state.learningPlans.push({ id: "special-plan", profileId: state.activeProfileId, status: "active", questionIds: ["q1"] });
const afterPlan = engine.getOrCreateBroadCoverageCheck(state, publishedQuestions, {
  profileId: state.activeProfileId, now: "2026-07-15T01:00:00.000Z"
});
assert.equal(afterPlan.id, due.id);
const deferred = engine.deferBroadCoverageCheck(state, due.id, {
  until: "2026-07-22T00:00:00.000Z",
  reason: "校内考试周"
});
assert.equal(deferred.deferralCount, 1);
assert.throws(() => engine.deferBroadCoverageCheck(state, due.id, {
  until: "2026-07-23T00:00:00.000Z", reason: "再次顺延"
}), /只允许顺延一次|最多顺延 7 天/);
console.log("broad coverage cadence QA passed");
```

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_learning_planner_v26.cjs
```

预期：`engine.getOrCreateBroadCoverageCheck is not a function`。

- [ ] **Step 3: 实现基于本地日历日的到期规则**

首个 dueAt 为档案 `createdAt` 或已完成摸底 `completedAt` 后第 14 个本地日 00:00；后续为上一广覆盖检测 `completedAt` 后第 14 个本地日。不得用 UTC 字符串截断代替本地日计算。按 `latestEvidenceAt === null` 优先、其后日期升序选择 10 个不同章节；每章使用一条已审核诊断或一条已发布完整核心题。

- [ ] **Step 4: 限制顺延并保持检测独立**

`deferBroadCoverageCheck()` 要求非空原因、`deferralCount === 0`、until 不晚于原 dueAt + 7 天；超过日期后状态自动回到 due。`saveTargetedLearningPlan()`、每日快照和普通推荐不得写 `broadCoverageChecks`。只有 10 项均提交才写 completedAt，并从该时间重新计算 14 天。

- [ ] **Step 5: 在学生首页提供独立阶段检测卡**

到期或顺延中的检测显示在每日快照之前，列出“覆盖长期空白知识点”的理由、10 个章节和最晚顺延日；不把它合并进专项方案。顺延按钮需要选择明确日期并填写原因；超过规则时显示真实错误，不假装成功。

- [ ] **Step 6: 运行规划与专项隔离回归**

```powershell
& $node tools\qa_learning_planner_v26.cjs
& $node tools\qa_targeted_learning.cjs
```

预期：规划输出 `broad coverage cadence QA passed`；专项方案保存、替换和跨学生隔离测试保持通过。

- [ ] **Step 7: 提交本任务**

```powershell
git add learning-planner.js learning-engine.js experience-shell.js experience-shell.css tools\qa_learning_planner_v26.cjs
git commit -m "feat: add non-replaceable fortnight coverage checks"
```

---

### Task 9: 实现克制、一次性且不可刷取的本地徽章

**Files:**
- Create: `tools/qa_learning_badges_v26.cjs`
- Modify: `learning-planner.js`
- Modify: `learning-engine.js:341-414,2088-2144`
- Modify: `experience-shell.js:626-713,1635-1753`
- Modify: `experience-shell.css:3000-3850`
- Test: `tools/qa_learning_badges_v26.cjs`

**Interfaces:**
- Consumes: Task 2 的 Attempt、Task 3 的已核验 TransferAttempt、现有 Review 的 `dueAt/completedAt`，以及事件 `{ id,type,profileId,attemptId,transferAttemptId,reviewId,occurredAt }`。
- Produces: `evaluateBadgeEligibility(state, event, now) => BadgeAward[]`；BadgeAward 固定为 `{ id,profileId,badgeCode,sourceEventId,awardedAt }`；`badgeCode` 只允许 `complete-loop`、`correct-mistake`、`on-time-review`。

- [ ] **Step 1: 写唯一性、前置条件与禁用机制失败测试**

```js
const assert = require("node:assert/strict");
const { engine, planner } = loadEngineAndPlanner();
const state = engine.defaultState();
const profileId = state.activeProfileId;

seedCompleteLoop(state, profileId, {
  initialAttemptId: "attempt-wrong",
  correctionAttemptId: "attempt-correct",
  transferAttemptId: "transfer-verified"
});
let awards = planner.evaluateBadgeEligibility(state, {
  id: "event-loop", type: "transfer-reviewed", profileId,
  attemptId: "attempt-correct", transferAttemptId: "transfer-verified",
  occurredAt: "2026-07-20T10:00:00.000Z"
}, "2026-07-20T10:00:00.000Z");
assert.deepEqual(awards.map((item) => item.badgeCode).sort(), ["complete-loop", "correct-mistake"]);
assert.equal(planner.evaluateBadgeEligibility(state, {
  id: "event-loop-repeat", type: "transfer-reviewed", profileId,
  attemptId: "attempt-correct", transferAttemptId: "transfer-verified",
  occurredAt: "2026-07-20T10:05:00.000Z"
}, "2026-07-20T10:05:00.000Z").length, 0);

state.reviews[`${profileId}::review-due`] = {
  id: "review-due", questionId: "review-due", profileId, dueAt: "2026-07-21T08:00:00.000Z",
  completedAt: "2026-07-22T07:59:59.000Z", status: "completed"
};
awards = planner.evaluateBadgeEligibility(state, {
  id: "event-review", type: "review-completed", profileId,
  reviewId: "review-due", occurredAt: "2026-07-22T07:59:59.000Z"
}, "2026-07-22T07:59:59.000Z");
assert.deepEqual(awards.map((item) => item.badgeCode), ["on-time-review"]);
assert.ok(state.badgeAwards.every((item) =>
  Object.keys(item).sort().join(",") === "awardedAt,badgeCode,id,profileId,sourceEventId"
));
assert.equal(new Set(state.badgeAwards.map((item) => `${item.profileId}|${item.badgeCode}`)).size,
  state.badgeAwards.length);
assert.equal(JSON.stringify(state.badgeAwards).match(/points|streak|rank|lottery/gi), null);
console.log("restrained badge QA passed");
```

测试辅助函数 `seedCompleteLoop()` 必须写入同一知识点的初次错误、后续独立订正正确和一条经核验迁移；另加反例断言：只有重复正确、只有待复核迁移、复习超过 `dueAt + 48h` 均不授予徽章。

- [ ] **Step 2: 运行测试并确认预期失败**

```powershell
& $node tools\qa_learning_badges_v26.cjs
```

预期：`planner.evaluateBadgeEligibility is not a function`。

- [ ] **Step 3: 用不可变定义实现三个徽章判定器**

```js
const BADGE_DEFINITIONS = Object.freeze([
  Object.freeze({ code: "complete-loop", label: "完成完整闭环" }),
  Object.freeze({ code: "correct-mistake", label: "完成错题订正" }),
  Object.freeze({ code: "on-time-review", label: "按期完成复习" })
]);
```

“完整闭环”要求同一知识点存在诊断/核心作答、后续低提示正确和已可靠核验迁移；“错题订正”要求同一题或同一 `modelFamilyId` 的先错后对；“按期完成复习”要求 `completedAt >= dueAt` 且 `completedAt <= dueAt + 48h`。每次判定前按 `${profileId}|${badgeCode}` 查重，写入后立即 `saveState()`；事件重复提交仍返回空数组。

- [ ] **Step 4: 在学生首页仅显示获得状态与证据说明**

渲染固定三张徽章卡：未获得时显示客观条件，已获得时显示 `awardedAt` 和对应 `sourceEventId` 的本地证据摘要；不显示数量、累计值、排名、倒计时、连续天数或动画奖励。页面文案明确“徽章仅记录学习闭环，不代表能力等级”。

- [ ] **Step 5: 运行徽章与状态迁移回归**

```powershell
& $node tools\qa_learning_badges_v26.cjs
& $node tools\qa_learning_state_v5.cjs
```

预期：依次输出 `restrained badge QA passed` 和 `learning state v5 migration QA passed`；重复事件后 `badgeAwards` 数量不变。

- [ ] **Step 6: 提交本任务**

```powershell
git add learning-planner.js learning-engine.js experience-shell.js experience-shell.css tools\qa_learning_badges_v26.cjs
git commit -m "feat: add restrained evidence-based badges"
```

---

### Task 10: 串联摸底、能力画像、每日快照、广覆盖与教师核验 UI

**Files:**
- Create: `tools/qa_local_learning_ui.cjs`
- Modify: `learning-lab.js:108-140,1451-1465,1792-1899`
- Modify: `learning-lab.css:270-420,1280-1700`
- Modify: `experience-shell.js:626-713,1635-1753,2476-2486`
- Modify: `experience-shell.css:3000-3850`
- Modify: `app.js:3770-3850`
- Test: `tools/qa_local_learning_ui.cjs`

**Interfaces:**
- Consumes: Tasks 3—9 的兼容门面接口；`PhysicsExperience.getState()` 中真实 `role/displayName/grade`；`PhysicsStudioApp.getQuestions()` 的正式题只读视图。
- Produces: 学生端摸底、七维画像、每日五段快照、双周广覆盖和三徽章视图；教师端待复核 TransferAttempt 队列与 `reviewTransferAttempt()` 操作；所有选择器均限定在 `#learningLabModal` 或 `.student-main`。

- [ ] **Step 1: 写 Edge 端到端失败测试骨架和固定测试状态**

创建脚本，强制传入入口和截图目录，并用仓库已有 Edge：

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");
const appPath = process.argv[2];
const outputDirectory = process.argv[3];
if (!appPath || !outputDirectory) {
  throw new Error("Usage: node qa_local_learning_ui.cjs <index.html> <output-directory>");
}
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
fs.mkdirSync(outputDirectory, { recursive: true });
```

在 `page.addInitScript()` 写入 `physics-experience-v2` 的学生档案和 state v5 固定证据；若激活门存在，调用现有 QA 激活管理器的 `--issue` 流程取得本机测试激活码，不写死或绕过激活。等待 `PhysicsStudioApp.getQuestions().length === 2132` 后执行：

```js
const inventory = await page.evaluate(() => ({
  total: PhysicsStudioApp.getQuestions().length,
  publishedComplete: PhysicsStudioApp.getQuestions().filter((q) => q.status === "published" && q.contentType !== "index").length,
  diagnostics: window.PHYSICS_DIAGNOSTIC_BANK.items.length,
  chapters: new Set(window.PHYSICS_DIAGNOSTIC_BANK.items.map((q) => q.textbookChapterId)).size,
  baseline: PHYSICS_LEARNING_ENGINE.getOrCreateBaselineSnapshot(
    PHYSICS_LEARNING_ENGINE.loadState(), PhysicsStudioApp.getQuestions(),
    { profileId: PHYSICS_LEARNING_ENGINE.loadState().activeProfileId, grade: "高一", now: "2026-07-15T08:00:00.000Z" }
  ),
  daily: PHYSICS_LEARNING_ENGINE.getOrCreateDailyTaskSnapshot(
    PHYSICS_LEARNING_ENGINE.loadState(), PhysicsStudioApp.getQuestions(),
    { profileId: PHYSICS_LEARNING_ENGINE.loadState().activeProfileId, date: "2026-07-15" }
  )
}));
assert.equal(inventory.total, 2132);
assert.equal(inventory.publishedComplete, 1900);
assert.ok(inventory.diagnostics >= 75);
assert.equal(inventory.chapters, 55);
assert.ok(inventory.baseline.items.length <= 30);
assert.deepEqual(inventory.daily.items.map((item) => item.role),
  ["diagnostic", "core", "near", "far", "review"]);
assert.ok(inventory.daily.estimatedMinutes >= 15 && inventory.daily.estimatedMinutes <= 25);
```

- [ ] **Step 2: 写学生与教师实际点击路径断言**

学生路径打开学习首页和学习实验室，断言七个能力维度、摸底题数、五段每日任务、广覆盖到期卡和三个固定徽章卡均可见；页面必须出现“形成性学习建议，不是标准化测评分数”。测试通过实验室提交一条主观迁移，断言其初始 `gradingStatus === "pending"` 且掌握未达成。随后把同一真实本机档案的 `physics-experience-v2.role` 切为 `teacher` 并重载，打开“待复核迁移”，输入审核人显示名和审核意见，点击“核验正确”；再切回学生，断言该迁移进入证据来源，并在补齐两个不同日期低提示正确后 `getMasteryEvidence()` 返回掌握。

```js
assert.equal(await page.locator('[data-capability-dimension]').count(), 7);
assert.equal(await page.locator('[data-daily-role]').count(), 5);
assert.equal(await page.locator('[data-badge-code]').count(), 3);
const visibleText = await page.locator("body").innerText();
assert.doesNotMatch(visibleText, /排行榜|抽奖|积分|连续签到/);
```

分别在 1440×900 和 390×844 截图 `local-learning-desktop.png`、`local-learning-mobile.png`，收集 `pageerror`，结束时断言错误数组为空。

- [ ] **Step 3: 运行端到端测试并确认预期失败**

```powershell
& $node tools\qa_local_learning_ui.cjs index.html qa-output\local-learning-v26
```

预期：首次在缺少 `[data-capability-dimension]`、教师复核入口或新规划接口处失败；不得通过放宽等待时间或删除断言消除失败。

- [ ] **Step 4: 接入统一档案身份和本地学习视图**

让 `PhysicsExperience.getState()` 返回持久化的 `displayName`；学生、教师都把同一 `activeProfileId` 传给门面。所有卡片只读取 Task 4 汇总结果，禁止 UI 自行重算正确率或掌握。教师复核必须填写实际审核人显示名、审核意见和审核时间；显示名为空时阻止提交并呈现校验错误，不生成伪造审核信息。

- [ ] **Step 5: 完成教师复核闭环并即时刷新学生证据**

迁移提交只调用 `recordTransferAttempt()`；教师按钮只调用 `reviewTransferAttempt()`。成功后 `saveState()`，刷新待复核数量、知识点证据、掌握状态和能力画像；选择“需修改”时写 `gradingStatus: "incorrect"`、`verificationMethod: "teacher"` 及完整审核元数据，同样不进入掌握证据。保留现有内容审核页和高级工具，默认仍折叠。

- [ ] **Step 6: 运行整合 UI 与纯规则回归**

```powershell
& $node tools\qa_transfer_mastery_v26.cjs
& $node tools\qa_capability_profile_v26.cjs
& $node tools\qa_learning_planner_v26.cjs
& $node tools\qa_local_learning_ui.cjs index.html qa-output\local-learning-v26
```

预期：前三项分别输出迁移掌握、七维画像和学习规划通过信息；端到端脚本输出 `local learning UI QA passed`，并生成两张截图。

- [ ] **Step 7: 提交本任务**

```powershell
git add learning-lab.js learning-lab.css experience-shell.js experience-shell.css app.js tools\qa_local_learning_ui.cjs
git commit -m "feat: connect local learning evidence UI"
```

---

### Task 11: 修复学习实验室全尺寸滚动、焦点与旋转恢复

**Files:**
- Create: `tools/qa_learning_lab_scroll.cjs`
- Modify: `learning-lab.css:59-94,270-275,1573-1582`
- Modify: `learning-lab.js:108-140,2330-2470`
- Test: `tools/qa_learning_lab_scroll.cjs`

**Interfaces:**
- Consumes: `#learningLabModal`、`#learningLabContent`、`.lab-shell`、`.lab-panel`、`#labSketchCanvas` 和现有页签切换事件。
- Produces: `panelScrollKey(panel) => string`、`rememberPanelScroll(panel)`、`restorePanelScroll(panel)`；每页签独立滚动位置；主滚动区具备 `tabindex="0"` 和可见焦点；窗口 resize/orientationchange 后恢复到有效范围。

- [ ] **Step 1: 写四视口和五类输入的 Playwright 失败测试**

沿用 Task 10 的真实激活流程，依次创建 1440×900、320×568、360×640、390×844 context。每个视口打开学习实验室并断言：

```js
const metrics = await page.locator(".lab-panel.is-active").evaluate((panel) => ({
  clientHeight: panel.clientHeight,
  scrollHeight: panel.scrollHeight,
  scrollTop: panel.scrollTop,
  touchAction: getComputedStyle(panel).touchAction,
  contentHeight: getComputedStyle(document.querySelector("#learningLabContent")).height,
  shellMinHeight: getComputedStyle(document.querySelector(".lab-shell")).minHeight,
  canvasTouchAction: getComputedStyle(document.querySelector("#labSketchCanvas")).touchAction
}));
assert.ok(metrics.scrollHeight > metrics.clientHeight);
assert.equal(metrics.touchAction, "pan-y");
assert.equal(metrics.shellMinHeight, "0px");
assert.equal(metrics.canvasTouchAction, "none");
```

Windows 桌面顺序执行 `mouse.wheel(0, 600)`、面板 focus 后 `keyboard.press("PageDown")`，并用连续小 wheel delta 模拟触控板；每次都断言 `scrollTop` 增加。移动端通过 CDP `Input.dispatchTouchEvent` 执行单指慢滑、快速滑动、反向滑动，断言先增后减；将 viewport 宽高互换模拟旋转后，断言当前页签滚动位置在新 `scrollTop` 最大值范围内恢复。每个状态均断言关闭按钮可见、可聚焦且 `document.documentElement.scrollWidth <= innerWidth`。

- [ ] **Step 2: 运行滚动测试并确认预期失败**

```powershell
& $node tools\qa_learning_lab_scroll.cjs index.html qa-output\local-learning-v26-scroll
```

预期：至少在 320×568 下因 `#learningLabContent` 高度链或 `.lab-panel` 的 `touch-action` 断言失败。

- [ ] **Step 3: 只修复弹性高度链和滚动所有权**

```css
#learningLabContent { height: 100%; min-height: 0; }
.lab-shell { height: 100%; min-height: 0; }
.lab-panel { min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
#labSketchCanvas { touch-action: none; }
```

保持 `.learning-lab-modal` 的标题栏在滚动容器外；不得把 `overflow-y` 移到整个 body，不得给非画布区域设置 `touch-action: none`。活动面板渲染后设置 `tabindex="0"`，`:focus-visible` 使用现有强调色绘制 2px 轮廓。

- [ ] **Step 4: 保存页签位置并处理旋转后的边界**

用 `Map<panelKey,number>` 保存每个面板的 `scrollTop`；切页前记录，切页后在下一 animation frame 恢复。`resize` 和 `orientationchange` 只调度一次恢复，目标值夹在 `0` 与 `scrollHeight - clientHeight` 之间。关闭再打开仍恢复当前会话的位置；页面重载不持久化滚动位置。

- [ ] **Step 5: 运行滚动、UI 与 Android 桥回归**

```powershell
& $node tools\qa_learning_lab_scroll.cjs index.html qa-output\local-learning-v26-scroll
& $node tools\qa_local_learning_ui.cjs index.html qa-output\local-learning-v26
& $node tools\qa_android_bridge.cjs index.html qa-output\android-bridge-v26
```

预期：滚动脚本输出 `learning lab scroll QA passed` 并生成四种视口截图；UI 脚本和 Android 桥测试继续通过。

- [ ] **Step 6: 提交本任务**

```powershell
git add learning-lab.css learning-lab.js tools\qa_learning_lab_scroll.cjs
git commit -m "fix: restore learning lab scrolling across viewports"
```

---

### Task 12: 完成可读性、触控目标与无障碍基础改造

**Files:**
- Create: `physics-math.js`
- Modify: `styles.css`
- Modify: `experience-shell.css`
- Modify: `learning-lab.css`
- Modify: `content-catalog.js`
- Modify: `backup.js`
- Create: `schemas/physics-studio-backup-v5.schema.json`
- Modify: `tools/generate_backup_validator.cjs`
- Modify: `backup-validator.js`（由生成脚本重建）
- Modify: `experience-shell.js`
- Modify: `learning-lab.js`
- Modify: `index.html`
- Create: `tools/qa_math_rendering_v26.cjs`
- Modify: `tools/qa_backup_validator_fields.cjs`
- Create: `tools/qa_accessibility_v26.cjs`
- Test: `tools/qa_math_rendering_v26.cjs`
- Test: `tools/qa_accessibility_v26.cjs`

**Interfaces:**
- Consumes: 学生四个一级页面、题目详情、学习实验室、教师工作台、所有 `dialog` 与现有 Android 双指缩放设置。
- Produces: `--text-body:16px`、`--text-helper:14px`、`--target-min:48px`、深色状态文字 token；题干字号 `100%|125%|150%` 本机偏好；完整键盘焦点、弹窗焦点管理、非颜色状态与减少动画支持；题根可选 `richStemV1`、选项可选 `richContentV1`、题根可选 `richSolutionV1` 文本/公式段落与 `PhysicsStudioMath.render()` 安全排版。

- [ ] **Step 1: 写可读性和交互边界失败测试**

`tools/qa_accessibility_v26.cjs` 用 Playwright 打开本地页面并遍历学生首页、题库、错题、进度、教材、学情、学习实验室和教师中心。固定断言：正文计算字号不低于 16px；辅助文字不低于 14px（纯装饰性大写标签可为 12px，但必须 `aria-hidden=true`）；可操作元素可触区域宽高均不低于 48 CSS px；键盘 Tab 可见焦点；状态同时具有文字/图标而不只靠颜色；题干字号按钮可切换三档并在重载后保留；`prefers-reduced-motion: reduce` 下过渡与动画关闭。

脚本还计算前景/背景相对亮度，普通文字对比度至少 4.5:1、大字至少 3:1；显式断言旧橙色 `#e77a3d` 不再承担小字号正文或状态文字。每个原生 `dialog` 打开后焦点进入首个可操作控件，Tab/Shift+Tab 不离开弹窗，Escape 或关闭按钮后焦点回到触发器。

- [ ] **Step 2: 运行测试并确认旧字号、44px 控件或焦点管理导致失败**

```powershell
& $node tools\qa_accessibility_v26.cjs index.html qa-output\accessibility-v26
```

预期：至少因小于 14px 的辅助文字、小于 48px 的目标或弹窗焦点未锁定而失败；不得通过放宽阈值修复。

- [ ] **Step 3: 建立统一字号、对比度和触控 token**

三个样式表统一消费 CSS 自定义属性：正文 16px、辅助文字 14px、装饰标签 12px、最小目标 48px。小字号关键信息改用深色文字；橙色状态文字使用在白底对比度约 7.3:1 的 `#9a3412`，原 `#e77a3d` 仅可作非文字装饰且不得成为唯一状态信号。按钮、输入、标签切换、关闭按钮和图标按钮设置至少 48×48px；窄屏使用换行或自身滚动，不能缩小点击目标。

- [ ] **Step 4: 增加题干字号控制与双指缩放回归**

题目详情和学习实验室题干旁加入“字号 100% / 125% / 150%”分段按钮，保存为不含学生数据的本机 UI 偏好。缩放只改变题干、公式与解析正文，不改变判题数据；数学上下标随字号缩放且不被裁切。`index.html` 不得设置 `user-scalable=no` 或 `maximum-scale=1`；Android 保留 `setSupportZoom(true)` 与 `setBuiltInZoomControls(true)`，自动化静态断言这两项仍在。

富内容字段固定为：题根 `richStemV1: RichContentV1|null`、每个选项 `richContentV1: RichContentV1|null`、题根 `richSolutionV1: RichContentV1|null`；题根不得再使用含义不明的 `richContentV1`。`RichContentV1` 仅允许 `{type:"text",text}` 与 `{type:"formula",display,ast,spokenText}` 段落，每份文档最多 512 块。公式 AST 节点只允许 `row,identifier,number,operator,fraction,superscript,subscript,subsup,sqrt,text`；每个 `row` 最多 64 个子节点，每个公式最大深度 12、最多 256 个节点，每个文本块、节点字符串值和 `spokenText` 最多 200 个字符，并拒绝未知字段。`physics-math.js` 只用 `createElementNS/createTextNode` 构造 MathML，另生成不依赖 MathML 支持的安全 HTML 排版回退；禁止 `innerHTML`、URL、样式、事件属性和任意 MathML 字符串。`spokenText` 经长度/控制字符校验后作为可读标签。既有普通 `content/solution` 继续原样转义显示，不通过正则猜测公式；编辑器明确插入结构化公式后才启用数学排版。

本地到服务端的映射边界固定为：题根 `richStemV1` 原名进入题目内容草稿；题根 `richSolutionV1` 只进入受权限保护的内容草稿/审核字段，客户端不得直接生成或上传 `publishedRichSolutionV1`。服务端仅在答案发布策略满足后，才把已审核 `richSolutionV1` 投影为作业快照的 `publishedRichSolutionV1`；未满足时该字段必须为 `null`。选项的 `richContentV1` 保持原名逐项映射。普通离线题库、备份和本地渲染不把 `richSolutionV1` 重命名为发布态字段。

`tools/qa_math_rendering_v26.cjs` 固定验证分数、上下标、根式、矢量/方向符号、单位与有效数字示例，断言视觉 DOM、复制文本和可访问名称一致；恶意标签/属性、超过 512 块、row 超过 64 个子节点、超深或超节点数 AST 均被拒绝；不支持 MathML 的模拟环境显示 HTML 回退而不丢语义。内容目录校验器按位置保留题根 `richStemV1`、选项 `richContentV1` 和题根 `richSolutionV1`，但旧 1900 题内容与计数不被改写。

轻量题库与完整 `.pslab` 中的 `questions.json` 升为 question backup v5；新增独立 `physics-studio-backup-v5.schema.json`，按题根 `richStemV1`、选项 `richContentV1`、题根 `richSolutionV1` 严格描述同一 `RichContentV1` 契约，并固定每文档 512 块、row 64 子节点、深度 12、每公式 256 节点、每文本值 200 字符的上限。生成器同时保留 v4 validator，并按 `version` 明确分派；v4 导入迁移为三个 rich 字段缺失，v5 往返必须逐节点一致，未知节点、未知字段或任一超限整体拒绝。不得直接放宽为任意 object，也不得让旧应用把 v5 误读成 v4。运行生成器重建 `backup-validator.js`，QA 覆盖 v4 兼容、v5 往返、三类字段定位、恶意 AST、全部边界上限、轻量 JSON 和 `.pslab` 两条路径。

- [ ] **Step 5: 完成键盘、焦点和减少动画支持**

抽出共享的 dialog focus helper：记录触发器、打开后聚焦标题或首控件、拦截 Tab 环、关闭后恢复焦点。所有自定义可点击卡片改为真实 `button/a` 或补齐等价键盘事件与语义。为 `:focus-visible` 提供不低于 2px 的高对比轮廓；在 `prefers-reduced-motion: reduce` 下禁用非必要位移、闪烁和自动滚动。正确、错误、风险和待复核同时显示明确文字与图标。

- [ ] **Step 6: 运行自动化与人工辅助技术验收**

```powershell
& $node tools\qa_math_rendering_v26.cjs
& $node tools\qa_backup_validator_fields.cjs
& $node tools\qa_accessibility_v26.cjs index.html qa-output\accessibility-v26
& $node tools\qa_learning_lab_scroll.cjs index.html qa-output\local-learning-v26-scroll
& $node tools\qa_student_complete_experience.cjs
```

人工矩阵至少覆盖 Windows NVDA＋键盘、Android TalkBack、浏览器 200% 缩放、系统大字体、减少动画、浅色/深色高对比环境；逐项记录 `PASS|FAIL|NOT_RUN`、设备/系统版本和证据路径。自动化不能替代 NVDA/TalkBack 人工验证，未执行项必须保持 `NOT_RUN`。

- [ ] **Step 7: 提交本任务**

```powershell
git add physics-math.js styles.css experience-shell.css learning-lab.css content-catalog.js backup.js schemas\physics-studio-backup-v5.schema.json tools\generate_backup_validator.cjs backup-validator.js experience-shell.js learning-lab.js index.html tools\qa_math_rendering_v26.cjs tools\qa_backup_validator_fields.cjs tools\qa_accessibility_v26.cjs
git commit -m "feat: improve accessibility and readable touch UI"
```

---

### Task 13: 更新 2.6 发布资产并执行完整离线回归

**Files:**
- Create: `tools/qa_local_learning_release_v26.cjs`
- Modify: `index.html:569-585`
- Modify: `backup.js:62-81,126-142`
- Modify: `Launcher.cs:96-128`
- Modify: `Installer.cs:22-63`
- Modify: `tools/build_release.ps1:147-185`
- Modify: `android/tools/build_android.ps1:139-164`
- Modify: `android/src/com/physicsstudio/studyroom/MainActivity.java`
- Modify: `tools/qa_curriculum_bank.cjs:89-90`
- Modify: `README.md`
- Test: `tools/qa_local_learning_release_v26.cjs`
- Test: `tools/qa_activation_and_1900.cjs`
- Test: `tools/qa_curriculum_bank.cjs`
- Test: `tools/qa_accessibility_v26.cjs`

**Interfaces:**
- Consumes: 四个新生产脚本、state v5、`.pslab` 学习档案、现有 Windows/Android 构建参数和原激活文件。
- Produces: 脚本依赖顺序一致的 Web/Windows/Android 离线资产；备份 `appVersion: "2.6.0"`；Windows 显示版本、Android `VersionName` 和 UA 均为 2.6.0；不改变激活协议与正式题库。

- [ ] **Step 1: 写静态发布清单和版本失败测试**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const scripts = ["diagnostic-bank.js", "learning-evidence.js", "learning-planner.js", "physics-math.js"];
const index = read("index.html");
const order = [
  "curriculum-taxonomy.js", "diagnostic-bank.js", "content-catalog.js",
  "learning-evidence.js", "learning-planner.js", "learning-engine.js", "physics-math.js"
].map((name) => index.indexOf(`src=\"${name}\"`));
assert.ok(order.every((position) => position >= 0));
assert.deepEqual([...order].sort((a, b) => a - b), order);
for (const file of ["Launcher.cs", "Installer.cs", "tools/build_release.ps1", "android/tools/build_android.ps1"]) {
  const source = read(file);
  for (const script of scripts) assert.match(source, new RegExp(script.replace(".", "\\\\.")));
}
assert.match(read("backup.js"), /appVersion:\s*["']2\.6\.0["']/);
assert.match(read("android/src/com/physicsstudio/studyroom/MainActivity.java"), /2\.6\.0/);
assert.match(read("README.md"), /本地学习闭环 v2\.6/);
console.log("local learning release manifest QA passed");
```

- [ ] **Step 2: 运行发布清单测试并确认预期失败**

```powershell
& $node tools\qa_local_learning_release_v26.cjs
```

预期：首先因新增脚本未出现在 Windows 或 Android 资产清单而失败，随后还会暴露旧 `appVersion`/UA；不得只改测试期望值。

- [ ] **Step 3: 按同一依赖顺序更新全部离线资产**

在 `index.html`、Launcher 必需文件、Installer payload、Windows 资源参数、Android assets copy 中均加入 `diagnostic-bank.js`、`learning-evidence.js`、`learning-planner.js`、`physics-math.js`。备份写出 state v5 和 `appVersion: "2.6.0"`，恢复仍把 v4 交给 `normalizeState()`；Android 只更新 UA 版本，不触碰桥方法、权限与激活逻辑。`qa_curriculum_bank.cjs` 目前仍把未改题库断言为旧 `version:2/contentVersion:2026.07.23-taxonomy1`，而受保护的 `curriculum-bank.js` 已是 `version:3/contentVersion:2026.07.29-detailed-solutions-r2`；只把这两个测试常量更新到受保护文件的实际清单值，保留 43 道分年级数量、无七年级、详情、链接、IndexedDB 和截图断言，不能借修测试改变题库或放宽其他断言。README 明确本地能力边界、三类证据、结构化公式能力与普通文本回退、非标准化画像、测试环境和恢复兼容性。

- [ ] **Step 4: 运行纯规则、旧能力和题库激活回归**

```powershell
& $node tools\qa_local_learning_release_v26.cjs
& $node tools\qa_learning_state_v5.cjs
& $node tools\qa_learning_evidence_v26.cjs
& $node tools\qa_transfer_mastery_v26.cjs
& $node tools\qa_capability_profile_v26.cjs
& $node tools\qa_diagnostic_program_v26.cjs
& $node tools\qa_learning_planner_v26.cjs
& $node tools\qa_learning_badges_v26.cjs
& $node tools\qa_math_rendering_v26.cjs
& $node tools\qa_accessibility_v26.cjs index.html qa-output\accessibility-v26
& $node tools\qa_learning_engine.cjs
& $node tools\qa_learning_loop.cjs index.html qa-output\learning-loop-v26
& $node tools\qa_learning_features.cjs index.html qa-output\learning-features-v26
& $node tools\qa_targeted_learning.cjs
& $node tools\qa_activation_and_1900.cjs
& $node tools\qa_curriculum_bank.cjs index.html qa-output\curriculum-bank-v26
```

预期：新脚本依次报告 state v5、规范证据、迁移掌握、七维画像、75+ 诊断、规划、徽章、结构化公式、无障碍自动检查和发布清单通过；旧脚本全部退出码为 0；题库激活脚本确认正式完整题 1900、索引 232、总记录 2132，课程题库浏览器脚本按实际 v3 清单通过，设备激活验证仍通过。

- [ ] **Step 5: 运行最终浏览器矩阵并人工核对截图**

```powershell
& $node tools\qa_local_learning_ui.cjs index.html qa-output\local-learning-v26
& $node tools\qa_learning_lab_scroll.cjs index.html qa-output\local-learning-v26-scroll
& $node tools\qa_feature_upgrade.cjs index.html qa-output\feature-upgrade-v26
& $node tools\qa_student_complete_experience.cjs
& $node tools\qa_android_bridge.cjs index.html qa-output\android-bridge-v26
```

预期：所有脚本退出码为 0；检查桌面与四种移动视口截图，确认标题、档案、关闭按钮可见，无遮挡、截断和横向溢出，学习面板可滚动，教师复核与学生证据显示一致。

- [ ] **Step 6: 验证受保护文件无差异并构建两端产物**

```powershell
git diff --exit-code -- activation-public-key.js activation.js activation.css ActivationManager.cs curriculum-bank.js mock-exam-bank.js original-practice-bank.js targeted-practice-bank.js exam-question-index.js
& .\tools\build_release.ps1 -Version '2.6.0'
& .\android\tools\build_android.ps1 -VersionName '2.6.0' -VersionCode 20600
```

预期：`git diff --exit-code` 无输出且退出码为 0；Windows 发布脚本成功生成 2.6.0 包，Android 构建成功生成 VersionName 2.6.0、VersionCode 20600 的 APK，两个产物都包含四个新脚本。

- [ ] **Step 7: 提交发布与文档任务**

```powershell
git add index.html backup.js Launcher.cs Installer.cs tools\build_release.ps1 android\tools\build_android.ps1 android\src\com\physicsstudio\studyroom\MainActivity.java README.md tools\qa_local_learning_release_v26.cjs
git commit -m "chore: package local learning loop v2.6"
```
