# 物理研习室教师班级工具与本地反馈 v2.6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不依赖真实云权限或网络同步的前提下，为 v2.6.0 增加可迁移的本地班级/分组投影、教师花名册与新生向导、批量专项方案、三档组卷、班级 CSV 成绩、审核复判、覆盖与质量分析，以及可保存草稿并调用系统邮件应用的隐私最小化反馈入口。

**Architecture:** `learning-engine.js` 继续拥有 state v5 的本地学习实体与迁移，`teacher-tools.js` 只实现教师领域的纯函数和审计决策，`learning-lab.js` 负责教师工作台交互。`feedback-client.js` 使用独立 IndexedDB 保存反馈草稿与可选截图，不把反馈草稿混入学习备份；`experience-shell.js` 只负责入口、预览确认和状态文案。Windows 仅把明确的 `mailto:` 交给系统默认处理器，Android 复用现有 `handleNavigation()` 路径；本计划不调用云端反馈 API，也不伪造发送成功。

**Tech Stack:** 原生 JavaScript、Web Storage、IndexedDB、HTML/CSS、Windows WebView2/.NET Framework、Android WebView/Java、Node.js `assert`/`vm`、Playwright Core、既有 PowerShell 构建脚本。

## Global Constraints

- 目标本地版本固定为 `2.6.0`；适用端固定为 Windows WebView2 与 Android WebView。
- 本计划必须在“本地学习闭环 v2.6”计划完成 state v5 证据迁移后执行；不得另建第二套 `Attempt`、`TransferAttempt`、`BaselineSnapshot` 或知识点证据口径。
- 本计划不实现真实账号、`Membership` 权限事实、邀请码、云端班级授权、网络同步、`POST /v1/feedback` 或 SMTP；这些只能由服务端与同步计划实现。
- 本地档案的 `classId/groupId/accountId` 只是离线缓存投影；教师在本地界面只能编辑班级/分组显示名称和学号，不能据此获得或授予云端访问权。
- 旧档案迁移后 `classId/groupId/accountId` 必须为空，不得根据档案名称、年级或设备信息伪造归属。
- 默认离线不得产生反馈、AI 或学习数据网络请求；本计划新增的反馈流程只能“保存草稿”或由用户明确点击后打开系统邮件应用。
- 反馈收件人固定为 `luo865265@gmail.com`；客户端不得保存邮箱、数据库或 OpenAI 服务密钥，也不得显示虚假的“已发送”。
- 反馈默认不得包含题目内容、学生姓名、作答、班级、附件或设备指纹；联系方式、截图和脱敏日志均为选填，且必须先预览再确认。
- 待教师复核的主观题不得增加正确或错误证据；只有教师决策完整记录操作者、时间、前后状态和理由后，才允许改变复核状态。
- 迁移题只有 `gradingStatus === "correct"` 且满足规范的自动可靠判定，或 `verificationMethod === "teacher"` 且 `reviewedBy/reviewedAt` 完整，才计入掌握。
- 批量专项方案必须逐学生生成并保留推荐原因、覆盖知识点、预计时间和教师修改记录；不得把同一题单复制给整班冒充个性化。
- 分层组卷固定生成“基础、进阶、挑战”三档；学生档位只作建议，本地导出或后续发布前必须由教师确认。
- CSV 成绩按学号或账号匹配；导入结果追加为新的考试证据，绝不覆盖应用内正式作答。
- 题目质量最小样本量默认 `30` 名不同学生、每人每题只取最近一次已判定作答；阈值可配置，少于阈值必须显示“证据不足”。
- 难度、区分度和异常作答仅作经典测量理论下的形成性线索，不得自动删除题目或替代教师审核。
- “长期空白知识点”默认以两个 14 天广覆盖周期，即 `28` 天无证据为试运行提醒阈值；“同步数据过期”默认 `7` 天且可配置，均不得表述为标准化诊断。
- Windows 与 Android 保留各自独立本地数据库；完整 `.pslab` 备份继续兼容；“高级工具”继续保留并默认折叠。
- 不新增第三方运行依赖；QA 使用仓库现有 Node/Playwright 运行时和固定 Edge 可执行文件。
- 每个任务必须先运行新增测试并观察预期失败，再写最小实现，再运行同一测试确认通过。

PowerShell 统一运行环境：

```powershell
$node = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\luo47\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

### 跨计划固定接口

本计划直接消费下列已确认接口，名称和字段不得改写：

```js
engine.summarizeKnowledgeEvidence(state, questions, profileId)
// => Array<{
//   knowledgePointId, label, sampleSize, correctCount,
//   independentCorrectCount, verifiedTransferCount,
//   coveredQuestionTypes, latestEvidenceAt, evidenceSources,
//   includesPendingTeacherReview
// }>

engine.buildCapabilityProfile(state, questions, profileId)
// => { generatedAt, boundary, dimensions }

engine.getOrCreateBaselineSnapshot(state, questions, { profileId, grade, date, now })
engine.recordBaselineResponse(state, { snapshotId, itemId, evidenceId, submittedAt })
// BaselineSnapshot.status: "in-progress" | "completed"

engine.recordTransferAttempt(state, input)
engine.reviewTransferAttempt(state, {
  transferAttemptId,
  gradingStatus,
  reviewComment,
  reviewedBy,
  reviewedAt
})
engine.verifiedTransferAttempts(state, sourceQuestionId, profileId)
```

state v5 的 `Attempt` 必须使用 `knowledgePointIds, questionType, modelFamilyId, variantRole, activeDurationSeconds, hintViewCount, maxHintLevel, gradingStatus, score, verificationIssues, primaryErrorType, secondaryErrorTypes, teacherReviewStatus, teacherReviewedAt`；迁移期只读兼容旧 `durationSeconds/hintLevel/grading/errorType`。

### 文件边界

| 文件 | 单一职责 |
| --- | --- |
| `teacher-tools.js` | 花名册、新生状态、批量方案、三档组卷、成绩行校验、审核审计、覆盖矩阵和题目质量纯函数 |
| `exam-grade-import.js` | 受限 CSV/XLSX 读取、文件结构防护与普通二维字符串输出 |
| `feedback-client.js` | 反馈字段白名单、草稿 IndexedDB、截图上限、脱敏日志、预览和 `mailto:` 生成 |
| `learning-engine.js` | state v5 档案投影字段、考试证据与通用学习实体持久化 |
| `learning-lab.js` | 教师中心视图、表单、预览确认和调用领域函数 |
| `app.js` | 题库卡片/详情的内容审核角标 |
| `experience-shell.js` | 学生“我的—帮助与反馈”、教师反馈入口和反馈对话框 |
| `learning-lab.css`, `experience-shell.css`, `styles.css` | 教师工作台、反馈对话框和审核角标样式 |
| `Launcher.cs` | Windows WebView2 外部 URI 白名单及系统 `mailto:` 处理 |
| `android/src/com/physicsstudio/studyroom/MainActivity.java` | 仅复用并验证既有 `mailto:` 默认处理器路径，不新增邮件凭据或桥接秘密 |
| `tools/qa_teacher_tools_engine.cjs` | 教师领域纯函数、边界和迁移 QA |
| `tools/qa_teacher_class_tools_ui.cjs` | 花名册、向导、批量方案、组卷、CSV、复判、矩阵、质量的 Playwright QA |
| `tools/qa_feedback_client.cjs`, `tools/qa_feedback_ui.cjs` | 反馈隐私、草稿、预览、系统邮件路径 QA |
| `tools/qa_host_mailto_policy.cjs` | Windows/Android 宿主 URI 策略静态 QA |

---

### Task 1: 固定 state v5 本地班级投影与教师模块边界

**Files:**
- Create: `teacher-tools.js`
- Create: `tools/qa_teacher_tools_engine.cjs`
- Modify: `learning-engine.js:4-5,341-397,420-482,2021-2143`
- Modify: `index.html:567-586`
- Modify: `Launcher.cs:98-125`
- Modify: `Installer.cs:20-62`
- Modify: `tools/build_release.ps1:138-185,222-255`
- Modify: `android/tools/build_android.ps1:139-165`

**Interfaces:**
- Consumes: state v5 与 `engine.createId(prefix)`。
- Produces: `window.PHYSICS_TEACHER_TOOLS.version === "2.6.0"`；规范化档案字段 `accountId, studentNumber, classId, className, groupId, groupName, membershipProjectionUpdatedAt, lastSyncAt, gradeConfirmedAt, onboardingReportGeneratedAt, onboardingCompletedAt`；状态数组 `teacherReviewHistory, examImportBatches`。

- [ ] **Step 1: 写旧档案迁移失败测试**

在 `tools/qa_teacher_tools_engine.cjs` 用现有 `vm` 模式加载 `learning-engine.js` 和尚不存在的 `teacher-tools.js`，断言旧档案不会被推断出班级 ID：

```js
const migrated = engine.normalizeState({
  version: 4,
  activeProfileId: "legacy",
  profiles: [{ id: "legacy", name: "九年级一班张同学", grade: "九年级" }]
});
const profile = migrated.profiles[0];
assert.equal(migrated.version, 5);
assert.equal(profile.accountId, "");
assert.equal(profile.classId, "");
assert.equal(profile.groupId, "");
assert.equal(profile.className, "");
assert.equal(profile.groupName, "");
assert.deepEqual(migrated.teacherReviewHistory, []);
assert.deepEqual(migrated.examImportBatches, []);
assert.equal(context.PHYSICS_TEACHER_TOOLS.version, "2.6.0");
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
```

预期：FAIL，指出 `teacher-tools.js` 不存在或档案投影字段未定义。若 `migrated.version` 不是 `5`，先完成本地学习闭环计划，不得在本任务建立并行状态版本。

- [ ] **Step 3: 在 `normalizeProfile()` 中加入有界投影字段**

```js
function projectionText(value, maximum) {
  return String(value || "").trim().slice(0, maximum);
}

