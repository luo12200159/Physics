(() => {
  "use strict";

  const ui = {
    page: "classes",
    questions: [],
    learning: null,
    classes: [],
    assignments: [],
    selectedClassId: "",
    classDetail: null,
    roster: [],
    groups: [],
    classSummary: [],
    reviewCases: [],
    invite: null,
    search: "",
    selectedQuestionIds: new Set(),
    selectedQuestion: null,
    variantSet: null,
    refreshing: false,
  };

  const engine = globalThis.PHYSICS_LEARNING_ENGINE;
  const client = globalThis.PhysicsStudioClassroom;
  const data = globalThis.FeynmanDualAppData;
  const common = globalThis.FeynmanDualApp;
  const variants = globalThis.PhysicsStudioVariantGenerator;

  document.addEventListener("DOMContentLoaded", () => {
    globalThis.PhysicsStudioActivation?.whenActivated?.then(start).catch((error) => {
      common?.toast?.(common.errorMessage(error), "error");
    });
  }, { once: true });

  async function start() {
    common.assertEdition("teacher");
    if (!engine || !client || !data || !variants) throw new Error("教师端共享业务模块加载不完整。 ");
    ui.questions = await data.loadQuestions();
    ui.learning = engine.loadState();
    bindEvents();
    try { await common.restoreOnlineSession(); } catch (error) { common.toast(common.errorMessage(error), "error"); }
    await refreshOnlineData(false);
    render();
    setInterval(() => { if (!document.hidden) void refreshOnlineData(false); }, 30_000);
  }

  function bindEvents() {
    document.querySelector(".role-nav")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-nav]");
      if (button) navigate(button.dataset.nav);
    });
    document.body.addEventListener("click", handleClick);
    document.body.addEventListener("submit", handleSubmit);
    document.body.addEventListener("change", handleChange);
    document.body.addEventListener("input", handleInput);
    globalThis.addEventListener("online", () => { void refreshOnlineData(true); });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void refreshOnlineData(false);
    });
  }

  function navigate(page) {
    const allowed = new Set(["classes", "tasks", "insights", "bank", "me", "class-detail", "variant-review"]);
    ui.page = allowed.has(page) ? page : "classes";
    document.querySelectorAll(".role-page").forEach((section) => section.classList.toggle("active", section.dataset.page === ui.page));
    document.querySelectorAll(".role-nav [data-nav]").forEach((button) => button.classList.toggle("active", button.dataset.nav === ui.page));
    renderPage(ui.page);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function canUseTeacherCloud(status = client.status()) {
    return status.authenticated && ["teacher", "administrator"].includes(status.user?.role);
  }

  async function runSensitive(operation) {
    try { return await operation(); }
    catch (error) {
      if (error?.code !== "reauthentication_required") throw error;
      const password = prompt("该操作需要重新验证教师账号密码。密码不会保存。", "");
      if (!password) throw error;
      await client.reauthenticate(password);
      return operation();
    }
  }

  async function refreshOnlineData(showNotice = false) {
    if (ui.refreshing) return;
    ui.refreshing = true;
    updateConnection(client.status());
    try {
      const status = client.status();
      if (!status.authenticated && !status.ownerAuthenticated) return;
      const response = await client.listClasses();
      ui.classes = Array.isArray(response?.items) ? response.items : [];
      if (ui.selectedClassId && !ui.classes.some((item) => item.id === ui.selectedClassId)) {
        ui.selectedClassId = "";
        ui.classDetail = null;
      }
      const assignmentResults = await Promise.allSettled(ui.classes.map((item) => client.listAssignments(item.id)));
      ui.assignments = assignmentResults.flatMap((result, index) => result.status === "fulfilled"
        ? (result.value?.items || []).map((item) => ({ ...item, className: ui.classes[index].name }))
        : []);
      await client.flushSyncQueue();
      if (ui.selectedClassId) await loadClassDetail(ui.selectedClassId, false);
      updateConnection(client.status());
      if (showNotice) common.toast("班级、任务和学习证据已同步。 ");
      if (ui.page !== "variant-review") renderPage(ui.page);
    } catch (error) {
      if (showNotice) common.toast(common.errorMessage(error), "error");
    } finally {
      ui.refreshing = false;
    }
  }

  function updateConnection(status) {
    const element = document.querySelector("#teacherConnection");
    if (!element) return;
    element.textContent = canUseTeacherCloud(status)
      ? `${status.user.displayName} · 云端教师`
      : status.ownerAuthenticated ? "局域网教师 · 班级级权限" : status.serviceConfigured ? "云服务待登录" : "本机资料可用";
  }

  function render() {
    updateConnection(client.status());
    renderPage(ui.page);
  }

  function renderPage(page) {
    if (page === "classes") renderClasses();
    if (page === "tasks") renderTasks();
    if (page === "insights") renderInsights();
    if (page === "bank") renderBank();
    if (page === "me") renderMe();
    if (page === "class-detail") renderClassDetail();
    if (page === "variant-review") renderVariantReview();
  }

  function authBoundary() {
    const status = client.status();
    if (canUseTeacherCloud(status) || status.ownerAuthenticated) return "";
    return `<article class="card boundary-card"><h2>连接教师身份</h2><p>正式云班级必须使用服务端教师账号；本机 PIN 只可作为二次锁，不能授予教师权限。教师端同时保留可选局域网课堂主机。</p>
      <form id="teacherLoginForm" class="form-grid"><label class="field"><span>登录名</span><input name="login" required maxlength="120" autocomplete="username"></label><label class="field"><span>密码</span><input name="password" type="password" required maxlength="128" autocomplete="current-password"></label><button class="primary" type="submit">登录教师端</button></form>
      <details><summary>注册教师账号</summary><form id="teacherRegisterForm" class="form-grid" style="margin-top:12px"><label class="field"><span>登录名</span><input name="login" required maxlength="120" autocomplete="username"></label><label class="field"><span>教师显示名</span><input name="displayName" required maxlength="80" autocomplete="name"></label><label class="field"><span>密码（至少12位，不能为纯数字）</span><input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="secondary" type="submit">注册并登录</button></form></details>
      <details><summary>云服务地址</summary><form id="teacherServerForm" class="form-grid" style="margin-top:12px"><label class="field"><span>HTTPS API 地址</span><input name="serverUrl" type="url" value="${common.escapeHtml(status.serverUrl || "")}" placeholder="https://classroom.example.com"></label><button class="secondary" type="submit">保存并检测</button></form></details>
      <p class="muted">学生账号即使获得此安装包，服务端仍拒绝教师管理接口；学生 APK 也不打包本页面和本脚本。</p></article>`;
  }

  function renderClasses() {
    const root = document.querySelector("#teacherClasses");
    if (!root) return;
    root.innerHTML = `<div class="page-heading"><div><h1>班级</h1><p>创建者只管理自己拥有的班级；邀请码只授予学生成员权限。</p></div><button class="secondary" data-refresh-online type="button">同步</button></div>
      ${authBoundary()}
      <div class="grid two" style="margin-top:16px"><article class="card"><h2>创建班级</h2><form id="createClassForm" class="form-grid"><label class="field"><span>班级名称</span><input name="name" required maxlength="120" placeholder="例如：高三物理一班"></label><label class="field"><span>年级</span><select name="grade"><option>八年级</option><option>九年级</option><option>高一</option><option>高二</option><option>高三</option></select></label><button class="primary" type="submit">创建并进入班级</button></form></article>
      <article class="card"><h2>我的班级</h2><div class="list">${ui.classes.map(classCard).join("") || '<div class="empty">尚未创建班级。云端登录或局域网主机可用后即可创建。</div>'}</div></article></div>`;
  }

  function classCard(item) {
    return `<article class="list-item" role="button" tabindex="0" data-open-class="${common.escapeHtml(item.id)}"><header><h3>${common.escapeHtml(item.name)}</h3><span class="tag">${common.escapeHtml(item.status)}</span></header><p>${common.escapeHtml(item.grade)} · ${common.escapeHtml(item.subject)} · ${common.escapeHtml(item.id)}</p></article>`;
  }

  async function loadClassDetail(classId, renderAfter = true) {
    const [detail, roster, groups, summary, reviews] = await Promise.all([
      client.getClass(classId), client.listRoster(classId), client.listGroups(classId),
      client.getClassLearningSummary(classId), client.listReviewCases(classId),
    ]);
    ui.selectedClassId = classId;
    ui.classDetail = detail;
    ui.roster = Array.isArray(roster?.items) ? roster.items : [];
    ui.groups = Array.isArray(groups?.items) ? groups.items : [];
    ui.classSummary = Array.isArray(summary?.items) ? summary.items : [];
    ui.reviewCases = Array.isArray(reviews?.items) ? reviews.items : [];
    if (renderAfter) { renderClassDetail(); navigate("class-detail"); }
  }

  function renderClassDetail() {
    const root = document.querySelector("#teacherClassDetail");
    if (!root) return;
    const item = ui.classDetail;
    if (!item) {
      root.innerHTML = '<div class="empty">请先选择一个班级。</div>';
      return;
    }
    const activeStudents = ui.roster.filter((member) => member.memberRole === "student" && member.status === "active");
    root.innerHTML = `<div class="page-heading"><div><button class="link-button" data-nav-action="classes" type="button">← 返回班级</button><h1>${common.escapeHtml(item.name)}</h1><p>班级 ID：${common.escapeHtml(item.id)} · ${activeStudents.length} 名学生</p></div><button class="danger" data-delete-class="${common.escapeHtml(item.id)}" type="button">归档班级</button></div>
      <div class="grid two"><article class="card"><h2>邀请学生</h2><p>刷新邀请码会使旧邀请码失效。二维码只包含班级 ID、邀请码和可访问服务地址，不包含教师凭据。</p><button class="primary" data-create-invite="${common.escapeHtml(item.id)}" type="button">${ui.invite?.classId === item.id ? "刷新邀请码与二维码" : "生成邀请码与二维码"}</button>${renderInvite()}</article>
      <article class="card"><h2>建立学习小组</h2><form id="createGroupForm" class="form-grid"><input type="hidden" name="classId" value="${common.escapeHtml(item.id)}"><label class="field"><span>小组名称</span><input name="name" required maxlength="80" placeholder="例如：浮力巩固组"></label><button class="primary" type="submit">创建小组</button></form><div class="tag-row">${ui.groups.map((group) => `<span class="tag">${common.escapeHtml(group.name)}</span>`).join("") || '<span class="muted">尚无小组</span>'}</div></article></div>
      <article class="card" style="margin-top:16px"><div class="page-heading"><div><h2>学生名单</h2><p>学生备注名由学生自行设置；教师可补充学号、调整小组或移除成员。</p></div></div><div class="table-wrap"><table><thead><tr><th>学生</th><th>学号</th><th>小组</th><th>最近证据</th><th>待复核</th><th>操作</th></tr></thead><tbody>${activeStudents.map((member) => rosterRow(member)).join("") || '<tr><td colspan="6">暂无学生。请生成邀请码。</td></tr>'}</tbody></table></div></article>`;
  }

  function renderInvite() {
    if (!ui.invite || ui.invite.classId !== ui.selectedClassId) return "";
    return `<div class="invite-panel"><canvas id="teacherInviteQr" width="280" height="280" aria-label="班级加入二维码"></canvas><div><p><strong>邀请码</strong></p><code>${common.escapeHtml(ui.invite.code)}</code><p class="muted">有效期至 ${common.formatDate(ui.invite.expiresAt, true)}</p><div class="button-row"><button class="secondary" data-copy-invite type="button">复制邀请码</button><button class="secondary" data-copy-join-url type="button">复制加入链接</button></div></div></div>`;
  }

  function rosterRow(member) {
    const evidence = ui.classSummary.find((value) => value.membershipId === member.id) || {};
    return `<tr><td>${common.escapeHtml(member.displayName)}</td><td><input class="table-input" data-member-number="${common.escapeHtml(member.id)}" value="${common.escapeHtml(member.studentNumber || "")}" maxlength="40" placeholder="未填写"></td><td><select class="table-input" data-member-group="${common.escapeHtml(member.id)}"><option value="">未分组</option>${ui.groups.map((group) => `<option value="${common.escapeHtml(group.id)}"${member.groupId === group.id ? " selected" : ""}>${common.escapeHtml(group.name)}</option>`).join("")}</select></td><td>${evidence.attemptCount || 0} 次 · ${common.formatDate(evidence.lastEvidenceAt)}</td><td>${evidence.pendingReviewCount || 0}</td><td><button class="danger compact" data-remove-member="${common.escapeHtml(member.id)}" type="button">移除</button></td></tr>`;
  }

  function renderTasks() {
    const root = document.querySelector("#teacherTasks");
    if (!root) return;
    const currentClass = ui.classes.find((item) => item.id === ui.selectedClassId) || ui.classes[0];
    const targetOptions = currentClass ? [
      `<option value="class:">全班</option>`,
      ...ui.groups.map((group) => `<option value="group:${common.escapeHtml(group.id)}">小组：${common.escapeHtml(group.name)}</option>`),
      ...ui.roster.filter((member) => member.memberRole === "student" && member.status === "active").map((member) => `<option value="student:${common.escapeHtml(member.id)}">学生：${common.escapeHtml(member.displayName)}</option>`),
    ].join("") : "";
    root.innerHTML = `<div class="page-heading"><div><h1>任务</h1><p>支持全班、小组和个人；先保存草稿或预览，再由教师确认发布。</p></div></div>
      <div class="grid two"><article class="card"><h2>新建任务</h2>${currentClass ? `<form id="assignmentForm" class="form-grid"><label class="field"><span>班级</span><select name="classId">${ui.classes.map((item) => `<option value="${common.escapeHtml(item.id)}"${item.id === currentClass.id ? " selected" : ""}>${common.escapeHtml(item.name)}</option>`).join("")}</select></label><label class="field"><span>任务标题</span><input name="title" required maxlength="160"></label><label class="field"><span>布置范围</span><select name="target">${targetOptions}</select></label><label class="field"><span>说明</span><textarea name="instructions" maxlength="30000"></textarea></label><label class="field"><span>截止时间</span><input name="dueAt" type="datetime-local"></label><label class="field"><span>题目 ID（逗号或换行分隔）</span><textarea name="questionIds" required>${[...ui.selectedQuestionIds].join("\n")}</textarea></label><label class="field"><span>达标要求</span><input name="goal" required maxlength="1000" value="独立完成并订正错题"></label><label><input name="publish" type="checkbox"> 教师确认后立即发布</label><button class="primary" type="submit">${ui.selectedQuestionIds.size ? `创建含 ${ui.selectedQuestionIds.size} 题的任务` : "保存任务"}</button></form>` : '<div class="empty">先创建并进入一个班级。</div>'}</article>
      <article class="card"><h2>任务记录</h2><div class="list">${ui.assignments.map((item) => `<div class="list-item"><header><h3>${common.escapeHtml(item.title)}</h3><span class="tag ${item.status === "draft" ? "warn" : ""}">${common.escapeHtml(item.status)}</span></header><p>${common.escapeHtml(item.className)} · ${item.questionIds.length} 题 · ${common.escapeHtml(item.targetType)}</p><p class="muted">截止 ${common.formatDate(item.dueAt, true)}</p></div>`).join("") || '<div class="empty">暂无任务。</div>'}</div></article></div>`;
  }

  function renderInsights() {
    const root = document.querySelector("#teacherInsights");
    if (!root) return;
    const totalAttempts = ui.classSummary.reduce((sum, item) => sum + (item.attemptCount || 0), 0);
    const pending = ui.classSummary.reduce((sum, item) => sum + (item.pendingReviewCount || 0), 0);
    const active = ui.classSummary.filter((item) => (item.attemptCount || 0) > 0);
    root.innerHTML = `<div class="page-heading"><div><h1>学情</h1><p>先显示班级证据量和待行动事项；样本不足时不输出稳定能力结论。</p></div></div>
      ${ui.classes.length ? `<label class="field inline-field"><span>班级</span><select id="insightClassSelect">${ui.classes.map((item) => `<option value="${common.escapeHtml(item.id)}"${item.id === ui.selectedClassId ? " selected" : ""}>${common.escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}
      <div class="grid three" style="margin-top:16px"><article class="card"><div class="metric"><span>参与学生</span><strong>${active.length}</strong></div><p>花名册 ${ui.roster.filter((member) => member.memberRole === "student" && member.status === "active").length} 人。</p></article><article class="card"><div class="metric"><span>有效提交</span><strong>${totalAttempts}</strong></div><p>必须下钻原始证据后才能形成教学结论。</p></article><article class="card"><div class="metric"><span>待人工复核</span><strong>${pending}</strong></div><p>待复核记录不计入正确率或错题。</p></article></div>
      <article class="card" style="margin-top:16px"><h2>学生证据视图</h2><div class="table-wrap"><table><thead><tr><th>学生</th><th>作答证据</th><th>考试证据</th><th>待复核</th><th>最近证据</th><th>结论边界</th></tr></thead><tbody>${ui.classSummary.map((item) => `<tr><td>${common.escapeHtml(item.displayName)}</td><td>${item.attemptCount}</td><td>${item.examCount}</td><td>${item.pendingReviewCount}</td><td>${common.formatDate(item.lastEvidenceAt)}</td><td>${item.attemptCount < 3 ? "样本不足" : "可查看近期表现；不是标准化测评分数"}</td></tr>`).join("") || '<tr><td colspan="6">当前没有服务端学习证据。</td></tr>'}</tbody></table></div></article>
      <article class="card" style="margin-top:16px"><h2>学生作答待人工复核</h2><div class="list">${ui.reviewCases.filter((item) => item.status === "pending").map((item) => `<div class="list-item"><p>提交 ${common.escapeHtml(item.submissionId)} · ${common.formatDate(item.submittedAt, true)}</p><div class="button-row"><button class="secondary" data-review-case="${common.escapeHtml(item.id)}" data-review-action="approve" type="button">确认通过</button><button class="danger" data-review-case="${common.escapeHtml(item.id)}" data-review-action="return" type="button">退回订正</button></div></div>`).join("") || '<div class="empty">当前没有待人工复核作答。</div>'}</div></article>`;
  }

  function renderBank() {
    const root = document.querySelector("#teacherBank");
    if (!root) return;
    const term = ui.search.trim().toLowerCase();
    const filtered = ui.questions.filter((question) => !term || [question.title, question.content, question.topic, question.knowledgePointId, question.id].some((value) => String(value || "").toLowerCase().includes(term))).slice(0, 120);
    const pendingSets = (ui.learning.variantSets || []).filter((set) => set.reviewRequired || set.status === "pending-review");
    root.innerHTML = `<div class="page-heading"><div><h1>题库</h1><p>完整题保留稳定 ID；系统变式通过质量门禁，AI 变式还需教师审核后才能作为正式班级任务。</p></div><button class="secondary" data-open-variant-queue type="button">待审核变式 ${pendingSets.length}</button></div>
      <article class="card"><label class="field"><span>搜索标题、题干、知识点或题号</span><input id="teacherQuestionSearch" value="${common.escapeHtml(ui.search)}" placeholder="输入关键词"></label><p class="muted">显示前 ${filtered.length} 条结果；已选 ${ui.selectedQuestionIds.size} 题。</p></article>
      <div class="list" style="margin-top:16px">${filtered.map((question) => `<article class="list-item"><header><h3>${common.escapeHtml(question.title)}</h3><span class="tag">${common.escapeHtml(question.questionType)}</span></header><p>${common.escapeHtml(question.grade)} · ${common.escapeHtml(question.topic)} · ${common.escapeHtml(question.difficulty)}</p><div class="button-row"><label><input data-select-question="${common.escapeHtml(question.id)}" type="checkbox"${ui.selectedQuestionIds.has(question.id) ? " checked" : ""}> 加入任务</label><button class="secondary compact" data-generate-variants="${common.escapeHtml(question.id)}" type="button">生成专项变式</button></div></article>`).join("") || '<div class="empty">没有匹配题目。</div>'}</div>`;
  }

  function renderVariantReview() {
    const root = document.querySelector("#teacherVariantReview");
    if (!root) return;
    const set = ui.variantSet;
    if (!set) {
      const pending = (ui.learning?.variantSets || []).filter((item) => item.reviewRequired || item.status === "pending-review");
      root.innerHTML = `<div class="page-heading"><div><button class="link-button" data-nav-action="bank" type="button">← 返回题库</button><h1>待审核 AI 变式</h1></div></div><div class="list">${pending.map((item) => `<button class="list-item" data-review-variant-set="${common.escapeHtml(item.id)}" type="button">母题 ${common.escapeHtml(item.parentQuestionId)} · ${item.variants.length} 道 · ${common.escapeHtml(item.status)}</button>`).join("") || '<div class="empty">当前没有待审核变式。</div>'}</div>`;
      return;
    }
    const parent = ui.questions.find((item) => item.id === set.parentQuestionId);
    root.innerHTML = `<div class="page-heading"><div><button class="link-button" data-close-variant-review type="button">← 返回题库</button><h1>专项变式审核</h1><p>${common.escapeHtml(set.generationMode)} · ${set.variants.length} 道 · ${common.escapeHtml(set.status)}</p></div></div>
      <div class="variant-compare"><article class="card parent-question"><span class="tag">母题</span><h2>${common.escapeHtml(parent?.title || set.parentQuestionId)}</h2><p>${common.escapeHtml(parent?.content || "母题正文不在本机题库中")}</p></article><div class="variant-column">${set.variants.map((variant) => `<article class="card"><header><span class="tag">${common.escapeHtml(variant.variantRole)}</span><h2>${common.escapeHtml(variant.title)}</h2></header><p>${common.escapeHtml(variant.content)}</p><p><strong>改变：</strong>${common.escapeHtml(variant.changeSummary)}</p><p><strong>答案：</strong>${common.escapeHtml(variant.answer)}</p><details><summary>详细解法与校验</summary><p>${common.escapeHtml(variant.solution)}</p><p class="evidence-note">${variant.validation?.passed ? "质量门禁通过" : `未通过：${common.escapeHtml((variant.validation?.failedReasons || []).join("；"))}`}</p></details></article>`).join("")}</div></div>
      <div class="sticky-actions"><button class="primary" data-approve-variant-set type="button"${set.variants.every((variant) => variant.validation?.passed) ? "" : " disabled"}>全部通过并可用于任务</button><button class="danger" data-reject-variant-set type="button">退回整组</button><button class="secondary" data-regenerate-variant-set type="button">重新生成</button></div>`;
  }

  function renderMe() {
    const root = document.querySelector("#teacherMe");
    if (!root) return;
    const status = client.status();
    root.innerHTML = `<div class="page-heading"><div><h1>我的</h1><p>账号授权由服务端 RBAC 决定；Android 长期凭据由 Keystore 保护。</p></div></div>${authBoundary()}
      <div class="grid two" style="margin-top:16px"><article class="card"><h2>连接状态</h2><p>${common.escapeHtml(status.boundary)}</p><ul><li>模式：${common.escapeHtml(status.syncMode)}</li><li>服务：${common.escapeHtml(status.serverUrl || "未配置")}</li><li>身份：${common.escapeHtml(status.user?.role || "未登录")}</li></ul>${status.authenticated ? '<button class="danger" data-logout type="button">退出登录</button>' : ""}</article>
      <article class="card"><h2>数据迁移</h2><p>完整 .pslab 备份包含题库和学习档案；导入前校验 manifest、大小和 SHA-256，失败不覆盖当前数据。</p><div class="button-row"><button class="secondary" data-export-backup type="button">导出完整备份</button><label class="file-button"><input id="teacherBackupFile" type="file" accept=".pslab,application/zip" hidden>导入旧应用备份</label></div></article></div>`;
  }

  async function createClass(form) {
    const values = new FormData(form);
    const created = await client.createClass({ name: values.get("name"), grade: values.get("grade") });
    ui.classes = [...ui.classes.filter((item) => item.id !== created.id), created];
    await loadClassDetail(created.id, false);
    navigate("class-detail");
    common.toast("班级已创建，正在班级管理页生成邀请。 ");
  }

  async function createInvite(classId) {
    ui.invite = await client.createInvite(classId, {});
    renderClassDetail();
    requestAnimationFrame(() => common.renderInviteQr(document.querySelector("#teacherInviteQr"), ui.invite.joinUrl));
    common.toast("新邀请码已生成；旧邀请码已失效。 ");
  }

  async function createAssignment(form) {
    const values = new FormData(form);
    const [targetType, targetId] = String(values.get("target") || "class:").split(":");
    const questionIds = String(values.get("questionIds") || "").split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean);
    const selectedQuestions = questionIds.map((id) => ui.questions.find((question) => question.id === id)).filter(Boolean);
    if (questionIds.length !== selectedQuestions.length) throw new Error("部分题目 ID 不存在于完整题库，请先修正。 ");
    const result = await runSensitive(() => client.createAssignment(values.get("classId"), {
      title: values.get("title"), instructions: values.get("instructions"), dueAt: values.get("dueAt") || null,
      targetType, targetId: targetId || null, questionIds,
      knowledgePointKeys: [...new Set(selectedQuestions.map((question) => question.knowledgePointId).filter(Boolean))],
      target: values.get("goal"), publish: values.get("publish") === "on",
    }));
    ui.selectedQuestionIds.clear();
    const classId = String(values.get("classId") || "");
    const localAssignment = result.queued ? {
      id: `queued:${Date.now()}`,
      classId,
      title: String(values.get("title") || "待同步任务"),
      instructions: String(values.get("instructions") || ""),
      dueAt: values.get("dueAt") || null,
      status: values.get("publish") === "on" ? "pending-sync-publish" : "pending-sync-draft",
      targetType,
      targetId: targetId || null,
      questionIds,
      knowledgePointKeys: [...new Set(selectedQuestions.map((question) => question.knowledgePointId).filter(Boolean))],
      target: String(values.get("goal") || ""),
      queued: true,
    } : result;
    ui.assignments.unshift({ ...localAssignment, className: ui.classes.find((item) => item.id === classId)?.name || "" });
    renderTasks();
    common.toast(result.queued
      ? "任务已安全保存到同步队列，恢复联网后由服务端幂等创建。"
      : result.status === "published" ? "任务已发布，学生端在线可见。 " : "任务草稿已保存。 ");
  }

  async function generateVariantSet(questionId, force = false) {
    const parent = ui.questions.find((question) => question.id === questionId);
    if (!parent) throw new Error("未找到母题。 ");
    const existingSets = force ? [] : ui.learning.variantSets;
    const set = await variants.generateVariantSet(parent, {
      count: 3,
      existingSets,
      questions: ui.questions,
      allowAi: true,
      minorUnder14: false,
      guardianConsentStatus: "not-applicable",
      personalIdentifiers: [],
    });
    if (set.status === "unavailable") throw new Error(set.message || "当前没有可验证的完整变式题。 ");
    ui.variantSet = engine.saveVariantSet(ui.learning, set);
    engine.saveState(ui.learning);
    navigate("variant-review");
  }

  async function handleSubmit(event) {
    const form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    common.setButtonBusy(button, true);
    try {
      if (form.id === "teacherLoginForm") {
        const values = new FormData(form);
        const user = await client.login({ login: values.get("login"), password: values.get("password"), deviceName: `费曼物理教师端 ${navigator.platform || "Android"}` });
        if (!["teacher", "administrator"].includes(user.role)) { await client.logout(); throw new Error("该账号不是教师账号，不能进入教师端。 "); }
        await client.reauthenticate(values.get("password"));
        await refreshOnlineData(false); render(); common.toast("教师账号登录成功。 ");
      } else if (form.id === "teacherRegisterForm") {
        const values = new FormData(form);
        const user = await client.register({ login: values.get("login"), displayName: values.get("displayName"), password: values.get("password"), role: "teacher", deviceName: `费曼物理教师端 ${navigator.platform || "Android"}` });
        if (user.role !== "teacher") { await client.logout(); throw new Error("服务端返回了错误的注册身份。 "); }
        await client.reauthenticate(values.get("password"));
        await refreshOnlineData(false); render(); common.toast("教师账号已注册并登录。 ");
      } else if (form.id === "teacherServerForm") {
        const value = String(new FormData(form).get("serverUrl") || "").trim();
        client.configure({ serverUrl: value }); await client.checkHealth(); updateConnection(client.status()); common.toast("云端服务连接正常。 ");
      } else if (form.id === "createClassForm") await createClass(form);
      else if (form.id === "createGroupForm") {
        const values = new FormData(form); await client.createGroup(values.get("classId"), { name: values.get("name") }); await loadClassDetail(values.get("classId")); common.toast("小组已创建。 ");
      } else if (form.id === "assignmentForm") await createAssignment(form);
    } catch (error) { common.toast(common.errorMessage(error), "error"); }
    finally { common.setButtonBusy(button, false); }
  }

  async function handleClick(event) {
    try {
      const nav = event.target.closest("[data-nav-action]");
      if (nav) return navigate(nav.dataset.navAction);
      const openClassButton = event.target.closest("[data-open-class]");
      if (openClassButton) return await loadClassDetail(openClassButton.dataset.openClass);
      if (event.target.closest("[data-refresh-online]")) return await refreshOnlineData(true);
      if (event.target.closest("[data-logout]")) { await client.logout(); ui.classes = []; ui.assignments = []; ui.selectedClassId = ""; render(); return; }
      const inviteButton = event.target.closest("[data-create-invite]");
      if (inviteButton) return await createInvite(inviteButton.dataset.createInvite);
      if (event.target.closest("[data-copy-invite]")) { await navigator.clipboard.writeText(ui.invite.code); common.toast("邀请码已复制。 "); return; }
      if (event.target.closest("[data-copy-join-url]")) { await navigator.clipboard.writeText(ui.invite.joinUrl); common.toast("加入链接已复制。 "); return; }
      const remove = event.target.closest("[data-remove-member]");
      if (remove && confirm("确认从班级移除该学生？学生本机独立学习历史不会被删除。")) { await runSensitive(() => client.updateMembership(remove.dataset.removeMember, { status: "removed" })); await loadClassDetail(ui.selectedClassId); return; }
      const destroy = event.target.closest("[data-delete-class]");
      if (destroy && confirm("确认归档该班级？现有邀请码将立即失效。")) { await client.deleteClass(destroy.dataset.deleteClass); ui.selectedClassId = ""; ui.classDetail = null; ui.invite = null; await refreshOnlineData(false); navigate("classes"); common.toast("班级已归档，邀请码已失效。 "); return; }
      const generate = event.target.closest("[data-generate-variants]");
      if (generate) return await generateVariantSet(generate.dataset.generateVariants);
      if (event.target.closest("[data-open-variant-queue]")) { ui.variantSet = null; navigate("variant-review"); return; }
      const openSet = event.target.closest("[data-review-variant-set]");
      if (openSet) { ui.variantSet = ui.learning.variantSets.find((item) => item.id === openSet.dataset.reviewVariantSet) || null; renderVariantReview(); return; }
      if (event.target.closest("[data-close-variant-review]")) { ui.variantSet = null; navigate("bank"); return; }
      if (event.target.closest("[data-approve-variant-set]")) {
        ui.variantSet = engine.decideVariantReview(ui.learning, ui.variantSet.id, { action: "approve", reviewedBy: client.status().user?.id || "local-teacher" });
        engine.saveState(ui.learning);
        if (ui.selectedClassId && ui.variantSet.status === "approved") await client.syncVariantSets(ui.selectedClassId, { sets: [ui.variantSet] });
        renderVariantReview(); common.toast("变式题组已通过；有班级时已进入幂等同步队列。 "); return;
      }
      if (event.target.closest("[data-reject-variant-set]")) { ui.variantSet = engine.decideVariantReview(ui.learning, ui.variantSet.id, { action: "reject", reviewedBy: client.status().user?.id || "local-teacher" }); engine.saveState(ui.learning); renderVariantReview(); return; }
      if (event.target.closest("[data-regenerate-variant-set]")) return await generateVariantSet(ui.variantSet.parentQuestionId, true);
      const review = event.target.closest("[data-review-case]");
      if (review) {
        const approve = review.dataset.reviewAction === "approve";
        await runSensitive(() => client.decideReviewCase(review.dataset.reviewCase, { decision: approve ? "approve" : "return", score: approve ? 100 : 0, perQuestionScores: [], reason: approve ? "教师确认作答达到要求" : "请根据教师反馈重新订正", annotation: {} }));
        await loadClassDetail(ui.selectedClassId, false); renderInsights(); common.toast("复核结果已保存。 ");
      }
    } catch (error) { common.toast(common.errorMessage(error), "error"); }
  }

  async function handleChange(event) {
    try {
      if (event.target.matches("[data-select-question]")) {
        const id = event.target.dataset.selectQuestion;
        if (event.target.checked) ui.selectedQuestionIds.add(id); else ui.selectedQuestionIds.delete(id);
      }
      if (event.target.matches("[data-member-group]")) { await runSensitive(() => client.updateMembership(event.target.dataset.memberGroup, { groupId: event.target.value || null })); common.toast("小组已更新。 "); }
      if (event.target.id === "insightClassSelect") { await loadClassDetail(event.target.value, false); renderInsights(); }
      if (event.target.id === "teacherBackupFile" && event.target.files?.[0]) {
        await data.importBackup(event.target.files[0]); ui.questions = await data.loadQuestions(true); ui.learning = engine.loadState(); render(); common.toast("旧应用备份已导入。 "); event.target.value = "";
      }
    } catch (error) { common.toast(common.errorMessage(error), "error"); }
  }

  function handleInput(event) {
    if (event.target.id === "teacherQuestionSearch") { ui.search = event.target.value; clearTimeout(handleInput.timer); handleInput.timer = setTimeout(renderBank, 120); }
    if (event.target.matches("[data-member-number]")) {
      clearTimeout(event.target._saveTimer);
      event.target._saveTimer = setTimeout(async () => {
        try { await runSensitive(() => client.updateMembership(event.target.dataset.memberNumber, { studentNumber: event.target.value.trim() || null })); common.toast("学号已保存。 "); }
        catch (error) { common.toast(common.errorMessage(error), "error"); }
      }, 500);
    }
  }
})();
