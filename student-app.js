(() => {
  "use strict";

  const ui = {
    page: "home",
    questions: [],
    learning: null,
    classes: [],
    assignments: [],
    selectedQuestion: null,
    questionContext: null,
    startedAt: 0,
    hintLevel: 0,
    solutionViewed: false,
    assistanceLocked: false,
    lastGrading: null,
    variantSet: null,
    selectedVariantId: "",
    variantHintLevels: new Map(),
    variantStartTimes: new Map(),
    activeAssignment: null,
    assignmentAnswers: new Map(),
    qrScanning: false,
    pendingInvite: "",
  };

  const engine = globalThis.PHYSICS_LEARNING_ENGINE;
  const client = globalThis.PhysicsStudioClassroom;
  const data = globalThis.FeynmanDualAppData;
  const common = globalThis.FeynmanDualApp;

  document.addEventListener("DOMContentLoaded", () => {
    globalThis.PhysicsStudioActivation?.whenActivated?.then(start).catch((error) => {
      common?.toast?.(common.errorMessage(error), "error");
    });
  }, { once: true });

  async function start() {
    common.assertEdition("student");
    if (!engine || !client || !data) throw new Error("学生端共享学习模块加载不完整。 ");
    ui.questions = await data.loadQuestions();
    ui.learning = engine.loadState();
    ui.pendingInvite = readDeepLinkInvite();
    bindEvents();
    try { await common.restoreOnlineSession(); } catch (error) { common.toast(common.errorMessage(error), "error"); }
    await refreshOnlineData(false);
    render();
    if (ui.pendingInvite && !client.status().authenticated) navigate("tasks");
  }

  function readDeepLinkInvite() {
    const raw = new URL(globalThis.location.href).searchParams.get("join") || "";
    if (!raw) return "";
    try { client.parseInvitePayload(raw); return raw; } catch { return ""; }
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
    const allowed = new Set(["home", "tasks", "gaps", "wrong", "analysis", "question", "variants"]);
    ui.page = allowed.has(page) ? page : "home";
    document.querySelectorAll(".role-page").forEach((section) => section.classList.toggle("active", section.dataset.page === ui.page));
    document.querySelectorAll(".role-nav [data-nav]").forEach((button) => button.classList.toggle("active", button.dataset.nav === ui.page));
    renderPage(ui.page);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshOnlineData(showNotice = false) {
    const status = client.status();
    updateConnection(status);
    if (!status.authenticated) return;
    try {
      const response = await client.listClasses();
      ui.classes = Array.isArray(response?.items) ? response.items : [];
      const outcomes = await Promise.allSettled(ui.classes.map((item) => client.listAssignments(item.id)));
      ui.assignments = outcomes.flatMap((result, index) => result.status === "fulfilled"
        ? (result.value?.items || []).map((item) => ({ ...item, classId: ui.classes[index].id, className: ui.classes[index].name }))
        : []);
      await client.flushSyncQueue();
      updateConnection(client.status());
      if (showNotice) common.toast("班级任务已同步。 ");
    } catch (error) {
      if (showNotice) common.toast(common.errorMessage(error), "error");
    }
  }

  function updateConnection(status) {
    const element = document.querySelector("#studentConnection");
    if (!element) return;
    element.textContent = status?.authenticated
      ? `${status.user.displayName} · 已联机`
      : status?.serviceConfigured ? "班级服务可连接" : "本机学习可用";
  }

  function render() {
    updateConnection(client.status());
    renderPage(ui.page);
  }

  function renderPage(page) {
    if (page === "home") renderHome();
    if (page === "tasks") renderTasks();
    if (page === "gaps") renderGaps();
    if (page === "wrong") renderWrong();
    if (page === "analysis") renderAnalysis();
    if (page === "question") renderQuestion();
    if (page === "variants") renderVariants();
  }

  function evidence() {
    return engine.summarizeLearning(ui.learning, ui.questions);
  }

  function analysis() {
    return engine.studentAnalysis(ui.learning, ui.questions);
  }

  function renderHome() {
    const root = document.querySelector("#studentHome");
    if (!root || !ui.learning) return;
    const summary = evidence();
    const report = analysis();
    const pending = ui.assignments.filter((item) => item.status === "published");
    const recentWrong = attempts().filter((attempt) => attempt.grading?.status === "incorrect").slice(-3).reverse();
    const firstPriority = report.priorities?.[0] || "先独立完成一道题，形成学习证据";
    root.innerHTML = `
      <div class="page-heading"><div><h1>今天先做什么</h1><p>先完成教师任务，再处理到期复习和最近错误；每条建议都来自真实作答记录。</p></div></div>
      <div class="grid two">
        <article class="card">
          <span class="tag">第一优先</span><h2>${common.escapeHtml(pending[0]?.title || firstPriority)}</h2>
          <p>${pending[0] ? `${common.escapeHtml(pending[0].className)} · ${pending[0].questionIds.length} 题` : common.escapeHtml(report.conclusion)}</p>
          <div class="button-row">${pending[0]
            ? `<button class="primary" data-open-assignment="${pending[0].id}" type="button">开始教师任务</button>`
            : `<button class="primary" data-nav-action="gaps" type="button">开始短训练</button>`}</div>
        </article>
        <article class="card">
          <div class="metric"><span>到期复习</span><strong>${summary.dueCount}</strong></div>
          <p class="evidence-note">${summary.dueCount ? "到期题必须重新独立作答，不能点击按钮直接刷新复习时间。" : "当前没有到期题；新作答会按系统表现安排后续复测。"}</p>
          ${summary.dueQuestions[0] ? `<button class="secondary" data-question-id="${common.escapeHtml(summary.dueQuestions[0].question.id)}" data-context="review" type="button">开始复习作答</button>` : ""}
        </article>
      </div>
      <div class="grid three" style="margin-top:16px">
        <article class="card"><div class="metric"><span>已提交</span><strong>${summary.submittedCount}</strong></div><p>已评分 ${summary.scoredCount} 次，待人工复核 ${summary.pendingReviewCount} 次。</p></article>
        <article class="card"><div class="metric"><span>可评分正确率</span><strong>${summary.accuracy == null ? "—" : `${summary.accuracy}%`}</strong></div><p>${summary.accuracy == null ? "暂无可评分证据。" : `分母仅含 ${summary.scoredCount} 条已评分证据。`}</p></article>
        <article class="card"><div class="metric"><span>最近错题</span><strong>${recentWrong.length}</strong></div><p>${recentWrong[0] ? common.escapeHtml(questionById(recentWrong[0].questionId)?.title || recentWrong[0].topic) : "暂无最近错题。"}</p></article>
      </div>`;
  }

  function renderTasks() {
    const root = document.querySelector("#studentTasks");
    if (!root) return;
    const status = client.status();
    root.innerHTML = `
      <div class="page-heading"><div><h1>任务</h1><p>教师发布后在线可见；断网作答保存在本机，恢复网络后按提交编号幂等补传。</p></div><button class="secondary" data-refresh-online type="button">刷新任务</button></div>
      ${status.authenticated ? renderJoinedClasses(status) : renderJoinCard(status)}
      <div class="card" style="margin-top:16px"><h2>我的任务</h2><div class="list">${ui.assignments.map((item) => `
        <article class="list-item" role="button" tabindex="0" data-open-assignment="${item.id}">
          <header><h3>${common.escapeHtml(item.title)}</h3><span class="tag ${item.status !== "published" ? "warn" : ""}">${common.escapeHtml(item.status)}</span></header>
          <p>${common.escapeHtml(item.className)} · ${item.questionIds.length} 题 · 截止 ${common.formatDate(item.dueAt, true)}</p>
          <div class="tag-row">${item.knowledgePointKeys.slice(0, 4).map((key) => `<span class="tag">${common.escapeHtml(key)}</span>`).join("")}</div>
        </article>`).join("") || '<div class="empty">当前没有可见任务。加入班级或刷新后再试。</div>'}</div></div>`;
  }

  function renderJoinCard(status) {
    return `<div class="grid two">
      <article class="card"><h2>通过邀请码加入班级</h2><p>只需备注名和教师邀请码；二维码、图片识别和手工输入最终使用同一个服务端加入流程。</p>
        <form id="studentJoinForm" class="form-grid">
          <label class="field"><span>学生备注名</span><input name="displayName" required maxlength="80" value="同学" autocomplete="nickname"></label>
          <label class="field"><span>邀请码或加入链接</span><input name="code" required maxlength="600" autocomplete="off" value="${common.escapeHtml(ui.pendingInvite)}" placeholder="输入22位邀请码或扫描二维码"></label>
          <label class="file-button"><input id="studentQrFile" type="file" accept="image/*" capture="environment" hidden>选择/拍摄二维码图片</label>
          <button class="secondary" data-start-qr-camera type="button">打开摄像头扫描</button>
          <video class="qr-camera" id="studentQrVideo" autoplay muted playsinline hidden></video><canvas id="studentQrCanvas" hidden></canvas>
          <button class="primary" type="submit">加入班级</button>
        </form>
      </article>
      <article class="card"><h2>已有学生账号</h2><form id="studentLoginForm" class="form-grid">
        <label class="field"><span>登录名</span><input name="login" required maxlength="120" autocomplete="username"></label>
        <label class="field"><span>密码</span><input name="password" type="password" required maxlength="128" autocomplete="current-password"></label>
        <button class="primary" type="submit">登录并同步</button>
      </form><p class="muted">加入班级不强制账号密码；账号登录用于跨设备恢复长期班级和学习记录。</p>
      <details><summary>注册学生账号</summary><form id="studentRegisterForm" class="form-grid" style="margin-top:12px"><label class="field"><span>登录名</span><input name="login" required maxlength="120" autocomplete="username"></label><label class="field"><span>学生备注名</span><input name="displayName" required maxlength="80" autocomplete="nickname"></label><label class="field"><span>密码（至少12位，不能为纯数字）</span><input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="secondary" type="submit">注册并登录</button></form></details>
      <details><summary>班级服务设置</summary><form id="studentServerForm" class="form-grid" style="margin-top:12px"><label class="field"><span>HTTPS 云端服务地址</span><input name="serverUrl" type="url" value="${common.escapeHtml(status.serverUrl || "")}" placeholder="https://classroom.example.com"></label><button class="secondary" type="submit">保存并检测</button></form></details></article>
    </div>`;
  }

  function renderJoinedClasses(status) {
    return `<div class="grid two"><article class="card"><h2>${common.escapeHtml(status.user.displayName)}</h2><p>服务端身份：学生。学生端不包含教师管理入口，服务端也拒绝创建班级和发布任务。</p><div class="button-row"><button class="secondary" data-edit-display-name type="button">修改备注名</button><button class="danger" data-logout type="button">退出登录</button></div></article>
      <article class="card"><h2>已加入班级</h2><div class="list">${ui.classes.map((item) => `<div class="list-item"><header><h3>${common.escapeHtml(item.name)}</h3><span class="tag">${common.escapeHtml(item.status)}</span></header><p>${common.escapeHtml(item.grade)} · ${common.escapeHtml(item.subject)}</p></div>`).join("") || '<div class="empty">尚未加入班级。</div>'}</div></article></div>`;
  }

  function renderGaps() {
    const root = document.querySelector("#studentGaps");
    if (!root) return;
    const report = analysis();
    const candidates = report.weakest.filter((item) => item.scoredCount > 0 || item.examMentions > 0).slice(0, 3);
    const fallback = ui.questions.filter((question) => question.diagnosticEligible || question.assessmentPurpose === "diagnostic").slice(0, 6);
    root.innerHTML = `<div class="page-heading"><div><h1>查漏补缺</h1><p>一次错误不等于“不会”。系统最多显示三个有证据的候选问题，并提供短训练。</p></div></div>
      <div class="grid three">${candidates.map((item) => `<article class="card"><span class="tag ${item.accuracy != null && item.accuracy < 60 ? "warn" : ""}">${item.accuracy == null ? "证据不足" : `${item.accuracy}%`}</span><h2>${common.escapeHtml(item.topic)}</h2><p>${item.scoredCount} 条已评分证据，${item.pendingReviewCount || 0} 条待人工复核，平均提示 ${Number(item.averageHint || 0).toFixed(1)} 级。</p><button class="primary" data-topic-practice="${common.escapeHtml(item.topicKey)}" type="button">开始3题短训练</button></article>`).join("") || '<div class="empty">当前样本不足，先用广覆盖题形成初步证据。</div>'}</div>
      <article class="card" style="margin-top:16px"><h2>广覆盖起步</h2><div class="list">${fallback.map(questionCard).join("")}</div></article>`;
  }

  function renderWrong() {
    const root = document.querySelector("#studentWrong");
    if (!root) return;
    const wrong = [...new Set(attempts().filter((item) => item.grading?.status === "incorrect").map((item) => item.questionId))]
      .map(questionById).filter(Boolean).slice(-100).reverse();
    root.innerHTML = `<div class="page-heading"><div><h1>错题</h1><p>错题保留首次作答、提示、订正和变式证据；订正后还会安排延迟复测。</p></div></div><div class="list">${wrong.map(questionCard).join("") || '<div class="empty">暂无已评分错题。待人工复核记录不会被算作错题。</div>'}</div>`;
  }

  function renderAnalysis() {
    const root = document.querySelector("#studentAnalysis");
    if (!root) return;
    const report = analysis();
    const summary = report.summary;
    root.innerHTML = `<div class="page-heading"><div><h1>我的学情</h1><p>${common.escapeHtml(report.boundary)}</p></div></div>
      <article class="card"><h2>证据摘要</h2><p class="evidence-note">${common.escapeHtml(report.conclusion)}</p><div class="grid three">
        <div><strong>${summary.submittedCount}</strong><p class="muted">提交记录</p></div><div><strong>${summary.scoredCount}</strong><p class="muted">已评分证据</p></div><div><strong>${summary.pendingReviewCount}</strong><p class="muted">待人工复核</p></div>
      </div></article>
      <div class="grid two" style="margin-top:16px"><article class="card"><h2>最多三个优先问题</h2><div class="list">${report.weakest.slice(0,3).map((item) => `<div class="list-item"><header><h3>${common.escapeHtml(item.topic)}</h3><span class="tag">${item.accuracy == null ? "证据不足" : `${item.accuracy}%`}</span></header><p>${item.scoredCount || 0} 条已评分 · ${item.attempts || 0} 次提交 · 提示均值 ${Number(item.averageHint || 0).toFixed(1)}</p></div>`).join("") || '<div class="empty">尚无足够证据。</div>'}</div></article>
      <article class="card"><h2>下一步</h2><div class="list">${report.priorities.slice(0,5).map((item) => `<div class="list-item">${common.escapeHtml(item)}</div>`).join("")}</div></article></div>
      <article class="card" style="margin-top:16px"><h2>数据迁移与隐私</h2><p>旧版完整备份可以导入；导入先校验清单、大小和 SHA-256，失败不会覆盖当前数据。</p><div class="button-row"><button class="secondary" data-export-backup type="button">导出完整备份</button><label class="file-button"><input id="studentBackupFile" type="file" accept=".pslab,application/zip" hidden>导入旧应用备份</label></div></article>`;
  }

  function questionCard(question) {
    return `<article class="list-item" role="button" tabindex="0" data-question-id="${common.escapeHtml(question.id)}">
      <header><h3>${common.escapeHtml(question.title)}</h3><span class="tag">${common.escapeHtml(question.difficulty || "基础")}</span></header>
      <p>${common.escapeHtml(question.grade)} · ${common.escapeHtml(question.topic)} · ${common.escapeHtml(question.questionType)}</p></article>`;
  }

  function openQuestion(questionId, context = {}) {
    const question = questionById(questionId);
    if (!question) return common.toast("题目正文不在本机完整题库中。 ", "error");
    ui.selectedQuestion = question;
    ui.questionContext = context;
    ui.startedAt = Date.now();
    ui.hintLevel = 0;
    ui.solutionViewed = false;
    ui.assistanceLocked = false;
    ui.lastGrading = null;
    navigate("question");
  }

  function renderQuestion() {
    const root = document.querySelector("#studentQuestion");
    const question = ui.selectedQuestion;
    if (!root || !question) return;
    const hints = engine.createHintLadder(question);
    const visual = renderModel(question);
    root.innerHTML = `<div class="page-heading"><div><h1>${common.escapeHtml(question.title)}</h1><p>${common.escapeHtml(question.grade)} · ${common.escapeHtml(question.topic)} · ${common.escapeHtml(question.questionType)}</p></div><button class="secondary" data-question-back type="button">返回</button></div>
      <div class="question-layout"><article class="card"><div class="tag-row"><span class="tag">${common.escapeHtml(question.difficulty)}</span>${(question.examPoints || []).slice(0,5).map((item) => `<span class="tag">${common.escapeHtml(item)}</span>`).join("")}</div><p class="question-content">${common.escapeHtml(question.content)}</p>${visual}
        <form id="studentAnswerForm" class="form-grid"><label class="field"><span>独立作答</span><textarea name="answer" required placeholder="填写最终答案；计算题请写数值、单位和方向"></textarea></label><label class="field"><span>信心 1—5</span><input name="confidence" type="range" min="1" max="5" value="3"></label><label class="field"><span>若答错，最接近的原因</span><select name="errorType"><option value="">提交后再判断</option><option>审题错误</option><option>概念错误</option><option>建模错误</option><option>规律条件错误</option><option>计算/单位错误</option><option>图像/实验错误</option></select></label><button class="primary" type="submit">提交并检查</button></form>
        ${ui.lastGrading ? renderGrading(question, ui.lastGrading) : ""}</article>
        <aside class="card"><h2>分级提示</h2><p>每次只推进一步；查看完整解法会记录为最高提示，本次不算独立完成。</p><div class="list">${hints.map((hint) => `<button class="secondary" data-hint-level="${hint.level}" type="button">${hint.level}. ${common.escapeHtml(hint.label)}</button>${ui.hintLevel >= hint.level ? `<div class="list-item">${common.escapeHtml(hint.text)}</div>` : ""}`).join("")}</div></aside></div>`;
    bindModelControls(root, question);
  }

  function renderGrading(question, grading) {
    const statusClass = grading.status === "correct" ? "correct" : grading.status === "review-required" ? "pending" : "incorrect";
    return `<section class="card grading ${statusClass}" style="margin-top:16px"><h2>${grading.status === "correct" ? "作答正确" : grading.status === "review-required" ? "已提交，待人工复核" : "需要修改"}</h2><p>${common.escapeHtml(grading.summary)}</p>${grading.issues?.length ? `<ul>${grading.issues.map((item) => `<li>${common.escapeHtml(item.location)}：${common.escapeHtml(item.reason)}。${common.escapeHtml(item.next)}</li>`).join("")}</ul>` : ""}<div class="button-row"><button class="secondary" data-show-solution type="button">查看分步解析</button>${assignmentProgressAction() || (grading.status === "correct" || grading.status === "partial" ? `<button class="primary" data-start-variants type="button">专项变式训练</button>` : `<button class="primary" data-retry-question type="button">立即订正</button>`)}</div><div class="solution" id="questionSolution" hidden>${common.escapeHtml(question.solution)}\n\n最终答案：${common.escapeHtml(question.answer)}</div></section>`;
  }

  function assignmentProgressAction() {
    if (!ui.activeAssignment) return "";
    const pendingId = ui.activeAssignment.questionIds.find((id) => questionById(id) && !ui.assignmentAnswers.has(id));
    return pendingId
      ? `<button class="primary" data-assignment-next="${common.escapeHtml(pendingId)}" type="button">继续下一题</button>`
      : '<button class="primary" data-submit-assignment type="button">提交教师任务</button>';
  }

  function renderModel(question) {
    const visuals = globalThis.PHYSICS_VISUALS;
    const model = visuals?.modelForQuestion?.(question);
    if (!model) return "";
    const result = modelResult(model, {});
    if (!result?.svg) return "";
    return `<section class="visual-stage" data-model="${model}"><div data-model-output>${result.svg}</div>${modelControls(model)}</section>`;
  }

  function modelControls(model) {
    const definitions = {
      uniform: [["v0", "初速度 m/s", 0, -20, 30, .5], ["a", "加速度 m/s²", 2, -10, 10, .5], ["t", "观察时刻 s", 2, 0, 5, .1]],
      newton: [["mass", "质量 kg", 2, .2, 20, .2], ["appliedForce", "外力 N", 12, -50, 50, 1], ["opposingForce", "摩擦力 N", 4, 0, 30, 1]],
      energy: [["mass", "质量 kg", 2, .2, 20, .2], ["initialHeight", "初始高度 m", 5, .2, 30, .2], ["height", "当前高度 m", 2, 0, 30, .2]],
      collision: [["m1", "物体1质量 kg", 2, .2, 20, .2], ["m2", "物体2质量 kg", 1, .2, 20, .2], ["u1", "物体1初速度 m/s", 4, -15, 15, .5]],
      wave: [["speed", "波速 m/s", 20, 1, 100, 1], ["frequency", "频率 Hz", 5, .5, 30, .5], ["time", "时刻 s", 0, 0, 2, .02]],
      circuit: [["voltage", "电压 V", 12, 1, 48, 1], ["r1", "电阻1 Ω", 10, 1, 100, 1], ["r2", "电阻2 Ω", 20, 1, 100, 1]],
    };
    return `<div class="model-controls">${(definitions[model] || []).map(([name,label,value,min,max,step]) => `<label class="field"><span>${label}：<output>${value}</output></span><input type="range" data-model-param="${name}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`).join("")}</div>`;
  }

  function modelResult(model, values) {
    const visuals = globalThis.PHYSICS_VISUALS;
    if (model === "uniform") return visuals.kinematics({ duration: 5, ...values });
    if (model === "newton") return visuals.newtonSecondLaw(values);
    if (model === "energy") return visuals.mechanicalEnergy(values);
    if (model === "collision") return visuals.collision1D({ type: "elastic", u2: 0, ...values });
    if (model === "wave") return visuals.waveModel(values);
    if (model === "circuit") return visuals.circuit({ mode: "series", resistances: [values.r1 || 10, values.r2 || 20], voltage: values.voltage || 12 });
    return null;
  }

  function bindModelControls(root) {
    const stage = root.querySelector(".visual-stage");
    if (!stage) return;
    const update = () => {
      const values = Object.fromEntries([...stage.querySelectorAll("[data-model-param]")].map((input) => {
        input.closest("label")?.querySelector("output")?.replaceChildren(String(input.value));
        return [input.dataset.modelParam, Number(input.value)];
      }));
      const result = modelResult(stage.dataset.model, values);
      if (result?.svg) stage.querySelector("[data-model-output]").innerHTML = result.svg;
    };
    stage.querySelectorAll("[data-model-param]").forEach((input) => input.addEventListener("input", update));
  }

  async function startVariants(parent) {
    const set = await globalThis.PhysicsStudioVariantGenerator.generateVariantSet(parent, {
      count: 3,
      questions: ui.questions,
      existingSets: ui.learning.variantSets,
      allowAi: aiAllowed(),
    });
    if (!Array.isArray(set.variants) || set.variants.length < 2) {
      common.toast(set.message || "当前没有可验证的完整变式题。 ", "error");
      return;
    }
    engine.saveVariantSet(ui.learning, set);
    engine.saveState(ui.learning);
    ui.variantSet = engine.variantSetForParent(ui.learning, parent.id);
    ui.selectedVariantId = engine.trainableVariants(ui.variantSet)[0]?.id || "";
    ui.variantHintLevels.clear();
    ui.variantStartTimes.clear();
    if (ui.selectedVariantId) ui.variantStartTimes.set(ui.selectedVariantId, Date.now());
    navigate("variants");
  }

  function aiAllowed() {
    const profile = engine.activeProfile(ui.learning);
    return profile.minorAgeBand !== "under14" || profile.guardianConsentStatus === "granted";
  }

  function renderVariants() {
    const root = document.querySelector("#studentVariants");
    const set = ui.variantSet;
    if (!root || !set) return;
    const trainable = engine.trainableVariants(set);
    const selected = trainable.find((item) => item.id === ui.selectedVariantId) || trainable[0];
    const progress = engine.variantSetProgress(ui.learning, set.id);
    if (!selected) {
      root.innerHTML = '<div class="empty">变式题尚未通过质量门禁，不能进入正式训练。</div>';
      return;
    }
    const completed = progress.results.find((item) => item.variant.id === selected.id)?.record;
    if (!completed && !ui.variantStartTimes.has(selected.id)) ui.variantStartTimes.set(selected.id, Date.now());
    const hintLevel = ui.variantHintLevels.get(selected.id) || 0;
    const hintLadder = engine.createHintLadder(selected).filter((item) => item.level <= 2);
    root.innerHTML = `<div class="page-heading"><div><h1>专项变式训练</h1><p>按近迁移 → 结构/逆向 → 情境迁移训练；当前 ${progress.completed}/${progress.total}。</p></div><button class="secondary" data-question-back type="button">返回母题</button></div>
      <div class="tag-row">${trainable.map((item, index) => `<button class="secondary compact" data-variant-id="${item.id}" type="button">${index + 1}. ${common.escapeHtml(item.variantRoleLabel || item.variantRole)}</button>`).join("")}</div>
      <article class="card" style="margin-top:14px"><div class="tag-row"><span class="tag">${common.escapeHtml(selected.variantRoleLabel || selected.variantRole)}</span><span class="tag">${common.escapeHtml(selected.changeSummary)}</span></div><h2>${common.escapeHtml(selected.title)}</h2><p class="question-content">${common.escapeHtml(selected.content)}</p>
        ${completed ? `<div class="evidence-note">本题已完成：${common.escapeHtml(completed.gradingStatus)}，提示等级 ${completed.hintLevel}。</div>` : `<form id="variantAnswerForm" class="form-grid"><input type="hidden" name="variantId" value="${selected.id}"><label class="field"><span>独立作答</span><textarea name="answer" required></textarea></label><div class="button-row">${hintLadder.map((hint) => `<button class="secondary compact" data-variant-hint="${hint.level}" type="button">${hint.level === 1 ? "一级方向提示" : "二级规律提示"}</button>`).join("")}</div>${hintLadder.filter((hint) => hintLevel >= hint.level).map((hint) => `<div class="evidence-note">${common.escapeHtml(hint.text)}</div>`).join("")}<p class="muted">提示由系统自动记录，不能手工修改；完整解析仅在提交后显示。</p><button class="primary" type="submit">提交变式答案</button></form>`}
        ${completed ? `<div class="solution"><strong>思路总览</strong>\n${common.escapeHtml(selected.solutionDetail?.overview || selected.solution)}\n\n<strong>研究对象和规律</strong>\n${common.escapeHtml(selected.solutionDetail?.objectAndProcess || "见分步解析") }\n\n${common.escapeHtml(selected.solution)}\n\n最终答案：${common.escapeHtml(selected.answer)}\n\n与母题差异：${common.escapeHtml(selected.relationToParent)}</div>` : ""}</article>`;
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    common.setButtonBusy(button, true);
    try {
      if (form.id === "studentAnswerForm") await submitQuestion(form);
      if (form.id === "variantAnswerForm") await submitVariant(form);
      if (form.id === "studentJoinForm") await joinClass(form);
      if (form.id === "studentLoginForm") await login(form);
      if (form.id === "studentRegisterForm") await registerStudent(form);
      if (form.id === "studentServerForm") await configureServer(form);
    } catch (error) {
      common.toast(common.errorMessage(error), "error");
    } finally {
      common.setButtonBusy(button, false);
    }
  }

  async function submitQuestion(form) {
    const answer = String(new FormData(form).get("answer") || "").trim();
    const values = new FormData(form);
    const grading = engine.gradeFinalAnswer(ui.selectedQuestion, answer);
    const attempt = engine.recordAttempt(ui.learning, {
      questionId: ui.selectedQuestion.id,
      question: ui.selectedQuestion,
      topic: ui.selectedQuestion.topic,
      knowledgePointId: ui.selectedQuestion.knowledgePointId,
      questionType: ui.selectedQuestion.questionType,
      stage: ui.selectedQuestion.stage,
      difficulty: ui.selectedQuestion.difficulty,
      startedAt: new Date(ui.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: Math.max(1, Math.round((Date.now() - ui.startedAt) / 1000)),
      confidenceBefore: Number(values.get("confidence")) || 3,
      confidenceAfter: Number(values.get("confidence")) || 3,
      hintLevel: ui.hintLevel,
      finalAnswer: answer,
      grading,
      errorType: grading.status === "correct" ? "" : String(values.get("errorType") || ""),
    });
    engine.scheduleReviewFromAttempt(ui.learning, ui.selectedQuestion.id, attempt.id);
    engine.saveState(ui.learning);
    ui.lastGrading = grading;
    if (ui.activeAssignment) ui.assignmentAnswers.set(ui.selectedQuestion.id, { questionId: ui.selectedQuestion.id, answer, attemptId: attempt.id, gradingStatus: grading.status });
    await syncLearningEvidence();
    renderQuestion();
    renderHome();
  }

  async function submitVariant(form) {
    const values = new FormData(form);
    const variant = ui.variantSet.variants.find((item) => item.id === values.get("variantId"));
    const answer = String(values.get("answer") || "").trim();
    const hintLevel = ui.variantHintLevels.get(variant.id) || 0;
    const startedAt = ui.variantStartTimes.get(variant.id) || Date.now();
    const grading = engine.gradeFinalAnswer(variant, answer);
    const result = engine.recordVariantAttempt(ui.learning, {
      variantSetId: ui.variantSet.id,
      variantQuestionId: variant.id,
      finalAnswer: answer,
      grading,
      hintLevel,
      solutionViewed: hintLevel >= 5,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    });
    engine.scheduleReviewFromAttempt(ui.learning, variant.id, result.attempt.id);
    engine.saveState(ui.learning);
    await syncLearningEvidence();
    const next = engine.trainableVariants(ui.variantSet).find((item) => !engine.variantSetProgress(ui.learning, ui.variantSet.id).results.find((resultItem) => resultItem.variant.id === item.id)?.record);
    if (next) {
      ui.selectedVariantId = next.id;
      if (!ui.variantStartTimes.has(next.id)) ui.variantStartTimes.set(next.id, Date.now());
    }
    renderVariants();
  }

  async function login(form) {
    const values = new FormData(form);
    const user = await client.login({ login: values.get("login"), password: values.get("password"), deviceName: `费曼物理学生端 ${navigator.platform || "Android"}` });
    if (user.role !== "student") {
      await client.logout();
      throw new Error("该账号不是学生账号，不能登录学生端。 ");
    }
    await refreshOnlineData(false);
    render();
    common.toast("学生账号已登录。 ");
  }

  async function registerStudent(form) {
    const values = new FormData(form);
    const user = await client.register({
      login: values.get("login"), displayName: values.get("displayName"), password: values.get("password"), role: "student",
      deviceName: `费曼物理学生端 ${navigator.platform || "Android"}`,
    });
    if (user.role !== "student") { await client.logout(); throw new Error("服务端返回了错误的注册身份。 "); }
    await refreshOnlineData(false);
    render();
    common.toast("学生账号已注册并登录。 ");
  }

  async function configureServer(form) {
    const value = String(new FormData(form).get("serverUrl") || "").trim();
    client.configure({ serverUrl: value });
    await client.checkHealth();
    updateConnection(client.status());
    common.toast("云端班级服务连接正常。 ");
  }

  async function joinClass(form, payloadOverride = "") {
    const values = new FormData(form);
    const code = payloadOverride || String(values.get("code") || "").trim();
    const displayName = String(values.get("displayName") || "同学").trim();
    await client.joinClassByInviteCode({ code, displayName });
    await refreshOnlineData(false);
    render();
    common.toast("已加入班级。 ");
  }

  async function syncLearningEvidence() {
    if (!client.status().authenticated || !ui.classes.length) return;
    let payload;
    try { payload = engine.buildLearningSyncPayload(ui.learning, ui.questions, ui.learning.activeProfileId, { limit: 100 }); }
    catch (error) { common.toast(common.errorMessage(error), "error"); return; }
    await Promise.allSettled(ui.classes.map((item) => client.syncLearning(item.id, payload)));
  }

  async function handleClick(event) {
    const nav = event.target.closest("[data-nav-action]");
    if (nav) return navigate(nav.dataset.navAction);
    const question = event.target.closest("[data-question-id]");
    if (question) return openQuestion(question.dataset.questionId, { source: question.dataset.context || ui.page });
    const assignment = event.target.closest("[data-open-assignment]");
    if (assignment) return openAssignment(assignment.dataset.openAssignment);
    const nextAssignment = event.target.closest("[data-assignment-next]");
    if (nextAssignment) return openQuestion(nextAssignment.dataset.assignmentNext, { source: "tasks", assignmentId: ui.activeAssignment?.id || "" });
    if (event.target.closest("[data-submit-assignment]")) return submitActiveAssignment();
    const topic = event.target.closest("[data-topic-practice]");
    if (topic) {
      const pool = ui.questions.filter((item) => engine.topicKeyForQuestion(item) === topic.dataset.topicPractice).slice(0, 3);
      if (!pool.length) return common.toast("当前知识点没有可验证的完整练习题。 ", "error");
      return openQuestion(pool[0].id, { source: "targeted", queue: pool.map((item) => item.id) });
    }
    if (event.target.closest("[data-refresh-online]")) { await refreshOnlineData(true); return render(); }
    if (event.target.closest("#studentConnection")) return navigate("tasks");
    if (event.target.closest("[data-question-back]")) return navigate(ui.questionContext?.source === "tasks" ? "tasks" : "gaps");
    if (event.target.closest("[data-retry-question]")) {
      ui.startedAt = Date.now();
      ui.lastGrading = null;
      ui.hintLevel = ui.assistanceLocked ? 5 : 0;
      ui.solutionViewed = ui.assistanceLocked;
      return renderQuestion();
    }
    const hint = event.target.closest("[data-hint-level]");
    if (hint) { ui.hintLevel = Math.max(ui.hintLevel, Number(hint.dataset.hintLevel)); ui.solutionViewed ||= ui.hintLevel >= 5; return renderQuestion(); }
    if (event.target.closest("[data-show-solution]")) {
      ui.hintLevel = 5; ui.solutionViewed = true; ui.assistanceLocked = true;
      document.querySelector("#questionSolution")?.removeAttribute("hidden");
      common.toast("已记录查看完整解法；本次不算独立完成。 ");
      return;
    }
    if (event.target.closest("[data-start-variants]")) return startVariants(ui.selectedQuestion);
    const variant = event.target.closest("[data-variant-id]");
    if (variant) {
      ui.selectedVariantId = variant.dataset.variantId;
      if (!ui.variantStartTimes.has(ui.selectedVariantId)) ui.variantStartTimes.set(ui.selectedVariantId, Date.now());
      return renderVariants();
    }
    const variantHint = event.target.closest("[data-variant-hint]");
    if (variantHint && ui.selectedVariantId) {
      const nextLevel = Math.max(ui.variantHintLevels.get(ui.selectedVariantId) || 0, Number(variantHint.dataset.variantHint) || 0);
      ui.variantHintLevels.set(ui.selectedVariantId, Math.min(2, nextLevel));
      return renderVariants();
    }
    if (event.target.closest("[data-logout]")) { await client.logout(); ui.classes=[]; ui.assignments=[]; render(); return; }
    if (event.target.closest("[data-edit-display-name]")) {
      const value = prompt("新的学生备注名", client.status().user?.displayName || "同学");
      if (value?.trim()) { await client.updateDisplayName(value.trim()); render(); }
      return;
    }
    if (event.target.closest("[data-start-qr-camera]")) return startQrCamera();
    if (event.target.closest("[data-export-backup]")) { await data.exportBackup(); common.toast("完整备份已生成。 "); }
  }

  async function openAssignment(id) {
    const assignment = ui.assignments.find((item) => item.id === id);
    if (!assignment) return;
    ui.activeAssignment = assignment;
    const questionId = assignment.questionIds.find((item) => questionById(item));
    if (!questionId) return common.toast("任务题目尚未同步到本机完整题库。 ", "error");
    openQuestion(questionId, { source: "tasks", assignmentId: id });
  }

  async function submitActiveAssignment() {
    if (!ui.activeAssignment) return;
    const missing = ui.activeAssignment.questionIds.filter((id) => questionById(id) && !ui.assignmentAnswers.has(id));
    if (missing.length) return openQuestion(missing[0], { source: "tasks", assignmentId: ui.activeAssignment.id });
    const profile = engine.activeProfile(ui.learning);
    const clientEntityId = `submission:${String(profile.portableProfileId || profile.id).slice(0, 70)}:${ui.activeAssignment.id}`;
    const result = await client.submitAssignment(ui.activeAssignment.id, {
      clientEntityId,
      answers: [...ui.assignmentAnswers.values()],
    });
    const title = ui.activeAssignment.title;
    ui.activeAssignment = null;
    ui.assignmentAnswers.clear();
    navigate("tasks");
    common.toast(result.queued ? `“${title}”已保存在同步队列，联网后自动补传。` : `“${title}”已提交给教师。`);
  }

  async function startQrCamera() {
    const video = document.querySelector("#studentQrVideo");
    const canvas = document.querySelector("#studentQrCanvas");
    if (!video || !canvas) return;
    video.hidden = false;
    await common.scanInviteQr(video, canvas, async (payload) => {
      video.hidden = true;
      const input = document.querySelector('#studentJoinForm [name="code"]');
      if (input) input.value = payload;
      try { await joinClass(document.querySelector("#studentJoinForm"), payload); }
      catch (error) { common.toast(common.errorMessage(error), "error"); }
    });
  }

  async function handleChange(event) {
    if (event.target.id === "studentQrFile" && event.target.files?.[0]) {
      try {
        const payload = await common.decodeInviteQr(event.target.files[0]);
        const input = document.querySelector('#studentJoinForm [name="code"]');
        if (input) input.value = payload;
        await joinClass(document.querySelector("#studentJoinForm"), payload);
      } catch (error) { common.toast(common.errorMessage(error), "error"); }
      event.target.value = "";
    }
    if (event.target.id === "studentBackupFile" && event.target.files?.[0]) {
      try { await data.importBackup(event.target.files[0]); ui.questions = await data.loadQuestions(true); ui.learning = engine.loadState(); render(); common.toast("旧应用备份已导入。 "); }
      catch (error) { common.toast(common.errorMessage(error), "error"); }
      event.target.value = "";
    }
  }

  function handleInput() {}

  function attempts() {
    return ui.learning.attempts.filter((item) => item.profileId === ui.learning.activeProfileId);
  }

  function questionById(id) {
    return ui.questions.find((item) => item.id === id) || null;
  }
})();