// 放入 normalizeProfile() 返回对象
accountId: projectionText(profile?.accountId, 160),
studentNumber: projectionText(profile?.studentNumber, 40),
classId: projectionText(profile?.classId, 160),
className: projectionText(profile?.className, 80),
groupId: projectionText(profile?.groupId, 160),
groupName: projectionText(profile?.groupName, 80),
membershipProjectionUpdatedAt: projectionText(profile?.membershipProjectionUpdatedAt, 40),
lastSyncAt: projectionText(profile?.lastSyncAt, 40),
gradeConfirmedAt: projectionText(profile?.gradeConfirmedAt, 40),
onboardingReportGeneratedAt: projectionText(profile?.onboardingReportGeneratedAt, 40),
onboardingCompletedAt: projectionText(profile?.onboardingCompletedAt, 40),
```

`defaultState()` 增加空数组，`normalizeState()` 对审计最多保留 5000 条、导入批次最多保留 500 条：

```js
teacherReviewHistory: [],
examImportBatches: [],
settings: {
  dailyGoal: 5,
  preferredStage: "全部",
  rosterStaleDays: 7,
  rosterLongBlankDays: 28,
  questionQualityMinimumSampleSize: 30
}
```

```js
teacherReviewHistory: Array.isArray(value.teacherReviewHistory)
  ? value.teacherReviewHistory.slice(-5000)
  : [],
examImportBatches: Array.isArray(value.examImportBatches)
  ? value.examImportBatches.slice(-500)
  : [],
```

`createReportPayload()` 的 `profile` 只导出投影字段，不导出反馈草稿、截图或设备标识。

- [ ] **Step 4: 创建冻结的教师领域模块**

```js
(() => {
  "use strict";

  const RETURN_REASONS = Object.freeze([
    Object.freeze({ code: "missing-condition", label: "缺少条件" }),
    Object.freeze({ code: "incomplete-model", label: "建模不完整" }),
    Object.freeze({ code: "unclear-image", label: "图像不清" }),
    Object.freeze({ code: "unit-error", label: "单位错误" }),
    Object.freeze({ code: "answer-error", label: "答案有误" }),
    Object.freeze({ code: "solution-error", label: "解析有误" })
  ]);

  window.PHYSICS_TEACHER_TOOLS = Object.freeze({
    version: "2.6.0",
    returnReasons: RETURN_REASONS
  });
})();
```

- [ ] **Step 5: 把 `teacher-tools.js` 放入网页与双端发布清单**

`index.html` 在 `learning-engine.js` 后、`app.js` 前加载。Windows 的 `Launcher.cs` 必需文件列表、`Installer.cs` payload、`build_release.ps1` 资源与源码 ZIP 列表，以及 Android 资产复制列表均显式加入该文件；缺失时构建必须失败。

- [ ] **Step 6: 运行迁移与模块测试**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
```

预期：PASS，输出 `teacher tools migration QA passed`。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-engine.js index.html Launcher.cs Installer.cs tools/build_release.ps1 android/tools/build_android.ps1 tools/qa_teacher_tools_engine.cjs
git commit -m "feat: add local class projection foundation"
```

---

### Task 2: 建立按班级/分组筛选的教师花名册与新生向导

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-lab.js:10-45,1077-1241,1426-1604,2283-2365`
- Modify: `learning-lab.css:962-1008,2033-2110,2440-2470`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Create: `tools/qa_teacher_class_tools_ui.cjs`

**Interfaces:**
- Consumes: `engine.summarizeKnowledgeEvidence()`, `engine.buildCapabilityProfile()`, `state.baselineSnapshots`, `engine.activeLearningPlan()`, state v5 档案投影。
- Produces: `teacherTools.buildRoster(state, questions, options): RosterView`；`teacherTools.getNewStudentOnboarding(state, questions, profileId): OnboardingStatus`。

- [ ] **Step 1: 写花名册与向导失败测试**

```js
const roster = tools.buildRoster(state, questions, {
  className: "九年级一班",
  groupName: "A组",
  query: "S001",
  staleDays: 7,
  longBlankDays: 28,
  now: "2026-07-31T12:00:00.000Z"
});
assert.equal(roster.rows.length, 1);
assert.equal(roster.rows[0].studentNumber, "S001");
assert.equal(roster.rows[0].localProjectionOnly, true);
assert.equal(roster.rows[0].syncLabel, "仅本机档案");

const onboarding = tools.getNewStudentOnboarding(state, questions, roster.rows[0].profileId);
assert.deepEqual(onboarding.steps.map(({ key, complete }) => [key, complete]), [
  ["class", true],
  ["grade", true],
  ["baseline", true],
  ["exam", true],
  ["report", false],
  ["plan", false]
]);
assert.equal(onboarding.nextStep, "report");
```

Playwright 先断言 `.teacher-roster-card`、`#rosterSearch`、`#rosterClassFilter`、`#rosterGroupFilter`、`.new-student-onboarding` 均存在，并验证搜索不会显示另一班学生。

- [ ] **Step 2: 运行两个测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：纯函数缺失，UI 找不到 `.teacher-roster-card`。

- [ ] **Step 3: 实现可解释花名册数据**

```js
function buildRoster(state, questions, options = {}) {
  const now = new Date(options.now || Date.now()).getTime();
  const staleDays = Math.max(1, Number(options.staleDays) || 7);
  const longBlankDays = Math.max(14, Number(options.longBlankDays) || 28);
  const query = String(options.query || "").trim().toLocaleLowerCase("zh-CN");
  const profiles = state.profiles.filter((profile) => profile.role === "student");
  const rows = profiles.map((profile) => {
    const evidence = engine.summarizeKnowledgeEvidence(state, questions, profile.id);
    const capability = engine.buildCapabilityProfile(state, questions, profile.id);
    const latestSync = Date.parse(profile.lastSyncAt || "");
    const stale = Number.isFinite(latestSync)
      && now - latestSync > staleDays * 86400000;
    const longBlankKnowledgePoints = evidence.filter((item) => {
      const latest = Date.parse(item.latestEvidenceAt || "");
      return item.sampleSize === 0
        || (Number.isFinite(latest) && now - latest > longBlankDays * 86400000);
    }).map((item) => item.label);
    const searchText = [profile.name, profile.studentNumber, profile.accountId,
      profile.className, profile.groupName].join(" ").toLocaleLowerCase("zh-CN");
    return {
      profileId: profile.id,
      name: profile.name,
      studentNumber: profile.studentNumber,
      className: profile.className,
      groupName: profile.groupName,
      localProjectionOnly: !profile.classId,
      syncLabel: profile.lastSyncAt ? (stale ? "数据可能过期" : "最近同步可用") : "仅本机档案",
      stale,
      baselineComplete: state.baselineSnapshots.some((item) => {
        return item.profileId === profile.id && item.status === "completed" && Boolean(item.completedAt);
      }),
      dueReviewCount: engine.dueReviews(state, now, profile.id).length,
      evidenceDimensionCount: capability.dimensions.filter((item) => item.status !== "证据不足").length,
      longBlankKnowledgePoints,
      searchText
    };
  }).filter((row) => {
    return (!options.className || row.className === options.className)
      && (!options.groupName || row.groupName === options.groupName)
      && (!query || row.searchText.includes(query));
  });
  return { rows, staleDays, longBlankDays, generatedAt: new Date(now).toISOString() };
}
```

没有 `lastSyncAt` 时显示“仅本机档案”，不能显示“同步正常”；`classId` 为空时显示“本地分类，不代表云权限”。

- [ ] **Step 4: 实现六步新生向导状态**

```js
function getNewStudentOnboarding(state, questions, profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile || profile.role !== "student") throw new Error("未找到学生档案。");
  const baseline = state.baselineSnapshots.find((item) => {
    return item.profileId === profileId && item.grade === profile.grade && item.status === "completed";
  });
  const exam = state.examRecords.some((item) => item.profileId === profileId);
  const plan = engine.activeLearningPlan(state, profileId);
  const steps = [
    { key: "class", label: "加入班级", complete: Boolean(profile.classId || profile.className) },
    { key: "grade", label: "确认年级", complete: Boolean(profile.gradeConfirmedAt) },
    { key: "baseline", label: "完成摸底", complete: Boolean(baseline?.completedAt) },
    { key: "exam", label: "补录最近正式考试", complete: exam },
    { key: "report", label: "生成初步报告", complete: Boolean(profile.onboardingReportGeneratedAt) },
    { key: "plan", label: "教师确认首个专项方案", complete: Boolean(plan && profile.onboardingCompletedAt) }
  ];
  return {
    profileId,
    steps,
    nextStep: steps.find((item) => !item.complete)?.key || "complete",
    complete: steps.every((item) => item.complete)
  };
}
```

