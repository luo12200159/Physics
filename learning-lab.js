(() => {
  "use strict";

  const engine = window.PHYSICS_LEARNING_ENGINE;
  if (!engine) {
    console.error("学习实验室未启动：缺少学习引擎。");
    return;
  }

  const visuals = window.PHYSICS_VISUALS;
  const MODEL_DEFAULTS = Object.freeze({
    projectile: Object.freeze({ v0: 20, angle: 45, g: 9.8, t: 1 }),
    incline: Object.freeze({ mass: 2, angle: 30, mu: 0.2, g: 9.8, t: 1 }),
    circuit: Object.freeze({ voltage: 12, r1: 10, r2: 20, mode: "series" }),
    uniform: Object.freeze({ x0: 0, v0: 5, a: 2, t: 1, duration: 6 }),
    newton: Object.freeze({ mass: 2, appliedForce: 10, opposingForce: 2, v0: 0, t: 1, duration: 5 }),
    energy: Object.freeze({ mass: 2, g: 9.8, initialHeight: 10, height: 6, lossPercent: 0 }),
    collision: Object.freeze({ m1: 1, m2: 2, u1: 4, u2: 0, type: "elastic" }),
    wave: Object.freeze({ speed: 20, frequency: 5, amplitude: 1, t: 0 })
  });
  const MODEL_CATALOG = Object.freeze([
    ["projectile", "平抛/斜抛", "轨迹与能量"],
    ["incline", "斜面动力学", "受力与运动图像"],
    ["circuit", "直流电路", "电流、电压与功率"],
    ["uniform", "匀变速联动图", "x-t、v-t、a-t"],
    ["newton", "牛顿第二定律", "合力、加速度与运动"],
    ["energy", "机械能", "动能、势能与耗散"],
    ["collision", "一维碰撞", "弹性与完全非弹性"],
    ["wave", "波速—频率—波长", "v=fλ 与波形"]
  ]);
  const ANIMATED_MODELS = new Set(["projectile", "incline", "uniform", "newton", "wave"]);

  function freshModelParams() {
    return Object.fromEntries(Object.entries(MODEL_DEFAULTS).map(([key, value]) => [key, { ...value }]));
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
    modelParams: freshModelParams(),
    rayParams: { mode: "refraction", incidenceAngle: 35, n1: 1, n2: 1.5 },
    animationFrame: 0,
    sessionTimer: 0,
    motionHandler: null,
    motionSamples: [],
    motionRenderAt: 0,
    activeSensorLabel: "",
    audio: null,
    genericSensors: {},
    sketch: null,
    renderToken: 0,
    pendingDocumentImport: null,
    documentImportStatus: "",
    contentPackStatus: "",
    aiResult: null,
    aiStatusMessage: "",
    aiSessionState: null,
    managedStudentId: "",
    planPreview: null,
    tieredAssignmentPreview: null,
    assignmentPreview: null,
    studentImportDraft: null,
    examImportDraft: null,
    matrixTopicKey: "",
    advancedToolsOpen: false,
    teacherView: "today",
    storageEstimate: null,
    storageEstimatePending: false,
    // Derived metrics are expensive over the full local question bank. Keep
    // them per learning-state revision so a tab click does not recompute the
    // same evidence summary synchronously.
    derivedLearningCache: null,
    teacherHydrationPending: false,
    teacherHydrated: false,
    teacherViewDrafts: Object.create(null),
    variantTraining: null,
    variantGenerationStatus: ""
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
    return document.body.classList.contains("role-teacher")
      && (!window.PhysicsStudioTeacherLock || window.PhysicsStudioTeacherLock.isUnlocked());
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
      const requestedTab = event.detail?.tab === "transfer" ? "transfer" : "tutor";
      if (event.detail?.variantSetId) {
        lab.variantTraining = { setId: event.detail.variantSetId, order: [], index: 0, session: null, summaryVisible: false };
      }
      openLab(requestedTab, event.detail?.questionId || "");
    });
    document.addEventListener("physics-studio-open-lab", (event) => {
      openLab(event.detail?.tab || "dashboard", event.detail?.questionId || "", event.detail?.diagnosticId || "");
    });
    document.addEventListener("physics-learning-state-changed", (event) => {
      if (!event.detail?.restored) return;
      lab.state = engine.loadState();
      lab.derivedLearningCache = null;
      lab.teacherHydrated = false;
      lab.teacherViewDrafts = Object.create(null);
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
        <main class="lab-panel" id="labPanel" tabindex="0" aria-label="学习实验室内容，使用滚轮或上下方向键浏览"></main>
        <footer class="lab-footer">
          <span><i></i> 离线规则引擎已启用</span>
          <span>自动判定仅覆盖可可靠提取的选项和数值题；解释题会明确要求人工复核。</span>
        </footer>
      </div>`;
    lab.panel = document.getElementById("labPanel");
    renderProfileOptions();
    bindHorizontalScrollers();
  }

  function bindEvents() {
    lab.content.addEventListener("click", handleClick);
    lab.content.addEventListener("input", handleInput);
    lab.content.addEventListener("change", handleChange);
    lab.content.addEventListener("keydown", handleReviewShortcut);
    lab.dialog.addEventListener("cancel", (event) => {
      if (lab.tab === "teacher" && !captureTeacherViewDraft()) {
        event.preventDefault();
        return;
      }
      stopAllLiveActivities();
    });
    lab.dialog.addEventListener("close", stopAllLiveActivities);
  }

  function openLab(tab = "dashboard", questionId = "", diagnosticId = "") {
    lab.app = window.PhysicsStudioApp || lab.app;
    const wasOpen = Boolean(lab.dialog?.open);
    if (questionId) {
      lab.selectedQuestionId = questionId;
      lab.session = null;
      lab.aiResult = null;
      lab.aiStatusMessage = "";
      lab.aiSessionState = null;
    }
    if (tab === "models" && lab.selectedQuestionId) selectModelForQuestion(lab.selectedQuestionId);
    if (diagnosticId && engine.misconceptionCatalog.some((item) => item.diagnostic.id === diagnosticId)) {
      lab.diagnosticId = diagnosticId;
      lab.diagnosticResult = null;
    }
    lab.tab = tab === "teacher" && !isTeacherRole() ? "dashboard" : tab;
    if (!wasOpen) {
      lab.dialog.showModal();
    }
    renderPanel();
    document.body.classList.remove("drawer-open");
  }

  function closeLab() {
    if (lab.tab === "teacher" && !captureTeacherViewDraft()) return;
    stopAllLiveActivities();
    lab.dialog.close();
  }

  function getQuestions() {
    return lab.app?.getQuestions?.() || [];
  }

  function getQuestion(questionId) {
    return getQuestions().find((question) => question.id === questionId) || null;
  }

  function selectModelForQuestion(questionId) {
    const question = getQuestion(questionId);
    const mapped = question && visuals?.modelForQuestion?.(question);
    if (mapped && MODEL_DEFAULTS[mapped]) lab.modelType = mapped;
    return mapped || "";
  }

  function saveLearningState() {
    lab.state = engine.saveState(lab.state);
    lab.derivedLearningCache = null;
    // A save performed inside the open teacher workspace already has an
    // interactive shell on screen. Keep it hydrated so form actions do not
    // flash the opening placeholder again; a later cold open still gets the
    // lightweight first paint.
    lab.teacherHydrated = Boolean(lab.dialog?.open && lab.tab === "teacher");
    renderProfileOptions();
    document.dispatchEvent(new CustomEvent("physics-learning-state-changed", {
      detail: { profileId: lab.state.activeProfileId }
    }));
  }

  function derivedLearningKey(questions) {
    const first = questions[0]?.id || "";
    const last = questions.at(-1)?.id || "";
    return [
      lab.state?.updatedAt || "",
      lab.state?.activeProfileId || "",
      questions.length,
      first,
      last
    ].join("|");
  }

  function getDerivedLearning(questions = getQuestions(), options = {}) {
    const key = derivedLearningKey(questions);
    const wantsCoverage = options.coverage === true;
    const cached = lab.derivedLearningCache;
    if (cached?.key === key && (!wantsCoverage || cached.value.coverage)) return cached.value;
    const value = cached?.key === key ? cached.value : {};
    if (!value.summary) value.summary = engine.summarizeLearning(lab.state, questions);
    if (!value.recommendations) value.recommendations = engine.recommendations(lab.state, questions, 6);
    if (wantsCoverage && !value.coverage) {
      value.coverage = engine.knowledgePointEvidenceSummary(lab.state, questions);
    }
    lab.derivedLearningCache = { key, value };
    return value;
  }

  function renderProfileOptions() {
    const select = document.getElementById("labProfileSelect");
    if (!select) return;
    select.innerHTML = lab.state.profiles.map((profile) => `
      <option value="${escapeHtml(profile.id)}"${profile.id === lab.state.activeProfileId ? " selected" : ""}>
        ${escapeHtml(profile.name)} · ${roleLabel(profile.role)}
      </option>`).join("") + '<option value="__new__">＋ 新建本机档案</option>';
  }

  function bindHorizontalScroller(element) {
    if (!element || element.dataset.dragScrollBound === "true") return;
    element.dataset.dragScrollBound = "true";
    let pointerId = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragged = false;

    const finish = (event) => {
      if (pointerId == null || (event?.pointerId != null && event.pointerId !== pointerId)) return;
      if (dragged) {
        element.dataset.suppressClick = "true";
        window.setTimeout(() => {
          element.dataset.suppressClick = "";
        }, 0);
      }
      try {
        if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
      } catch (_error) {
        // Pointer capture may already have been released by the WebView.
      }
      pointerId = null;
      dragged = false;
      element.classList.remove("is-dragging");
    };

    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScrollLeft = element.scrollLeft;
      dragged = false;
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch (_error) {
        // Older WebViews can omit pointer capture; native scrolling still works.
      }
    });
    element.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const delta = event.clientX - startX;
      if (!dragged && Math.abs(delta) < 4) return;
      dragged = true;
      element.classList.add("is-dragging");
      element.scrollLeft = startScrollLeft - delta;
      event.preventDefault();
    }, { passive: false });
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
    element.addEventListener("lostpointercapture", finish);
    element.addEventListener("click", (event) => {
      if (element.dataset.suppressClick !== "true") return;
      element.dataset.suppressClick = "";
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function bindHorizontalScrollers() {
    lab.content?.querySelectorAll(".lab-tabs, .diagnostic-selector, .model-tabs")
      .forEach((element) => bindHorizontalScroller(element));
  }

  function renderPanel(options = {}) {
    if (!lab.panel) return;
    const previousScrollTop = lab.panel.scrollTop;
    if (lab.dialog) lab.dialog.scrollTop = 0;
    if (lab.content) lab.content.scrollTop = 0;
    if (lab.tab === "teacher" && !isTeacherRole()) lab.tab = "dashboard";
    if (lab.tab === "teacher" && !lab.storageEstimate && !lab.storageEstimatePending) refreshStorageEstimate();
    stopModelAnimation();
    stopSessionTimer();
    lab.content.querySelectorAll("[data-lab-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.labTab === lab.tab);
    });
    const renderToken = ++lab.renderToken;
    lab.panel.setAttribute("aria-busy", "true");
    lab.panel.innerHTML = '<div class="lab-opening-state" role="status">正在加载学习测评…</div>';
    const render = () => {
      if (renderToken !== lab.renderToken || !lab.dialog?.open) return;
      if (lab.tab === "teacher" && !lab.teacherHydrated) {
        lab.panel.innerHTML = renderTeacherOpeningState();
        lab.panel.removeAttribute("aria-busy");
        scheduleTeacherHydration(renderToken);
        return;
      }
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
      lab.panel.innerHTML = renderers[lab.tab]?.() || renderDashboard();
      lab.panel.removeAttribute("aria-busy");
      bindHorizontalScrollers();
      if (lab.tab === "teacher") {
        arrangeTeacherLayout();
        restoreTeacherViewDraft(lab.teacherView);
      }
      if (lab.tab === "models") updateModelOutput();
      if (lab.tab === "tools") requestAnimationFrame(() => {
        setupSketchCanvas();
        updateRayOutput();
      });
      if (lab.tab === "sensors") requestAnimationFrame(() => renderMotionChart());
      if ((lab.tab === "tutor" && lab.session) || (lab.tab === "transfer" && lab.variantTraining?.session)) startSessionTimer();
      if (options.scrollTo || options.preserveScroll) {
        requestAnimationFrame(() => {
          if (!lab.panel) return;
          if (lab.dialog) lab.dialog.scrollTop = 0;
          if (lab.content) lab.content.scrollTop = 0;
          if (options.scrollTo) {
            const target = lab.panel.querySelector(options.scrollTo);
            if (target) {
              const panelBox = lab.panel.getBoundingClientRect();
              const targetBox = target.getBoundingClientRect();
              const centeredOffset = Math.max(16, (lab.panel.clientHeight - Math.min(targetBox.height, lab.panel.clientHeight)) / 2);
              lab.panel.scrollTop = Math.max(0, lab.panel.scrollTop + targetBox.top - panelBox.top - centeredOffset);
            }
          } else {
            lab.panel.scrollTop = previousScrollTop;
          }
          if (lab.dialog) lab.dialog.scrollTop = 0;
          if (lab.content) lab.content.scrollTop = 0;
        });
      }
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(render);
    else window.setTimeout(render, 0);
  }

  function renderTeacherOpeningState() {
    return `<section class="teacher-dashboard-opening" aria-live="polite">
      <nav class="teacher-primary-nav" aria-label="教师中心主导航">
        <button data-teacher-view="today" type="button" class="active" aria-current="page">今日</button>
        <button data-teacher-view="students" type="button">学生</button>
        <button data-teacher-view="class" type="button">班级</button>
        <button data-teacher-view="manage" type="button">管理</button>
      </nav>
      <div class="lab-opening-state" role="status"><strong>正在打开教师中心…</strong><span>先显示操作入口，学情汇总将在后台准备。</span></div>
    </section>`;
  }

  function scheduleTeacherHydration(renderToken) {
    if (lab.teacherHydrationPending) return;
    lab.teacherHydrationPending = true;
    // Keep the first paint interactive on low-end Android WebViews and
    // Windows WebView2. The lightweight "today" view is rendered after the
    // browser has returned control to input handling instead of inside the
    // click event.
    window.setTimeout(() => {
      lab.teacherHydrationPending = false;
      if (!lab.dialog?.open || lab.tab !== "teacher") return;
      lab.teacherHydrated = true;
      renderPanel({ preserveScroll: true });
    }, 80);
  }

  async function refreshStorageEstimate() {
    if (lab.storageEstimatePending || !navigator.storage?.estimate) return;
    lab.storageEstimatePending = true;
    try {
      const estimate = await navigator.storage.estimate();
      const usage = Math.max(0, Number(estimate.usage) || 0);
      const quota = Math.max(0, Number(estimate.quota) || 0);
      lab.storageEstimate = {
        usage,
        quota,
        ratio: quota > 0 ? usage / quota : null,
        remaining: quota > 0 ? Math.max(0, quota - usage) : null,
        checkedAt: new Date().toISOString()
      };
      if (lab.dialog?.open && lab.tab === "teacher") renderPanel({ preserveScroll: true });
    } catch (_error) {
      lab.storageEstimate = { unavailable: true, checkedAt: new Date().toISOString() };
    } finally {
      lab.storageEstimatePending = false;
    }
  }

  function arrangeTeacherLayout() {
    const dashboard = lab.panel?.querySelector(".teacher-dashboard");
    if (!dashboard) return;
    if (dashboard.dataset.teacherRenderMode === "workspace") {
      applyTeacherView();
      return;
    }
    const targetedPlan = dashboard.querySelector(".targeted-plan-card");
    const historyRecords = dashboard.querySelector(".exam-record-card")?.closest(".teacher-records-grid");
    const decisionLoop = dashboard.querySelector(".student-decision-loop");
    if (decisionLoop && targetedPlan) decisionLoop.after(targetedPlan);
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
      dashboard.querySelector(".data-privacy-center"),
      dashboard.querySelector(".document-import-card")?.closest(".teacher-records-grid"),
      dashboard.querySelector(".teacher-grid"),
      dashboard.querySelector(".content-review-list")?.closest(".lab-card"),
      dashboard.querySelector(".assignment-list")?.closest(".lab-card"),
      dashboard.querySelector(".teacher-boundary")
    ].filter(Boolean).forEach((section) => body.append(section));
    applyTeacherView();
  }

  function applyTeacherView() {
    const dashboard = lab.panel?.querySelector(".teacher-dashboard");
    if (!dashboard) return;
    dashboard.querySelectorAll("[data-teacher-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.teacherView === lab.teacherView);
      button.setAttribute("aria-current", button.dataset.teacherView === lab.teacherView ? "page" : "false");
    });
    const viewSelectors = {
      today: [".teacher-todo-card", ".manual-review-workbench", ".teacher-data-health"],
      students: [".teacher-hero", ".student-decision-loop", ".targeted-plan-card", ".student-manager-card", ".student-import-card", ".exam-record-card", ".growth-record-card"],
      class: [".class-matrix-card", ".class-evidence-card", ".teacher-prescription"],
      manage: [".teacher-advanced-tools"]
    };
    const controlled = new Set(Object.values(viewSelectors).flatMap((selectors) => selectors.flatMap((selector) => [...dashboard.querySelectorAll(selector)])));
    controlled.forEach((section) => { section.hidden = true; });
    (viewSelectors[lab.teacherView] || viewSelectors.today).forEach((selector) => {
      dashboard.querySelectorAll(selector).forEach((section) => { section.hidden = false; });
    });
    const advanced = dashboard.querySelector(".teacher-advanced-tools");
    if (advanced && lab.teacherView === "manage") advanced.open = true;
  }

  function teacherWorkspaceFor(view = lab.teacherView) {
    const dashboard = lab.panel?.querySelector('.teacher-dashboard[data-teacher-render-mode="workspace"]');
    return dashboard?.dataset.teacherRenderView === view ? dashboard : null;
  }

  function teacherDraftKey(view = lab.teacherView) {
    const profileContext = view === "students" || view === "manage"
      ? `profile:${lab.managedStudentId || lab.state.activeProfileId || "unbound"}`
      : "shared";
    return `${view}|${profileContext}`;
  }

  function teacherDraftFieldKey(field, index) {
    const documentScopedIds = new Set(["documentReviewConfirmed", "documentImportRights", "documentRemoteUploadConfirmed"]);
    if (documentScopedIds.has(field.id)) {
      const documentDraftToken = lab.pendingDocumentImport?.draftToken || "no-document-draft";
      return `document-confirmation:${documentDraftToken}:${field.id}`;
    }
    if (field.id) return `id:${field.id}`;
    const documentQuestion = field.closest?.("[data-document-question]")?.dataset.documentQuestion;
    if (field.dataset.docField && documentQuestion != null) {
      const documentDraftToken = lab.pendingDocumentImport?.draftToken || "no-document-draft";
      return `document:${documentDraftToken}:${documentQuestion}:${field.dataset.docField}`;
    }
    if (field.dataset.rosterDuplicateAction != null) {
      const rosterDraftToken = lab.studentImportDraft?.draftToken || "no-roster-draft";
      return `roster-duplicate:${rosterDraftToken}:${field.dataset.rosterDuplicateAction}`;
    }
    if (field.dataset.rosterMap) {
      const rosterDraftToken = lab.studentImportDraft?.draftToken || "no-roster-draft";
      return `roster-map:${rosterDraftToken}:${field.dataset.rosterMap}`;
    }
    if (field.dataset.examTopic != null) return `exam-topic:${field.value}`;
    if (field.name) return `name:${field.name}:${index}`;
    return `position:${field.tagName}:${field.type || ""}:${index}`;
  }

  function captureTeacherViewDraft(view = lab.teacherView) {
    const dashboard = teacherWorkspaceFor(view);
    if (!dashboard) return true;
    const selectedFile = [...dashboard.querySelectorAll('input[type="file"]')]
      .find((input) => input.files?.length);
    if (selectedFile) {
      showLabMessage("已选择的文件无法跨页面保留，请先完成导入或清空文件后再切换。", true);
      selectedFile.focus();
      return false;
    }
    const fields = {};
    const draftFields = [...dashboard.querySelectorAll('input:not([type="file"]), select, textarea')];
    draftFields.forEach((field, index) => {
      const kind = field.type === "checkbox" || field.type === "radio" ? "checked" : "value";
      fields[teacherDraftFieldKey(field, index)] = {
        kind,
        value: kind === "checked" ? field.checked : field.value
      };
    });
    lab.teacherViewDrafts[teacherDraftKey(view)] = { fields };
    return true;
  }

  function restoreTeacherViewDraft(view = lab.teacherView) {
    const key = teacherDraftKey(view);
    const draft = lab.teacherViewDrafts[key];
    if (!draft) return;
    const dashboard = teacherWorkspaceFor(view);
    if (!dashboard) return;
    const fieldsByKey = new Map(
      [...dashboard.querySelectorAll('input:not([type="file"]), select, textarea')]
        .map((field, index) => [teacherDraftFieldKey(field, index), field])
    );
    Object.entries(draft.fields || {}).forEach(([fieldKey, saved]) => {
      const field = fieldsByKey.get(fieldKey);
      if (!field) return;
      if (saved.kind === "checked") field.checked = Boolean(saved.value);
      else field.value = String(saved.value ?? "");
    });
    delete lab.teacherViewDrafts[key];
  }

  function renderDashboard() {
    const questions = getQuestions();
    const { summary, recommendations } = getDerivedLearning(questions);
    const topRisk = summary.misconceptionProfile.filter((item) => item.status !== "未诊断").slice(0, 3);
    const goal = Number(lab.state.settings.dailyGoal) || 5;
    const today = engine.localCalendarDateKey();
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
          ${metricCard("正确率", summary.accuracy == null ? "暂无可评分证据" : `${summary.accuracy}%`, `${summary.correct}/${summary.completed || 0} 次提交 · 待复核 ${summary.pendingReviewCount || 0}`)}
          ${metricCard("独立完成率", summary.independenceRate == null ? "暂无可评分证据" : `${summary.independenceRate}%`, "正确且未超过第 1 级提示")}
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
                <article class="risk-${item.status === "稳定误概念风险" ? "high" : "watch"}">
                  <div><strong>${escapeHtml(item.title)}</strong><small>${item.evidenceCount} 条证据</small></div>
                  <span>${escapeHtml(item.status)} · ${item.evidenceCount} 条证据</span>
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
            ${capability("跨端同步", "本机继续离线可用；客户端已具备增量队列与冲突状态，服务端闭环需部署后启用。", "partial")}
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
          <div class="diagnostic-selector" role="tablist" aria-label="前概念诊断项目，可左右滑动选择">
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
                <label><input type="radio" name="diagnosticAnswer" value="${value}"><span class="diagnostic-choice-key">${value}</span><span class="diagnostic-choice-text">${escapeHtml(label)}</span></label>`).join("")}
            </fieldset>
            <fieldset id="diagnosticReasonGroup">
              <legend>最接近你的理由</legend>
              ${diagnostic.reasons.map(([value, label]) => `
                <label><input type="radio" name="diagnosticReason" value="${value}"><span class="diagnostic-choice-key">${value.replace("R", "")}</span><span class="diagnostic-choice-text">${escapeHtml(label)}</span></label>`).join("")}
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
                  <span class="risk-pill ${item.status === "稳定误概念风险" ? "high" : item.status.includes("待验证") || item.status.includes("历史规则") ? "watch" : ""}">${escapeHtml(item.status)}</span>
                </div>
                <div class="risk-meter"><i style="width:${Math.min(100, item.evidenceCount * 25)}%"></i></div>
                <p>${escapeHtml(item.correction)}</p>
              </article>`).join("")}
          </div>
        </aside>
      </section>`;
  }

  function renderDiagnosticResult(result) {
    const classification = engine.diagnosticClassificationLabel?.(result.attempt) || {
      secure: "概念与理由一致",
      "fragile-correct": "概念正确但信心不足",
      guess: "可能猜对",
      "confident-guess": "高置信度猜对，需纠正理由",
      "not-yet-understood": "尚未理解",
      "stable-misconception": "稳定误概念风险（需独立确认）",
      "high-confidence-error": "高置信错误，待验证误概念"
    }[result.attempt.classification] || result.attempt.classification;
    return `
      <div class="diagnostic-result ${result.attempt.answerCorrect && result.attempt.reasonCorrect ? "correct" : "needs-work"}">
        <span>诊断结果</span>
        <h4>${escapeHtml(classification)}</h4>
        <p>${escapeHtml(result.item.diagnostic.explanation)}</p>
        <strong>修正表述：${escapeHtml(result.item.correction)}</strong>
      </div>`;
  }

  function questionResponseKind(question) {
    const type = String(question.questionType || question.examQuestionType || "");
    if (/选择/.test(type)) return /多项|多选/.test(type) ? "multiple-choice" : "single-choice";
    if (/填空/.test(type)) return "fill";
    if (/实验|探究/.test(type)) return "experiment";
    return "written";
  }

  function extractChoiceOptions(question) {
    if (Array.isArray(question.options) && question.options.length >= 2) {
      return question.options.slice(0, 12).map((option, index) => {
        if (Array.isArray(option)) return { label: String(option[0] || String.fromCharCode(65 + index)), text: String(option[1] || "") };
        if (option && typeof option === "object") return { label: String(option.key || option.id || String.fromCharCode(65 + index)), text: String(option.text || option.label || "") };
        return { label: String.fromCharCode(65 + index), text: String(option || "") };
      }).filter((option) => option.text);
    }
    const content = String(question.content || "");
    const marker = /(?:^|\n|[ \u3000]{2,})([A-H])[.．、]\s*/gm;
    const matches = [];
    let match;
    while ((match = marker.exec(content))) {
      matches.push({ label: match[1], start: marker.lastIndex, markerStart: match.index });
    }
    return matches.map((item, index) => ({
      label: item.label,
      text: content.slice(item.start, matches[index + 1]?.markerStart ?? content.length).replace(/\s+/g, " ").trim()
    })).filter((item) => item.text);
  }

  function renderResponseInput(question, session) {
    const kind = questionResponseKind(question);
    const options = extractChoiceOptions(question);
    if ((kind === "single-choice" || kind === "multiple-choice") && options.length >= 2) {
      const selected = new Set(String(session.finalAnswer || "").toUpperCase().match(/[A-H]/g) || []);
      const inputType = kind === "multiple-choice" ? "checkbox" : "radio";
      return `
        <fieldset class="tutor-choice-response">
          <legend>${kind === "multiple-choice" ? "选择全部正确选项" : "选择一个答案"}</legend>
          <input id="labFinalAnswer" type="hidden" value="${escapeHtml(session.finalAnswer)}">
          ${options.map((option) => `
            <label>
              <input data-lab-choice type="${inputType}" name="labChoiceAnswer" value="${option.label}"${selected.has(option.label) ? " checked" : ""}>
              <strong>${option.label}</strong><span>${escapeHtml(option.text)}</span>
            </label>`).join("")}
        </fieldset>`;
    }
    const labels = {
      fill: ["按空格顺序填写", "按题目空格顺序填写；多个答案可用顿号或分号分隔。"],
      experiment: ["实验题作答", "按小问分条填写：实验目的、操作/数据、结论及误差分析。"],
      written: ["最终答案", "写出数值、单位和必要方向；多问请分行。"]
    };
    const [label, placeholder] = labels[kind] || labels.written;
    return `
      <label class="tutor-written-response response-${kind}">
        <span>${label}</span>
        <textarea id="labFinalAnswer" rows="${kind === "experiment" ? 7 : 3}" placeholder="${placeholder}">${escapeHtml(session.finalAnswer)}</textarea>
      </label>`;
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
    const aiReady = Boolean(window.PhysicsStudioAITutor?.status?.().ready);
    return `
      <section class="tutor-layout">
        <aside class="lab-card tutor-question">
          <button class="lab-back-button" data-lab-action="choose-question" type="button">← 更换题目</button>
          <div class="tutor-meta">
            <span>${escapeHtml(question.stage)} · ${escapeHtml(question.grade || "")}</span>
            <span>${escapeHtml(question.topic)}</span>
            <span>${escapeHtml(question.difficulty)} · ${escapeHtml(question.questionType || question.examQuestionType || "物理题")}</span>
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
            ${renderResponseInput(question, session)}
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
            ${session.grading ? renderGrading(question, session.grading) : ""}
            <section class="ai-tutor-card">
              <div>
                <span>${aiReady ? "CHATGPT 多轮导师" : "离线苏格拉底导师"}</span>
                <strong>${aiReady ? "受控服务端优先，失败自动回退" : "本机五级提示可继续学习"}</strong>
                <small>${aiReady ? "每轮只推进一个认知步骤；API 密钥不保存在电脑端或安卓端。" : "未配置或无法连接受控网关时，不发送数据，也不会阻断作答。"}</small>
              </div>
              <button class="lab-secondary-button" data-lab-action="ai-solve" type="button">继续一步指导</button>
              ${lab.aiStatusMessage ? `<p>${escapeHtml(lab.aiStatusMessage)}</p>` : ""}
              ${lab.aiResult ? renderAiTutorResult(lab.aiResult) : ""}
            </section>
            <div class="reflection-grid">
              <label>
                <span>错误类型</span>
                <select id="labErrorType">
                  ${["", ...engine.errorTypeDefinitions.map((item) => item.label)].map((value) => `
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

  function renderGrading(question, grading) {
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
        <details class="grading-reference" open>
          <summary>参考答案与分步解析（已完成本次作答）</summary>
          <div>
            <strong>参考答案</strong>
            <pre>${escapeHtml(question.answer || grading.expected || "待教师复核")}</pre>
            <strong>分步解析</strong>
            <pre>${escapeHtml(question.solution || "本题暂无可核验的分步解析，请交由教师复核。")}</pre>
          </div>
        </details>
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

  function renderAiTutorResult(result) {
    if (!result?.diagnosisType) return renderAiSolution(result);
    const verification = Array.isArray(result.verification?.checks)
      ? result.verification.checks
      : [];
    return `<div class="ai-solution ai-tutor-turn">
      <article><strong>当前诊断</strong><p>${escapeHtml(result.diagnosisType)}</p></article>
      <article><strong>下一步只做这一件事</strong><p>${escapeHtml(result.nextPrompt)}</p></article>
      <article><strong>即时反馈</strong><p>${escapeHtml(result.feedback)}</p></article>
      <article><strong>物理校验范围</strong><ul>${verification.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
      <small>${result.source === "gateway" ? "来自受控导师服务" : "来自本机五级提示"} · 已记录提示等级 ${Number(result.hintLevel) || 0}/5${result.hintLevel >= 5 ? " · 本次不能计为独立完成" : ""}${result.reviewRequired ? " · 待教师复核" : ""}</small>
    </div>`;
  }

  function renderModels() {
    const linkedQuestion = getQuestion(lab.selectedQuestionId);
    return `
      <section class="model-lab">
        <div class="lab-card model-sidebar">
          <div class="lab-card-head"><div><span>SYNCHRONIZED MODEL</span><h3>题目—模型—图像—仿真</h3></div></div>
          ${linkedQuestion ? `<div class="linked-model-context"><span>当前关联题</span><strong>${escapeHtml(linkedQuestion.title)}</strong><small>${escapeHtml(linkedQuestion.topic)} · 已按知识主题选择模型；调整参数不会写入作答或掌握证据。</small></div>` : ""}
          <div class="model-tabs">
            ${MODEL_CATALOG.map(([key, label, detail]) => `
              <button class="${lab.modelType === key ? "active" : ""}" data-model-type="${key}" type="button">
                <strong>${label}</strong><small>${detail}</small>
              </button>`).join("")}
          </div>
          ${modelControls()}
          <div class="model-actions">
            ${ANIMATED_MODELS.has(lab.modelType) ? '<button class="lab-primary-button" data-lab-action="play-model" type="button">▶ 播放过程</button>' : ""}
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
    if (lab.modelType === "circuit") {
      return `
        <div class="model-controls">
          ${rangeControl("voltage", "电源电压 U", params.voltage, 1, 36, 1, "V")}
          ${rangeControl("r1", "电阻 R₁", params.r1, 1, 100, 1, "Ω")}
          ${rangeControl("r2", "电阻 R₂", params.r2, 1, 100, 1, "Ω")}
          <label><span>连接方式</span><select data-model-param="mode"><option value="series"${params.mode === "series" ? " selected" : ""}>串联</option><option value="parallel"${params.mode === "parallel" ? " selected" : ""}>并联</option></select></label>
        </div>`;
    }
    if (lab.modelType === "uniform") {
      return `<div class="model-controls">
        ${rangeControl("x0", "初位置 x₀", params.x0, -20, 20, 1, "m")}
        ${rangeControl("v0", "初速度 v₀", params.v0, -20, 30, 0.5, "m/s")}
        ${rangeControl("a", "加速度 a", params.a, -10, 10, 0.5, "m/s²")}
        ${rangeControl("duration", "图像时长", params.duration, 1, 10, 0.5, "s")}
        ${rangeControl("t", "同步时刻 t", params.t, 0, params.duration, 0.05, "s")}
      </div>`;
    }
    if (lab.modelType === "newton") {
      return `<div class="model-controls">
        ${rangeControl("mass", "质量 m", params.mass, 0.5, 10, 0.1, "kg")}
        ${rangeControl("appliedForce", "向右外力 F", params.appliedForce, 0, 50, 1, "N")}
        ${rangeControl("opposingForce", "向左阻力 f", params.opposingForce, 0, 50, 1, "N")}
        ${rangeControl("v0", "初速度 v₀", params.v0, -10, 20, 0.5, "m/s")}
        ${rangeControl("t", "观察时刻 t", params.t, 0, params.duration, 0.05, "s")}
      </div>`;
    }
    if (lab.modelType === "energy") {
      return `<div class="model-controls">
        ${rangeControl("mass", "质量 m", params.mass, 0.5, 10, 0.1, "kg")}
        ${rangeControl("g", "重力加速度 g", params.g, 1, 15, 0.1, "m/s²")}
        ${rangeControl("initialHeight", "初始高度 H", params.initialHeight, 1, 30, 0.5, "m")}
        ${rangeControl("height", "当前高度 h", Math.min(params.height, params.initialHeight), 0, params.initialHeight, 0.1, "m")}
        ${rangeControl("lossPercent", "已释放能量耗散比例", params.lossPercent, 0, 100, 1, "%")}
      </div>`;
    }
    if (lab.modelType === "collision") {
      return `<div class="model-controls">
        ${rangeControl("m1", "质量 m₁", params.m1, 0.5, 10, 0.1, "kg")}
        ${rangeControl("m2", "质量 m₂", params.m2, 0.5, 10, 0.1, "kg")}
        ${rangeControl("u1", "初速度 u₁", params.u1, -10, 15, 0.5, "m/s")}
        ${rangeControl("u2", "初速度 u₂", params.u2, -10, 15, 0.5, "m/s")}
        <label><span>碰撞类型</span><select data-model-param="type"><option value="elastic"${params.type === "elastic" ? " selected" : ""}>弹性碰撞</option><option value="inelastic"${params.type === "inelastic" ? " selected" : ""}>完全非弹性碰撞</option></select></label>
      </div>`;
    }
    return `<div class="model-controls">
      ${rangeControl("speed", "波速 v", params.speed, 1, 100, 1, "m/s")}
      ${rangeControl("frequency", "频率 f", params.frequency, 0.5, 20, 0.5, "Hz")}
      ${rangeControl("amplitude", "振幅 A", params.amplitude, 0.2, 5, 0.1, "m")}
      ${rangeControl("t", "观察时刻 t", params.t, 0, 2, 0.01, "s")}
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
    const renderers = {
      projectile: projectileModel,
      incline: inclineModel,
      circuit: circuitModel,
      uniform: uniformModel,
      newton: newtonModel,
      energy: mechanicalEnergyModel,
      collision: collisionModel,
      wave: waveRelationModel
    };
    output.innerHTML = visuals ? renderers[lab.modelType]?.() || "" : emptyState("多表征模块未加载", "请检查 physics-visuals.js 是否随本地应用一起安装。");
    if (lab.modelType === "uniform") {
      const timeInput = lab.content.querySelector('[data-model-param="t"]');
      if (timeInput) timeInput.max = lab.modelParams.uniform.duration;
    }
    if (lab.modelType === "energy") {
      lab.modelParams.energy.height = Math.min(lab.modelParams.energy.height, lab.modelParams.energy.initialHeight);
      const heightInput = lab.content.querySelector('[data-model-param="height"]');
      if (heightInput) {
        heightInput.max = lab.modelParams.energy.initialHeight;
        heightInput.value = lab.modelParams.energy.height;
      }
    }
    lab.content.querySelectorAll("[data-model-value]").forEach((node) => {
      const key = node.dataset.modelValue;
      const units = { x0: "m", v0: "m/s", a: "m/s²", angle: "°", g: "m/s²", t: "s", duration: "s", mass: "kg", mu: "", voltage: "V", r1: "Ω", r2: "Ω", appliedForce: "N", opposingForce: "N", initialHeight: "m", height: "m", lossPercent: "%", m1: "kg", m2: "kg", u1: "m/s", u2: "m/s", speed: "m/s", frequency: "Hz", amplitude: "m" };
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
    const result = visuals.circuit({ voltage, resistances: [r1, r2], mode });
    const { totalResistance, totalCurrent } = result;
    const [i1, i2] = result.branchCurrents;
    const [u1, u2] = result.branchVoltages;
    const [p1, p2] = result.branchPowers;
    const dimension = engine.validateDimension("P=U*I");
    return `
      <section class="lab-card model-stage">
        <div class="model-stage-head">
          <div><span>DC CIRCUIT MODEL</span><h3>${mode === "series" ? "串联" : "并联"}电路同步画布</h3></div>
          <div class="model-live-values"><span>R总 = ${formatNumber(totalResistance)} Ω</span><span>I总 = ${formatNumber(totalCurrent)} A</span><span>P总 = ${formatNumber(voltage * totalCurrent)} W</span></div>
        </div>
        ${result.svg}
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

  function uniformModel() {
    const params = lab.modelParams.uniform;
    const result = visuals.uniformMotion(params);
    const dimension = engine.validateDimension("x=v*t+a*t^2");
    return `<section class="lab-card model-stage visual-model-stage" data-offline-model="uniform">
      <div class="model-stage-head"><div><span>UNIFORMLY ACCELERATED MOTION</span><h3>匀变速直线运动联动图</h3></div><div class="model-live-values"><span>x=${formatNumber(result.position)} m</span><span>v=${formatNumber(result.velocity)} m/s</span><span>a=${formatNumber(result.acceleration)} m/s²</span></div></div>
      ${result.svg}
      <div class="model-equation-grid">
        <article><span>位置</span><strong>x=x₀+v₀t+½at²</strong><small>${formatNumber(result.position)} m</small></article>
        <article><span>速度</span><strong>v=v₀+at</strong><small>${formatNumber(result.velocity)} m/s</small></article>
        <article><span>图像互证</span><strong>dx/dt=v；dv/dt=a</strong><small>v-t 图面积对应位移变化</small></article>
        <article class="${dimension.valid ? "verified" : "warning"}"><span>量纲校验</span><strong>${dimension.status}</strong><small>${escapeHtml(dimension.message)}</small></article>
      </div>
      <p class="model-assumption">假设：一维质点运动、所选时间段内加速度恒定；坐标正方向决定速度和加速度的正负。</p>
    </section>`;
  }

  function newtonModel() {
    const params = lab.modelParams.newton;
    const result = visuals.newtonSecondLaw(params);
    const dimension = engine.validateDimension("F=m*a");
    return `<section class="lab-card model-stage visual-model-stage" data-offline-model="newton">
      <div class="model-stage-head"><div><span>NEWTON'S SECOND LAW</span><h3>牛顿第二定律多表征模型</h3></div><div class="model-live-values"><span>ΣF=${formatNumber(result.netForce)} N</span><span>a=${formatNumber(result.acceleration)} m/s²</span><span>v=${formatNumber(result.velocity)} m/s</span></div></div>
      ${result.svg}
      <div class="model-equation-grid">
        <article><span>水平方向</span><strong>ΣF=F−f=ma</strong><small>${formatNumber(result.appliedForce)}−${formatNumber(result.opposingForce)}=${formatNumber(result.mass)}×${formatNumber(result.acceleration)}</small></article>
        <article><span>运动结果</span><strong>v=v₀+at；x=v₀t+½at²</strong><small>t=${formatNumber(result.t)} s，x=${formatNumber(result.position)} m</small></article>
        <article><span>竖直方向</span><strong>N−mg=0</strong><small>水平面无竖直加速度</small></article>
        <article class="${dimension.valid ? "verified" : "warning"}"><span>量纲校验</span><strong>${dimension.status}</strong><small>${escapeHtml(dimension.message)}</small></article>
      </div>
      <p class="model-assumption">假设：物体视为质点、水平面固定，输入的阻力大小恒定且方向向左；若合力为负，加速度指向左。</p>
    </section>`;
  }

  function mechanicalEnergyModel() {
    const params = lab.modelParams.energy;
    const result = visuals.mechanicalEnergy({
      ...params,
      dissipationRatio: params.lossPercent / 100
    });
    return `<section class="lab-card model-stage visual-model-stage" data-offline-model="energy">
      <div class="model-stage-head"><div><span>MECHANICAL ENERGY</span><h3>机械能转化与耗散</h3></div><div class="model-live-values"><span>Ek=${formatNumber(result.kineticEnergy)} J</span><span>Ep=${formatNumber(result.potentialEnergy)} J</span><span>v=${formatNumber(result.speed)} m/s</span></div></div>
      ${result.svg}
      <div class="model-equation-grid">
        <article><span>初始能量</span><strong>E₀=mgH</strong><small>${formatNumber(result.initialEnergy)} J</small></article>
        <article><span>当前机械能</span><strong>Em=Ek+Ep</strong><small>${formatNumber(result.mechanicalEnergy)} J</small></article>
        <article><span>能量账本</span><strong>E₀=Ek+Ep+E耗散</strong><small>${formatNumber(result.initialEnergy)}=${formatNumber(result.kineticEnergy)}+${formatNumber(result.potentialEnergy)}+${formatNumber(result.dissipatedEnergy)} J</small></article>
        <article><span>速度</span><strong>Ek=½mv²</strong><small>v=${formatNumber(result.speed)} m/s</small></article>
      </div>
      <p class="model-assumption">零势能面取在高度 0；耗散比例只作用于从 H 下降到 h 已释放的重力势能。耗散为 0 时机械能守恒。</p>
    </section>`;
  }

  function collisionModel() {
    const result = visuals.collision1D(lab.modelParams.collision);
    const elastic = result.type === "elastic";
    return `<section class="lab-card model-stage visual-model-stage" data-offline-model="collision">
      <div class="model-stage-head"><div><span>ONE-DIMENSIONAL COLLISION</span><h3>${elastic ? "弹性" : "完全非弹性"}一维碰撞</h3></div><div class="model-live-values"><span>v₁=${formatNumber(result.v1)} m/s</span><span>v₂=${formatNumber(result.v2)} m/s</span><span>ΔEk=${formatNumber(result.kineticLoss)} J</span></div></div>
      ${result.svg}
      <div class="model-equation-grid">
        <article><span>动量</span><strong>m₁u₁+m₂u₂=m₁v₁+m₂v₂</strong><small>${formatNumber(result.momentumBefore)}=${formatNumber(result.momentumAfter)} kg·m/s</small></article>
        <article><span>碰后速度</span><strong>v₁=${formatNumber(result.v1)}；v₂=${formatNumber(result.v2)}</strong><small>正负号对应所选一维正方向</small></article>
        <article><span>动能</span><strong>${elastic ? "Ek前=Ek后" : "Ek后<Ek前"}</strong><small>${formatNumber(result.kineticBefore)} → ${formatNumber(result.kineticAfter)} J</small></article>
        <article><span>碰撞类型</span><strong>${elastic ? "恢复系数 e=1" : "共同速度，e=0"}</strong><small>${elastic ? "动量和机械能同时守恒" : "动量守恒，部分机械能转化"}</small></article>
      </div>
      <p class="model-assumption">假设：碰撞时间很短且系统所受外力冲量可忽略；只处理完全弹性和完全非弹性两个边界模型。</p>
    </section>`;
  }

  function waveRelationModel() {
    const params = lab.modelParams.wave;
    const result = visuals.waveModel({ ...params, time: params.t });
    return `<section class="lab-card model-stage visual-model-stage" data-offline-model="wave">
      <div class="model-stage-head"><div><span>WAVE RELATION</span><h3>波速—频率—波长联动模型</h3></div><div class="model-live-values"><span>v=${formatNumber(result.speed)} m/s</span><span>f=${formatNumber(result.frequency)} Hz</span><span>λ=${formatNumber(result.wavelength)} m</span></div></div>
      ${result.svg}
      <div class="model-equation-grid">
        <article><span>基本关系</span><strong>v=fλ</strong><small>${formatNumber(result.speed)}=${formatNumber(result.frequency)}×${formatNumber(result.wavelength)}</small></article>
        <article><span>周期</span><strong>T=1/f</strong><small>${formatNumber(result.period)} s</small></article>
        <article><span>介质约束</span><strong>同一介质中波速由介质决定</strong><small>改变波源频率时，波长相应变化</small></article>
        <article><span>相位</span><strong>y=A sin 2π(x/λ−ft)</strong><small>当前 t=${formatNumber(result.time)} s</small></article>
      </div>
      <p class="model-assumption">假设：一维简谐行波、介质均匀且无色散；模型显示质点振动状态，不表示介质质点随波迁移。</p>
    </section>`;
  }

  function activeVariantSet(question) {
    const generator = window.PhysicsStudioVariantGenerator;
    if (!generator || !question) return null;
    const hash = generator.sourceContentHash(question);
    const requested = lab.variantTraining?.setId
      ? (lab.state.variantSets || []).find((set) => set.id === lab.variantTraining.setId && !generator.isSetStale(set, question))
      : null;
    return requested || engine.variantSetForParent(lab.state, question.id, hash);
  }

  async function prepareVariantTraining(question, options = {}) {
    const generator = window.PhysicsStudioVariantGenerator;
    if (!generator) throw new Error("专项变式生成模块未加载。 ");
    let set = activeVariantSet(question);
    if (!set || set.variants.length < 2) {
      lab.variantGenerationStatus = "正在匹配已审核题模并执行质量校验…";
      if (lab.dialog?.open && lab.tab === "transfer") renderPanel();
      const profile = engine.activeProfile(lab.state);
      set = await generator.generateVariantSet(question, {
        questions: getQuestions(),
        existingSets: lab.state.variantSets,
        count: Math.max(2, Math.min(3, Number(options.count) || 3)),
        allowAi: options.allowAi === true && isTeacherRole(),
        minorUnder14: profile?.minorAgeBand === "under14",
        minorAgeBand: profile?.minorAgeBand || "unknown",
        guardianConsentStatus: profile?.guardianConsentStatus,
        personalIdentifiers: [profile?.name, profile?.studentNumber].filter(Boolean)
      });
      if (set.variants?.length) {
        set = engine.saveVariantSet(lab.state, set);
        saveLearningState();
      }
    }
    lab.variantGenerationStatus = "";
    if (!set?.variants?.length) return set;
    const trainable = engine.trainableVariants(set);
    if (set.status === "approved" && trainable.length < 2) {
      throw new Error("该题组不足 2 道已通过审核与质量门禁的变式题。 ");
    }
    const current = lab.variantTraining?.setId === set.id ? lab.variantTraining : null;
    const order = current?.order?.length
      ? current.order.filter((id) => trainable.some((variant) => variant.id === id))
      : trainable.map((variant) => variant.id);
    lab.variantTraining = {
      setId: set.id,
      order,
      index: Math.max(0, Math.min(order.length - 1, Number(current?.index) || 0)),
      session: current?.session || null,
      summaryVisible: current?.summaryVisible === true
    };
    return set;
  }

  function currentVariantContext(question) {
    const set = activeVariantSet(question);
    if (!set || !lab.variantTraining || lab.variantTraining.setId !== set.id) return { set, variant: null, progress: null };
    const progress = engine.variantSetProgress(lab.state, set.id, lab.state.activeProfileId);
    if (progress.complete) return { set, variant: null, progress };
    const completedIds = new Set(progress.results.filter((item) => item.record).map((item) => item.variant.id));
    const order = lab.variantTraining.order.length
      ? lab.variantTraining.order
      : engine.trainableVariants(set).map((variant) => variant.id);
    let index = order.findIndex((id, candidateIndex) => candidateIndex >= lab.variantTraining.index && !completedIds.has(id));
    if (index < 0) index = order.findIndex((id) => !completedIds.has(id));
    if (index < 0) return { set, variant: null, progress };
    lab.variantTraining.index = index;
    const variant = set.variants.find((item) => item.id === order[index]) || null;
    if (variant && (!lab.variantTraining.session || lab.variantTraining.session.questionId !== variant.id)) {
      lab.variantTraining.session = { ...newSession(variant), solutionViewed: false, variantSetId: set.id };
    }
    return { set, variant, progress };
  }

  function renderVariantSolutionDetail(variant) {
    const detail = variant.solutionDetail || {};
    const laws = Array.isArray(detail.laws) ? detail.laws : [];
    const steps = Array.isArray(detail.steps) ? detail.steps : [];
    return `<section class="variant-solution-detail">
      <h4>思路总览</h4><p>${escapeHtml(detail.overview || "按题目模型建立方程并核对适用条件。")}</p>
      <h4>已知与所求</h4><p>${(detail.known || []).map(escapeHtml).join("；") || "见题干"}；所求：${escapeHtml(detail.unknown || "见题干")}</p>
      <h4>研究对象和过程</h4><p>${escapeHtml(detail.researchObject || "见题干")}；${escapeHtml(detail.process || "按状态或过程分析")}</p>
      <h4>规律与适用条件</h4><ul>${laws.map((law) => `<li><strong>${escapeHtml(law.name || law)}</strong>${law.condition ? `：${escapeHtml(law.condition)}` : ""}</li>`).join("") || `<li>${escapeHtml((variant.examPoints || []).join("、"))}</li>`}</ul>
      <h4>分步推导</h4><ol>${steps.map((step) => `<li><p>${escapeHtml(step.reasoning || "")}</p>${step.equation ? `<code>${escapeHtml(step.equation)}</code>` : ""}${step.substitution ? `<small>代入：${escapeHtml(step.substitution)}</small>` : ""}${step.result ? `<strong>结果：${escapeHtml(step.result)}</strong>` : ""}</li>`).join("")}</ol>
      <h4>标准答案</h4><pre>${escapeHtml(detail.finalAnswer || variant.answer)}</pre>
      <h4>结果检验</h4><ul>${(detail.checks || []).map((check) => `<li>${escapeHtml(check)}</li>`).join("")}</ul>
      <h4>易错点</h4><ul>${(detail.pitfalls || []).map((pitfall) => `<li>${escapeHtml(pitfall)}</li>`).join("")}</ul>
      <h4>与母题的差异</h4><p>${escapeHtml(detail.parentDifference || variant.changeSummary || variant.relationToParent)}</p>
    </section>`;
  }

  function renderVariantSummary(set, progress) {
    const records = progress.results.map((item) => item.record).filter(Boolean);
    const independent = records.filter((record) => record.verificationStatus === "verified-transfer");
    const reverse = records.find((record) => record.variantRole === "reverse");
    let conclusion = `已完成 ${records.length}/${progress.total} 道专项变式。`;
    if (independent.length === records.length) conclusion += " 本组均为低提示独立正确，可作为本次迁移证据。";
    else if (reverse && reverse.verificationStatus !== "verified-transfer") conclusion += " 母题相关练习已完成，但逆向设问仍依赖提示或需要订正。";
    else conclusion += " 当前仅形成练习记录；需后续复测，不据此形成长期能力结论。";
    return `<section class="lab-card variant-set-summary">
      <span class="lab-section-index">SPECIALIZED TRAINING COMPLETE</span>
      <h3>专项训练完成</h3><p>${escapeHtml(conclusion)}</p>
      <div class="variant-progress-list">${progress.results.map((item) => `<article><span>${escapeHtml(item.variant.variantRoleLabel)}</span><strong>${escapeHtml(item.record?.gradingStatus || "未完成")}</strong><small>提示 ${item.record?.hintLevel ?? "-"}/5 · ${item.record?.verificationStatus === "verified-transfer" ? "已核验迁移证据" : "练习记录"}</small></article>`).join("")}</div>
      <p class="tool-help">专项结束后继续使用既有间隔复习；不会立即无限推送同模型题。</p>
      <button class="lab-primary-button" data-lab-tab="review" type="button">查看复习安排</button>
    </section>`;
  }

  function renderApprovedVariantTeacherPreview(parent, set) {
    return `<section class="variant-training-layout variant-teacher-preview">
      <aside class="lab-card variant-parent-card"><span class="lab-section-index">PARENT PROBLEM</span><h3>${escapeHtml(parent.title)}</h3><p>${escapeHtml(parent.content)}</p><p><strong>知识点：</strong>${escapeHtml(parent.topic)} · <strong>难度：</strong>${escapeHtml(parent.difficulty)}</p></aside>
      <main class="lab-card"><div class="lab-card-head"><div><span>VALIDATED VARIANT SET</span><h3>专项变式并排预览</h3></div><strong>${set.variants.length} 道</strong></div>
        <div class="variant-review-grid">${set.variants.map((variant) => `<section><span>${escapeHtml(variant.variantRoleLabel)}</span><h4>${escapeHtml(variant.title)}</h4><p>${escapeHtml(variant.content)}</p><p><strong>改变：</strong>${escapeHtml(variant.changeSummary)}</p><p><strong>答案：</strong>${escapeHtml(variant.answer)}</p><details><summary>详细解法</summary>${renderVariantSolutionDetail(variant)}</details><small>质量门禁：${variant.validation?.passed ? "通过" : "未通过"} · 来源：${escapeHtml(variant.source)}</small></section>`).join("")}</div>
        <div class="teacher-inline-actions"><button class="lab-primary-button" data-lab-action="add-approved-variant-set" data-set-id="${escapeHtml(set.id)}" type="button">加入作业预览</button><button class="lab-secondary-button" data-lab-action="choose-question" type="button">更换母题</button></div>
      </main>
    </section>`;
  }

  function renderTransfer() {
    const question = getQuestion(lab.selectedQuestionId);
    if (!question) return renderQuestionPicker("先选择一道母题，再开始专项变式训练");
    const set = activeVariantSet(question);
    if (lab.variantGenerationStatus) return `<section class="lab-card variant-loading"><h3>专项变式训练</h3><p>${escapeHtml(lab.variantGenerationStatus)}</p></section>`;
    if (!set || set.variants.length < 2) return `<section class="lab-two-column transfer-lab">
      <div class="lab-card"><button class="lab-back-button" data-lab-action="choose-question" type="button">← 更换母题</button><span class="lab-section-index">SOURCE PROBLEM</span><h3>${escapeHtml(question.title)}</h3><p class="transfer-source-stem">${escapeHtml(question.content)}</p></div>
      <div class="lab-card transfer-empty-state"><h3>生成完整专项变式</h3><p>系统优先复用已审核题模，独立检查题干、答案、解析、数值和单位。无法验证时不会把文字任务当成试题。</p><button class="lab-primary-button" data-lab-action="generate-variant-set" type="button">生成 2—3 道完整变式</button></div>
    </section>`;
    if (set.status !== "approved") return `<section class="lab-card variant-review-required"><h3>变式题组等待审核</h3><p>${set.generationMode === "controlled-ai-gateway" ? "AI 生成题必须由教师审核后才能进入学生正式训练。" : "该题组未通过正式发布条件。"}</p>${isTeacherRole() ? `<button class="lab-primary-button" data-lab-action="open-variant-review" data-set-id="${escapeHtml(set.id)}" type="button">立即审核</button>` : ""}</section>`;
    if (isTeacherRole()) return renderApprovedVariantTeacherPreview(question, set);
    if (!lab.variantTraining || lab.variantTraining.setId !== set.id) {
      lab.variantTraining = { setId: set.id, order: engine.trainableVariants(set).map((variant) => variant.id), index: 0, session: null, summaryVisible: false };
    }
    const { variant, progress } = currentVariantContext(question);
    if (!variant && progress?.complete) return renderVariantSummary(set, progress);
    if (!variant) return `<section class="lab-card"><p>变式题组状态无法恢复，请重新进入。</p></section>`;
    const session = lab.variantTraining.session;
    const hints = engine.createHintLadder(variant);
    return `<section class="variant-training-layout">
      <aside class="lab-card variant-parent-card"><span class="lab-section-index">PARENT PROBLEM</span><h3>${escapeHtml(question.title)}</h3><p>${escapeHtml(question.content)}</p><div class="tutor-points"><strong>核心结构</strong><span>${escapeHtml(question.topic)}</span></div><small>母题仅用于比较；当前作答对象是右侧完整变式题。</small></aside>
      <main class="variant-exam-workbench">
        <header class="lab-card variant-progress-header"><div><span>专项变式 ${progress.completed + 1}/${progress.total}</span><strong>${escapeHtml(variant.variantRoleLabel)}</strong></div><time id="variantSessionTimer">${formatDuration((Date.now() - session.startedAt) / 1000)}</time></header>
        <section class="lab-card variant-question-card"><div class="tutor-meta"><span>${escapeHtml(variant.grade)}</span><span>${escapeHtml(variant.topic)}</span><span>${escapeHtml(variant.difficulty)} · ${escapeHtml(variant.questionType)}</span></div><h3>${escapeHtml(variant.title)}</h3><div class="tutor-stem">${escapeHtml(variant.content)}</div><p class="variant-change-summary"><strong>本题变化：</strong>${escapeHtml(variant.changeSummary)}</p>${variant.visualSpec && window.PHYSICS_VISUALS?.renderVisualSpec ? window.PHYSICS_VISUALS.renderVisualSpec(variant.visualSpec) : ""}</section>
        <section class="lab-card variant-answer-card"><div class="lab-card-head"><div><span>INDEPENDENT RESPONSE</span><h3>先独立作答</h3></div><strong>提示 ${session.hintLevel}/5</strong></div>${renderResponseInput(variant, session)}
          <div class="variant-hint-row">${hints.slice(0, 4).map((hint) => `<button data-variant-hint-level="${hint.level}" type="button"${hint.level > session.hintLevel + 1 ? " disabled" : ""}>${session.hintLevel >= hint.level ? escapeHtml(hint.text) : `${hint.level}级提示`}</button>`).join("")}<button data-variant-reveal-solution type="button">查看完整解答</button></div>
          <div class="answer-actions"><button class="lab-primary-button" data-lab-action="grade-variant-answer" type="button">提交本题</button></div>
          ${session.grading ? `${renderGrading(variant, session.grading)}${renderVariantSolutionDetail(variant)}<div class="reflection-grid"><label><span>本题主要错因</span><select id="labErrorType">${["", ...engine.errorTypeDefinitions.map((item) => item.label)].map((value) => `<option value="${escapeHtml(value)}"${session.errorType === value ? " selected" : ""}>${escapeHtml(value || "本次无错误或待判断")}</option>`).join("")}</select></label><label><span>作答后置信度</span><input id="confidenceAfter" type="range" min="1" max="5" value="${session.confidenceAfter}"></label><label class="wide"><span>一句话说明本题规律与母题差异</span><textarea id="labSelfExplanation" rows="3">${escapeHtml(session.selfExplanation)}</textarea></label></div><button class="lab-complete-button" data-lab-action="complete-variant-attempt" type="button">保存本题并继续</button>` : ""}
        </section>
      </main>
    </section>`;
  }

  function renderReview() {
    const questions = getQuestions();
    const { summary, coverage } = getDerivedLearning(questions, { coverage: true });
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
          ${metricCard("作答正确率", summary.accuracy == null ? "暂无可评分证据" : `${summary.accuracy}%`, `已评分 ${summary.scoredCount || 0} 次 · 待复核 ${summary.pendingReviewCount || 0} 次`)}
          ${metricCard("独立完成率", summary.independenceRate == null ? "暂无可评分证据" : `${summary.independenceRate}%`, "区分独立完成与看答案")}
          ${metricCard("平均提示层级", `${summary.averageHint}`, "0 表示未使用提示")}
          ${metricCard("待复习题", `${summary.dueCount}`, "到期或逾期")}
          ${metricCard("累计学习", `${summary.learningMinutes} min`, `${summary.completed} 次闭环训练`)}
        </div>

        <section class="lab-card mastery-evidence-summary">
           <div class="lab-card-head"><div><span>KNOWLEDGE POINT EVIDENCE</span><h3>知识点证据覆盖</h3></div><strong>${coverage.coverageLabel}</strong></div>
          <div class="mastery-state-grid">
            ${Object.entries(summary.mastery.counts).map(([label, count]) => {
              const displayCode = {
                "未开始": "not-started",
                "学习中": "learning",
                "熟练": "proficient",
                "已掌握": "mastered",
                "待复习": "due",
                "薄弱": "weak"
              }[label] || label;
              const displayLabel = engine.masteryDisplayLabel?.(displayCode) || label;
              return `<article><strong>${count}</strong><span>${escapeHtml(displayLabel)}</span></article>`;
            }).join("")}
          </div>
           <p>当前已有证据 ${coverage.coverageLabel} 个知识点：基本掌握 ${coverage.basic}，可迁移 ${coverage.transferable}，需巩固 ${coverage.reinforce}，证据不足 ${coverage.insufficient}。单题记录仍用于复习调度，不代表总体能力百分数。</p>
        </section>

        <div class="report-grid">
          <section class="lab-card">
             <div class="lab-card-head"><div><span>MODELING RECORD</span><h3>建模记录完整度（规则值）</h3></div><strong>${summary.completed ? "基于已填写步骤" : "待积累数据"}</strong></div>
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
                </article>`).join("") : emptyState("当前没有到期复习", "完成一道分步训练后，系统会依据正确性和提示依赖安排下次复习。")}
            </div>
          </section>
          <section class="lab-card">
            <div class="lab-card-head"><div><span>TOPIC EVIDENCE</span><h3>知识点表现</h3></div></div>
            <div class="topic-report-table">
              <div class="table-head"><span>知识点</span><span>次数</span><span>正确率</span><span>提示</span><span>记录完整度（规则值）</span></div>
              ${summary.topics.length ? summary.topics.slice(0, 12).map((topic) => `
                <div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts}</span><span>${topic.accuracy == null ? "暂无可评分证据" : `${topic.accuracy}%`}</span><span>${topic.averageHint}</span><span>${topic.modeling == null ? "无记录/不适用" : topic.modeling}</span></div>`).join("") : emptyState("尚无知识点证据", "完成训练后，这里会按题目知识点汇总，而不是依据聊天印象推断。")}
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

        <section class="lab-card ray-tool">
          <div class="lab-card-head"><div><span>RAY DIAGRAM</span><h3>基础反射与折射光路</h3></div><strong>实时计算</strong></div>
          <div class="ray-controls">
            <label><span>过程</span><select data-ray-param="mode"><option value="reflection"${lab.rayParams.mode === "reflection" ? " selected" : ""}>反射</option><option value="refraction"${lab.rayParams.mode === "refraction" ? " selected" : ""}>折射 / 全反射</option></select></label>
            ${rayRangeControl("incidenceAngle", "入射角 i", lab.rayParams.incidenceAngle, 0, 80, 1, "°")}
            ${rayRangeControl("n1", "介质 1 折射率 n₁", lab.rayParams.n1, 0.5, 2.5, 0.05, "")}
            ${rayRangeControl("n2", "介质 2 折射率 n₂", lab.rayParams.n2, 0.5, 2.5, 0.05, "")}
          </div>
          <div class="ray-diagram-output" id="rayDiagramOutput"></div>
          <p class="tool-help">角度相对法线测量；折射按 n₁sin i=n₂sin r 计算，超出可折射范围时明确显示全反射。</p>
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

  function rayRangeControl(key, label, value, min, max, step, unit) {
    return `<label><span>${escapeHtml(label)} <strong data-ray-value="${key}">${formatNumber(value)}${unit}</strong></span><input data-ray-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }

  function classKnowledgeMatrix(profiles, questions) {
    const topics = new Map();
    profiles.forEach((profile) => {
      questions.filter((question) => !question.grade || question.grade === profile.grade).forEach((question) => {
        const key = engine.topicKeyForQuestion(question);
        if (key && !topics.has(key)) topics.set(key, question.topic || key);
      });
    });
    const columns = [...topics.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
    const rows = profiles.map((profile) => {
      const gradeQuestions = questions.filter((question) => !question.grade || question.grade === profile.grade);
      const summary = engine.knowledgePointEvidenceSummary(lab.state, gradeQuestions, profile.id);
      const byKey = new Map(summary.byTopic.map((item) => [item.key, item]));
      return {
        profile,
        cells: columns.map(([key, label]) => {
          const item = byKey.get(key);
          return {
            key,
            label,
            code: item?.sampleSize ? item.code : "not-tested",
            status: item?.sampleSize ? item.status : "未测",
            sampleSize: item?.sampleSize || 0
          };
        })
      };
    });
    return { columns, rows };
  }

  function renderClassKnowledgeMatrix(profiles, questions) {
    const matrix = classKnowledgeMatrix(profiles, questions);
    const selected = matrix.columns.find(([key]) => key === lab.matrixTopicKey);
    const selectedStudents = selected
      ? matrix.rows.filter((row) => {
        const cell = row.cells.find((item) => item.key === selected[0]);
        return cell && ["not-tested", "insufficient", "reinforce"].includes(cell.code);
      })
      : [];
    return `<section class="lab-card class-matrix-card">
      <div class="lab-card-head"><div><span>CLASS KNOWLEDGE MATRIX</span><h3>班级知识点矩阵</h3></div><strong>${profiles.length}×${matrix.columns.length}</strong></div>
      <p>按学生与知识点显示未测、证据不足、需巩固、基本掌握、可迁移；默认不做排名。点击知识点查看补测对象。</p>
      <div class="class-matrix-scroll"><table><thead><tr><th>学生</th>${matrix.columns.map(([key, label]) => `<th><button data-lab-action="select-matrix-topic" data-topic-key="${escapeHtml(key)}" type="button">${escapeHtml(label)}</button></th>`).join("")}</tr></thead><tbody>${matrix.rows.map((row) => `<tr><th>${escapeHtml(row.profile.name)}</th>${row.cells.map((cell) => `<td class="matrix-${escapeHtml(cell.code)}">${escapeHtml(cell.status)}</td>`).join("")}</tr>`).join("") || "<tr><td colspan=2>尚无学生档案</td></tr>"}</tbody></table></div>
      ${selected ? `<section class="matrix-selection"><h4>“${escapeHtml(selected[1])}”需要补测或专项练习的学生</h4><p>${selectedStudents.length ? selectedStudents.map((row) => escapeHtml(row.profile.name)).join("、") : "当前没有需要补测的学生。"}</p>${selectedStudents.length ? `<button class="lab-primary-button" data-lab-action="create-temp-group" data-topic-key="${escapeHtml(selected[0])}" type="button">教师确认建立临时学习小组</button>` : ""}</section>` : ""}
    </section>`;
  }

  function createTemporaryLearningGroup(topicKey) {
    const matrix = classKnowledgeMatrix(lab.state.profiles.filter((item) => item.role === "student"), getQuestions());
    const rows = matrix.rows.filter((row) => row.cells.some((cell) => cell.key === topicKey && ["not-tested", "insufficient", "reinforce"].includes(cell.code)));
    if (!rows.length) {
      showLabMessage("当前知识点没有需要补测的学生。", true);
      return;
    }
    if (!Array.isArray(lab.state.temporaryLearningGroups)) lab.state.temporaryLearningGroups = [];
    lab.state.temporaryLearningGroups.push({
      id: engine.createId("temporary-group"),
      topicKey,
      studentIds: rows.map((row) => row.profile.id),
      type: "temporary-teaching-task",
      teacherConfirmedAt: new Date().toISOString(),
      status: "active"
    });
    saveLearningState();
    showLabMessage(`已建立临时教学任务分组，共 ${rows.length} 名学生；这不是固定能力标签。`);
    renderPanel();
  }

  function parseRosterTable(text) {
    const source = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!source) return { headers: [], rows: [], delimiter: "," };
    const delimiter = source.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
    const rows = [];
    let current = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (character === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        current.push(cell.trim());
        cell = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") index += 1;
        current.push(cell.trim());
        if (current.some(Boolean)) rows.push(current);
        current = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    current.push(cell.trim());
    if (current.some(Boolean)) rows.push(current);
    const headers = rows.shift() || [];
    return { headers, rows, delimiter };
  }

  function rosterFieldForHeader(header) {
    const value = String(header || "").trim().toLocaleLowerCase("zh-CN");
    if (/姓名|学生|name/.test(value)) return "name";
    if (/年级|grade/.test(value)) return "grade";
    if (/目标|goal/.test(value)) return "goal";
    if (/备注|说明|note|analysis/.test(value)) return "analysisNote";
    if (/portableprofileid|portable.?id|跨设备.*id/.test(value)) return "portableProfileId";
    if (/studentnumber|student.?no|学号/.test(value)) return "studentNumber";
    if (/sourceprofileid|来源.*id|档案.*id|学生id|编号/.test(value)) return "sourceProfileId";
    return "";
  }

  function createRosterMapping(headers) {
    const fields = ["name", "grade", "goal", "analysisNote", "sourceProfileId", "studentNumber", "portableProfileId"];
    return Object.fromEntries(fields.map((field) => [
      field,
      headers.findIndex((header) => rosterFieldForHeader(header) === field)
    ]));
  }

  function renderStudentImportPreview() {
    const draft = lab.studentImportDraft;
    if (!draft) return "";
    const options = draft.headers.map((header, index) => `<option value="${index}">${escapeHtml(header || `列${index + 1}`)}</option>`).join("");
    const mapping = draft.mapping || {};
    const rows = draft.rows.map((row, index) => {
      const name = mapping.name >= 0 ? row[mapping.name] || "" : "";
      const grade = mapping.grade >= 0 ? row[mapping.grade] || "" : "";
      const duplicate = draft.duplicates.includes(index);
      const error = draft.errors.find((item) => item.index === index);
      const candidates = lab.state.profiles.filter((profile) => profile.name.trim().toLocaleLowerCase("zh-CN") === String(name).trim().toLocaleLowerCase("zh-CN"));
      const identityStatus = duplicate ? "duplicate-name-warning" : error ? "invalid" : "ready";
      const choice = duplicate ? `<select data-roster-duplicate-action="${index}"><option value="">请选择身份处理</option><option value="new">作为新学生导入</option>${candidates.map((profile) => `<option value="merge:${escapeHtml(profile.id)}">与现有档案合并：${escapeHtml(profile.name)}（${escapeHtml(profile.portableProfileId || profile.id)}）</option>`).join("")}</select>` : "—";
      return `<tr class="${error ? "invalid" : duplicate ? "duplicate" : ""}" data-identity-status="${identityStatus}"><td>${index + 1}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(grade)}</td><td>${escapeHtml(error?.message || (duplicate ? "同名仅是警告，必须明确选择身份处理" : "待确认"))}</td><td>${choice}</td></tr>`;
    }).join("");
    return `<section class="student-import-preview" id="studentImportPreview">
      <h4>导入预览（尚未写入档案）</h4>
      <div class="student-import-mapping">${["name", "grade", "goal", "analysisNote", "sourceProfileId", "studentNumber", "portableProfileId"].map((field) => `<label><span>${field === "name" ? "姓名" : field === "grade" ? "年级" : field === "goal" ? "目标" : field === "analysisNote" ? "备注" : field === "sourceProfileId" ? "来源档案ID" : field === "studentNumber" ? "学号" : "跨设备ID"}</span><select data-roster-map="${field}"><option value="-1"${mapping[field] < 0 ? " selected" : ""}>未映射</option>${draft.headers.map((header, index) => `<option value="${index}"${mapping[field] === index ? " selected" : ""}>${escapeHtml(header || `列${index + 1}`)}</option>`).join("")}</select></label>`).join("")}</div>
       <table><thead><tr><th>#</th><th>姓名</th><th>年级</th><th>检查</th><th>身份处理</th></tr></thead><tbody>${rows || "<tr><td colspan=5>没有可预览的行</td></tr>"}</tbody></table>
       <p>同名不能证明是同一学生；每个警告行必须选择“作为新学生”或明确的现有档案，错误行不会写入。</p>
      <button class="lab-primary-button" data-lab-action="confirm-student-import" type="button"${draft.errors.length ? " disabled" : ""}>确认导入并写入</button>
    </section>`;
  }

  function previewStudentImport(text) {
    const parsed = parseRosterTable(text);
    if (!parsed.headers.length) {
      showLabMessage("没有识别到表头或数据行。", true);
      return;
    }
    const mapping = createRosterMapping(parsed.headers);
    const rows = parsed.rows.slice(0, 500);
    const errors = [];
    const duplicates = [];
    const nameCounts = new Map();
    rows.forEach((row) => {
      const key = mapping.name >= 0 ? String(row[mapping.name] || "").trim().toLocaleLowerCase("zh-CN") : "";
      if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    });
    rows.forEach((row, index) => {
      const name = mapping.name >= 0 ? String(row[mapping.name] || "").trim() : "";
      const grade = mapping.grade >= 0 ? String(row[mapping.grade] || "").trim() : "";
      if (!name) errors.push({ index, message: "姓名为空" });
      if (grade && !["八年级", "九年级", "高一", "高二", "高三"].includes(grade)) errors.push({ index, message: "年级不在支持范围" });
      const key = name.toLocaleLowerCase("zh-CN");
      if (key && ((nameCounts.get(key) || 0) > 1
        || lab.state.profiles.some((profile) => profile.name.trim().toLocaleLowerCase("zh-CN") === key))) duplicates.push(index);
    });
    const identityWarnings = duplicates.map((index) => ({ index, status: "duplicate-name-warning" }));
    lab.studentImportDraft = {
      draftToken: engine.createId("roster-draft"),
      headers: parsed.headers,
      rows,
      mapping,
      errors,
      duplicates,
      identityWarnings,
      text
    };
    renderPanel();
  }

  function confirmStudentImport() {
    const draft = lab.studentImportDraft;
    if (!draft) return;
    const mapping = Object.fromEntries(Object.entries(draft.mapping).map(([field, index]) => {
      const selected = Number(document.querySelector(`[data-roster-map="${field}"]`)?.value);
      return [field, Number.isInteger(selected) ? selected : index];
    }));
    if (mapping.name < 0) {
      showLabMessage("请先把姓名字段映射到表格列。", true);
      return;
    }
    const normalizedRows = draft.rows.map((row, index) => ({
      index,
      name: String(row[mapping.name] || "").trim(),
      grade: String(row[mapping.grade] || "").trim(),
      goal: String(row[mapping.goal] || "").trim(),
      analysisNote: String(row[mapping.analysisNote] || "").trim(),
      sourceProfileId: String(row[mapping.sourceProfileId] || "").trim(),
      studentNumber: String(row[mapping.studentNumber] || "").trim(),
      portableProfileId: String(row[mapping.portableProfileId] || "").trim()
    }));
    const conflicts = [];
    const planned = [];
    const seenStableIds = new Set();
    normalizedRows.forEach((row) => {
      if (!row.name || (row.grade && !["八年级", "九年级", "高一", "高二", "高三"].includes(row.grade))) return;
      const stableValues = [...new Set([row.sourceProfileId, row.studentNumber, row.portableProfileId].filter(Boolean))];
      stableValues.forEach((value) => {
        if (seenStableIds.has(value)) conflicts.push(`稳定学生ID在本次文件中重复：${value}`);
        seenStableIds.add(value);
      });
      const matchedProfiles = stableValues.map((value) => engine.resolveImportedStudentId(lab.state, value))
        .filter((result) => result.status === "matched")
        .map((result) => result.profile);
      const matchedProfileIds = [...new Set(matchedProfiles.map((profile) => profile.id))];
      if (matchedProfileIds.length > 1) conflicts.push(`同一行的稳定ID指向不同学生：${row.name}`);
      const byStable = matchedProfileIds.length === 1 ? matchedProfiles[0] : null;
      const duplicateAction = draft.duplicates.includes(row.index)
        ? String(document.querySelector(`[data-roster-duplicate-action="${row.index}"]`)?.value || "")
        : "new";
      if (draft.duplicates.includes(row.index) && !duplicateAction && !byStable) conflicts.push(`同名学生未选择身份处理：${row.name}`);
      const explicitMergeId = duplicateAction.startsWith("merge:") ? duplicateAction.slice(6) : "";
      const explicitMerge = explicitMergeId ? lab.state.profiles.find((profile) => profile.id === explicitMergeId) : null;
      if (explicitMergeId && !explicitMerge) conflicts.push(`合并目标不存在：${row.name}`);
      if (byStable && explicitMerge && byStable.id !== explicitMerge.id) conflicts.push(`稳定ID与选择的合并档案冲突：${row.name}`);
      if (explicitMerge && row.portableProfileId && explicitMerge.portableProfileId !== row.portableProfileId) {
        conflicts.push(`跨设备ID与选择的合并档案冲突：${row.name}`);
      }
      planned.push({ row, existing: byStable || explicitMerge || null, createNew: !byStable && duplicateAction === "new" });
    });
    if (conflicts.length) {
      showLabMessage(`导入存在冲突，未写入：${conflicts.join("；")}`, true);
      return;
    }
    planned.forEach(({ row, existing, createNew }) => {
      const changes = {
        name: row.name,
        grade: row.grade || existing?.grade || "高一",
        goal: row.goal || existing?.goal,
        analysisNote: row.analysisNote || existing?.analysisNote,
        sourceProfileId: row.sourceProfileId || existing?.sourceProfileId || "",
        studentNumber: row.studentNumber || existing?.studentNumber || "",
        portableProfileId: row.portableProfileId || existing?.portableProfileId || engine.createPortableProfileId(),
        dataSource: "roster-import"
      };
      if (existing && !createNew) engine.updateProfile(lab.state, existing.id, changes);
      else engine.addProfile(lab.state, changes);
    });
    lab.studentImportDraft = null;
    saveLearningState();
    showLabMessage(`已确认导入 ${planned.length} 名学生；每个身份均按稳定ID或教师明确选择处理。`);
    renderPanel();
  }

  function examFieldForHeader(header) {
    const value = String(header || "").trim().toLocaleLowerCase("zh-CN");
    if (/studentid|学生id|学生编号|学号/.test(value)) return "studentId";
    if (/examid|试卷id|试卷编号/.test(value)) return "examId";
    if (/questionno|题号|小题号/.test(value)) return "questionNo";
    if (/questionid|题目id|题目编号/.test(value)) return "questionId";
    if (/maxscore|max|小题满分/.test(value)) return "maxScore";
    if (/topickey|知识点编号|考点编号/.test(value)) return "topicKey";
    if (/questiontype|题型/.test(value)) return "questionType";
    if (/记录id|记录编号|examid|recordid|id/.test(value)) return "sourceRecordId";
    if (/试卷名称|试卷名|名称|title|exam/.test(value)) return "title";
    if (/考试日期|日期|date/.test(value)) return "examDate";
    if (/得分|成绩|score/.test(value)) return "score";
    if (/总分|满分|maxscore|max/.test(value)) return "totalScore";
    if (/薄弱|知识点|考点|topic|weak/.test(value)) return "weakTopics";
    if (/备注|说明|note/.test(value)) return "note";
    return "";
  }

  function createExamMapping(headers) {
    const fields = ["studentId", "examId", "questionNo", "questionId", "sourceRecordId", "title", "examDate", "score", "totalScore", "maxScore", "topicKey", "questionType", "weakTopics", "note"];
    return Object.fromEntries(fields.map((field) => [
      field,
      headers.findIndex((header) => examFieldForHeader(header) === field)
    ]));
  }

  function examImportValue(draft, row, field) {
    const index = Number(draft.mapping?.[field]);
    return index >= 0 ? String(row[index] || "").trim() : "";
  }

  function examImportDuplicateKey(record) {
    return [
      String(record.title || "").trim().toLocaleLowerCase("zh-CN"),
      String(record.examDate || "").trim(),
      String(record.score ?? "").trim(),
      String(record.totalScore ?? "").trim(),
      String(record.weakTopics || "").trim().toLocaleLowerCase("zh-CN")
    ].join("|");
  }

  function buildExamImportDraft(headers, rows, text = "", mappingOverride = null) {
    const draft = {
      headers,
      rows: rows.slice(0, 500),
      mapping: mappingOverride || createExamMapping(headers),
      errors: [],
      duplicates: [],
      text
    };
    const existing = new Set(lab.state.examRecords
      .filter((record) => record.profileId === lab.state.activeProfileId)
      .map(examImportDuplicateKey));
    const seen = new Map();
    draft.rows.forEach((row, index) => {
      const title = examImportValue(draft, row, "title");
      const examDate = examImportValue(draft, row, "examDate");
      const scoreRaw = examImportValue(draft, row, "score");
      const totalRaw = examImportValue(draft, row, "totalScore");
      const maxRaw = examImportValue(draft, row, "maxScore");
      const score = Number(scoreRaw);
      const totalScore = Number(totalRaw || maxRaw);
      const errors = [];
      if (!scoreRaw || !Number.isFinite(score)) errors.push("得分无效");
      if (Number.isFinite(score) && score < 0) errors.push("得分不能小于0");
      if ((!totalRaw && !maxRaw) || !Number.isFinite(totalScore) || totalScore <= 0) errors.push("总分或小题满分必须大于0");
      if (Number.isFinite(score) && Number.isFinite(totalScore) && score >= 0 && score > totalScore) errors.push("得分不能超过总分");
      if (!examDate || Number.isNaN(new Date(examDate).getTime())) errors.push("考试日期无效");
      if (errors.length) draft.errors.push({ index, message: errors.join("；") });
      const key = examImportDuplicateKey({
        title,
        examDate,
        score: scoreRaw,
        totalScore: totalRaw,
        weakTopics: examImportValue(draft, row, "weakTopics")
      });
      if (key !== "||||" && (seen.has(key) || existing.has(key))) draft.duplicates.push(index);
      if (key !== "||||") seen.set(key, index);
    });
    return draft;
  }

  function renderExamImportPreview() {
    const draft = lab.examImportDraft;
    if (!draft) return "";
    const fields = [
      ["studentId", "学生ID"],
      ["examId", "试卷ID"],
      ["questionNo", "题号"],
      ["questionId", "题目ID"],
      ["sourceRecordId", "记录ID"],
      ["title", "试卷名称"],
      ["examDate", "考试日期"],
      ["score", "得分"],
      ["totalScore", "总分"],
      ["maxScore", "小题满分"],
      ["topicKey", "知识点编号"],
      ["questionType", "题型"],
      ["weakTopics", "薄弱知识点"],
      ["note", "备注"]
    ];
    const options = (selected) => `<option value="-1"${selected < 0 ? " selected" : ""}>未映射</option>${draft.headers.map((header, index) => `<option value="${index}"${selected === index ? " selected" : ""}>${escapeHtml(header || `列${index + 1}`)}</option>`).join("")}`;
    const groups = buildExamImportPreviewGroups(draft);
    const rows = groups.map((group, index) => `<tr class="${group.statusCode === "ready" ? "" : "invalid"}">
      <td>${index + 1}</td><td>${escapeHtml(group.rawStudentIds.join("、") || "当前档案兼容模式")}</td>
      <td>${escapeHtml(group.matchedStudentName || "未匹配")}</td><td>${escapeHtml(group.profileId || "—")}</td>
      <td>${escapeHtml(group.examId)}</td><td>${group.rowCount}</td><td>${group.score}/${group.totalScore}</td>
      <td>${escapeHtml(group.status)}</td></tr>`).join("");
    return `<section class="exam-import-preview" id="examImportPreview">
      <h4>试卷导入预览（尚未写入档案）</h4>
      <div class="student-import-mapping">${fields.map(([field, label]) => `<label><span>${label}</span><select data-exam-map="${field}">${options(Number(draft.mapping?.[field] ?? -1))}</select></label>`).join("")}</div>
      <table><thead><tr><th>#</th><th>原学生ID</th><th>匹配学生</th><th>内部 profileId</th><th>试卷ID</th><th>行数</th><th>总得分/总分</th><th>状态</th></tr></thead><tbody>${rows || "<tr><td colspan=8>没有可预览的分组</td></tr>"}</tbody></table>
      <p>分组键为“内部 profileId + 试卷ID”。未匹配学生或同组题号冲突会阻止写入，绝不回退到当前学生。</p>
      <button class="lab-primary-button" data-lab-action="confirm-exam-import" type="button"${draft.errors.length || groups.some((group) => group.statusCode !== "ready") ? " disabled" : ""}>确认导入试卷记录</button>
    </section>`;
  }

  function buildExamImportPreviewGroups(draft) {
    const questionLevel = Number(draft.mapping?.questionNo) >= 0
      || Number(draft.mapping?.questionId) >= 0
      || Number(draft.mapping?.examId) >= 0;
    const singleStudentMode = Number(draft.mapping?.studentId) < 0;
    const groups = new Map();
    draft.rows.forEach((row, index) => {
      const rawStudentId = examImportValue(draft, row, "studentId");
      const resolved = singleStudentMode
        ? (() => {
          const profile = lab.state.profiles.find((item) => item.id === lab.state.activeProfileId);
          return profile ? { status: "matched", profileId: profile.id, profile } : { status: "unresolved" };
        })()
        : engine.resolveImportedStudentId(lab.state, rawStudentId);
      const title = examImportValue(draft, row, "title") || "未命名试卷";
      const examId = examImportValue(draft, row, "examId")
        || examImportValue(draft, row, "sourceRecordId")
        || `${title}|${examImportValue(draft, row, "examDate")}`;
      const key = resolved.status === "matched"
        ? `${resolved.profileId}|${examId}`
        : `unresolved|${index}|${examId}`;
      const current = groups.get(key) || {
        rawStudentIds: [], matchedStudentName: resolved.profile?.name || "", profileId: resolved.profileId || "",
        examId, rowCount: 0, score: 0, totalScore: 0, questionNos: new Set(), conflicts: [], errors: []
      };
      if (rawStudentId) current.rawStudentIds.push(rawStudentId);
      current.rowCount += 1;
      const score = Number(examImportValue(draft, row, "score"));
      const maxScore = Number(examImportValue(draft, row, "maxScore") || examImportValue(draft, row, "totalScore"));
      if (Number.isFinite(score)) current.score += score;
      if (Number.isFinite(maxScore)) current.totalScore += maxScore;
      const questionNo = examImportValue(draft, row, "questionNo");
      if (questionLevel && questionNo && current.questionNos.has(questionNo)) current.conflicts.push(questionNo);
      if (questionNo) current.questionNos.add(questionNo);
      const rowError = draft.errors.find((item) => item.index === index);
      if (rowError) current.errors.push(rowError.message);
      if (resolved.status !== "matched") current.errors.push(resolved.status === "ambiguous" ? "学生ID匹配到多个档案" : "学生ID未匹配");
      groups.set(key, current);
    });
    return [...groups.values()].map((group) => {
      const reasons = [...new Set([...group.errors, ...(group.conflicts.length ? [`题号冲突：${group.conflicts.join("、")}`] : [])])];
      return {
        ...group,
        rawStudentIds: [...new Set(group.rawStudentIds)],
        statusCode: reasons.length ? "blocked" : "ready",
        status: reasons.length ? `阻止写入：${reasons.join("；")}` : "可写入"
      };
    });
  }

  function previewExamImport(text) {
    const parsed = parseRosterTable(text);
    if (!parsed.headers.length) {
      showLabMessage("没有识别到试卷记录表头或数据行。", true);
      return;
    }
    lab.examImportDraft = buildExamImportDraft(parsed.headers, parsed.rows, text);
    renderPanel();
  }

  function previewExamImportRecords(records) {
    const fields = ["studentId", "examId", "questionNo", "questionId", "sourceRecordId", "title", "examDate", "score", "totalScore", "maxScore", "topicKey", "questionType", "weakTopics", "note"];
    const headers = ["学生ID", "试卷ID", "题号", "题目ID", "记录ID", "试卷名称", "考试日期", "得分", "总分", "小题满分", "知识点编号", "题型", "薄弱知识点", "备注"];
    const rows = records.slice(0, 500).map((record) => fields.map((field) => {
      if (field === "weakTopics") return Array.isArray(record[field]) ? record[field].join("、") : String(record[field] || "");
      return String(record[field] ?? "");
    }));
    lab.examImportDraft = buildExamImportDraft(
      headers,
      rows,
      "json",
      Object.fromEntries(fields.map((field, index) => [field, index]))
    );
    renderPanel();
  }

  function confirmExamImport() {
    const draft = lab.examImportDraft;
    if (!draft) return;
    const mapping = Object.fromEntries(Object.keys(createExamMapping(draft.headers)).map((field) => {
      const selected = Number(document.querySelector(`[data-exam-map="${field}"]`)?.value);
      return [field, Number.isInteger(selected) ? selected : -1];
    }));
    if (mapping.score < 0 || mapping.examDate < 0 || (mapping.totalScore < 0 && mapping.maxScore < 0)) {
      showLabMessage("请先映射考试日期、得分，以及总分或小题满分字段。", true);
      return;
    }
    const read = (row, field) => examImportValue({ mapping }, row, field);
    const questionMap = new Map(getQuestions().map((question) => [question.id, question]));
    const questionLevel = mapping.questionNo >= 0 || mapping.questionId >= 0 || mapping.examId >= 0;
    const singleStudentMode = mapping.studentId < 0;
    const unresolved = [];
    const resolveRowProfile = (row, index) => {
      const rawStudentId = read(row, "studentId");
      if (!rawStudentId && singleStudentMode) {
        const profile = lab.state.profiles.find((item) => item.id === lab.state.activeProfileId);
        return profile ? { status: "matched", profileId: profile.id, profile, rawStudentId: "(当前档案兼容模式)" } : { status: "unresolved", profileId: "" };
      }
      const resolved = engine.resolveImportedStudentId?.(lab.state, rawStudentId)
        || { status: "unresolved", profileId: "" };
      if (resolved.status !== "matched") unresolved.push({ index, rawStudentId, status: resolved.status });
      return resolved;
    };
    const rowProfiles = draft.rows.map(resolveRowProfile);
    if (unresolved.length) {
      const detail = unresolved.slice(0, 5).map((item) => `第${item.index + 1}行学生ID“${item.rawStudentId || "空"}”${item.status === "ambiguous" ? "对应多个档案" : "无法匹配"}`).join("；");
      showLabMessage(`导入已阻止：${detail}。请补充稳定学生ID/学号/portableProfileId，不能按姓名静默归档。`, true);
      return;
    }
    let records;
    if (questionLevel) {
      const grouped = new Map();
      draft.rows.forEach((row, index) => {
        const resolved = rowProfiles[index];
        if (!resolved?.profileId) return;
        const title = read(row, "title") || "未命名试卷";
        const examDate = read(row, "examDate");
        const sourceRecordId = read(row, "sourceRecordId");
        const examId = read(row, "examId") || sourceRecordId || `${title}|${examDate}`;
        const groupKey = `${resolved.profileId}|${examId}`;
        const group = grouped.get(groupKey) || {
          sourceRecordId: sourceRecordId || examId,
          profileId: resolved.profileId,
          matchedStudentName: resolved.profile.name,
          examId,
          title,
          examDate,
          score: 0,
          totalScore: 0,
          weakTopics: [],
          questionEvidence: [],
          note: read(row, "note"),
          sourceStudentId: read(row, "studentId"),
          questionNos: new Set(),
          conflictRows: []
        };
        const score = Number(read(row, "score"));
        const maxScore = Number(read(row, "maxScore"));
        const examTotal = Number(read(row, "totalScore"));
        const effectiveMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : (group.questionEvidence.length ? 0 : examTotal);
        if (Number.isFinite(score)) group.score += score;
        if (Number.isFinite(effectiveMax) && effectiveMax > 0) group.totalScore += effectiveMax;
        const questionId = read(row, "questionId");
        const questionNo = read(row, "questionNo");
        if (questionNo && group.questionNos.has(questionNo)) group.conflictRows.push(index);
        if (questionNo) group.questionNos.add(questionNo);
        const question = questionMap.get(questionId);
        const topicKey = read(row, "topicKey") || (question ? engine.topicKeyForQuestion(question) : "");
        const questionType = read(row, "questionType") || question?.questionType || "";
        if (topicKey && Number.isFinite(score) && Number.isFinite(effectiveMax) && score < effectiveMax) group.weakTopics.push(topicKey);
        group.questionEvidence.push({
          rowIndex: index,
          studentId: read(row, "studentId"),
          examId,
          questionNo,
          questionId,
          score: Number.isFinite(score) ? score : null,
          maxScore: Number.isFinite(effectiveMax) ? effectiveMax : null,
          topicKey,
          questionType
        });
        grouped.set(groupKey, group);
      });
      const conflicted = [...grouped.values()].filter((record) => record.conflictRows.length);
      if (conflicted.length) {
        showLabMessage(`导入已阻止：${conflicted.map((record) => `${record.matchedStudentName}/${record.examId} 存在重复题号`).join("；")}`, true);
        return;
      }
      records = [...grouped.values()].map((record) => ({
        ...record,
        questionNos: undefined,
        conflictRows: undefined,
        weakTopics: [...new Set(record.weakTopics)],
        totalScore: record.totalScore > 0 ? record.totalScore : Number(record.score) || 0,
        questionLevel: true
      }));
    } else {
      records = draft.rows.map((row, index) => ({
        profileId: rowProfiles[index].profileId,
        sourceStudentId: read(row, "studentId"),
        sourceRecordId: read(row, "sourceRecordId"),
        title: read(row, "title") || "未命名试卷",
        examDate: read(row, "examDate"),
        score: Number(read(row, "score")),
        totalScore: Number(read(row, "totalScore") || read(row, "maxScore")),
        weakTopics: read(row, "weakTopics").split(/[、,，;；\n\r]+/).map((item) => item.trim()).filter(Boolean),
        note: read(row, "note")
      }));
    }
    const result = engine.importExamRecords(lab.state, records, singleStudentMode ? lab.state.activeProfileId : null);
    const importedProfileIds = new Set(records.map((record) => record.profileId).filter(Boolean));
    lab.state.examRecords = lab.state.examRecords.map((record) => {
      return importedProfileIds.has(record.profileId)
        ? engine.resolveExamRecordTopics(record, getQuestions())
        : record;
    });
    lab.examImportDraft = null;
    saveLearningState();
    showLabMessage(`已确认导入 ${result.added.length} 条试卷记录；重复 ${result.skipped.length} 条，冲突 ${result.conflicts.length} 条，无效 ${result.errors.length} 条。`, result.errors.length > 0 || result.conflicts.length > 0);
    renderPanel();
  }

  async function loadStudentRosterFile(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("学生名单文件不能超过5 MB。");
      previewStudentImport(await file.text());
    } catch (error) {
      showLabMessage(error.message, true);
    }
  }

  function buildTeacherTodoItems(profiles, questions) {
    const items = [];
    profiles.forEach((profile) => {
      const attempts = lab.state.attempts.filter((item) => item.profileId === profile.id);
      const pendingAttemptReviews = attempts.filter((item) => engine.isPendingManualReview?.(item)).length;
      const diagnostics = lab.state.diagnosticAttempts.filter((item) => item.profileId === profile.id);
      const pendingDiagnostic = diagnostics.find((item) => {
        return item.classification === "high-confidence-error";
      });
      const due = engine.dueReviews(lab.state, Date.now(), profile.id);
      const activePlan = engine.activeLearningPlan(lab.state, profile.id);
      const planProgress = engine.learningPlanProgress(lab.state, activePlan);
      const exams = lab.state.examRecords.filter((item) => item.profileId === profile.id);
      const latestPlanAt = activePlan ? new Date(activePlan.createdAt || 0).getTime() : 0;
      const newExam = exams.find((item) => new Date(item.createdAt || item.examDate || 0).getTime() > latestPlanAt);
      const placement = engine.placementStatus?.(lab.state, profile.id)
        || { status: "legacy-unknown", label: "需补做摸底" };
      if (["not-started", "in-progress", "legacy-unknown"].includes(placement.status)) items.push({
        profileId: profile.id,
        tone: "diagnostic",
        actionId: placement.status === "in-progress" ? "placement.resume" : "placement.start",
        title: `${profile.name}${placement.status === "in-progress" ? "正在进行摸底" : placement.status === "legacy-unknown" ? "历史档案尚未形成明确摸底证据" : "尚未开始摸底"}`,
        detail: placement.status === "in-progress" ? `已提交 ${placement.submittedCount || 0} 题，请继续完成同一会话。` : "普通练习、诊断或阶段检测不会被自动视为摸底完成。",
        action: placement.status === "in-progress" ? "继续摸底" : "开始摸底"
      });
      if (pendingAttemptReviews) items.push({
        profileId: profile.id,
        tone: "warning",
        actionId: "answer.review",
        title: `${profile.name}有${pendingAttemptReviews}条作答待人工复核`,
        detail: "开放题、实验题和建模证据保留原始回答，不计入正确率或错题推荐。",
        action: "查看证据"
      });
      if (pendingDiagnostic) items.push({
        profileId: profile.id,
        tone: "warning",
        actionId: "answer.review",
        title: `${profile.name}有待验证高置信错误`,
        detail: "单次高置信错误不能直接称为稳定误概念，需要教师查看原始证据。",
        action: "查看证据"
      });
      if (activePlan && planProgress.total > 0 && planProgress.completed >= planProgress.total) items.push({
        profileId: profile.id,
        tone: "review",
        actionId: "retest.schedule",
        title: `${profile.name}专项方案已完成`,
        detail: "专项题目已完成，等待迁移或延迟复测。",
        action: "安排复测"
      });
      if (due.length >= 3) items.push({
        profileId: profile.id,
        tone: "review",
        actionId: "review.overdue",
        title: `${profile.name}有${due.length}条复习积压`,
        detail: "到期复习数量达到提醒阈值。",
        action: "处理复习"
      });
      if (newExam && (!activePlan || planProgress.completed >= planProgress.total)) items.push({
        profileId: profile.id,
        tone: "exam",
        actionId: "exam.create-plan",
        title: `${profile.name}有新试卷尚未形成方案`,
        detail: `最近试卷：${newExam.title || "未命名试卷"}。`,
        action: "确认专项方案"
      });
    });
    const manualReviewCount = Object.values(lab.state.contentReviews || {})
      .filter((item) => item && !["approved", "teacher-approved"].includes(item.status)).length;
    if (manualReviewCount) items.push({
      profileId: lab.managedStudentId || lab.state.activeProfileId,
      tone: "warning",
      actionId: "content.review",
      title: `题库内容待审核 ${manualReviewCount} 项`,
      detail: "这是题库来源与解析审核，不是学生作答批阅。",
      action: "审核内容"
    });
    const pendingVariantSets = (lab.state.variantSets || []).filter((set) => set.status === "pending-review" && set.stale !== true);
    if (pendingVariantSets.length) items.unshift({
      profileId: lab.managedStudentId || lab.state.activeProfileId,
      tone: "warning",
      actionId: "variant.review",
      title: `待审核 AI 变式 ${pendingVariantSets.length} 组`,
      detail: "AI 变式尚未进入学生训练；可在今日页直接通过、退回、编辑或重新生成。",
      action: "立即审核"
    });
    return items.slice(0, 12);
  }

  function renderTeacherTodoItems(items) {
    return items.length ? items.map((item) => `
      <article class="teacher-todo-item todo-${escapeHtml(item.tone)}">
        <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div>
        <button class="lab-primary-button" data-lab-action="${item.actionId === "variant.review" ? "open-variant-review-queue" : "select-student"}" data-profile-id="${escapeHtml(item.profileId)}" data-todo-action="${escapeHtml(item.action)}" data-action-id="${escapeHtml(item.actionId || "student.open")}" type="button">${escapeHtml(item.action)}</button>
      </article>`).join("") : `<p class="teacher-todo-empty">今日没有需要立即处理的待办；仍可从下方高级工具查看完整记录。</p>`;
  }

  function renderVariantReviewQueue(questions) {
    const pending = (lab.state.variantSets || []).filter((set) => set.status === "pending-review" && set.stale !== true);
    if (!pending.length) return "";
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    return `<section class="lab-card variant-review-queue" id="variantReviewQueue">
      <div class="lab-card-head"><div><span>AI VARIANT REVIEW</span><h3>待审核 AI 变式</h3></div><strong>${pending.length} 组</strong></div>
      <p>每组先显示母题、改变内容、答案、解法和独立校验结果。教师确认前不会下发。</p>
      ${pending.map((set) => {
        const parent = questionMap.get(set.parentQuestionId);
        return `<article class="variant-review-set" data-variant-review-set="${escapeHtml(set.id)}">
          <header><div><span>母题</span><h4>${escapeHtml(parent?.title || set.parentQuestionId)}</h4><p>${escapeHtml(parent?.content || "母题正文未在当前设备加载")}</p></div><strong>${escapeHtml(set.generationMode === "controlled-ai-gateway" ? "应用内 AI 生成变式" : "本地题模")}</strong></header>
          <div class="variant-review-grid">${set.variants.map((variant) => `<section data-variant-edit-card="${escapeHtml(variant.id)}">
            <span>${escapeHtml(variant.variantRoleLabel)}</span>
            <label>标题<input data-variant-edit-field="title" value="${escapeHtml(variant.title)}"></label>
            <label>完整题干<textarea data-variant-edit-field="content" rows="5">${escapeHtml(variant.content)}</textarea></label>
            <label>标准答案<textarea data-variant-edit-field="answer" rows="3">${escapeHtml(variant.answer)}</textarea></label>
            <label>完整解析<textarea data-variant-edit-field="solution" rows="6">${escapeHtml(variant.solution)}</textarea></label>
            <p><strong>变化：</strong>${escapeHtml(variant.changeSummary)}</p>
            <p><strong>校验：</strong>${variant.validation?.passed ? "关键门禁通过" : `未通过：${escapeHtml((variant.validation?.failedReasons || []).join("；"))}`}</p>
            <div class="teacher-inline-actions"><button data-variant-review="approve" data-set-id="${escapeHtml(set.id)}" data-variant-id="${escapeHtml(variant.id)}" type="button">通过</button><button data-variant-review="save-edit" data-set-id="${escapeHtml(set.id)}" data-variant-id="${escapeHtml(variant.id)}" type="button">保存编辑</button><button data-variant-review="regenerate-one" data-set-id="${escapeHtml(set.id)}" data-variant-id="${escapeHtml(variant.id)}" type="button">重新生成这一题</button><button data-variant-review="reject" data-set-id="${escapeHtml(set.id)}" data-variant-id="${escapeHtml(variant.id)}" type="button">退回</button></div>
          </section>`).join("")}</div>
          <footer class="teacher-inline-actions"><button class="lab-primary-button" data-variant-review="approve-all" data-set-id="${escapeHtml(set.id)}" type="button">全部通过</button><button class="lab-primary-button" data-variant-review="approve-and-add" data-set-id="${escapeHtml(set.id)}" type="button">全部通过并加入作业</button><button class="lab-secondary-button" data-variant-review="regenerate" data-set-id="${escapeHtml(set.id)}" type="button">重新生成本组</button></footer>
        </article>`;
      }).join("")}
    </section>`;
  }

  function renderQuestionBankCoverage(coverage) {
    return `
      <section class="lab-card content-coverage-card teacher-advanced-section">
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
      </section>`;
  }

  function renderStudentDecisionLoop(profile, analysis, state) {
    const coverage = analysis?.evidenceCoverage || {
      coverageLabel: "0/0",
      levelLabel: "证据不足",
      reason: "尚未形成可追溯的知识点证据覆盖。",
      byTopic: []
    };
    const priorities = (analysis?.weakest || []).slice(0, 3);
    const profileId = profile?.id || "";
    const placement = engine.placementStatus(state, profileId);
    const evidenceForTopic = (topic) => {
      const topicKey = topic.topicKey || window.PHYSICS_LEARNING_ENGINE?.normalizeTopic?.(topic.topic)?.key || "";
      const attempts = (state.attempts || []).filter((item) => {
        if (item.profileId !== profileId) return false;
        return item.topicKey === topicKey
          || window.PHYSICS_LEARNING_ENGINE?.normalizeTopic?.(item.topic)?.key === topicKey;
      });
      const exams = (state.examRecords || []).filter((item) => {
        if (item.profileId !== profileId) return false;
        const keys = item.weakTopicKeys || [];
        return keys.includes(topicKey)
          || (item.weakTopics || []).some((label) => window.PHYSICS_LEARNING_ENGINE?.normalizeTopic?.(label)?.key === topicKey);
      });
      const diagnostics = (state.diagnosticAttempts || []).filter((item) => {
        if (item.profileId !== profileId) return false;
        return item.topicKey === topicKey || item.topic === topic.topic;
      });
      const raw = [
        ...attempts.slice(0, 3).map((item) => `正式作答 ${item.id || "无ID"} · ${formatDate(item.completedAt || item.createdAt)}`),
        ...exams.slice(0, 3).map((item) => `试卷 ${item.id || "无ID"} · ${item.title || "未命名"} · ${Number(item.score)}/${Number(item.totalScore)}`),
        ...diagnostics.slice(0, 3).map((item) => `诊断 ${item.id || "无ID"} · ${formatDate(item.createdAt)}`)
      ];
      return { attempts, exams, diagnostics, raw: raw.length ? raw : ["暂无可追溯原始记录"] };
    };
    return `
      <section class="lab-card student-decision-loop">
        <div class="lab-card-head"><div><span>STUDENT DECISION LOOP</span><h3>${escapeHtml(profile?.name || "当前学生")}当前证据与优先问题</h3></div><strong>${escapeHtml(coverage.levelLabel || "证据不足")}</strong></div>
        <div class="decision-evidence-quality">
          <strong>摸底基线：${escapeHtml(placement.label || placement.status)}</strong>
          ${placement.status === "legacy-unknown" ? `<p>历史普通练习不能自动等同学期初摸底。请选择补做正式摸底，或明确记录“以现有证据开始教学”；后者不会伪造摸底已完成。</p><div class="teacher-inline-actions"><button type="button" data-lab-action="placement-baseline-decision" data-decision="supplement-placement">补做摸底</button><button type="button" data-lab-action="placement-baseline-decision" data-decision="use-existing-evidence">以现有证据开始教学</button></div>` : ""}
          <strong>1. 当前证据质量：${escapeHtml(coverage.levelLabel || "证据不足")}</strong>
          <span>知识点证据覆盖 ${escapeHtml(coverage.coverageLabel || "0/0")}（已有证据/可评估知识点）</span>
          <p>${escapeHtml(coverage.reason || "证据不足，不能形成总体能力结论。")}</p>
        </div>
        <div class="decision-priority-list">
          <h4>2. 最多三个优先问题</h4>
          ${priorities.length ? priorities.map((topic) => `<article>
            <div><strong>${escapeHtml(topic.topic)}</strong><span>${escapeHtml(topic.status || "证据不足")} · ${topic.sampleSize || topic.attempts || 0} 条证据</span></div>
            <p>${escapeHtml((topic.reasons || ["需要教师结合原始证据确认"]).slice(0, 3).join("；"))}</p>
          </article>`).join("") : "<p>当前没有达到优先问题门槛的知识点；证据不足不等于已掌握。</p>"}
        </div>
        <div class="decision-raw-evidence">
          <h4>3. 每个问题的原始证据</h4>
          ${priorities.length ? priorities.map((topic) => {
            const evidence = evidenceForTopic(topic);
            return `<article><strong>${escapeHtml(topic.topic)}</strong><span>正式作答 ${evidence.attempts.length} 次 · 试卷 ${evidence.exams.length} 份 · 诊断 ${evidence.diagnostics.length} 条</span><ul>${evidence.raw.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><small>${topic.examMentions ? "已确认：试卷记录明确标记该知识点。" : "待验证：需要教师结合原始作答、错误理由或迁移表现复核。"}</small></article>`;
          }).join("") : "<p>尚无可展示的原始问题证据。</p>"}
        </div>
      </section>`;
  }

  function renderTargetedRetestStatus(state, profileId, plan, planProgress) {
    if (!plan) return "";
    const transfers = (state.experimentRecords || []).filter((item) => item.profileId === profileId && item.type === "transfer");
    const planStartedAt = new Date(plan.createdAt || 0).getTime();
    const retestAttempts = (state.attempts || []).filter((item) => item.profileId === profileId
      && new Date(item.completedAt || item.createdAt || 0).getTime() >= planStartedAt);
    const verifiedTransfers = transfers.filter((item) => ["教师已通过", "自动判定正确"].includes(item.verificationStatus));
    return `<section class="targeted-retest-status">
      <header><strong>6—8. 完成进度、复测与达标条件</strong><span>${planProgress.completed}/${planProgress.total} 已完成</span></header>
      <p>专项完成 ${planProgress.completed}/${planProgress.total}；方案后正式作答 ${retestAttempts.length} 次；迁移记录 ${transfers.length} 条，其中 ${verifiedTransfers.length} 条已有质量核验。</p>
      <small>预定达标条件：${escapeHtml(plan.target || "教师需复核跨日期独立正确与迁移证据")}。未满足条件时保持待复测，不自动标记为已掌握。</small>
    </section>`;
  }

  function renderManualReviewQueue(state, questions, profileId) {
    const questionMap = new Map((questions || []).map((question) => [question.id, question]));
    const pending = (state.attempts || [])
      .filter((attempt) => engine.isPendingManualReview?.(attempt))
      .slice(-100)
      .reverse();
    const groups = new Map();
    pending.forEach((attempt) => {
      const question = questionMap.get(attempt.questionId) || {};
      const rubricKey = `${attempt.questionId}|${question.rubricId || question.questionType || attempt.questionType || "开放题"}`;
      const group = groups.get(rubricKey) || { question, attempts: [] };
      group.attempts.push(attempt);
      groups.set(rubricKey, group);
    });
    const profiles = new Map((state.profiles || []).map((profile) => [profile.id, profile]));
    return `<section class="lab-card manual-review-queue manual-review-workbench" id="teacher-manual-review">
      <div class="lab-card-head"><div><span>STUDENT ANSWER REVIEW</span><h3>学生作答待批阅</h3></div><strong>${pending.length}</strong></div>
      <p>按题目与评分量规分组连续批阅。聚焦某份答案后可按 1/2/3 快捷选择正确、部分正确、需订正；教师确认前不进入正式正确率。</p>
      ${pending.length ? `<div class="manual-review-list">${[...groups.values()].map(({ question, attempts }) => `
        <section class="manual-review-group"><header><strong>${escapeHtml(question?.title || attempts[0].questionId)}</strong><span>${escapeHtml(question?.questionType || attempts[0].questionType || "开放题")} · ${attempts.length} 份</span></header>
        ${attempts.map((attempt) => {
          const student = profiles.get(attempt.profileId);
          const suggestion = attempt.reviewSuggestion;
          return `<article tabindex="0" data-review-attempt="${escapeHtml(attempt.id)}"><div><strong>${escapeHtml(student?.name || "未知学生")}</strong><span>${escapeHtml(attempt.topic || question?.topic || "未标注知识点")} · ${escapeHtml(attempt.createdAt || "")}</span><p>${escapeHtml(attempt.finalAnswer || attempt.answer || "未填写作答")}</p>${suggestion ? `<small>AI 仅供参考：${escapeHtml(suggestion.suggestedComment || "无评语")}；不确定项：${escapeHtml((suggestion.uncertainties || []).join("、") || "未说明")}。尚未写入正式评分。</small>` : ""}</div><div class="teacher-inline-actions"><button class="lab-secondary-button" data-lab-action="complete-manual-review" data-attempt-id="${escapeHtml(attempt.id)}" data-review-status="correct" data-review-score="1" data-review-comment="关键规律、过程与结论符合评分量规。" type="button">1 正确</button><button class="lab-secondary-button" data-lab-action="complete-manual-review" data-attempt-id="${escapeHtml(attempt.id)}" data-review-status="partial" data-review-score="0.5" data-review-comment="方法部分正确，需补全关键步骤或条件。" type="button">2 部分正确</button><button class="lab-secondary-button" data-lab-action="complete-manual-review" data-attempt-id="${escapeHtml(attempt.id)}" data-review-status="incorrect" data-review-score="0" data-review-comment="关键建模或结论不符合评分量规，需重新订正。" type="button">3 需订正</button></div></article>`;
        }).join("")}</section>`).join("")}</div>` : `<p class="teacher-todo-empty">当前没有学生作答待人工复核。</p>`}
    </section>`;
  }

  function buildDataHealthIssues(profiles, questions) {
    const issues = [];
    const add = (issue) => issues.push({ severity: "warning", ...issue });
    const invalidIdentity = profiles.filter((profile) => !String(profile.portableProfileId || "").trim());
    if (invalidIdentity.length) add({ code: "identity.missing", title: `${invalidIdentity.length} 名学生缺少稳定跨设备ID`, action: "修复学生档案", targetView: "students", profileId: invalidIdentity[0].id, selector: ".student-manager-card" });
    const byName = new Map();
    profiles.forEach((profile) => {
      const key = String(profile.name || "").trim().toLocaleLowerCase("zh-CN");
      if (key) byName.set(key, [...(byName.get(key) || []), profile]);
    });
    const duplicateNames = [...byName.values()].filter((items) => items.length > 1).flat();
    if (duplicateNames.length) add({ code: "identity.duplicate-name", title: `发现 ${duplicateNames.length} 个同名档案，需核对稳定ID`, action: "核对同名学生", targetView: "students", profileId: duplicateNames[0].id, selector: ".student-manager-card" });
    const unresolvedReports = lab.state.importedReports.filter((report) => report.identityStatus === "unresolved-legacy" && !report.boundProfileId);
    if (unresolvedReports.length) add({ code: "report.unbound", title: `${unresolvedReports.length} 份旧报告尚未绑定学生`, action: "绑定报告身份", targetView: "class", selector: ".class-evidence-card" });
    const profileIds = new Set(profiles.map((profile) => profile.id));
    const unmatchedExamRecords = lab.state.examRecords.filter((record) => !profileIds.has(record.profileId));
    if (unmatchedExamRecords.length) add({ code: "exam.unmatched-student", title: `${unmatchedExamRecords.length} 份试卷未匹配到有效学生`, action: "检查试卷导入", targetView: "students", selector: ".exam-record-card" });
    const blockedExamGroups = lab.examImportDraft ? buildExamImportPreviewGroups(lab.examImportDraft)
      .filter((group) => group.statusCode !== "ready").length : 0;
    if (blockedExamGroups) add({ code: "exam.import-blocked", title: `${blockedExamGroups} 个试卷导入组存在学生或题号异常`, action: "处理异常项", targetView: "students", selector: ".exam-import-preview" });
    const incompletePlacements = profiles.filter((profile) => engine.placementStatus(lab.state, profile.id).actionable);
    if (incompletePlacements.length) add({ code: "placement.incomplete", title: `${incompletePlacements.length} 名学生摸底未完成或状态未知`, action: "处理摸底", targetView: "students", profileId: incompletePlacements[0].id, selector: ".student-decision-loop" });
    const pendingReviews = lab.state.attempts.filter(engine.isPendingManualReview).length;
    if (pendingReviews) add({ code: "review.pending", title: `${pendingReviews} 份学生作答等待人工复核`, action: "进入批阅", targetView: "today", selector: "#teacher-manual-review" });
    const unresolvedTopics = lab.state.examRecords.reduce((sum, record) => sum + (record.unresolvedWeakTopics?.length || 0), 0)
      + questions.filter((question) => !engine.topicKeyForQuestion(question)).length;
    if (unresolvedTopics) add({ code: "taxonomy.unresolved", title: `${unresolvedTopics} 项知识点尚未解析`, action: "检查导入与题库", targetView: "manage", selector: ".teacher-advanced-tools" });
    const duplicateStudents = profiles.filter((profile, index) => profiles.some((other, otherIndex) => otherIndex < index
      && ((profile.studentNumber && profile.studentNumber === other.studentNumber)
        || (profile.sourceProfileId && profile.sourceProfileId === other.sourceProfileId))));
    if (duplicateStudents.length) add({ code: "identity.duplicate-record", title: `${duplicateStudents.length} 个档案疑似重复`, action: "核对档案", targetView: "students", profileId: duplicateStudents[0].id, selector: ".student-manager-card" });
    const freshnessLimit = Date.now() - 45 * 24 * 60 * 60 * 1000;
    const staleProfiles = profiles.filter((profile) => {
      const timestamps = [
        ...lab.state.attempts.filter((item) => item.profileId === profile.id).map((item) => item.completedAt || item.createdAt),
        ...lab.state.diagnosticAttempts.filter((item) => item.profileId === profile.id).map((item) => item.createdAt),
        ...lab.state.examRecords.filter((item) => item.profileId === profile.id).map((item) => item.examDate || item.createdAt)
      ].map((value) => new Date(value || 0).getTime()).filter((value) => Number.isFinite(value) && value > 0);
      return timestamps.length > 0 && Math.max(...timestamps) < freshnessLimit;
    });
    if (staleProfiles.length) add({ code: "evidence.stale", title: `${staleProfiles.length} 名学生的最近证据已超过45天`, action: "安排重新确认", targetView: "students", profileId: staleProfiles[0].id, selector: ".student-decision-loop" });
    const examConflicts = lab.state.examRecords.filter((record) => {
      const seen = new Set();
      return (record.questionEvidence || []).some((item) => {
        const key = String(item.questionNo || item.questionId || "");
        if (!key) return false;
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
    });
    if (examConflicts.length) add({ code: "exam.question-conflict", title: `${examConflicts.length} 份试卷存在题号冲突`, action: "检查试卷", targetView: "students", profileId: examConflicts[0].profileId, selector: ".exam-record-card" });
    const storageRisk = lab.storageEstimate && !lab.storageEstimate.unavailable && (
      Number(lab.storageEstimate.ratio) >= 0.8
      || (Number.isFinite(lab.storageEstimate.remaining) && lab.storageEstimate.remaining < 50 * 1024 * 1024)
    );
    if (storageRisk) add({ code: "storage.capacity-risk", title: "本机存储空间接近上限，继续保存可能失败", action: "导出备份并清理", targetView: "manage", selector: ".teacher-advanced-tools" });
    return issues;
  }

  function renderDataHealth(issues) {
    return `<section class="lab-card teacher-data-health"><div class="lab-card-head"><div><span>DATA HEALTH</span><h3>数据健康检查</h3></div><strong>${issues.length ? `${issues.length} 项异常` : "正常"}</strong></div>
      ${issues.length ? `<div class="teacher-todo-list">${issues.map((issue) => `<article class="teacher-todo-item todo-warning"><div><strong>${escapeHtml(issue.title)}</strong><span>异常代码：${escapeHtml(issue.code)}</span></div><button type="button" data-lab-action="open-data-health-target" data-target-view="${escapeHtml(issue.targetView)}" data-profile-id="${escapeHtml(issue.profileId || "")}" data-target-selector="${escapeHtml(issue.selector || "")}">${escapeHtml(issue.action)}</button></article>`).join("")}</div>` : `<p class="teacher-todo-empty">当前没有需要教师处理的数据异常。</p>`}
    </section>`;
  }

  function renderDataPrivacyCenter(profile) {
    const aiStatus = window.PhysicsStudioAITutor?.status?.() || { ready: false };
    const cloudMode = lab.state.settings?.dataMode === "cloud-classroom";
    const experienceState = window.PhysicsExperience?.getState?.() || {};
    return `<section class="lab-card data-privacy-center teacher-advanced-section">
      <div class="lab-card-head"><div><span>DATA & PRIVACY</span><h3>数据与隐私</h3></div><strong>${cloudMode ? "云班级模式" : "本机模式"}</strong></div>
      <ul><li><strong>仅本机：</strong>学习作答、诊断、试卷、复核与方案默认保存在本机 IndexedDB；本机模式不表示已经云同步。</li><li><strong>完整备份：</strong>.pslab 会包含题库、学习档案及附件，文件由导出者自行保管。</li><li><strong>班级服务器：</strong>${cloudMode ? "仅在教师明确登录并同步时发送班级所需结构化记录；服务端权限仍以后端账号角色为准。" : "当前未标记为云班级模式，不会把本机档案描述为已同步。"}</li><li><strong>AI 服务：</strong>${escapeHtml(aiStatus.boundary || "当前只使用本机提示。")}</li></ul>
      <div class="teacher-form"><label><span>年龄授权场景</span><select id="privacyMinorAgeBand"><option value="unknown"${profile?.minorAgeBand === "unknown" ? " selected" : ""}>未确认</option><option value="under14"${profile?.minorAgeBand === "under14" ? " selected" : ""}>未满14周岁</option><option value="14plus"${profile?.minorAgeBand === "14plus" ? " selected" : ""}>14周岁及以上</option></select></label><label><span>监护人授权状态</span><select id="privacyGuardianConsent"><option value="unknown"${profile?.guardianConsentStatus === "unknown" ? " selected" : ""}>未确认</option><option value="pending"${profile?.guardianConsentStatus === "pending" ? " selected" : ""}>待授权</option><option value="granted"${profile?.guardianConsentStatus === "granted" ? " selected" : ""}>已授权</option><option value="withdrawn"${profile?.guardianConsentStatus === "withdrawn" ? " selected" : ""}>已撤回</option></select></label></div>
      <div class="teacher-inline-actions"><button type="button" data-lab-action="save-privacy-consent">保存授权记录</button><button type="button" data-lab-action="withdraw-privacy-consent">撤回同意</button><button type="button" data-lab-action="export-complete-backup">导出全部数据</button><button type="button" data-lab-action="open-profile-correction">更正学生资料</button><button type="button" data-lab-action="delete-profile-learning-data">删除当前学生学习数据</button></div>
      <hr><h4>管理 / 高级入口</h4><label><input id="manageStudentExternalLinks" type="checkbox"${experienceState.studentExternalLinks ? " checked" : ""}> 允许学生从明确按钮打开外部题源（始终交给 Edge 优先或系统默认浏览器，不在含原生桥的主 WebView 内加载）</label><div class="teacher-inline-actions"><button type="button" data-lab-action="open-classroom-management">班级管理</button><button type="button" data-lab-action="open-validation-metrics">上线验证指标</button><button type="button" data-lab-action="open-user-feedback">用户反馈</button><button type="button" data-lab-action="save-external-link-setting">保存外链设置</button></div>
      <p class="tool-help">本地 PIN 不能替代服务器鉴权；当前页面说明产品边界，不使用“已完全合规”表述。</p>
    </section>`;
  }

  function renderTeacherPrescription(prescription) {
    return `<section class="lab-card teacher-prescription"><div class="lab-card-head"><div><span>TEACHER PRESCRIPTION</span><h3>班级教学处方（待教师确认）</h3></div><strong>${prescription.profileIds.length} 名学生</strong></div>
      <p>${escapeHtml(prescription.boundary)}</p>
      <div class="class-weakness">${prescription.commonWeaknesses.slice(0, 5).map((item) => `<article><strong>${escapeHtml(item.topic)}</strong><span>${item.profileIds.length} 名学生 · ${item.evidenceIds.length} 条可追溯证据</span><button type="button" data-lab-action="create-temp-group" data-topic-key="${escapeHtml(item.topicKey)}">教师确认建立临时组</button></article>`).join("") || "<p>当前没有至少两名学生共同满足“需巩固”证据门槛。</p>"}</div>
      <p>证据不足知识点 ${prescription.insufficientKnowledgePoints.length} 个；等待人工复核学生 ${prescription.pendingManualReview.length} 名；专项完成待复测学生 ${prescription.awaitingRetest.length} 名。AI 如启用只能改写说明，不会自动创建分组或改变学生评价。</p>
      <div class="teacher-inline-actions"><button type="button" data-lab-action="preview-tiered-assignment">按薄弱点生成分层作业预览</button></div>
      ${renderTieredAssignmentPreview()}
    </section>`;
  }

  function renderTieredAssignmentPreview() {
    const preview = lab.tieredAssignmentPreview;
    if (!preview) return "";
    if (preview.status !== "teacher-confirmation-required") {
      return `<div class="targeted-plan-empty"><strong>暂不生成作业</strong><p>${escapeHtml(preview.boundary)}</p></div>`;
    }
    return `<section class="targeted-plan-preview tiered-assignment-preview">
      <header><div><span>教师确认前不发布</span><h4>${escapeHtml(preview.title)}</h4></div><strong>${preview.questionCount} 题</strong></header>
      <p><strong>建议学生范围：</strong>${preview.studentScope.map((item) => `${escapeHtml(item.name)}（${escapeHtml(item.grade)}）`).join("、")}</p>
      <p><strong>知识点：</strong>${preview.knowledgePointIds.map(escapeHtml).join("、")} · <strong>依据：</strong>${preview.evidenceIds.length} 条原始 evidence IDs</p>
      <ol>${preview.questionCandidates.map((item) => `<li><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.difficulty)} · ${escapeHtml(item.variantRole || "未标注迁移角色")} · 来源：${escapeHtml(item.source)}</span><small>${escapeHtml(item.reason)}</small></div></li>`).join("")}</ol>
      <p>${escapeHtml(preview.structureLabel)}。${escapeHtml(preview.boundary)}</p>
      <div class="teacher-inline-actions"><button class="lab-primary-button" type="button" data-lab-action="confirm-tiered-assignment">教师确认并生成待发布作业</button><button class="lab-secondary-button" type="button" data-lab-action="discard-tiered-assignment">取消预览</button></div>
    </section>`;
  }

  function renderAssignmentPreview() {
    const preview = lab.assignmentPreview;
    if (!preview) return "";
    const allQuestions = new Map(getQuestions().map((question) => [question.id, question]));
    (lab.state.variantSets || []).forEach((set) => set.variants.forEach((variant) => allQuestions.set(variant.id, variant)));
    return `<section class="targeted-plan-preview assignment-variant-preview">
      <header><div><span>教师确认前不发布</span><h4>${escapeHtml(preview.title)}</h4></div><strong>${preview.questionCount} 题</strong></header>
      <p><strong>母题：</strong>${preview.parentQuestionIds.length} 道 · <strong>完整变式：</strong>${preview.variantQuestionIds.length} 道 · <strong>适用范围：</strong>${escapeHtml(preview.grade)} / ${escapeHtml(preview.topic)}</p>
      <ol>${preview.questionIds.map((id) => {
        const question = allQuestions.get(id);
        return `<li><div><strong>${escapeHtml(question?.title || id)}</strong><span>${escapeHtml(question?.difficulty || "未标注")} · ${escapeHtml(question?.variantRoleLabel || "母题")} · 来源：${escapeHtml(question?.source || "来源未标注")}</span>${question?.validation ? `<small>质量门禁：${question.validation.passed ? "通过" : "未通过"}</small>` : ""}</div></li>`;
      }).join("")}</ol>
      <p class="tool-help">只包含完整题干和已通过质量门禁的变式；生成结果不会自动发布。教师确认后才加入待发布作业。</p>
      <div class="teacher-inline-actions"><button class="lab-primary-button" data-lab-action="confirm-assignment-preview" type="button">确认并加入待发布作业</button><button class="lab-secondary-button" data-lab-action="discard-assignment-preview" type="button">取消</button></div>
    </section>`;
  }

  function handleReviewShortcut(event) {
    if (!/[123]/.test(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const article = event.target.closest?.("[data-review-attempt]");
    if (!article || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    const button = article.querySelectorAll('[data-lab-action="complete-manual-review"]')[Number(event.key) - 1];
    if (button) {
      event.preventDefault();
      button.click();
    }
  }

  function renderTeacherPrimaryNav(activeView = lab.teacherView) {
    return `<nav class="teacher-primary-nav" aria-label="教师中心主导航">
      ${[
        ["today", "今日"],
        ["students", "学生"],
        ["class", "班级"],
        ["manage", "管理"]
      ].map(([view, label]) => `<button data-teacher-view="${view}" type="button"${activeView === view ? ' class="active" aria-current="page"' : ""}>${label}</button>`).join("")}
    </nav>`;
  }

  function activeManagedStudent(studentProfiles) {
    if (!studentProfiles.some((item) => item.id === lab.managedStudentId)) {
      const activeStudent = studentProfiles.find((item) => item.id === lab.state.activeProfileId);
      lab.managedStudentId = activeStudent?.id || studentProfiles[0]?.id || "";
    }
    return studentProfiles.find((item) => item.id === lab.managedStudentId)
      || engine.activeProfile(lab.state);
  }

  function renderTeacherToday() {
    const questions = getQuestions();
    const studentProfiles = lab.state.profiles.filter((item) => item.role === "student");
    const profile = activeManagedStudent(studentProfiles);
    const todoItems = buildTeacherTodoItems(studentProfiles, questions);
    const dataHealthIssues = buildDataHealthIssues(studentProfiles, questions);
    return `<section class="teacher-dashboard" data-teacher-render-mode="today">
      ${renderTeacherPrimaryNav("today")}
      <section class="lab-card teacher-todo-card">
        <div class="lab-card-head"><div><span>TODAY TODO</span><h3>今日待办</h3></div><strong>${todoItems.length}</strong></div>
        <p>只显示需要教师处理的事项；每条待办都保留原始证据入口，自动分析不能替代教师确认。</p>
        <div class="teacher-todo-list">${renderTeacherTodoItems(todoItems)}</div>
      </section>
      ${renderDataHealth(dataHealthIssues)}
      ${renderManualReviewQueue(lab.state, questions, profile?.id)}
      ${renderVariantReviewQueue(questions)}
    </section>`;
  }

  function renderTeacher() {
    return lab.teacherView === "today" ? renderTeacherToday() : renderTeacherWorkspace();
  }

  function renderTeacherWorkspace() {
    const questions = getQuestions();
    const needsStudents = lab.teacherView === "students";
    const needsClass = lab.teacherView === "class";
    const needsManage = lab.teacherView === "manage";
    const motionDrafts = needsManage ? (window.PhysicsStudioMotionDrafts?.questions || []) : [];
    const topics = needsManage
      ? [...new Set(questions.map((question) => question.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"))
      : [];
    const eligible = needsStudents || needsManage
      ? questions.filter((question) => engine.isPublishedQuestion(question))
      : [];
    const reviewQueue = needsManage ? questions.filter((question) => {
      return /用户自行上传|未填写|仅保存来源链接/.test(question.sourceLicense || "")
        || question.fullTextIncluded === false
        || question.contentAudit?.requiresTeacherReview
        || question.contentReviewStatus === "待教师审核";
    }).slice(0, 18) : [];
    const importedTopics = needsClass ? aggregateImportedReports() : [];
    const unresolvedLegacyReports = needsClass
      ? lab.state.importedReports.filter((report) => report.identityStatus === "unresolved-legacy" && !report.boundProfileId)
      : [];
    const coverage = needsManage
      ? (lab.app?.getContentCoverage?.()
        || window.PhysicsStudioContentCatalog?.getCoverage?.(questions)
        || { target: 1900, completeQuestions: 0, indexed: 0, teacherVerifiedFullText: 0, pendingReview: 0, remaining: 1900, completionRate: 0, definition: "" })
      : null;
    const studentProfiles = lab.state.profiles.filter((item) => item.role === "student");
    const teacherPrescription = needsClass
      ? engine.buildTeacherPrescription(lab.state, questions, studentProfiles.map((item) => item.id))
      : null;
    const profile = activeManagedStudent(studentProfiles);
    const analysis = needsStudents ? engine.studentAnalysis(lab.state, questions, profile?.id) : null;
    const activePlan = needsStudents ? engine.activeLearningPlan(lab.state, profile?.id) : null;
    const planProgress = needsStudents ? engine.learningPlanProgress(lab.state, activePlan) : null;
    const preview = needsStudents && lab.planPreview?.profileId === profile?.id ? lab.planPreview : null;
    const questionMap = needsStudents ? new Map(questions.map((question) => [question.id, question])) : new Map();
    const gradeTopics = needsStudents ? [...new Set(eligible
      .filter((question) => question.grade === profile?.grade)
      .map((question) => question.topic)
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-CN")) : [];
    const aiStatus = needsManage
      ? (window.PhysicsStudioAITutor?.status?.() || { ready: false, endpoint: "", model: "gpt-5.6-sol", boundary: "离线规则模式" })
      : { ready: false, endpoint: "", model: "gpt-5.6-sol", boundary: "离线规则模式" };
    const studentDecisionLoop = needsStudents ? renderStudentDecisionLoop(profile, analysis, lab.state) : "";
    const contentCoverage = needsManage ? renderQuestionBankCoverage(coverage) : "";
    return `
      <section class="teacher-dashboard" data-teacher-render-mode="workspace" data-teacher-render-view="${lab.teacherView}">
        ${renderTeacherPrimaryNav()}
        ${needsStudents ? `
        <div class="lab-hero-card teacher-hero">
          <div><span class="lab-section-index">STUDENT → EVIDENCE → PLAN → REVIEW</span><h3>学生专项学习工作台</h3><p>先选择学生，再依据真实作答、试卷薄弱点、提示依赖和建模证据确认一个小目标；每个方案只安排3—7题，并包含迁移或反例。</p></div>
          <div class="teacher-stat"><strong>${studentProfiles.length}</strong><span>本机学生档案</span></div>
        </div>
        ${studentDecisionLoop}

        <section class="lab-card targeted-plan-card">
          <div class="lab-card-head">
            <div><span>PERSONALIZED MICRO-CYCLE</span><h3>为${escapeHtml(profile?.name || "当前学生")}确认专项方案</h3></div>
            <strong>${escapeHtml(analysis.evidenceCoverage?.levelLabel || analysis.evidenceLevel || "证据不足")}</strong>
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
              <header><div><span>预览 · ${escapeHtml(preview.evidenceCoverage?.levelLabel || preview.evidenceLevel || "证据不足")}</span><h4>${escapeHtml(preview.title)}</h4></div><strong>${preview.questionCount}题 / 约${preview.expectedMinutes}分钟</strong></header>
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
               <small>${activePlan.confirmationStatus === "teacher-confirmed" ? `教师已确认：${escapeHtml(activePlan.teacherConfirmedAt || activePlan.approvedAt || "")}` : "旧方案或未记录教师确认时间，建议复核"}</small>
            </section>` : ""}
          ${activePlan ? renderTargetedRetestStatus(lab.state, profile?.id, activePlan, planProgress) : ""}
        </section>` : ""}

        ${needsManage ? `<details class="teacher-advanced-tools" open>
          <summary>
            <div><span>ADVANCED TOOLS</span><h3>管理与高级工具</h3><p>题库维护、文件解析、AI 网关、组卷、班级汇总与内容审核。</p></div>
            <strong>收起</strong>
          </summary>
          <div class="teacher-advanced-body">
        ${contentCoverage}
        ${renderDataPrivacyCenter(profile)}` : ""}

        ${needsClass ? `${renderClassKnowledgeMatrix(studentProfiles, questions)}
        ${renderTeacherPrescription(teacherPrescription)}` : ""}

        ${needsStudents ? `
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

          <section class="lab-card student-import-card">
            <div class="lab-card-head"><div><span>ROSTER IMPORT</span><h3>学生名单导入</h3></div><strong>预览后确认</strong></div>
            <p>支持 CSV，或直接粘贴从 Excel 复制的多行表格。系统先预览、映射字段并检查重复，确认后才写入学生档案。</p>
            <textarea id="studentRosterPaste" rows="4" placeholder="姓名\t年级\t近期目标\t备注\n张三\t高一\t查漏补缺\t"></textarea>
            <div class="teacher-inline-actions">
              <button class="lab-secondary-button" data-lab-action="preview-student-import" type="button">预览粘贴内容</button>
              <label class="lab-secondary-button file-label" for="studentRosterCsv">选择 CSV</label>
              <input class="visually-hidden" id="studentRosterCsv" type="file" accept=".csv,text/csv,.txt,text/plain">
            </div>
            ${renderStudentImportPreview()}
          </section>

          <section class="lab-card student-analysis-card">
            <div class="lab-card-head"><div><span>EVIDENCE REPORT</span><h3>${escapeHtml(profile?.name || "学生")}学情分析</h3></div><strong>${analysis.summary.completed} 次作答</strong></div>
            <div class="teacher-analysis-metrics">
              <article><strong>${analysis.summary.accuracy == null ? "暂无" : `${analysis.summary.accuracy}%`}</strong><span>正确率</span></article>
              <article><strong>${analysis.summary.independenceRate == null ? "暂无" : `${analysis.summary.independenceRate}%`}</strong><span>独立完成率</span></article>
              <article><strong>${analysis.summary.averageHint}</strong><span>平均提示</span></article>
              <article><strong>${analysis.summary.dueCount}</strong><span>到期复习</span></article>
              <article><strong>${analysis.evidenceCoverage?.coverageLabel || "0/0"}</strong><span>知识点证据覆盖</span></article>
            </div>
            <h4>下一步建议</h4>
            <ul>${analysis.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            <p>${escapeHtml(analysis.evidenceCoverage?.reason || analysis.conclusion)}</p>
            <small>${escapeHtml(analysis.boundary)}</small>
            <div class="teacher-inline-actions">
              <button class="lab-primary-button" data-lab-action="export-report-html" type="button">导出学情与专项提升报告</button>
              <button class="lab-secondary-button" data-lab-action="export-profile" type="button">导出成长档案 JSON</button>
            </div>
          </section>
        </section>

        <section class="teacher-records-grid">
          <section class="lab-card exam-record-card">
            <div class="lab-card-head"><div><span>EXAM RECORDS</span><h3>试卷记录导入、导出</h3></div><strong>${lab.state.examRecords.filter((item) => item.profileId === profile?.id).length} 份</strong></div>
            <div class="teacher-form">
              <label><span>试卷名称</span><input id="examRecordTitle" value="课后物理测试"></label>
              <label><span>考试日期</span><input id="examRecordDate" type="date" value="${engine.localCalendarDateKey()}"></label>
              <label><span>得分</span><input id="examRecordScore" type="number" min="0" step="0.5" value="" placeholder="请输入分数"></label>
              <label><span>总分</span><input id="examRecordTotal" type="number" min="1" step="0.5" value="" placeholder="请输入总分"></label>
              <label class="wide"><span>薄弱知识点（当前年级，可搜索多选）</span>
                <input id="examRecordWeakTopicSearch" type="search" placeholder="搜索知识点名称">
                <div class="exam-topic-options" id="examRecordTopicOptions">
                  ${gradeTopics.map((topic) => `<label><input type="checkbox" data-exam-topic value="${escapeHtml(topic)}"><span>${escapeHtml(topic)}</span></label>`).join("") || "<small>当前年级没有可用知识点。</small>"}
                </div>
              </label>
              ${(() => {
                const unresolved = lab.state.examRecords
                  .filter((item) => item.profileId === profile?.id)
                  .flatMap((item) => item.unresolvedWeakTopics || []);
                return unresolved.length
                  ? `<p class="teacher-warning">有无法自动映射的旧试卷知识点：${escapeHtml([...new Set(unresolved)].join("、"))}。请在上方知识点列表中确认，系统不会静默丢弃这些值。 <button class="lab-secondary-button" data-lab-action="resolve-exam-topics" type="button">尝试映射旧知识点</button></p>`
                  : "";
              })()}
              <label class="wide"><span>备注</span><textarea id="examRecordNote" rows="2"></textarea></label>
            </div>
            <div class="teacher-inline-actions">
              <button class="lab-primary-button" data-lab-action="add-exam-record" type="button">添加试卷记录</button>
              <button class="lab-secondary-button" data-lab-action="export-exam-records" type="button">导出试卷记录</button>
              <label class="lab-secondary-button file-label" for="examRecordImport">导入试卷记录</label>
              <input class="visually-hidden" id="examRecordImport" type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain">
            </div>
            <label class="wide"><span>批量导入试卷记录（CSV 或从 Excel 复制后粘贴）</span><textarea id="examRecordPaste" rows="4" placeholder="试卷名称\t考试日期\t得分\t总分\t薄弱知识点\t备注\n期中测试\t2026-08-08\t80\t100\t牛顿运动定律\t"></textarea></label>
            <p class="teacher-import-hint">也支持题目级列：studentId、examId、questionNo、questionId、score、maxScore、topicKey、questionType。系统会按 questionId 自动补齐知识点和题型，只把未识别项列为异常。</p>
            <div class="teacher-inline-actions">
              <button class="lab-secondary-button" data-lab-action="preview-exam-import" type="button">预览批量导入</button>
            </div>
            ${renderExamImportPreview()}
          </section>
          <section class="lab-card growth-record-card">
            <div class="lab-card-head"><div><span>GROWTH TIMELINE</span><h3>学生成长档案</h3></div><strong>${analysis.growthTimeline.length} 条证据</strong></div>
            <label><span>成长记录标题</span><input id="growthRecordTitle" maxlength="120" placeholder="例如：能够独立完成受力分析"></label>
            <label><span>事实与证据</span><textarea id="growthRecordDetail" rows="3" maxlength="3000" placeholder="只记录可观察行为和证据，不贴能力标签。"></textarea></label>
            <button class="lab-secondary-button" data-lab-action="add-growth-record" type="button">添加教师记录</button>
            <div class="growth-record-list">${analysis.growthTimeline.slice(0, 8).map((item) => `<article><time>${formatDate(item.date)}</time><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></article>`).join("") || emptyState("暂无成长记录", "练习、试卷和教师记录会按时间形成档案。")}</div>
          </section>
        </section>` : ""}

        ${needsManage ? `
        <section class="teacher-records-grid">
          <section class="lab-card document-import-card">
            <div class="lab-card-head"><div><span>DOCUMENT ANALYSIS</span><h3>PDF、Word与扫描卷解析</h3></div><strong>导入后必审</strong></div>
            <div class="teacher-form">
              <label><span>学段</span><select id="documentImportStage"><option>初中</option><option>高中</option></select></label>
              <label><span>年级</span><select id="documentImportGrade">${["八年级", "九年级", "高一", "高二", "高三"].map((grade) => `<option>${grade}</option>`).join("")}</select></label>
              <label class="wide"><span>来源说明</span><input id="documentImportSource" maxlength="200" placeholder="试卷名称、学校、年份或自有讲义"></label>
              <label class="wide"><span><input id="documentImportRights" type="checkbox"> 我已确认本人有权上传并在本机教学中使用该文件</span></label>
              <label class="wide"><span><input id="documentRemoteUploadConfirmed" type="checkbox"> 若本机无法解析，我确认文件将发送到已配置的受控服务；文件不含姓名、学号、班级、家庭信息等身份数据，也不是未公开或无权处理的试卷</span></label>
            </div>
            <label class="lab-primary-button file-label" for="documentQuestionImport">选择 PDF / DOCX / DOC / 图片并解析</label>
            <input class="visually-hidden" id="documentQuestionImport" type="file" accept=".pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
            <p>DOCX 纯文本和设备 OCR 优先离线预解析；只有勾选网络上传确认后，PDF、旧版 Word 和复杂扫描件才可发送到已配置的受控服务端。所有不确定字符、图形和公式必须人工确认。</p>
            ${renderPendingDocumentImport()}
          </section>
          <section class="lab-card ai-gateway-card">
            <div class="lab-card-head"><div><span>受控 AI 服务</span><h3>ChatGPT 解题服务</h3></div><strong>${aiStatus.ready ? "已验证可用" : aiStatus.configured ? "已配置 · 授权未核验" : "本机提示"}</strong></div>
            <label><span>服务端地址</span><input id="aiGatewayEndpoint" type="url" value="${escapeHtml(aiStatus.endpoint || "")}" placeholder="https://your-domain.example"></label>
            <label><span>模型</span><input id="aiGatewayModel" value="${escapeHtml(aiStatus.model || "gpt-5.6-sol")}"></label>
            <label><span>服务访问令牌（可选）</span><input id="aiGatewayAccessToken" type="password" autocomplete="off" placeholder="只在本次运行期间保留"></label>
            <label><span><input id="aiGatewayEnabled" type="checkbox"${aiStatus.enabled ? " checked" : ""}> 保存受控服务配置</span></label>
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
              <label><span>母题数量</span><input id="assignmentCount" type="number" min="1" max="20" value="5"></label>
              <label><span><input id="assignmentIncludeVariants" type="checkbox" checked> 包含完整变式训练</span></label>
              <label><span>每道母题变式数</span><select id="assignmentVariantCount"><option value="2">2 道</option><option value="3" selected>3 道</option></select></label>
              <label><span><input id="assignmentIncludeWrong" type="checkbox"> 优先纳入当前学生错题</span></label>
              <label><span><input id="assignmentIncludeReverse" type="checkbox" checked> 包含逆向题</span></label>
              <label><span><input id="assignmentIncludeContext" type="checkbox" checked> 包含情境迁移题</span></label>
              <label><span>基础比例</span><input id="assignmentBasicRatio" type="number" min="0" max="100" value="50"></label>
              <label><span>进阶比例</span><input id="assignmentAdvancedRatio" type="number" min="0" max="100" value="30"></label>
              <label><span>挑战比例</span><input id="assignmentChallengeRatio" type="number" min="0" max="100" value="20"></label>
              <label class="wide"><span>调用常用参数</span><span class="teacher-inline-actions"><select id="assignmentPresetSelect"><option value="">请选择已保存参数</option>${(lab.state.variantPresets || []).map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join("")}</select><button class="lab-secondary-button" data-lab-action="apply-assignment-preset" type="button">应用</button></span></label>
              <label class="wide"><span>保存为常用参数（可选）</span><input id="assignmentPresetName" maxlength="80" placeholder="例如：九年级错题滚动训练"></label>
            </div>
            <button class="lab-primary-button" data-lab-action="generate-assignment" type="button">生成待审核作业</button>
            <p class="tool-help">只选取完整题干记录；只有来源链接的真题索引不会被混入试卷。AI 题必须先通过教师审核，组卷不会自动批准。</p>
            ${renderAssignmentPreview()}
          </section>
        </div>` : ""}

        ${needsClass ? `<div class="teacher-grid">
          <section class="lab-card class-evidence-card">
            <div class="lab-card-head"><div><span>CLASS EVIDENCE</span><h3>班级薄弱点</h3></div><strong>${lab.state.importedReports.length} 份档案</strong></div>
            <div class="class-weakness">
              ${importedTopics.length ? importedTopics.slice(0, 8).map((item) => `
                <article><strong>${escapeHtml(item.topic)}</strong><span>${item.students} 名学生 · ${item.evidenceTotal} 条证据</span><small>${escapeHtml(item.statusSummary)}</small></article>`).join("") : emptyState("尚未导入学生档案", "学生可从“复习报告”导出学习档案；教师导入后只汇总结构化学习证据。")}
            </div>
            ${unresolvedLegacyReports.length ? `<div class="lab-inline-warning"><strong>${unresolvedLegacyReports.length} 份旧版报告尚未绑定学生，未计入班级学情。</strong>${unresolvedLegacyReports.map((report) => `
              <div class="lab-inline-actions">
                <span>${escapeHtml(report.profile?.name || "旧版 student-default")} · ${escapeHtml(report.exportedAt || "无导出时间")}</span>
                <select id="reportBinding-${escapeHtml(report.id)}" aria-label="选择要绑定的学生"><option value="">选择已有学生</option>${studentProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} · ${escapeHtml(profile.portableProfileId)}</option>`).join("")}</select>
                <button type="button" data-lab-action="bind-imported-report" data-report-id="${escapeHtml(report.id)}">绑定</button>
                <button type="button" data-lab-action="create-profile-for-report" data-report-id="${escapeHtml(report.id)}">建立新学生</button>
              </div>`).join("")}</div>` : ""}
            <label class="lab-secondary-button file-label" for="studentReportImport">导入学生学习档案</label>
            <input class="visually-hidden" id="studentReportImport" type="file" accept="application/json,.json" multiple>
          </section>
        </div>` : ""}

        ${needsManage ? `
        <section class="lab-card motion-draft-pilot">
          <div class="lab-card-head"><div><span>原创教学草稿</span><h3>高一·匀变速直线运动多表征试点</h3></div><strong>${motionDrafts.length} 道待审核</strong></div>
          <p>概念、图像、实验数据与跨情境题共用现有匀变速动态模型。草稿不在正式题库，也不生成学生掌握证据；教师可逐题核对后加入审核队列。</p>
          <div class="motion-draft-list">${motionDrafts.map((draft) => `<article><span>${escapeHtml(draft.representationType)} · ${escapeHtml(draft.questionType)}</span><h4>${escapeHtml(draft.title)}</h4><p>${escapeHtml(draft.content)}</p><details><summary>核对答案、单位与条件</summary><strong>${escapeHtml(draft.answer)}</strong><p>${escapeHtml(draft.solution)}</p></details><button data-lab-action="preview-motion-draft" data-draft-id="${escapeHtml(draft.id)}" type="button">用动态模型验证</button></article>`).join("")}</div>
          <button class="lab-secondary-button" data-lab-action="import-motion-drafts" type="button"${motionDrafts.length ? "" : " disabled"}>加入教师审核队列</button>
        </section>
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
          <p>当前版本支持本机教师审核、组卷、档案导入和离线备份；服务端代码已提供班级绑定、增量作答/试卷同步、专项方案、提交复核和报告快照的最小 API。安装包仍以本机数据为默认来源，云端启用前必须完成部署、迁移和集成验收。</p>
        </section>
          </div>
        </details>` : ""}
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
    const teacherView = event.target.closest("[data-teacher-view]");
    if (teacherView && isTeacherRole()) {
      const nextView = ["today", "students", "class", "manage"].includes(teacherView.dataset.teacherView)
        ? teacherView.dataset.teacherView
        : "today";
      const currentMode = lab.panel?.querySelector(".teacher-dashboard")?.dataset.teacherRenderMode || "";
      const currentView = lab.panel?.querySelector(".teacher-dashboard")?.dataset.teacherRenderView || "";
      const nextMode = nextView === "today" ? "today" : "workspace";
      if (nextView !== lab.teacherView && !captureTeacherViewDraft(lab.teacherView)) return;
      lab.teacherView = nextView;
      if (currentMode !== nextMode || (nextMode === "workspace" && currentView !== nextView)) renderPanel();
      else applyTeacherView();
      lab.panel?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const variantReview = event.target.closest("[data-variant-review]");
    if (variantReview && isTeacherRole()) {
      await handleVariantReview(variantReview);
      return;
    }
    const actionTarget = event.target.closest("[data-lab-action]");
    const tabTarget = event.target.closest("[data-lab-tab]");
    const startQuestion = event.target.closest("[data-start-question]");
    if (actionTarget) {
      await handleAction(actionTarget.dataset.labAction, actionTarget);
      return;
    }
    if (tabTarget) {
      captureSessionForm();
      const nextTab = tabTarget.dataset.labTab === "teacher" && !isTeacherRole()
        ? "dashboard"
        : tabTarget.dataset.labTab;
      if (lab.tab === "teacher" && nextTab !== "teacher" && !captureTeacherViewDraft(lab.teacherView)) return;
      if (nextTab === "models" && lab.selectedQuestionId) selectModelForQuestion(lab.selectedQuestionId);
      lab.tab = nextTab;
      renderPanel();
      return;
    }
    if (startQuestion) {
      lab.selectedQuestionId = startQuestion.dataset.startQuestion;
      lab.session = null;
      lab.aiResult = null;
      lab.aiStatusMessage = "";
      lab.aiSessionState = null;
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
      renderPanel({ scrollTo: `[data-hint-level="${level}"]` });
      return;
    }
    const variantHint = event.target.closest("[data-variant-hint-level]");
    if (variantHint && lab.variantTraining?.session) {
      captureSessionForm();
      const level = Number(variantHint.dataset.variantHintLevel);
      if (level <= lab.variantTraining.session.hintLevel + 1) {
        lab.variantTraining.session.hintLevel = Math.max(lab.variantTraining.session.hintLevel, level);
        renderPanel({ scrollTo: ".variant-hint-row" });
      }
      return;
    }
    const revealVariant = event.target.closest("[data-variant-reveal-solution]");
    if (revealVariant && lab.variantTraining?.session) {
      captureSessionForm();
      lab.variantTraining.session.hintLevel = 5;
      lab.variantTraining.session.solutionViewed = true;
      lab.variantTraining.session.grading = lab.variantTraining.session.grading || {
        status: "review-required",
        score: null,
        summary: "已主动查看完整解答；本次不能计为独立完成。",
        issues: []
      };
      renderPanel({ scrollTo: ".grading-result" });
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

  async function handleAction(action, target) {
    if (action === "close") closeLab();
    else if (action === "choose-question") {
      captureSessionForm();
      lab.selectedQuestionId = "";
      lab.session = null;
      renderPanel();
    } else if (action === "submit-diagnostic") submitDiagnostic();
    else if (action === "grade-answer") gradeSessionAnswer();
    else if (action === "generate-variant-set") await generateVariantSetAction();
    else if (action === "grade-variant-answer") gradeVariantAnswer();
    else if (action === "complete-variant-attempt") completeVariantAttempt();
    else if (action === "open-variant-review") openVariantReview(target?.dataset.setId);
    else if (action === "add-approved-variant-set") addApprovedVariantSetToAssignment(target?.dataset.setId);
    else if (action === "open-variant-review-queue") {
      lab.teacherView = "today";
      renderPanel({ scrollTo: "#variantReviewQueue" });
    }
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
    else if (action === "generate-assignment") await generateAssignment();
    else if (action === "apply-assignment-preset") applyAssignmentPreset();
    else if (action === "confirm-assignment-preview") confirmAssignmentPreview();
    else if (action === "discard-assignment-preview") { lab.assignmentPreview = null; renderPanel(); }
    else if (action === "preview-tiered-assignment") previewTieredAssignment();
    else if (action === "confirm-tiered-assignment") confirmTieredAssignment();
    else if (action === "discard-tiered-assignment") {
      lab.tieredAssignmentPreview = null;
      renderPanel();
    }
    else if (action === "export-profile") exportProfile();
    else if (action === "stop-sensors") stopAllSensors(true);
    else if (action === "export-sensor-csv") exportSensorCsv();
    else if (action === "save-experiment") saveExperimentRecord();
    else if (action === "ai-solve") solveWithAi();
    else if (action === "save-ai-config") saveAiConfig();
    else if (action === "test-ai-config") testAiConfig();
    else if (action === "import-document-questions") importParsedDocumentQuestions();
    else if (action === "preview-motion-draft") {
      const draft = window.PhysicsStudioMotionDrafts?.questions?.find((item) => item.id === target?.dataset.draftId);
      if (!draft) return showLabMessage("未找到该教学草稿。", true);
      lab.modelType = "uniform";
      lab.modelParams.uniform = { ...draft.visualSpec.params };
      lab.tab = "models";
      renderPanel();
      showLabMessage("这是待教师审核草稿的模型演示，不是学生正式作答或掌握证据。", false);
    }
    else if (action === "import-motion-drafts") {
      if (!isTeacherRole()) return showLabMessage("只有已解锁教师模式可导入教学草稿。", true);
      const drafts = window.PhysicsStudioMotionDrafts?.questions || [];
      if (!drafts.length || !lab.app?.importQuestionBatch) return showLabMessage("草稿模块不可用，未导入。", true);
      const result = await lab.app.importQuestionBatch(drafts, { reviewStatus: "待教师审核" });
      showLabMessage(`已加入教师审核队列 ${result.added.length} 道；跳过已存在 ${result.skipped.length} 道。审核前不计入正式题库或掌握证据。`, false);
      renderPanel();
    }
    else if (action === "add-student") saveStudentProfile(true);
    else if (action === "save-student") saveStudentProfile(false);
    else if (action === "preview-student-import") previewStudentImport(document.getElementById("studentRosterPaste")?.value);
    else if (action === "confirm-student-import") confirmStudentImport();
    else if (action === "preview-exam-import") previewExamImport(document.getElementById("examRecordPaste")?.value);
    else if (action === "confirm-exam-import") confirmExamImport();
    else if (action === "select-matrix-topic") {
      lab.matrixTopicKey = target?.dataset.topicKey || "";
      renderPanel();
    } else if (action === "create-temp-group") createTemporaryLearningGroup(target?.dataset.topicKey || lab.matrixTopicKey);
    else if (action === "select-student") selectStudentProfile(target?.dataset.profileId, target?.dataset.todoAction, target?.dataset.actionId);
    else if (action === "delete-student") removeStudentProfile(target?.dataset.profileId);
    else if (action === "add-exam-record") saveExamRecord();
    else if (action === "resolve-exam-topics") resolveExamTopics();
    else if (action === "export-exam-records") exportExamRecords();
    else if (action === "export-report-html") exportStudentReportHtml();
    else if (action === "add-growth-record") saveGrowthRecord();
    else if (action === "preview-targeted-plan") previewTargetedPlan();
    else if (action === "approve-targeted-plan") approveTargetedPlan();
    else if (action === "complete-manual-review") completeManualReviewAction(target);
    else if (action === "bind-imported-report") resolveImportedReportIdentity(target, false);
    else if (action === "create-profile-for-report") resolveImportedReportIdentity(target, true);
    else if (action === "open-data-health-target") openDataHealthTarget(target);
    else if (action === "save-privacy-consent") savePrivacyConsent(false);
    else if (action === "withdraw-privacy-consent") savePrivacyConsent(true);
    else if (action === "export-complete-backup") document.getElementById("fullBackupButton")?.click();
    else if (action === "open-profile-correction") { lab.teacherView = "students"; renderPanel({ scrollTo: ".student-manager-card" }); }
    else if (action === "delete-profile-learning-data") deleteProfileLearningData();
    else if (action === "open-classroom-management") window.PhysicsExperience?.openClassroom?.();
    else if (action === "open-validation-metrics") window.PhysicsExperience?.showMetrics?.();
    else if (action === "open-user-feedback") window.PhysicsExperience?.openFeedbackEmail?.();
    else if (action === "save-external-link-setting") {
      const enabled = Boolean(document.getElementById("manageStudentExternalLinks")?.checked);
      window.PhysicsExperience?.setStudentExternalLinks?.(enabled);
      showLabMessage(`学生外部题源访问已${enabled ? "允许" : "关闭"}。`, false);
    }
    else if (action === "placement-baseline-decision") setPlacementBaselineDecision(target?.dataset.decision);
  }

  function setPlacementBaselineDecision(decision) {
    const profile = lab.state.profiles.find((item) => item.id === lab.managedStudentId) || engine.activeProfile(lab.state);
    if (!profile || !["supplement-placement", "use-existing-evidence"].includes(decision)) return;
    engine.updateProfile(lab.state, profile.id, { placementBaselineDecision: decision });
    saveLearningState();
    if (decision === "supplement-placement") {
      lab.tab = "diagnostic";
      renderPanel();
    } else {
      showLabMessage("已记录教师决定：从现有证据开始教学；正式摸底仍标记为未完成。", false);
      renderPanel();
    }
  }

  function savePrivacyConsent(withdraw) {
    const profile = engine.activeProfile(lab.state);
    if (!profile) return;
    const status = withdraw ? "withdrawn" : String(document.getElementById("privacyGuardianConsent")?.value || "unknown");
    const now = new Date().toISOString();
    engine.updateProfile(lab.state, profile.id, {
      minorAgeBand: String(document.getElementById("privacyMinorAgeBand")?.value || profile.minorAgeBand || "unknown"),
      guardianConsentStatus: status,
      consentVersion: status === "granted" ? "privacy-v1" : profile.consentVersion,
      consentedAt: status === "granted" ? now : profile.consentedAt,
      withdrawnAt: status === "withdrawn" ? now : ""
    });
    saveLearningState();
    showLabMessage(status === "withdrawn" ? "已记录撤回同意；未满14周岁场景的云同步和 AI 请求将被阻止。" : "授权记录已保存。", false);
    renderPanel();
  }

  function deleteProfileLearningData() {
    const profile = engine.activeProfile(lab.state);
    if (!profile || !window.confirm(`删除“${profile.name}”的作答、诊断、试卷、复习、方案和实验记录？学生基本档案将保留。`)) return;
    ["attempts", "variantAttempts", "diagnosticAttempts", "examRecords", "growthRecords", "experimentRecords", "learningPlans", "assessmentSessions", "broadCoverageChecks"].forEach((name) => {
      lab.state[name] = (lab.state[name] || []).filter((record) => record.profileId !== profile.id);
    });
    Object.keys(lab.state.reviews || {}).forEach((key) => {
      if (lab.state.reviews[key]?.profileId === profile.id || key.startsWith(`${profile.id}::`)) delete lab.state.reviews[key];
    });
    saveLearningState();
    showLabMessage("当前学生的学习数据已删除；基本档案仍保留，可继续使用。", false);
    renderPanel();
  }

  function openDataHealthTarget(target) {
    const profileId = String(target?.dataset.profileId || "");
    if (lab.tab === "teacher" && !captureTeacherViewDraft(lab.teacherView)) return;
    if (profileId && lab.state.profiles.some((profile) => profile.id === profileId)) {
      lab.state.activeProfileId = profileId;
      lab.managedStudentId = profileId;
    }
    lab.teacherView = ["today", "students", "class", "manage"].includes(target?.dataset.targetView)
      ? target.dataset.targetView
      : "today";
    if (lab.teacherView === "manage") lab.advancedToolsOpen = true;
    saveLearningState();
    renderPanel({ scrollTo: String(target?.dataset.targetSelector || "") });
  }

  function resolveImportedReportIdentity(target, createNew) {
    const reportId = String(target?.dataset.reportId || "");
    const profileId = createNew ? "" : String(document.getElementById(`reportBinding-${reportId}`)?.value || "");
    try {
      engine.bindImportedReportIdentity(lab.state, reportId, { profileId, createNew });
      saveLearningState();
      showLabMessage(createNew ? "已建立独立学生档案并绑定旧报告。" : "旧报告已绑定到明确的学生档案。", false);
      renderPanel();
    } catch (error) {
      showLabMessage(error.message || "旧报告身份绑定失败。", true);
    }
  }

  function completeManualReviewAction(target) {
    const attemptId = target?.dataset.attemptId;
    const status = target?.dataset.reviewStatus;
    if (!attemptId || !["correct", "partial", "incorrect"].includes(status)) return;
    // Open responses are reviewed from the visible grouped workbench.  Avoid a
    // blocking prompt: the fixed rubric comment is persisted with the evidence
    // and can be edited through the teacher review form before submission.
    const summary = target?.dataset.reviewComment
      || (status === "correct" ? "教师按评分量规复核：关键规律与结论正确。"
        : status === "partial" ? "教师按评分量规复核：方法或结论部分正确，需订正缺失步骤。"
          : "教师按评分量规复核：结论或关键推理不正确，需重新建模。");
    try {
      engine.completeManualReview(lab.state, attemptId, {
        status,
        score: Number(target.dataset.reviewScore),
        summary,
        reviewedBy: "本机教师"
      });
      saveLearningState();
      showLabMessage("人工复核已保存，相关统计将在刷新后更新。", false);
      renderPanel();
    } catch (error) {
      showLabMessage(error.message || "人工复核保存失败", true);
    }
  }

  function handleInput(event) {
    if (event.target.id === "labFinalAnswer") {
      const session = lab.tab === "transfer" ? lab.variantTraining?.session : lab.session;
      if (!session) return;
      session.finalAnswer = event.target.value;
      if (session.grading) {
        session.grading = null;
        lab.content.querySelector(".grading-result")?.remove();
        const complete = lab.content.querySelector('[data-lab-action="complete-attempt"]');
        if (complete) complete.disabled = true;
      }
    } else if (event.target.id === "diagnosticConfidence") {
      const value = document.getElementById("diagnosticConfidenceValue");
      if (value) value.textContent = `${event.target.value}/5`;
    } else if (event.target.id === "confidenceBefore") {
      const session = lab.tab === "transfer" ? lab.variantTraining?.session : lab.session;
      if (session) session.confidenceBefore = Number(event.target.value);
      const value = document.getElementById("confidenceBeforeValue");
      if (value) value.textContent = `${event.target.value}/5`;
    } else if (event.target.id === "confidenceAfter") {
      const session = lab.tab === "transfer" ? lab.variantTraining?.session : lab.session;
      if (session) session.confidenceAfter = Number(event.target.value);
      const value = document.getElementById("confidenceAfterValue");
      if (value) value.textContent = `${event.target.value}/5`;
    } else if (event.target.id === "labQuestionSearch") {
      filterQuestionPicker(event.target.value);
    } else if (event.target.id === "formulaSearch") {
      filterFormulas(event.target.value);
    } else if (event.target.id === "examRecordWeakTopicSearch") {
      const query = String(event.target.value || "").trim().toLocaleLowerCase("zh-CN");
      document.querySelectorAll("#examRecordTopicOptions > label").forEach((label) => {
        label.hidden = query && !label.textContent.toLocaleLowerCase("zh-CN").includes(query);
      });
    } else if (event.target.matches("[data-exam-map]")) {
      if (!lab.examImportDraft) return;
      const field = event.target.dataset.examMap;
      const mapping = { ...lab.examImportDraft.mapping, [field]: Number(event.target.value) };
      lab.examImportDraft = buildExamImportDraft(
        lab.examImportDraft.headers,
        lab.examImportDraft.rows,
        lab.examImportDraft.text,
        mapping
      );
      renderPanel();
    } else if (event.target.matches("[data-ray-param]")) {
      const key = event.target.dataset.rayParam;
      lab.rayParams[key] = event.target.type === "range" ? Number(event.target.value) : event.target.value;
      updateRayOutput();
    } else if (event.target.matches("[data-model-param]")) {
      const key = event.target.dataset.modelParam;
      lab.modelParams[lab.modelType][key] = event.target.type === "range"
        ? Number(event.target.value)
        : event.target.value;
      updateModelOutput();
    }
  }

  function handleChange(event) {
    if (event.target.matches("[data-lab-choice]")) {
      const session = lab.tab === "transfer" ? lab.variantTraining?.session : lab.session;
      if (!session) return;
      const values = [...lab.content.querySelectorAll("[data-lab-choice]:checked")]
        .map((input) => input.value)
        .sort();
      session.finalAnswer = values.join("");
      session.grading = null;
      const hidden = document.getElementById("labFinalAnswer");
      if (hidden) hidden.value = session.finalAnswer;
    } else if (event.target.id === "labProfileSelect") {
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
    } else if (event.target.id === "studentRosterCsv") {
      loadStudentRosterFile(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.id === "labDraftUpload") {
      importDraftImage(event.target.files?.[0]);
      event.target.value = "";
    } else if (event.target.matches("[data-ray-param]")) {
      const key = event.target.dataset.rayParam;
      lab.rayParams[key] = event.target.type === "range" ? Number(event.target.value) : event.target.value;
      updateRayOutput();
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
    renderPanel({ scrollTo: ".diagnostic-result" });
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
    const session = lab.tab === "transfer" ? lab.variantTraining?.session : lab.session;
    if (!session || !["tutor", "transfer"].includes(lab.tab)) return;
    const value = (id) => document.getElementById(id)?.value;
    session.finalAnswer = value("labFinalAnswer") ?? session.finalAnswer;
    session.errorType = value("labErrorType") ?? session.errorType;
    session.reflection = value("labReflection") ?? session.reflection;
    session.selfExplanation = value("labSelfExplanation") ?? session.selfExplanation;
    session.confidenceBefore = Number(value("confidenceBefore") || session.confidenceBefore);
    session.confidenceAfter = Number(value("confidenceAfter") || session.confidenceAfter);
    Object.keys(session.model).forEach((key) => {
      session.model[key] = value(`model-${key}`) ?? session.model[key];
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
      renderPanel({ scrollTo: ".draft-upload" });
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
    renderPanel({ scrollTo: ".grading-result" });
  }

  async function generateVariantSetAction() {
    const question = getQuestion(lab.selectedQuestionId);
    if (!question) return;
    try {
      const set = await prepareVariantTraining(question, { allowAi: isTeacherRole(), count: 3 });
      if (!set?.variants?.length) {
        showLabMessage(set?.message || "当前没有可验证的完整变式题", true);
      } else if (set.status === "approved") {
        showLabMessage(`已准备 ${set.variants.length} 道通过质量门禁的完整变式。`, false);
      } else {
        showLabMessage("AI 变式已进入教师审核队列，审核前不会提供给学生正式训练。", false);
      }
    } catch (error) {
      lab.variantGenerationStatus = "";
      showLabMessage(error.message || "完整变式生成失败。", true);
    }
    renderPanel();
  }

  function gradeVariantAnswer() {
    captureSessionForm();
    const parent = getQuestion(lab.selectedQuestionId);
    const { variant } = currentVariantContext(parent);
    const session = lab.variantTraining?.session;
    if (!variant || !session) return;
    if (!session.finalAnswer.trim()) {
      showLabMessage("请先独立填写答案，再提交本题。", true);
      document.getElementById("labFinalAnswer")?.focus();
      return;
    }
    const grading = engine.gradeFinalAnswer(variant, session.finalAnswer);
    grading.verification = engine.verifyPhysicsAnswer(variant, session.finalAnswer, session.model, grading);
    session.grading = grading;
    session.submittedAt = new Date().toISOString();
    renderPanel({ scrollTo: ".grading-result" });
  }

  function adaptRemainingVariantOrder(set, completedRecord) {
    if (!lab.variantTraining || lab.variantTraining.index !== 0) return;
    const independentCorrect = completedRecord.verificationStatus === "verified-transfer";
    const remaining = lab.variantTraining.order.slice(1).map((id) => set.variants.find((variant) => variant.id === id)).filter(Boolean);
    const difficultyRank = { "基础": 0, "进阶": 1, "挑战": 2 };
    if (!independentCorrect) {
      remaining.sort((first, second) => {
        const firstSameModel = first.modelDefinitionId === set.variants[0]?.modelDefinitionId ? 0 : 1;
        const secondSameModel = second.modelDefinitionId === set.variants[0]?.modelDefinitionId ? 0 : 1;
        return firstSameModel - secondSameModel
          || (difficultyRank[first.difficulty] ?? 1) - (difficultyRank[second.difficulty] ?? 1)
          || first.sequence - second.sequence;
      });
      lab.variantTraining.order = [lab.variantTraining.order[0], ...remaining.map((variant) => variant.id)];
    }
  }

  function completeVariantAttempt() {
    captureSessionForm();
    const parent = getQuestion(lab.selectedQuestionId);
    const { set, variant } = currentVariantContext(parent);
    const session = lab.variantTraining?.session;
    if (!set || !variant || !session?.grading) return;
    if (session.selfExplanation.trim().length < 8) {
      showLabMessage("请先用一句话说明本题规律、适用条件或与母题的差异。", true);
      document.getElementById("labSelfExplanation")?.focus();
      return;
    }
    if (["incorrect", "partial"].includes(session.grading.status) && !session.errorType) {
      showLabMessage("请先选择本题最主要的错误类型。", true);
      document.getElementById("labErrorType")?.focus();
      return;
    }
    try {
      const durationSeconds = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
      const result = engine.recordVariantAttempt(lab.state, {
        variantSetId: set.id,
        variantQuestionId: variant.id,
        startedAt: new Date(session.startedAt).toISOString(),
        completedAt: new Date().toISOString(),
        durationSeconds,
        confidenceBefore: session.confidenceBefore,
        confidenceAfter: session.confidenceAfter,
        hintLevel: session.hintLevel,
        finalAnswer: session.finalAnswer,
        grading: session.grading,
        errorType: session.errorType,
        reflection: session.reflection,
        selfExplanation: session.selfExplanation,
        model: session.model,
        solutionViewed: session.solutionViewed
      });
      adaptRemainingVariantOrder(set, result.variantAttempt);
      lab.variantTraining.index += 1;
      lab.variantTraining.session = null;
      saveLearningState();
      document.dispatchEvent(new CustomEvent("physics-learning-event", {
        detail: {
          type: "variant-attempt-completed",
          questionId: variant.id,
          parentQuestionId: parent.id,
          variantSetId: set.id,
          variantRole: variant.variantRole,
          gradingStatus: result.variantAttempt.gradingStatus,
          hintLevel: result.variantAttempt.hintLevel,
          verificationStatus: result.variantAttempt.verificationStatus,
          durationSeconds
        }
      }));
      renderPanel({ preserveScroll: false });
    } catch (error) {
      showLabMessage(error.message || "变式作答保存失败。", true);
    }
  }

  function openVariantReview(setId) {
    if (!isTeacherRole()) return;
    const set = (lab.state.variantSets || []).find((item) => item.id === setId);
    if (!set) return;
    lab.teacherView = "today";
    lab.tab = "teacher";
    renderPanel({ scrollTo: `[data-variant-review-set="${setId}"]` });
  }

  function addApprovedVariantSetToAssignment(setId) {
    if (!isTeacherRole()) return;
    const set = (lab.state.variantSets || []).find((item) => item.id === setId && item.status === "approved" && item.stale !== true);
    const parent = set ? getQuestion(set.parentQuestionId) : null;
    const variants = set?.variants?.filter((variant) => variant.validation?.passed === true
      && ["system-validated", "teacher-approved"].includes(variant.approvalStatus)) || [];
    if (!set || !parent || variants.length < 2) {
      showLabMessage("该题组尚未满足加入作业的审核与质量门禁。", true);
      return;
    }
    lab.assignmentPreview = {
      id: engine.createId("assignment"),
      title: `${parent.topic || "物理"}专项变式训练`,
      stage: parent.stage,
      grade: parent.grade,
      topic: parent.topic,
      difficulty: "分层",
      parentQuestionIds: [parent.id],
      variantSetIds: [set.id],
      variantQuestionIds: variants.map((variant) => variant.id),
      questionIds: [parent.id, ...variants.map((variant) => variant.id)],
      questionCount: variants.length + 1,
      targetProfileIds: lab.managedStudentId ? [lab.managedStudentId] : [],
      knowledgePointIds: [parent.knowledgePointId || parent.topicKey || parent.topic].filter(Boolean),
      reviewStatus: "教师待确认",
      publishStatus: "preview-only",
      createdAt: new Date().toISOString()
    };
    lab.teacherView = "manage";
    lab.tab = "teacher";
    renderPanel({ scrollTo: ".assignment-variant-preview" });
  }

  async function handleVariantReview(target) {
    if (!isTeacherRole()) {
      showLabMessage("只有已解锁的教师模式可以审核变式题。", true);
      return;
    }
    const action = String(target?.dataset.variantReview || "");
    const setId = String(target?.dataset.setId || "");
    const variantId = String(target?.dataset.variantId || "");
    const set = (lab.state.variantSets || []).find((item) => item.id === setId);
    const parent = set ? getQuestion(set.parentQuestionId) : null;
    if (!set || !parent) {
      showLabMessage("未找到待审核题组或母题，未执行操作。", true);
      return;
    }
    try {
      if (action === "approve" || action === "approve-all" || action === "approve-and-add" || action === "reject") {
        const variantIds = ["approve-all", "approve-and-add"].includes(action) ? set.variants.map((variant) => variant.id) : [variantId];
        engine.decideVariantReview(lab.state, set.id, {
          action: action === "reject" ? "reject" : "approve",
          variantIds,
          reviewedBy: lab.state.profiles?.find((profile) => profile.id === lab.state.activeProfileId)?.name || "local-teacher"
        });
        saveLearningState();
        showLabMessage(action === "reject" ? "已退回该变式，未进入正式训练。" : "审核结果已保存。", false);
        if (action === "approve-and-add") {
          lab.assignmentPreview = {
            id: engine.createId("assignment"),
            title: `${parent.topic || "物理"}专项变式训练`,
            stage: parent.stage,
            grade: parent.grade,
            topic: parent.topic,
            difficulty: "分层",
            parentQuestionIds: [parent.id],
            variantSetIds: [set.id],
            variantQuestionIds: set.variants.map((variant) => variant.id),
            questionIds: [parent.id, ...set.variants.map((variant) => variant.id)],
            questionCount: set.variants.length + 1,
            targetProfileIds: lab.managedStudentId ? [lab.managedStudentId] : [],
            knowledgePointIds: [parent.knowledgePointId || parent.topicKey || parent.topic].filter(Boolean),
            reviewStatus: "教师待确认",
            publishStatus: "preview-only",
            createdAt: new Date().toISOString()
          };
          lab.teacherView = "manage";
          renderPanel({ scrollTo: ".assignment-variant-preview" });
          return;
        }
      } else if (action === "save-edit") {
        const variant = set.variants.find((item) => item.id === variantId);
        const card = lab.panel?.querySelector(`[data-variant-edit-card="${variantId}"]`);
        if (!variant || !card) throw new Error("未找到要编辑的变式题。 ");
        const read = (field) => String(card.querySelector(`[data-variant-edit-field="${field}"]`)?.value || "").trim();
        const updated = {
          ...variant,
          title: read("title"),
          content: read("content"),
          answer: read("answer"),
          solution: read("solution"),
          approvalStatus: "pending-teacher-review",
          reviewRequired: true,
          teacherEditedAt: new Date().toISOString()
        };
        updated.solutionDetail = {
          ...(variant.solutionDetail || {}),
          overview: read("solution") || variant.solutionDetail?.overview || "",
          steps: [{
            reasoning: read("solution"),
            equation: "",
            substitution: "",
            result: read("answer")
          }],
          finalAnswer: read("answer"),
          parentDifference: variant.changeSummary || variant.solutionDetail?.parentDifference || ""
        };
        updated.validation = window.PhysicsStudioVariantGenerator.validateVariant(parent, updated);
        const index = set.variants.findIndex((item) => item.id === variantId);
        set.variants[index] = updated;
        set.status = "pending-review";
        set.approvalStatus = "pending-teacher-review";
        set.reviewRequired = true;
        engine.saveVariantSet(lab.state, set);
        saveLearningState();
        showLabMessage(updated.validation.passed
          ? "编辑已保存并重新通过独立质量门禁，仍需教师点击“通过”。"
          : `编辑已保存，但质量门禁未通过：${(updated.validation.failedReasons || []).join("；")}`,
        !updated.validation.passed);
      } else if (action === "regenerate" || action === "regenerate-one") {
        const regenerated = await window.PhysicsStudioVariantGenerator.generateVariantSet(parent, {
          questions: getQuestions(),
          existingSets: [],
          count: Math.max(2, Math.min(3, set.variants.length || 3)),
          allowAi: true,
          aiTutor: window.PhysicsStudioAITutor,
          aiContext: {
            profile: lab.state.profiles?.find((profile) => profile.id === lab.state.activeProfileId),
            guardianConsentStatus: lab.state.profiles?.find((profile) => profile.id === lab.state.activeProfileId)?.guardianConsentStatus
          }
        });
        if (action === "regenerate-one") {
          const previous = set.variants.find((variant) => variant.id === variantId);
          const replacement = regenerated.variants?.find((variant) => variant.variantRole === previous?.variantRole);
          if (!previous || !replacement) throw new Error("服务未返回相同迁移角色的替换题，原题已保留。 ");
          set.stale = false;
          set.status = "pending-review";
          set.approvalStatus = "pending-teacher-review";
          set.reviewRequired = true;
          set.variants = set.variants.map((variant) => variant.id === variantId ? replacement : variant);
          engine.saveVariantSet(lab.state, set);
        } else {
          set.stale = true;
          set.status = "stale";
          set.updatedAt = new Date().toISOString();
          regenerated.id = `${regenerated.id}-r${Date.now().toString(36)}`;
          regenerated.cacheKey = `${regenerated.cacheKey}|review-regeneration|${Date.now()}`;
          engine.saveVariantSet(lab.state, regenerated);
        }
        saveLearningState();
        showLabMessage(regenerated.variants?.length >= 2
          ? "已重新生成并进入质量门禁；AI 生成内容仍需教师审核。"
          : "重新生成后仍没有至少 2 道可验证变式题。",
        !(regenerated.variants?.length >= 2));
      }
    } catch (error) {
      showLabMessage(error.message || "变式审核操作失败。", true);
    }
    renderPanel({ scrollTo: "#variantReviewQueue" });
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
      knowledgePointId: question.knowledgePointId || question.topicKey || "",
      modelDefinitionId: question.modelDefinitionId || question.modelFamilyId || "",
      independenceGroupId: question.independenceGroupId || question.modelDefinitionId || question.modelFamilyId || "",
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
    const activePlan = engine.activeLearningPlan(lab.state, lab.state.activeProfileId);
    if (activePlan && new Date(attempt.createdAt || 0).getTime() >= new Date(activePlan.createdAt || 0).getTime()
      && engine.isValidAccuracyEvidence?.(attempt)
      && !activePlan.baselineEvidenceIds?.includes(attempt.id)) {
      activePlan.retestEvidenceIds = Array.isArray(activePlan.retestEvidenceIds)
        ? [...new Set([...activePlan.retestEvidenceIds, attempt.id])].slice(-100)
        : [attempt.id];
      activePlan.comparisonStatus = "insufficient";
      activePlan.updatedAt = new Date().toISOString();
    }
    const review = engine.scheduleReviewFromAttempt(lab.state, question.id, attempt.id);
    saveLearningState();
    if (attempt.grading.status === "incorrect" || attempt.grading.status === "partial") {
      await lab.app?.updateQuestion?.(question.id, {
        wrong: true,
        wrongAt: new Date().toISOString(),
        wrongCount: (Number(question.wrongCount) || 0) + 1,
        mastered: false
      });
    }
    lab.lastCompleted = { title: question.title, review, attempt };
    lab.session = null;
    lab.tab = "transfer";
    try {
      await prepareVariantTraining(question, { allowAi: false, count: 3 });
    } catch (error) {
      lab.variantGenerationStatus = "";
      console.warn("Variant preparation failed", error);
    }
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
    saveLearningState();
    document.dispatchEvent(new CustomEvent("physics-learning-event", {
      detail: { type: "transfer-completed", questionId: question.id, variantIndex: index }
    }));
    if (lab.lastCompleted?.review) lab.tab = "review";
    renderPanel();
  }

  function playModel() {
    stopModelAnimation();
    if (!ANIMATED_MODELS.has(lab.modelType)) return;
    const start = performance.now();
    const params = lab.modelParams[lab.modelType];
    const duration = lab.modelType === "projectile"
      ? 2 * params.v0 * Math.sin(params.angle * Math.PI / 180) / params.g
      : lab.modelType === "wave"
        ? 1 / params.frequency
        : Number(params.duration) || 5;
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
      const variantSession = lab.tab === "transfer" ? lab.variantTraining?.session : null;
      const session = variantSession || lab.session;
      const timer = document.getElementById(variantSession ? "variantSessionTimer" : "sessionTimer");
      if (!timer || !session) return;
      timer.textContent = formatDuration((Date.now() - session.startedAt) / 1000);
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
      [lab.modelType]: { ...MODEL_DEFAULTS[lab.modelType] }
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
    if (!target) return;
    if (!visuals?.scatterFit) {
      target.innerHTML = '<div class="tool-result warning">线性拟合组件未加载。</div>';
      return;
    }
    const regression = visuals.scatterFit({ points });
    if (!regression.valid) {
      target.innerHTML = `${regression.svg}<div class="tool-result warning"><strong>当前数据不能完成线性拟合</strong><p>${escapeHtml(regression.reason)}</p></div>`;
      return;
    }
    target.innerHTML = `
      ${regression.svg}
      <div class="tool-result success">
        <strong>y = ${formatNumber(regression.slope, 5)}x ${regression.intercept >= 0 ? "+" : "−"} ${formatNumber(Math.abs(regression.intercept), 5)}</strong>
        <p>R² = ${formatNumber(regression.r2, 5)}；样本数 n = ${regression.count}。拟合优度不能替代残差、系统误差和物理模型检查。</p>
      </div>`;
  }

  function updateRayOutput() {
    const target = document.getElementById("rayDiagramOutput");
    if (!target) return;
    if (!visuals?.rayDiagram) {
      target.innerHTML = '<div class="tool-result warning">基础光路组件未加载。</div>';
      return;
    }
    const result = visuals.rayDiagram(lab.rayParams);
    const conclusion = result.totalInternalReflection
      ? "n₁sin i > n₂，当前条件发生全反射。"
      : result.mode === "reflection"
        ? `反射角 r = ${formatNumber(result.reflectionAngle)}°，满足 i=r。`
        : `折射角 r = ${formatNumber(result.refractionAngle)}°，满足 n₁sin i=n₂sin r。`;
    target.innerHTML = `${result.svg}<div class="tool-result success"><strong>${escapeHtml(conclusion)}</strong><p>入射角 i=${formatNumber(result.incidenceAngle)}°；n₁=${formatNumber(result.n1)}，n₂=${formatNumber(result.n2)}。</p></div>`;
    lab.content?.querySelectorAll("[data-ray-value]").forEach((node) => {
      const key = node.dataset.rayValue;
      node.textContent = `${formatNumber(lab.rayParams[key])}${key === "incidenceAngle" ? "°" : ""}`;
    });
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

  async function generateAssignment() {
    const includeVariants = Boolean(document.getElementById("assignmentIncludeVariants")?.checked);
    const variantCount = Math.max(2, Math.min(3, Number(document.getElementById("assignmentVariantCount")?.value) || 3));
    const includeReverse = Boolean(document.getElementById("assignmentIncludeReverse")?.checked);
    const includeContext = Boolean(document.getElementById("assignmentIncludeContext")?.checked);
    const preferredQuestionIds = Boolean(document.getElementById("assignmentIncludeWrong")?.checked)
      ? [...new Set((lab.state.attempts || [])
        .filter((attempt) => attempt.profileId === (lab.managedStudentId || lab.state.activeProfileId)
          && ["incorrect", "partial"].includes(attempt.grading?.status))
        .map((attempt) => attempt.questionId))]
      : [];
    const settings = {
      title: document.getElementById("assignmentTitle")?.value.trim(),
      stage: document.getElementById("assignmentStage")?.value,
      grade: document.getElementById("assignmentGrade")?.value,
      topic: document.getElementById("assignmentTopic")?.value,
      difficulty: document.getElementById("assignmentDifficulty")?.value,
      count: Number(document.getElementById("assignmentCount")?.value),
      preferredQuestionIds,
      difficultyRatios: {
        "基础": Number(document.getElementById("assignmentBasicRatio")?.value) || 0,
        "进阶": Number(document.getElementById("assignmentAdvancedRatio")?.value) || 0,
        "挑战": Number(document.getElementById("assignmentChallengeRatio")?.value) || 0
      }
    };
    const assignment = engine.generateAssignment(getQuestions(), settings);
    if (!assignment.questionCount) {
      showLabMessage("当前条件下没有完整且可用于组卷的题目。", true);
      return;
    }
    assignment.parentQuestionIds = assignment.questionIds.slice();
    assignment.variantQuestionIds = [];
    assignment.variantSetIds = [];
    assignment.targetProfileIds = lab.managedStudentId ? [lab.managedStudentId] : [];
    assignment.variantOptions = { includeVariants, variantCount, includeReverse, includeContext };
    let pendingReviewCount = 0;
    if (includeVariants) {
      const questionMap = new Map(getQuestions().map((question) => [question.id, question]));
      const profile = lab.state.profiles?.find((item) => item.id === (lab.managedStudentId || lab.state.activeProfileId));
      for (const parentId of assignment.parentQuestionIds) {
        const parent = questionMap.get(parentId);
        if (!parent) continue;
        let set = await window.PhysicsStudioVariantGenerator.generateVariantSet(parent, {
          questions: getQuestions(),
          existingSets: lab.state.variantSets,
          count: variantCount,
          allowAi: true,
          minorUnder14: profile?.minorAgeBand === "under14",
          minorAgeBand: profile?.minorAgeBand || "unknown",
          guardianConsentStatus: profile?.guardianConsentStatus,
          personalIdentifiers: [profile?.name, profile?.studentNumber].filter(Boolean)
        });
        if (set.variants?.length) set = engine.saveVariantSet(lab.state, set);
        if (set.status !== "approved") {
          if (set.status === "pending-review") pendingReviewCount += 1;
          continue;
        }
        const allowed = set.variants
          .filter((variant) => variant.variantRole === "near"
            || (variant.variantRole === "reverse" && includeReverse)
            || (variant.variantRole === "context" && includeContext))
          .filter((variant) => variant.validation?.passed === true
            && ["system-validated", "teacher-approved"].includes(variant.approvalStatus))
          .slice(0, variantCount);
        if (allowed.length < 2) continue;
        assignment.variantSetIds.push(set.id);
        assignment.variantQuestionIds.push(...allowed.map((variant) => variant.id));
      }
      assignment.questionIds.push(...assignment.variantQuestionIds);
      assignment.questionCount = assignment.questionIds.length;
    }
    assignment.reviewStatus = "教师待确认";
    assignment.publishStatus = "preview-only";
    assignment.variantSetIds = [...new Set(assignment.variantSetIds)];
    assignment.variantQuestionIds = [...new Set(assignment.variantQuestionIds)];
    assignment.questionIds = [...new Set(assignment.questionIds)];
    assignment.questionCount = assignment.questionIds.length;
    const presetName = document.getElementById("assignmentPresetName")?.value.trim();
    if (presetName) {
      engine.saveVariantPreset(lab.state, {
        name: presetName,
        stage: settings.stage,
        grade: settings.grade,
        topic: settings.topic,
        difficulty: settings.difficulty,
        parentCount: settings.count,
        variantsPerParent: variantCount,
        includeVariants,
        includeWrong: preferredQuestionIds.length > 0,
        includeReverse,
        includeContext,
        difficultyRatios: {
          basic: settings.difficultyRatios["基础"],
          advanced: settings.difficultyRatios["进阶"],
          challenge: settings.difficultyRatios["挑战"]
        }
      });
    }
    lab.assignmentPreview = assignment;
    saveLearningState();
    showLabMessage(pendingReviewCount
      ? `${pendingReviewCount} 组 AI 变式正在等待教师审核，本次预览未将其加入作业。`
      : "作业预览已生成，请核对学生范围、题目来源、数量和变式校验状态。",
    false);
    renderPanel({ scrollTo: ".assignment-variant-preview" });
  }

  function applyAssignmentPreset() {
    const presetId = document.getElementById("assignmentPresetSelect")?.value;
    const preset = (lab.state.variantPresets || []).find((item) => item.id === presetId);
    if (!preset) {
      showLabMessage("请先选择一组已保存的常用参数。", true);
      return;
    }
    const setValue = (id, value) => {
      const field = document.getElementById(id);
      if (field && value !== undefined && value !== null) field.value = String(value);
    };
    const setChecked = (id, value) => {
      const field = document.getElementById(id);
      if (field) field.checked = value === true;
    };
    setValue("assignmentStage", preset.stage || "全部");
    setValue("assignmentGrade", preset.grade || "全部");
    setValue("assignmentTopic", preset.topic || "全部");
    setValue("assignmentDifficulty", preset.difficulty || "全部");
    setValue("assignmentCount", preset.parentCount);
    setValue("assignmentVariantCount", preset.variantsPerParent);
    setValue("assignmentBasicRatio", preset.difficultyRatios?.basic ?? 50);
    setValue("assignmentAdvancedRatio", preset.difficultyRatios?.advanced ?? 35);
    setValue("assignmentChallengeRatio", preset.difficultyRatios?.challenge ?? 15);
    setChecked("assignmentIncludeVariants", preset.includeVariants !== false);
    setChecked("assignmentIncludeWrong", preset.includeWrong !== false);
    setChecked("assignmentIncludeReverse", preset.includeReverse !== false);
    setChecked("assignmentIncludeContext", preset.includeContext !== false);
    showLabMessage(`已应用常用参数“${preset.name}”，生成前仍可调整。`, false);
  }

  function confirmAssignmentPreview() {
    const assignment = lab.assignmentPreview;
    if (!assignment?.questionIds?.length) return;
    const approvedVariantIds = new Set((lab.state.variantSets || [])
      .filter((set) => set.status === "approved" && set.stale !== true)
      .flatMap((set) => set.variants
        .filter((variant) => variant.validation?.passed === true
          && ["system-validated", "teacher-approved"].includes(variant.approvalStatus))
        .map((variant) => variant.id)));
    if ((assignment.variantQuestionIds || []).some((id) => !approvedVariantIds.has(id))) {
      showLabMessage("预览中有变式已失效或未通过审核，请重新生成预览。", true);
      return;
    }
    const saved = {
      ...assignment,
      reviewStatus: "教师已确认·待发布",
      publishStatus: "ready-for-classroom-publish",
      teacherConfirmedAt: new Date().toISOString()
    };
    lab.state.assignments.push(saved);
    lab.assignmentPreview = null;
    saveLearningState();
    document.dispatchEvent(new CustomEvent("physics-studio-assignment-confirmed", { detail: { assignment: { ...saved } } }));
    showLabMessage("作业已加入待发布列表；班级同步开启时可继续下发。", false);
    renderPanel({ scrollTo: ".assignment-list" });
  }

  function previewTieredAssignment() {
    const profiles = lab.state.profiles.filter((profile) => profile.role === "student");
    lab.tieredAssignmentPreview = engine.buildTieredAssignmentDraft(lab.state, getQuestions(), {
      profileIds: profiles.map((profile) => profile.id)
    });
    renderPanel();
  }

  function confirmTieredAssignment() {
    const preview = lab.tieredAssignmentPreview;
    if (!preview || preview.status !== "teacher-confirmation-required" || !preview.questionIds?.length) return;
    const firstStudent = preview.studentScope[0];
    const assignment = {
      id: `assignment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: preview.title,
      stage: /^高/.test(firstStudent?.grade || "") ? "高中" : "初中",
      grade: firstStudent?.grade || "全部",
      topic: preview.knowledgePointIds.join("、"),
      knowledgePointIds: preview.knowledgePointIds.slice(),
      targetProfileIds: preview.studentScope.map((item) => item.profileId),
      evidenceIds: preview.evidenceIds.slice(),
      questionIds: preview.questionIds.slice(),
      questionCount: preview.questionCount,
      reviewStatus: "教师已确认·待发布",
      publishStatus: "ready-for-classroom-publish",
      teacherConfirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    lab.state.assignments.push(assignment);
    engine.saveState(lab.state);
    document.dispatchEvent(new CustomEvent("physics-studio-tiered-assignment-confirmed", {
      detail: { assignment: { ...assignment } }
    }));
    lab.tieredAssignmentPreview = null;
    renderPanel();
  }

  function exportAssignment(assignmentId) {
    const assignment = lab.state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    const questionMap = new Map(getQuestions().map((question) => [question.id, question]));
    (lab.state.variantSets || []).forEach((set) => set.variants.forEach((variant) => questionMap.set(variant.id, variant)));
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
    if (!window.PhysicsStudioAITutor?.tutorTurn) return;
    lab.aiResult = null;
    lab.aiStatusMessage = window.PhysicsStudioAITutor.status?.().ready
      ? "正在请求受控导师；若服务不可达会自动切换到本机提示……"
      : "正在生成本机下一步提示……";
    renderPanel();
    try {
      const activeStudent = engine.activeProfile(lab.state);
      const offlineHints = engine.createHintLadder(question).map((item) => item.text);
      lab.aiResult = await window.PhysicsStudioAITutor.tutorTurn({
        question,
        studentWork: [
          lab.session.model?.equations,
          lab.session.finalAnswer,
          lab.session.reflection
        ].filter(Boolean).join("\n"),
        hintLevelUsed: lab.session.hintLevel,
        modeling: lab.session.model,
        sessionState: lab.aiSessionState,
        offlineHints,
        personalIdentifiers: [activeStudent?.name, activeStudent?.studentNumber, activeStudent?.className].filter(Boolean),
        minorUnder14: activeStudent?.minorAgeBand === "under14",
        minorAgeBand: activeStudent?.minorAgeBand || "unknown",
        guardianConsentStatus: activeStudent?.guardianConsentStatus
      });
      lab.aiSessionState = lab.aiResult.sessionState || null;
      lab.session.hintLevel = Math.max(lab.session.hintLevel, Number(lab.aiResult.hintLevel) || 0);
      lab.aiStatusMessage = lab.aiResult.source === "gateway"
        ? "受控导师已返回一个思考步骤。"
        : lab.aiResult.fallbackReason === "age-unconfirmed"
          ? "年龄分组未确认，未发送学生内容；当前使用本机五级提示。"
          : lab.aiResult.fallbackReason === "guardian-consent-required"
            ? "监护人授权未确认，未发送学生内容；当前使用本机五级提示。"
            : lab.aiResult.fallbackReason === "server-authorization-unverified"
              ? "服务端学生授权核验未完成，未发送学生内容；当前使用本机五级提示。"
              : lab.aiResult.gatewayUnavailable
                ? "受控导师暂不可用；当前使用本机五级提示。"
                : "当前使用本机五级提示。";
    } catch (error) {
      lab.aiStatusMessage = `本次指导未启动：${error.message}`;
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
        ? "受控服务地址已保存；连接及学生授权尚未验证，学生内容不会自动发送。"
        : "已切换为离线规则模式。";
      renderPanel();
    } catch (error) {
      lab.aiStatusMessage = `设置未保存：${error.message}`;
      renderPanel();
    }
  }

  async function testAiConfig() {
    saveAiConfig();
    if (!window.PhysicsStudioAITutor.status().configured) {
      lab.aiStatusMessage = "请先保存有效的受控服务地址。";
      renderPanel();
      return;
    }
    lab.aiStatusMessage = "正在测试受控服务端……";
    renderPanel();
    try {
      const ok = await window.PhysicsStudioAITutor.testConnection();
      lab.aiStatusMessage = ok ? "服务端健康检查可达；模型权限和学生授权仍未核验。" : "服务端响应未确认可用。";
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
      rightsConfirmed: document.getElementById("documentImportRights")?.checked,
      uploadConfirmed: document.getElementById("documentRemoteUploadConfirmed")?.checked
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
        draftToken: engine.createId("document-draft"),
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

  function selectStudentProfile(profileId, todoAction = "", actionId = "") {
    if (!lab.state.profiles.some((profile) => profile.id === profileId)) return;
    if (lab.tab === "teacher" && !captureTeacherViewDraft(lab.teacherView)) return;
    lab.state.activeProfileId = profileId;
    lab.managedStudentId = profileId;
    lab.planPreview = null;
    let scrollTo = "";
    if (["placement.start", "placement.resume"].includes(actionId)) lab.tab = "diagnostic";
    else if (actionId === "review.overdue") lab.tab = "review";
    else {
      lab.tab = "teacher";
      if (actionId === "answer.review") { lab.teacherView = "today"; scrollTo = "#teacher-manual-review"; }
      else if (actionId === "content.review") { lab.teacherView = "manage"; lab.advancedToolsOpen = true; scrollTo = ".content-review-list"; }
      else if (["retest.schedule", "plan.review", "exam.create-plan"].includes(actionId)) { lab.teacherView = "students"; scrollTo = ".targeted-plan-card"; }
      else lab.teacherView = "students";
    }
    saveLearningState();
    renderPanel(scrollTo ? { scrollTo } : {});
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
      const scoreRaw = document.getElementById("examRecordScore")?.value?.trim() || "";
      const totalRaw = document.getElementById("examRecordTotal")?.value?.trim() || "";
      const score = Number(scoreRaw);
      const totalScore = Number(totalRaw);
      if (!scoreRaw || !totalRaw || !Number.isFinite(score) || !Number.isFinite(totalScore)
        || totalScore <= 0 || score < 0 || score > totalScore) {
        throw new Error("请先填写有效得分和总分：总分必须大于 0，得分必须在 0 到总分之间。");
      }
      const profile = engine.activeProfile(lab.state);
      const catalog = engine.topicCatalog(getQuestions(), profile?.grade || "");
      const selectedWeakTopics = [...document.querySelectorAll("[data-exam-topic]:checked")]
        .map((input) => input.value);
      const selectedWeakTopicKeys = selectedWeakTopics
        .map((topic) => engine.normalizeTopic(topic, { catalog }).key)
        .filter(Boolean);
      engine.addExamRecord(lab.state, {
        title: document.getElementById("examRecordTitle")?.value,
        examDate: document.getElementById("examRecordDate")?.value,
        score,
        totalScore,
        weakTopics: selectedWeakTopics,
        weakTopicKeys: selectedWeakTopicKeys,
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

  function resolveExamTopics() {
    const profile = engine.activeProfile(lab.state);
    let resolved = 0;
    lab.state.examRecords = lab.state.examRecords.map((record) => {
      if (record.profileId !== profile?.id || !(record.unresolvedWeakTopics || []).length) return record;
      const next = engine.resolveExamRecordTopics(record, getQuestions());
      if (!(next.unresolvedWeakTopics || []).length) resolved += 1;
      return next;
    });
    saveLearningState();
    showLabMessage(resolved ? `已确认 ${resolved} 份试卷的知识点映射。` : "仍有知识点无法映射，请先检查年级或保留为待确认值。", !resolved);
    renderPanel();
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
      const text = await file.text();
      try {
        const payload = JSON.parse(text);
        if (payload?.format !== "physics-exam-records" || Number(payload.version) !== 1 || !Array.isArray(payload.records)) {
          throw new Error("不是受支持的试卷记录 JSON 文件。");
        }
        previewExamImportRecords(payload.records);
      } catch (jsonError) {
        if (jsonError instanceof SyntaxError) previewExamImport(text);
        else throw jsonError;
      }
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

  function exportStudentReportHtmlV2() {
    const report = engine.createReportPayload(lab.state, getQuestions());
    const analysis = report.analysis || {};
    const profile = report.profile;
    const coverage = analysis.evidenceCoverage || {
      coverageLabel: "0/0",
      levelLabel: "证据不足",
      byTopic: [],
      reason: "证据不足：尚未形成可追溯知识点覆盖。"
    };
    const plan = lab.state.learningPlans
      .filter((item) => item.profileId === profile.id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
    const planProgress = engine.learningPlanProgress(lab.state, plan);
    const questionMap = new Map(getQuestions().map((question) => [question.id, question]));
    const priorityTopics = (analysis.weakest || []).slice(0, 3);
    const topicEvidence = new Map((analysis.knowledgePoints || []).map((item) => [item.topicKey || engine.normalizeTopic(item.topic).key, item]));
    const evidenceForTopic = (topic) => topicEvidence.get(topic.topicKey || engine.normalizeTopic(topic.topic).key);
    const evidenceAnchor = (id) => `evidence-${String(id || "unknown").replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const teacherNotes = lab.state.growthRecords
      .filter((item) => item.profileId === profile.id && item.type === "teacher-note")
      .slice(-20);
    const referencedEvidenceIds = new Set();
    const priorityHtml = priorityTopics.length ? priorityTopics.map((topic, index) => {
      const evidence = evidenceForTopic(topic);
      const attempts = report.attempts.filter((attempt) => {
        return (attempt.topicKey && attempt.topicKey === (topic.topicKey || evidence?.topicKey))
          || (!attempt.topicKey && attempt.topic === topic.topic);
      });
      const exams = report.examRecords.filter((record) => {
        return (record.weakTopicKeys || []).includes(topic.topicKey)
          || (record.weakTopics || []).includes(topic.topic);
      });
      const diagnostic = report.diagnosticAttempts?.filter((item) => (item.topics || []).includes(topic.topic)) || [];
      const evidenceIds = [...new Set([
        ...(evidence?.evidenceIds || []),
        ...attempts.map((item) => item.id),
        ...exams.map((item) => item.id),
        ...diagnostic.map((item) => item.id)
      ].filter(Boolean))];
      evidenceIds.forEach((id) => referencedEvidenceIds.add(id));
      const modelGroups = new Set();
      let unclassifiedModelCount = 0;
      attempts.forEach((attempt) => {
        const question = questionMap.get(attempt.questionId) || {};
        const group = attempt.independenceGroupId || question.independenceGroupId
          || attempt.modelDefinitionId || question.modelDefinitionId
          || attempt.modelFamilyId || question.modelFamilyId;
        if (group) modelGroups.add(group);
        else unclassifiedModelCount += 1;
      });
      const highHintCount = attempts.filter((attempt) => Number(attempt.hintLevel || 0) >= 3).length;
      const freshness = evidence?.evidenceFreshness || {};
      const confirmation = teacherNotes.find((note) => {
        const text = `${note.title || ""} ${note.detail || ""} ${note.evidence || ""}`;
        return text.includes(topic.topic) || evidenceIds.some((id) => text.includes(id));
      });
      const uncertainties = [];
      if (!evidence || Number(evidence.sampleSize || 0) < 2) uncertainties.push("样本量不足，不能形成稳定能力结论");
      if (Number(evidence?.pendingReviewCount || 0)) uncertainties.push(`仍有 ${evidence.pendingReviewCount} 条作答待人工复核`);
      if (freshness.needsReconfirmation) uncertainties.push("证据较旧或缺少日期，需要重新确认");
      if (!modelGroups.size && attempts.length) uncertainties.push("现有作答缺少可识别模型组，不能判断证据独立性");
      const evidenceLinks = evidenceIds.length
        ? evidenceIds.map((id) => `<a href="#${evidenceAnchor(id)}">${escapeHtml(id)}</a>`).join("、")
        : "无";
      return `<article class="priority-evidence" id="priority-${index + 1}"><h3>${index + 1}. ${escapeHtml(topic.topic)}</h3>
        <p><strong>事实：</strong>${evidence?.submittedCount ?? attempts.length} 条提交，${evidence?.scoredCount ?? 0} 条已评分，${evidence?.correctCount ?? 0} 条正确，${evidence?.pendingReviewCount ?? 0} 条待人工复核；试卷证据 ${exams.length} 条，诊断证据 ${diagnostic.length} 条，迁移成功证据 ${Number(evidence?.transferSuccessCount || 0)} 条。</p>
        <p><strong>证据独立性：</strong>正式作答 ${attempts.length} 次，可识别为 ${modelGroups.size} 个模型/独立组${unclassifiedModelCount ? `，另有 ${unclassifiedModelCount} 条无法确认独立性` : ""}；高提示作答 ${highHintCount} 次。</p>
        <p><strong>系统推断：</strong>${escapeHtml(evidence?.status || "证据不足")}。${escapeHtml((evidence?.reasons || ["尚无足够证据形成推断"]).join("；"))}</p>
        <p><strong>教师确认：</strong>${confirmation ? `已记录（${escapeHtml(confirmation.recordedAt || confirmation.createdAt || "未记录时间")}）：${escapeHtml(confirmation.detail || confirmation.title)}` : "待确认"}</p>
        <p><strong>证据新鲜度：</strong>${freshness.latestEvidenceAt ? `${escapeHtml(evidence.latestEvidenceDate || freshness.latestEvidenceAt)}，距今约 ${freshness.ageDays} 天` : "尚无有效日期"}${freshness.needsReconfirmation ? "；建议重新确认" : ""}</p>
        <p><strong>不确定性：</strong>${escapeHtml(uncertainties.join("；") || "当前未发现额外不确定性，但本结论仍属于形成性判断")}</p>
        <p><strong>原始证据 ID：</strong>${evidenceLinks}</p></article>`;
    }).join("") : "<p>当前没有达到优先问题门槛的知识点；这不等于所有领域都已掌握。</p>";
    const untested = coverage.byTopic.filter((item) => !item.sampleSize).map((item) => item.label);
    const recentDates = coverage.byTopic.map((item) => item.latestEvidenceDate).filter(Boolean).sort();
    const transferRecords = lab.state.experimentRecords.filter((item) => item.profileId === profile.id && item.type === "transfer");
    const planQuestions = plan?.questionIds?.map((id) => questionMap.get(id)?.title || id) || [];
    const comparison = plan
      ? engine.buildComparableInterventionOutcome(lab.state, plan, getQuestions())
      : { comparisonStatus: "insufficient", comparisonReason: "尚未生成专项方案。", preScoredCount: 0, postScoredCount: 0, pendingReviewCount: 0, matchedPairCount: 0, preAccuracy: null, postAccuracy: null, delta: null, conclusion: "证据不足" };
    (comparison.pairs || []).forEach((pair) => {
      referencedEvidenceIds.add(pair.beforeEvidenceId);
      referencedEvidenceIds.add(pair.retestEvidenceId);
    });
    const comparisonText = comparison.comparisonStatus === "comparable"
      ? `配对证据前 ${comparison.pairedPreAccuracy}% → 后 ${comparison.pairedPostAccuracy}%（前后变化 ${comparison.pairedDelta >= 0 ? "+" : ""}${comparison.pairedDelta} 个百分点；${comparison.matchedPairCount} 对；结论：${comparison.conclusion}）。这是一项形成性比较，不代表因果性能力提升。`
      : comparison.comparisonStatus === "emerging"
        ? `已有 ${comparison.matchedPairCount} 对可比证据，出现${Number(comparison.pairedPostAccuracy) > Number(comparison.pairedPreAccuracy) ? "改善迹象" : "阶段性表现"}，尚需复测；按产品规则不计算百分点变化。`
        : `干预后表现：${comparison.postAccuracy == null ? "暂无可评分证据" : `${comparison.postAccuracy}%（${comparison.postScoredCount} 条）`}。当前前后证据不可直接比较，暂不计算提升幅度。`;
    const pendingReviews = report.attempts.filter((attempt) => engine.isPendingManualReview?.(attempt));
    pendingReviews.forEach((attempt) => referencedEvidenceIds.add(attempt.id));
    const rawEvidence = [
      ...report.attempts.map((item) => ({
        id: item.id,
        type: "作答",
        date: item.completedAt || item.createdAt,
        title: questionMap.get(item.questionId)?.title || item.questionId,
        detail: `评分状态：${item.grading?.status || "未记录"}；提示等级：${Number(item.hintLevel || 0)}；信心：${item.confidenceBefore ?? "未记录"}；错误类型：${item.errorType || "未记录"}`
      })),
      ...(report.diagnosticAttempts || []).map((item) => ({
        id: item.id,
        type: "诊断",
        date: item.createdAt,
        title: item.misconceptionCode || item.diagnosticId || "诊断记录",
        detail: `答案是否正确：${typeof item.answerCorrect === "boolean" ? (item.answerCorrect ? "是" : "否") : "待复核"}；信心：${item.confidence ?? "未记录"}`
      })),
      ...(report.examRecords || []).map((item) => ({
        id: item.id,
        type: "试卷",
        date: item.examDate || item.createdAt,
        title: item.title || item.examId || "试卷记录",
        detail: `得分：${item.score ?? "未记录"}/${item.totalScore ?? "未记录"}；知识点：${(item.weakTopics || []).join("、") || "未标注"}`
      })),
      ...(report.experimentRecords || []).map((item) => ({
        id: item.id,
        type: item.type === "transfer" ? "迁移" : "实验",
        date: item.completedAt || item.createdAt,
        title: questionMap.get(item.questionId)?.title || item.questionId || "实验记录",
        detail: `核验状态：${item.verificationStatus || "待复核"}`
      }))
    ];
    const evidenceAppendix = rawEvidence
      .filter((item) => item.id && referencedEvidenceIds.has(item.id))
      .map((item) => `<article class="raw-evidence" id="${evidenceAnchor(item.id)}"><h3>${escapeHtml(item.type)} · ${escapeHtml(item.title || item.id)}</h3><p>Evidence ID：<code>${escapeHtml(item.id)}</code> · 日期：${escapeHtml(item.date || "未记录")}</p><p>${escapeHtml(item.detail || "未记录")}</p></article>`)
      .join("") || "<p>当前优先结论尚无可列出的原始证据。</p>";
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(profile.name)}学情与专项提升报告</title>
      <style>body{font:16px/1.7 system-ui,sans-serif;color:#1c2824;max-width:980px;margin:36px auto;padding:0 24px}h1,h2,h3{color:#174f3e}a{color:#11634d}code{overflow-wrap:anywhere}header{border-bottom:3px solid #174f3e;margin-bottom:24px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.summary div{background:#f2f6f1;padding:14px;border-radius:10px}.summary strong{display:block;font-size:22px}.priority-evidence,.raw-evidence{border:1px solid #ccd8d2;padding:12px;margin:10px 0;border-radius:8px}.boundary{background:#fff4dc;padding:14px;border-left:4px solid #986115}li{margin:5px 0}@media(max-width:700px){.summary{grid-template-columns:1fr}}@media print{body{margin:0}.core-summary{break-after:page}}</style>
      </head><body><section class="core-summary"><header><h1>学情与专项提升报告</h1><p>学生：${escapeHtml(profile.name)} · 年级：${escapeHtml(profile.grade)} · 报告时间：${escapeHtml(new Date(report.exportedAt).toLocaleString("zh-CN"))}</p></header>
      <section class="summary"><div><strong>${escapeHtml(coverage.coverageLabel || "0/0")}</strong>知识点证据覆盖（已有证据/可评估）</div><div><strong>${escapeHtml(coverage.levelLabel || "证据不足")}</strong>全局证据质量</div><div><strong>${report.attempts.length}</strong>正式作答记录（本机）</div></section>
      <h2>最多三个优先问题及原始证据</h2>${priorityHtml}
      <h2>建议与教师确认</h2><p>${escapeHtml(analysis.priorities?.slice(0, 3).join("；") || "先补充独立作答证据，再决定专项训练。")}</p><p>${teacherNotes.length ? `已记录 ${teacherNotes.length} 条教师备注；详见后文。` : "教师尚未确认系统推断。"}</p>
      <h2>专项干预与可比复测</h2>${plan ? `<p><strong>${escapeHtml(plan.title)}</strong> · ${plan.questionCount}题 · 总计约 ${plan.totalExpectedMinutes || plan.expectedMinutes || "未记录"} 分钟，分 ${plan.sessions?.filter((item) => item.status !== "not-required").length || 1} 次完成 · ${plan.confirmationStatus === "teacher-confirmed" ? `教师已确认（${escapeHtml(plan.teacherConfirmedAt || plan.approvedAt || "")}）` : "未发现教师确认时间"}</p><p>完成情况：${planProgress.completed}/${planProgress.total}（${planProgress.percent}%）；结构：${escapeHtml(plan.structureLabel || "按现有题目元数据如实组织")}</p>` : "<p>尚未生成或确认3/5/7题专项方案。</p>"}<p>${escapeHtml(comparisonText)}</p><p>比较状态：${escapeHtml(comparison.comparisonStatus)}；前后配对 ${comparison.matchedPairCount} 对；待人工复核 ${comparison.pendingReviewCount} 条。${escapeHtml(comparison.comparisonReason)}</p>
      <h2>待人工复核</h2><p>${pendingReviews.length ? `${pendingReviews.length} 条开放题/建模作答仍待教师确认，尚未进入正式正确率。` : "当前没有待人工复核作答。"}</p>
      <h2>分析边界</h2><p class="boundary">${escapeHtml(analysis.boundary || "所有结论均为形成性证据，不能替代教师对开放题、迁移题和长期困难的确认。")} 前后变化仅在满足产品可比规则时显示；该规则不是标准化测评阈值，也不构成因果性能力提升结论。</p></section>
      <h2>证据覆盖与未测范围</h2><p>${escapeHtml(coverage.reason || "证据不足")}</p><p>未测试领域：${escapeHtml(untested.length ? untested.join("、") : "当前可评估知识点均有至少一条记录")}</p><p>最近证据日期：${escapeHtml(recentDates.at(-1) || "无")}</p>
      <h2>已执行专项方案明细</h2>${plan ? `<p>预定达标条件：${escapeHtml(plan.target || "教师需在复测后确认跨日期独立正确与迁移证据")}</p><p>方案题目：${escapeHtml(planQuestions.join("；") || "无")}</p><p>迁移记录：${transferRecords.length} 条；是否达到质量要求仍以 verificationStatus 和教师复核为准。</p>` : "<p>无。</p>"}
      <h2>教师最终备注与确认时间</h2>${teacherNotes.length ? `<ul>${teacherNotes.map((item) => `<li>${escapeHtml(item.recordedAt || item.createdAt || "")}：${escapeHtml(item.title)}；${escapeHtml(item.detail)}${item.evidence ? `（证据：${escapeHtml(item.evidence)}）` : ""}</li>`).join("")}</ul>` : "<p>尚无教师最终备注。</p>"}
      <h2>原始证据附录</h2>${evidenceAppendix}</body></html>`;
    downloadText(`学情与专项提升报告-${safeFileName(profile.name)}-${dateFileName()}.html`, html, "text/html");
  }

  function exportStudentReportHtml() {
    return exportStudentReportHtmlV2();
  }
    /* Legacy renderer retained below only as a reference for old exports.
    const report = engine.createReportPayload(lab.state, getQuestions());
    const analysis = report.analysis;
    const profile = report.profile;
    const rows = analysis.weakest.map((topic) => `
      <tr><td>${escapeHtml(topic.topic)}</td><td>${topic.attempts}</td><td>${topic.accuracy == null ? "暂无可评分证据" : `${topic.accuracy}%`}</td><td>${topic.averageHint}</td><td>${topic.modeling}</td></tr>`).join("");
    const timeline = engine.growthTimeline(lab.state, profile.id, 30).map((item) => `
      <li><time>${escapeHtml(formatDate(item.date))}</time><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(profile.name)}物理学情分析报告</title>
      <style>body{font:16px/1.7 system-ui,sans-serif;color:#1c2824;max-width:920px;margin:40px auto;padding:0 24px}h1,h2{color:#174f3e}header{border-bottom:3px solid #174f3e;margin-bottom:24px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metrics div{background:#f2f6f1;padding:16px;border-radius:10px}.metrics strong{display:block;font-size:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd8d2;padding:8px;text-align:left}li{margin:8px 0}li strong,li span{display:block}.boundary{background:#fff4dc;padding:14px;border-left:4px solid #986115}@media print{body{margin:0}.no-print{display:none}}</style>
      </head><body><header><h1>物理学情分析报告</h1><p>${escapeHtml(profile.name)} · ${escapeHtml(profile.grade)} · 物理</p><p>生成时间：${escapeHtml(new Date(report.exportedAt).toLocaleString("zh-CN"))}</p></header>
      <section class="metrics"><div><strong>${report.summary.completed}</strong>正式作答</div><div><strong>${report.summary.accuracy == null ? "暂无可评分证据" : `${report.summary.accuracy}%`}</strong>正确率</div><div><strong>${report.summary.independenceRate == null ? "暂无可评分证据" : `${report.summary.independenceRate}%`}</strong>独立完成率</div><div><strong>${report.summary.averageHint}</strong>平均提示等级</div></section>
      <h2>分析结论</h2><p>${escapeHtml(analysis.conclusion)}</p><h2>下一步建议</h2><ol>${analysis.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      <h2>薄弱知识点证据</h2><table><thead><tr><th>知识点</th><th>次数</th><th>正确率</th><th>平均提示</th><th>建模</th></tr></thead><tbody>${rows || "<tr><td colspan=\"5\">暂无足够记录</td></tr>"}</tbody></table>
      <h2>成长时间线</h2><ul>${timeline || "<li>暂无记录</li>"}</ul><p class="boundary">${escapeHtml(analysis.boundary)}</p></body></html>`;
    downloadText(`物理学情分析报告-${safeFileName(profile.name)}-${dateFileName()}.html`, html, "text/html");
  }

  */

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
      if (!String(parsed.profile.id || "").trim()) {
        throw new Error("导入档案缺少稳定的 profile.id，已拒绝写入。");
      }
      if (!String(parsed.profile.portableProfileId || "").trim()
        && String(parsed.profile.sourceProfileId || parsed.profile.id) === "student-default") {
        const staged = engine.importStudentReport(lab.state, parsed);
        saveLearningState();
        showLabMessage(staged.status === "duplicate"
          ? "该旧版档案已经导入过；请在班级证据区完成学生身份绑定。"
          : "旧版档案只有 student-default，已安全暂存；请在班级证据区明确绑定已有学生或建立新学生后再写入证据。", true);
        renderPanel();
        return;
      }
      const result = engine.importLearningProfile(lab.state, {
        ...parsed,
        attempts: parsed.attempts.slice(0, 10000),
        examRecords: Array.isArray(parsed.examRecords) ? parsed.examRecords.slice(0, 500) : [],
        growthRecords: Array.isArray(parsed.growthRecords) ? parsed.growthRecords.slice(0, 500) : []
      });
      lab.state.examRecords = lab.state.examRecords.map((record) => {
        return record.profileId === result.profile.id
          ? engine.resolveExamRecordTopics(record, getQuestions())
          : record;
      });
      saveLearningState();
      const addedAttempts = result.collections.attempts.added.length;
      const addedExams = result.collections.examRecords.added.length;
      const conflicts = Object.values(result.collections)
        .reduce((count, item) => count + (item.conflicts?.length || 0), 0);
      showLabMessage(`${result.profileAction === "created" ? "已新增学生" : "已合并到已有学生"}；新增作答 ${addedAttempts} 条、试卷 ${addedExams} 条${conflicts ? `；有 ${conflicts} 条冲突待复核` : ""}。`);
      renderPanel();
    } catch (error) {
      showLabMessage(error.message || "学习档案导入失败。", true);
    }
  }

  async function importStudentReports(files) {
    let imported = 0;
    let duplicates = 0;
    let identityRequired = 0;
    for (const file of files) {
      try {
        const parsed = JSON.parse(await file.text());
        const result = engine.importStudentReport(lab.state, parsed);
        if (result.status === "duplicate") duplicates += 1;
        else {
          imported += 1;
          if (result.status === "identity-required") identityRequired += 1;
        }
      } catch (error) {
        console.warn("忽略无效学生档案", file.name, error);
      }
    }
    saveLearningState();
    showLabMessage(`已导入 ${imported} 份有效学习档案${duplicates ? `，跳过 ${duplicates} 份重复版本` : ""}${identityRequired ? `；${identityRequired} 份旧报告需先绑定学生身份，暂未计入班级结论` : ""}。`, imported === 0 && duplicates === 0);
    renderPanel();
  }

  function aggregateImportedReports() {
    const map = new Map();
    const importedVersions = new Set();
    const statusLabels = {
      insufficient: "证据不足",
      reinforce: "需巩固",
      basic: "基本掌握",
      transferable: "可迁移"
    };
    lab.state.importedReports.forEach((report) => {
      const portableProfileId = String(report.profile?.portableProfileId || report.portableProfileId || "").trim();
      const boundProfile = report.boundProfileId
        ? lab.state.profiles.find((profile) => profile.id === report.boundProfileId)
        : null;
      if (report.identityStatus === "unresolved-legacy" || (!portableProfileId && !boundProfile)) return;
      const identityStatus = "resolved";
      const identityKey = portableProfileId || boundProfile.portableProfileId || boundProfile.id;
      const exportedAt = String(report.exportedAt || report.updatedAt || "").trim();
      const versionKey = portableProfileId && exportedAt ? `${portableProfileId}|${exportedAt}` : "";
      if (versionKey && importedVersions.has(versionKey)) return;
      if (versionKey) importedVersions.add(versionKey);
      const evidenceTopics = report.summary?.evidenceCoverage?.byTopic
        || report.summary?.knowledgePointEvidence?.byTopic
        || report.summary?.topics
        || [];
      const studentId = identityKey;
      const seenTopics = new Set();
      evidenceTopics.forEach((topic) => {
        const label = String(topic.label || topic.topic || "未分类").trim() || "未分类";
        const key = String(topic.key || topic.topicKey || label).trim();
        const current = map.get(key) || {
          topic: label,
          studentIds: new Set(),
          evidenceTotal: 0,
          statusCounts: {},
          identityStatuses: new Set()
        };
        if (!seenTopics.has(key)) current.studentIds.add(studentId);
        current.identityStatuses.add(identityStatus);
        seenTopics.add(key);
        const evidenceCount = Number(topic.sampleSize ?? topic.attempts ?? topic.attemptCount ?? 0);
        const code = String(topic.code || "insufficient");
        const status = String(topic.status || statusLabels[code] || "证据不足");
        current.evidenceTotal += Number.isFinite(evidenceCount) ? Math.max(0, evidenceCount) : 0;
        current.statusCounts[status] = (current.statusCounts[status] || 0) + 1;
        map.set(key, current);
      });
    });
    const statusOrder = ["需巩固", "证据不足", "基本掌握", "可迁移"];
    return [...map.values()].map((item) => {
      const statusSummary = statusOrder
        .filter((status) => item.statusCounts[status])
        .map((status) => `${status} ${item.statusCounts[status]}`)
        .join(" · ") || "证据不足";
      return {
        topic: item.topic,
        students: item.studentIds.size,
        evidenceTotal: item.evidenceTotal,
        statusSummary,
        identityStatus: item.identityStatuses.has("unresolved-legacy") ? "unresolved-legacy" : "resolved"
      };
    }).sort((a, b) => a.statusSummary.localeCompare(b.statusSummary, "zh-CN") || b.evidenceTotal - a.evidenceTotal);
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
