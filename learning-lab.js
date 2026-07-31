(() => {
  "use strict";

  const engine = window.PHYSICS_LEARNING_ENGINE;
  if (!engine) {
    console.error("学习实验室未启动：缺少学习引擎。");
    return;
  }

  const lab = {
    dialog: null,
    content: null,
    panel: null,
    app: null,
    state: engine.loadState(),
    tab: "dashboard",
    selectedQuestionId: "",
    session: null,
    diagnosticId: "",
    diagnosticResult: null,
    lastCompleted: null,
    modelType: "projectile",
    modelParams: {
      projectile: { v0: 20, angle: 45, g: 9.8, t: 1 },
      incline: { mass: 2, angle: 30, mu: 0.2, g: 9.8, t: 1 },
      circuit: { voltage: 12, r1: 10, r2: 20, mode: "series" }
    },
    animationFrame: 0,
    sessionTimer: 0,
    motionHandler: null,
    motionSamples: [],
    motionRenderAt: 0,
    activeSensorLabel: "",
    audio: null,
    genericSensors: {},
    sketch: null,
    pendingDocumentImport: null,
    documentImportStatus: "",
    contentPackStatus: "",
    aiResult: null,
    aiStatusMessage: "",
    managedStudentId: "",
    planPreview: null,
    advancedToolsOpen: false
  };

  const tabs = [
    ["dashboard", "今日学习", "闭环"],
    ["diagnostic", "前概念诊断", "诊断"],
    ["tutor", "分步导师", "推理"],
    ["models", "建模画布", "仿真"],
    ["transfer", "迁移训练", "迁移"],
    ["review", "复习报告", "评估"],
    ["tools", "物理工具", "工具"],
    ["teacher", "教师中心", "教师"],
    ["sensors", "手机实验室", "实验"]
  ];

  function isTeacherRole() {
    return document.body.classList.contains("role-teacher");
  }

  function visibleTabs() {
    return tabs.filter(([key]) => key !== "teacher" || isTeacherRole());
  }

  document.addEventListener("DOMContentLoaded", () => {
    const activation = window.PhysicsStudioActivation;
    if (!activation?.whenActivated) return;
    activation.whenActivated.then(initialize).catch(() => {});
  });

  function initialize() {
    lab.dialog = document.getElementById("learningLabModal");
    lab.content = document.getElementById("learningLabContent");
    const openButtons = [
      document.getElementById("learningLabButton"),
      document.getElementById("learningLabQuickButton")
    ].filter(Boolean);
    openButtons.forEach((button) => button.addEventListener("click", () => openLab()));
    document.addEventListener("physics-studio-ready", () => {
      lab.app = window.PhysicsStudioApp;
      if (lab.dialog?.open) renderPanel();
    });
    document.addEventListener("physics-studio-start-learning", (event) => {
      openLab("tutor", event.detail?.questionId || "");
    });
    document.addEventListener("physics-studio-open-lab", (event) => {
      openLab(event.detail?.tab || "dashboard", event.detail?.questionId || "");
    });
    document.addEventListener("physics-learning-state-changed", (event) => {
      if (!event.detail?.restored) return;
      lab.state = engine.loadState();
      lab.session = null;
      if (lab.dialog?.open) renderPanel();
      renderProfileOptions();
    });
    document.addEventListener("physics-experience-role-changed", () => {
      if (!isTeacherRole() && lab.tab === "teacher") lab.tab = "dashboard";
      renderShell();
      if (lab.dialog?.open) renderPanel();
    });
    lab.app = window.PhysicsStudioApp || null;
    renderShell();
    bindEvents();
  }

  function renderShell() {
    lab.content.innerHTML = `
      <div class="lab-shell">
        <header class="lab-header">
          <div class="lab-brand">
            <span class="lab-mark" aria-hidden="true">⌬</span>
            <div>
              <span class="lab-kicker">PHYSICS LEARNING LOOP</span>
              <h2>物理学习实验室</h2>
              <p>诊断 → 建模 → 推理 → 验证 → 练习 → 迁移 → 复习 → 评估</p>
            </div>
          </div>
          <div class="lab-header-actions">
            <label class="lab-profile-picker">
              <span>当前档案</span>
              <select id="labProfileSelect"></select>
            </label>
            <button class="lab-icon-button" data-lab-action="close" type="button" aria-label="关闭学习实验室">×</button>
          </div>
        </header>
        <nav class="lab-tabs" aria-label="学习实验室功能">
          ${visibleTabs().map(([key, label, short]) => `
            <button data-lab-tab="${key}" type="button">
              <span>${escapeHtml(short)}</span>${escapeHtml(label)}
            </button>`).join("")}
        </nav>
        <main class="lab-panel" id="labPanel"></main>
        <footer class="lab-footer">
          <span><i></i> 离线规则引擎已启用</span>
          <span>自动判定仅覆盖可可靠提取的选项和数值题；解释题会明确要求人工复核。</span>
        </footer>
      </div>`;
    lab.panel = document.getElementById("labPanel");
    renderProfileOptions();
  }

  function bindEvents() {
    lab.content.addEventListener("click", handleClick);
    lab.content.addEventListener("input", handleInput);
    lab.content.addEventListener("change", handleChange);
    lab.dialog.addEventListener("close", stopAllLiveActivities);
  }

  function openLab(tab = "dashboard", questionId = "") {
    lab.app = window.PhysicsStudioApp || lab.app;
    if (questionId) {
      lab.selectedQuestionId = questionId;
      lab.session = null;
      lab.aiResult = null;
      lab.aiStatusMessage = "";
    }
    lab.tab = tab === "teacher" && !isTeacherRole() ? "dashboard" : tab;
    renderPanel();
    if (!lab.dialog.open) lab.dialog.showModal();
    document.body.classList.remove("drawer-open");
  }

  function closeLab() {
    stopAllLiveActivities();
    lab.dialog.close();
  }

  function getQuestions() {
    return lab.app?.getQuestions?.() || [];
  }

  function getQuestion(questionId) {
    return getQuestions().find((question) => question.id === questionId) || null;
  }

  function saveLearningState() {
    lab.state = engine.saveState(lab.state);
    renderProfileOptions();
    document.dispatchEvent(new CustomEvent("physics-learning-state-changed", {
      detail: { profileId: lab.state.activeProfileId }
    }));
  }

  function renderProfileOptions() {
    const select = document.getElementById("labProfileSelect");
    if (!select) return;
    select.innerHTML = lab.state.profiles.map((profile) => `
      <option value="${escapeHtml(profile.id)}"${profile.id === lab.state.activeProfileId ? " selected" : ""}>
        ${escapeHtml(profile.name)} · ${roleLabel(profile.role)}
      </option>`).join("") + '<option value="__new__">＋ 新建本机档案</option>';
  }

  function renderPanel() {
    if (!lab.panel) return;
    if (lab.tab === "teacher" && !isTeacherRole()) lab.tab = "dashboard";
    stopModelAnimation();
    stopSessionTimer();
    lab.content.querySelectorAll("[data-lab-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.labTab === lab.tab);
    });
    const renderers = {
      dashboard: renderDashboard,
      diagnostic: renderDiagnostic,
      tutor: renderTutor,
      models: renderModels,
      transfer: renderTransfer,
      review: renderReview,
      tools: renderTools,
      teacher: renderTeacher,
      sensors: renderSensors
    };
    lab.panel.innerHTML = (renderers[lab.tab] || renderDashboard)();
    if (lab.tab === "teacher") arrangeTeacherLayout();
    if (lab.tab === "models") updateModelOutput();
    if (lab.tab === "tools") requestAnimationFrame(setupSketchCanvas);
    if (lab.tab === "sensors") requestAnimationFrame(() => renderMotionChart());
    if (lab.tab === "tutor" && lab.session) startSessionTimer();
  }

  function arrangeTeacherLayout() {
    const dashboard = lab.panel?.querySelector(".teacher-dashboard");
    if (!dashboard) return;
    const studentRecords = dashboard.querySelector(".student-manager-card")?.closest(".teacher-records-grid");
    const targetedPlan = dashboard.querySelector(".targeted-plan-card");
    const historyRecords = dashboard.querySelector(".exam-record-card")?.closest(".teacher-records-grid");
    if (studentRecords && targetedPlan) studentRecords.after(targetedPlan);
    if (!historyRecords) return;

    const details = document.createElement("details");
    details.className = "teacher-advanced-tools";
    details.open = Boolean(lab.advancedToolsOpen);
    details.innerHTML = `
      <summary>
        <div><span>ADVANCED TOOLS</span><h3>高级工具</h3><p>题库维护、文件解析、AI 网关、批量组卷、班级汇总与内容审核。</p></div>
        <strong>${details.open ? "收起" : "展开"}</strong>
      </summary>
      <div class="teacher-advanced-body"></div>`;
    details.addEventListener("toggle", () => {
      lab.advancedToolsOpen = details.open;
      const label = details.querySelector("summary > strong");
      if (label) label.textContent = details.open ? "收起" : "展开";
    });
    historyRecords.after(details);
    const body = details.querySelector(".teacher-advanced-body");
    [
      dashboard.querySelector(".content-coverage-card"),
      dashboard.querySelector(".document-import-card")?.closest(".teacher-records-grid"),
      dashboard.querySelector(".teacher-grid"),
      dashboard.querySelector(".content-review-list")?.closest(".lab-card"),
      dashboard.querySelector(".assignment-list")?.closest(".lab-card"),
      dashboard.querySelector(".teacher-boundary")
    ].filter(Boolean).forEach((section) => body.append(section));
  }

  function renderDashboard() {
    const questions = getQuestions();
    const summary = engine.summarizeLearning(lab.state, questions);
    const recommendations = engine.recommendations(lab.state, questions, 6);
    const topRisk = summary.misconceptionProfile.filter((item) => item.status !== "未诊断").slice(0, 3);
    const goal = Number(lab.state.settings.dailyGoal) || 5;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = lab.state.attempts.filter((attempt) => {
      return attempt.profileId === lab.state.activeProfileId && String(attempt.createdAt).startsWith(today);
    }).length;
    return `
      <section class="lab-dashboard">
        <div class="lab-hero-card">
          <div>
            <span class="lab-section-index">LEARNING LOOP 2.0</span>
            <h3>从“看懂答案”转向“独立建模并验证”</h3>
            <p>每次训练都记录置信度、提示层级、错误类型、建模步骤和复习时间。系统只根据真实记录生成建议。</p>
          </div>
          <div class="lab-goal-ring" style="--goal:${Math.min(100, todayCount / goal * 100)}%">
            <strong>${todayCount}/${goal}</strong>
            <span>今日闭环</span>
          </div>
        </div>

        <div class="lab-loop-map" aria-label="学习闭环八个步骤">
          ${[
            ["诊断", "识别前概念", "diagnostic"],
            ["建模", "对象与过程", "tutor"],
            ["推理", "分级提示", "tutor"],
            ["验证", "量纲与仿真", "models"],
            ["练习", "针对性推荐", "dashboard"],
            ["迁移", "变式与反例", "transfer"],
            ["复习", "间隔安排", "review"],
            ["评估", "证据化报告", "review"]
          ].map(([label, detail, tab], index) => `
            <button data-lab-tab="${tab}" type="button">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${label}</strong>
              <small>${detail}</small>
            </button>`).join("")}
        </div>

        <div class="lab-metric-grid">
          ${metricCard("正确率", `${summary.accuracy}%`, `${summary.correct}/${summary.completed || 0} 次闭环作答`)}
          ${metricCard("独立完成率", `${summary.independenceRate}%`, "正确且未超过第 1 级提示")}
          ${metricCard("提示依赖", `${summary.averageHint} 级`, "数值越低，独立性越强")}
          ${metricCard("待复习", `${summary.dueCount}`, "依据作答表现动态安排")}
          ${metricCard("学习时长", `${summary.learningMinutes} min`, "只统计闭环训练计时")}
        </div>

        <div class="lab-dashboard-grid">
          <section class="lab-card">
            <div class="lab-card-head">
              <div><span>RECOMMEND</span><h3>下一步针对性练习</h3></div>
              <button class="lab-text-button" data-lab-tab="review" type="button">查看复习队列 →</button>
            </div>
            <div class="lab-recommend-list">
              ${recommendations.length ? recommendations.map((item) => `
                <article>
                  <div>
                    <span>${escapeHtml(item.question.stage)} · ${escapeHtml(item.question.topic)}</span>
                    <h4>${escapeHtml(item.question.title)}</h4>
                    <p>${escapeHtml(item.reasons.join("；") || "根据题库覆盖推荐")}</p>
                  </div>
                  <button data-start-question="${escapeHtml(item.question.id)}" type="button">开始分步训练</button>
                </article>`).join("") : emptyState("尚无个性化记录", "先完成前概念诊断或一道分步训练，推荐会随证据更新。")}
            </div>
          </section>

          <section class="lab-card">
            <div class="lab-card-head">
              <div><span>MISCONCEPTION</span><h3>前概念风险</h3></div>
              <button class="lab-text-button" data-lab-tab="diagnostic" type="button">继续诊断 →</button>
            </div>
            <div class="lab-risk-list">
              ${topRisk.length ? topRisk.map((item) => `
                <article class="risk-${item.status === "高风险" ? "high" : "watch"}">
                  <div><strong>${escapeHtml(item.title)}</strong><small>${item.evidenceCount} 条证据</small></div>
                  <span>${item.status} · ${item.risk}/5</span>
                  <p>${escapeHtml(item.correction)}</p>
                </article>`).join("") : emptyState("尚未形成误概念画像", "诊断题会同时记录答案、理由和置信度，避免把猜对当成掌握。")}
            </div>
          </section>
        </div>

        <section class="lab-capability-card">
          <div>
            <span class="lab-section-index">CAPABILITY STATUS</span>
            <h3>当前版本能力边界</h3>
          </div>
          <div class="lab-capability-grid">
            ${capability("可离线使用", "诊断、提示、校验、仿真、报告和工具均在本机运行。", "ready")}
            ${capability("确定性自动批改", "可靠覆盖选项和数值结果；解释题明确转人工复核。", "ready")}
            ${capability("照片与图示采集", "沿用现有拍照、相册、附件和二维码入口。", "ready")}
            ${capability("手写公式语义识别", "当前未内置 OCR/视觉模型，不宣称已经自动识别。", "planned")}
            ${capability("跨端同步", "提供学习档案导入导出；自动云同步需要后端账号服务。", "partial")}
            ${capability("生成式 AI", "预留教师审核和来源字段；当前离线导师使用可解释规则。", "partial")}
          </div>
        </section>
      </section>`;
  }

  function renderDiagnostic() {
    const profiles = engine.misconceptionProfile(lab.state);
    const selected = engine.misconceptionCatalog.find((item) => item.diagnostic.id === lab.diagnosticId)
      || profiles.find((item) => !item.evidenceCount)
      || engine.misconceptionCatalog[0];
    lab.diagnosticId = selected.diagnostic.id;
    const diagnostic = selected.diagnostic;
    const result = lab.diagnosticResult?.diagnosticId === diagnostic.id ? lab.diagnosticResult : null;
    return `
      <section class="lab-two-column">
        <div class="lab-card lab-diagnostic-card">
          <div class="lab-card-head">
            <div><span>ANSWER + REASON + CONFIDENCE</span><h3>前概念诊断</h3></div>
            <strong>${profiles.filter((item) => item.evidenceCount).length}/${profiles.length}</strong>
          </div>
          <div class="diagnostic-selector">
            ${profiles.map((item, index) => `
              <button class="${item.diagnostic.id === diagnostic.id ? "active" : ""}" data-diagnostic-id="${item.diagnostic.id}" type="button">
                <span>${index + 1}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${item.status}</small>
              </button>`).join("")}
          </div>
          <div class="diagnostic-question">
            <span>${escapeHtml(selected.topics.join(" · "))}</span>
            <h4>${escapeHtml(diagnostic.prompt)}</h4>
            <fieldset id="diagnosticAnswerGroup">
              <legend>你的答案</legend>
              ${diagnostic.choices.map(([value, label]) => `
                <label><input type="radio" name="diagnosticAnswer" value="${value}"><span>${value}</span>${escapeHtml(label)}</label>`).join("")}
            </fieldset>
            <fieldset id="diagnosticReasonGroup">
              <legend>最接近你的理由</legend>
              ${diagnostic.reasons.map(([value, label]) => `
                <label><input type="radio" name="diagnosticReason" value="${value}"><span>${value.replace("R", "")}</span>${escapeHtml(label)}</label>`).join("")}
            </fieldset>
            <label class="confidence-control">
              <span>作答置信度 <strong id="diagnosticConfidenceValue">3/5</strong></span>
              <input id="diagnosticConfidence" type="range" min="1" max="5" value="3" step="1">
              <small>1 = 主要靠猜　5 = 非常确定</small>
            </label>
            <button class="lab-primary-button" data-lab-action="submit-diagnostic" type="button">提交诊断证据</button>
          </div>
          ${result ? renderDiagnosticResult(result) : ""}
        </div>

        <aside class="lab-card">
          <div class="lab-card-head"><div><span>PROFILE</span><h3>误概念画像</h3></div></div>
          <div class="misconception-profile">
            ${profiles.map((item) => `
              <article>
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <span class="risk-pill ${item.status === "高风险" ? "high" : item.status === "需观察" ? "watch" : ""}">${item.status}</span>
                </div>
                <div class="risk-meter"><i style="width:${item.risk / 5 * 100}%"></i></div>
                <p>${escapeHtml(item.correction)}</p>
              </article>`).join("")}
          </div>
        </aside>
      </section>`;
  }

  function renderDiagnosticResult(result) {
    const classification = {
      secure: "概念与理由一致",
      "fragile-correct": "概念正确但信心不足",
      guess: "可能猜对",
      "confident-guess": "高置信度猜对，需纠正理由",
      "not-yet-understood": "尚未理解",
      "stable-misconception": "稳定错误观念风险"
    }[result.attempt.classification] || result.attempt.classification;
    return `
      <div class="diagnostic-result ${result.attempt.answerCorrect && result.attempt.reasonCorrect ? "correct" : "needs-work"}">
        <span>诊断结果</span>
        <h4>${escapeHtml(classification)}</h4>
        <p>${escapeHtml(result.item.diagnostic.explanation)}</p>
        <strong>修正表述：${escapeHtml(result.item.correction)}</strong>
      </div>`;
  }

  function renderTutor() {
    const question = getQuestion(lab.selectedQuestionId);
    if (!question) return renderQuestionPicker("选择一道有完整题干的题目进入分步训练");
    if (!lab.session || lab.session.questionId !== question.id) {
      lab.session = newSession(question);
    }
    const session = lab.session;
    const hints = engine.createHintLadder(question);
    const prompts = engine.socraticPrompts(question);
    return `
      <section class="tutor-layout">
        <aside class="lab-card tutor-question">
          <button class="lab-back-button" data-lab-action="choose-question" type="button">← 更换题目</button>
          <div class="tutor-meta">
            <span>${escapeHtml(question.stage)} · ${escapeHtml(question.grade || "")}</span>
            <span>${escapeHtml(question.topic)}</span>
            <span>${escapeHtml(question.difficulty)}</span>
          </div>
          <h3>${escapeHtml(question.title)}</h3>
          <div class="tutor-stem">${escapeHtml(question.content)}</div>
          ${Array.isArray(question.examPoints) ? `
            <div class="tutor-points"><strong>考点</strong>${question.examPoints.map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>` : ""}
          <label class="confidence-control compact">
            <span>作答前置信度 <strong id="confidenceBeforeValue">${session.confidenceBefore}/5</strong></span>
            <input id="confidenceBefore" type="range" min="1" max="5" value="${session.confidenceBefore}">
          </label>
          ${document.body.classList.contains("role-student") ? "" : `<button class="lab-secondary-button" data-view-source-question="${escapeHtml(question.id)}" type="button">查看题库原记录</button>`}
        </aside>

        <div class="tutor-work">
          <section class="lab-card">
            <div class="lab-card-head">
              <div><span>SOCRATIC SCAFFOLD</span><h3>先完成建模，再看提示</h3></div>
              <span class="session-timer" id="sessionTimer">${formatDuration((Date.now() - session.startedAt) / 1000)}</span>
            </div>
            <div class="socratic-prompts">
              ${prompts.map((prompt, index) => `<p><span>${index + 1}</span>${escapeHtml(prompt)}</p>`).join("")}
            </div>
            <div class="modeling-form">
              ${modelField("object", "研究对象", "例如：只研究滑块；地球和斜面属于环境", session.model.object)}
              ${modelField("known", "已知量", "逐项写符号、数值和单位，例如 m = 2 kg", session.model.known)}
              ${modelField("unknown", "未知量", "写清最终要求的物理量、方向或判断目标", session.model.unknown)}
              ${modelField("process", "过程划分", "写清初态、末态和每个阶段", session.model.process)}
              ${modelField("assumptions", "理想化假设", "例如：忽略空气阻力、绳质量不计", session.model.assumptions)}
              ${modelField("coordinates", "坐标系", "正方向、原点和轴的选择", session.model.coordinates)}
              ${modelField("forces", "受力/相互作用", "逐项写力及方向，不写“惯性力”", session.model.forces)}
              ${modelField("equations", "方程与适用条件", "先写符号方程，再代入数值", session.model.equations)}
              ${modelField("reasonableness", "结果合理性检验", "单位、方向、数量级、极限或守恒", session.model.reasonableness)}
            </div>
          </section>

          <section class="lab-card hint-card">
            <div class="lab-card-head">
              <div><span>PROGRESSIVE HINTS</span><h3>五级提示</h3></div>
              <strong>已用 ${session.hintLevel}/5 级</strong>
            </div>
            <div class="hint-ladder">
              ${hints.map((hint) => `
                <article class="${session.hintLevel >= hint.level ? "revealed" : ""}">
                  <button data-hint-level="${hint.level}" type="button">
                    <span>${hint.level}</span>
                    <strong>${escapeHtml(hint.label)}</strong>
                    <small>${session.hintLevel >= hint.level ? "已查看" : hint.level === session.hintLevel + 1 ? "点击逐步解锁" : "需先查看上一级"}</small>
                  </button>
                  ${session.hintLevel >= hint.level ? `<pre>${escapeHtml(hint.text)}</pre>` : ""}
                </article>`).join("")}
            </div>
          </section>

          <section class="lab-card answer-workbench">
            <div class="lab-card-head"><div><span>VERIFIABLE ANSWER</span><h3>作答与反馈</h3></div></div>
            <label>
              <span>最终答案</span>
              <textarea id="labFinalAnswer" rows="3" placeholder="写出数值、单位和必要方向；多问请分行。">${escapeHtml(session.finalAnswer)}</textarea>
            </label>
            <div class="draft-upload">
              <div>
                <strong>草稿或过程图</strong>
                <span>可上传一张手写过程、受力图、电路图或光路图；图片仅保存在本机学习记录中。</span>
              </div>
              <label class="lab-secondary-button file-label" for="labDraftUpload">${session.draftImageData ? "更换草稿" : "上传草稿"}</label>
              <input class="visually-hidden" id="labDraftUpload" type="file" accept="image/*,.jpg,.jpeg,.png,.webp">
              ${session.draftImageData ? `<figure><img src="${escapeHtml(session.draftImageData)}" alt="本次作答草稿预览"><figcaption>${escapeHtml(session.draftImageName || "作答草稿")}</figcaption></figure>` : ""}
            </div>
            <div class="answer-actions">
              <button class="lab-primary-button" data-lab-action="grade-answer" type="button">检查答案</button>
              <button class="lab-secondary-button" data-lab-tab="models" type="button">用建模画布验证</button>
              <button class="lab-secondary-button" data-lab-tab="tools" type="button">打开量纲与单位工具</button>
            </div>
            ${session.grading ? renderGrading(session.grading) : ""}
            <section class="ai-tutor-card">
              <div>
                <span>CHATGPT 深度解析</span>
                <strong>${window.PhysicsStudioAITutor?.status?.().ready ? "受控服务端已配置" : "当前为离线规则模式"}</strong>
                <small>API 密钥不保存在电脑端或安卓端；未配置时不会发送题目。</small>
              </div>
              <button class="lab-secondary-button" data-lab-action="ai-solve" type="button"${window.PhysicsStudioAITutor?.status?.().ready ? "" : " disabled"}>生成分步解答与物理校验</button>
              ${lab.aiStatusMessage ? `<p>${escapeHtml(lab.aiStatusMessage)}</p>` : ""}
              ${lab.aiResult ? renderAiSolution(lab.aiResult) : ""}
            </section>
            <div class="reflection-grid">
              <label>
                <span>错误类型</span>
                <select id="labErrorType">
                  ${["", "审题错误", "概念错误", "建模错误", "公式条件错误", "计算错误", "单位错误", "方向/符号错误", "表达错误", "猜测作答"].map((value) => `
                    <option value="${value}"${session.errorType === value ? " selected" : ""}>${value || "本次无错误或待判断"}</option>`).join("")}
                </select>
              </label>
              <label>
                <span>作答后置信度 <strong id="confidenceAfterValue">${session.confidenceAfter}/5</strong></span>
                <input id="confidenceAfter" type="range" min="1" max="5" value="${session.confidenceAfter}">
              </label>
              <label class="wide">
                <span>反思：错误发生在哪里，下一次怎样避免？</span>
                <textarea id="labReflection" rows="3">${escapeHtml(session.reflection)}</textarea>
              </label>
              <label class="wide">
                <span>自我解释：这道题的关键规律是什么？ <i>*</i></span>
                <textarea id="labSelfExplanation" rows="3" placeholder="用自己的话说明规律、适用条件以及为什么这样建模。">${escapeHtml(session.selfExplanation)}</textarea>
              </label>
            </div>
            <button class="lab-complete-button" data-lab-action="complete-attempt" type="button"${session.grading ? "" : " disabled"}>
              保存本题并进入一道迁移练习
            </button>
          </section>
        </div>
      </section>`;
  }

  function renderQuestionPicker(title, targetTab = lab.tab) {
    const questions = getQuestions().filter((question) => question.fullTextIncluded !== false);
    const recommendations = engine.recommendations(lab.state, questions, 10);
    const orderedIds = new Set(recommendations.map((item) => item.question.id));
    const ordered = [
      ...recommendations.map((item) => item.question),
      ...questions.filter((question) => !orderedIds.has(question.id))
    ].slice(0, 60);
    return `
      <section class="lab-card question-picker">
        <div class="lab-card-head">
          <div><span>QUESTION BANK</span><h3>${escapeHtml(title)}</h3></div>
          <span>${questions.length} 道可离线训练</span>
        </div>
        <label class="lab-search">
          <span>⌕</span>
          <input id="labQuestionSearch" type="search" placeholder="搜索题目、知识点、考点或年级">
        </label>
        <div class="question-picker-list" id="labQuestionPickerList">
          ${ordered.map((question) => questionPickerCard(question, orderedIds.has(question.id), targetTab)).join("")}
        </div>
      </section>`;
  }

  function questionPickerCard(question, recommended, targetTab) {
    return `
      <article data-question-search="${escapeHtml([
        question.title,
        question.topic,
        question.stage,
        question.grade,
        ...(question.examPoints || [])
      ].join(" ").toLocaleLowerCase("zh-CN"))}">
        <div>
          <span>${escapeHtml(question.stage)} · ${escapeHtml(question.grade || "")} · ${escapeHtml(question.difficulty)}</span>
          <h4>${escapeHtml(question.title)}</h4>
          <p>${escapeHtml(question.topic)}${recommended ? " · 根据当前学习证据推荐" : ""}</p>
        </div>
        <button data-start-question="${escapeHtml(question.id)}" data-question-target="${escapeHtml(targetTab)}" type="button">
          ${targetTab === "transfer" ? "生成迁移题" : "开始训练"}
        </button>
      </article>`;
  }

  function renderGrading(grading) {
    const labels = {
      correct: "结果通过",
      partial: "部分正确",
      incorrect: "需要修改",
      "review-required": "需要人工复核"
    };
    return `
      <div class="grading-result status-${grading.status}">
        <div><span>${labels[grading.status] || grading.status}</span>${grading.score == null ? "" : `<strong>${Math.round(grading.score * 100)}%</strong>`}</div>
        <p>${escapeHtml(grading.summary)}</p>
        ${grading.issues?.length ? `
          <ul>${grading.issues.map((issue) => `
            <li>
              <strong>${escapeHtml(issue.location)}</strong>
              <span>${escapeHtml(issue.reason)}</span>
              <small>下一步：${escapeHtml(issue.next)}</small>
            </li>`).join("")}</ul>` : ""}
        ${grading.status === "review-required" ? `<details><summary>展开参考答案供人工复核</summary><pre>${escapeHtml(grading.expected)}</pre></details>` : ""}
        ${grading.verification?.length ? `
          <div class="verification-grid">
            ${grading.verification.map((check) => `
              <article class="verification-${check.status}">
                <span>${verificationStatusLabel(check.status)}</span>
                <strong>${escapeHtml(check.label)}</strong>
                <p>${escapeHtml(check.detail)}</p>
              </article>`).join("")}
          </div>` : ""}
      </div>`;
  }

  function renderAiSolution(result) {
    return `
      <div class="ai-solution">
        <article><strong>研究对象</strong><p>${escapeHtml(result.object)}</p></article>
        <article><strong>已知量</strong><ul>${result.known.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
        <article><strong>未知量</strong><p>${escapeHtml(result.unknown)}</p></article>
        <article><strong>过程与规律</strong><p>${escapeHtml(result.process)}</p><ul>${result.laws.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
        <article><strong>分步推理</strong><ol>${result.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></article>
        <article><strong>结论</strong><p>${escapeHtml(result.answer)}</p></article>
        <article><strong>自动校验</strong><ul>${result.checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
        <article><strong>举一反三</strong><p>${escapeHtml(typeof result.similarQuestion === "string" ? result.similarQuestion : JSON.stringify(result.similarQuestion))}</p></article>
        ${result.reviewRequired ? "<small>该结果标记为需要教师复核，不能替代正式评分。</small>" : ""}
      </div>`;
  }

  function renderModels() {
    return `
      <section class="model-lab">
        <div class="lab-card model-sidebar">
          <div class="lab-card-head"><div><span>SYNCHRONIZED MODEL</span><h3>题目—模型—图像—仿真</h3></div></div>
          <div class="model-tabs">
            ${[
              ["projectile", "平抛/斜抛", "轨迹与能量"],
              ["incline", "斜面动力学", "受力与运动图像"],
              ["circuit", "直流电路", "电流、电压与功率"]
            ].map(([key, label, detail]) => `
              <button class="${lab.modelType === key ? "active" : ""}" data-model-type="${key}" type="button">
                <strong>${label}</strong><small>${detail}</small>
              </button>`).join("")}
          </div>
          ${modelControls()}
          <div class="model-actions">
            ${lab.modelType !== "circuit" ? '<button class="lab-primary-button" data-lab-action="play-model" type="button">▶ 播放过程</button>' : ""}
            <button class="lab-secondary-button" data-lab-action="reset-model" type="button">恢复默认</button>
          </div>
          <div class="model-principles">
            <strong>验证规则</strong>
            <p>图像、方程和数值来自同一组变量；仿真使用理想模型，结论只在列出的假设下成立。</p>
          </div>
        </div>
        <div class="model-output" id="labModelOutput"></div>
      </section>`;
  }

  function modelControls() {
    const params = lab.modelParams[lab.modelType];
    if (lab.modelType === "projectile") {
      const total = 2 * params.v0 * Math.sin(params.angle * Math.PI / 180) / params.g;
      return `
        <div class="model-controls">
          ${rangeControl("v0", "初速度 v₀", params.v0, 5, 50, 1, "m/s")}
          ${rangeControl("angle", "发射角 θ", params.angle, 10, 80, 1, "°")}
          ${rangeControl("g", "重力加速度 g", params.g, 1, 15, 0.1, "m/s²")}
          ${rangeControl("t", "观察时刻 t", Math.min(params.t, total), 0, Math.max(0.1, total), 0.05, "s")}
        </div>`;
    }
    if (lab.modelType === "incline") {
      return `
        <div class="model-controls">
          ${rangeControl("mass", "质量 m", params.mass, 0.5, 10, 0.1, "kg")}
          ${rangeControl("angle", "斜面角 θ", params.angle, 5, 60, 1, "°")}
          ${rangeControl("mu", "动摩擦因数 μ", params.mu, 0, 0.8, 0.01, "")}
          ${rangeControl("g", "重力加速度 g", params.g, 1, 15, 0.1, "m/s²")}
          ${rangeControl("t", "观察时刻 t", params.t, 0, 5, 0.05, "s")}
        </div>`;
    }
    return `
      <div class="model-controls">
        ${rangeControl("voltage", "电源电压 U", params.voltage, 1, 36, 1, "V")}
        ${rangeControl("r1", "电阻 R₁", params.r1, 1, 100, 1, "Ω")}
        ${rangeControl("r2", "电阻 R₂", params.r2, 1, 100, 1, "Ω")}
        <label><span>连接方式</span><select data-model-param="mode"><option value="series"${params.mode === "series" ? " selected" : ""}>串联</option><option value="parallel"${params.mode === "parallel" ? " selected" : ""}>并联</option></select></label>
      </div>`;
  }

  function rangeControl(key, label, value, min, max, step, unit) {
    return `
      <label>
        <span>${escapeHtml(label)} <strong data-model-value="${key}">${formatNumber(value)} ${unit}</strong></span>
        <input data-model-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      </label>`;
  }

  function updateModelOutput() {
    const output = document.getElementById("labModelOutput");
    if (!output) return;
    if (lab.modelType === "projectile") output.innerHTML = projectileModel();
    else if (lab.modelType === "incline") output.innerHTML = inclineModel();
    else output.innerHTML = circuitModel();
    lab.content.querySelectorAll("[data-model-value]").forEach((node) => {
      const key = node.dataset.modelValue;
      const units = { v0: "m/s", angle: "°", g: "m/s²", t: "s", mass: "kg", mu: "", voltage: "V", r1: "Ω", r2: "Ω" };
      node.textContent = `${formatNumber(lab.modelParams[lab.modelType][key])} ${units[key] || ""}`.trim();
    });
  }

  function projectileModel() {
    const { v0, angle, g } = lab.modelParams.projectile;
    const radians = angle * Math.PI / 180;
    const vx = v0 * Math.cos(radians);
    const vy0 = v0 * Math.sin(radians);
    const flight = 2 * vy0 / g;
    const t = clamp(lab.modelParams.projectile.t, 0, flight);
    const range = vx * flight;
    const maxHeight = vy0 ** 2 / (2 * g);
    const x = vx * t;
    const y = Math.max(0, vy0 * t - 0.5 * g * t ** 2);
    const vy = vy0 - g * t;
    const speed = Math.hypot(vx, vy);
    const width = 650;
    const height = 310;
    const pad = 42;
    const scaleX = (width - pad * 2) / Math.max(range, 1);
    const scaleY = (height - pad * 2) / Math.max(maxHeight * 1.15, 1);
    const points = [];
    for (let index = 0; index <= 60; index += 1) {
      const time = flight * index / 60;
      const px = pad + vx * time * scaleX;
      const py = height - pad - Math.max(0, vy0 * time - 0.5 * g * time ** 2) * scaleY;
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    const ballX = pad + x * scaleX;
    const ballY = height - pad - y * scaleY;
    const totalEnergy = 0.5 * v0 ** 2;
    const kinetic = 0.5 * speed ** 2;
    const potential = g * y;
    const dimension = engine.validateDimension("x=v*t+a*t^2");
    return `
      <section class="lab-card model-stage">
        <div class="model-stage-head">
          <div><span>PROJECTILE MODEL</span><h3>斜抛运动同步画布</h3></div>
          <div class="model-live-values"><span>x = ${formatNumber(x)} m</span><span>y = ${formatNumber(y)} m</span><span>v = ${formatNumber(speed)} m/s</span></div>
        </div>
        <svg class="main-simulation" viewBox="0 0 ${width} ${height}" role="img" aria-label="斜抛轨迹">
          <defs><marker id="arrow-projectile" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z"></path></marker></defs>
          <path class="sim-axis" d="M${pad},${height - pad} H${width - pad} M${pad},${height - pad} V${pad}"></path>
          <polyline class="trajectory-line" points="${points.join(" ")}"></polyline>
          <line class="velocity-vector" x1="${ballX}" y1="${ballY}" x2="${ballX + vx * 2}" y2="${ballY - vy * 2}" marker-end="url(#arrow-projectile)"></line>
          <line class="force-vector" x1="${ballX}" y1="${ballY}" x2="${ballX}" y2="${ballY + 54}" marker-end="url(#arrow-projectile)"></line>
          <circle class="sim-object" cx="${ballX}" cy="${ballY}" r="10"></circle>
          <text x="${Math.min(width - 70, ballX + 12)}" y="${Math.max(24, ballY - 12)}">t=${formatNumber(t)} s</text>
          <text class="force-label" x="${ballX + 8}" y="${ballY + 48}">mg</text>
        </svg>
        <div class="model-equation-grid">
          <article><span>水平方向</span><strong>x = v₀cosθ · t</strong><small>aₓ = 0</small></article>
          <article><span>竖直方向</span><strong>y = v₀sinθ · t − ½gt²</strong><small>aᵧ = −g</small></article>
          <article><span>全过程</span><strong>射程 ${formatNumber(range)} m</strong><small>最高点 ${formatNumber(maxHeight)} m · 总时间 ${formatNumber(flight)} s</small></article>
          <article class="${dimension.valid ? "verified" : "warning"}"><span>量纲校验</span><strong>${dimension.status}</strong><small>${escapeHtml(dimension.message)}</small></article>
        </div>
        <div class="model-graphs">
          ${miniFunctionGraph("y-t 图", flight, maxHeight * 1.1, (time) => Math.max(0, vy0 * time - 0.5 * g * time ** 2), t)}
          ${miniFunctionGraph("vᵧ-t 图", flight, Math.max(Math.abs(vy0), 1), (time) => vy0 - g * time, t, true)}
          ${energyBars(kinetic, potential, totalEnergy)}
        </div>
        <p class="model-assumption">理想化假设：质点、近地面匀强重力场、忽略空气阻力、发射点与落地点等高。改变这些条件时，本模型不再直接适用。</p>
      </section>`;
  }

  function inclineModel() {
    const { mass, angle, mu, g, t } = lab.modelParams.incline;
    const radians = angle * Math.PI / 180;
    const gravityAlong = mass * g * Math.sin(radians);
    const normal = mass * g * Math.cos(radians);
    const friction = mu * normal;
    const acceleration = Math.max(0, (gravityAlong - friction) / mass);
    const distance = 0.5 * acceleration * t ** 2;
    const speed = acceleration * t;
    const dimension = engine.validateDimension("F=m*a");
    const maxT = 5;
    return `
      <section class="lab-card model-stage">
        <div class="model-stage-head">
          <div><span>INCLINED PLANE MODEL</span><h3>斜面动力学同步画布</h3></div>
          <div class="model-live-values"><span>N = ${formatNumber(normal)} N</span><span>f = ${formatNumber(friction)} N</span><span>a = ${formatNumber(acceleration)} m/s²</span></div>
        </div>
        <svg class="main-simulation" viewBox="0 0 650 310" role="img" aria-label="斜面受力图">
          <defs><marker id="arrow-incline" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z"></path></marker></defs>
          <path class="incline-surface" d="M80,260 L570,${260 - 490 * Math.tan(radians)} L570,260 Z"></path>
          <g transform="translate(${260 + Math.min(170, distance * 8)},${190 - Math.min(100, distance * 8 * Math.tan(radians))}) rotate(${-angle})">
            <rect class="sim-block" x="-28" y="-20" width="56" height="40" rx="6"></rect>
          </g>
          <line class="force-vector" x1="260" y1="190" x2="260" y2="265" marker-end="url(#arrow-incline)"></line>
          <text class="force-label" x="268" y="252">mg</text>
          <line class="normal-vector" x1="260" y1="190" x2="${260 - 70 * Math.sin(radians)}" y2="${190 - 70 * Math.cos(radians)}" marker-end="url(#arrow-incline)"></line>
          <text class="force-label" x="${205 - 30 * Math.sin(radians)}" y="${145 - 20 * Math.cos(radians)}">N</text>
          <line class="friction-vector" x1="260" y1="190" x2="${260 - 70 * Math.cos(radians)}" y2="${190 + 70 * Math.sin(radians)}" marker-end="url(#arrow-incline)"></line>
          <text class="force-label" x="${205 - 30 * Math.cos(radians)}" y="${210 + 20 * Math.sin(radians)}">f</text>
        </svg>
        <div class="model-equation-grid">
          <article><span>垂直斜面</span><strong>N = mgcosθ</strong><small>${formatNumber(normal)} N</small></article>
          <article><span>沿斜面</span><strong>ma = mgsinθ − μmgcosθ</strong><small>${gravityAlong <= friction ? "由静止释放时不会沿斜面下滑" : `a = ${formatNumber(acceleration)} m/s²`}</small></article>
          <article><span>运动结果</span><strong>v = at；s = ½at²</strong><small>t=${formatNumber(t)} s 时，v=${formatNumber(speed)} m/s，s=${formatNumber(distance)} m</small></article>
          <article class="${dimension.valid ? "verified" : "warning"}"><span>量纲校验</span><strong>${dimension.status}</strong><small>${escapeHtml(dimension.message)}</small></article>
        </div>
        <div class="model-graphs">
          ${miniFunctionGraph("s-t 图", maxT, Math.max(1, 0.5 * acceleration * maxT ** 2), (time) => 0.5 * acceleration * time ** 2, t)}
          ${miniFunctionGraph("v-t 图", maxT, Math.max(1, acceleration * maxT), (time) => acceleration * time, t)}
          ${miniFunctionGraph("a-t 图", maxT, Math.max(1, acceleration), () => acceleration, t)}
        </div>
        <p class="model-assumption">假设：物块视为质点、斜面固定、动摩擦因数恒定。若由静止释放且 mgsinθ ≤ μmgcosθ，实际是否滑动还需比较最大静摩擦力。</p>
      </section>`;
  }

  function circuitModel() {
    const { voltage, r1, r2, mode } = lab.modelParams.circuit;
    const totalResistance = mode === "series" ? r1 + r2 : r1 * r2 / (r1 + r2);
    const totalCurrent = voltage / totalResistance;
    const i1 = mode === "series" ? totalCurrent : voltage / r1;
    const i2 = mode === "series" ? totalCurrent : voltage / r2;
    const u1 = i1 * r1;
    const u2 = i2 * r2;
    const p1 = i1 ** 2 * r1;
    const p2 = i2 ** 2 * r2;
    const dimension = engine.validateDimension("P=U*I");
    return `
      <section class="lab-card model-stage">
        <div class="model-stage-head">
          <div><span>DC CIRCUIT MODEL</span><h3>${mode === "series" ? "串联" : "并联"}电路同步画布</h3></div>
          <div class="model-live-values"><span>R总 = ${formatNumber(totalResistance)} Ω</span><span>I总 = ${formatNumber(totalCurrent)} A</span><span>P总 = ${formatNumber(voltage * totalCurrent)} W</span></div>
        </div>
        ${mode === "series" ? seriesCircuitSvg(voltage, r1, r2, totalCurrent) : parallelCircuitSvg(voltage, r1, r2, i1, i2)}
        <div class="model-equation-grid">
          <article><span>电路约束</span><strong>${mode === "series" ? "I = I₁ = I₂" : "U = U₁ = U₂"}</strong><small>${mode === "series" ? `I=${formatNumber(totalCurrent)} A` : `U=${formatNumber(voltage)} V`}</small></article>
          <article><span>元件 1</span><strong>U₁=${formatNumber(u1)} V；I₁=${formatNumber(i1)} A</strong><small>P₁=${formatNumber(p1)} W</small></article>
          <article><span>元件 2</span><strong>U₂=${formatNumber(u2)} V；I₂=${formatNumber(i2)} A</strong><small>P₂=${formatNumber(p2)} W</small></article>
          <article class="${dimension.valid ? "verified" : "warning"}"><span>量纲校验</span><strong>${dimension.status}</strong><small>${escapeHtml(dimension.message)}</small></article>
        </div>
        <div class="circuit-bars">
          ${barMetric("电流 I₁", i1, Math.max(i1, i2, 0.01), "A")}
          ${barMetric("电流 I₂", i2, Math.max(i1, i2, 0.01), "A")}
          ${barMetric("功率 P₁", p1, Math.max(p1, p2, 0.01), "W")}
          ${barMetric("功率 P₂", p2, Math.max(p1, p2, 0.01), "W")}
        </div>
        <p class="model-assumption">假设：理想电源、导线电阻忽略、两个电阻为线性纯电阻且温度不变。电动机、灯丝等非恒阻元件不能直接套用本模型。</p>
      </section>`;
  }

  function renderTransfer() {
    const question = getQuestion(lab.selectedQuestionId);
    if (!question) return renderQuestionPicker("先选择一道母题，再进行跨情境迁移");
    const variants = engine.transferVariants(question);
    const records = lab.state.experimentRecords.filter((record) => {
      return record.type === "transfer" && record.questionId === question.id && record.profileId === lab.state.activeProfileId;
    });
    return `
      <section class="lab-two-column transfer-lab">
        ${lab.lastCompleted?.attempt?.questionId === question.id && !lab.lastCompleted.review ? `
          <div class="transfer-required-banner">
            <strong>母题已完成，还差一道迁移练习</strong>
            <span>完成下方任一变式后，系统才安排下一次间隔复习；迁移回答仅记录完成证据，仍需人工核对质量。</span>
          </div>` : ""}
        <div class="lab-card">
          <button class="lab-back-button" data-lab-action="choose-question" type="button">← 更换母题</button>
          <span class="lab-section-index">SOURCE PROBLEM</span>
          <h3>${escapeHtml(question.title)}</h3>
          <p class="transfer-source-stem">${escapeHtml(question.content)}</p>
          <div class="tutor-points"><strong>核心结构</strong><span>${escapeHtml(question.topic)}</span>${(question.examPoints || []).map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>
          <button class="lab-secondary-button" data-start-question="${escapeHtml(question.id)}" type="button">先完成母题分步训练</button>
        </div>
        <div class="transfer-variants">
          ${variants.map((variant, index) => {
            const record = records.find((item) => item.variantIndex === index);
            return `
              <article class="lab-card ${record ? "completed" : ""}">
                <span>${escapeHtml(variant.type)}</span>
                <h3>${escapeHtml(variant.title)}</h3>
                <p>${escapeHtml(variant.prompt)}</p>
                <label>
                  <span>写出新情境中的模型、适用条件和关键方程</span>
                  <textarea id="transferResponse${index}" rows="4">${escapeHtml(record?.response || "")}</textarea>
                </label>
                <button data-save-transfer="${index}" type="button">${record ? "更新迁移记录" : "保存迁移记录"}</button>
              </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  function renderReview() {
    const questions = getQuestions();
    const summary = engine.summarizeLearning(lab.state, questions);
    const radar = engine.modelingRadar(lab.state);
    return `
      <section class="review-dashboard">
        ${lab.lastCompleted ? `
          <div class="lab-success-banner">
            <strong>${lab.lastCompleted.review ? "本次学习闭环已完成" : "本题尚缺迁移练习"}</strong>
            <span>${escapeHtml(lab.lastCompleted.title)} · ${lab.lastCompleted.review ? `下次复习 ${formatDate(lab.lastCompleted.review.dueAt)}` : "完成一道变式后再安排复习"}</span>
            ${lab.lastCompleted.review
              ? '<button data-lab-action="dismiss-completed" type="button">知道了</button>'
              : '<button data-lab-tab="transfer" type="button">继续迁移练习</button>'}
          </div>` : ""}
        <div class="lab-metric-grid">
          ${metricCard("作答正确率", `${summary.accuracy}%`, "按闭环训练记录")}
          ${metricCard("独立完成率", `${summary.independenceRate}%`, "区分独立完成与看答案")}
          ${metricCard("平均提示层级", `${summary.averageHint}`, "0 表示未使用提示")}
          ${metricCard("待复习题", `${summary.dueCount}`, "到期或逾期")}
          ${metricCard("累计学习", `${summary.learningMinutes} min`, `${summary.completed} 次闭环训练`)}
        </div>

        <section class="lab-card mastery-evidence-summary">
          <div class="lab-card-head"><div><span>MASTERY EVIDENCE</span><h3>证据化掌握状态</h3></div><strong>${summary.mastery.masteryRate}%</strong></div>
          <div class="mastery-state-grid">
            ${Object.entries(summary.mastery.counts).map(([label, count]) => `<article><strong>${count}</strong><span>${escapeHtml(label)}</span></article>`).join("")}
          </div>
          <p>试运行规则：至少一次低提示正确为“熟练”；不同日期低提示独立正确至少两次并完成一道迁移记录，才进入“已掌握”。迁移质量、阈值和复习间隔仍需结合学生测试校准。</p>
        </section>

        <div class="report-grid">
          <section class="lab-card">
            <div class="lab-card-head"><div><span>MODELING ABILITY</span><h3>建模能力雷达</h3></div><strong>${summary.completed ? "基于真实步骤" : "待积累数据"}</strong></div>
            ${radarChart(radar)}
            <div class="radar-legend">${radar.map((axis) => `<span><i style="--value:${axis.value}%"></i>${escapeHtml(axis.label)} ${axis.value}</span>`).join("")}</div>
          </section>
          <section class="lab-card">
            <div class="lab-card-head"><div><span>PROGRESS TREND</span><h3>最近训练趋势</h3></div></div>
            ${trendChart(summary.trend)}
            <p class="report-note">纵轴为自动可判题的得分。人工复核题不会被伪装为满分或零分。</p>
          </section>
        </div>

        <div class="report-grid">
          <section class="lab-card">
            <div class="lab-card-head"><div><span>SPACED REVIEW</span><h3>间隔复习队列</h3></div><strong>${summary.dueCount} 道到期</strong></div>
            <div class="review-queue">
              ${summary.dueQuestions.length ? summary.dueQuestions.map((item) => `
                <article>
                  <div><span>${escapeHtml(item.question.topic)} · ${formatDate(item.dueAt)}</span><h4>${escapeHtml(item.question.title)}</h4></div>
                  <button data-start-question="${escapeHtml(item.question.id)}" type="button">现在复习</button>
                  <div class="review-rating">
                    <button data-review-rating="0" data-question-id="${escapeHtml(item.question.id)}" type="button">忘记</button>
                    <button data-review-rating="1" data-question-id="${escapeHtml(item.question.id)}" type="button">困难</button>
                    <button data-review-rating="2" data-question-id="${escapeHtml(item.question.id)}" type="button">顺利</button>
                    <button data-review-rating="3" data-question-id="${escapeHtml(item.question.id)}" type="button">轻松</button>
                  </div>
                </article>`).join("") : emptyState("当前没有到期复习", "完成一道分步训练后，系统会依据正确性和提示依赖安排下次复习。")}
            </div>
          </section>
          <section class="lab-card">
            <div class="lab-card-head"><div><span>TOPIC EVIDENCE</span><h3>知识点表现</h3></div></div>
            <div class="topic-report-table">
              <div class="table-head"><span>知识点</span><span>次数</span><span>正确率</span><span>提示</span><span>建模</span></div>
              ${summary.topics.length ? summary.topics.slice(0, 12).map((topic) => `
                <div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts}</span><span>${topic.accuracy}%</span><span>${topic.averageHint}</span><span>${topic.modeling}</span></div>`).join("") : emptyState("尚无知识点证据", "完成训练后，这里会按题目知识点汇总，而不是依据聊天印象推断。")}
            </div>
          </section>
        </div>

        <section class="lab-card profile-transfer">
          <div><span class="lab-section-index">DATA PORTABILITY</span><h3>学习档案备份与跨端迁移</h3><p>导出内容包括诊断、提示使用、作答、复习计划和报告摘要，不包含本地视频或扫描附件。</p></div>
          <div>
            <button class="lab-primary-button" data-lab-action="export-profile" type="button">导出学习档案</button>
            <label class="lab-secondary-button file-label" for="labProfileImport">导入学习档案</label>
            <input class="visually-hidden" id="labProfileImport" type="file" accept="application/json,.json">
          </div>
        </section>
      </section>`;
  }

  function renderTools() {
    const formulaTopics = [...new Set(engine.formulaCatalog.map((item) => item.topic))];
    const units = Object.keys(engine.unitDefinitions);
    return `
      <section class="tools-grid">
        <div class="lab-card formula-tool">
          <div class="lab-card-head"><div><span>FORMULA LIBRARY</span><h3>公式库与适用条件</h3></div><strong>${engine.formulaCatalog.length}</strong></div>
          <label class="lab-search"><span>⌕</span><input id="formulaSearch" type="search" placeholder="搜索公式、知识点或适用条件"></label>
          <div class="formula-filters">${formulaTopics.map((topic) => `<button data-formula-topic="${escapeHtml(topic)}" type="button">${escapeHtml(topic)}</button>`).join("")}</div>
          <div class="formula-list" id="formulaList">
            ${engine.formulaCatalog.map(formulaCard).join("")}
          </div>
        </div>

        <div class="tool-stack">
          <section class="lab-card">
            <div class="lab-card-head"><div><span>DIMENSION CHECK</span><h3>量纲一致性校验</h3></div></div>
            <label><span>方程</span><input id="dimensionEquation" value="F=m*a" placeholder="例如 F=m*a 或 P=U*I"></label>
            <p class="tool-help">支持常见符号及乘、除、整数次幂。量纲一致只是必要条件，不保证物理条件正确。</p>
            <button class="lab-primary-button" data-lab-action="check-dimension" type="button">校验量纲</button>
            <div class="tool-result" id="dimensionResult"></div>
          </section>

          <section class="lab-card">
            <div class="lab-card-head"><div><span>UNIT CONVERTER</span><h3>单位换算</h3></div></div>
            <div class="unit-converter">
              <input id="unitValue" type="number" value="72" step="any">
              <select id="unitFrom">${units.map((unit) => `<option${unit === "km/h" ? " selected" : ""}>${unit}</option>`).join("")}</select>
              <span>→</span>
              <select id="unitTo">${units.map((unit) => `<option${unit === "m/s" ? " selected" : ""}>${unit}</option>`).join("")}</select>
            </div>
            <button class="lab-primary-button" data-lab-action="convert-unit" type="button">换算</button>
            <div class="tool-result" id="unitResult"></div>
          </section>

          <section class="lab-card">
            <div class="lab-card-head"><div><span>VECTOR TOOL</span><h3>二维矢量计算</h3></div></div>
            <div class="vector-inputs"><label><span>x 分量</span><input id="vectorX" type="number" value="3" step="any"></label><label><span>y 分量</span><input id="vectorY" type="number" value="4" step="any"></label></div>
            <button class="lab-primary-button" data-lab-action="calculate-vector" type="button">计算模与方向</button>
            <div class="tool-result" id="vectorResult"></div>
          </section>
        </div>

        <section class="lab-card graph-tool">
          <div class="lab-card-head"><div><span>DATA & GRAPH</span><h3>数据图像与线性拟合</h3></div></div>
          <label><span>每行输入 x,y</span><textarea id="graphData" rows="7">0,0
1,2.1
2,3.9
3,6.2
4,8.0</textarea></label>
          <button class="lab-primary-button" data-lab-action="fit-graph" type="button">绘图并拟合</button>
          <div class="graph-result" id="graphResult"></div>
        </section>

        <section class="lab-card constants-tool">
          <div class="lab-card-head"><div><span>CONSTANTS</span><h3>常用物理常数</h3></div></div>
          <div class="constant-list">${engine.constants.map(([name, symbol, value, note]) => `<article><span>${escapeHtml(name)}</span><strong>${escapeHtml(symbol)} = ${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join("")}</div>
        </section>

        <section class="lab-card sketch-tool">
          <div class="lab-card-head"><div><span>DIAGRAM DRAFT</span><h3>受力图、电路图、光路图草稿板</h3></div><strong>本地草图</strong></div>
          <p>用于手写和标注图示，可导出 PNG。当前版本不把草图自动识别结果冒充为可靠物理语义。</p>
          <div class="sketch-toolbar">
            <label>图示类型<select id="sketchType"><option>受力图</option><option>电路图</option><option>光路图</option><option>实验图</option><option>函数图像</option></select></label>
            <label>笔色<input id="sketchColor" type="color" value="#155d44"></label>
            <label>笔宽<input id="sketchWidth" type="range" min="1" max="12" value="3"></label>
            <button data-lab-action="clear-sketch" type="button">清空</button>
            <button data-lab-action="export-sketch" type="button">导出 PNG</button>
          </div>
          <canvas id="labSketchCanvas" width="900" height="420" aria-label="物理图示草稿画布"></canvas>
        </section>
      </section>`;
  }

  function renderTeacher() {
    const questions = getQuestions();
    const topics = [...new Set(questions.map((question) => question.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const eligible = questions.filter((question) => engine.isPublishedQuestion(question));
    const reviewQueue = questions.filter((question) => {
      return /用户自行上传|未填写|仅保存来源链接/.test(question.sourceLicense || "")
        || question.fullTextIncluded === false
        || question.contentAudit?.requiresTeacherReview
        || question.contentReviewStatus === "待教师审核";
    }).slice(0, 18);
    const importedTopics = aggregateImportedReports();
    const coverage = lab.app?.getContentCoverage?.()
      || window.PhysicsStudioContentCatalog?.getCoverage?.(questions)
      || { target: 1900, completeQuestions: 0, indexed: 0, teacherVerifiedFullText: 0, pendingReview: 0, remaining: 1900, completionRate: 0, definition: "" };
    const studentProfiles = lab.state.profiles.filter((item) => item.role === "student");
    if (!studentProfiles.some((item) => item.id === lab.managedStudentId)) {
      const activeStudent = studentProfiles.find((item) => item.id === lab.state.activeProfileId);
      lab.managedStudentId = activeStudent?.id || studentProfiles[0]?.id || "";
    }
    const profile = studentProfiles.find((item) => item.id === lab.managedStudentId)
      || engine.activeProfile(lab.state);
    const analysis = engine.studentAnalysis(lab.state, questions, profile?.id);
    const activePlan = engine.activeLearningPlan(lab.state, profile?.id);
    const planProgress = engine.learningPlanProgress(lab.state, activePlan);
    const preview = lab.planPreview?.profileId === profile?.id ? lab.planPreview : null;
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const gradeTopics = [...new Set(eligible
      .filter((question) => question.grade === profile?.grade)
      .map((question) => question.topic)
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const aiStatus = window.PhysicsStudioAITutor?.status?.() || { ready: false, endpoint: "", model: "gpt-5.6-sol", boundary: "离线规则模式" };
    return `
      <section class="teacher-dashboard">
        <div class="lab-hero-card teacher-hero">
          <div><span class="lab-section-index">STUDENT → EVIDENCE → PLAN → REVIEW</span><h3>学生专项学习工作台</h3><p>先选择学生，再依据真实作答、试卷薄弱点、提示依赖和建模证据确认一个小目标；每个方案只安排3—7题，并包含迁移或反例。</p></div>
          <div class="teacher-stat"><strong>${studentProfiles.length}</strong><span>本机学生档案</span></div>
        </div>
        <section class="lab-card content-coverage-card">
          <div class="lab-card-head"><div><span>LOCAL QUESTION COVERAGE</span><h3>八年级至高三本地题库</h3></div><strong>${coverage.completeQuestions}/${coverage.target}</strong></div>
          <div class="coverage-track" role="progressbar" aria-valuemin="0" aria-valuemax="${coverage.target}" aria-valuenow="${coverage.completeQuestions}"><i style="width:${coverage.completionRate}%"></i></div>
          <div class="coverage-metrics">
            <article><strong>${coverage.indexed}</strong><span>已核对题号与考点索引</span></article>
            <article><strong>${coverage.completeQuestions}</strong><span>完整题干、答案与解析</span></article>
            <article><strong>${coverage.teacherVerifiedFullText}</strong><span>教师已核验中高考真题</span></article>
            <article><strong>${coverage.remaining}</strong><span>距1900题目标</span></article>
          </div>
          <p>${escapeHtml(coverage.definition)}</p>
          <div class="content-pack-import">
            <label class="lab-secondary-button file-label" for="contentPackImport">导入受控内容包</label>
            <input class="visually-hidden" id="contentPackImport" type="file" accept=".pscontent,.json,application/json,application/zip">
            <small>内容包需含可追溯来源、权利依据、考点分类和完整解析；通过结构与哈希校验后仍进入教师审核。</small>
          </div>
          ${lab.contentPackStatus ? `<p class="teacher-operation-status">${escapeHtml(lab.contentPackStatus)}</p>` : ""}
        </section>

        <section class="lab-card targeted-plan-card">
          <div class="lab-card-head">
            <div><span>PERSONALIZED MICRO-CYCLE</span><h3>为${escapeHtml(profile?.name || "当前学生")}确认专项方案</h3></div>
            <strong>${escapeHtml(analysis.evidenceLevel || "不足")}证据</strong>
          </div>
          <p class="targeted-plan-intro">方案严格限定${escapeHtml(profile?.grade || "当前年级")}，默认5题；系统说明推荐依据，教师确认后才下发。题目结构优先采用母题、条件变化、跨情境迁移、反例辨析和复测。</p>
          <div class="teacher-form targeted-plan-form">
            <label><span>专项知识点</span><select id="targetedPlanTopic">
              <option${preview ? "" : " selected"}>自动依据学情</option>
              ${gradeTopics.map((topic) => `<option${preview?.focusTopics?.[0] === topic ? " selected" : ""}>${escapeHtml(topic)}</option>`).join("")}
            </select></label>
            <label><span>题量</span><select id="targetedPlanCount">
              <option value="3"${preview?.questionCount === 3 ? " selected" : ""}>3题 · 起始诊断</option>
              <option value="5"${!preview || preview.questionCount === 5 ? " selected" : ""}>5题 · 专项微循环</option>
              <option value="7"${preview?.questionCount === 7 ? " selected" : ""}>7题 · 巩固与复测</option>
            </select></label>
            <label class="wide"><span>教师补充说明（可选）</span><textarea id="targetedPlanNote" rows="2" maxlength="2000" placeholder="例如：先纠正串联电路电流认识，再训练分压模型。">${escapeHtml(preview?.teacherNote || "")}</textarea></label>
          </div>
          <div class="teacher-inline-actions">
            <button class="lab-secondary-button" data-lab-action="preview-targeted-plan" type="button">生成方案预览</button>
            <button class="lab-primary-button" data-lab-action="approve-targeted-plan" type="button"${preview?.questionIds?.length ? "" : " disabled"}>确认并下发给学生</button>
          </div>
          ${preview ? `
            <section class="targeted-plan-preview">
              <header><div><span>预览 · ${escapeHtml(preview.evidenceLevel)}证据</span><h4>${escapeHtml(preview.title)}</h4></div><strong>${preview.questionCount}题 / 约${preview.expectedMinutes}分钟</strong></header>
              <p>${escapeHtml(preview.evidenceReason)}</p>
              <ol>${preview.items.map((item) => {
                const question = questionMap.get(item.questionId);
                return `<li><i>${escapeHtml(item.purpose)}</i><div><strong>${escapeHtml(question?.title || item.questionId)}</strong><span>${escapeHtml(item.reason)}</span></div></li>`;
              }).join("")}</ol>
              <small>${escapeHtml(preview.selectionRule)}</small>
            </section>` : `
            <p class="targeted-plan-empty">先生成预览。系统不会因为题库有1900题就安排题海，只会从当前学生的薄弱证据中选择一个小闭环。</p>`}
          ${activePlan ? `
            <section class="active-targeted-plan">
              <header><div><span>已下发方案</span><h4>${escapeHtml(activePlan.title)}</h4></div><strong>${planProgress.completed}/${planProgress.total} 已完成</strong></header>
              <div class="coverage-track" role="progressbar" aria-valuemin="0" aria-valuemax="${planProgress.total}" aria-valuenow="${planProgress.completed}"><i style="width:${planProgress.percent}%"></i></div>
              <p>${escapeHtml(activePlan.evidenceReason)}${activePlan.teacherNote ? ` · 教师说明：${escapeHtml(activePlan.teacherNote)}` : ""}</p>
            </section>` : ""}
        </section>

        <section class="teacher-records-grid">
          <section class="lab-card student-manager-card">
            <div class="lab-card-head"><div><span>STUDENT RECORDS</span><h3>学生与学情档案</h3></div><strong>${lab.state.profiles.filter((item) => item.role === "student").length} 名学生</strong></div>
            <div class="student-profile-list">
              ${lab.state.profiles.filter((item) => item.role === "student").map((item) => `
                <article class="${item.id === lab.managedStudentId ? "active" : ""}">
                  <button data-lab-action="select-student" data-profile-id="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.grade)} · 物理 · ${escapeHtml(item.goal || "日常巩固")}</span></button>
                  ${lab.state.profiles.length > 1 ? `<button data-lab-action="delete-student" data-profile-id="${escapeHtml(item.id)}" type="button" aria-label="删除${escapeHtml(item.name)}">×</button>` : ""}
                </article>`).join("")}
            </div>
            <div class="teacher-form student-profile-form">
              <label><span>学生称呼</span><input id="managedStudentName" maxlength="30" value="${escapeHtml(profile?.name || "")}"></label>
              <label><span>年级</span><select id="managedStudentGrade">${["八年级", "九年级", "高一", "高二", "高三"].map((grade) => `<option${grade === profile?.grade ? " selected" : ""}>${grade}</option>`).join("")}</select></label>
              <label><span>科目</span><input value="物理" disabled></label>
              <label><span>近期目标</span><select id="managedStudentGoal">${["日常巩固", "中考", "高考", "查漏补缺"].map((goal) => `<option${goal === profile?.goal ? " selected" : ""}>${goal}</option>`).join("")}</select></label>
              <label class="wide"><span>教师分析备注</span><textarea id="managedStudentAnalysis" rows="3" maxlength="2000">${escapeHtml(profile?.analysisNote || "")}</textarea></label>
            </div>
            <div class="teacher-inline-actions">
              <button class="lab-primary-button" data-lab-action="save-student" type="button">保存当前学生</button>
              <button class="lab-secondary-button" data-lab-action="add-student" type="button">按以上信息新增学生</button>
            </div>
          </section>

          <section class="lab-card student-analysis-card">
            <div class="lab-card-head"><div><span>EVIDENCE REPORT</span><h3>${escapeHtml(profile?.name || "学生")}学情分析</h3></div><strong>${analysis.summary.completed} 次作答</strong></div>
            <div class="teacher-analysis-metrics">
              <article><strong>${analysis.summary.accuracy}%</strong><span>正确率</span></article>
              <article><strong>${analysis.summary.independenceRate}%</strong><span>独立完成率</span></article>
              <article><strong>${analysis.summary.averageHint}</strong><span>平均提示</span></article>
              <article><strong>${analysis.summary.dueCount}</strong><span>到期复习</span></article>
            </div>
            <h4>下一步建议</h4>
            <ul>${analysis.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            <p>${escapeHtml(analysis.conclusion)}</p>
            <small>${escapeHtml(analysis.boundary)}</small>
            <div class="teacher-inline-actions">
              <button class="lab-primary-button" data-lab-action="export-report-html" type="button">导出学生分析报告</button>
              <button class="lab-secondary-button" data-lab-action="export-profile" type="button">导出成长档案 JSON</button>
            </div>
          </section>
        </section>

        <section class="teacher-records-grid">
          <section class="lab-card exam-record-card">
            <div class="lab-card-head"><div><span>EXAM RECORDS</span><h3>试卷记录导入、导出</h3></div><strong>${lab.state.examRecords.filter((item) => item.profileId === profile?.id).length} 份</strong></div>
            <div class="teacher-form">
              <label><span>试卷名称</span><input id="examRecordTitle" value="课后物理测试"></label>
              <label><span>考试日期</span><input id="examRecordDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
              <label><span>得分</span><input id="examRecordScore" type="number" min="0" step="0.5" value="80"></label>
              <label><span>总分</span><input id="examRecordTotal" type="number" min="1" step="0.5" value="100"></label>
              <label class="wide"><span>薄弱知识点（顿号或逗号分隔）</span><input id="examRecordWeakTopics" placeholder="例如：浮力、欧姆定律"></label>
              <label class="wide"><span>备注</span><textarea id="examRecordNote" rows="2"></textarea></label>
            </div>
            <div class="teacher-inline-actions">
              <button class="lab-primary-button" data-lab-action="add-exam-record" type="button">添加试卷记录</button>
              <button class="lab-secondary-button" data-lab-action="export-exam-records" type="button">导出试卷记录</button>
              <label class="lab-secondary-button file-label" for="examRecordImport">导入试卷记录</label>
              <input class="visually-hidden" id="examRecordImport" type="file" accept=".json,application/json">
            </div>
          </section>
          <section class="lab-card growth-record-card">
            <div class="lab-card-head"><div><span>GROWTH TIMELINE</span><h3>学生成长档案</h3></div><strong>${analysis.growthTimeline.length} 条证据</strong></div>
            <label><span>成长记录标题</span><input id="growthRecordTitle" maxlength="120" placeholder="例如：能够独立完成受力分析"></label>
            <label><span>事实与证据</span><textarea id="growthRecordDetail" rows="3" maxlength="3000" placeholder="只记录可观察行为和证据，不贴能力标签。"></textarea></label>
            <button class="lab-secondary-button" data-lab-action="add-growth-record" type="button">添加教师记录</button>
            <div class="growth-record-list">${analysis.growthTimeline.slice(0, 8).map((item) => `<article><time>${formatDate(item.date)}</time><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></article>`).join("") || emptyState("暂无成长记录", "练习、试卷和教师记录会按时间形成档案。")}</div>
          </section>
        </section>

        <section class="teacher-records-grid">
          <section class="lab-card document-import-card">
            <div class="lab-card-head"><div><span>DOCUMENT ANALYSIS</span><h3>PDF、Word与扫描卷解析</h3></div><strong>导入后必审</strong></div>
            <div class="teacher-form">
              <label><span>学段</span><select id="documentImportStage"><option>初中</option><option>高中</option></select></label>
              <label><span>年级</span><select id="documentImportGrade">${["八年级", "九年级", "高一", "高二", "高三"].map((grade) => `<option>${grade}</option>`).join("")}</select></label>
              <label class="wide"><span>来源说明</span><input id="documentImportSource" maxlength="200" placeholder="试卷名称、学校、年份或自有讲义"></label>
              <label class="wide"><span><input id="documentImportRights" type="checkbox"> 我已确认本人有权上传并在本机教学中使用该文件</span></label>
            </div>
            <label class="lab-primary-button file-label" for="documentQuestionImport">选择 PDF / DOCX / DOC / 图片并解析</label>
            <input class="visually-hidden" id="documentQuestionImport" type="file" accept=".pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
            <p>DOCX 纯文本和设备 OCR 可离线预解析；PDF、旧版 Word 和复杂扫描件使用已配置的受控服务端。所有不确定字符、图形和公式必须人工确认。</p>
            ${renderPendingDocumentImport()}
          </section>
          <section class="lab-card ai-gateway-card">
            <div class="lab-card-head"><div><span>CONTROLLED AI GATEWAY</span><h3>ChatGPT 解题服务</h3></div><strong>${aiStatus.ready ? "已启用" : "离线"}</strong></div>
            <label><span>服务端地址</span><input id="aiGatewayEndpoint" type="url" value="${escapeHtml(aiStatus.endpoint || "")}" placeholder="https://your-domain.example"></label>
            <label><span>模型</span><input id="aiGatewayModel" value="${escapeHtml(aiStatus.model || "gpt-5.6-sol")}"></label>
            <label><span>服务访问令牌（可选）</span><input id="aiGatewayAccessToken" type="password" autocomplete="off" placeholder="只在本次运行期间保留"></label>
            <label><span><input id="aiGatewayEnabled" type="checkbox"${aiStatus.ready ? " checked" : ""}> 启用受控 ChatGPT 解题</span></label>
            <div class="teacher-inline-actions">
              <button class="lab-primary-button" data-lab-action="save-ai-config" type="button">保存设置</button>
              <button class="lab-secondary-button" data-lab-action="test-ai-config" type="button">测试连接</button>
            </div>
            <p>${escapeHtml(aiStatus.boundary)}</p>
            <small>安装包和浏览器中不填写 OpenAI API 密钥。访问令牌只保留到本次应用关闭；服务端仍需完成身份认证、配额、审计、内容安全和密钥保管。</small>
            ${lab.aiStatusMessage ? `<p class="teacher-operation-status">${escapeHtml(lab.aiStatusMessage)}</p>` : ""}
          </section>
        </section>
        <div class="teacher-grid">
          <section class="lab-card">
            <div class="lab-card-head"><div><span>ASSIGNMENT BUILDER</span><h3>分层作业与试卷</h3></div></div>
            <div class="teacher-form">
              <label><span>标题</span><input id="assignmentTitle" value="物理分层练习"></label>
              <label><span>学段</span><select id="assignmentStage"><option>全部</option><option>初中</option><option>高中</option></select></label>
              <label><span>年级</span><select id="assignmentGrade"><option>全部</option>${["八年级", "九年级", "高一", "高二", "高三"].map((grade) => `<option${grade === profile?.grade ? " selected" : ""}>${grade}</option>`).join("")}</select></label>
              <label><span>知识点</span><select id="assignmentTopic"><option>全部</option>${topics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join("")}</select></label>
              <label><span>难度</span><select id="assignmentDifficulty"><option>全部</option><option>基础</option><option>进阶</option><option>挑战</option></select></label>
              <label><span>题量</span><input id="assignmentCount" type="number" min="1" max="50" value="10"></label>
            </div>
            <button class="lab-primary-button" data-lab-action="generate-assignment" type="button">生成待审核作业</button>
            <p class="tool-help">只选取完整题干记录；只有来源链接的真题索引不会被混入试卷。</p>
          </section>

          <section class="lab-card">
            <div class="lab-card-head"><div><span>CLASS EVIDENCE</span><h3>班级薄弱点</h3></div><strong>${lab.state.importedReports.length} 份档案</strong></div>
            <div class="class-weakness">
              ${importedTopics.length ? importedTopics.slice(0, 8).map((item) => `
                <article><strong>${escapeHtml(item.topic)}</strong><span>${item.students} 人有记录</span><i style="width:${100 - item.score}%"></i><small>综合表现 ${item.score}%</small></article>`).join("") : emptyState("尚未导入学生档案", "学生可从“复习报告”导出学习档案；教师导入后只汇总结构化学习证据。")}
            </div>
            <label class="lab-secondary-button file-label" for="studentReportImport">导入学生学习档案</label>
            <input class="visually-hidden" id="studentReportImport" type="file" accept="application/json,.json" multiple>
          </section>
        </div>

        <section class="lab-card">
          <div class="lab-card-head"><div><span>REVIEW QUEUE</span><h3>内容来源与审核队列</h3></div><strong>${reviewQueue.length} 条待核查</strong></div>
          <div class="content-review-list">
            ${reviewQueue.length ? reviewQueue.map((question) => {
              const review = lab.state.contentReviews[question.id];
              return `
                <article>
                  <div>
                    <span>${escapeHtml(question.stage)} · ${escapeHtml(question.topic)}</span>
                    <h4>${escapeHtml(question.title)}</h4>
                    <p>来源：${escapeHtml(question.source || "未填写")} · ${escapeHtml(question.sourceLicense || "授权状态未填写")}</p>
                    ${question.contentAudit?.requiresTeacherReview ? `<small>自动检查：${question.contentAudit.errorCount || 0} 项高风险，${question.contentAudit.warningCount || 0} 项需复核；教师仍需检查物理正确性。</small>` : ""}
                  </div>
                  <span class="review-state ${review?.status || ""}">${escapeHtml(review?.status || "待审核")}</span>
                  <div><button data-content-review="通过" data-question-id="${escapeHtml(question.id)}" type="button">通过</button><button data-content-review="退回" data-question-id="${escapeHtml(question.id)}" type="button">退回</button></div>
                </article>`;
            }).join("") : emptyState("当前没有待审核来源", "应用内原创题和已明确授权题可直接用于本地组卷。")}
          </div>
        </section>

        <section class="lab-card">
          <div class="lab-card-head"><div><span>LOCAL MATERIALS</span><h3>已生成材料</h3></div><strong>${lab.state.assignments.length}</strong></div>
          <div class="assignment-list">
            ${lab.state.assignments.length ? lab.state.assignments.slice().reverse().map((assignment) => `
              <article>
                <div><span>${formatDate(assignment.createdAt)} · ${escapeHtml(assignment.reviewStatus)}</span><h4>${escapeHtml(assignment.title)}</h4><p>${escapeHtml(assignment.stage)} · ${escapeHtml(assignment.topic)} · ${assignment.questionCount} 道题</p></div>
                <button data-export-assignment="${escapeHtml(assignment.id)}" type="button">导出 JSON</button>
              </article>`).join("") : emptyState("尚未生成作业", "设置学段、知识点、难度和题量后生成，教师审核后再下发。")}
          </div>
        </section>

        <section class="lab-capability-card teacher-boundary">
          <div><span class="lab-section-index">SERVICE BOUNDARY</span><h3>学校部署仍需的服务端能力</h3></div>
          <p>当前版本支持本机教师审核、组卷、档案导入和离线备份。真实班级账号、自动跨端同步、权限分级、集中内容审核和生成式 AI 调用需要独立后端、身份认证、审计日志与数据保护方案，本安装包未虚构这些能力。</p>
        </section>
      </section>`;
  }

  function renderPendingDocumentImport() {
    const result = lab.pendingDocumentImport;
    if (!result) {
      return lab.documentImportStatus
        ? `<p class="teacher-operation-status">${escapeHtml(lab.documentImportStatus)}</p>`
        : "";
    }
    const visible = result.questions.slice(0, 60);
    return `
      <div class="document-import-result">
        <div><strong>${result.questions.length} 道候选题</strong><span>${escapeHtml(result.parser)} · ${escapeHtml(result.file?.name || "")}</span></div>
        ${result.warnings?.length ? `<ul>${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
        <p>${escapeHtml(result.boundary || "")}</p>
        <div class="document-question-preview">
          ${visible.map((question, index) => `
            <article data-document-question="${index}">
              <label><input data-doc-field="selected" type="checkbox" checked><strong>候选题 ${index + 1}</strong>${question.uncertainFragments?.length || question.requiresImageReview ? "<span>需重点核对</span>" : ""}</label>
              <label><span>标题</span><input data-doc-field="title" value="${escapeHtml(question.title)}" maxlength="200"></label>
              <label><span>题干</span><textarea data-doc-field="content" rows="5" maxlength="60000">${escapeHtml(question.content)}</textarea></label>
              <label><span>知识点</span><input data-doc-field="topic" value="${escapeHtml(question.topic)}" maxlength="100"></label>
              <label><span>考点（顿号分隔）</span><input data-doc-field="examPoints" value="${escapeHtml((question.examPoints || []).join("、"))}" maxlength="1000"></label>
              <label><span>答案</span><textarea data-doc-field="answer" rows="2" maxlength="30000">${escapeHtml(question.answer)}</textarea></label>
              <label><span>清晰解析</span><textarea data-doc-field="solution" rows="5" maxlength="60000">${escapeHtml(question.solution)}</textarea></label>
            </article>`).join("")}
        </div>
        ${result.questions.length > visible.length ? `<small>单次页面只展示前 ${visible.length} 道，请拆分文档后再导入其余题目。</small>` : ""}
        <label><input id="documentReviewConfirmed" type="checkbox"> 我已对照原文件核对所选题目的题干、公式、图形、答案和解析；仍不确定的内容保留“待审核”状态。</label>
        <button class="lab-primary-button" data-lab-action="import-document-questions" type="button">把已确认候选题加入审核队列</button>
      </div>`;
  }

  function renderSensors() {
    const support = {
      motion: "DeviceMotionEvent" in window,
      microphone: Boolean(navigator.mediaDevices?.getUserMedia),
      light: "AmbientLightSensor" in window,
      magnet: "Magnetometer" in window
    };
    const records = lab.state.experimentRecords.filter((record) => record.type === "sensor").slice(-8).reverse();
    return `
      <section class="sensor-dashboard">
        <div class="lab-hero-card sensor-hero">
          <div><span class="lab-section-index">PHONE SENSOR LAB</span><h3>把手机变成低成本物理实验仪器</h3><p>数据只在当前设备采集。先提出假设，再选择传感器、记录数据、分析不确定度并写出结论。</p></div>
          <div class="sensor-live-badge" id="sensorLiveBadge"><i></i><span>未采集</span></div>
        </div>
        <div class="sensor-grid">
          ${sensorCard("motion", "加速度计", "直线运动、振动、电梯超重失重", support.motion, "m/s²")}
          ${sensorCard("microphone", "麦克风频谱", "频率、拍频、声音强弱", support.microphone, "Hz")}
          ${sensorCard("light", "环境光传感器", "光强随距离和遮挡变化", support.light, "lx")}
          ${sensorCard("magnet", "磁传感器", "磁场分布与方向变化", support.magnet, "μT")}
        </div>
        <div class="sensor-workspace">
          <section class="lab-card">
            <div class="lab-card-head"><div><span>LIVE DATA</span><h3>实时曲线</h3></div><strong id="sensorSampleCount">0 个样本</strong></div>
            <svg id="sensorChart" viewBox="0 0 760 280" role="img" aria-label="传感器实时数据曲线"></svg>
            <div class="sensor-summary" id="sensorSummary">${emptyState("等待采集", "在上方选择可用传感器。系统会显示均值、标准差和样本数。")}</div>
            <div class="sensor-actions">
              <button class="lab-secondary-button" data-lab-action="stop-sensors" type="button">停止全部采集</button>
              <button class="lab-primary-button" data-lab-action="export-sensor-csv" type="button">导出当前 CSV</button>
            </div>
          </section>
          <section class="lab-card">
            <div class="lab-card-head"><div><span>INQUIRY RECORD</span><h3>科学探究记录</h3></div></div>
            <label><span>假设</span><textarea id="experimentHypothesis" rows="2" placeholder="例如：手机上下振动的频率增大时，加速度峰值会怎样变化？"></textarea></label>
            <label><span>变量控制</span><textarea id="experimentVariables" rows="2" placeholder="自变量、因变量、控制变量"></textarea></label>
            <label><span>数据结论与不确定度</span><textarea id="experimentConclusion" rows="3" placeholder="结论必须由数据支持，并说明传感器噪声、采样率或操作误差。"></textarea></label>
            <button class="lab-primary-button" data-lab-action="save-experiment" type="button">保存实验记录</button>
          </section>
        </div>
        <section class="lab-card">
          <div class="lab-card-head"><div><span>HISTORY</span><h3>最近实验</h3></div><strong>${records.length}</strong></div>
          <div class="experiment-history">
            ${records.length ? records.map((record) => `<article><span>${formatDate(record.createdAt)}</span><strong>${escapeHtml(record.sensorLabel || "传感器实验")}</strong><p>${escapeHtml(record.conclusion || "尚未填写结论")}</p><small>${record.sampleCount || 0} 个样本</small></article>`).join("") : emptyState("尚无实验记录", "完成采集后填写假设、变量和结论，形成可复查的探究链。")}
          </div>
        </section>
        <p class="sensor-safety">安全提示：不要在驾驶、骑行、高处、强磁场或可能损坏设备的环境中操作。手机传感器不是经过计量认证的专业仪器，结论应报告测量限制。</p>
      </section>`;
  }

  function sensorCard(key, title, detail, supported, unit) {
    return `
      <article class="lab-card sensor-card ${supported ? "" : "unsupported"}">
        <span>${supported ? "本设备可尝试" : "当前环境不支持"}</span>
        <h3>${title}</h3>
        <p>${detail}</p>
        <small>输出单位：${unit}</small>
        <button data-start-sensor="${key}" type="button"${supported ? "" : " disabled"}>${supported ? "开始采集" : "不可用"}</button>
      </article>`;
  }

  async function handleClick(event) {
    const actionTarget = event.target.closest("[data-lab-action]");
    const tabTarget = event.target.closest("[data-lab-tab]");
    const startQuestion = event.target.closest("[data-start-question]");
    if (actionTarget) {
      handleAction(actionTarget.dataset.labAction, actionTarget);
      return;
    }
    if (tabTarget) {
      captureSessionForm();
      lab.tab = tabTarget.dataset.labTab === "teacher" && !isTeacherRole()
        ? "dashboard"
        : tabTarget.dataset.labTab;
      renderPanel();
      return;
    }
    if (startQuestion) {
      lab.selectedQuestionId = startQuestion.dataset.startQuestion;
      lab.session = null;
      lab.aiResult = null;
      lab.aiStatusMessage = "";
      lab.tab = startQuestion.dataset.questionTarget || "tutor";
      renderPanel();
      return;
    }
    const hint = event.target.closest("[data-hint-level]");
    if (hint) {
      captureSessionForm();
      const level = Number(hint.dataset.hintLevel);
      if (level <= lab.session.hintLevel + 1) lab.session.hintLevel = Math.max(lab.session.hintLevel, level);
      document.dispatchEvent(new CustomEvent("physics-learning-event", {
        detail: {
          type: "hint-viewed",
          questionId: lab.session.questionId,
          hintLevel: lab.session.hintLevel,
          answerAttempted: Boolean(lab.session.finalAnswer.trim())
        }
      }));
      renderPanel();
      return;
    }
    const diagnostic = event.target.closest("[data-diagnostic-id]");
    if (diagnostic) {
      lab.diagnosticId = diagnostic.dataset.diagnosticId;
      lab.diagnosticResult = null;
      renderPanel();
      return;
    }
    const modelType = event.target.closest("[data-model-type]");
    if (modelType) {
      lab.modelType = modelType.dataset.modelType;
      renderPanel();
      return;
    }
    const saveTransfer = event.target.closest("[data-save-transfer]");
    if (saveTransfer) {
      saveTransferRecord(Number(saveTransfer.dataset.saveTransfer));
      return;
    }
    const rating = event.target.closest("[data-review-rating]");
    if (rating) {
      engine.scheduleReview(lab.state, rating.dataset.questionId, Number(rating.dataset.reviewRating));
      saveLearningState();
      document.dispatchEvent(new CustomEvent("physics-learning-event", {
        detail: {
          type: "review-rated",
          questionId: rating.dataset.questionId,
          reviewRating: Number(rating.dataset.reviewRating)
        }
      }));
      renderPanel();
      return;
    }
    const viewSource = event.target.closest("[data-view-source-question]");
    if (viewSource) {
      lab.app?.openQuestion?.(viewSource.dataset.viewSourceQuestion);
      return;
    }
    const formulaTopic = event.target.closest("[data-formula-topic]");
    if (formulaTopic) {
      filterFormulas(formulaTopic.dataset.formulaTopic);
      return;
    }
    const review = event.target.closest("[data-content-review]");
    if (review) {
      const status = review.dataset.contentReview === "通过" ? "教师已通过" : "教师已退回";
      lab.state.contentReviews[review.dataset.questionId] = {
        status,
        reviewedAt: new Date().toISOString(),
        profileId: lab.state.activeProfileId
      };
      saveLearningState();
      await lab.app?.updateQuestion?.(review.dataset.questionId, {
        contentReviewStatus: status,
        contentReviewedAt: new Date().toISOString(),
        contentReviewedByProfileId: lab.state.activeProfileId
      });
      renderPanel();
      return;
    }
    const exportAssignmentTarget = event.target.closest("[data-export-assignment]");
    if (exportAssignmentTarget) {
      exportAssignment(exportAssignmentTarget.dataset.exportAssignment);
      return;
    }
    const sensorTarget = event.target.closest("[data-start-sensor]");
    if (sensorTarget) {
      startSensor(sensorTarget.dataset.startSensor);
    }
  }

  function handleAction(action, target) {
    if (action === "close") closeLab();
    else if (action === "choose-question") {
      captureSessionForm();
      lab.selectedQuestionId = "";
      lab.session = null;
      renderPanel();
    } else if (action === "submit-diagnostic") submitDiagnostic();
    else if (action === "grade-answer") gradeSessionAnswer();
    else if (action === "complete-attempt") completeAttempt();
    else if (action === "dismiss-completed") {
      lab.lastCompleted = null;
      renderPanel();
    } else if (action === "play-model") playModel();
    else if (action === "reset-model") resetModel();
    else if (action === "check-dimension") checkDimensionTool();
    else if (action === "convert-unit") convertUnitTool();
    else if (action === "calculate-vector") calculateVectorTool();
    else if (action === "fit-graph") fitGraphTool();
    else if (action === "clear-sketch") clearSketch();
    else if (action === "export-sketch") exportSketch();
    else if (action === "generate-assignment") generateAssignment();
    else if (action === "export-profile") exportProfile();
    else if (action === "stop-sensors") stopAllSensors(true);
    else if (action === "export-sensor-csv") exportSensorCsv();
    else if (action === "save-experiment") saveExperimentRecord();
    else if (action === "ai-solve") solveWithAi();
    else if (action === "save-ai-config") saveAiConfig();
    else if (action === "test-ai-config") testAiConfig();
    else if (action === "import-document-questions") importParsedDocumentQuestions();
    else if (action === "add-student") saveStudentProfile(true);
    else if (action === "save-student") saveStudentProfile(false);
    else if (action === "select-student") selectStudentProfile(target?.dataset.profileId);
    else if (action === "delete-student") removeStudentProfile(target?.dataset.profileId);
    else if (action === "add-exam-record") saveExamRecord();
    else if (action === "export-exam-records") exportExamRecords();
    else if (action === "export-report-html") exportStudentReportHtml();
    else if (action === "add-growth-record") saveGrowthRecord();
    else if (action === "preview-targeted-plan") previewTargetedPlan();
    else if (action === "approve-targeted-plan") approveTargetedPlan();
  }

  function handleInput(event) {
    if (event.target.id === "diagnosticConfidence") {
      const value = document.getElementById("diagnosticConfidenceValue");
      if (value) value.textContent = `${event.target.value}/5`;
    } else if (event.target.id === "confidenceBefore") {
      if (lab.session) lab.session.confidenceBefore = Number(event.target.value);
      const value = document.getElementById("confidenceBeforeValue");
      if (value) value.textContent = `${event.target.value}/5`;
    } else if (event.target.id === "confidenceAfter") {
      if (lab.session) lab.session.confidenceAfter = Number(event.target.value);
      const value = document.getElementById("confidenceAfterValue");
      if (value) value.textContent = `${event.target.value}/5`;
    } else if (event.target.id === "labQuestionSearch") {
      filterQuestionPicker(event.target.value);
    } else if (event.target.id === "formulaSearch") {
      filterFormulas(event.target.value);
    } else if (event.target.matches("[data-model-param]")) {
      const key = event.target.dataset.modelParam;
      lab.modelParams[lab.modelType][key] = event.target.type === "range"
        ? Number(event.target.value)
        : event.target.value;
      updateModelOutput();
    }
  }

  function handleChange(event) {
    if (event.target.id === "labProfileSelect") {
      if (event.target.value === "__new__") {
        const name = window.prompt("请输入本机档案名称（不要填写敏感身份信息）", "新学生");
        if (name?.trim()) {
          const role = window.prompt("角色：student / teacher / parent", "student");
          const profile = {
            id: engine.createId("profile"),
            name: name.trim().slice(0, 30),
            role: ["student", "teacher", "parent"].includes(role) ? role : "student",
            createdAt: new Date().toISOString()
          };
          lab.state.profiles.push(profile);
          lab.state.activeProfileId = profile.id;
          saveLearningState();
          renderPanel();
        } else {
          renderProfileOptions();
        }
      } else {
        lab.state.activeProfileId = event.target.value;
        saveLearningState();
        lab.session = null;
        renderPanel();
      }
    } else if (event.target.id === "labProfileImport") {
      importProfile(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.id === "studentReportImport") {
      importStudentReports([...event.target.files]);
      event.target.value = "";
    } else if (event.target.id === "documentQuestionImport") {
      analyzeQuestionDocument(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.id === "contentPackImport") {
      importContentPack(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.id === "examRecordImport") {
      importExamRecordFile(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.id === "labDraftUpload") {
      importDraftImage(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.matches("[data-model-param]")) {
      const key = event.target.dataset.modelParam;
      lab.modelParams[lab.modelType][key] = event.target.type === "range" ? Number(event.target.value) : event.target.value;
      updateModelOutput();
    }
  }

  function submitDiagnostic() {
    const answer = lab.content.querySelector('input[name="diagnosticAnswer"]:checked')?.value;
    const reason = lab.content.querySelector('input[name="diagnosticReason"]:checked')?.value;
    const confidence = Number(document.getElementById("diagnosticConfidence")?.value || 3);
    if (!answer || !reason) {
      showLabMessage("请同时选择答案和理由。", true);
      return;
    }
    const result = engine.recordDiagnostic(lab.state, {
      diagnosticId: lab.diagnosticId,
      answer,
      reason,
      confidence
    });
    lab.diagnosticResult = { ...result, diagnosticId: lab.diagnosticId };
    saveLearningState();
    renderPanel();
  }

  function newSession(question) {
    return {
      questionId: question.id,
      startedAt: Date.now(),
      hintLevel: 0,
      confidenceBefore: 3,
      confidenceAfter: 3,
      finalAnswer: "",
      errorType: "",
      reflection: "",
      selfExplanation: "",
      draftImageData: "",
      draftImageName: "",
      grading: null,
      model: {
        object: "",
        known: "",
        unknown: "",
        process: "",
        assumptions: "",
        coordinates: "",
        forces: "",
        equations: "",
        reasonableness: ""
      }
    };
  }

  function captureSessionForm() {
    if (!lab.session || lab.tab !== "tutor") return;
    const value = (id) => document.getElementById(id)?.value;
    lab.session.finalAnswer = value("labFinalAnswer") ?? lab.session.finalAnswer;
    lab.session.errorType = value("labErrorType") ?? lab.session.errorType;
    lab.session.reflection = value("labReflection") ?? lab.session.reflection;
    lab.session.selfExplanation = value("labSelfExplanation") ?? lab.session.selfExplanation;
    lab.session.confidenceBefore = Number(value("confidenceBefore") || lab.session.confidenceBefore);
    lab.session.confidenceAfter = Number(value("confidenceAfter") || lab.session.confidenceAfter);
    Object.keys(lab.session.model).forEach((key) => {
      lab.session.model[key] = value(`model-${key}`) ?? lab.session.model[key];
    });
  }

  async function importDraftImage(file) {
    if (!lab.session || !(file instanceof Blob)) return;
    if (!String(file.type || "").startsWith("image/")) {
      showLabMessage("草稿只支持 JPG、PNG、WebP 等图片。", true);
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      showLabMessage("草稿图片超过 12 MB，请先裁切或降低分辨率。", true);
      return;
    }
    let image = null;
    let objectUrl = "";
    try {
      if (typeof createImageBitmap === "function") {
        image = await createImageBitmap(file);
      } else {
        objectUrl = URL.createObjectURL(file);
        image = await new Promise((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = reject;
          element.src = objectUrl;
        });
      }
      const canvas = document.createElement("canvas");
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL("image/jpeg", 0.72);
      if (data.length > 900000) {
        const secondScale = Math.min(1, 850 / Math.max(canvas.width, canvas.height));
        const reduced = document.createElement("canvas");
        reduced.width = Math.max(1, Math.round(canvas.width * secondScale));
        reduced.height = Math.max(1, Math.round(canvas.height * secondScale));
        const reducedContext = reduced.getContext("2d");
        reducedContext.fillStyle = "#ffffff";
        reducedContext.fillRect(0, 0, reduced.width, reduced.height);
        reducedContext.drawImage(canvas, 0, 0, reduced.width, reduced.height);
        data = reduced.toDataURL("image/jpeg", 0.62);
      }
      if (data.length > 900000) throw new Error("草稿压缩后仍过大");
      lab.session.draftImageData = data;
      lab.session.draftImageName = String(file.name || "作答草稿.jpg").slice(0, 120);
      renderPanel();
    } catch (error) {
      console.error("Draft image import failed", error);
      showLabMessage("草稿图片无法安全保存，请裁切后重试。", true);
    } finally {
      if (typeof image?.close === "function") image.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  function gradeSessionAnswer() {
    captureSessionForm();
    const question = getQuestion(lab.session?.questionId);
    if (!question) return;
    if (!lab.session.finalAnswer.trim()) {
      showLabMessage("请先填写最终答案。", true);
      return;
    }
    const grading = engine.gradeFinalAnswer(question, lab.session.finalAnswer);
    grading.verification = engine.verifyPhysicsAnswer(
      question,
      lab.session.finalAnswer,
      lab.session.model,
      grading
    );
    lab.session.grading = grading;
    renderPanel();
  }

  async function completeAttempt() {
    captureSessionForm();
    const question = getQuestion(lab.session?.questionId);
    if (!question || !lab.session?.grading) return;
    if (lab.session.selfExplanation.trim().length < 8) {
      showLabMessage("请先用一句话说明本题的关键规律和适用条件。", true);
      document.getElementById("labSelfExplanation")?.focus();
      return;
    }
    if (["incorrect", "partial"].includes(lab.session.grading.status) && !lab.session.errorType) {
      showLabMessage("请先选择本次最主要的错误类型。", true);
      document.getElementById("labErrorType")?.focus();
      return;
    }
    const durationSeconds = Math.round((Date.now() - lab.session.startedAt) / 1000);
    const attempt = engine.recordAttempt(lab.state, {
      questionId: question.id,
      topic: question.topic,
      stage: question.stage,
      startedAt: new Date(lab.session.startedAt).toISOString(),
      durationSeconds,
      confidenceBefore: lab.session.confidenceBefore,
      confidenceAfter: lab.session.confidenceAfter,
      hintLevel: lab.session.hintLevel,
      finalAnswer: lab.session.finalAnswer,
      grading: lab.session.grading,
      errorType: lab.session.errorType,
      reflection: lab.session.reflection,
      selfExplanation: lab.session.selfExplanation,
      draftImageData: lab.session.draftImageData,
      draftImageName: lab.session.draftImageName,
      model: lab.session.model
    });
    const automaticRating = attempt.grading.status === "correct"
      ? attempt.hintLevel <= 1 ? 2 : 1
      : attempt.grading.status === "partial" || attempt.grading.status === "review-required" ? 1 : 0;
    saveLearningState();
    if (attempt.grading.status === "incorrect" || attempt.grading.status === "partial") {
      await lab.app?.updateQuestion?.(question.id, {
        wrong: true,
        wrongAt: new Date().toISOString(),
        wrongCount: (Number(question.wrongCount) || 0) + 1,
        mastered: false
      });
    }
    lab.lastCompleted = { title: question.title, review: null, attempt, automaticRating };
    lab.session = null;
    lab.tab = "transfer";
    document.dispatchEvent(new CustomEvent("physics-learning-event", {
      detail: {
        type: "attempt-completed",
        questionId: question.id,
        gradingStatus: attempt.grading.status,
        hintLevel: attempt.hintLevel,
        durationSeconds: attempt.durationSeconds
      }
    }));
    renderPanel();
  }

  function saveTransferRecord(index) {
    const question = getQuestion(lab.selectedQuestionId);
    const response = document.getElementById(`transferResponse${index}`)?.value.trim();
    if (!question || response.length < 20) {
      showLabMessage("请至少写出迁移情境中的研究对象、适用条件和关键方程。", true);
      return;
    }
    const variant = engine.transferVariants(question)[index];
    const existing = lab.state.experimentRecords.find((record) => {
      return record.type === "transfer"
        && record.questionId === question.id
        && record.variantIndex === index
        && record.profileId === lab.state.activeProfileId;
    });
    if (existing) {
      existing.response = response;
      existing.variantType = variant?.type || "";
      existing.variantTitle = variant?.title || "";
      existing.verificationStatus = "待学习者或教师复核";
      existing.updatedAt = new Date().toISOString();
    } else {
      lab.state.experimentRecords.push({
        id: engine.createId("transfer"),
        type: "transfer",
        profileId: lab.state.activeProfileId,
        questionId: question.id,
        variantIndex: index,
        variantType: variant?.type || "",
        variantTitle: variant?.title || "",
        response,
        verificationStatus: "待学习者或教师复核",
        createdAt: new Date().toISOString()
      });
    }
    if (lab.lastCompleted?.attempt?.questionId === question.id && !lab.lastCompleted.review) {
      lab.lastCompleted.review = engine.scheduleReview(
        lab.state,
        question.id,
        lab.lastCompleted.automaticRating
      );
    }
    saveLearningState();
    document.dispatchEvent(new CustomEvent("physics-learning-event", {
      detail: { type: "transfer-completed", questionId: question.id, variantIndex: index }
    }));
    if (lab.lastCompleted?.review) lab.tab = "review";
    renderPanel();
  }

  function playModel() {
    stopModelAnimation();
    const start = performance.now();
    const duration = lab.modelType === "projectile"
      ? 2 * lab.modelParams.projectile.v0 * Math.sin(lab.modelParams.projectile.angle * Math.PI / 180) / lab.modelParams.projectile.g
      : 5;
    const animate = (now) => {
      const elapsed = (now - start) / 1000;
      const loopTime = elapsed % Math.max(0.1, duration);
      lab.modelParams[lab.modelType].t = loopTime;
      const input = lab.content.querySelector('[data-model-param="t"]');
      if (input) input.value = loopTime;
      updateModelOutput();
      lab.animationFrame = requestAnimationFrame(animate);
    };
    lab.animationFrame = requestAnimationFrame(animate);
  }

  function stopModelAnimation() {
    if (lab.animationFrame) cancelAnimationFrame(lab.animationFrame);
    lab.animationFrame = 0;
  }

  function startSessionTimer() {
    stopSessionTimer();
    const update = () => {
      const timer = document.getElementById("sessionTimer");
      if (!timer || !lab.session) return;
      timer.textContent = formatDuration((Date.now() - lab.session.startedAt) / 1000);
    };
    update();
    lab.sessionTimer = window.setInterval(update, 1000);
  }

  function stopSessionTimer() {
    if (lab.sessionTimer) window.clearInterval(lab.sessionTimer);
    lab.sessionTimer = 0;
  }

  function resetModel() {
    lab.modelParams = {
      ...lab.modelParams,
      [lab.modelType]: lab.modelType === "projectile"
        ? { v0: 20, angle: 45, g: 9.8, t: 1 }
        : lab.modelType === "incline"
          ? { mass: 2, angle: 30, mu: 0.2, g: 9.8, t: 1 }
          : { voltage: 12, r1: 10, r2: 20, mode: "series" }
    };
    renderPanel();
  }

  function checkDimensionTool() {
    const equation = document.getElementById("dimensionEquation")?.value || "";
    const result = engine.validateDimension(equation);
    const target = document.getElementById("dimensionResult");
    target.className = `tool-result ${result.valid ? "success" : "warning"}`;
    target.innerHTML = `<strong>${escapeHtml(result.status)}</strong><p>${escapeHtml(result.message)}</p>`;
  }

  function convertUnitTool() {
    const target = document.getElementById("unitResult");
    try {
      const value = Number(document.getElementById("unitValue")?.value);
      const from = document.getElementById("unitFrom")?.value;
      const to = document.getElementById("unitTo")?.value;
      const result = engine.convertUnit(value, from, to);
      target.className = "tool-result success";
      target.innerHTML = `<strong>${formatNumber(value)} ${escapeHtml(from)} = ${formatNumber(result, 6)} ${escapeHtml(to)}</strong><p>已按单位定义换算；计算题仍需遵守题设有效数字要求。</p>`;
    } catch (error) {
      target.className = "tool-result warning";
      target.textContent = error.message;
    }
  }

  function calculateVectorTool() {
    const x = Number(document.getElementById("vectorX")?.value);
    const y = Number(document.getElementById("vectorY")?.value);
    const magnitude = Math.hypot(x, y);
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    document.getElementById("vectorResult").innerHTML = `
      <strong>|A| = ${formatNumber(magnitude)}；方向角 θ = ${formatNumber(angle)}°</strong>
      <p>方向角从 x 轴正方向逆时针量取，范围由 atan2 给出。</p>`;
  }

  function fitGraphTool() {
    const raw = document.getElementById("graphData")?.value || "";
    const points = raw.split(/\r?\n/).map((line) => {
      const [x, y] = line.split(/[,，\s]+/).map(Number);
      return { x, y };
    }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const target = document.getElementById("graphResult");
    if (points.length < 2) {
      target.innerHTML = '<div class="tool-result warning">至少需要两组有效的 x,y 数据。</div>';
      return;
    }
    const regression = engine.linearRegression(points);
    target.innerHTML = `
      ${scatterPlot(points, regression)}
      <div class="tool-result success">
        <strong>y = ${formatNumber(regression.slope, 5)}x ${regression.intercept >= 0 ? "+" : "−"} ${formatNumber(Math.abs(regression.intercept), 5)}</strong>
        <p>R² = ${formatNumber(regression.r2, 5)}；样本数 n = ${regression.count}。拟合优度不能替代残差、系统误差和物理模型检查。</p>
      </div>`;
  }

  function filterQuestionPicker(query) {
    const normalized = String(query || "").trim().toLocaleLowerCase("zh-CN");
    document.querySelectorAll("#labQuestionPickerList > article").forEach((card) => {
      card.classList.toggle("hidden", normalized && !card.dataset.questionSearch.includes(normalized));
    });
  }

  function filterFormulas(query) {
    const normalized = String(query || "").trim().toLocaleLowerCase("zh-CN");
    document.querySelectorAll("#formulaList > article").forEach((card) => {
      card.classList.toggle("hidden", normalized && !card.dataset.formulaSearch.includes(normalized));
    });
  }

  function setupSketchCanvas() {
    const canvas = document.getElementById("labSketchCanvas");
    if (!canvas || canvas.dataset.ready) return;
    canvas.dataset.ready = "true";
    const context = canvas.getContext("2d");
    context.fillStyle = "#fffdf6";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(21,93,68,.09)";
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 30) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 30) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
    }
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    };
    let drawing = false;
    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const current = point(event);
      context.beginPath();
      context.moveTo(current.x, current.y);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const current = point(event);
      context.strokeStyle = document.getElementById("sketchColor")?.value || "#155d44";
      context.lineWidth = Number(document.getElementById("sketchWidth")?.value || 3);
      context.lineCap = "round";
      context.lineTo(current.x, current.y);
      context.stroke();
    });
    const stop = () => { drawing = false; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    lab.sketch = { canvas, context };
  }

  function clearSketch() {
    const canvas = lab.sketch?.canvas;
    if (!canvas) return;
    canvas.dataset.ready = "";
    setupSketchCanvas();
  }

  function exportSketch() {
    const canvas = lab.sketch?.canvas;
    if (!canvas) return;
    const type = document.getElementById("sketchType")?.value || "物理图示";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${type}-${dateFileName()}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function generateAssignment() {
    const assignment = engine.generateAssignment(getQuestions(), {
      title: document.getElementById("assignmentTitle")?.value.trim(),
      stage: document.getElementById("assignmentStage")?.value,
      grade: document.getElementById("assignmentGrade")?.value,
      topic: document.getElementById("assignmentTopic")?.value,
      difficulty: document.getElementById("assignmentDifficulty")?.value,
      count: Number(document.getElementById("assignmentCount")?.value)
    });
    if (!assignment.questionCount) {
      showLabMessage("当前条件下没有完整且可用于组卷的题目。", true);
      return;
    }
    lab.state.assignments.push(assignment);
    saveLearningState();
    renderPanel();
  }

  function exportAssignment(assignmentId) {
    const assignment = lab.state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    const questionMap = new Map(getQuestions().map((question) => [question.id, question]));
    const payload = {
      format: "physics-teacher-assignment",
      version: 1,
      exportedAt: new Date().toISOString(),
      assignment,
      questions: assignment.questionIds.map((id) => questionMap.get(id)).filter(Boolean).map((question) => ({
        id: question.id,
        title: question.title,
        stage: question.stage,
        grade: question.grade,
        topic: question.topic,
        difficulty: question.difficulty,
        content: question.content,
        examPoints: question.examPoints || [],
        source: question.source,
        sourceLicense: question.sourceLicense,
        solution: question.solution,
        answer: question.answer
      }))
    };
    downloadText(`${safeFileName(assignment.title)}-${dateFileName()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  async function solveWithAi() {
    captureSessionForm();
    const question = getQuestion(lab.selectedQuestionId);
    if (!question || !lab.session) return;
    lab.aiResult = null;
    lab.aiStatusMessage = "正在请求受控服务端进行分步解答和物理校验……";
    renderPanel();
    try {
      lab.aiResult = await window.PhysicsStudioAITutor.solveQuestion({
        question,
        studentWork: [
          lab.session.model?.equations,
          lab.session.finalAnswer,
          lab.session.reflection
        ].filter(Boolean).join("\n"),
        hintLevelUsed: lab.session.hintLevel
      });
      lab.aiStatusMessage = "结构化解答已返回；请继续核对题设条件和教师复核标记。";
    } catch (error) {
      lab.aiStatusMessage = `ChatGPT 解题失败：${error.message}`;
    }
    renderPanel();
  }

  function saveAiConfig() {
    try {
      const config = window.PhysicsStudioAITutor.saveConfig({
        endpoint: document.getElementById("aiGatewayEndpoint")?.value || "",
        model: document.getElementById("aiGatewayModel")?.value || "gpt-5.6-sol",
        accessToken: document.getElementById("aiGatewayAccessToken")?.value || "",
        enabled: document.getElementById("aiGatewayEnabled")?.checked
      });
      lab.aiStatusMessage = config.enabled
        ? "受控服务端设置已保存。客户端未保存 API 密钥。"
        : "已切换为离线规则模式。";
      renderPanel();
    } catch (error) {
      lab.aiStatusMessage = `设置未保存：${error.message}`;
      renderPanel();
    }
  }

  async function testAiConfig() {
    saveAiConfig();
    if (!window.PhysicsStudioAITutor.status().ready) return;
    lab.aiStatusMessage = "正在测试受控服务端……";
    renderPanel();
    try {
      const ok = await window.PhysicsStudioAITutor.testConnection();
      lab.aiStatusMessage = ok ? "服务端连接正常。" : "服务端响应未确认可用。";
    } catch (error) {
      lab.aiStatusMessage = `连接测试失败：${error.message}`;
    }
    renderPanel();
  }

  async function analyzeQuestionDocument(file) {
    if (!file) return;
    const context = {
      stage: document.getElementById("documentImportStage")?.value || "初中",
      grade: document.getElementById("documentImportGrade")?.value || "八年级",
      source: document.getElementById("documentImportSource")?.value.trim() || file.name,
      rightsConfirmed: document.getElementById("documentImportRights")?.checked
    };
    if (!context.rightsConfirmed) {
      showLabMessage("请先确认有权上传并在本机教学中使用该文件。", true);
      return;
    }
    lab.pendingDocumentImport = null;
    lab.documentImportStatus = `正在解析 ${file.name}……`;
    renderPanel();
    try {
      const result = await window.PhysicsStudioDocumentImport.analyze(file, context);
      lab.pendingDocumentImport = {
        ...result,
        context,
        originalFileName: file.name
      };
      lab.documentImportStatus = result.questions.length
        ? `已得到 ${result.questions.length} 道候选题，尚未写入题库。`
        : result.warnings?.join(" ") || "未提取到候选题。";
    } catch (error) {
      lab.documentImportStatus = `文档解析失败：${error.message}`;
    }
    renderPanel();
  }

  async function importParsedDocumentQuestions() {
    const result = lab.pendingDocumentImport;
    if (!result) return;
    if (!document.getElementById("documentReviewConfirmed")?.checked) {
      showLabMessage("请先确认已对照原文件完成核对。", true);
      return;
    }
    const records = [...lab.content.querySelectorAll("[data-document-question]")]
      .filter((node) => node.querySelector('[data-doc-field="selected"]')?.checked)
      .map((node, index) => {
        const field = (name) => node.querySelector(`[data-doc-field="${name}"]`)?.value.trim() || "";
        const grade = result.context.grade;
        return {
          id: engine.createId("document-question"),
          title: field("title"),
          stage: ["八年级", "九年级"].includes(grade) ? "初中" : "高中",
          grade,
          topic: field("topic") || "待教师核对",
          difficulty: "进阶",
          content: field("content"),
          solution: field("solution") || "待教师补充清晰解析。",
          answer: field("answer"),
          examPoints: field("examPoints").split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean).slice(0, 20),
          source: result.context.source || result.originalFileName,
          sourceUrl: "",
          sourceLicense: "用户确认有权上传；再发行状态待核验",
          collection: "teacher-document-import",
          originalFileName: result.originalFileName,
          recognitionStatus: result.parser,
          fullTextIncluded: true,
          contentReviewStatus: "待教师审核",
          metadataReviewStatus: "文档解析后人工确认，仍需教师审核",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      })
      .filter((record) => record.title && record.content);
    if (!records.length) {
      showLabMessage("没有勾选内容完整的候选题。", true);
      return;
    }
    try {
      const outcome = await lab.app.importQuestionBatch(records, { reviewStatus: "待教师审核" });
      lab.pendingDocumentImport = null;
      lab.documentImportStatus = `已加入 ${outcome.added.length} 道候选题；${outcome.skipped.length} 道跳过。`;
      renderPanel();
    } catch (error) {
      showLabMessage(`导入失败：${error.message}`, true);
    }
  }

  async function importContentPack(file) {
    if (!file) return;
    lab.contentPackStatus = `正在校验 ${file.name}……`;
    renderPanel();
    try {
      const pack = await window.PhysicsStudioContentCatalog.parseContentPack(file);
      const outcome = await lab.app.importQuestionBatch(pack.questions, { reviewStatus: "待教师审核" });
      lab.contentPackStatus = `内容包“${pack.manifest.title}”通过结构和哈希检查：导入 ${outcome.added.length} 道，跳过 ${outcome.skipped.length} 道。所有新题仍在教师审核队列。`;
    } catch (error) {
      lab.contentPackStatus = `内容包未导入：${error.message}`;
    }
    renderPanel();
  }

  function readStudentProfileForm() {
    const grade = document.getElementById("managedStudentGrade")?.value || "高一";
    return {
      name: document.getElementById("managedStudentName")?.value.trim() || "新学生",
      grade,
      stage: ["八年级", "九年级"].includes(grade) ? "初中" : "高中",
      subject: "物理",
      goal: document.getElementById("managedStudentGoal")?.value || "日常巩固",
      analysisNote: document.getElementById("managedStudentAnalysis")?.value.trim() || ""
    };
  }

  function previewTargetedPlan() {
    try {
      const profileId = lab.managedStudentId || lab.state.activeProfileId;
      lab.planPreview = engine.buildTargetedLearningPlan(lab.state, getQuestions(), {
        profileId,
        focusTopic: document.getElementById("targetedPlanTopic")?.value,
        count: Number(document.getElementById("targetedPlanCount")?.value),
        teacherNote: document.getElementById("targetedPlanNote")?.value
      });
      renderPanel();
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function approveTargetedPlan() {
    try {
      if (!lab.planPreview || lab.planPreview.profileId !== lab.managedStudentId) {
        throw new Error("请先为当前学生生成方案预览。");
      }
      engine.saveTargetedLearningPlan(lab.state, lab.planPreview);
      lab.state.activeProfileId = lab.managedStudentId;
      lab.planPreview = null;
      saveLearningState();
      showLabMessage("专项方案已下发；学生首页将优先显示该方案。");
      renderPanel();
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function saveStudentProfile(createNew) {
    try {
      const input = readStudentProfileForm();
      const profile = createNew
        ? engine.addProfile(lab.state, input)
        : engine.updateProfile(lab.state, lab.managedStudentId || lab.state.activeProfileId, input);
      lab.state.activeProfileId = profile.id;
      lab.managedStudentId = profile.id;
      lab.planPreview = null;
      saveLearningState();
      showLabMessage(createNew ? "学生档案已新增。" : "学生档案已保存。");
      renderPanel();
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function selectStudentProfile(profileId) {
    if (!lab.state.profiles.some((profile) => profile.id === profileId)) return;
    lab.state.activeProfileId = profileId;
    lab.managedStudentId = profileId;
    lab.planPreview = null;
    saveLearningState();
    renderPanel();
  }

  function removeStudentProfile(profileId) {
    const profile = lab.state.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    if (!window.confirm(`删除“${profile.name}”及其本机学习、试卷和成长记录？此操作不可撤销。`)) return;
    try {
      engine.deleteProfile(lab.state, profileId);
      if (lab.managedStudentId === profileId) lab.managedStudentId = "";
      lab.planPreview = null;
      saveLearningState();
      renderPanel();
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function saveExamRecord() {
    try {
      engine.addExamRecord(lab.state, {
        title: document.getElementById("examRecordTitle")?.value,
        examDate: document.getElementById("examRecordDate")?.value,
        score: document.getElementById("examRecordScore")?.value,
        totalScore: document.getElementById("examRecordTotal")?.value,
        weakTopics: document.getElementById("examRecordWeakTopics")?.value,
        note: document.getElementById("examRecordNote")?.value,
        sourceFileName: ""
      });
      saveLearningState();
      showLabMessage("试卷记录已加入成长档案。");
      renderPanel();
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function exportExamRecords() {
    const profile = engine.activeProfile(lab.state);
    const records = lab.state.examRecords.filter((record) => record.profileId === profile.id);
    const payload = {
      format: "physics-exam-records",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: { name: profile.name, grade: profile.grade, subject: "物理" },
      records: records.map(({ id, profileId, ...record }) => record)
    };
    downloadText(`物理试卷记录-${safeFileName(profile.name)}-${dateFileName()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  async function importExamRecordFile(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("试卷记录文件不能超过 5 MB。");
      const payload = JSON.parse(await file.text());
      if (payload?.format !== "physics-exam-records" || Number(payload.version) !== 1 || !Array.isArray(payload.records)) {
        throw new Error("不是受支持的试卷记录文件。");
      }
      const result = engine.importExamRecords(lab.state, payload.records);
      saveLearningState();
      showLabMessage(`导入 ${result.added.length} 条试卷记录；${result.errors.length} 条无效记录已跳过。`, !result.added.length);
      renderPanel();
    } catch (error) {
      showLabMessage(`试卷记录导入失败：${error.message}`, true);
    }
  }

  function saveGrowthRecord() {
    try {
      const title = document.getElementById("growthRecordTitle")?.value.trim();
      const detail = document.getElementById("growthRecordDetail")?.value.trim();
      if (!title || !detail) throw new Error("请填写成长记录标题和事实证据。");
      engine.addGrowthRecord(lab.state, { title, detail, type: "teacher-note" });
      saveLearningState();
      renderPanel();
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function exportStudentReportHtml() {
    const report = engine.createReportPayload(lab.state, getQuestions());
    const analysis = report.analysis;
    const profile = report.profile;
    const rows = analysis.weakest.map((topic) => `
      <tr><td>${escapeHtml(topic.topic)}</td><td>${topic.attempts}</td><td>${topic.accuracy}%</td><td>${topic.averageHint}</td><td>${topic.modeling}</td></tr>`).join("");
    const timeline = engine.growthTimeline(lab.state, profile.id, 30).map((item) => `
      <li><time>${escapeHtml(formatDate(item.date))}</time><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(profile.name)}物理学情分析报告</title>
      <style>body{font:16px/1.7 system-ui,sans-serif;color:#1c2824;max-width:920px;margin:40px auto;padding:0 24px}h1,h2{color:#174f3e}header{border-bottom:3px solid #174f3e;margin-bottom:24px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metrics div{background:#f2f6f1;padding:16px;border-radius:10px}.metrics strong{display:block;font-size:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd8d2;padding:8px;text-align:left}li{margin:8px 0}li strong,li span{display:block}.boundary{background:#fff4dc;padding:14px;border-left:4px solid #986115}@media print{body{margin:0}.no-print{display:none}}</style>
      </head><body><header><h1>物理学情分析报告</h1><p>${escapeHtml(profile.name)} · ${escapeHtml(profile.grade)} · 物理</p><p>生成时间：${escapeHtml(new Date(report.exportedAt).toLocaleString("zh-CN"))}</p></header>
      <section class="metrics"><div><strong>${report.summary.completed}</strong>正式作答</div><div><strong>${report.summary.accuracy}%</strong>正确率</div><div><strong>${report.summary.independenceRate}%</strong>独立完成率</div><div><strong>${report.summary.averageHint}</strong>平均提示等级</div></section>
      <h2>分析结论</h2><p>${escapeHtml(analysis.conclusion)}</p><h2>下一步建议</h2><ol>${analysis.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      <h2>薄弱知识点证据</h2><table><thead><tr><th>知识点</th><th>次数</th><th>正确率</th><th>平均提示</th><th>建模</th></tr></thead><tbody>${rows || "<tr><td colspan=\"5\">暂无足够记录</td></tr>"}</tbody></table>
      <h2>成长时间线</h2><ul>${timeline || "<li>暂无记录</li>"}</ul><p class="boundary">${escapeHtml(analysis.boundary)}</p></body></html>`;
    downloadText(`物理学情分析报告-${safeFileName(profile.name)}-${dateFileName()}.html`, html, "text/html");
  }

  function exportProfile() {
    const payload = engine.createReportPayload(lab.state, getQuestions());
    downloadText(`物理学习档案-${safeFileName(payload.profile.name)}-${dateFileName()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  async function importProfile(file) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("学习档案不能超过 20 MB");
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== "physics-learning-profile" || !parsed.profile || !Array.isArray(parsed.attempts)) {
        throw new Error("文件不是有效的物理学习档案");
      }
      if (parsed.attempts.length > 10000) throw new Error("学习档案作答记录超过 10000 条上限");
      const profile = engine.addProfile(lab.state, {
        name: `${String(parsed.profile.name || "导入学生").slice(0, 24)}（导入）`,
        grade: parsed.profile.grade,
        goal: parsed.profile.goal,
        analysisNote: parsed.profile.analysisNote
      });
      const profileId = profile.id;
      parsed.attempts.forEach((attempt) => {
        lab.state.attempts.push({ ...attempt, id: engine.createId("attempt"), profileId });
      });
      if (Array.isArray(parsed.examRecords)) {
        engine.importExamRecords(lab.state, parsed.examRecords.slice(0, 500), profileId);
      }
      if (Array.isArray(parsed.growthRecords)) {
        parsed.growthRecords.slice(0, 500).forEach((record) => {
          engine.addGrowthRecord(lab.state, { ...record, profileId });
        });
      }
      lab.state.activeProfileId = profileId;
      saveLearningState();
      renderPanel();
    } catch (error) {
      showLabMessage(error.message || "学习档案导入失败。", true);
    }
  }

  async function importStudentReports(files) {
    let imported = 0;
    for (const file of files) {
      try {
        const parsed = JSON.parse(await file.text());
        if (parsed.format !== "physics-learning-profile" || !parsed.summary) continue;
        lab.state.importedReports.push({
          id: engine.createId("student-report"),
          profile: parsed.profile,
          summary: parsed.summary,
          importedAt: new Date().toISOString()
        });
        imported += 1;
      } catch (error) {
        console.warn("忽略无效学生档案", file.name, error);
      }
    }
    saveLearningState();
    showLabMessage(`已导入 ${imported} 份有效学习档案。`, imported === 0);
    renderPanel();
  }

  function aggregateImportedReports() {
    const map = new Map();
    lab.state.importedReports.forEach((report) => {
      (report.summary?.topics || []).forEach((topic) => {
        const current = map.get(topic.topic) || { topic: topic.topic, students: 0, scoreTotal: 0 };
        current.students += 1;
        current.scoreTotal += Number(topic.averageScore ?? topic.accuracy) || 0;
        map.set(topic.topic, current);
      });
    });
    return [...map.values()].map((item) => ({
      ...item,
      score: item.students ? Math.round(item.scoreTotal / item.students) : 0
    })).sort((a, b) => a.score - b.score);
  }

  async function startSensor(kind) {
    stopAllSensors(false);
    if (kind === "motion") await startMotionSensor();
    else if (kind === "microphone") await startMicrophone();
    else if (kind === "light") startGenericSensor("light", window.AmbientLightSensor, "照度", "lx", (sensor) => sensor.illuminance);
    else if (kind === "magnet") startGenericSensor("magnet", window.Magnetometer, "磁感应强度", "μT", (sensor) => Math.hypot(sensor.x, sensor.y, sensor.z));
  }

  async function startMotionSensor() {
    try {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") throw new Error("未获得运动传感器权限");
      }
      lab.motionSamples = [];
      const start = performance.now();
      lab.motionHandler = (event) => {
        const acceleration = event.accelerationIncludingGravity || event.acceleration;
        if (!acceleration) return;
        const x = Number(acceleration.x) || 0;
        const y = Number(acceleration.y) || 0;
        const z = Number(acceleration.z) || 0;
        lab.motionSamples.push({
          t: (performance.now() - start) / 1000,
          x,
          y,
          z,
          value: Math.hypot(x, y, z)
        });
        if (lab.motionSamples.length > 1500) lab.motionSamples.shift();
        if (performance.now() - lab.motionRenderAt > 160) {
          lab.motionRenderAt = performance.now();
          renderMotionChart("加速度合量", "m/s²");
        }
      };
      window.addEventListener("devicemotion", lab.motionHandler);
      lab.activeSensorLabel = "加速度计";
      setSensorBadge("加速度计采集中", true);
    } catch (error) {
      showLabMessage(`加速度计启动失败：${error.message}`, true);
    }
  }

  async function startMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const samples = [];
      const start = performance.now();
      const update = () => {
        analyser.getByteFrequencyData(data);
        let maxIndex = 1;
        for (let index = 2; index < data.length; index += 1) {
          if (data[index] > data[maxIndex]) maxIndex = index;
        }
        const frequency = maxIndex * context.sampleRate / analyser.fftSize;
        samples.push({ t: (performance.now() - start) / 1000, value: frequency });
        if (samples.length > 800) samples.shift();
        lab.motionSamples = samples;
        renderMotionChart("主峰频率", "Hz");
        lab.audio.frame = requestAnimationFrame(update);
      };
      lab.audio = { stream, context, analyser, source, frame: requestAnimationFrame(update) };
      lab.activeSensorLabel = "麦克风频谱";
      setSensorBadge("麦克风频谱采集中", true);
    } catch (error) {
      showLabMessage(`麦克风启动失败：${error.message}`, true);
    }
  }

  function startGenericSensor(key, SensorClass, label, unit, getValue) {
    try {
      if (!SensorClass) throw new Error("当前浏览器未提供该传感器接口");
      lab.motionSamples = [];
      const start = performance.now();
      const sensor = new SensorClass({ frequency: 20 });
      sensor.addEventListener("reading", () => {
        lab.motionSamples.push({ t: (performance.now() - start) / 1000, value: Number(getValue(sensor)) || 0 });
        if (lab.motionSamples.length > 1000) lab.motionSamples.shift();
        renderMotionChart(label, unit);
      });
      sensor.addEventListener("error", (event) => showLabMessage(`${label}错误：${event.error?.message || "未知错误"}`, true));
      sensor.start();
      lab.genericSensors[key] = sensor;
      lab.activeSensorLabel = label;
      setSensorBadge(`${label}采集中`, true);
    } catch (error) {
      showLabMessage(`${label}启动失败：${error.message}`, true);
    }
  }

  function stopAllSensors(showSummary) {
    if (lab.motionHandler) window.removeEventListener("devicemotion", lab.motionHandler);
    lab.motionHandler = null;
    if (lab.audio) {
      cancelAnimationFrame(lab.audio.frame);
      lab.audio.stream.getTracks().forEach((track) => track.stop());
      lab.audio.context.close();
      lab.audio = null;
    }
    Object.values(lab.genericSensors).forEach((sensor) => sensor.stop?.());
    lab.genericSensors = {};
    setSensorBadge("采集已停止", false);
    if (showSummary) renderMotionChart();
  }

  function renderMotionChart(label = "传感器读数", unit = "") {
    const chart = document.getElementById("sensorChart");
    if (!chart) return;
    const samples = lab.motionSamples.slice(-240);
    const count = document.getElementById("sensorSampleCount");
    if (count) count.textContent = `${lab.motionSamples.length} 个样本`;
    if (samples.length < 2) {
      chart.innerHTML = '<path class="sim-axis" d="M45,235 H730 M45,25 V235"></path><text x="270" y="140">等待至少两个数据点</text>';
      return;
    }
    const values = samples.map((sample) => sample.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1e-6);
    const points = samples.map((sample, index) => {
      const x = 45 + index / (samples.length - 1) * 680;
      const y = 235 - (sample.value - min) / span * 190;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    chart.innerHTML = `
      <path class="sim-axis" d="M45,235 H730 M45,25 V235"></path>
      <polyline class="sensor-line" points="${points}"></polyline>
      <text x="52" y="22">${escapeHtml(label)} / ${escapeHtml(unit)}</text>
      <text x="4" y="40">${formatNumber(max)}</text>
      <text x="4" y="235">${formatNumber(min)}</text>`;
    const average = engine.mean(values);
    const deviation = engine.standardDeviation(values);
    const summary = document.getElementById("sensorSummary");
    if (summary) summary.innerHTML = `<article><span>均值</span><strong>${formatNumber(average)} ${escapeHtml(unit)}</strong></article><article><span>样本标准差</span><strong>${formatNumber(deviation)} ${escapeHtml(unit)}</strong></article><article><span>极差</span><strong>${formatNumber(max - min)} ${escapeHtml(unit)}</strong></article>`;
  }

  function setSensorBadge(text, active) {
    const badge = document.getElementById("sensorLiveBadge");
    if (!badge) return;
    badge.classList.toggle("active", active);
    const label = badge.querySelector("span");
    if (label) label.textContent = text;
  }

  function exportSensorCsv() {
    if (!lab.motionSamples.length) {
      showLabMessage("当前没有可导出的传感器数据。", true);
      return;
    }
    const columns = ["t", "x", "y", "z", "value"];
    const csv = [
      columns.join(","),
      ...lab.motionSamples.map((sample) => columns.map((column) => sample[column] ?? "").join(","))
    ].join("\n");
    downloadText(`物理传感器数据-${dateFileName()}.csv`, csv, "text/csv");
  }

  function saveExperimentRecord() {
    const hypothesis = document.getElementById("experimentHypothesis")?.value.trim();
    const variables = document.getElementById("experimentVariables")?.value.trim();
    const conclusion = document.getElementById("experimentConclusion")?.value.trim();
    if (!hypothesis || !variables || !conclusion) {
      showLabMessage("请完整填写假设、变量控制和数据结论。", true);
      return;
    }
    const values = lab.motionSamples.map((sample) => sample.value).filter(Number.isFinite);
    lab.state.experimentRecords.push({
      id: engine.createId("experiment"),
      type: "sensor",
      profileId: lab.state.activeProfileId,
      sensorLabel: lab.activeSensorLabel || "传感器实验",
      hypothesis,
      variables,
      conclusion,
      sampleCount: values.length,
      mean: engine.mean(values),
      standardDeviation: engine.standardDeviation(values),
      createdAt: new Date().toISOString()
    });
    saveLearningState();
    renderPanel();
  }

  function stopAllLiveActivities() {
    stopModelAnimation();
    stopSessionTimer();
    stopAllSensors(false);
  }

  function showLabMessage(message, error = false) {
    let toast = document.getElementById("labToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "labToast";
      toast.className = "lab-toast";
      lab.content.append(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    clearTimeout(toast.hideTimer);
    toast.hideTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function downloadText(filename, content, mimeType) {
    if (window.PhysicsStudioAndroid?.saveTextFile) {
      window.PhysicsStudioAndroid.saveTextFile(filename, content, mimeType);
      showLabMessage("请选择文件保存位置。");
      return;
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function modelField(key, label, placeholder, value) {
    return `<label><span>${label}</span><textarea id="model-${key}" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
  }

  function metricCard(label, value, detail) {
    return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function capability(title, detail, status) {
    const labels = { ready: "已实现", partial: "本地版", planned: "需模型/服务" };
    return `<article class="${status}"><span>${labels[status]}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></article>`;
  }

  function verificationStatusLabel(status) {
    return {
      pass: "自动通过",
      fail: "自动发现问题",
      evidence: "有证据，待复核",
      manual: "需要人工复核"
    }[status] || "待复核";
  }

  function emptyState(title, detail) {
    return `<div class="lab-empty"><span>○</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
  }

  function formulaCard(formula) {
    const search = [formula.name, formula.formula, formula.topic, formula.condition, formula.stage].join(" ").toLocaleLowerCase("zh-CN");
    return `<article data-formula-search="${escapeHtml(search)}"><span>${escapeHtml(formula.stage)} · ${escapeHtml(formula.topic)}</span><h4>${escapeHtml(formula.name)}</h4><strong>${escapeHtml(formula.formula)}</strong><p>${escapeHtml(formula.condition)}</p></article>`;
  }

  function miniFunctionGraph(title, maxX, maxY, fn, currentX, signed = false) {
    const width = 250;
    const height = 145;
    const pad = 24;
    const samples = [];
    const values = [];
    for (let index = 0; index <= 50; index += 1) {
      const x = maxX * index / 50;
      values.push(fn(x));
    }
    const minimum = signed ? Math.min(...values, 0) : 0;
    const maximum = Math.max(...values, maxY, 1e-6);
    const span = Math.max(maximum - minimum, 1e-6);
    values.forEach((value, index) => {
      const px = pad + index / 50 * (width - pad * 2);
      const py = height - pad - (value - minimum) / span * (height - pad * 2);
      samples.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    });
    const cursorX = pad + clamp(currentX / Math.max(maxX, 0.001), 0, 1) * (width - pad * 2);
    return `<article class="mini-graph"><strong>${escapeHtml(title)}</strong><svg viewBox="0 0 ${width} ${height}"><path class="sim-axis" d="M${pad},${height - pad} H${width - pad} M${pad},${pad} V${height - pad}"></path><polyline points="${samples.join(" ")}"></polyline><line class="graph-cursor" x1="${cursorX}" x2="${cursorX}" y1="${pad}" y2="${height - pad}"></line></svg></article>`;
  }

  function energyBars(kinetic, potential, total) {
    return `<article class="energy-graph"><strong>单位质量机械能</strong><div><span>动能<i style="height:${kinetic / total * 100}%"></i><small>${formatNumber(kinetic)}</small></span><span>势能<i style="height:${potential / total * 100}%"></i><small>${formatNumber(potential)}</small></span><span>总能<i style="height:100%"></i><small>${formatNumber(total)}</small></span></div></article>`;
  }

  function barMetric(label, value, max, unit) {
    return `<article><span>${escapeHtml(label)}</span><div><i style="width:${value / max * 100}%"></i></div><strong>${formatNumber(value)} ${unit}</strong></article>`;
  }

  function seriesCircuitSvg(voltage, r1, r2, current) {
    return `<svg class="main-simulation circuit-svg" viewBox="0 0 650 280" role="img" aria-label="串联电路"><path class="wire" d="M120,70 H260 M360,70 H500 V220 H350 M250,220 H120 V70"></path><line class="battery-long" x1="250" y1="195" x2="250" y2="245"></line><line class="battery-short" x1="275" y1="205" x2="275" y2="235"></line><rect class="resistor" x="260" y="48" width="100" height="44" rx="4"></rect><text x="290" y="75">R₁=${formatNumber(r1)}Ω</text><rect class="resistor" x="350" y="198" width="100" height="44" rx="4"></rect><text x="380" y="225">R₂=${formatNumber(r2)}Ω</text><circle class="current-dot" cx="180" cy="70" r="7"></circle><text x="120" y="45">I=${formatNumber(current)}A</text><text x="210" y="270">U=${formatNumber(voltage)}V</text></svg>`;
  }

  function parallelCircuitSvg(voltage, r1, r2, i1, i2) {
    return `<svg class="main-simulation circuit-svg" viewBox="0 0 650 280" role="img" aria-label="并联电路"><path class="wire" d="M120,55 H520 V225 H300 M250,225 H120 V55 M220,55 V120 H430 V55 M220,120 V190 H430 V120"></path><line class="battery-long" x1="250" y1="200" x2="250" y2="250"></line><line class="battery-short" x1="278" y1="210" x2="278" y2="240"></line><rect class="resistor" x="265" y="98" width="120" height="44" rx="4"></rect><text x="292" y="125">R₁=${formatNumber(r1)}Ω</text><rect class="resistor" x="265" y="168" width="120" height="44" rx="4"></rect><text x="292" y="195">R₂=${formatNumber(r2)}Ω</text><text x="438" y="105">I₁=${formatNumber(i1)}A</text><text x="438" y="175">I₂=${formatNumber(i2)}A</text><text x="210" y="270">U=${formatNumber(voltage)}V</text></svg>`;
  }

  function radarChart(axes) {
    const width = 360;
    const height = 300;
    const cx = 180;
    const cy = 150;
    const radius = 105;
    const point = (index, ratio) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
      return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
    };
    const rings = [0.25, 0.5, 0.75, 1].map((ratio) => axes.map((_, index) => point(index, ratio).join(",")).join(" "));
    const polygon = axes.map((axis, index) => point(index, axis.value / 100).join(",")).join(" ");
    return `<svg class="radar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="建模能力雷达图">${rings.map((ring) => `<polygon class="radar-ring" points="${ring}"></polygon>`).join("")}${axes.map((axis, index) => { const [x, y] = point(index, 1); const [tx, ty] = point(index, 1.18); return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"></line><text x="${tx}" y="${ty}" text-anchor="middle">${escapeHtml(axis.label)}</text>`; }).join("")}<polygon class="radar-value" points="${polygon}"></polygon></svg>`;
  }

  function trendChart(trend) {
    if (!trend.length) return emptyState("尚无趋势数据", "完成至少一次可自动判定的训练后显示。");
    const width = 520;
    const height = 260;
    const pad = 36;
    const points = trend.map((item, index) => {
      const x = trend.length === 1 ? width / 2 : pad + index / (trend.length - 1) * (width - pad * 2);
      const y = height - pad - item.score / 100 * (height - pad * 2);
      return { x, y, ...item };
    });
    return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="学习得分趋势"><path class="sim-axis" d="M${pad},${height - pad} H${width - pad} M${pad},${pad} V${height - pad}"></path><polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"></polyline>${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5"><title>得分 ${point.score}%，提示 ${point.hintLevel} 级</title></circle>`).join("")}<text x="4" y="${pad + 4}">100</text><text x="14" y="${height - pad}">0</text></svg>`;
  }

  function scatterPlot(points, regression) {
    const width = 520;
    const height = 280;
    const pad = 38;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sx = (x) => pad + (x - minX) / Math.max(maxX - minX, 1e-9) * (width - pad * 2);
    const sy = (y) => height - pad - (y - minY) / Math.max(maxY - minY, 1e-9) * (height - pad * 2);
    const lineY1 = regression.slope * minX + regression.intercept;
    const lineY2 = regression.slope * maxX + regression.intercept;
    return `<svg class="scatter-chart" viewBox="0 0 ${width} ${height}"><path class="sim-axis" d="M${pad},${height - pad} H${width - pad} M${pad},${pad} V${height - pad}"></path><line class="fit-line" x1="${sx(minX)}" y1="${sy(lineY1)}" x2="${sx(maxX)}" y2="${sy(lineY2)}"></line>${points.map((point) => `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="6"><title>(${point.x}, ${point.y})</title></circle>`).join("")}</svg>`;
  }

  function roleLabel(role) {
    return { student: "学生", teacher: "教师", parent: "家长" }[role] || "学生";
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日期未知";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function formatNumber(value, digits = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    if (number !== 0 && (Math.abs(number) >= 1e5 || Math.abs(number) < 1e-3)) return number.toExponential(Math.min(3, digits));
    return Number(number.toFixed(digits)).toString();
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function dateFileName() {
    const date = new Date();
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  }

  function safeFileName(value) {
    return String(value || "文件").replace(/[\\/:*?"<>|]/g, "-").slice(0, 50);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