摸底完成只依据 `BaselineSnapshot.status === "completed" && completedAt`；待复核题不阻止流程完成，但报告必须继续显示 `includesPendingTeacherReview`。

- [ ] **Step 5: 改造教师 UI**

在 `.teacher-dashboard` 的首个核心区加入 `.teacher-roster-card`：班级、分组、关键词、过期状态筛选；每行显示学生称呼/学号、本地或同步边界、摸底、作业证据数、订正证据数、到期复习、证据维度数和长期空白知识点。学生表单新增 `managedStudentNumber/ClassName/GroupName/CurriculumVersion`；当前内容目录只支持“人教版”，必须如实显示，不能提供尚未存在的教材版本选项；不提供 `classId/groupId/accountId` 编辑框。

加入 `.new-student-onboarding` 六步清单和下列明确动作：

```html
<button data-lab-action="confirm-onboarding-grade" type="button">确认年级</button>
<button data-lab-action="open-onboarding-baseline" type="button">继续摸底</button>
<button data-lab-action="record-onboarding-report" type="button">生成初步报告</button>
<button data-lab-action="complete-onboarding" type="button">确认首个专项方案</button>
```

`record-onboarding-report` 调用 `engine.createReportPayload()` 后只写 `onboardingReportGeneratedAt`；`complete-onboarding` 必须先检查 active plan，再写 `onboardingCompletedAt`。所有时间使用 ISO 8601。

- [ ] **Step 6: 验证桌面、390×844 和本地边界文案**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：搜索/班级/分组隔离通过；恰好 7 天不提示过期，超过 7 天提示；手机端无页面级横向溢出，所有可操作控件的可触区域宽高均不低于 48px。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-lab.js learning-lab.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs
git commit -m "feat: add local teacher roster and onboarding"
```

---

### Task 3: 批量逐学生生成、调整并确认专项方案

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-engine.js:1545-1705`
- Modify: `learning-lab.js:1077-1241,1426-1604,2295-2324`
- Modify: `learning-lab.css:2291-2378`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`
- Modify: `tools/qa_targeted_learning.cjs:180-330`
- Modify: `tools/qa_targeted_teacher_ui.cjs:108-201`

**Interfaces:**
- Consumes: `engine.buildTargetedLearningPlan(state, questions, options)` 与 `engine.saveTargetedLearningPlan(state, plan)`。
- Produces: `teacherTools.buildBatchTargetedPlans(state, questions, options): BatchPlanDraft`；`teacherTools.reviseBatchTargetedPlan(state, questions, batch, input): BatchPlanDraft`；`teacherTools.approveBatchTargetedPlans(state, batch, actorProfileId): LearningPlan[]`。

- [ ] **Step 1: 写“逐学生而非整班复制”失败测试**

```js
const batch = tools.buildBatchTargetedPlans(state, questions, {
  profileIds: [studentA.id, studentB.id],
  count: 5,
  changedBy: "teacher-local"
});
assert.equal(batch.status, "draft");
assert.equal(batch.plans.length, 2);
assert.notDeepEqual(batch.plans[0].questionIds, batch.plans[1].questionIds);
assert.ok(batch.plans.every((plan) => plan.evidenceReason));
assert.ok(batch.plans.every((plan) => plan.expectedMinutes > 0));
assert.ok(batch.plans.every((plan) => Array.isArray(plan.changeHistory)));

const revised = tools.reviseBatchTargetedPlan(state, questions, batch, {
  profileId: studentA.id,
  focusTopic: "欧姆定律",
  count: 3,
  teacherNote: "先检查公式适用条件",
  changedBy: "teacher-local",
  reason: "教师根据课堂观察缩小范围"
});
assert.equal(revised.plans.find((item) => item.profileId === studentA.id).changeHistory.length, 1);
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_targeted_learning.cjs
```

- [ ] **Step 3: 实现批次与修改记录**

```js
function buildBatchTargetedPlans(state, questions, options = {}) {
  const profileIds = [...new Set(options.profileIds || [])];
  if (!profileIds.length || profileIds.length > 200) throw new Error("批量方案学生数必须为1至200人。");
  const plans = profileIds.map((profileId) => ({
    ...engine.buildTargetedLearningPlan(state, questions, {
      profileId,
      focusTopic: options.focusTopic,
      count: options.count,
      teacherNote: options.teacherNote
    }),
    changeHistory: []
  }));
  return {
    id: engine.createId("plan-batch"),
    status: "draft",
    scope: {
      className: String(options.className || ""),
      groupName: String(options.groupName || "")
    },
    plans,
    createdBy: String(options.changedBy || ""),
    createdAt: new Date().toISOString()
  };
}
```

`reviseBatchTargetedPlan()` 重新调用单学生引擎，并把 `before/after/reason/changedBy/changedAt` 追加到该学生 `changeHistory`。`approveBatchTargetedPlans()` 先完整校验全部方案，再逐份调用 `saveTargetedLearningPlan()`；任何一份无学生、无题或超过 8 题时整批拒绝，不产生部分下发。

- [ ] **Step 4: 实现一页批量审核 UI**

新增 `.batch-targeted-plan-card`，以当前花名册筛选结果生成学生复选框；预览表每行必须显示姓名、推荐知识点、推荐原因、题量、预计分钟、教师备注、修改次数和“调整”按钮。确认按钮文案固定为“确认并下发所选学生方案”，并在调用前显示人数与总题数确认。

- [ ] **Step 5: 扩充 Playwright 断言**

UI QA 创建两名不同证据学生，生成批次，修改其中一人并确认；断言两个 active plan 的 `profileId`、`focusTopics`、`questionIds` 和 `changeHistory` 独立，未勾选学生没有新 plan。

- [ ] **Step 6: 运行专项方案回归**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_targeted_learning.cjs
& $node tools\qa_targeted_teacher_ui.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：3/5/7 题单人方案、批量逐学生方案、教师修改记录和学生首页下发展示全部通过。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-engine.js learning-lab.js learning-lab.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs tools/qa_targeted_learning.cjs tools/qa_targeted_teacher_ui.cjs
git commit -m "feat: add per-student batch learning plans"
```

---

### Task 4: 一键生成基础、进阶、挑战三档组卷

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-lab.js:1272-1285,1318-1327,2086-2129`
- Modify: `learning-lab.css:499-546,962-1008`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`

**Interfaces:**
- Consumes: `engine.isPublishedQuestion(question)`；题目字段 `questionType, difficulty, curriculumChapter, attachments, content`。
- Produces: `teacherTools.generateTieredPaperSet(questions, options): TieredPaperSet`；`teacherTools.confirmTieredPaperSet(state, paperSet, actorProfileId): TieredPaperSet`。

- [ ] **Step 1: 写三档、过滤和确认边界失败测试**

```js
const paperSet = tools.generateTieredPaperSet(questions, {
  title: "力学阶段练习",
  grade: "九年级",
  topics: ["力与运动"],
  chapters: ["第八章 运动和力"],
  questionTypes: ["计算题", "实验题"],
  countPerTier: 6,
  experimentImageRatio: 0.25,
  seed: "qa-tiered-2026-07-31"
});
assert.deepEqual(paperSet.tiers.map((item) => item.label), ["基础", "进阶", "挑战"]);
assert.equal(paperSet.status, "draft");
assert.equal(paperSet.teacherConfirmationRequired, true);
assert.ok(paperSet.tiers.every((tier) => tier.questionIds.length <= 6));
assert.ok(paperSet.tiers.flatMap((tier) => tier.questionIds)
  .every((id) => questions.find((question) => question.id === id).grade === "九年级"));
assert.throws(
  () => tools.confirmTieredPaperSet(state, paperSet, ""),
  /教师档案/
);
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
```

- [ ] **Step 3: 实现确定性三档抽题**

```js
const TIER_RULES = Object.freeze([
  Object.freeze({ key: "foundation", label: "基础", difficulties: ["基础"] }),
  Object.freeze({ key: "advanced", label: "进阶", difficulties: ["基础", "进阶"] }),
  Object.freeze({ key: "challenge", label: "挑战", difficulties: ["进阶", "挑战"] })
]);

function isExperimentImageQuestion(question) {
  return (question.attachments || []).some((item) => item.kind === "image")
    || /实验|图像|电路图|光路图|受力图/.test([
      question.questionType, question.title, question.content
    ].join(" "));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicOrder(items, seed) {
  return items.slice().sort((left, right) => {
    const difference = stableHash(`${seed}|${left.id}`) - stableHash(`${seed}|${right.id}`);
    return difference || String(left.id).localeCompare(String(right.id), "en");
  });
}

function selectTierQuestions(candidates, count, imageRatio, seed) {
  const ordered = deterministicOrder(candidates, seed);
  const imageCount = Math.min(count, Math.round(count * imageRatio));
  const imageQuestions = ordered.filter(isExperimentImageQuestion).slice(0, imageCount);
  const used = new Set(imageQuestions.map((item) => item.id));
  return imageQuestions.concat(ordered.filter((item) => !used.has(item.id))
    .slice(0, Math.max(0, count - imageQuestions.length)));
}
```

`generateTieredPaperSet()` 先按已发布、年级、知识点、章节和题型建立共同池，再按 `TIER_RULES` 分档；题量不足时保留实际题数并写入 `warnings`，不得静默跨年级、跨章节或纳入待审核题。返回字段固定为 `id,title,status,config,tiers,warnings,teacherConfirmationRequired,createdAt`。

- [ ] **Step 4: 实现确认后才可导出的状态机**

`confirmTieredPaperSet()` 验证 `actorProfileId` 对应本机教师档案，将 `status` 从 `draft` 改为 `approved`，写入 `confirmedBy/confirmedAt`，再把三档材料存入 `state.assignments`。`exportAssignment()` 对 `draft` 拒绝并提示“请先由教师确认三档试卷”。

- [ ] **Step 5: 改造组卷 UI**

在组卷卡中增加多选题型、章节、每档题量和 `0/10/20/30/40/50%` 实验图像题比例；主按钮文案改为“一键生成三档预览”。预览并列显示三档实际题数、难度分布、实验图像题比例和不足警告；只有点击“教师确认三档试卷”后显示三个导出按钮。

- [ ] **Step 6: 运行引擎与 UI 测试**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：三档均来自同一知识范围；待审核题被排除；题量不足显示警告；确认前不能导出。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-lab.js learning-lab.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs
git commit -m "feat: add confirmed three-tier paper sets"
```

---

### Task 5: 班级 CSV/XLSX 成绩逐行预检与追加导入

**Files:**
- Create: `exam-grade-import.js`
- Create: `tools/qa_exam_grade_import.cjs`
- Modify: `teacher-tools.js`
- Modify: `learning-engine.js:1299-1347`
- Modify: `learning-lab.js:1216-1233,1537-1577,2367-2414`
- Modify: `learning-lab.css:962-1008,2100-2165`
- Modify: `index.html:567-586`
- Modify: `Launcher.cs:98-125`
- Modify: `Installer.cs:20-62`
- Modify: `tools/build_release.ps1:138-185,222-255`
- Modify: `android/tools/build_android.ps1:139-165`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`

**Interfaces:**
- Consumes: `engine.addExamRecord(state, input)`；档案 `studentNumber/accountId/className`；现有 `fflate.unzipSync` 与浏览器 `DOMParser`。
- Produces: `PhysicsStudioExamGradeImport.parseCsv(text): string[][]`；`PhysicsStudioExamGradeImport.parseXlsx(arrayBuffer): string[][]`；`teacherTools.validateExamRows(state, rows, options): ExamImportPreview`；`teacherTools.commitExamRows(state, preview, options): ExamImportBatch`。

- [ ] **Step 1: 写 CSV/XLSX、重复、无效和未匹配失败测试**

```js
const csv = [
  "\ufeff学号,账号,考试名称,考试日期,得分,总分,覆盖知识点,薄弱知识点,备注",
  'S001,,期中考试,2026-07-20,82,100,"力与运动,功和能",功和能,"含,逗号"',
  "S001,,期中考试,2026-07-20,82,100,力与运动,功和能,重复行",
  "S404,,期中考试,2026-07-20,70,100,力与运动,,未匹配",
  "S002,,期中考试,2026-07-20,120,100,力与运动,,无效"
].join("\r\n");
const csvRows = importer.parseCsv(csv);
const preview = tools.validateExamRows(state, csvRows, {
  className: "九年级一班",
  sourceFileName: "期中.csv"
});
assert.deepEqual(preview.rows.map((row) => row.status), [
  "valid", "duplicate", "unmatched", "invalid"
]);
assert.equal(preview.rows[0].note, "含,逗号");
assert.equal(preview.counts.valid, 1);
assert.equal(preview.counts.duplicate, 1);
assert.equal(preview.counts.unmatched, 1);
assert.equal(preview.counts.invalid, 1);

const workbookBytes = buildMinimalXlsxFixture({
  sheetName: "九年级一班",
  rows: csvRows
});
assert.deepEqual(importer.parseXlsx(workbookBytes), csvRows);
assert.throws(() => importer.parseXlsx(buildXlsxWithFormula()), /公式单元格/);
assert.throws(() => importer.parseXlsx(buildXlsxWithMacro()), /宏或外部链接/);
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_exam_grade_import.cjs
& $node tools\qa_teacher_tools_engine.cjs
```

- [ ] **Step 3: 在独立模块实现受限 CSV 与 XLSX 解析**

```js
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\ufeff/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 存在未闭合的引号。");
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}
```

`parseXlsx()` 只读取第一张可见工作表，通过 `xl/workbook.xml` 与 `xl/_rels/workbook.xml.rels` 解析真实关系目标，支持共享字符串、inline string、数字、布尔和 ISO 日期字符串；拒绝公式单元格、`vbaProject.bin`、`externalLinks/`、DOCTYPE/ENTITY、加密工作簿、超过 5 MiB 的文件、超过 5000 行或 20 列。它只返回普通字符串二维数组，不执行公式、宏、HTML 或外部关系。`exam-grade-import.js` 在 `vendor/fflate.js` 后、`teacher-tools.js` 前加载，并加入 Windows/Android 资产清单。

固定必需列为 `考试名称,考试日期,得分,总分`，且 `学号/账号` 至少一列非空；可选列为 `覆盖知识点,薄弱知识点,备注`。拒绝未知必需语义、空表头、超过 5000 行或 5 MiB 文本。

- [ ] **Step 4: 实现逐行匹配与幂等预览**

匹配只在当前班级范围进行。学号和账号同时匹配到不同档案时标为 `invalid`；零个匹配为 `unmatched`；多个档案共享同一标识时标为 `invalid`；同文件或已有考试证据中出现相同 `profileId|examTitle|examDate|score|totalScore` 时标为 `duplicate`。

`commitExamRows()` 只提交 `status === "valid"` 行，调用 `addExamRecord()` 时写入：

```js
{
  profileId: row.profileId,
  title: row.examTitle,
  examDate: row.examDate,
  score: row.score,
  totalScore: row.totalScore,
  topics: row.coverageTopics,
  weakTopics: row.weakTopics,
  note: row.note,
  sourceFileName: preview.sourceFileName,
  evidenceType: "external-exam",
  importBatchId: batchId,
  importRowNumber: row.rowNumber,
  importFingerprint: row.fingerprint
}
```

`addExamRecord()` 保留这些字段；不得改动 `state.attempts`。

- [ ] **Step 5: 实现 CSV 预览表**

教师成绩卡接受 `.csv,.xlsx`；先按文件头确认 ZIP/XLSX 或文本类型，再调用对应解析器。解析后显示原始行号、匹配学生、状态和精确错误原因。确认区显示四类数量，并提供“仅导入 N 条有效记录”；当 N 为 0 时禁用。导入后保留批次摘要，不自动隐藏错误行。

- [ ] **Step 6: 验证重复导入不新增证据**

```powershell
& $node tools\qa_exam_grade_import.cjs
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：第一次新增 1 条考试证据；同一文件第二次全部为 duplicate；应用内 `attempts` 数量不变。

- [ ] **Step 7: Commit**

```powershell
git add exam-grade-import.js teacher-tools.js learning-engine.js learning-lab.js learning-lab.css index.html Launcher.cs Installer.cs tools/build_release.ps1 android/tools/build_android.ps1 tools/qa_exam_grade_import.cjs tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs
git commit -m "feat: add row-validated class exam file import"
```

---

### Task 6: 增加内容审核角标、标准退回理由与历史

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-lab.js:1077-1086,1298-1316,1509-1524`
- Modify: `app.js:1644-1683,2826-2889`
- Modify: `learning-lab.css:499-546,1455-1470`
- Modify: `styles.css`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`
- Modify: `tools/qa_feature_upgrade.cjs:150-225`

**Interfaces:**
- Consumes: `teacherTools.returnReasons` 与 `lab.app.updateQuestion(id, patch)`。
- Produces: `teacherTools.contentReviewBadge(question): ReviewBadge`；`teacherTools.createContentReviewDecision(state, question, input): { questionPatch, auditRecord }`。

- [ ] **Step 1: 写退回必须有标准理由的失败测试**

```js
assert.throws(() => tools.createContentReviewDecision(state, question, {
  action: "return",
  reasonCode: "",
  comment: "",
  reviewedBy: "teacher-local"
}), /退回理由/);

const decision = tools.createContentReviewDecision(state, question, {
  action: "return",
  reasonCode: "missing-condition",
  comment: "需补充忽略空气阻力的条件",
  reviewedBy: "teacher-local",
  reviewedAt: "2026-07-31T12:00:00.000Z"
});
assert.equal(decision.questionPatch.contentReviewStatus, "教师已退回");
assert.equal(decision.questionPatch.contentReviewReasonLabel, "缺少条件");
assert.equal(decision.auditRecord.before.status, "待教师审核");
assert.equal(decision.auditRecord.after.status, "教师已退回");
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
```

- [ ] **Step 3: 实现角标与审计对象**

```js
const REVIEW_DECISION_REASONS = Object.freeze({
  "teacher-verified": "教师复核通过",
  "score-adjustment": "评分修正"
});

function contentReviewBadge(question = {}) {
  const status = String(question.contentReviewStatus || "待教师审核");
  if (status === "教师已退回") return {
    code: "returned",
    label: question.contentReviewReasonLabel
      ? `教师已退回 · ${question.contentReviewReasonLabel}`
      : "教师已退回"
  };
  if (status === "教师已通过") return { code: "approved", label: "教师已通过" };
  if (status === "应用内原创已发布") return { code: "published", label: status };
  return { code: "pending", label: "待教师审核" };
}
```

`createContentReviewDecision()` 只接受 `approve|return`；退回理由必须来自六个固定 code，通过理由固定为 `REVIEW_DECISION_REASONS["teacher-verified"]`；返回 patch 包含 `contentReviewStatus,contentReviewReasonCode,contentReviewReasonLabel,contentReviewComment,contentReviewedAt,contentReviewedByProfileId`。审计记录包含 `id,targetType:"content",targetId,action,before,after,reasonCode,reasonLabel,comment,reviewedBy,reviewedAt`。Task 7 的人工改分使用同一常量表中的 `score-adjustment`，不得把通过/改分理由混入六个退回选项。

- [ ] **Step 4: 调整审核 UI 的写入顺序**

退回按钮先打开理由选择和批注输入；通过按钮使用理由 `teacher-verified/教师复核通过`。先 `await app.updateQuestion()` 成功，再把 audit 追加到 `state.teacherReviewHistory` 并 `saveLearningState()`；题库写入失败时不得留下“已审核”本地历史。

- [ ] **Step 5: 在题卡、详情和审核队列显示一致角标**

`questionCardTemplate()`、`openDetail()` 和 `.content-review-list` 都调用 `contentReviewBadge()`，CSS 类固定为 `review-badge-pending/approved/returned/published`。退回题仍被 `engine.isPublishedQuestion()` 排除。

- [ ] **Step 6: 运行内容审核回归**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
& $node tools\qa_feature_upgrade.cjs .\index.html .\qa-output\feature-upgrade-v26
```

预期：无理由退回被阻止；理由与批注在角标/历史可见；退回题不能进入专项方案和三档组卷。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-lab.js app.js learning-lab.css styles.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs tools/qa_feature_upgrade.cjs
git commit -m "feat: add auditable content review reasons"
```

---

### Task 7: 打通主观题和迁移题教师复判

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-lab.js:1077-1333,1426-1577`
- Modify: `learning-lab.css`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`
- Modify: `tools/qa_learning_engine.cjs`
- Modify: `tools/qa_learning_loop.cjs`

**Interfaces:**
- Consumes: state v5 `Attempt`、`state.transferAttempts`、`engine.reviewTransferAttempt()`、`engine.questionMasteryEvidence()`。
- Produces: `teacherTools.buildTeacherReviewQueue(state, questions, options)`；`teacherTools.decideAttemptReview(state, input)`；`teacherTools.decideTransferReview(state, input)`。

- [ ] **Step 1: 写待复核不改掌握、复判全审计失败测试**

```js
const before = engine.questionMasteryEvidence(state, question.id, student.id);
assert.equal(pendingAttempt.teacherReviewStatus, "pending");
assert.equal(before.independentCorrect, 0);

const reviewed = tools.decideAttemptReview(state, {
  attemptId: pendingAttempt.id,
  action: "rejudge",
  gradingStatus: "partial",
  score: 60,
  reasonCode: "score-adjustment",
  comment: "受力图方向正确，方程缺少一个约束",
  reviewedBy: "teacher-local",
  reviewedAt: "2026-07-31T12:00:00.000Z"
});
assert.equal(reviewed.attempt.teacherReviewStatus, "approved");
assert.equal(reviewed.attempt.gradingStatus, "partial");
assert.equal(reviewed.attempt.score, 60);
assert.deepEqual(reviewed.audit.before, { status: "pending", score: null });
assert.deepEqual(reviewed.audit.after, { status: "partial", score: 60 });

const transfer = tools.decideTransferReview(state, {
  transferAttemptId: pendingTransfer.id,
  action: "approve",
  gradingStatus: "correct",
  reasonCode: "teacher-verified",
  comment: "模型与适用条件完整",
  reviewedBy: "teacher-local"
});
assert.equal(transfer.transferAttempt.verificationMethod, "teacher");
assert.equal(transfer.transferAttempt.gradingStatus, "correct");
assert.ok(transfer.transferAttempt.reviewedAt);
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_learning_engine.cjs
```

- [ ] **Step 3: 实现统一队列**

`buildTeacherReviewQueue()` 收集：`teacherReviewStatus === "pending"` 的 Attempt；`questionType` 为受力分析、建模、实验论证、开放题、简答题或证明题且尚未复核的 Attempt；`gradingStatus === "pending"` 的 TransferAttempt。过滤条件固定支持学生、班级显示名、分组显示名和目标类型，排序固定为最早待处理优先。

- [ ] **Step 4: 实现 Attempt 决策**

```js
function normalizedReviewScore(status, score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("教师得分必须为0至100。");
  }
  if (status === "correct" && value !== 100) throw new Error("正确状态得分必须为100。");
  if (status === "incorrect" && value !== 0) throw new Error("错误状态得分必须为0。");
  if (status === "partial" && (value <= 0 || value >= 100)) {
    throw new Error("部分正确得分必须大于0且小于100。");
  }
  return value;
}
```

`return` 动作把 `teacherReviewStatus` 设为 `returned`，保持 `gradingStatus:"pending"/score:null`，理由必须来自标准退回表；`approve/rejudge` 只允许 `correct|partial|incorrect` 并调用上述得分校验。每次均写 `teacherReviewedAt` 和完整 audit。

- [ ] **Step 5: 包装规范 TransferAttempt 复判**

`decideTransferReview()` 对 `approve/rejudge` 调用 `engine.reviewTransferAttempt()`；`return` 固定传 `gradingStatus:"incorrect"`，使其不计掌握，并在 audit 中保存 action=`return`。不得新建另一份迁移记录或继续写旧 `experimentRecords`。

- [ ] **Step 6: 实现教师复判卡**

新增 `.teacher-review-queue-card`；每项显示学生、题目、题型、原答案/迁移回答、自动校验问题、原状态与得分。教师可批注、选择得分与状态、退回重做或复判；退回必须选择标准理由。历史抽屉按时间展示操作者、前后状态、分数、理由和批注。

- [ ] **Step 7: 运行掌握与 UI 回归**

```powershell
& $node tools\qa_learning_engine.cjs
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_learning_loop.cjs .\index.html .\qa-output\learning-loop-v26
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：待复核主观题不改变掌握；迁移通过后满足其他条件时“已掌握”可达；迁移退回后不计掌握；全部动作有审计历史。

- [ ] **Step 8: Commit**

```powershell
git add teacher-tools.js learning-lab.js learning-lab.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs tools/qa_learning_engine.cjs tools/qa_learning_loop.cjs
git commit -m "feat: add subjective and transfer regrading"
```

---

### Task 8: 建立班级知识点覆盖矩阵

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-lab.js:1197-1214,1272-1296`
- Modify: `learning-lab.css:1635-1655,2100-2165`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`

**Interfaces:**
- Consumes: `engine.summarizeKnowledgeEvidence(state, questions, profileId): KnowledgeEvidenceSummary[]`。
- Produces: `teacherTools.buildKnowledgeCoverageMatrix(state, questions, options): KnowledgeCoverageMatrix`。

- [ ] **Step 1: 写样本量、题型、日期和待复核标记失败测试**

```js
const matrix = tools.buildKnowledgeCoverageMatrix(state, questions, {
  profileIds: [studentA.id, studentB.id],
  longBlankDays: 28,
  now: "2026-07-31T12:00:00.000Z"
});
assert.deepEqual(matrix.rows.map((row) => row.profileId), [studentA.id, studentB.id]);
const cell = matrix.rows[0].cells.find((item) => item.knowledgePointId === "kp-force");
assert.equal(cell.sampleSize, 2);
assert.deepEqual(cell.coveredQuestionTypes.sort(), ["实验题", "计算题"]);
assert.equal(cell.latestEvidenceAt, "2026-07-30T10:00:00.000Z");
assert.equal(cell.includesPendingTeacherReview, true);
assert.equal(matrix.rows[1].longBlankKnowledgePointIds.includes("kp-force"), true);
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
```

- [ ] **Step 3: 只组合共享证据摘要，不重算结论**

```js
function buildKnowledgeCoverageMatrix(state, questions, options = {}) {
  const now = new Date(options.now || Date.now()).getTime();
  const longBlankDays = Math.max(14, Number(options.longBlankDays) || 28);
  const profileIds = [...new Set(options.profileIds || [])];
  const summaries = new Map(profileIds.map((profileId) => [
    profileId,
    engine.summarizeKnowledgeEvidence(state, questions, profileId)
  ]));
  const columnMap = new Map();
  summaries.forEach((items) => items.forEach((item) => {
    columnMap.set(item.knowledgePointId, {
      knowledgePointId: item.knowledgePointId,
      label: item.label
    });
  }));
  const columns = [...columnMap.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  const rows = profileIds.map((profileId) => {
    const profile = state.profiles.find((item) => item.id === profileId);
    const byId = new Map(summaries.get(profileId).map((item) => [item.knowledgePointId, item]));
    const cells = columns.map((column) => byId.get(column.knowledgePointId) || {
      ...column,
      sampleSize: 0,
      correctCount: 0,
      independentCorrectCount: 0,
      verifiedTransferCount: 0,
      coveredQuestionTypes: [],
      latestEvidenceAt: null,
      evidenceSources: [],
      includesPendingTeacherReview: false
    });
    const longBlankKnowledgePointIds = cells.filter((cell) => {
      const latest = Date.parse(cell.latestEvidenceAt || "");
      return cell.sampleSize === 0
        || (Number.isFinite(latest) && now - latest > longBlankDays * 86400000);
    }).map((cell) => cell.knowledgePointId);
    return { profileId, name: profile?.name || profileId, cells, longBlankKnowledgePointIds };
  });
  return { columns, rows, longBlankDays, generatedAt: new Date(now).toISOString() };
}
```

- [ ] **Step 4: 实现可访问矩阵 UI**

新增 `.knowledge-coverage-matrix-card`，使用真实 `<table>`、行列标题和 `aria-describedby`；每格显示状态、样本量、题型数、最近日期、来源和“含待复核”标记。`sampleSize === 0` 固定显示“证据不足”，不能显示 0% 能力。表格允许自身横向滚动，页面根节点不得横向溢出；手机端提供按学生查看的卡片模式。

- [ ] **Step 5: 增加矩阵筛选与长空白入口**

矩阵与花名册共用班级/分组/学生范围；点击“长期空白”只过滤 28 天阈值命中的列，不改变底层证据。表头明确写“28 天为两个双周周期的试运行提醒，不是能力结论”。

- [ ] **Step 6: 运行矩阵 QA**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：矩阵字段与共享接口完全一致；待复核只显示标记，不增加正确数；桌面表格内滚动、390×844 卡片模式均可用。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-lab.js learning-lab.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs
git commit -m "feat: add knowledge coverage matrix"
```

---

### Task 9: 题目质量统计与 29/30 低样本边界

**Files:**
- Modify: `teacher-tools.js`
- Modify: `learning-lab.js:1272-1333`
- Modify: `learning-lab.css`
- Modify: `tools/qa_teacher_tools_engine.cjs`
- Modify: `tools/qa_teacher_class_tools_ui.cjs`

**Interfaces:**
- Consumes: state v5 已判定 Attempt；每题每名学生的最近一次结果。
- Produces: `teacherTools.calculateQuestionQuality(state, questionId, options): QuestionQualityResult`；`teacherTools.buildQuestionQualityReport(state, questions, options)`。

- [ ] **Step 1: 写 29 人不足、30 人显示的失败测试**

```js
const low = tools.calculateQuestionQuality(stateWith29Students, "q-quality", {
  minimumSampleSize: 30
});
assert.equal(low.status, "insufficient-evidence");
assert.equal(low.label, "证据不足");
assert.equal(low.sampleSize, 29);
assert.equal(low.difficultyIndex, null);
assert.equal(low.discrimination, null);

const ready = tools.calculateQuestionQuality(stateWith30Students, "q-quality", {
  minimumSampleSize: 30
});
assert.equal(ready.status, "available");
assert.equal(ready.sampleSize, 30);
assert.ok(ready.difficultyIndex >= 0 && ready.difficultyIndex <= 1);
assert.ok(ready.discrimination === null
  || (ready.discrimination >= -1 && ready.discrimination <= 1));
assert.equal(typeof tools.deleteQuestion, "undefined");
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
```

- [ ] **Step 3: 实现每人最近一次样本与难度指数**

仅纳入 `gradingStatus` 为 `correct|partial|incorrect` 且主观题教师复核已完成的 Attempt。按 `profileId` 去重，每名学生每题只保留 `completedAt/createdAt` 最新记录；`score` 归一化为 `0..1`，`correct=1`、`incorrect=0`，`partial` 必须使用实际分数。

```js
function pearson(left, right) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => {
    return sum + (value - leftMean) * (right[index] - rightMean);
  }, 0);
  const leftSpread = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
  const rightSpread = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
  if (!leftSpread || !rightSpread) return null;
  return Math.round(numerator / Math.sqrt(leftSpread * rightSpread) * 1000) / 1000;
}
```

难度指数固定为样本得分均值；数值越高代表该题在当前样本中越容易，UI 不把它翻译为学生能力。

- [ ] **Step 4: 实现题目—其余题表现相关与异常聚类**

区分度使用 item-rest correlation：每名学生至少有 3 道其他题的已判定记录，取其他题平均分作为外部表现，再与本题得分做 Pearson 相关；无方差或可用人数不足时返回 `null` 和“不可计算”。异常作答只聚合归一化后的非空错误答案；同一错误答案至少 3 人且占错误样本 20% 才显示，绝不展示学生名单。

- [ ] **Step 5: 实现低样本先行 UI**

新增 `.question-quality-card`。少于阈值时只显示 `样本量/阈值` 与“证据不足”，不渲染难度、区分度或异常答案；达到阈值后显示指标定义、样本口径和限制。卡片内不得出现“删除题目”“自动下架”或任何会改题库状态的操作。

- [ ] **Step 6: 运行质量边界 QA**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_teacher_class_tools_ui.cjs
```

预期：29 人时隐藏指标，30 人时显示；同一学生重复刷题不增加 sampleSize；待复核作答被排除；统计不修改题目。

- [ ] **Step 7: Commit**

```powershell
git add teacher-tools.js learning-lab.js learning-lab.css tools/qa_teacher_tools_engine.cjs tools/qa_teacher_class_tools_ui.cjs
git commit -m "feat: add low-sample-gated item quality metrics"
```

---

### Task 10: 建立隐私最小化反馈草稿与 `mailto:` 生成器

**Files:**
- Create: `feedback-client.js`
- Create: `tools/qa_feedback_client.cjs`
- Modify: `index.html:567-586`
- Modify: `Launcher.cs:98-125`
- Modify: `Installer.cs:20-62`
- Modify: `tools/build_release.ps1:138-185,222-255`
- Modify: `android/tools/build_android.ps1:139-165`

**Interfaces:**
- Consumes: 浏览器 IndexedDB、Blob、`navigator.userAgent`。
- Produces: `window.PhysicsStudioFeedback`，包含 `loadDraft(), saveDraft(input), clearDraft(), buildPreview(input), buildMailto(input), detectSystemType()`；不提供 `send()` 或网络提交函数。

- [ ] **Step 1: 写字段白名单、脱敏和无网络失败测试**

```js
const preview = feedback.buildPreview({
  issueType: "功能异常",
  description: "教师中心无法保存方案",
  currentPage: "teacher:center",
  contact: "user@example.com",
  studentName: "不应出现",
  className: "不应出现",
  questionContent: "不应出现",
  includeLogs: true,
  diagnosticLog: "token=secret\nstudentName=张同学"
});
assert.equal(preview.payload.studentName, undefined);
assert.equal(preview.payload.className, undefined);
assert.equal(preview.payload.questionContent, undefined);
assert.doesNotMatch(preview.payload.diagnosticLog, /secret|张同学/);
assert.equal(preview.excludedFields.includes("学生姓名"), true);

const mailto = feedback.buildMailto(preview.payload);
assert.ok(mailto.startsWith("mailto:luo865265@gmail.com?"));
assert.match(decodeURIComponent(mailto), /教师中心无法保存方案/);
assert.doesNotMatch(source, /\bfetch\s*\(/);
assert.equal(typeof feedback.send, "undefined");
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
& $node tools\qa_feedback_client.cjs
```

预期：FAIL，`feedback-client.js` 不存在。

- [ ] **Step 3: 实现固定字段与脱敏**

```js
const RECIPIENT = "luo865265@gmail.com";
const DRAFT_DB = "physics-studio-feedback";
const DRAFT_STORE = "drafts";
const ACTIVE_DRAFT_ID = "active";
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function sanitizeText(value, maximum) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, maximum);
}

function sanitizeLog(value) {
  return sanitizeText(value, 12000)
    .split(/\r?\n/).slice(0, 100)
    .map((line) => line
      .replace(/(token|password|secret|authorization)\s*[:=]\s*\S+/ig, "$1=[已移除]")
      .replace(/[\u4e00-\u9fff]{2,4}(?=同学|学生)/g, "[姓名已移除]"))
    .join("\n");
}

function detectSystemType() {
  if (window.PhysicsStudioAndroid) return "Android WebView";
  if (/Windows/i.test(navigator.userAgent || "")) return "Windows WebView2";
  return "Browser";
}

function buildFeedbackPayload(input = {}) {
  return {
    issueType: sanitizeText(input.issueType, 40),
    description: sanitizeText(input.description, 4000),
    currentPage: sanitizeText(input.currentPage, 120),
    contact: sanitizeText(input.contact, 200),
    appVersion: "2.6.0",
    systemType: detectSystemType(),
    diagnosticLog: input.includeLogs ? sanitizeLog(input.diagnosticLog) : ""
  };
}
```

敏感键必须保留键名但移除值；QA 需覆盖 `token/password/secret/authorization` 四种写法。`buildPreview()` 返回 `{ payload, excludedFields, screenshotIncluded, screenshotMailWarning }`；固定 `excludedFields` 为 `题目内容,学生姓名,作答,班级,普通附件,设备指纹`。

- [ ] **Step 4: 用独立 IndexedDB 保存草稿和可选截图**

```js
function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE)) {
        request.result.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("反馈草稿数据库不可用。"));
  });
}
```

`saveDraft()` 只接受 `image/png,image/jpeg,image/webp` 且不超过 5 MiB 的截图 Blob，写 `{id:"active",payload,screenshot,screenshotName,updatedAt}`；`clearDraft()` 只删 active draft。草稿不进入 `learning-engine`、`.pslab` 或运行日志。

- [ ] **Step 5: 生成受限 `mailto:`**

```js
function buildMailto(input = {}) {
  const payload = buildFeedbackPayload(input);
  if (!payload.issueType || !payload.description) throw new Error("请填写问题类型和问题描述。");
  const subject = `[物理研习室 2.6.0] ${payload.issueType}`;
  const body = [
    `问题类型：${payload.issueType}`,
    `问题描述：${payload.description}`,
    `当前页面：${payload.currentPage || "未记录"}`,
    `联系方式：${payload.contact || "未填写"}`,
    `应用版本：${payload.appVersion}`,
    `系统类型：${payload.systemType}`,
    payload.diagnosticLog ? `脱敏日志：\n${payload.diagnosticLog}` : "未附加日志",
    "截图不会由 mailto 自动附加；如需提供，请在邮件应用中手动添加。"
  ].join("\n\n");
  return `mailto:${RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

window.PhysicsStudioFeedback = Object.freeze({
  loadDraft,
  saveDraft,
  clearDraft,
  buildPreview,
  buildMailto,
  detectSystemType
});
```

- [ ] **Step 6: 纳入网页与两端发布清单**

`index.html` 在 `experience-shell.js` 前加载 `feedback-client.js`；Windows payload、源码 ZIP 和 Android assets 均显式包含该文件。

- [ ] **Step 7: 运行反馈核心测试**

```powershell
& $node tools\qa_feedback_client.cjs
```

预期：PASS，输出 `feedback client privacy QA passed`；源码不存在 `fetch(`、SMTP 凭据字段或发送成功常量。

- [ ] **Step 8: Commit**

```powershell
git add feedback-client.js index.html Launcher.cs Installer.cs tools/build_release.ps1 android/tools/build_android.ps1 tools/qa_feedback_client.cjs
git commit -m "feat: add private local feedback drafts"
```

---

### Task 11: 在学生“我的”和教师端接入反馈表单、草稿与预览确认

**Files:**
- Create: `tools/qa_feedback_ui.cjs`
- Modify: `experience-shell.js:95-152,1531-1571,1600-1633,1635-1753`
- Modify: `experience-shell.css:785-821,932-952,1127-1148,1836-1906`
- Modify: `tools/qa_experience_shell.cjs`
- Modify: `tools/qa_targeted_teacher_ui.cjs`

**Interfaces:**
- Consumes: `window.PhysicsStudioFeedback.loadDraft/saveDraft/clearDraft/buildPreview/buildMailto`。
- Produces: `#feedbackDialog`、学生 `[data-shell-action="open-feedback"]`、教师 `[data-teacher-action="feedback"]`。

- [ ] **Step 1: 写双入口、草稿恢复和预览确认失败测试**

```js
assert.equal(await page.locator('[data-shell-action="open-feedback"]').count(), 1);
await page.locator('[data-shell-action="open-feedback"]').click();
await page.locator("#feedbackIssueType").selectOption("功能异常");
await page.locator("#feedbackDescription").fill("离线草稿验证");
await page.locator('[data-feedback-action="save-draft"]').click();
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator('[data-shell-action="open-feedback"]').click();
assert.equal(await page.locator("#feedbackDescription").inputValue(), "离线草稿验证");

await page.locator('[data-feedback-action="preview"]').click();
assert.match(await page.locator(".feedback-preview").innerText(), /默认排除.*学生姓名.*班级/);
assert.equal(await page.locator('[data-feedback-action="system-mail"]').isDisabled(), true);
await page.locator("#feedbackPreviewConfirmed").check();
assert.equal(await page.locator('[data-feedback-action="system-mail"]').isDisabled(), false);
```

教师模式另断言 `[data-teacher-action="feedback"]` 存在并打开同一对话框。

- [ ] **Step 2: 运行 UI 测试并确认失败**

```powershell
& $node tools\qa_feedback_ui.cjs
```

预期：FAIL，反馈入口或对话框不存在。

- [ ] **Step 3: 创建反馈对话框和状态模型**

`initialize()` 增加 `createFeedbackDialog()`；对话框字段固定为：问题类型、问题描述、当前页面、联系方式、截图、应用版本/系统类型只读项、是否附加脱敏日志。问题类型选项固定为 `功能异常,内容问题,使用建议,无障碍问题,其他`。

```html
<dialog class="feedback-dialog" id="feedbackDialog">
  <form id="feedbackForm" method="dialog">
    <header>
      <div><span>HELP &amp; FEEDBACK</span><h2>帮助与反馈</h2></div>
      <button data-feedback-action="close" type="button" aria-label="关闭反馈">×</button>
    </header>
    <label><span>问题类型</span><select id="feedbackIssueType" required></select></label>
    <label><span>问题描述</span><textarea id="feedbackDescription" maxlength="4000" required></textarea></label>
    <label><span>当前页面</span><input id="feedbackCurrentPage" readonly></label>
    <label><span>联系方式（选填）</span><input id="feedbackContact" maxlength="200"></label>
    <label><span>截图（选填，最大 5 MiB）</span><input id="feedbackScreenshot" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label><input id="feedbackIncludeLogs" type="checkbox"> 附加脱敏错误日志</label>
    <div class="feedback-preview" aria-live="polite"></div>
    <footer>
      <button data-feedback-action="save-draft" type="button">保存本地草稿</button>
      <button data-feedback-action="preview" type="button">预览将发送的文字</button>
      <button data-feedback-action="system-mail" type="button" disabled>用系统邮件应用发送</button>
    </footer>
  </form>
</dialog>
```

- [ ] **Step 4: 增加双入口和逻辑页面标识**

学生“我的”工具列表增加“帮助与反馈”；教师顶部栏增加“反馈”。`feedbackCurrentPage` 只使用 `student:<ui.view>`、`teacher:center` 或 `parent:summary`，不保存 `file://` 路径、完整 URL、题目 ID、档案 ID 或班级名称。

- [ ] **Step 5: 实现草稿、预览与系统邮件动作**

保存动作调用 `saveDraft()` 后显示“草稿已保存在本机，尚未发送”；预览动作渲染白名单字段、默认排除项、日志状态和截图说明，并重置确认框；系统邮件动作只有确认后执行：

```js
const mailto = window.PhysicsStudioFeedback.buildMailto(feedbackPreview.payload);
window.location.href = mailto;
setFeedbackStatus("已交给系统邮件应用；是否实际发送请以邮件应用为准，本应用不记录为已发送。", false);
```

关闭或保存草稿都不得清空；只有用户点击“删除草稿”并确认后调用 `clearDraft()`。截图在 `mailto:` 中不会自动附加，UI 必须提示在邮件应用内手动添加。

- [ ] **Step 6: 完成键盘、焦点与手机样式**

对话框打开后聚焦问题类型；Escape/关闭按钮可关闭；错误状态使用 `role="alert"`；320×568 与 390×844 下表单单列、底部按钮可换行且无页面级横向溢出。

- [ ] **Step 7: 运行反馈与既有角色 UI 回归**

```powershell
& $node tools\qa_feedback_client.cjs
& $node tools\qa_feedback_ui.cjs
& $node tools\qa_experience_shell.cjs .\index.html .\qa-output\experience-shell-v26
& $node tools\qa_targeted_teacher_ui.cjs
```

预期：学生/教师入口共用同一草稿；重载后恢复；未确认不能打开 mailto；所有状态文案不包含“已发送”。

- [ ] **Step 8: Commit**

```powershell
git add experience-shell.js experience-shell.css tools/qa_feedback_ui.cjs tools/qa_experience_shell.cjs tools/qa_targeted_teacher_ui.cjs
git commit -m "feat: add feedback form and local draft UI"
```

---

### Task 12: 安全放行 Windows `mailto:` 并回归 Android 既有处理路径

**Files:**
- Create: `tools/qa_host_mailto_policy.cjs`
- Modify: `Launcher.cs:194-225,574-607`
- Modify: `tools/qa_android_bridge.cjs:65-110`
- Test: `android/src/com/physicsstudio/studyroom/MainActivity.java:142-224`

**Interfaces:**
- Consumes: `feedback.buildMailto()` 生成的绝对 `mailto:` URI。
- Produces: `Program.IsAllowedExternalUri(Uri)`；Windows HTTP(S) 仍优先 Edge，`mailto:` 只交系统默认处理器；Android 保持现有 `handleNavigation()` → `openExternal()` → `openWithDefaultHandler()`。

- [ ] **Step 1: 写宿主 URI 白名单失败测试**

`tools/qa_host_mailto_policy.cjs` 读取两个宿主源码并断言：

```js
assert.match(launcher, /Uri\.UriSchemeHttp/);
assert.match(launcher, /Uri\.UriSchemeHttps/);
assert.match(launcher, /string\.Equals\(uri\.Scheme,\s*"mailto"/);
assert.match(launcher, /UseShellExecute\s*=\s*true/);
assert.doesNotMatch(launcher, /UriSchemeFile/);
assert.match(android, /"mailto"\.equalsIgnoreCase\(scheme\)/);
assert.match(android, /if \(isWebUri\(uri\) && openWithEdge\(uri\)\) return;/);
assert.match(android, /openWithDefaultHandler\(uri\)/);
```

同时静态断言 Windows 的 Edge 分支只用于 HTTP(S)，`mailto:` 不拼到 `msedge.exe` 参数。

- [ ] **Step 2: 运行测试并确认 Windows 失败、Android 通过**

```powershell
& $node tools\qa_host_mailto_policy.cjs
```

预期：FAIL，Windows 尚未允许 `mailto:`；Android 既有路径断言通过。

- [ ] **Step 3: 提取 Windows URI 白名单**

```csharp
internal static bool IsAllowedExternalUri(Uri uri)
{
    if (uri == null || !uri.IsAbsoluteUri) return false;
    return uri.Scheme == Uri.UriSchemeHttp
        || uri.Scheme == Uri.UriSchemeHttps
        || string.Equals(uri.Scheme, "mailto", StringComparison.OrdinalIgnoreCase);
}
```

`HandleNavigationStarting()` 和 `HandleNewWindowRequested()` 继续阻止非内部导航，再把绝对 URI 交给 `OpenExternal()`；`file:`, `data:`, `javascript:`, `shell:` 和自定义 scheme 全部拒绝。

- [ ] **Step 4: 让 `mailto:` 绕过 Edge**

```csharp
internal static bool OpenExternal(Uri uri)
{
    if (!IsAllowedExternalUri(uri)) return false;
    try
    {
        if (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
        {
            string edgePath = FindMicrosoftEdge();
            if (!string.IsNullOrEmpty(edgePath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = edgePath,
                    Arguments = "\"" + uri.AbsoluteUri + "\"",
                    UseShellExecute = true
                });
                return true;
            }
        }
        Process.Start(new ProcessStartInfo
        {
            FileName = uri.AbsoluteUri,
            UseShellExecute = true
        });
        return true;
    }
    catch
    {
        return false;
    }
}
```

- [ ] **Step 5: 只扩充 Android QA，不改既有 Java 路径**

`qa_android_bridge.cjs` 增加 `mailto`、默认处理器和“非 Web URI 不传 Edge”的源码断言。Android 不增加 SMTP、收件人或邮件正文原生常量；收件人与正文仍由已确认的网页端生成。

- [ ] **Step 6: 运行宿主策略与 Android 回归**

```powershell
& $node tools\qa_host_mailto_policy.cjs
& $node tools\qa_android_bridge.cjs .\index.html .\qa-output\android-bridge-v26
```

预期：Windows 只放行 HTTP(S)/mailto；Android `mailto:` 交默认处理器；两个宿主均拒绝 file/data/javascript 等 scheme。

- [ ] **Step 7: Commit**

```powershell
git add Launcher.cs tools/qa_host_mailto_policy.cjs tools/qa_android_bridge.cjs
git commit -m "feat: allow safe system mail fallback"
```

---

### Task 13: 完成教师工具、反馈、备份与双端发布回归

**Files:**
- Modify: `README.md:41-90,150-177`
- Modify: `android/README.md`
- Modify: `tools/qa_feature_upgrade.cjs`
- Modify: `tools/qa_targeted_teacher_ui.cjs`
- Modify: `tools/qa_android_bridge.cjs`
- Modify: `tools/qa_student_complete_experience.cjs`
- Test: `tools/qa_exam_grade_import.cjs`
- Test: `backup.js:10-140`
- Test: `tools/build_release.ps1`
- Test: `android/tools/build_android.ps1`

**Interfaces:**
- Consumes: Tasks 1-12 的最终网页、宿主、发布清单和 QA。
- Produces: v2.6.0 能力/边界文档、完整回归记录、Windows 测试构建与 Android 签名验证结果。

- [ ] **Step 1: 先扩充回归断言并确认失败**

`qa_feature_upgrade.cjs` 断言完整 `.pslab` 往返后保留档案 `studentNumber/className/groupName`、教师审计历史、考试导入批次和 active plans；同时断言独立反馈草稿数据库不出现在 `learning-profile.json`。`qa_student_complete_experience.cjs` 断言学生端只有反馈入口，不出现花名册、复判或组卷按钮。

```js
assert.equal(restoredProfile.studentNumber, "S001");
assert.equal(restoredProfile.className, "九年级一班");
assert.equal(restoredState.teacherReviewHistory.length, 2);
assert.equal(learningProfileJson.includes("feedbackScreenshot"), false);
assert.equal(await page.locator(".teacher-roster-card").count(), 0);
assert.equal(await page.locator('[data-shell-action="open-feedback"]').count(), 1);
```

- [ ] **Step 2: 运行新增与核心回归，记录首个失败点**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_exam_grade_import.cjs
& $node tools\qa_feedback_client.cjs
& $node tools\qa_host_mailto_policy.cjs
& $node tools\qa_learning_engine.cjs
& $node tools\qa_targeted_learning.cjs
& $node tools\qa_feature_upgrade.cjs .\index.html .\qa-output\feature-upgrade-v26
```

预期：在 README、备份或 UI 断言尚未更新的位置失败；不得放宽业务边界断言来换取通过。

- [ ] **Step 3: 更新 README 的能力与非能力**

README 和 Android README 必须明确写出：

```text
v2.6.0 提供本机班级/分组分类、花名册、新生向导、逐学生专项方案、三档组卷、受限 CSV/XLSX 成绩导入、教师复判、知识点覆盖矩阵、低样本题目质量提示和反馈草稿。
本地 classId/groupId 只是未来云端 Membership 的缓存投影，不构成账号权限；当前本地工具不提供真实云班级授权或自动同步。
系统邮件入口只把用户确认的文字交给邮件应用；是否实际发送以邮件应用为准，物理研习室不会显示虚假的“已发送”。
```

同时写明题目质量最小样本 30 人、长期空白默认 28 天、同步过期默认 7 天均为可配置试运行阈值，不是标准化测评。

- [ ] **Step 4: 运行全部相关自动化 QA**

```powershell
& $node tools\qa_teacher_tools_engine.cjs
& $node tools\qa_exam_grade_import.cjs
& $node tools\qa_feedback_client.cjs
& $node tools\qa_host_mailto_policy.cjs
& $node tools\qa_learning_engine.cjs
& $node tools\qa_targeted_learning.cjs
& $node tools\qa_backup_validator_fields.cjs
& $node tools\qa_learning_features.cjs .\index.html .\qa-output\learning-features-v26
& $node tools\qa_learning_loop.cjs .\index.html .\qa-output\learning-loop-v26
& $node tools\qa_experience_shell.cjs .\index.html .\qa-output\experience-shell-v26
& $node tools\qa_teacher_class_tools_ui.cjs
& $node tools\qa_targeted_teacher_ui.cjs
& $node tools\qa_feedback_ui.cjs
& $node tools\qa_feature_upgrade.cjs .\index.html .\qa-output\feature-upgrade-v26
```

预期：全部退出码为 0；Playwright 捕获的 `pageerror/console error` 均为空。

- [ ] **Step 5: 验证 Windows 测试发布物包含三个新脚本**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build_release.ps1 -ReleaseDirectory .\qa-output\release-v26 -Version 2.6.0
```

预期：安装器、release ZIP、source ZIP 和 SHA-256 文件生成；解包清单同时包含 `exam-grade-import.js`、`teacher-tools.js` 与 `feedback-client.js`。没有真实签名证书时只记录为测试构建，不宣称正式签名。

- [ ] **Step 6: 构建 Android v2.6.0 并验证签名/资产**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\android\tools\build_android.ps1 -VersionName 2.6.0 -VersionCode 20600
& $node tools\qa_android_bridge.cjs .\index.html .\qa-output\android-bridge-v26
```

预期：APK 构建和签名校验成功，资产包含三个新脚本，Android 反馈 mailto 使用既有默认处理器路径。

- [ ] **Step 7: 最终人工验收矩阵**

在 1440×900、390×844、360×640、320×568 逐项验证：花名册搜索/筛选、六步向导、两学生批量方案、三档确认、CSV/XLSX 四类行状态、内容退回理由、主观/迁移复判历史、覆盖矩阵、29/30 质量边界、学生和教师反馈入口、草稿重载、预览确认、Windows 与 Android 系统邮件入口。每项记录实际结果和截图路径，不用截图替代自动化断言。

- [ ] **Step 8: Commit**

```powershell
git add README.md android/README.md tools/qa_feature_upgrade.cjs tools/qa_targeted_teacher_ui.cjs tools/qa_android_bridge.cjs tools/qa_student_complete_experience.cjs
git commit -m "test: verify teacher tools and feedback v2.6"
```
