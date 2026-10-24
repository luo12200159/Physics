(() => {
  "use strict";

  const STORAGE_KEY = "physics-experience-v2";
  const MAX_EVENTS = 600;
  const CLASSROOM_INVITE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
  const APP_EDITION = ["student", "teacher"].includes(globalThis.PHYSICS_STUDIO_APP_EDITION)
    ? globalThis.PHYSICS_STUDIO_APP_EDITION
    : "legacy";
  const FIXED_ROLE = APP_EDITION === "student" || APP_EDITION === "teacher" ? APP_EDITION : "";
  const engine = window.PHYSICS_LEARNING_ENGINE;
  const STUDENT_MODULES = Object.freeze([
    { view: "library", icon: "▤", label: "练习筛选", detail: "按年级、章节、知识点和难度进入练习" },
    { view: "wrong", icon: "!", label: "错题集", detail: "订正、错误归因、自我解释和同类迁移" },
    { view: "curriculum", icon: "目", label: "教材知识点", detail: "八年级至高三完整册、章、节和核心要点" },
    { view: "lab", icon: "⌬", label: "物理工具", detail: "诊断、导师、仿真、迁移、复习和实验工具" }
  ]);
  const KNOWLEDGE_GUIDES = Object.freeze([
    [/长度和时间|测量平均速度|基本仪器|图像与误差/, ["国际单位制与常用单位换算", "刻度尺、停表等仪器的量程、分度值和读数", "多次测量、平均值与误差分析", "实验数据记录、图像处理和有效数字"]],
    [/运动的描述|质点和参考系|时间和位移/, ["参考系决定运动描述，运动和静止具有相对性", "质点是忽略形状和大小后的理想化模型", "时刻与时间间隔、位置与位移的区别", "路程是标量，位移是从初位置指向末位置的矢量"]],
    [/速度|运动的快慢|匀变速|自由落体|运动图像/, ["速度描述位置变化快慢和方向，平均速度对应全过程", "加速度描述速度变化快慢，方向由速度变化量决定", "匀变速直线运动公式的适用条件与正方向约定", "x−t、v−t 图像的斜率、截距和面积物理意义"]],
    [/声音|声的|噪声|电话|广播、电视|信息的传递/, ["声音由物体振动产生，传播需要介质", "音调、响度和音色对应不同声学特征", "声速与介质、温度有关，回声时间包含往返过程", "噪声控制可从声源、传播途径和接收端实施"]],
    [/温度|熔化|凝固|汽化|液化|升华|凝华|物态变化/, ["温度表示物体冷热程度，温标与测温方法必须对应", "晶体与非晶体相变曲线及熔点、凝固点", "蒸发与沸腾的条件、影响因素和吸放热特点", "六种物态变化及对应吸热、放热关系"]],
    [/光的直线传播|光的反射|平面镜|光的折射|光的色散|几何光学/, ["光在同种均匀介质中沿直线传播", "反射角等于入射角，角度相对于法线定义", "平面镜成等大正立虚像，像与物关于镜面对称", "折射方向取决于介质和入射角，光路具有可逆性"]],
    [/透镜|眼睛和眼镜|显微镜|望远镜|光的折射|全反射/, ["凸、凹透镜对光线的会聚和发散作用", "物距与焦距关系决定像的正倒、大小和虚实", "近视、远视的成因与矫正透镜", "全反射临界条件、光导纤维和典型光学仪器"]],
    [/质量|密度|物质的密度/, ["质量是物体所含物质多少的量度，不随位置改变", "密度 ρ=m/V，质量、体积必须对应同一物质", "天平、量筒测量及规则和不规则物体密度", "密度与温度、状态和材料鉴别的关系"]],
    [/弹力|重力|摩擦力|受力|共点力|二力平衡|牛顿第一|牛顿第二|牛顿第三|运动和力|超重|失重/, ["先选研究对象，再按接触力和非接触力完整受力分析", "重力 G=mg、弹力形变条件和摩擦力方向判断", "平衡条件与牛顿运动定律的适用对象、参考系和矢量方向", "作用力与反作用力和平衡力的对象区别", "超重、失重由支持力与重力关系判断，不表示重力改变"]],
    [/力的合成|力的分解|坐标系/, ["力是矢量，合成与分解遵守平行四边形定则", "正交分解应先建立便于列式的坐标轴", "合力与分力是等效替代关系，不能重复计入", "三力平衡、正弦定理和图解法的适用情形"]],
    [/压强|大气压|流体压强/, ["压强 p=F/S，压力必须垂直作用于受力面", "液体内部压强与深度、密度和重力加速度有关", "连通器、帕斯卡原理和大气压测量", "流速增大处压强减小的适用情境"]],
    [/浮力|阿基米德|浮沉/, ["浮力方向竖直向上，来源于流体压力差", "阿基米德原理 F浮=ρ液gV排", "漂浮、悬浮、上浮和下沉的受力条件", "称重法、排液法和密度法解决浮力问题"]],
    [/杠杆|滑轮|简单机械|机械效率/, ["杠杆平衡条件 F₁l₁=F₂l₂，力臂是支点到力作用线的距离", "定滑轮、动滑轮和滑轮组的受力与位移关系", "有用功、额外功、总功及 η=W有/W总", "机械省力不能省功，效率必须在 0% 与 100% 之间"]],
    [/功率|功和功率|功$|电功/, ["功描述力在位移方向上的作用效果", "恒力功 W=Fs cosθ，注意力与位移夹角", "功率 P=W/t，匀速牵引时可用 P=Fv", "正功、负功和不做功的过程判断"]],
    [/动能|势能|机械能|功和能|能量守恒/, ["动能 Ek=mv²/2，重力势能 Ep=mgh 依赖零势能面", "动能定理联系合力功和动能变化", "机械能守恒要求只有重力或弹力做功", "有阻力时用能量转化与功能关系处理"]],
    [/分子热运动|内能|比热容|分子动理论|分子运动速率|分子动能|分子势能/, ["物质由分子构成，分子永不停息地做无规则运动", "分子间同时存在引力和斥力", "内能包括分子动能和分子势能，做功与热传递可改变内能", "吸放热 Q=cmΔT 的适用条件与比热容物理意义"]],
    [/热机|热机的效率|热力学|功、热和内能|气体/, ["热机循环把内能转化为机械能，效率受能量损失限制", "热力学第一定律 ΔU=Q+W 的符号约定", "热力学第二定律揭示宏观过程方向性", "理想气体状态参量 p、V、T 与过程条件"]],
    [/两种电荷|电荷$|库仑|静电/, ["电荷守恒、元电荷和带电方式", "同种电荷相斥、异种电荷相吸", "库仑定律适用于真空中静止点电荷", "静电屏蔽、尖端放电及静电利用与防护"]],
    [/电流和电路|串联和并联|电流的测量|电压|电阻|变阻器|多用电表/, ["电流形成条件、方向约定和电路通断状态", "电流表串联、电压表并联及量程选择", "串并联电路的电流、电压和等效电阻规律", "滑动变阻器接线、保护和调节作用"]],
    [/欧姆定律|电流与电压|电阻的测量|导体的电阻|电阻率|恒定电流|闭合电路/, ["欧姆定律 I=U/R 的对象和状态必须一致", "伏安法测电阻的电表接法、数据处理与误差来源", "电阻定律 R=ρL/S 及材料、长度、横截面积和温度影响", "闭合电路欧姆定律、路端电压和电源内阻"]],
    [/电功率|小灯泡|焦耳|电路中的能量/, ["电功 W=UIt 与电功率 P=UI", "额定电压、额定功率和实际功率的区别", "焦耳定律 Q=I²Rt 及纯电阻电路的等价表达", "小灯泡伏安特性是非线性的，电阻随温度变化"]],
    [/家庭电路|安全用电|电流过大/, ["家庭电路中火线、零线、地线和保护装置的作用", "开关接火线，用电器金属外壳可靠接地", "短路和总功率过大都会造成干路电流过大", "不接触低压带电体、不靠近高压带电体"]],
    [/磁现象|磁场和磁感应|电生磁|电磁铁|电动机|磁生电/, ["磁场用磁感线描述方向和强弱，磁感线不是真实轨迹", "电流磁效应及安培定则", "通电导体在磁场中受力是电动机原理", "闭合电路部分导体切割磁感线产生感应电流"]],
    [/电场和电场强度|静电场$|电势|电势差|电容器|带电粒子在电场/, ["电场强度 E=F/q 是场的性质，方向按正电荷受力规定", "电势能变化与电场力做功关系", "电势差、电场强度和匀强电场位移的关系", "电容 C=Q/U 及平行板电容器影响因素", "带电粒子在电场中的加速和偏转模型"]],
    [/安培力|洛伦兹力|带电粒子在匀强磁场|质谱仪|回旋加速器|磁场$/, ["安培力方向由左手定则判断，大小与电流、磁场和有效长度有关", "洛伦兹力垂直速度，不做功但改变速度方向", "垂直进入匀强磁场时半径 r=mv/qB、周期 T=2πm/qB", "质谱仪和回旋加速器把电场加速与磁场偏转结合"]],
    [/磁通量|电磁感应现象|楞次|法拉第|涡流|互感|自感|电磁感应$/, ["磁通量 Φ=BS cosθ，先明确有效面积和夹角", "产生感应电流需闭合回路且磁通量发生变化", "楞次定律判断感应电流方向，体现能量守恒", "法拉第定律 E=n|ΔΦ/Δt|", "自感、互感、涡流和电磁阻尼的能量转化"]],
    [/交变电流|变压器|电能的输送/, ["正弦交变电流的峰值、有效值、周期和频率", "理想变压器电压比等于匝数比并满足功率近似守恒", "远距离输电通过提高电压减小线路电流与热损耗", "含电感、电容的交流现象需区分瞬时值与有效值"]],
    [/曲线运动|平抛|斜抛|运动的合成和分解/, ["速度方向沿轨迹切线，合外力指向轨迹凹侧", "运动合成与分解遵守矢量运算和等时性", "平抛运动分解为水平匀速和竖直自由落体", "斜抛运动的水平、竖直分量及对称性"]],
    [/圆周运动|线速度|角速度|向心/, ["线速度、角速度、周期、频率之间的关系", "向心加速度 an=v²/r=ω²r，方向始终指向圆心", "向心力是指向圆心的合力，不是额外性质力", "竖直圆周、转弯、圆锥摆等临界条件"]],
    [/行星|万有引力|宇宙航行|卫星/, ["开普勒定律与行星运动规律", "万有引力 F=GMm/r² 的质点和球对称条件", "万有引力提供圆周运动向心力", "第一宇宙速度、同步卫星、变轨和能量关系"]],
    [/相对论/, ["同时性的相对性", "时间延缓和长度收缩的条件", "经典力学的低速近似范围", "质能关系反映质量与能量联系"]],
    [/动量|动量定理|动量守恒|碰撞|反冲|火箭/, ["动量 p=mv 是矢量，冲量 I=FΔt", "动量定理联系合外力冲量与动量变化", "动量守恒要求系统合外力冲量为零或可忽略", "弹性、非弹性和完全非弹性碰撞的能量关系", "反冲和火箭推进体现系统动量守恒"]],
    [/简谐|单摆|受迫振动|共振|机械振动/, ["简谐运动回复力与位移成正比且方向相反", "振幅、周期、频率、相位和能量转化", "单摆周期公式的摆角和理想化条件", "受迫振动稳定频率由驱动力决定，共振时振幅显著增大"]],
    [/机械波|波的形成|波的描述|波的反射|波的干涉|多普勒/, ["机械波传播振动形式和能量，介质质点不随波迁移", "波速 v=λf，频率由波源决定", "波的反射、折射、叠加、干涉和衍射条件", "多普勒效应由波源与观察者相对运动引起"]],
    [/光的干涉|双缝|光的衍射|光的偏振|波动光学/, ["干涉需要相干光源，条纹间距与波长、屏距和缝距有关", "双缝实验用条纹测量光波长", "衍射显著条件与孔缝尺度有关", "偏振说明光是横波，激光具有方向性和相干性"]],
    [/电磁振荡|电磁场与电磁波|无线电波|电磁波谱|电磁波$/, ["LC 回路中电场能和磁场能周期转化", "变化电场和变化磁场相互激发形成电磁波", "电磁波可在真空传播且满足 c=λf", "调制、发射、接收与电磁波谱的频段和应用"]],
    [/传感器/, ["传感器把非电学量转换为便于测量的电学量", "热敏、光敏、压敏和磁敏元件的响应特性", "传感器电路的标定、采样和数据处理", "实验结果需说明量程、分辨率、误差和安全边界"]],
    [/气体的等温|等压|等容|气体实验定律/, ["一定质量理想气体的状态参量 p、V、T", "玻意耳定律、盖—吕萨克定律和查理定律的过程条件", "热力学温度必须使用开尔文", "p−V、V−T、p−T 图像和气体实验误差"]],
    [/固体$|液体$/, ["晶体与非晶体的微观结构和宏观性质", "液体表面张力和浸润现象", "饱和汽、未饱和汽和相对湿度", "材料性质由微观结构和相互作用共同决定"]],
    [/黑体|能量子|光电效应|波粒二象|粒子的波动性/, ["能量量子化 E=hν", "光电效应方程及截止频率、遏止电压", "光具有波粒二象性，光子动量 p=h/λ", "实物粒子德布罗意波长 λ=h/p"]],
    [/原子的核式|氢原子|玻尔|原子结构/, ["α 粒子散射说明原子质量和正电荷集中在很小的原子核", "玻尔模型中能级量子化和跃迁条件", "氢原子光谱与能级差 ΔE=hν", "原子模型建立依赖实验事实并有适用边界"]],
    [/原子核|放射性|核力|结合能|核裂变|核聚变|基本粒子/, ["原子核由质子和中子组成，核素用质量数和电荷数表示", "α、β、γ 衰变及半衰期的统计规律", "质量亏损与结合能 ΔE=Δmc²", "裂变、聚变的反应条件、能量释放和守恒量", "粒子物理模型随实验继续发展"]],
    [/油膜法/, ["单分子油膜模型与分子近似球形假设", "油酸体积由浓度和滴数确定", "膜面积由方格估算，分子直径 d=V/S", "实验误差来自滴定、面积边界和油膜完整性"]]
  ]);
  const ui = {
    view: "home",
    search: "",
    practiceGrade: "全部",
    libraryGrade: "",
    libraryDifficulty: "全部",
    libraryTopic: "全部",
    libraryQuestionType: "全部",
    libraryPage: 1,
    analysisEvidencePage: 1,
    progressState: "全部",
    curriculumBookId: "",
    curriculumChapterId: "",
    curriculumTarget: null,
    methodGrade: "",
    methodPlayer: null,
    diagnosticPackage: null,
    classroom: {
      busy: false,
      message: "",
      error: false,
      learningSyncOverride: null,
      classes: [],
      selectedClassId: "",
      roster: [],
      groups: [],
      lastInvite: null,
      assignments: [],
      assignmentSubmissions: {},
      classSubmissions: [],
      activeAssignmentId: "",
      selectedQuestionIds: [],
      picker: { search: "", grade: "全部", type: "全部", difficulty: "全部" },
      learningSummary: [],
      reviewCases: []
    },
    capture: null,
    openedAt: Date.now(),
    firstQuestionStarted: false
  };

  let experience = loadExperience();
  let app = null;
  let shell = null;
  let studentDataWarmupToken = "";
  let onboarding = null;
  let captureDialog = null;
  let metricsDialog = null;
  let methodDialog = null;
  let classroomDialog = null;
  let assignmentDraftTimer = null;
  let classroomSyncTimer = 0;
  let studentDataCache = null;
  const questionSearchTextCache = new WeakMap();
  const questionCurriculumFieldsCache = new WeakMap();
  let studentViewRenderTimer = 0;
  let classroomQrStream = null;
  let classroomQrTimer = 0;

  document.addEventListener("DOMContentLoaded", () => {
    const activation = window.PhysicsStudioActivation;
    if (!activation?.whenActivated) return;
    activation.whenActivated.then(initialize).catch(() => {});
  });

  function defaultExperience() {
    return {
      version: 2,
      onboarded: false,
      role: FIXED_ROLE || "student",
      displayName: "同学",
      grade: "高一",
      textbook: "人教版",
      goal: "日常巩固",
      examDate: "",
      weeklyGoal: 12,
      studentExternalLinks: true,
      fontScale: 1,
      events: [],
      activeDates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function loadExperience() {
    const fallback = defaultExperience();
    try {
    const storage = window.PhysicsStudioStorageRepository;
    if (!storage) return fallback;
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      if (!value || typeof value !== "object") return fallback;
      const normalized = {
        ...fallback,
        ...value,
        events: Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS) : [],
        activeDates: Array.isArray(value.activeDates) ? value.activeDates.slice(-60) : []
      };
      if (normalized.role === "parent") normalized.role = "student";
      if (FIXED_ROLE) normalized.role = FIXED_ROLE;
      if (normalized.grade === "七年级") normalized.grade = "八年级";
      return normalized;
    } catch (error) {
      console.warn("使用设置读取失败，已使用安全默认值。", error);
      return fallback;
    }
  }

  function saveExperience() {
    experience.updatedAt = new Date().toISOString();
    const storage = window.PhysicsStudioStorageRepository;
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(experience));
  }

  function initialize() {
    app = window.PhysicsStudioApp || null;
    createShell();
    createOnboarding();
    createCaptureDialog();
    createMetricsDialog();
    createMethodDialog();
    createClassroomDialog();
    bindGlobalEvents();
    applyFontScale();
    applyRole();
    if (experience.role === "teacher" && window.PhysicsStudioTeacherLock && !window.PhysicsStudioTeacherLock.isUnlocked()) {
      // Keep the role choice visible, but never expose local teacher controls
      // until the session has been explicitly unlocked.
      ensureTeacherUnlocked().then((ok) => {
        if (!ok) {
          experience.role = FIXED_ROLE || "student";
          saveExperience();
        }
        applyRole();
      });
    }
    if (!experience.onboarded) showOnboarding(false);
  }

  function createShell() {
    shell = document.createElement("div");
    shell.id = "experienceShell";
    shell.className = "experience-shell";
    shell.setAttribute("aria-live", "polite");
    document.body.appendChild(shell);
  }

  function createOnboarding() {
    onboarding = document.createElement("dialog");
    onboarding.id = "experienceOnboarding";
    onboarding.className = "experience-onboarding";
    onboarding.innerHTML = `
      <form id="experienceOnboardingForm">
        <header>
          <span class="experience-mark" aria-hidden="true">φ</span>
          <div><strong>费曼物理</strong><h1>${FIXED_ROLE ? `${FIXED_ROLE === "teacher" ? "教师端" : "学生端"}首次设置` : "先选择你的使用方式"}</h1><p>只需最少信息，之后可在设置中修改。</p></div>
        </header>
        <fieldset class="role-choice">
          <legend>使用身份</legend>
          ${[
            ["student", "学生", "作答、错题、复习、实验和学习报告"],
            ["teacher", "教师", "内容导入、审核、组卷和班级证据"],
            ["parent", "家长", "只看学习摘要和可支持的知识模块"]
          ].filter(([value]) => value !== "parent" && (!FIXED_ROLE || value === FIXED_ROLE)).map(([value, label, detail]) => `
            <label>
              <input type="radio" name="experienceRole" value="${value}">
              <span><strong>${label}</strong><small>${detail}</small></span>
            </label>`).join("")}
        </fieldset>
        <div class="onboarding-fields">
          <label><span>称呼</span><input id="experienceName" maxlength="12" autocomplete="off" placeholder="例如：小林"></label>
          <label><span>当前年级</span>
            <select id="experienceGrade">
              ${["八年级", "九年级", "高一", "高二", "高三"].map((grade) => `<option>${grade}</option>`).join("")}
            </select>
          </label>
          <label><span>教材版本</span>
            <select id="experienceTextbook">
              <option>人教版</option><option>教科版</option><option>沪科版</option><option>其他/暂不确定</option>
            </select>
          </label>
          <label><span>近期目标</span>
            <select id="experienceGoal">
              <option>日常巩固</option><option>中考</option><option>高考</option><option>查漏补缺</option>
            </select>
          </label>
          <label id="experienceExamDateField"><span>考试日期（可选）</span><input id="experienceExamDate" type="date"></label>
        </div>
        <footer>
          <p>学习数据默认只保存在本机。当前安装包不虚构云同步或学校账号能力。</p>
          <button class="experience-primary" type="submit">进入应用</button>
        </footer>
      </form>`;
    document.body.appendChild(onboarding);
  }

  function createCaptureDialog() {
    captureDialog = document.createElement("dialog");
    captureDialog.id = "studentCaptureDialog";
    captureDialog.className = "student-capture-dialog";
    captureDialog.innerHTML = `
      <form id="studentCaptureForm" tabindex="0" aria-label="拍题与题目确认表单">
        <header class="capture-head">
          <div><span>错题收集</span><h2>拍入一道题，立即订正</h2></div>
          <button data-capture-action="close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="capture-layout">
          <section class="capture-image-stage">
            <div class="capture-drop" id="studentCaptureDrop" tabindex="0">
              <canvas id="studentCaptureCanvas" aria-label="试题图片预览"></canvas>
              <div id="studentCaptureEmpty">
                <span aria-hidden="true">▣</span>
                <strong>拍照、选择图片或粘贴截图</strong>
                <small>支持 JPG、PNG、WebP；建议只拍一道题</small>
              </div>
            </div>
            <input class="visually-hidden" id="studentCaptureInput" type="file" accept="image/*,.jpg,.jpeg,.png,.webp" capture="environment">
            <div class="capture-image-actions">
              <label class="experience-secondary" for="studentCaptureInput">拍照 / 选图</label>
              <button data-capture-action="auto-crop" type="button">估算裁边</button>
              <button data-capture-action="rotate" type="button">旋转 90°</button>
              <button data-capture-action="reset-image" type="button">重置</button>
            </div>
            <label class="capture-contrast"><span>图像增强</span><input id="studentCaptureContrast" type="range" min="80" max="180" value="115"><output id="studentCaptureContrastValue">115%</output></label>
            <p id="studentCaptureImageStatus">图片处理仅用于提升可读性；自动裁边是图像估算，保存前必须检查。</p>
          </section>
          <section class="capture-confirmation">
            <div class="capture-recognition">
              <div><strong>题目文字</strong><span id="studentRecognitionBadge">等待图片</span></div>
              <button data-capture-action="recognize" type="button">尝试设备文字识别</button>
            </div>
            <p class="capture-boundary" id="studentRecognitionStatus">拍题录入不依赖 OCR：本应用未内置离线识别模型；仅在设备提供文字识别能力时生成待核对草稿。公式、图示和不确定字符请手工确认。</p>
            <label><span>确认后的题干 <i>*</i></span><textarea id="studentCaptureText" rows="8" placeholder="请粘贴、输入或核对题干；不确定字符用“□”标记。"></textarea></label>
            <div class="capture-mini-grid">
              <label><span>年级</span><select id="studentCaptureGrade">${["八年级", "九年级", "高一", "高二", "高三"].map((grade) => `<option>${grade}</option>`).join("")}</select></label>
              <label><span>知识点（系统建议，可修改）</span><input id="studentCaptureTopic" maxlength="40" value="待核对"></label>
            </div>
            <fieldset class="capture-reason">
              <legend>为什么收录？</legend>
              ${["我做错了", "我不会", "收藏典型题"].map((label, index) => `<label><input type="radio" name="captureReason" value="${label}"${index === 0 ? " checked" : ""}><span>${label}</span></label>`).join("")}
            </fieldset>
            <label><span>我原来的错误答案（可选）</span><textarea id="studentOriginalAnswer" rows="3" placeholder="记录当时的答案或思路，便于定位错误原因。"></textarea></label>
            <label class="capture-confirm-check"><input id="studentCaptureConfirmed" type="checkbox"><span>我已逐字检查题干，已用“□”标出仍不确定的字符。</span></label>
          </section>
        </div>
        <footer>
          <span>知识点、难度和教材章节只是系统建议，之后可由教师复核。</span>
          <button class="experience-primary" type="submit">保存并开始订正</button>
        </footer>
      </form>`;
    document.body.appendChild(captureDialog);
  }

  function createMetricsDialog() {
    metricsDialog = document.createElement("dialog");
    metricsDialog.id = "experienceMetricsDialog";
    metricsDialog.className = "experience-metrics-dialog";
    metricsDialog.innerHTML = '<article id="experienceMetricsContent"></article>';
    document.body.appendChild(metricsDialog);
  }

  function createMethodDialog() {
    methodDialog = document.createElement("dialog");
    methodDialog.id = "studentMethodDialog";
    methodDialog.className = "student-method-dialog";
    methodDialog.innerHTML = '<article id="studentMethodContent"></article>';
    document.body.appendChild(methodDialog);
  }

  function createClassroomDialog() {
    classroomDialog = document.createElement("dialog");
    classroomDialog.id = "classroomDialog";
    classroomDialog.className = "classroom-dialog";
    classroomDialog.innerHTML = '<article id="classroomContent"></article>';
    document.body.appendChild(classroomDialog);
  }

  function bindGlobalEvents() {
    document.addEventListener("physics-studio-ready", () => {
      app = window.PhysicsStudioApp;
      studentDataCache = null;
      renderRoleExperience();
    });
    document.addEventListener("physics-studio-questions-changed", () => {
      studentDataCache = null;
      renderRoleExperience();
    });
    document.addEventListener("physics-learning-state-changed", () => {
      studentDataCache = null;
      renderRoleExperience();
    });
    document.addEventListener("physics-learning-event", (event) => {
      recordEvent(event.detail?.type || "learning-event", event.detail || {});
      studentDataCache = null;
      renderRoleExperience();
    });
    document.addEventListener("physics-studio-assignment-confirmed", (event) => {
      void publishConfirmedAssignment(event.detail?.assignment);
    });
    document.addEventListener("physics-studio-tiered-assignment-confirmed", (event) => {
      void publishConfirmedAssignment(event.detail?.assignment);
    });
    onboarding.querySelector("form").addEventListener("submit", saveOnboarding);
    onboarding.querySelectorAll('input[name="experienceRole"]').forEach((input) => {
      input.addEventListener("change", updateOnboardingVisibility);
    });
    shell.addEventListener("click", handleShellClick);
    shell.addEventListener("input", handleShellInput);
    shell.addEventListener("change", handleShellChange);
    shell.addEventListener("submit", (event) => event.preventDefault());
    captureDialog.addEventListener("click", handleCaptureClick);
    captureDialog.querySelector("form").addEventListener("submit", saveCapturedQuestion);
    captureDialog.querySelector("#studentCaptureInput").addEventListener("change", (event) => {
      loadCaptureFile(event.target.files?.[0]);
      event.target.value = "";
    });
    captureDialog.querySelector("#studentCaptureContrast").addEventListener("input", (event) => {
      if (!ui.capture) return;
      ui.capture.contrast = Number(event.target.value);
      captureDialog.querySelector("#studentCaptureContrastValue").textContent = `${ui.capture.contrast}%`;
      renderCaptureCanvas();
      invalidateCaptureConfirmation("图像增强参数已变化，请重新识别并确认题干。", "需重新识别");
    });
    captureDialog.querySelector("#studentCaptureText").addEventListener("input", (event) => {
      const topic = inferTopic(event.target.value);
      const topicInput = captureDialog.querySelector("#studentCaptureTopic");
      if (!topicInput.dataset.userEdited) topicInput.value = topic;
      invalidateCaptureConfirmation("题干文字已变化，请重新逐字检查并确认。", "文字已修改");
    });
    captureDialog.querySelector("#studentCaptureConfirmed").addEventListener("change", (event) => {
      if (!ui.capture) return;
      ui.capture.confirmedText = event.target.checked
        ? captureDialog.querySelector("#studentCaptureText").value.trim()
        : "";
      if (event.target.checked) {
        ui.capture.recognitionStatus = ui.capture.recognitionEngine === "manual"
          ? "学生已人工输入并逐字确认题目文字"
          : `${ui.capture.recognitionEngine} 识别草稿；学生已逐字人工确认`;
      }
    });
    captureDialog.querySelector("#studentCaptureTopic").addEventListener("input", (event) => {
      event.target.dataset.userEdited = "true";
    });
    const drop = captureDialog.querySelector("#studentCaptureDrop");
    drop.addEventListener("click", () => captureDialog.querySelector("#studentCaptureInput").click());
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        captureDialog.querySelector("#studentCaptureInput").click();
      }
    });
    drop.addEventListener("dragover", (event) => event.preventDefault());
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      loadCaptureFile(event.dataTransfer?.files?.[0]);
    });
    captureDialog.addEventListener("paste", handleCapturePaste);
    metricsDialog.addEventListener("click", handleMetricsClick);
    methodDialog.addEventListener("click", handleMethodDialogClick);
    methodDialog.addEventListener("close", stopMethodPlayback);
    classroomDialog.addEventListener("click", handleClassroomClick);
    classroomDialog.addEventListener("submit", handleClassroomSubmit);
    classroomDialog.addEventListener("change", handleClassroomChange);
    classroomDialog.addEventListener("input", handleClassroomInput);
    classroomDialog.addEventListener("close", () => {
      clearTimeout(assignmentDraftTimer);
      saveAssignmentDraftFromForm(classroomDialog.querySelector("[data-classroom-assignment-answer-form]"));
    });
    window.addEventListener("online", syncClassroomSilently);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncClassroomSilently();
    });
    if (!classroomSyncTimer) classroomSyncTimer = window.setInterval(syncClassroomSilently, 60000);
  }

  function showOnboarding(editing) {
    onboarding.dataset.editing = editing ? "true" : "false";
    const roleInput = onboarding.querySelector(`input[name="experienceRole"][value="${FIXED_ROLE || experience.role}"]`);
    if (roleInput) roleInput.checked = true;
    onboarding.querySelector("#experienceName").value = experience.displayName;
    onboarding.querySelector("#experienceGrade").value = experience.grade;
    onboarding.querySelector("#experienceTextbook").value = experience.textbook;
    onboarding.querySelector("#experienceGoal").value = experience.goal;
    onboarding.querySelector("#experienceExamDate").value = experience.examDate || "";
    updateOnboardingVisibility();
    if (!onboarding.open) onboarding.showModal();
  }

  function updateOnboardingVisibility() {
    const role = FIXED_ROLE || onboarding.querySelector('input[name="experienceRole"]:checked')?.value || "student";
    const studentFields = onboarding.querySelector(".onboarding-fields");
    studentFields.classList.toggle("role-summary", role !== "student");
    onboarding.querySelector("#experienceExamDateField").classList.toggle("hidden", role !== "student");
  }

  async function ensureTeacherUnlocked() {
    const lock = window.PhysicsStudioTeacherLock;
    if (!lock || lock.isUnlocked()) return true;
    if (!lock.hasPin()) {
      const first = window.prompt("首次进入教师管理，请设置6至12位数字PIN（不会明文保存）");
      if (first == null) return false;
      const confirm = window.prompt("请再次输入教师PIN");
      if (first !== confirm) {
        window.alert("两次PIN不一致，未进入教师管理。");
        return false;
      }
      try {
        await lock.setup(first);
        return true;
      } catch (error) {
        window.alert(error.message || "PIN设置失败。");
        return false;
      }
    }
    const pin = window.prompt("请输入教师PIN以解锁管理功能");
    if (pin == null) return false;
    const ok = await lock.unlock(pin);
    if (!ok) window.alert("PIN错误，教师管理功能保持锁定。");
    return ok;
  }

  async function saveOnboarding(event) {
    event.preventDefault();
    const role = FIXED_ROLE || onboarding.querySelector('input[name="experienceRole"]:checked')?.value || "student";
    if (role === "teacher" && !(await ensureTeacherUnlocked())) return;
    experience.role = ["student", "teacher"].includes(role) ? role : "student";
    experience.displayName = onboarding.querySelector("#experienceName").value.trim().slice(0, 12) || "同学";
    experience.grade = onboarding.querySelector("#experienceGrade").value;
    experience.textbook = onboarding.querySelector("#experienceTextbook").value;
    experience.goal = onboarding.querySelector("#experienceGoal").value;
    experience.examDate = onboarding.querySelector("#experienceExamDate").value || "";
    experience.onboarded = true;
    saveExperience();
    syncLearningProfile();
    recordEvent("role-selected", { role: experience.role, editing: onboarding.dataset.editing === "true" });
    onboarding.close();
    applyRole();
  }

  function syncLearningProfile() {
    if (!engine) return;
    const learning = engine.loadState();
    const profile = engine.activeProfile(learning);
    if (profile && experience.role === "student") {
      profile.name = experience.displayName || profile.name;
      profile.role = "student";
      profile.grade = experience.grade;
      profile.stage = /^高/.test(experience.grade) ? "高中" : "初中";
      profile.subject = "物理";
      profile.goal = experience.goal;
      profile.updatedAt = new Date().toISOString();
    }
    if (experience.role === "student") {
      learning.settings.preferredStage = /^高/.test(experience.grade) ? "高中" : "初中";
      learning.settings.grade = experience.grade;
      learning.settings.textbook = experience.textbook;
      learning.settings.goal = experience.goal;
      learning.settings.examDate = experience.examDate;
    }
    engine.saveState(learning);
  }

  function applyRole() {
    document.body.classList.remove("role-student", "role-teacher", "role-parent");
    if (FIXED_ROLE) experience.role = FIXED_ROLE;
    if (experience.role === "parent") experience.role = "student";
    document.body.classList.add(`role-${experience.role}`, "experience-ready");
    applyFontScale();
    studentDataCache = null;
    studentDataWarmupToken = "";
    renderRoleExperience();
    document.dispatchEvent(new CustomEvent("physics-experience-role-changed", {
      detail: { role: experience.role }
    }));
  }

  function renderRoleExperience() {
    if (!shell) return;
    app = window.PhysicsStudioApp || app;
    if (experience.role === "teacher") {
      shell.innerHTML = "";
      if (window.PhysicsStudioTeacherLock && !window.PhysicsStudioTeacherLock.isUnlocked()) {
        renderLockedTeacherBar();
      } else {
        renderTeacherBar();
      }
      return;
    }
    removeTeacherBar();
    shell.innerHTML = renderStudent();
    scheduleStudentAnalysisWarmup();
  }

  function studentDerivedOptions() {
    return {
      includeAnalysis: Boolean(studentDataCache?.data?.analysis)
        && ["home", "today", "analysis", "advice"].includes(ui.view),
      includeCoverage: Boolean(studentDataCache?.data?.knowledgePointEvidence)
        && ["profile", "analysis"].includes(ui.view)
    };
  }

  function updateStudentNavigation() {
    const primaryView = primaryStudentView(ui.view);
    shell?.querySelectorAll(".student-bottom-nav [data-student-view]").forEach((button) => {
      const active = button.dataset.studentView === primaryView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function renderStudentViewOnly(options = {}) {
    if (!shell || experience.role !== "student") return;
    const main = shell.querySelector(".student-main");
    if (!main) {
      renderRoleExperience();
      return;
    }
    const previousScrollTop = window.scrollY;
    const data = getStudentData(studentDerivedOptions());
    main.setAttribute("aria-busy", "true");
    main.dataset.currentStudentView = ui.view;
    delete main.dataset.studentView;
    main.innerHTML = renderStudentView(data);
    main.removeAttribute("aria-busy");
    updateStudentNavigation();
    scheduleStudentAnalysisWarmup();
    if (options.preserveScroll) window.scrollTo({ top: previousScrollTop, behavior: "auto" });
    if (options.focusInputId) {
      requestAnimationFrame(() => {
        const input = document.getElementById(options.focusInputId);
        input?.focus({ preventScroll: true });
        input?.setSelectionRange?.(ui.search.length, ui.search.length);
      });
    }
  }

  function scheduleStudentViewRender(options = {}) {
    if (studentViewRenderTimer) window.clearTimeout(studentViewRenderTimer);
    studentViewRenderTimer = window.setTimeout(() => {
      studentViewRenderTimer = 0;
      renderStudentViewOnly(options);
    }, 80);
  }

  function renderStudent() {
    const data = getStudentData(studentDerivedOptions());
    const primaryView = primaryStudentView(ui.view);
    return `
      <header class="student-header">
        <div><span>${greeting()}，${escapeHtml(experience.displayName)}</span><strong>${escapeHtml(experience.grade)} · 物理 · ${data.gradeQuestions.length} 道完整题</strong></div>
        <button data-shell-action="open-settings" type="button" aria-label="打开个人设置">⚙</button>
      </header>
      <main class="student-main" data-current-student-view="${escapeHtml(ui.view)}">
        ${renderStudentView(data)}
      </main>
      <nav class="student-bottom-nav" aria-label="学生主导航">
        ${[
          ["home", "⌂", "首页"],
          ["course", "目", "课程"],
          ["training", "▤", "训练"],
          ["analysis", "◎", "学情"],
          ["profile", "○", "我的"]
        ].map(([view, icon, label]) => `<button class="${primaryView === view ? "active" : ""}" data-student-view="${view}" type="button"><span>${icon}</span><strong>${label}</strong></button>`).join("")}
        <button class="student-scan-fab" data-shell-action="capture" type="button" aria-label="拍题录入"><span aria-hidden="true">▣</span><strong>拍题</strong></button>
      </nav>`;
  }

  function renderStudentView(data) {
    const renderers = {
      home: renderToday,
      today: renderToday,
      course: renderCurriculum,
      training: renderTraining,
      practice: renderTraining,
      wrong: renderWrong,
      profile: renderStudentProfile,
      library: renderLibrary,
      videos: renderVideos,
      mastered: renderMastered,
      progress: renderProgress,
      curriculum: renderCurriculum,
      analysis: renderStudentAnalysis,
      lab: renderStudentLab,
      advice: renderAdvice
    };
    return (renderers[ui.view] || renderToday)(data);
  }

  function primaryStudentView(view) {
    if (["today", "home"].includes(view)) return "home";
    if (["course", "curriculum"].includes(view)) return "course";
    if (["training", "practice", "library", "videos", "wrong", "lab", "advice"].includes(view)) return "training";
    if (["analysis", "mastered", "progress"].includes(view)) return "analysis";
    return view === "profile" ? "profile" : "home";
  }

  function isCompleteStudentQuestion(question) {
    const published = window.PhysicsStudioContentCatalog?.isPublishedQuestion
      ? window.PhysicsStudioContentCatalog.isPublishedQuestion(question)
      : Boolean(question && !question.resourceOnly && question.fullTextIncluded !== false);
    return Boolean(
      published
      && String(question.content || "").trim()
      && String(question.solution || "").trim()
      && String(question.answer || "").trim()
    );
  }

  function scheduleStudentAnalysisWarmup() {
    if (experience.role !== "student" || !["home", "today", "profile", "analysis", "advice"].includes(ui.view)) return;
    if (studentDataCache?.data?.analysis) return;
    const token = `${experience.updatedAt}|${experience.grade}|${ui.view}`;
    if (studentDataWarmupToken === token) return;
    studentDataWarmupToken = token;
    const run = () => {
      if (studentDataWarmupToken !== token) return;
      if (experience.role !== "student" || !["home", "today", "profile", "analysis", "advice"].includes(ui.view)) {
        studentDataWarmupToken = "";
        return;
      }
      getStudentData({ includeAnalysis: true, includeCoverage: true });
      studentDataWarmupToken = "";
      renderStudentViewOnly({ preserveScroll: true });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      window.setTimeout(run, 120);
    }
  }

  function hydrateStudentDataDerived(data, options = {}) {
    if (!data?.learning) return data;
    const learning = data.learning;
    if (options.includeAnalysis && !data.analysis && engine?.studentAnalysis) {
      data.analysis = engine.studentAnalysis(learning, data.gradeQuestions, learning.activeProfileId, {
        summary: data.summary
      });
      if (options.includeCoverage && !data.knowledgePointEvidence && data.analysis?.evidenceCoverage) {
        data.knowledgePointEvidence = data.analysis.evidenceCoverage;
      }
    }
    if (options.includeAnalysis && !data.formativeReport && engine?.buildStudentFormativeReport) {
      data.formativeReport = engine.buildStudentFormativeReport(learning, data.gradeQuestions, learning.activeProfileId);
    }
    if (options.includeCoverage && !data.knowledgePointEvidence && engine?.knowledgePointEvidenceSummary) {
      data.knowledgePointEvidence = engine.knowledgePointEvidenceSummary(learning, data.gradeQuestions);
    }
    if (options.includePlacement && (data.placement?.summaryOnly || !data.placement) && engine?.generatePlacementDiagnostic) {
      data.placement = engine.generatePlacementDiagnostic(learning, data.gradeQuestions, {
        profileId: learning.activeProfileId,
        count: 24,
        seed: `${learning.activeProfileId}|${experience.grade}|placement`
      });
    }
    if (options.includeBroadCoverage && data.broadCoverage?.due && !data.broadCoverage.paper && engine?.scheduleBroadCoverageCheck) {
      data.broadCoverage = engine.scheduleBroadCoverageCheck(learning, data.gradeQuestions, {
        profileId: learning.activeProfileId,
        count: 20,
        includePreview: true,
        deferPreview: true
      });
    }
    return data;
  }

  function getStudentData(options = {}) {
    const questionSource = app?.getQuestions?.() || [];
    const questionSignature = [
      questionSource.length,
      questionSource[0]?.id || "",
      questionSource.at(-1)?.id || ""
    ].join("|");
    const learning = engine?.loadState?.() || null;
    const cache = studentDataCache;
    if (cache
      && cache.questionSignature === questionSignature
      && cache.learningUpdatedAt === String(learning?.updatedAt || "")
      && cache.activeProfileId === String(learning?.activeProfileId || "")
      && cache.role === experience.role
      && cache.grade === experience.grade
      && cache.experienceUpdatedAt === String(experience.updatedAt || "")) {
      return hydrateStudentDataDerived(cache.data, options);
    }
    const questions = questionSource.filter(isCompleteStudentQuestion);
    const gradeQuestions = questions.filter((question) => question.grade === experience.grade);
    const summary = learning ? engine.summarizeLearning(learning, gradeQuestions) : emptyLearningSummary();
    const knowledgePointEvidence = learning && options.includeCoverage && engine.knowledgePointEvidenceSummary
      ? engine.knowledgePointEvidenceSummary(learning, gradeQuestions)
      : null;
    const recommendations = learning
      ? engine.recommendations(learning, gradeQuestions, 40, { profileId: learning.activeProfileId })
      : [];
    const activePlan = learning ? engine.activeLearningPlan(learning, learning.activeProfileId) : null;
    const planProgress = learning ? engine.learningPlanProgress(learning, activePlan) : null;
    const planCompleted = new Set(planProgress?.completedQuestionIds || []);
    const currentPlanQuestionIds = new Set(planProgress?.currentQuestionIds || []);
    const planItems = (activePlan?.items || []).filter((item) => currentPlanQuestionIds.has(item.questionId)).map((item) => ({
      ...item,
      question: gradeQuestions.find((question) => question.id === item.questionId) || null,
      completed: planCompleted.has(item.questionId),
      available: Boolean(planProgress?.currentSessionAvailable)
    })).filter((item) => item.question);
    const nextPlanItem = planItems.find((item) => !item.completed && item.available);
    const next = nextPlanItem
      ? { question: nextPlanItem.question, reasons: [`教师专项：${nextPlanItem.purpose}`, nextPlanItem.reason] }
      : recommendations[0]
      || (gradeQuestions[0] ? { question: gradeQuestions[0], reasons: ["尚无闭环训练记录"] } : null);
    const weekStart = startOfWeek();
    const weekAttempts = learning ? learning.attempts.filter((attempt) => {
      return attempt.profileId === learning.activeProfileId
        && new Date(attempt.createdAt).getTime() >= weekStart;
    }) : [];
    const effectiveAttempts = weekAttempts.filter((attempt) => {
      const modelFields = Object.values(attempt.model || {}).filter((value) => String(value).trim()).length;
      return String(attempt.finalAnswer || "").trim()
        && (Number(attempt.durationSeconds) >= 60 || modelFields >= 3)
        && (String(attempt.selfExplanation || "").trim() || attempt.createdAt < "2026-07-26");
    });
    const attemptedTopics = new Set(learning?.attempts
      .filter((attempt) => attempt.profileId === learning.activeProfileId)
      .map((attempt) => attempt.topic));
    const newTopics = [...new Set(gradeQuestions.map((question) => question.topic).filter(Boolean))]
      .filter((topic) => !attemptedTopics.has(topic));
    const attemptsByQuestion = new Map();
    (learning?.attempts || [])
      .filter((attempt) => attempt.profileId === learning?.activeProfileId)
      .forEach((attempt) => {
        const records = attemptsByQuestion.get(attempt.questionId) || [];
        records.push(attempt);
        attemptsByQuestion.set(attempt.questionId, records);
      });
    const correctionStates = new Map(gradeQuestions.map((question) => [
      question.id,
      engine.questionCorrectionState(
        attemptsByQuestion.get(question.id) || [],
        learning?.activeProfileId,
        question.id
      )
    ]));
    const wrongQuestions = gradeQuestions.filter((question) => {
      return correctionStates.get(question.id)?.needsCorrection;
    });
    const pendingReviewQuestions = gradeQuestions.filter((question) => {
      return correctionStates.get(question.id)?.pendingReviewCount > 0;
    });
    const dailyTest = learning ? engine.dailyTest(learning, questions, {
      count: 5,
      date: window.PHYSICS_LEARNING_ENGINE.localCalendarDateKey()
    }) : null;
    const analysis = options.includeAnalysis && learning ? engine.studentAnalysis(learning, gradeQuestions) : null;
    const placement = options.includePlacement && learning && engine?.generatePlacementDiagnostic
      ? engine.generatePlacementDiagnostic(learning, gradeQuestions, {
        profileId: learning.activeProfileId,
        count: 24,
        seed: `${learning.activeProfileId}|${experience.grade}|placement`
      })
      : learning ? {
        summaryOnly: true,
        title: `${experience.grade}学期初物理摸底诊断`,
        questionCount: "20–30",
        misconceptionQuestionCount: null,
        blueprintCoverage: null,
        capabilityCoverage: null,
        coverage: { coveredTopics: [], availableTopics: [] }
      } : null;
    const placementState = learning && engine?.placementStatus
      ? engine.placementStatus(learning, learning.activeProfileId)
      : { status: "not-started", label: "开始摸底", actionable: true };
    const broadCoverage = learning && engine?.scheduleBroadCoverageCheck
      ? engine.scheduleBroadCoverageCheck(learning, gradeQuestions, {
        profileId: learning.activeProfileId,
        count: 20,
        includePreview: options.includeBroadCoverage === true,
        deferPreview: true
      })
      : null;
    const closedLoop = summary.closedLoop
      || (learning && engine?.closedLoopStreak ? engine.closedLoopStreak(learning, learning.activeProfileId) : null);
    const evidence = gradeQuestions.map((question) => ({
      question,
      evidence: app?.getMasteryEvidence?.(question.id) || {
        code: "not-started",
        status: "未开始",
        reasons: ["尚无正式作答证据"]
      }
    }));
    const curriculumBooks = getCurriculumBooks(experience.grade);
    const allCurriculumBooks = window.PHYSICS_CURRICULUM_TAXONOMY?.books || [];
    const curriculumSectionCount = curriculumBooks.reduce((sum, book) => {
      return sum + book.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.sections.length, 0);
    }, 0);
    const data = {
      questions,
      gradeQuestions,
      learning,
      summary,
      knowledgePointEvidence,
      recommendations,
      activePlan,
      planProgress,
      planItems,
      next,
      weekAttempts,
      effectiveAttempts,
      newTopics,
      wrongQuestions,
      pendingReviewQuestions,
      correctionStates,
      dailyTest,
      analysis,
      placement,
      placementState,
      broadCoverage,
      closedLoop,
      evidence,
      videoQuestions: gradeQuestions.filter(hasQuestionVideo),
      masteredQuestions: evidence.filter((item) => ["mastered", "due"].includes(item.evidence.code)),
      curriculumBooks,
      allCurriculumBooks,
      curriculumSectionCount
    };
    studentDataCache = {
      data,
      questionSignature,
      learningUpdatedAt: String(learning?.updatedAt || ""),
      activeProfileId: String(learning?.activeProfileId || ""),
      role: experience.role,
      grade: experience.grade,
      experienceUpdatedAt: String(experience.updatedAt || "")
    };
    return hydrateStudentDataDerived(data, options);
  }

  function getCurriculumBooks(grade = experience.grade) {
    return (window.PHYSICS_CURRICULUM_TAXONOMY?.books || [])
      .filter((book) => Array.isArray(book.grades) && book.grades.includes(grade));
  }

  function hasQuestionVideo(question) {
    return question?.videoType === "file"
      || (question?.videoType === "url" && /^https?:\/\//i.test(String(question.videoUrl || "")));
  }

  function moduleMetric(module, data) {
    const counts = data.summary.mastery?.counts || {};
    const evidenced = data.knowledgePointEvidence?.evidencedKnowledgePoints || 0;
    const denominator = data.knowledgePointEvidence?.totalKnowledgePoints || 0;
    const metrics = {
      library: `${data.gradeQuestions.length} 道`,
      wrong: `${data.wrongQuestions.length} 道`,
      videos: data.videoQuestions.length ? `${data.videoQuestions.length} 个视频` : `${data.gradeQuestions.length} 个动态讲解`,
      mastered: `${data.masteredQuestions.length} 道`,
      progress: `${evidenced}/${denominator}`,
      curriculum: `${data.curriculumBooks.length} 册 · ${data.curriculumSectionCount} 节`,
      analysis: `${data.summary.completed} 次作答`,
      lab: "8 个学习工具",
      advice: `${Math.max(1, data.recommendations.length)} 项建议`
    };
    if (module.view === "progress" && counts["待复习"]) {
      return `${evidenced}/${denominator} · ${counts["待复习"]} 待复习`;
    }
    return metrics[module.view] || "";
  }

  function renderStudentModuleDirectory(data, title = "完整学习功能") {
    return `
      <section class="student-module-section">
        <header>
          <div><span>学生学习中心</span><h2>${escapeHtml(title)}</h2></div>
          <p>每个入口都是可独立浏览、筛选和继续学习的模块。</p>
        </header>
        <div class="student-module-grid">
          ${STUDENT_MODULES.map((module) => `
            <button data-student-view="${module.view}" type="button">
              <span class="module-icon" aria-hidden="true">${module.icon}</span>
              <div><strong>${module.label}</strong><small>${escapeHtml(module.detail)}</small></div>
              <b>${escapeHtml(moduleMetric(module, data))}</b>
              <i aria-hidden="true">→</i>
            </button>`).join("")}
        </div>
       </section>`;
  }

  function renderModuleHeader(kicker, title, description, backView = "training") {
    return `
      <section class="student-page-head module-page-head">
        <button class="module-back-button" data-student-view="${backView}" type="button">← 返回${backView === "profile" ? "我的" : backView === "analysis" ? "学情" : "训练"}</button>
        <span>${escapeHtml(kicker)}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </section>`;
  }

  function renderToday(data) {
    const due = data.summary.dueCount || 0;
    const wrong = data.wrongQuestions.length;
    const goal = Math.max(1, Number(experience.weeklyGoal) || 12);
    const completed = data.effectiveAttempts.length;
    const newStudentNeedsPlacement = data.placementState?.status === "not-started"
      && Number(data.summary.scoredCount || 0) === 0;
    const next = newStudentNeedsPlacement ? null : data.next?.question;
    const report = data.formativeReport;
    const weak = report?.needsWork?.[0] || data.analysis?.weakest?.[0] || null;
    const profileAttempts = (data.learning?.attempts || []).filter((attempt) => attempt.profileId === data.learning?.activeProfileId);
    const latest = profileAttempts.at(-1) || null;
    const latestQuestion = latest ? data.gradeQuestions.find((question) => question.id === latest.questionId) : null;
    const explainQuestion = latestQuestion || next;
    return `
      <section class="today-intro">
        <span>今天从一项真实学习任务开始</span>
        <h1>先做下一步，再看完整分析</h1>
      </section>
      ${renderDiagnosticPrompt(data)}
      ${next ? `
        <button class="continue-card" data-start-question="${escapeHtml(next.id)}" type="button">
          <span class="continue-label">继续学习</span>
          <h2>${escapeHtml(next.title)}</h2>
          <p>${escapeHtml(next.topic)} · ${escapeHtml(next.difficulty)} · 进度按实际作答记录</p>
          <small>${escapeHtml(data.next.reasons?.[0] || "根据当前学习记录推荐")}</small>
          <strong>开始作答 <i>→</i></strong>
        </button>` : `
        <article class="continue-card empty">
          <span class="continue-label">暂无可训练正文</span>
          <h2>${newStudentNeedsPlacement ? "先完成摸底，再安排下一题" : "请让教师先导入或添加可用试题"}</h2>
          <p>${newStudentNeedsPlacement ? "当前没有已评分学习证据，不会直接按挑战题建立能力结论。" : "只有来源链接或未核实正文的记录不会进入学生训练。"}</p>
        </article>`}
      <section class="student-v4-scroll home-quick-actions" aria-label="首页快捷操作">
        <button data-start-question="${escapeHtml(next?.id || "")}" type="button"${next ? "" : " disabled"}><span>今日任务</span><strong>${next ? escapeHtml(next.title) : "暂无可用题"}</strong><small>独立作答后再看提示</small></button>
        <button data-shell-action="open-review" type="button"><span>快速复习</span><strong>${due} 道到期</strong><small>必须真实作答才能更新间隔</small></button>
        <button data-student-view="training" type="button"><span>查漏补缺</span><strong>${wrong} 道待订正</strong><small>诊断—专项—变式—复测</small></button>
        <button data-feynman-question="${escapeHtml(explainQuestion?.id || "")}" data-feynman-topic="${escapeHtml(explainQuestion?.topic || "当前物理知识")}" type="button"${explainQuestion ? "" : " disabled"}><span>我来讲一遍</span><strong>${escapeHtml(explainQuestion?.topic || "暂无目标")}</strong><small>用自己的话解释对象、规律和条件</small></button>
      </section>
      <div class="today-counters">
        <button data-student-view="analysis" type="button"><strong>${report?.overall?.scoredCount ?? data.summary.scoredCount ?? 0}</strong><span>已评分证据</span><small>${report?.sampleStatus === "sufficient" ? "可做形成性判断" : "样本仍需补充"}</small></button>
        <button data-student-view="wrong" type="button"><strong>${wrong}</strong><span>错题</span><small>继续订正</small></button>
        <button data-student-view="wrong" type="button"><strong>${data.pendingReviewQuestions.length}</strong><span>待人工复核</span><small>不计入错题</small></button>
        <button data-student-view="course" type="button"><strong>${Math.min(1, data.newTopics.length)}</strong><span>新知识</span><small>${data.newTopics[0] ? escapeHtml(data.newTopics[0]) : "暂无新组"}</small></button>
      </div>
      <section class="home-evidence-grid">
        <article>
          <span>当前优先问题</span>
          <h2>${weak ? escapeHtml(weak.label || weak.topic) : "暂不形成稳定薄弱结论"}</h2>
          <p>${weak
            ? escapeHtml(weak.reason || `已评分 ${weak.scoredCount || weak.attempts || 0} 题；正确率 ${weak.accuracy == null ? "暂无" : `${weak.accuracy}%`}。`)
            : escapeHtml(report?.boundary || "先完成至少三条可评分作答，系统再依据真实记录给出优先级。")}</p>
          <button data-student-view="analysis" type="button">查看证据依据 →</button>
        </article>
        <article>
          <span>最近一次结果</span>
          <h2>${latestQuestion ? escapeHtml(latestQuestion.title) : "尚无正式作答"}</h2>
          <p>${latest
            ? `${latest.grading?.status === "correct" ? "作答正确" : latest.grading?.status === "review-required" ? "已提交，待人工复核" : "需要订正"} · 提示等级 ${Number(latest.hintLevel) || 0} · ${Math.max(0, Number(latest.durationSeconds) || 0)} 秒`
            : "作答结果、提示和用时会保存在本机学情档案中。"}</p>
          ${latestQuestion ? `<button data-start-question="${escapeHtml(latestQuestion.id)}" type="button">${latest?.grading?.status === "correct" ? "再做迁移" : "继续订正"} →</button>` : `<button data-student-view="training" type="button">开始训练 →</button>`}
        </article>
      </section>
      ${renderAssignedPlan(data)}
      <section class="weekly-goal-card">
        <div><span>本周目标</span><strong>已完成 ${completed}/${goal} 次有效练习</strong></div>
        <div class="weekly-track" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(goal, completed)}"><i style="width:${Math.min(100, completed / goal * 100)}%"></i></div>
        <p>有效练习需包含正式作答，并记录足够的学习过程；不是打开题目或查看答案次数。</p>
      </section>
      <details class="home-secondary-content"><summary>展开今日课后测试与更多练习</summary>${renderDailyTest(data.dailyTest)}</details>
      ${experience.examDate ? renderExamPlan() : ""}`;
  }

  function renderTraining(data) {
    const anchor = data.wrongQuestions[0] || data.next?.question || data.gradeQuestions[0];
    const report = data.formativeReport;
    const priority = report?.needsWork?.[0] || data.analysis?.weakest?.[0] || null;
    return `
      <section class="student-page-head"><span>诊断 · 练习 · 迁移 · 复测</span><h1>训练</h1><p>每次只安排少量、有依据的训练；不会用题量代替诊断。</p></section>
      <section class="training-loop-grid">
        <article><i>1</i><div><span>先确认问题</span><h2>摸底与概念诊断</h2><p>用覆盖蓝图和“答案＋理由＋信心”形成起点证据。</p></div><button data-shell-action="open-diagnostic" type="button">开始诊断</button></article>
        <article><i>2</i><div><span>只练当前重点</span><h2>3 / 5 / 7 题专项</h2><p>${priority ? `当前候选：${escapeHtml(priority.label || priority.topic)}` : "证据不足时先用 3 题补充观察，不贴能力标签。"}</p></div><div class="training-size-buttons">${[3, 5, 7].map((count) => `<button data-targeted-plan-size="${count}" type="button">${count}题</button>`).join("")}</div></article>
        <article><i>3</i><div><span>举一反三</span><h2>专项变式训练</h2><p>优先使用通过质量门禁的近迁移、远迁移和反例题。</p></div><button data-open-variant-parent="${escapeHtml(anchor?.id || "")}" type="button"${anchor ? "" : " disabled"}>打开变式</button></article>
        <article><i>4</i><div><span>错误变成行动</span><h2>错题订正</h2><p>${data.wrongQuestions.length} 道待订正；记录首要错因、解释关键规律，再做迁移。</p></div><button data-student-view="wrong" type="button">进入错题集</button></article>
        <article><i>5</i><div><span>延迟验证</span><h2>到期复习与复测</h2><p>${data.summary.dueCount || 0} 道到期；只有完成真实作答，复习日期才会更新。</p></div><button data-shell-action="open-review" type="button">开始复习</button></article>
      </section>
      ${renderAssignedPlan(data)}
      <section class="student-recommend-panel">
        <header><div><span>根据本人学习证据</span><h2>优先练习</h2></div><button data-student-view="analysis" type="button">查看依据 →</button></header>
        <div class="student-recommend-list">${data.recommendations.slice(0, 6).map((item, index) => `<article><i>${index + 1}</i><div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(item.question.topic)} · ${escapeHtml(item.reasons.join("；") || "补充当前年级证据")}</span></div><button data-start-question="${escapeHtml(item.question.id)}" type="button">开始</button></article>`).join("") || '<div class="student-empty"><strong>尚无个性化排序证据</strong><span>先完成一题独立作答。</span></div>'}</div>
      </section>
      <section class="training-resource-actions">
        <button data-student-view="library" type="button">完整题库</button>
        <button data-student-view="lab" type="button">学习实验室</button>
        <button data-shell-action="open-models" type="button">动态模型</button>
        <button data-shell-action="open-tools" type="button">公式与验证</button>
      </section>`;
  }

  function renderDiagnosticPrompt(data) {
    const placementStatus = data.placementState?.status || "not-started";
    const placementNeeded = ["not-started", "in-progress", "legacy-unknown"].includes(placementStatus);
    const broad = data.broadCoverage;
    const streak = data.closedLoop;
    const earnedBadge = streak?.badges?.filter((badge) => badge.earned).at(-1);
    if (!placementNeeded && !broad?.due && !streak?.currentStreak && !earnedBadge) return "";
    return `
      <section class="diagnostic-prompt-grid">
        ${placementNeeded && data.placement ? `
          <article class="diagnostic-prompt-card primary">
            <span>${placementStatus === "in-progress" ? "继续摸底" : placementStatus === "legacy-unknown" ? "历史档案需补做摸底" : "新学生起步"}</span>
            <h2>${escapeHtml(data.placement.title)}</h2>
            ${data.placement.summaryOnly
              ? "<p>开始后按当前年级生成摸底题包，可分段完成；题包生成后再显示实际知识点与认知维度覆盖。</p>"
              : `<p>${data.placement.questionCount} 题 · ${data.placement.misconceptionQuestionCount} 道前概念辨析 · 本次蓝图覆盖 ${data.placement.blueprintCoverage?.coveredCount ?? data.placement.coverage.coveredTopics.length}/${data.placement.blueprintCoverage?.targetCount ?? data.placement.coverage.availableTopics.length} 个目标知识点、${data.placement.capabilityCoverage?.coveredCount ?? 0}/${data.placement.capabilityCoverage?.targetCount ?? 8} 个认知维度。</p>`}
            <button data-shell-action="open-placement" type="button">${placementStatus === "in-progress" ? "继续摸底" : placementStatus === "legacy-unknown" ? "补全摸底" : "开始摸底"}</button>
          </article>` : ""}
        ${broad?.due && broad.paper ? `
          <article class="diagnostic-prompt-card">
            <span>发现未知盲区</span>
            <h2>双周广覆盖检测已到期</h2>
            <p>${broad.paper.questionCount} 题；与专项推荐并行，用于检查尚未暴露的薄弱知识点。</p>
            <button data-shell-action="open-broad-check" type="button">开始阶段检测</button>
          </article>` : ""}
        ${streak?.currentStreak || earnedBadge ? `
          <article class="diagnostic-prompt-card streak">
            <span>克制的正向反馈</span>
            <h2>${earnedBadge ? escapeHtml(earnedBadge.title) : `连续闭环 ${streak.currentStreak} 天`}</h2>
            <p>只记录本人完成“作答—归因—解释”的连续天数；不设积分、排行榜或同伴比较。</p>
          </article>` : ""}
      </section>`;
  }

  function renderAssignedPlan(data) {
    const plan = data.activePlan;
    if (!plan || !data.planItems.length) return "";
    const progress = data.planProgress || { completed: 0, total: data.planItems.length, percent: 0 };
    const currentSession = progress.currentSession;
    const sessionWaiting = currentSession && !currentSession.available;
    const dueLabel = currentSession?.dueAt
      ? new Date(currentSession.dueAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "待前一阶段完成";
    return `
      <section class="assigned-plan-card">
        <header>
          <div><span>当前学习时段 · ${escapeHtml(currentSession?.title || "专项训练")}</span><h2>${escapeHtml(plan.title)}</h2></div>
          <strong>${progress.completed}/${progress.total}</strong>
        </header>
        <p>${escapeHtml(plan.evidenceReason)}${plan.teacherNote ? ` · 教师说明：${escapeHtml(plan.teacherNote)}` : ""} · 本次约 ${Number(currentSession?.expectedMinutes || plan.expectedMinutes || 15)} 分钟</p>
        ${sessionWaiting ? `<p class="tool-help">本时段尚未开放：${escapeHtml(currentSession.status === "scheduled" ? `延迟复测安排在 ${dueLabel}` : "请先完成上一时段")}。为避免即时重复记忆影响复测，暂不提前开放题目。</p>` : ""}
        <div class="assigned-plan-track" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.completed}"><i style="width:${progress.percent}%"></i></div>
        <ol>
          ${data.planItems.map((item, index) => `
            <li class="${item.completed ? "completed" : ""}">
              <i>${item.completed ? "✓" : index + 1}</i>
              <div><strong>${escapeHtml(item.purpose)}</strong><span>${escapeHtml(item.question.title)} · ${escapeHtml(item.reason)}</span></div>
              <button data-start-question="${escapeHtml(item.question.id)}" type="button"${item.available ? "" : " disabled"}>${item.completed ? "复盘" : item.available ? "开始" : "未开放"}</button>
            </li>`).join("")}
        </ol>
        <small>${escapeHtml(plan.selectionRule)}；完整方案分 ${progress.sessions?.filter((session) => session.status !== "not-required").length || 1} 个时段，学生首页一次只显示当前时段。</small>
      </section>`;
  }

  function renderDailyTest(test) {
    if (!test?.items?.length) {
      return `<section class="daily-test-card empty"><span>每日课后测试</span><h2>当前年级暂无可用完整题</h2><p>教师导入并审核完整题目后，系统会按薄弱项和日期生成固定题组。</p></section>`;
    }
    return `
      <section class="daily-test-card">
        <header><div><span>每日课后测试</span><h2>${escapeHtml(test.title)}</h2></div><strong>${test.questionCount} 题</strong></header>
        <p>${escapeHtml(test.generationRule)}</p>
        <div>
          ${test.items.map((item, index) => `
            <button data-start-question="${escapeHtml(item.question.id)}" type="button">
              <i>${index + 1}</i>
              <span><strong>${escapeHtml(item.question.title)}</strong><small>${escapeHtml(item.question.topic)} · ${escapeHtml(item.reasons?.[0] || "每日抽取")}</small></span>
              <b>→</b>
            </button>`).join("")}
        </div>
      </section>`;
  }

  function renderExamPlan() {
    const days = Math.ceil((new Date(`${experience.examDate}T23:59:59`).getTime() - Date.now()) / 86400000);
    if (!Number.isFinite(days) || days < 0) return "";
    return `<section class="exam-plan-card"><span>${escapeHtml(experience.goal)}计划</span><strong>距目标日期 ${days} 天</strong><p>复习推荐会优先安排到期题、近期错题和高提示依赖题。</p></section>`;
  }

  function renderPractice(data) {
    return `
      <section class="student-page-head"><span>完整学习中心</span><h1>练习</h1><p>从题库、教材知识点、方法讲解、学习实验室或个性化建议开始，不局限于每日题组。</p></section>
      <form class="student-search" data-student-search>
        <label><span aria-hidden="true">⌕</span><input id="studentPracticeSearch" type="search" value="${escapeHtml(ui.search)}" placeholder="搜索题目、知识点或考点" autocomplete="off"></label>
        <button class="student-search-submit" data-student-view="library" type="button">进入题库搜索</button>
      </form>
      ${renderStudentModuleDirectory(data, "选择一种学习方式")}
      <section class="student-recommend-panel">
        <header><div><span>根据本人学习证据</span><h2>优先练习</h2></div><button data-student-view="advice" type="button">查看完整建议 →</button></header>
        <div class="student-recommend-list">
          ${data.recommendations.slice(0, 6).map((item, index) => `
            <article>
              <i>${index + 1}</i>
              <div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(item.question.topic)} · ${escapeHtml(item.reasons.join("；") || "按当前年级推荐")}</span></div>
              <button data-start-question="${escapeHtml(item.question.id)}" type="button">开始</button>
            </article>`).join("") || '<div class="student-empty"><strong>尚无个性化证据</strong><span>先从题库独立完成一道题，系统再按结果调整顺序。</span></div>'}
        </div>
      </section>
      <div class="practice-shortcuts">
        <button data-shell-action="open-diagnostic" type="button"><span>◎</span><strong>概念诊断</strong><small>答案＋理由＋信心</small></button>
        <button data-shell-action="open-models" type="button"><span>⌁</span><strong>建模仿真</strong><small>变量、图像与方程</small></button>
        <button data-shell-action="open-tools" type="button"><span>Σ</span><strong>公式工具</strong><small>量纲、单位与图像</small></button>
      </div>
      ${experience.studentExternalLinks ? `
        <div class="student-external-search">
          <span>联网检索默认开启；离开应用前仍会提示，外部结果不直接写入学情证据</span>
          <button data-shell-action="external-search" type="button">用 Edge/Bing 查解题线索 ↗</button>
        </div>` : '<p class="student-safe-search">外部网站访问已由教师或本机安全设置关闭；站内题库和学习分析仍可离线使用。</p>'}
      ${renderDailyTest(data.dailyTest)}`;
  }

  function normalizeSearchText(value) {
    return String(value || "").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
  }

  function questionSearchText(question) {
    if (question && typeof question === "object" && questionSearchTextCache.has(question)) {
      return questionSearchTextCache.get(question);
    }
    const value = normalizeSearchText([
      question.title,
      question.content,
      question.grade,
      question.topic,
      question.difficulty,
      question.curriculumBook,
      question.curriculumChapter,
      question.curriculumSection,
      ...(Array.isArray(question.examPoints) ? question.examPoints : [])
    ].filter(Boolean).join(" "));
    if (question && typeof question === "object") questionSearchTextCache.set(question, value);
    return value;
  }

  function questionCurriculumFields(question) {
    if (question && typeof question === "object" && questionCurriculumFieldsCache.has(question)) {
      return questionCurriculumFieldsCache.get(question);
    }
    const value = [
      question?.curriculumBook,
      question?.curriculumChapter,
      question?.curriculumSection,
      question?.topic
    ].map(normalizeSearchText);
    if (question && typeof question === "object") questionCurriculumFieldsCache.set(question, value);
    return value;
  }

  function questionMatchesCurriculum(question, target) {
    if (!target) return true;
    const search = questionSearchText(question);
    const exactFields = questionCurriculumFields(question);
    const section = target.sectionNormalized || normalizeSearchText(target.sectionTitle);
    const chapter = target.chapterNormalized || normalizeSearchText(target.chapterTitle);
    if (exactFields.includes(section) || (section.length >= 2 && search.includes(section))) return true;
    const matchingGuidePatterns = target.matchingGuidePatterns || KNOWLEDGE_GUIDES
      .map(([pattern]) => pattern)
      .filter((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(`${target.chapterTitle || ""} ${target.sectionTitle || ""}`);
      });
    const guideMatch = matchingGuidePatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test([
        question.topic,
        question.title,
        question.curriculumChapter,
        question.curriculumSection,
        ...(question.examPoints || [])
      ].filter(Boolean).join(" "));
    });
    if (guideMatch) return true;
    return exactFields.includes(chapter)
      || (chapter.length >= 3 && normalizeSearchText(question.curriculumChapter).includes(chapter));
  }

  function curriculumTargetById(sectionId) {
    for (const book of (window.PHYSICS_CURRICULUM_TAXONOMY?.books || [])) {
      for (const chapter of book.chapters || []) {
        const section = (chapter.sections || []).find((item) => item.id === sectionId);
        if (section) {
          return {
            sectionId,
            bookId: book.id,
            bookTitle: book.title,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            sectionTitle: section.title
          };
        }
      }
    }
    return null;
  }

  function uniqueValues(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function shortText(value, maximum = 116) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
  }

  function evidenceFor(data, questionId) {
    return data.evidence.find((item) => item.question.id === questionId)?.evidence
      || app?.getMasteryEvidence?.(questionId)
      || { code: "not-started", status: "未开始", reasons: ["尚无正式作答证据"] };
  }

  function studentQuestionCard(question, data, options = {}) {
    const evidence = evidenceFor(data, question.id);
    const actualVideo = hasQuestionVideo(question);
    const hasModel = Boolean(window.PHYSICS_VISUALS?.modelForQuestion?.(question));
    const showDetail = options.showDetail !== false;
    const showMethod = options.showMethod !== false;
    return `
      <article class="student-question-card" data-question-id="${escapeHtml(question.id)}">
        <div class="student-question-body">
          <div class="question-meta-row">
            <span>${escapeHtml(question.grade || question.stage)} · ${escapeHtml(question.difficulty)} · ${escapeHtml(question.questionType || "物理题")}</span>
            <small class="evidence-${escapeHtml(evidence.code || "not-started")}">${escapeHtml(engine?.masteryDisplayLabel?.(evidence) || evidence.status || "未开始")}</small>
          </div>
          <h2>${escapeHtml(question.title)}</h2>
          <p class="question-excerpt">${escapeHtml(shortText(question.content, options.compact ? 80 : 150))}</p>
          <div class="question-point-row">
            <strong>${escapeHtml(question.topic)}</strong>
            ${(question.examPoints || []).slice(0, 3).map((point) => `<span>${escapeHtml(point)}</span>`).join("")}
            ${actualVideo ? "<span class=\"actual-video-badge\">已关联视频</span>" : "<span>可动态分步讲解</span>"}
          </div>
        </div>
        <div class="student-question-actions">
          <button class="primary" data-start-question="${escapeHtml(question.id)}" type="button">独立作答</button>
          ${hasModel ? `<button data-open-question-model="${escapeHtml(question.id)}" type="button">关联模型</button>` : ""}
          ${showDetail ? `<button data-question-detail="${escapeHtml(question.id)}" type="button">详细解析</button>` : ""}
          ${showMethod ? `<button data-method-question="${escapeHtml(question.id)}" type="button">${actualVideo ? "视频与方法" : "方法讲解"}</button>` : ""}
        </div>
      </article>`;
  }

  function questionTypeGroup(question) {
    const type = String(question.questionType || question.examQuestionType || "");
    if (!type || type === "未标注") return "未标注";
    if (/选择|判断/.test(type)) return "选择题";
    if (/填空/.test(type)) return "填空题";
    if (/实验|探究/.test(type)) return "实验题";
    if (/计算/.test(type)) return "计算与综合";
    return "未标注";
  }

  function renderLibrary(data) {
    const grade = ui.libraryGrade || experience.grade;
    const available = grade === "全部"
      ? data.questions
      : data.questions.filter((question) => question.grade === grade);
    const difficulties = uniqueValues(available.map((question) => question.difficulty))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const topics = uniqueValues(available.map((question) => question.topic))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const questionTypes = ["选择题", "填空题", "实验题", "计算与综合", "未标注"];
    const typeCounts = Object.fromEntries(questionTypes.map((type) => [
      type,
      available.filter((question) => questionTypeGroup(question) === type).length
    ]));
    if (ui.libraryDifficulty !== "全部" && !difficulties.includes(ui.libraryDifficulty)) ui.libraryDifficulty = "全部";
    if (ui.libraryTopic !== "全部" && !topics.includes(ui.libraryTopic)) ui.libraryTopic = "全部";
    if (ui.libraryQuestionType !== "全部" && !questionTypes.includes(ui.libraryQuestionType)) ui.libraryQuestionType = "全部";
    const query = normalizeSearchText(ui.search);
    const filtered = available.filter((question) => {
      return (ui.libraryDifficulty === "全部" || question.difficulty === ui.libraryDifficulty)
        && (ui.libraryTopic === "全部" || question.topic === ui.libraryTopic)
        && (ui.libraryQuestionType === "全部" || questionTypeGroup(question) === ui.libraryQuestionType)
        && (!query || questionSearchText(question).includes(query))
        && questionMatchesCurriculum(question, ui.curriculumTarget);
    });
    const pageSize = 12;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    ui.libraryPage = Math.min(Math.max(1, ui.libraryPage), pages);
    const visible = filtered.slice((ui.libraryPage - 1) * pageSize, ui.libraryPage * pageSize);
    const targetLabel = ui.curriculumTarget
      ? `${ui.curriculumTarget.bookTitle} / ${ui.curriculumTarget.chapterTitle} / ${ui.curriculumTarget.sectionTitle}`
      : "";
    return `
      ${renderModuleHeader("QUESTION LIBRARY", "完整题库", "只显示含题干、答案和分步解析的可训练题；可按教材知识点精确进入。")}
      <section class="library-overview">
        <article><strong>${data.questions.length}</strong><span>全库完整题</span><small>八年级至高三</small></article>
        <article><strong>${available.length}</strong><span>${escapeHtml(grade)}题目</span><small>可直接作答</small></article>
        <article><strong>${topics.length}</strong><span>知识主题</span><small>按题目元数据去重</small></article>
        <article><strong>${filtered.length}</strong><span>当前结果</span><small>筛选实时生效</small></article>
      </section>
      <section class="library-filter-panel">
        <form class="student-search library-search" data-student-search>
          <label><span aria-hidden="true">⌕</span><input id="studentLibrarySearch" type="search" value="${escapeHtml(ui.search)}" placeholder="搜索题名、题干、考点、章节" autocomplete="off"></label>
          <button data-library-action="clear" type="button">清除筛选</button>
        </form>
        <div class="library-filter-grid">
          <label><span>年级</span><select id="studentLibraryGrade">${["全部", "八年级", "九年级", "高一", "高二", "高三"].map((item) => `<option${item === grade ? " selected" : ""}>${item}</option>`).join("")}</select></label>
          <label><span>难度</span><select id="studentLibraryDifficulty"><option>全部</option>${difficulties.map((item) => `<option${item === ui.libraryDifficulty ? " selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label><span>知识主题</span><select id="studentLibraryTopic"><option>全部</option>${topics.map((item) => `<option${item === ui.libraryTopic ? " selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></label>
          <label><span>题型</span><select id="studentLibraryQuestionType"><option>全部</option>${questionTypes.map((item) => `<option${item === ui.libraryQuestionType ? " selected" : ""}>${item}</option>`).join("")}</select></label>
        </div>
        <div class="library-type-summary" aria-label="题型库存">
          ${["选择题", "填空题", "实验题"].map((type) => `<span><strong>${typeCounts[type]}</strong>${type}</span>`).join("")}
        </div>
        ${targetLabel ? `<div class="curriculum-filter-chip"><span>教材定位：${escapeHtml(targetLabel)}</span><button data-library-action="clear-curriculum" type="button">移除</button></div>` : ""}
      </section>
      <section class="library-result-head">
        <div><span>搜索结果</span><h2>${filtered.length ? `找到 ${filtered.length} 道题` : "没有符合条件的题目"}</h2></div>
        <button data-student-view="curriculum" type="button">按教材目录浏览 →</button>
      </section>
      <div class="student-question-list library-question-list">
        ${visible.map((question) => studentQuestionCard(question, data)).join("")
          || '<div class="student-empty"><strong>当前筛选没有匹配题目</strong><span>可清除教材定位或减少搜索条件；系统不会用只有题源链接的记录填充结果。</span></div>'}
      </div>
      ${filtered.length ? `
        <nav class="library-pagination" aria-label="题库分页">
          <button data-page-direction="-1" type="button"${ui.libraryPage <= 1 ? " disabled" : ""}>上一页</button>
          <span>第 ${ui.libraryPage} / ${pages} 页 · 本页 ${visible.length} 道</span>
          <button data-page-direction="1" type="button"${ui.libraryPage >= pages ? " disabled" : ""}>下一页</button>
        </nav>` : ""}`;
  }

  function renderWrong(data) {
    const wrongQuestions = data.wrongQuestions;
    const pendingReviewHtml = data.pendingReviewQuestions.map((question) => {
      const state = data.correctionStates.get(question.id);
      return '<article><strong>' + escapeHtml(question.title) + '</strong><span>待复核 '
        + state.pendingReviewCount + ' 次' + (state.needsCorrection ? ' · 此前错误仍待订正' : '')
        + '</span><button data-start-question="' + escapeHtml(question.id)
        + '" type="button">查看题目</button></article>';
    }).join("");
    const errorCounts = learningErrorCounts(data.learning);
    const recentCorrections = data.evidence
      .filter((item) => item.evidence.latest)
      .sort((a, b) => new Date(b.evidence.latest.createdAt || 0) - new Date(a.evidence.latest.createdAt || 0))
      .slice(0, 5);
    return `
      <section class="student-page-head"><span>订正与复核</span><h1>错题集</h1><p>只有已评分错误才进入错题数；待人工复核单列，看过答案不等于完成订正。</p></section>
      <section class="wrong-overview">
        <div class="wrong-summary">
          <strong>${wrongQuestions.length}</strong><span>道待订正题</span>
          <p>订正闭环：重新独立作答 → 定位错误 → 用一句话解释规律 → 完成迁移题 → 安排复习。</p>
        </div>
        <div class="wrong-error-types">
          <h2>错误原因记录</h2>
          ${errorCounts.length
            ? errorCounts.slice(0, 7).map(([label, count]) => `<article><span>${escapeHtml(label)}</span><strong>${count}</strong></article>`).join("")
            : "<p>尚无结构化错误归因。完成一次订正后，请选择最先导致答案偏离的主要原因。</p>"}
        </div>
      </section>
      <section class="wrong-pending-review" aria-label="待人工复核作答">
        <h2>待人工复核 · ${data.pendingReviewQuestions.length} 道</h2>
        <p>提交尚未评分，不进入错题数或知识点正确率；此前尚未完成的订正仍保留。</p>
        ${pendingReviewHtml || "<p>目前没有待复核提交。</p>"}
      </section>
      <section class="correction-workflow" aria-label="错题订正流程">
        ${["不看答案重做", "标记错误位置", "选择错误原因", "写关键规律", "完成一道变式"].map((label, index) => `<article><i>${index + 1}</i><strong>${label}</strong></article>`).join("")}
      </section>
      <section class="wrong-cause-guide">
        <header><span>错误原因</span><h2>怎样判断错误原因</h2><p>只选择最先导致答案偏离的主要原因，避免把所有错题都归为“粗心”。</p></header>
        <div>
          ${[
            ["概念理解", "物理意义或因果关系理解偏差；用反例、实验现象和自己的话重新解释。"],
            ["研究对象/建模", "研究对象、过程划分、理想化或坐标系不合适；先重画模型。"],
            ["规律选择或适用条件", "规律或公式的适用条件不成立；补写条件再列式。"],
            ["图像与表征", "图像读数、坐标含义或文字—图像转换错误；逐轴核对物理意义。"],
            ["公式与代数", "公式选择、变形、联立或代入过程有误；保留符号式并逐步核验。"],
            ["单位/方向/符号", "单位、有效数字、方向、正负号不一致；在结论处统一复核。"],
            ["实验与数据处理", "器材、控制变量、数据拟合或结论解释不一致；按实验目的逐项检查。"],
            ["审题或计算疏漏", "漏读条件、小问或发生一般运算疏漏；重新标出已知、未知和限制。"]
          ].map(([label, detail]) => `<article><strong>${label}</strong><p>${detail}</p></article>`).join("")}
        </div>
      </section>
      <div class="student-question-list wrong-list">
        ${wrongQuestions.length ? wrongQuestions.map((question) => {
          const evidence = evidenceFor(data, question.id);
          const latest = evidence.latest;
          const hasModel = Boolean(window.PHYSICS_VISUALS?.modelForQuestion?.(question));
          return `
            <article class="student-question-card wrong">
              <div class="student-question-body">
                <div class="question-meta-row"><span>${escapeHtml(question.topic)} · ${escapeHtml(engine?.masteryDisplayLabel?.(evidence) || evidence.status || "待订正")}</span><small>${evidence.attempts || 0} 次作答</small></div>
                <h2>${escapeHtml(question.title)}</h2>
                <p>${latest?.errorType ? `上次归因：${escapeHtml(latest.errorType)}` : "尚未完成结构化错误归因"}${Number(latest?.hintLevel) >= 3 ? ` · 使用过第 ${latest.hintLevel} 级提示` : ""}</p>
                <div class="question-point-row">${(question.examPoints || [question.topic]).slice(0, 3).map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>
              </div>
              <div class="student-question-actions">
                <button class="primary" data-start-question="${escapeHtml(question.id)}" type="button">重新订正</button>
                ${hasModel ? `<button data-open-question-model="${escapeHtml(question.id)}" type="button">关联模型</button>` : ""}
                <button data-question-detail="${escapeHtml(question.id)}" type="button">核对解析</button>
                <button data-similar-topic="${escapeHtml(question.topic)}" type="button">同类迁移</button>
              </div>
            </article>`;
        }).join("") : '<div class="student-empty"><strong>当前没有已评分待订正题</strong><span>待人工复核提交不会被判错；高提示依赖只作为学习线索。你也可以用右下角“拍题录入”收录纸面错题。</span></div>'}
      </div>
      <section class="wrong-history">
        <header><div><span>近期证据</span><h2>近期订正证据</h2></div><button data-student-view="progress" type="button">查看掌握进度 →</button></header>
        ${recentCorrections.length ? recentCorrections.map((item) => `
          <article>
             <div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(engine?.masteryDisplayLabel?.(item.evidence) || item.evidence.status)} · ${escapeHtml(item.evidence.reasons.slice(0, 2).join("；"))}</span></div>
            <button data-start-question="${escapeHtml(item.question.id)}" type="button">继续</button>
          </article>`).join("") : "<p>尚无正式作答记录。完成订正后，这里会显示状态变化所依据的证据。</p>"}
      </section>`;
  }

  function buildMethodSteps(question) {
    const rawLines = String(question.solution || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const lines = rawLines.filter((line) => !/^【(?:考察点|分步解析|最终结论|结果复核)】/.test(line));
    const steps = lines.map((line) => line.replace(/^\d+[.、]\s*/, "").trim()).filter(Boolean);
    return [
      {
        title: "读题与定位",
        text: `研究题目所述过程，所求量见题干；主要考察${(question.examPoints || [question.topic]).join("、")}。`
      },
      ...steps.map((text, index) => ({ title: `推理第 ${index + 1} 步`, text })),
      { title: "结论", text: question.answer },
      {
        title: "复核",
        text: "把结论代回题意，核对所求量、公式适用条件、单位、方向和数量级。"
      }
    ];
  }

  function renderVideos(data) {
    const grade = ui.methodGrade || experience.grade;
    const questions = data.questions.filter((question) => grade === "全部" || question.grade === grade);
    const actual = questions.filter(hasQuestionVideo);
    const query = normalizeSearchText(ui.search);
    const walkthroughs = questions
      .filter((question) => !query || questionSearchText(question).includes(query))
      .slice(0, 30);
    return `
      ${renderModuleHeader("METHOD & VIDEO", "方法视频与动态讲解", "真实视频按题目附件播放；没有视频的题目提供基于已审核解析的逐步动态讲解，并明确区分两者。")}
      <section class="method-boundary">
        <article><strong>${actual.length}</strong><span>已关联真实视频</span><small>只统计本地文件或有效 HTTP(S) 地址</small></article>
        <article><strong>${questions.length}</strong><span>动态分步讲解</span><small>逐条播放题目现有解析，不生成虚构视频</small></article>
      </section>
      <section class="method-filter-panel">
        <label><span>年级</span><select id="studentMethodGrade">${["全部", "八年级", "九年级", "高一", "高二", "高三"].map((item) => `<option${item === grade ? " selected" : ""}>${item}</option>`).join("")}</select></label>
        <label class="method-search"><span>搜索</span><input id="studentMethodSearch" type="search" value="${escapeHtml(ui.search)}" placeholder="题目、知识点或考点"></label>
      </section>
      ${actual.length ? `
        <section class="actual-video-section">
          <header><div><span>关联视频</span><h2>已关联方法视频</h2></div><strong>${actual.length} 个</strong></header>
          <div class="method-card-grid">
            ${actual.slice(0, 12).map((question) => `
              <article>
                <span class="video-kind">真实视频</span><h3>${escapeHtml(question.title)}</h3><p>${escapeHtml(question.topic)} · ${escapeHtml(question.videoName || "题目方法视频")}</p>
                <div><button class="primary" data-question-detail="${escapeHtml(question.id)}" type="button">打开并播放</button><button data-method-question="${escapeHtml(question.id)}" type="button">逐步讲解</button></div>
              </article>`).join("")}
          </div>
        </section>` : `
        <section class="method-no-video">
          <strong>当前${escapeHtml(grade)}题库没有已审核的视频附件</strong>
          <p>系统不会用无关网络视频填充。教师可在题目编辑页关联已获授权的视频；下方  ${questions.length} 道题仍可使用逐步动态讲解。</p>
        </section>`}
      <section class="dynamic-method-section">
        <header><div><span>分步讲解</span><h2>逐步动态方法讲解</h2></div><strong>${walkthroughs.length} / ${questions.length}</strong></header>
        <div class="method-card-grid">
          ${walkthroughs.map((question) => `
            <article>
              <span>动态讲解 · ${buildMethodSteps(question).length} 步</span>
              <h3>${escapeHtml(question.title)}</h3>
              <p>${escapeHtml((question.examPoints || [question.topic]).join(" / "))}</p>
              <div><button class="primary" data-method-question="${escapeHtml(question.id)}" type="button">开始逐步播放</button><button data-start-question="${escapeHtml(question.id)}" type="button">先独立作答</button></div>
            </article>`).join("") || '<div class="student-empty"><strong>没有匹配的讲解</strong><span>请减少搜索条件。</span></div>'}
        </div>
        ${questions.length > walkthroughs.length ? `<button class="method-library-link" data-student-view="library" type="button">到题库检索其余 ${questions.length - walkthroughs.length} 道题 →</button>` : ""}
      </section>`;
  }

  function renderMastered(data) {
    const mastered = data.masteredQuestions;
    const near = data.evidence
      .filter((item) => ["proficient", "learning"].includes(item.evidence.code))
      .sort((a, b) => b.evidence.independentCorrect - a.evidence.independentCorrect)
      .slice(0, 12);
    const rules = engine?.masteryRules || {};
    return `
      ${renderModuleHeader("EVIDENCE-BASED MASTERY", "已掌握", "掌握状态不能手工勾选，只显示满足跨日期独立正确与迁移证据的题目。", "profile")}
      <section class="mastery-rule-panel">
        <header><div><span>判定规则</span><h2>用学习行为证明“真的会”</h2></div><button data-shell-action="mastery-help" type="button">完整规则</button></header>
        <div>
          <article><strong>${rules.masteredIndependentDates ?? 2}</strong><span>个跨日期、至少间隔 ${rules.minimumRetentionIntervalHours ?? 24} 小时的低提示正确证据</span></article>
          <article><strong>${rules.masteredTransferEvidence ?? 1}</strong><span>道经核验迁移作答</span></article>
          <article><strong>≤ ${rules.independentHintMaximum ?? 1}</strong><span>独立正确的提示等级</span></article>
        </div>
      </section>
      <section class="mastered-summary-grid">
        <article><strong>${mastered.filter((item) => item.evidence.code === "mastered").length}</strong><span>已掌握</span></article>
        <article><strong>${mastered.filter((item) => item.evidence.code === "due").length}</strong><span>已掌握但待复习</span></article>
         <article><strong>${data.knowledgePointEvidence?.coverageLabel || "0/0"}</strong><span>知识点已有证据（已有证据/可评估）</span></article>
      </section>
      <section class="mastery-evidence-guide">
        <header><span>掌握路径</span><h2>从“做过”到“掌握”的证据路径</h2></header>
        <div>
          ${[
            ["1", "首次独立尝试", "先作答再看提示；即使答错，也能形成真实起点证据。"],
             ["2", "低提示正确", "提示等级不高于1且结论正确，只记录为“已有独立正确证据”。"],
            ["3", "跨日期再现", "在不同日期重新独立完成，排除短时记住答案的影响。"],
            ["4", "跨情境迁移", "完成结构相同、表面不同的变式，并写出关键规律。"],
            ["5", "到期主动提取", "达到掌握后仍按复习时间重做；到期未复习显示为“待复习”。"]
          ].map(([index, title, detail]) => `<article><i>${index}</i><div><strong>${title}</strong><p>${detail}</p></div></article>`).join("")}
        </div>
        <p>这些阈值是产品内形成性规则，不是标准化教育测量结论；题目质量、迁移回答和开放题仍可能需要教师复核。</p>
      </section>
      <div class="student-question-list mastered-list">
        ${mastered.length ? mastered.map((item) => `
          <article class="student-question-card mastered">
            <div class="student-question-body">
               <div class="question-meta-row"><span>${escapeHtml(item.question.topic)}</span><small class="evidence-${escapeHtml(item.evidence.code)}">${escapeHtml(engine?.masteryDisplayLabel?.(item.evidence) || item.evidence.status)}</small></div>
              <h2>${escapeHtml(item.question.title)}</h2>
              <p>${escapeHtml(item.evidence.reasons.join("；"))}</p>
            </div>
            <div class="student-question-actions">
              <button class="primary" data-start-question="${escapeHtml(item.question.id)}" type="button">${item.evidence.code === "due" ? "立即复习" : "再练一次"}</button>
              <button data-question-detail="${escapeHtml(item.question.id)}" type="button">查看解析</button>
              <button data-similar-topic="${escapeHtml(item.question.topic)}" type="button">同类迁移</button>
            </div>
          </article>`).join("") : `
          <div class="student-empty">
            <strong>还没有题目达到“已掌握”证据标准</strong>
            <span>这不是学习失败。先形成一次低提示正确，再跨日期重做并完成迁移题。</span>
            <button data-student-view="library" type="button">去题库练习</button>
          </div>`}
      </div>
      <section class="near-mastery">
        <header><div><span>下一阶段</span><h2>接近掌握</h2></div><button data-student-view="progress" type="button">查看全部状态 →</button></header>
        ${near.length ? near.map((item) => `
          <article><div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(engine?.masteryDisplayLabel?.(item.evidence) || item.evidence.status)} · ${escapeHtml(item.evidence.reasons.join("；"))}</span></div><button data-start-question="${escapeHtml(item.question.id)}" type="button">继续取证</button></article>`).join("")
          : "<p>先完成正式作答，系统才会计算接近掌握的证据。</p>"}
      </section>`;
  }

  function renderProgress(data) {
    const counts = data.evidence.reduce((result, item) => {
      result[item.evidence.code] = (result[item.evidence.code] || 0) + 1;
      return result;
    }, {});
    const statusMap = {
      "未开始": "not-started",
      "学习中": "learning",
      "已有独立正确证据": "proficient",
      "已掌握": "mastered",
      "待复习": "due",
      "需巩固": "weak"
    };
    const selectedCode = statusMap[ui.progressState] || "";
    const selected = data.evidence.filter((item) => !selectedCode || item.evidence.code === selectedCode);
    const chapters = chapterProgress(data);
    return `
      ${renderModuleHeader("MASTERY PROGRESS", "掌握进度", "同时查看题目状态、章节覆盖与复习到期情况；所有数值都来自本机正式作答证据。", "profile")}
      <section class="progress-state-grid">
        ${Object.entries(statusMap).map(([label, code]) => `
          <button class="${ui.progressState === label ? "active" : ""}" data-progress-state="${escapeHtml(label)}" type="button">
            <strong>${counts[code] || 0}</strong><span>${label}</span><small>${progressStateDescription(code)}</small>
          </button>`).join("")}
      </section>
      <section class="progress-overview">
        <div>
          <span>知识点证据覆盖</span><strong>${data.knowledgePointEvidence?.coverageLabel || "0/0"}</strong>
          <i><b style="width:${data.knowledgePointEvidence?.coverageRate || 0}%"></b></i>
        </div>
        <p>分母为当前 ${escapeHtml(experience.grade)} 的 ${data.knowledgePointEvidence?.totalKnowledgePoints || 0} 个可评估知识点；重复练习同一知识点不会单独提高覆盖结论。</p>
      </section>
      <section class="chapter-progress-section">
        <header><div><span>章节覆盖</span><h2>章节学习覆盖</h2></div><button data-student-view="curriculum" type="button">打开教材目录 →</button></header>
        <div class="chapter-progress-list">
          ${chapters.map((chapter) => `
            <article>
              <div><strong>${escapeHtml(chapter.name)}</strong><span>${chapter.evidenced}/${chapter.total} 道有作答证据 · ${chapter.mastered} 道掌握</span></div>
              <i><b style="width:${chapter.total ? Math.round(chapter.evidenced / chapter.total * 100) : 0}%"></b></i>
              <button data-topic-filter="${escapeHtml(chapter.topic)}" type="button">进入练习</button>
            </article>`).join("")}
        </div>
      </section>
      <section class="progress-question-section">
        <header><div><span>状态列表</span><h2>${escapeHtml(ui.progressState)}题目</h2></div><button data-progress-state="全部" type="button">显示全部</button></header>
        <div class="student-question-list">
          ${selected.slice(0, 30).map((item) => studentQuestionCard(item.question, data, { compact: true })).join("")
            || '<div class="student-empty"><strong>此状态暂无题目</strong><span>完成正式作答后，状态会按证据自动更新。</span></div>'}
        </div>
        ${selected.length > 30 ? `<button class="progress-library-link" data-student-view="library" type="button">到题库查看其余 ${selected.length - 30} 道 →</button>` : ""}
      </section>`;
  }

  function progressStateDescription(code) {
    return {
      "not-started": "无正式作答",
      learning: "已练但未独立正确",
      proficient: "至少一次低提示正确",
      mastered: "跨日期正确并有迁移",
      due: "已掌握且到复习时间",
      weak: "近期错题或高提示依赖"
    }[code] || "全部证据状态";
  }

  function learningErrorCounts(learning) {
    if (!learning) return [];
    const counts = new Map();
    learning.attempts
      .filter((attempt) => attempt.profileId === learning.activeProfileId)
      .forEach((attempt) => {
        const labels = [];
        if (String(attempt.errorType || "").trim()) labels.push(attempt.errorType);
        (attempt.grading?.issues || []).forEach((issue) => {
          const label = typeof issue === "string" ? issue : issue.type || issue.label || issue.category;
          if (String(label || "").trim()) labels.push(label);
        });
        if (!labels.length && attempt.grading?.status === "incorrect") labels.push("待完成错误归因");
        labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1));
      });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  }

  function chapterProgress(data) {
    const groups = new Map();
    data.evidence.forEach((item) => {
      const question = item.question;
      const name = question.curriculumChapter || question.topic || "待分类";
      const current = groups.get(name) || {
        name,
        topic: question.topic || name,
        total: 0,
        evidenced: 0,
        mastered: 0
      };
      current.total += 1;
      if (item.evidence.code !== "not-started") current.evidenced += 1;
      if (["mastered", "due"].includes(item.evidence.code)) current.mastered += 1;
      groups.set(name, current);
    });
    return [...groups.values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "zh-CN"))
      .slice(0, 18);
  }

  function relatedQuestionsForSection(data, book, chapter, section) {
    const target = {
      bookTitle: book.title,
      chapterTitle: chapter.title,
      sectionTitle: section.title,
      chapterNormalized: normalizeSearchText(chapter.title),
      sectionNormalized: normalizeSearchText(section.title),
      matchingGuidePatterns: KNOWLEDGE_GUIDES
        .map(([pattern]) => pattern)
        .filter((pattern) => {
          pattern.lastIndex = 0;
          return pattern.test(`${chapter.title} ${section.title}`);
        })
    };
    const gradeSet = new Set(book.grades || []);
    return data.questions.filter((question) => {
      return gradeSet.has(question.grade) && questionMatchesCurriculum(question, target);
    });
  }

  function knowledgePointsFor(data, book, chapter, section) {
    const search = [
      book.title,
      chapter.title,
      section.title
    ].join(" ");
    const points = [];
    KNOWLEDGE_GUIDES.forEach(([pattern, items]) => {
      pattern.lastIndex = 0;
      if (pattern.test(search)) points.push(...items);
    });
    const related = relatedQuestionsForSection(data, book, chapter, section);
    const relatedSearch = normalizeSearchText([
      search,
      ...related.slice(0, 30).flatMap((question) => [
        question.topic,
        ...(question.examPoints || [])
      ])
    ].join(" "));
    (engine?.formulaCatalog || []).forEach((formula) => {
      const formulaSearch = normalizeSearchText(`${formula.topic} ${formula.name}`);
      if (formulaSearch && (
        relatedSearch.includes(normalizeSearchText(formula.topic))
        || relatedSearch.includes(normalizeSearchText(formula.name))
      )) {
        points.push(`${formula.name}：${formula.formula}；适用条件：${formula.condition}`);
      }
    });
    related
      .flatMap((question) => question.examPoints || [])
      .slice(0, 20)
      .forEach((point) => points.push(`题目能力点：${point}`));
    const generic = [
      `${section.title}的核心概念、物理量定义及其单位`,
      `${section.title}所对应模型的建立条件和适用边界`,
      `${section.title}常见图像、实验现象与证据解释`,
      `${section.title}的典型题型、易错判断和结果复核`
    ];
    const unique = uniqueValues([...points, ...generic]);
    return unique.slice(0, Math.max(4, Math.min(8, unique.length)));
  }

  function curriculumCounts(books) {
    return books.reduce((totals, book) => {
      totals.books += 1;
      totals.chapters += book.chapters.length;
      totals.sections += book.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0);
      return totals;
    }, { books: 0, chapters: 0, sections: 0 });
  }

  function renderCurriculum(data) {
    const allBooks = data.allCurriculumBooks || [];
    const defaultBook = data.curriculumBooks[0] || allBooks[0];
    const selected = allBooks.find((book) => book.id === ui.curriculumBookId) || defaultBook;
    if (selected) ui.curriculumBookId = selected.id;
    const selectedChapter = selected?.chapters?.find((chapter) => chapter.id === ui.curriculumChapterId)
      || selected?.chapters?.[0]
      || null;
    if (selectedChapter) ui.curriculumChapterId = selectedChapter.id;
    const totalCounts = curriculumCounts(allBooks);
    const currentCounts = curriculumCounts(data.curriculumBooks);
    return `
      ${ui.view === "course"
        ? '<section class="student-page-head"><span>教材 · 概念 · 模型</span><h1>课程</h1><p>按教材册、章、节学习；每节都可进入练习、方法讲解和“我来讲一遍”。</p></section>'
        : renderModuleHeader("CURRICULUM MAP", "教材知识点", "按人教版八年级至高中选择性必修的册、章、节组织；每节包含核心要点、适用条件和对应练习。")}
      <section class="curriculum-overview">
        <article><strong>${totalCounts.books}</strong><span>教材册</span><small>八年级至高三完整目录</small></article>
        <article><strong>${totalCounts.chapters}</strong><span>章节</span><small>按教材结构列出</small></article>
        <article><strong>${totalCounts.sections}</strong><span>知识节</span><small>每节至少四项学习要点</small></article>
        <article><strong>${currentCounts.sections}</strong><span>${escapeHtml(experience.grade)}相关节</span><small>${currentCounts.books} 册教材</small></article>
      </section>
      <section class="curriculum-book-panel">
        <header>
          <div><span>选择教材册</span><h2>完整知识目录</h2></div>
          <label><span class="visually-hidden">选择教材册</span><select id="studentCurriculumBook">${allBooks.map((book) => `<option value="${escapeHtml(book.id)}"${book.id === selected?.id ? " selected" : ""}>${escapeHtml(book.title)}</option>`).join("")}</select></label>
        </header>
        <div class="curriculum-book-tabs">
          ${allBooks.map((book) => `
            <button class="${book.id === selected?.id ? "active" : ""}" data-curriculum-book="${escapeHtml(book.id)}" type="button">
              <strong>${escapeHtml(book.title)}</strong>
              <small>${(book.grades || []).includes(experience.grade) ? "当前年级相关" : escapeHtml((book.grades || []).join("、"))}</small>
            </button>`).join("")}
        </div>
      </section>
      ${selected ? `
        <section class="curriculum-selected-book">
          <header>
            <div><span>${escapeHtml(selected.stage)} · ${escapeHtml(selected.publisher)}</span><h2>${escapeHtml(selected.title)}</h2><p>${escapeHtml(selected.structureBasis)}</p></div>
            <button data-official-url="${escapeHtml(selected.officialUrl || "")}" type="button"${selected.officialUrl ? "" : " disabled"}>核对出版社目录 ↗</button>
          </header>
          <div class="curriculum-chapter-list">
            ${selected.chapters.map((chapter) => {
              const isActiveChapter = chapter.id === selectedChapter?.id;
              return `
              <details${isActiveChapter ? " open" : ""}>
                <summary data-curriculum-chapter="${escapeHtml(chapter.id)}">
                  <span>${escapeHtml(chapter.chapterNo)}</span>
                  <strong>${escapeHtml(chapter.title)}</strong>
                  <small>${chapter.sections.length} 节</small>
                </summary>
                ${isActiveChapter ? `
                <div class="curriculum-section-list">
                  ${chapter.sections.map((section) => {
                    const points = knowledgePointsFor(data, selected, chapter, section);
                    const related = relatedQuestionsForSection(data, selected, chapter, section);
                    return `
                      <article id="curriculum-${escapeHtml(section.id)}">
                        <header><div><span>${escapeHtml(chapter.title)}</span><h3>${escapeHtml(section.title)}</h3></div><strong>${related.length} 道关联练习</strong></header>
                        <ul>${points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
                        <div>
                          <button class="primary" data-curriculum-target="${escapeHtml(section.id)}" type="button">练本节题目</button>
                          ${related[0] ? `<button data-method-question="${escapeHtml(related[0].id)}" type="button">看一道方法讲解</button>` : '<button type="button" disabled>暂无精确关联题</button>'}
                          <button data-feynman-question="${escapeHtml(related[0]?.id || `section:${section.id}`)}" data-feynman-topic="${escapeHtml(section.title)}" type="button">我来讲一遍</button>
                        </div>
                      </article>`;
                  }).join("")}
                </div>` : '<p class="curriculum-chapter-hint">点击章节后加载该章知识点与对应练习。</p>'}
              </details>`;
            }).join("")}
          </div>
        </section>` : '<div class="student-empty"><strong>教材目录未加载</strong><span>请检查 curriculum-taxonomy.js 是否随安装包完整发布。</span></div>'}
      <section class="curriculum-source-note">
        <strong>目录与内容边界</strong>
        <p>册、章、节结构依据应用内标注的教材目录；知识点说明由物理概念、公式适用条件、实验方法和题目考点组成，不复制教材课后题正文。出版社链接只用于核对目录，打开前会提示离开应用。</p>
      </section>`;
  }

  function renderFormativeReportSummary(data) {
    const report = data.formativeReport;
    if (!report) return `
      <section class="formative-report-summary loading" aria-live="polite">
        <span>形成性学情报告</span><h2>正在读取本机学习证据</h2><p>报告只使用真实作答、提示、错因和复测记录；不会虚构掌握度。</p>
      </section>`;
    const trendLabels = { improving: "可比题近期正确增加", declining: "可比题近期正确减少", stable: "可比题近期相同", unmatched: "题目未配平", insufficient: "证据不足" };
    return `
      <section class="formative-report-summary">
        <header><div><span>形成性学情证据</span><h2>当前最需要处理的事</h2></div><strong>${report.overall.scoredCount} 条已评分证据</strong></header>
        <p>${escapeHtml(report.boundary)}</p>
        <div class="student-v4-scroll formative-action-strip">
          ${report.nextActions.map((item, index) => `<article><i>${index + 1}</i><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.reason)}</p>${item.actionId === "review.due" ? '<button data-shell-action="open-review" type="button">开始复习</button>' : item.knowledgePointId ? `<button data-topic-key-filter="${escapeHtml(item.knowledgePointId)}" type="button">专项练习</button>` : '<button data-student-view="training" type="button">开始训练</button>'}</article>`).join("")}
        </div>
        <div class="formative-three-column">
          <article><span>当前较稳定</span>${report.stable.length ? report.stable.map((item) => `<strong>${escapeHtml(item.label)}<small>${item.scoredCount} 题 · ${item.accuracy}%</small></strong>`).join("") : '<p>暂无达到样本门槛的稳定项。</p>'}</article>
          <article><span>需要巩固</span>${report.needsWork.length ? report.needsWork.map((item) => `<strong>${escapeHtml(item.label)}<small>${item.scoredCount} 题 · ${item.accuracy}%</small></strong>`).join("") : '<p>暂无达到样本门槛的薄弱项。</p>'}</article>
          <article><span>近期可比作答</span>${report.recentTrend.length ? report.recentTrend.map((item) => `<strong>${escapeHtml(item.label)}<small>${trendLabels[item.trend] || item.trend} · ${item.trend === "unmatched" ? "只显示描述性记录" : `配平 ${item.matchedPairCount} 组`}</small></strong>`).join("") : '<p>至少需要三条已评分证据。</p>'}</article>
        </div>
        <small>${escapeHtml(report.evidenceRule)}</small>
      </section>`;
  }

  function renderStudentAnalysis(data) {
    const analysis = data.analysis || {};
    const radar = data.learning ? engine?.modelingRadar?.(data.learning) || [] : [];
    const errors = learningErrorCounts(data.learning);
    const misconceptions = (data.summary.misconceptionProfile || []).filter((item) => item.evidenceCount > 0).slice(0, 6);
    const weakest = analysis.weakest || [];
    const strongest = analysis.strongest || [];
    const knowledgePoints = analysis.knowledgePoints || [];
    const knowledgeCounts = analysis.abilityProfile?.knowledgePointCounts || {};
    const evidencePageSize = 12;
    const evidencePageCount = Math.max(1, Math.ceil(knowledgePoints.length / evidencePageSize));
    ui.analysisEvidencePage = Math.min(Math.max(1, ui.analysisEvidencePage || 1), evidencePageCount);
    const evidencePageStart = (ui.analysisEvidencePage - 1) * evidencePageSize;
    const visibleKnowledgePoints = knowledgePoints.slice(evidencePageStart, evidencePageStart + evidencePageSize);
    return `
      <section class="student-page-head"><span>个人学习证据</span><h1>学情</h1><p>先给出下一步行动，再展开原始证据、覆盖情况和分析边界。</p></section>
      ${renderFormativeReportSummary(data)}
      <section class="analysis-evidence-note">
        <strong>${escapeHtml(analysis.conclusion || "当前尚无正式作答证据，不能形成可靠薄弱判断。")}</strong>
         <p>${escapeHtml(analysis.evidenceCoverage?.reason || "证据不足：尚未覆盖足够的可评估知识点。")}</p>
         <p>${escapeHtml(analysis.boundary || "本报告是形成性分析，不是标准化能力诊断。")}</p>
      </section>
      <details class="knowledge-evidence-matrix" open>
        <summary>
          <div><span>知识点证据矩阵</span><h2>课标知识点证据矩阵</h2></div>
          <div>${["证据不足", "需巩固", "基本掌握", "可迁移"].map((status) => `<strong><b>${knowledgeCounts[status] || 0}</b>${status}</strong>`).join("")}</div>
        </summary>
        <p>每项同时显示样本量和最近证据日期；没有证据的知识点不会被当作已掌握。</p>
        <div>
          ${visibleKnowledgePoints.map((item) => `
            <article class="evidence-${escapeHtml(item.code)}">
              <header><strong>${escapeHtml(item.topic)}</strong><span>${escapeHtml(item.status)}</span></header>
              <p>${item.sampleSize} 条证据 · 正式作答 ${item.attemptCount} 次 · 迁移成功 ${item.transferSuccessCount} 次</p>
              <small>最近证据：${item.latestEvidenceDate ? escapeHtml(item.latestEvidenceDate) : "无"}${item.attemptCount ? ` · ${item.accuracy == null ? "暂无可评分证据" : `正确率 ${item.accuracy}%`} · 待复核 ${item.pendingReviewCount || 0} · 平均提示 ${item.averageHint}` : ""}</small>
              <button data-topic-filter="${escapeHtml(item.topic)}" type="button">打开对应练习</button>
            </article>`).join("") || "<p>当前年级题库尚未形成可核对的知识点目录。</p>"}
        </div>
        ${knowledgePoints.length > evidencePageSize ? `
          <nav class="knowledge-evidence-pager" aria-label="知识点证据分页">
            <button data-analysis-page-direction="-1" type="button"${ui.analysisEvidencePage <= 1 ? " disabled" : ""}>上一页</button>
            <span>第 ${ui.analysisEvidencePage}/${evidencePageCount} 页 · ${evidencePageStart + 1}—${Math.min(knowledgePoints.length, evidencePageStart + evidencePageSize)} / ${knowledgePoints.length}</span>
            <button data-analysis-page-direction="1" type="button"${ui.analysisEvidencePage >= evidencePageCount ? " disabled" : ""}>下一页</button>
          </nav>` : ""}
        <small>${escapeHtml(analysis.abilityProfile?.evidenceRule || "结论依据样本量、最近证据、提示依赖、跨日正确与迁移表现。")}</small>
      </details>
      <section class="analysis-metric-grid">
        <article><strong>${data.summary.accuracy == null ? "暂无" : `${data.summary.accuracy}%`}</strong><span>已评分正确率</span><small>${data.summary.correctCount || 0}/${data.summary.scoredCount || 0} 次已评分 · 待复核 ${data.summary.pendingReviewCount || 0}</small></article>
        <article><strong>${data.summary.independenceRate == null ? "暂无" : `${data.summary.independenceRate}%`}</strong><span>独立完成率</span><small>正确且提示等级≤1</small></article>
        <article><strong>${data.summary.averageHint || 0}</strong><span>平均提示等级</span><small>越低表示依赖越少</small></article>
        <article><strong>${data.summary.learningMinutes || 0}</strong><span>累计学习分钟</span><small>来自正式作答计时</small></article>
        <article><strong>${data.summary.dueCount || 0}</strong><span>到期复习</span><small>按间隔复习调度</small></article>
         <article><strong>${data.knowledgePointEvidence?.coverageLabel || "0/0"}</strong><span>知识点证据覆盖</span><small>已有证据知识点 / 可评估知识点</small></article>
      </section>
      <section class="ability-evidence-strip">
        <div><span>作答题型证据</span>${(analysis.abilityProfile?.questionTypes || []).map((item) => `<strong>${escapeHtml(item.label)} <b>${item.count}</b></strong>`).join("") || "<small>尚无题型作答证据</small>"}</div>
        <div><span>主要错误类型</span>${(analysis.abilityProfile?.errorTypes || []).map((item) => `<strong>${escapeHtml(item.label)} <b>${item.count}</b></strong>`).join("") || "<small>尚无错误归因证据</small>"}</div>
      </section>
      <div class="analysis-two-column">
        <section class="analysis-topic-card">
          <header><span>需巩固的证据</span><h2>需要优先巩固</h2></header>
          ${weakest.length ? weakest.map((topic) => `
            <article>
              <div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts
                ? `${topic.attempts} 次作答 · ${topic.accuracy == null ? "暂无可评分证据" : `正确率 ${topic.accuracy}%`} · 待复核 ${topic.pendingReviewCount || 0} · 提示 ${topic.averageHint}`
                : `试卷薄弱项记录 ${topic.examMentions || 0} 次 · 尚无专项作答`}</span></div>
              <i><b style="width:${topic.attempts ? topic.averageScore : Math.min(100, 25 + (topic.examMentions || 0) * 15)}%"></b></i>
              <button data-topic-filter="${escapeHtml(topic.topic)}" type="button">专项练习</button>
            </article>`).join("") : "<p>暂无足够证据。至少完成一组独立作答后再判断薄弱点。</p>"}
        </section>
        <section class="analysis-topic-card strong">
          <header><span>相对稳定的证据</span><h2>当前相对稳定</h2></header>
          ${strongest.length ? strongest.map((topic) => `
            <article><div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts} 次记录 · 平均得分 ${topic.averageScore == null ? "暂无可评分证据" : `${topic.averageScore}%`}</span></div><i><b style="width:${topic.averageScore == null ? 0 : topic.averageScore}%"></b></i></article>`).join("")
            : "<p>记录不足，暂不标记优势模块。</p>"}
        </section>
      </div>
      <section class="modeling-analysis-card">
         <header><div><span>建模记录</span><h2>建模记录完整度（规则值）</h2></div><button data-student-view="lab" type="button">进入建模训练 →</button></header>
        <div class="modeling-axis-list">
          ${radar.map((axis) => `<article><span>${escapeHtml(axis.label)}</span><i><b style="width:${axis.value}%"></b></i><strong>${axis.value}%</strong></article>`).join("")
            || "<p>尚无建模步骤评分，不能绘制雷达证据。</p>"}
        </div>
      </section>
      <div class="analysis-two-column">
        <section class="error-analysis-card">
          <header><span>错误原因</span><h2>错误原因分布</h2></header>
          ${errors.length ? errors.map(([label, count]) => `<article><span>${escapeHtml(label)}</span><strong>${count}</strong></article>`).join("")
            : "<p>尚未记录结构化错误原因。错题订正时请选择最主要原因。</p>"}
        </section>
        <section class="misconception-analysis-card">
          <header><span>前概念</span><h2>前概念诊断</h2></header>
          ${misconceptions.length ? misconceptions.map((item) => `<article><div><strong>${escapeHtml(item.title || item.label || item.code)}</strong><span>${escapeHtml(item.status)}</span></div><small>${item.evidenceCount} 次诊断证据 · 单次结果不会自动升级为稳定误概念</small></article>`).join("")
            : '<p>还没有“答案＋理由＋置信度”诊断记录。可在学习实验室完成前概念诊断。</p>'}
          <button data-shell-action="open-diagnostic" type="button">开始概念诊断</button>
        </section>
      </div>
      <section class="analysis-growth-card">
        <header><div><span>成长记录</span><h2>成长时间线与试卷趋势</h2></div><strong>${(analysis.growthTimeline || []).length} 条记录</strong></header>
        ${analysis.examTrend?.length ? `<div class="exam-trend-row">${analysis.examTrend.map((item) => `<article><time>${escapeHtml(new Date(item.date).toLocaleDateString("zh-CN"))}</time><strong>${item.percentage}%</strong><span>${escapeHtml(item.title)}</span></article>`).join("")}</div>` : "<p>尚未导入试卷成绩，暂不计算考试趋势。</p>"}
        <div class="growth-timeline">
          ${(analysis.growthTimeline || []).slice(0, 12).map((item) => `<article><time>${escapeHtml(new Date(item.date).toLocaleDateString("zh-CN"))}</time><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span><small>${escapeHtml(item.evidence || "")}</small></div></article>`).join("")
            || "<p>完成练习、复习或导入试卷后形成成长记录。</p>"}
        </div>
      </section>`;
  }

  function renderStudentLab(data) {
    const tools = [
       ["diagnostic", "◎", "前概念诊断", "用答案、理由和置信度区分不会、猜对与待验证误概念；稳定风险需独立证据确认。"],
      ["tutor", "?", "苏格拉底导师", "按研究对象、过程、规律和条件逐级追问，不立即泄露答案。"],
      ["models", "⌬", "模型与可视化", "联动物理量、方程、受力图、运动图像和动态过程。"],
      ["transfer", "⇄", "迁移训练", "练结构相同但情境不同的题，并加入不适用规律的反例。"],
      ["review", "◴", "间隔复习", `当前 ${data.summary.dueCount || 0} 道到期，按作答质量和提示依赖安排。`],
      ["tools", "Σ", "公式与验证工具", "公式条件、单位换算、量纲检查、常数表和图像工具。"],
      ["sensors", "∿", "手机传感器实验", "采集加速度、方向、声音、光和磁场数据，记录实验边界。"],
      ["dashboard", "▦", "学习实验室总览", "汇总诊断、建模、复习、迁移与实验记录。"]
    ];
    return `
      ${renderModuleHeader("PHYSICS LEARNING LAB", "学习实验室", "把诊断、建模、推理、验证、迁移和复习连成物理学科闭环。")}
      <section class="learning-loop">
        ${["诊断学情", "建立模型", "分步推理", "可视化验证", "针对练习", "迁移应用", "间隔复习", "效果评估"].map((label, index) => `<article><i>${index + 1}</i><strong>${label}</strong></article>`).join("")}
      </section>
      <section class="student-lab-grid">
        ${tools.map(([tab, icon, title, detail]) => `
          <article>
            <span aria-hidden="true">${icon}</span>
            <div><h2>${title}</h2><p>${detail}</p></div>
            <button data-open-lab-tab="${tab}" type="button">进入工具 →</button>
          </article>`).join("")}
      </section>
      <section class="lab-evidence-summary">
        <div><span>正式作答</span><strong>${data.summary.completed || 0}</strong></div>
        <div><span>到期复习</span><strong>${data.summary.dueCount || 0}</strong></div>
        <div><span>迁移后掌握</span><strong>${data.masteredQuestions.length}</strong></div>
        <p>教师内容审核、批量导入和组卷不在学生实验室显示；学生端只保留学习所需工具。</p>
      </section>`;
  }

  function sevenDayPlan(data) {
    const labels = ["今天", "第2天", "第3天", "第4天", "第5天", "第6天", "第7天"];
    if (data.activePlan && data.planItems.length) {
      return labels.map((label, index) => {
        const item = data.planItems[Math.min(index, data.planItems.length - 1)];
        const reviewDay = index >= data.planItems.length;
        return {
          label,
          topic: reviewDay ? `${data.activePlan.focusTopics[0]}复习验证` : item.purpose,
          question: item.question,
          tasks: reviewDay
            ? ["不看原解答，重新说明适用条件", "根据复习到期状态决定是否重做，不追加新题"]
            : [item.reason, item.completed ? "已完成：用一句话复述关键规律" : "独立作答后再按需使用分级提示"]
        };
      });
    }
    const recommendationQuestions = data.recommendations.map((item) => item.question);
    const topics = uniqueValues([
      ...(data.analysis?.weakest || []).map((item) => item.topic),
      ...recommendationQuestions.map((question) => question.topic),
      ...data.newTopics
    ]);
    return labels.map((label, index) => {
      const topic = topics[index % Math.max(1, topics.length)] || "当前年级综合复习";
      const question = recommendationQuestions[index % Math.max(1, recommendationQuestions.length)];
      const tasks = index === 0
        ? [`先完成 ${data.summary.dueCount || 0} 道到期复习`, `${topic} 专项独立作答`]
        : index === 6
          ? ["重做本周两道代表性错题", "完成一道跨情境迁移并自我解释"]
          : [`${topic}：独立练习与分级提示`, index % 2 ? "复盘错因与公式适用条件" : "完成一道迁移或反例题"];
      return { label, topic, question, tasks };
    });
  }

  function renderAdvice(data) {
    const priorities = data.analysis?.priorities || ["先完成一组独立作答，形成可分析证据"];
    const plan = sevenDayPlan(data);
    return `
      ${renderModuleHeader("ACTIONABLE ADVICE", "学习建议", "建议只依据本机作答、提示、错因、建模、复习与考试记录；证据不足时明确说明。", "profile")}
      ${renderAssignedPlan(data)}
      <section class="advice-priority-card">
        <header><div><span>下一步建议</span><h2>当前优先级</h2></div><strong>${priorities.length} 项</strong></header>
        <ol>${priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
        <div><button class="primary" data-start-question="${escapeHtml(data.next?.question?.id || "")}" type="button"${data.next?.question ? "" : " disabled"}>开始第一项</button><button data-student-view="analysis" type="button">查看分析依据</button></div>
      </section>
      <section class="recommended-question-section">
        <header><div><span>推荐依据</span><h2>为你推荐的题目</h2></div><button data-student-view="library" type="button">打开完整题库 →</button></header>
        <div class="student-recommend-list">
          ${data.recommendations.slice(0, 10).map((item, index) => `
            <article>
              <i>${index + 1}</i>
              <div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(item.question.topic)} · ${escapeHtml(item.reasons.join("；") || "补充当前年级覆盖")}</span></div>
              <button data-start-question="${escapeHtml(item.question.id)}" type="button">开始</button>
            </article>`).join("") || '<div class="student-empty"><strong>还没有个性化排序证据</strong><span>先完成一次正式作答，推荐会根据结果、提示等级和建模记录调整。</span></div>'}
        </div>
      </section>
      <section class="seven-day-plan">
        <header><div><span>7-DAY PLAN</span><h2>七日学习安排</h2></div><p>每次建议约 15 分钟；到期复习始终优先。</p></header>
        <div>
          ${plan.map((day) => `
            <article>
              <span>${day.label}</span><h3>${escapeHtml(day.topic)}</h3>
              <ul>${day.tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ul>
              ${day.question ? `<button data-start-question="${escapeHtml(day.question.id)}" type="button">打开建议题</button>` : `<button data-student-view="library" type="button">选择题目</button>`}
            </article>`).join("")}
        </div>
      </section>
      <section class="learning-method-advice">
        <header><span>学习方法</span><h2>每道题怎样学得更扎实</h2></header>
        <div>
          <article><strong>先主动提取</strong><p>在看解析前至少写出研究对象、已知未知量和一个可能适用的规律。</p></article>
          <article><strong>控制提示依赖</strong><p>只在卡住时逐级打开提示；完成后记录最终使用的提示等级。</p></article>
          <article><strong>解释与迁移</strong><p>用一句话解释关键规律，再做一道表面不同、结构相同的变式。</p></article>
          <article><strong>按时复习</strong><p>到期后重新独立作答，不能用“记得答案”替代物理推理。</p></article>
        </div>
      </section>
      <section class="advice-boundary">
        <strong>建议边界</strong>
        <p>${escapeHtml(data.analysis?.boundary || "记录不足时，系统只给出起步顺序，不作能力结论。")} 推荐顺序是形成性学习支持，不替代教师对开放题、实验设计题和长期学习困难的专业判断。</p>
      </section>`;
  }

  function renderStudentProfile(data) {
    const mastery = data.summary.mastery;
    const topics = data.summary.topics.slice(0, 6);
    return `
      <section class="student-page-head profile-head"><span>只展示可解释的学习证据</span><h1>我的</h1><p>${escapeHtml(experience.grade)} · ${escapeHtml(experience.textbook)} · ${escapeHtml(experience.goal)}</p></section>
      ${renderStudentModuleDirectory(data, "我的学习档案与工具")}
      <section class="student-report-card">
        <div class="report-metrics">
          <article><strong>${data.summary.independenceRate == null ? "暂无" : `${data.summary.independenceRate}%`}</strong><span>独立完成率</span></article>
          <article><strong>${data.summary.averageHint}</strong><span>平均提示等级</span></article>
          <article><strong>${data.summary.learningMinutes}</strong><span>学习分钟</span></article>
        </div>
       <button data-shell-action="open-review" type="button">查看完整学习报告 →</button>
      </section>
      <section class="my-learning-subareas">
        <header><span>我的学习</span><h2>我的学习</h2><p>掌握证据、学习进度、本人学情和学习建议集中在这里。</p></header>
        <div><button data-student-view="mastered" type="button">已有掌握证据</button><button data-student-view="progress" type="button">学习进度</button><button data-student-view="analysis" type="button">本人学情分析</button><button data-student-view="advice" type="button">学习建议</button></div>
      </section>
      <section class="mastery-status-card">
         <header><div><span>知识点证据覆盖</span><h2>${data.knowledgePointEvidence?.coverageLabel || "0/0"} 已有证据</h2></div><button data-shell-action="mastery-help" type="button">规则说明</button></header>
        <div>${Object.entries(mastery.counts).map(([label, count]) => `<article><strong>${count}</strong><span>${escapeHtml(engine?.masteryDisplayLabel?.(label) || label)}</span></article>`).join("")}</div>
      </section>
      <section class="topic-evidence-card">
        <h2>知识点表现</h2>
        ${topics.length ? topics.map((topic) => `<article><div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts} 次记录 · 提示 ${topic.averageHint}</span></div><i><b style="width:${topic.averageScore == null ? 0 : topic.averageScore}%"></b></i><small>${topic.averageScore == null ? "暂无可评分证据" : `${topic.averageScore}%`}</small></article>`).join("") : "<p>完成正式作答后，这里才会生成知识点证据。</p>"}
      </section>
      <section class="student-growth-card">
        <header><div><span>成长档案</span><h2>近期学习证据</h2></div><strong>${data.analysis?.growthTimeline?.length || 0} 条</strong></header>
        ${data.analysis?.priorities?.length ? `<ul>${data.analysis.priorities.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>完成一次正式作答后生成改进重点。</p>"}
        <div>
          ${(data.analysis?.growthTimeline || []).slice(0, 5).map((item) => `
            <article><time>${escapeHtml(new Date(item.date).toLocaleDateString("zh-CN"))}</time><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></article>`).join("")}
        </div>
        <small>${escapeHtml(data.analysis?.boundary || "记录不足时不作能力结论。")}</small>
      </section>
      <section class="student-tool-list">
        <button data-shell-action="open-sensors" type="button"><span>⌁</span><div><strong>手机实验室</strong><small>传感器、数据与探究记录</small></div><i>→</i></button>
        <button data-shell-action="open-diagnostic" type="button"><span>◎</span><div><strong>前概念诊断</strong><small>识别稳定错误观念，不只统计错题</small></div><i>→</i></button>
        <button data-shell-action="classroom" type="button"><span>班</span><div><strong>加入老师班级</strong><small>联网时自动同步班级；Edge 优先打开外部链接，离线仍保留本机档案</small></div><i>→</i></button>
        <button data-shell-action="open-settings" type="button"><span>⚙</span><div><strong>身份与学习设置</strong><small>修改年级、教材和近期目标</small></div><i>→</i></button>
        <button data-shell-action="feedback" type="button"><span>✉</span><div><strong>用户反馈</strong><small>打开邮件应用，确认后发送至 luo865265@gmail.com</small></div><i>→</i></button>
      </section>
      <section class="student-accessibility">
        <div><strong>题干字号</strong><span>支持浏览器双指缩放；这里调整默认字号。</span></div>
        <div><button data-font-scale="-0.1" type="button" aria-label="缩小字号">A−</button><strong>${Math.round(experience.fontScale * 100)}%</strong><button data-font-scale="0.1" type="button" aria-label="放大字号">A＋</button></div>
      </section>
        <p class="student-safety-note">外部网站访问：${experience.studentExternalLinks ? "默认开启，离站前仍需确认" : "已由教师或本机安全设置关闭"}。外部搜索结果不直接进入学情证据；学习状态来自行为证据，不允许手动勾选“已掌握”。</p>`;
  }

  function renderParent() {
    const data = getStudentData();
    const supportTopics = data.summary.topics.slice(0, 4);
    const profileReviews = engine?.reviewsForProfile?.(data.learning || { reviews: {} }) || [];
    const weekReviewed = profileReviews
      .filter((review) => new Date(review.lastReviewedAt || 0).getTime() >= startOfWeek()).length;
    return `
      <header class="parent-header"><div><span>家长摘要</span><strong>${escapeHtml(experience.displayName)} · ${escapeHtml(experience.grade)}</strong></div><button data-shell-action="open-settings" type="button">切换身份</button></header>
      <main class="parent-main">
        <section class="parent-intro"><span>本周学习支持</span><h1>关注节奏和完成情况，不贴负面标签</h1><p>只展示本机结构化学习证据，不展示班级排名或未经验证的能力判断。</p></section>
        <div class="parent-metrics">
          <article><strong>${data.summary.learningMinutes}</strong><span>累计学习分钟</span><small>${data.summary.completed} 次正式作答</small></article>
          <article><strong>${weekReviewed}</strong><span>本周完成复习</span><small>当前待复习 ${data.summary.dueCount} 道</small></article>
          <article><strong>${data.summary.independenceRate == null ? "暂无" : `${data.summary.independenceRate}%`}</strong><span>独立完成率</span><small>低提示正确占比</small></article>
        </div>
        <section class="parent-support">
          <h2>近期可支持的知识模块</h2>
          ${supportTopics.length ? supportTopics.map((topic) => `<article><div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts} 次学习记录</span></div><p>${topic.averageHint >= 3 ? "可提醒孩子先画图、明确研究对象，再决定公式。" : "继续保持独立作答，并按时完成迁移与复习。"}</p></article>`).join("") : "<p>当前记录不足，先帮助孩子完成一次不受打断的正式练习。</p>"}
        </section>
        <section class="parent-actions">
          <h2>适合家长做的事</h2>
          <ul><li>提供稳定、少干扰的 15 分钟学习时间。</li><li>询问“这道题的关键规律是什么”，不要直接给答案。</li><li>关注到期复习是否完成，不用单次错误评价能力。</li></ul>
          <button data-shell-action="feedback" type="button">通过邮件反馈使用问题</button>
        </section>
      </main>`;
  }

  function renderTeacherBar() {
    let bar = document.getElementById("teacherExperienceBar");
    if (!bar) {
      bar = document.createElement("section");
      bar.id = "teacherExperienceBar";
      bar.className = "teacher-experience-bar";
      document.querySelector(".main")?.prepend(bar);
    }
    bar.innerHTML = `
      <div><span>教师模式</span><strong>内容管理、审核、组卷与学习证据</strong></div>
      <div>
        <button data-teacher-action="center" type="button">打开教师中心</button>
        <button data-teacher-action="classroom" type="button">打开班级</button>
        <button data-teacher-action="lock" type="button">锁定教师模式</button>
        ${FIXED_ROLE ? "" : '<button data-teacher-action="switch" type="button">切换身份</button>'}
      </div>`;
    bar.onclick = handleTeacherBarClick;
  }

  function renderLockedTeacherBar() {
    let bar = document.getElementById("teacherExperienceBar");
    if (!bar) {
      bar = document.createElement("section");
      bar.id = "teacherExperienceBar";
      bar.className = "teacher-experience-bar teacher-mode-locked";
      document.querySelector(".main")?.prepend(bar);
    }
    bar.innerHTML = `<div><span>教师模式已锁定</span><strong>本地教师管理需要 PIN 解锁；学生体验不能通过普通角色切换取得教师权限。</strong></div><div><button data-teacher-action="unlock" type="button">解锁教师管理</button>${FIXED_ROLE ? "" : '<button data-teacher-action="switch" type="button">切换身份</button>'}</div>`;
    bar.onclick = handleTeacherBarClick;
  }

  function removeTeacherBar() {
    document.getElementById("teacherExperienceBar")?.remove();
  }

  function handleTeacherBarClick(event) {
    const action = event.target.closest("[data-teacher-action]")?.dataset.teacherAction;
    if (action === "center") openLab("teacher");
    else if (action === "metrics") showMetrics();
    else if (action === "classroom") openClassroom();
    else if (action === "feedback") openFeedbackEmail();
    else if (action === "unlock") ensureTeacherUnlocked().then(() => renderRoleExperience());
    else if (action === "lock") {
      window.PhysicsStudioTeacherLock?.lock();
      renderRoleExperience();
      document.dispatchEvent(new CustomEvent("physics-experience-role-changed", { detail: { role: experience.role, locked: true } }));
    }
    else if (action === "switch" && !FIXED_ROLE) showOnboarding(true);
  }

  function handleShellClick(event) {
    const nav = event.target.closest("[data-student-view]");
    if (nav) {
      ui.view = nav.dataset.studentView;
      if (studentViewRenderTimer) window.clearTimeout(studentViewRenderTimer);
      studentViewRenderTimer = 0;
      renderStudentViewOnly();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const questionModel = event.target.closest("[data-open-question-model]");
    if (questionModel) {
      openLab("models", questionModel.dataset.openQuestionModel);
      return;
    }
    const feynman = event.target.closest("[data-feynman-question]");
    if (feynman) {
      showFeynmanExplanation(feynman.dataset.feynmanQuestion, feynman.dataset.feynmanTopic);
      return;
    }
    const targetedPlan = event.target.closest("[data-targeted-plan-size]");
    if (targetedPlan) {
      createStudentTargetedPlan(Number(targetedPlan.dataset.targetedPlanSize));
      return;
    }
    const variantParent = event.target.closest("[data-open-variant-parent]");
    if (variantParent) {
      const questionId = variantParent.dataset.openVariantParent;
      if (!questionId || !app?.openTransferPractice?.(questionId)) {
        window.alert("当前没有可验证的完整变式题，请先完成一题或让教师补充审核题族。");
      }
      return;
    }
    const topicKeyFilter = event.target.closest("[data-topic-key-filter]");
    if (topicKeyFilter) {
      const data = getStudentData();
      const matched = data.gradeQuestions.find((question) => engine?.topicKeyForQuestion?.(question) === topicKeyFilter.dataset.topicKeyFilter);
      ui.libraryGrade = experience.grade;
      ui.libraryTopic = matched?.topic || "全部";
      ui.libraryPage = 1;
      ui.view = "library";
      renderStudentViewOnly();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const detail = event.target.closest("[data-question-detail]");
    if (detail) {
      app?.openQuestion?.(detail.dataset.questionDetail);
      recordEvent("question-detail-opened", { questionId: detail.dataset.questionDetail, source: ui.view });
      return;
    }
    const method = event.target.closest("[data-method-question]");
    if (method) {
      openMethodPlayer(method.dataset.methodQuestion);
      return;
    }
    const page = event.target.closest("[data-page-direction]");
    if (page) {
      ui.libraryPage = Math.max(1, ui.libraryPage + Number(page.dataset.pageDirection || 0));
      renderStudentViewOnly();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const analysisPage = event.target.closest("[data-analysis-page-direction]");
    if (analysisPage) {
      ui.analysisEvidencePage = Math.max(1, ui.analysisEvidencePage + Number(analysisPage.dataset.analysisPageDirection || 0));
      renderStudentViewOnly();
      document.querySelector(".knowledge-evidence-matrix")?.scrollIntoView({ block: "start", behavior: "auto" });
      return;
    }
    const topicFilter = event.target.closest("[data-topic-filter], [data-similar-topic]");
    if (topicFilter) {
      const topic = topicFilter.dataset.topicFilter || topicFilter.dataset.similarTopic;
      ui.libraryGrade = experience.grade;
      ui.libraryTopic = topic;
      ui.curriculumTarget = null;
      ui.libraryPage = 1;
      ui.view = "library";
      renderStudentViewOnly();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const progressState = event.target.closest("[data-progress-state]");
    if (progressState) {
      ui.progressState = progressState.dataset.progressState;
      renderStudentViewOnly();
      return;
    }
    const curriculumBook = event.target.closest("[data-curriculum-book]");
    if (curriculumBook) {
      ui.curriculumBookId = curriculumBook.dataset.curriculumBook;
      ui.curriculumChapterId = "";
      renderStudentViewOnly();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    const curriculumChapter = event.target.closest("[data-curriculum-chapter]");
    if (curriculumChapter) {
      event.preventDefault();
      ui.curriculumChapterId = curriculumChapter.dataset.curriculumChapter;
      renderStudentViewOnly();
      requestAnimationFrame(() => {
        shell?.querySelector(`[data-curriculum-chapter="${CSS.escape(ui.curriculumChapterId)}"]`)
          ?.scrollIntoView({ block: "start", behavior: "auto" });
      });
      return;
    }
    const curriculumTarget = event.target.closest("[data-curriculum-target]");
    if (curriculumTarget) {
      ui.curriculumTarget = curriculumTargetById(curriculumTarget.dataset.curriculumTarget);
      if (ui.curriculumTarget) {
        const book = (window.PHYSICS_CURRICULUM_TAXONOMY?.books || [])
          .find((item) => item.id === ui.curriculumTarget.bookId);
        ui.libraryGrade = book?.grades?.includes(experience.grade)
          ? experience.grade
          : book?.grades?.[0] || "全部";
        ui.libraryDifficulty = "全部";
        ui.libraryTopic = "全部";
        ui.libraryQuestionType = "全部";
        ui.search = "";
        ui.libraryPage = 1;
        ui.view = "library";
        renderStudentViewOnly();
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      return;
    }
    const labTab = event.target.closest("[data-open-lab-tab]");
    if (labTab) {
      openLab(labTab.dataset.openLabTab);
      return;
    }
    const officialLink = event.target.closest("[data-official-url]");
    if (officialLink) {
      openOfficialCurriculumLink(officialLink.dataset.officialUrl);
      return;
    }
    const libraryAction = event.target.closest("[data-library-action]");
    if (libraryAction) {
      if (libraryAction.dataset.libraryAction === "clear") {
        ui.search = "";
        ui.libraryDifficulty = "全部";
        ui.libraryTopic = "全部";
        ui.libraryQuestionType = "全部";
        ui.curriculumTarget = null;
      } else if (libraryAction.dataset.libraryAction === "clear-curriculum") {
        ui.curriculumTarget = null;
      }
      ui.libraryPage = 1;
      renderStudentViewOnly();
      return;
    }
    const question = event.target.closest("[data-start-question]");
    if (question) {
      startQuestion(question.dataset.startQuestion, ui.view === "wrong" ? "wrong-correction" : "student-start");
      return;
    }
    const font = event.target.closest("[data-font-scale]");
    if (font) {
      experience.fontScale = clamp(experience.fontScale + Number(font.dataset.fontScale), 0.9, 1.4);
      saveExperience();
      applyFontScale();
      renderStudentViewOnly();
      return;
    }
    const action = event.target.closest("[data-shell-action]")?.dataset.shellAction;
    if (!action) return;
    if (action === "capture") openCapture();
    else if (action === "open-settings") showOnboarding(true);
    else if (action === "open-review") openLab("review");
    else if (action === "open-diagnostic") openLab("diagnostic");
    else if (action === "open-models") openLab("models");
    else if (action === "open-tools") openLab("tools");
    else if (action === "open-sensors") openLab("sensors");
    else if (action === "classroom") openClassroom();
    else if (action === "open-placement") showDiagnosticPackage("placement");
    else if (action === "open-broad-check") showDiagnosticPackage("broad");
    else if (action === "mastery-help") showMasteryHelp();
    else if (action === "external-search") externalStudentSearch();
    else if (action === "feedback") openFeedbackEmail();
  }

  function openFeedbackEmail() {
    const subject = `费曼物理 v${engine?.version || "4.0.0"} 用户反馈`;
    const body = [
      "请描述遇到的问题或建议：",
      "",
      `使用身份：${experience.role}`,
      `年级：${experience.grade}`,
      `应用版本：${engine?.version || "4.0.0"}`,
      "设备与系统："
    ].join("\r\n");
    recordEvent("feedback-email-opened", { role: experience.role });
    window.location.href = `mailto:luo865265@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function createStudentTargetedPlan(count) {
    if (!engine?.buildTargetedLearningPlan || !engine?.saveSelfDirectedLearningPlan) {
      window.alert("专项训练模块未完整加载，请重新启动应用。");
      return;
    }
    const data = getStudentData({ includeAnalysis: true });
    if (!data.learning) return;
    const report = data.formativeReport || engine.buildStudentFormativeReport?.(data.learning, data.gradeQuestions, data.learning.activeProfileId);
    const focus = report?.needsWork?.[0] || data.analysis?.weakest?.[0] || null;
    try {
      const plan = engine.buildTargetedLearningPlan(data.learning, data.gradeQuestions, {
        profileId: data.learning.activeProfileId,
        count,
        focusTopicKey: focus?.knowledgePointId || focus?.topicKey || "",
        focusTopic: focus?.label || focus?.topic || "",
        teacherNote: "学生依据本人形成性学情自主发起；不是教师评价或标准化测评分数。"
      });
      engine.saveSelfDirectedLearningPlan(data.learning, plan);
      engine.saveState(data.learning);
      await engine.awaitLastSave?.();
      studentDataCache = null;
      recordEvent("student-targeted-plan-created", { type: `${count}-question` });
      ui.view = "training";
      renderRoleExperience();
      window.alert(`已建立 ${plan.questionCount} 题专项方案：${plan.title}。请先完成当前学习时段。`);
    } catch (error) {
      window.alert(error?.message || "专项方案建立失败，未写入学习档案。");
    }
  }

  function showFeynmanExplanation(questionId, topic) {
    if (!questionId) return;
    const data = getStudentData();
    const question = data.gradeQuestions.find((item) => item.id === questionId);
    metricsDialog.dataset.feynmanQuestionId = questionId;
    metricsDialog.dataset.feynmanTopic = topic || question?.topic || "当前物理知识";
    metricsDialog.querySelector("article").innerHTML = `
      <header><div><span>讲解与自检</span><h2>我来讲一遍</h2></div><button data-metrics-action="close" type="button" aria-label="关闭">×</button></header>
      <section class="feynman-explanation-form">
        <p><strong>${escapeHtml(question?.title || topic || "当前知识点")}</strong></p>
        <label><span>不用原题语言，讲清研究对象、发生过程、关键规律和适用条件</span><textarea id="feynmanExplanation" rows="6" maxlength="12000" placeholder="例如：我先研究滑块，把斜面和地球作为环境……"></textarea></label>
        <label><span>研究对象与系统边界</span><textarea id="feynmanObject" rows="2" maxlength="2000" placeholder="明确研究谁、哪些物体属于环境"></textarea></label>
        <label><span>规律与适用条件</span><textarea id="feynmanConditions" rows="2" maxlength="4000" placeholder="写出规律成立条件，再核对本题是否满足"></textarea></label>
        <label><span>举一个生活或实验中的类比（可选）</span><textarea id="feynmanAnalogy" rows="3" maxlength="6000"></textarea></label>
        <label><span>如果改变一个条件，结果会怎样（可选）</span><textarea id="feynmanPrediction" rows="3" maxlength="6000"></textarea></label>
        <label><span>预测依据</span><textarea id="feynmanPredictionReason" rows="2" maxlength="6000" placeholder="用关系式、图像或过程说明为什么"></textarea></label>
        <label><span>还有哪里讲不清（可选）</span><textarea id="feynmanUnclear" rows="2" maxlength="6000"></textarea></label>
        <p class="metrics-boundary">这条记录用于反思和后续建议，不会仅因写了说明就自动判定掌握。</p>
        <button class="primary" data-metrics-action="save-feynman" type="button">保存我的讲解</button>
      </section>`;
    if (!metricsDialog.open) metricsDialog.showModal();
    requestAnimationFrame(() => metricsDialog.querySelector("#feynmanExplanation")?.focus());
  }

  function handleShellInput(event) {
    if (["studentPracticeSearch", "studentLibrarySearch", "studentMethodSearch"].includes(event.target.id)) {
      ui.search = event.target.value;
      ui.libraryPage = 1;
      const inputId = event.target.id;
      scheduleStudentViewRender({ focusInputId: inputId, preserveScroll: true });
    }
  }

  function handleShellChange(event) {
    if (event.target.id === "studentPracticeGrade") {
      ui.practiceGrade = event.target.value;
      renderStudentViewOnly();
    } else if (event.target.id === "studentLibraryGrade") {
      ui.libraryGrade = event.target.value;
      ui.libraryDifficulty = "全部";
      ui.libraryTopic = "全部";
      ui.libraryQuestionType = "全部";
      ui.curriculumTarget = null;
      ui.libraryPage = 1;
      renderStudentViewOnly();
    } else if (event.target.id === "studentLibraryDifficulty") {
      ui.libraryDifficulty = event.target.value;
      ui.libraryPage = 1;
      renderStudentViewOnly();
    } else if (event.target.id === "studentLibraryTopic") {
      ui.libraryTopic = event.target.value;
      ui.libraryPage = 1;
      renderStudentViewOnly();
    } else if (event.target.id === "studentLibraryQuestionType") {
      ui.libraryQuestionType = event.target.value;
      ui.libraryPage = 1;
      renderStudentViewOnly();
    } else if (event.target.id === "studentMethodGrade") {
      ui.methodGrade = event.target.value;
      renderStudentViewOnly();
    } else if (event.target.id === "studentCurriculumBook") {
      ui.curriculumBookId = event.target.value;
      ui.curriculumChapterId = "";
      renderStudentViewOnly();
    }
  }

  function openOfficialCurriculumLink(value) {
    try {
      const url = new URL(String(value || ""));
      const allowedHost = url.hostname === "pep.com.cn" || url.hostname.endsWith(".pep.com.cn");
      if (url.protocol !== "https:" || !allowedHost) {
        window.alert("该链接不在已允许的人民教育出版社域名内，已阻止打开。");
        return;
      }
      if (!window.confirm("即将离开应用，打开人民教育出版社页面核对教材目录。是否继续？")) return;
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      window.alert("教材目录链接格式无效，已阻止打开。");
    }
  }

  function openMethodPlayer(questionId) {
    const question = (app?.getQuestions?.() || []).find((item) => item.id === questionId);
    if (!isCompleteStudentQuestion(question)) {
      window.alert("该题缺少可播放的完整解析。");
      return;
    }
    stopMethodPlayback();
    ui.methodPlayer = {
      questionId,
      index: 0,
      playing: false,
      timer: null
    };
    renderMethodPlayer();
    if (!methodDialog.open) methodDialog.showModal();
    recordEvent("method-walkthrough-opened", {
      questionId,
      actualVideo: hasQuestionVideo(question)
    });
  }

  function renderMethodPlayer() {
    const player = ui.methodPlayer;
    const content = methodDialog?.querySelector("#studentMethodContent");
    if (!content || !player) return;
    const question = (app?.getQuestions?.() || []).find((item) => item.id === player.questionId);
    if (!question) {
      content.innerHTML = '<p class="method-player-error">题目不存在或已被移除。</p>';
      return;
    }
    const steps = buildMethodSteps(question);
    player.index = Math.min(Math.max(0, player.index), steps.length - 1);
    const current = steps[player.index];
    const percent = Math.round((player.index + 1) / steps.length * 100);
    content.innerHTML = `
      <header class="method-player-head">
        <div><span>${hasQuestionVideo(question) ? "已关联视频 + 动态方法" : "动态方法讲解"}</span><h2>${escapeHtml(question.title)}</h2><p>${escapeHtml(question.topic)} · ${(question.examPoints || []).map(escapeHtml).join(" / ")}</p></div>
        <button data-method-action="close" type="button" aria-label="关闭">×</button>
      </header>
      <div class="method-player-boundary">
        ${hasQuestionVideo(question)
          ? '<strong>该题有真实视频附件，可通过“打开题目视频”播放；下方同步提供基于题目解析的逐步讲解。</strong>'
          : '<strong>这是基于题目现有分步解析的交互式讲解，不是真人录制视频。</strong>'}
      </div>
      <section class="method-player-stage" aria-live="polite">
        <div class="method-player-progress"><span>第 ${player.index + 1} / ${steps.length} 步</span><strong>${percent}%</strong><i><b style="width:${percent}%"></b></i></div>
        <article>
          <span>${escapeHtml(current.title)}</span>
          <p>${escapeHtml(current.text)}</p>
        </article>
        <div class="method-player-controls">
          <button data-method-action="previous" type="button"${player.index <= 0 ? " disabled" : ""}>上一步</button>
          <button class="primary" data-method-action="toggle" type="button">${player.playing ? "暂停播放" : "自动播放"}</button>
          <button data-method-action="next" type="button"${player.index >= steps.length - 1 ? " disabled" : ""}>下一步</button>
        </div>
      </section>
      <ol class="method-step-index">
        ${steps.map((step, index) => `<li class="${index === player.index ? "active" : index < player.index ? "complete" : ""}"><button data-method-step="${index}" type="button"><i>${index + 1}</i><span>${escapeHtml(step.title)}</span></button></li>`).join("")}
      </ol>
      <footer class="method-player-actions">
        <button data-method-action="start" type="button">进入独立作答</button>
        <button data-method-action="detail" type="button">查看完整详细解析</button>
        ${hasQuestionVideo(question) ? '<button class="primary" data-method-action="video" type="button">打开题目视频</button>' : ""}
      </footer>`;
  }

  function handleMethodDialogClick(event) {
    const step = event.target.closest("[data-method-step]");
    if (step && ui.methodPlayer) {
      ui.methodPlayer.index = Number(step.dataset.methodStep) || 0;
      renderMethodPlayer();
      return;
    }
    const action = event.target.closest("[data-method-action]")?.dataset.methodAction;
    if (!action || !ui.methodPlayer) return;
    const questionId = ui.methodPlayer.questionId;
    const question = (app?.getQuestions?.() || []).find((item) => item.id === questionId);
    const steps = question ? buildMethodSteps(question) : [];
    if (action === "close") {
      methodDialog.close();
    } else if (action === "previous") {
      ui.methodPlayer.index = Math.max(0, ui.methodPlayer.index - 1);
      renderMethodPlayer();
    } else if (action === "next") {
      ui.methodPlayer.index = Math.min(steps.length - 1, ui.methodPlayer.index + 1);
      renderMethodPlayer();
    } else if (action === "toggle") {
      toggleMethodPlayback();
    } else if (action === "start") {
      methodDialog.close();
      startQuestion(questionId, "method-walkthrough");
    } else if (action === "detail" || action === "video") {
      app?.openQuestion?.(questionId);
    }
  }

  function toggleMethodPlayback() {
    if (!ui.methodPlayer) return;
    if (ui.methodPlayer.playing) {
      stopMethodPlayback(false);
      renderMethodPlayer();
      return;
    }
    ui.methodPlayer.playing = true;
    renderMethodPlayer();
    ui.methodPlayer.timer = window.setInterval(() => {
      if (!ui.methodPlayer) return;
      const question = (app?.getQuestions?.() || []).find((item) => item.id === ui.methodPlayer.questionId);
      const maximum = Math.max(0, buildMethodSteps(question || {}).length - 1);
      if (ui.methodPlayer.index >= maximum) {
        stopMethodPlayback(false);
        renderMethodPlayer();
        return;
      }
      ui.methodPlayer.index += 1;
      renderMethodPlayer();
    }, 3500);
  }

  function stopMethodPlayback(reset = true) {
    if (ui.methodPlayer?.timer) window.clearInterval(ui.methodPlayer.timer);
    if (ui.methodPlayer) {
      ui.methodPlayer.timer = null;
      ui.methodPlayer.playing = false;
    }
    if (reset && !methodDialog?.open) ui.methodPlayer = null;
  }

  function startQuestion(questionId, source) {
    if (!questionId) return;
    if (!ui.firstQuestionStarted) {
      ui.firstQuestionStarted = true;
      recordEvent("first-question-started", {
        source,
        latencySeconds: Math.max(0, Math.round((Date.now() - ui.openedAt) / 1000))
      });
    } else {
      recordEvent("question-started", { source, questionId });
    }
    document.dispatchEvent(new CustomEvent("physics-studio-start-learning", {
      detail: { questionId }
    }));
  }

  function openLab(tab, questionId = "", diagnosticId = "") {
    document.dispatchEvent(new CustomEvent("physics-studio-open-lab", {
      detail: { tab, questionId, diagnosticId }
    }));
  }

  function qrMultiply(left, right) {
    let a = left;
    let b = right;
    let result = 0;
    while (b > 0) {
      if (b & 1) result ^= a;
      b >>>= 1;
      a <<= 1;
      if (a & 0x100) a ^= 0x11d;
    }
    return result & 0xff;
  }

  function qrPower(exponent) {
    let value = 1;
    for (let index = 0; index < exponent; index += 1) value = qrMultiply(value, 2);
    return value;
  }

  function qrGeneratorPolynomial(degree) {
    let polynomial = [1];
    for (let exponent = 0; exponent < degree; exponent += 1) {
      const next = new Array(polynomial.length + 1).fill(0);
      polynomial.forEach((coefficient, index) => {
        next[index] ^= coefficient;
        next[index + 1] ^= qrMultiply(coefficient, qrPower(exponent));
      });
      polynomial = next;
    }
    return polynomial;
  }

  function qrErrorCorrection(data, degree) {
    const generator = qrGeneratorPolynomial(degree);
    const message = [...data, ...new Array(degree).fill(0)];
    for (let offset = 0; offset < data.length; offset += 1) {
      const factor = message[offset];
      if (!factor) continue;
      generator.forEach((coefficient, index) => {
        message[offset + index] ^= qrMultiply(coefficient, factor);
      });
    }
    return message.slice(-degree);
  }

  function qrAppendBits(target, value, length) {
    for (let bit = length - 1; bit >= 0; bit -= 1) target.push(Boolean((value >>> bit) & 1));
  }

  function qrBchDigit(value) {
    let digit = 0;
    let current = value;
    while (current !== 0) {
      digit += 1;
      current >>>= 1;
    }
    return digit;
  }

  function qrFormatBits(maskPattern) {
    const formatData = (1 << 3) | maskPattern; // Error correction level L.
    let remainder = formatData << 10;
    const generator = 0x537;
    while (qrBchDigit(remainder) - qrBchDigit(generator) >= 0) {
      remainder ^= generator << (qrBchDigit(remainder) - qrBchDigit(generator));
    }
    return ((formatData << 10) | remainder) ^ 0x5412;
  }

  function buildInviteQrMatrix(payload) {
    const code = String(payload || "");
     // Version 5-L is needed for the full structured join URL (UUID + invite
     // code).  Keeping the payload intact makes QR scans independently
     // verifiable instead of encoding only a bare class name or code.
     if (!code || code.length > 108) throw new Error("二维码内容过长或为空。");
     const version = code.length <= 22 ? 2 : code.length <= 80 ? 4 : 5;
     const size = 17 + version * 4;
     const dataCodewordCount = version === 2 ? 34 : version === 4 ? 80 : 108;
     const correctionCodewordCount = version === 2 ? 10 : version === 4 ? 20 : 26;
    const bits = [];
    qrAppendBits(bits, 0b0100, 4);
    qrAppendBits(bits, code.length, 8);
    for (let index = 0; index < code.length; index += 1) qrAppendBits(bits, code.charCodeAt(index), 8);
    const maximumBits = dataCodewordCount * 8;
    for (let index = 0; index < 4 && bits.length < maximumBits; index += 1) bits.push(false);
    while (bits.length % 8) bits.push(false);
    const data = [];
    for (let offset = 0; offset < bits.length; offset += 8) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | Number(bits[offset + bit]);
      data.push(value);
    }
    let pad = 0;
    while (data.length < dataCodewordCount) {
      data.push(pad % 2 === 0 ? 0xec : 0x11);
      pad += 1;
    }
    const codewords = [...data, ...qrErrorCorrection(data, correctionCodewordCount)];
    const dataBits = [];
    codewords.forEach((value) => qrAppendBits(dataBits, value, 8));
    const matrix = Array.from({ length: size }, () => new Array(size).fill(null));

    const setupFinder = (row, column) => {
      for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
          const targetRow = row + rowOffset;
          const targetColumn = column + columnOffset;
          if (targetRow < 0 || targetRow >= size || targetColumn < 0 || targetColumn >= size) continue;
          matrix[targetRow][targetColumn] = rowOffset >= 0 && rowOffset <= 6
            && columnOffset >= 0 && columnOffset <= 6
            && (rowOffset === 0 || rowOffset === 6 || columnOffset === 0 || columnOffset === 6
              || (rowOffset >= 2 && rowOffset <= 4 && columnOffset >= 2 && columnOffset <= 4));
        }
      }
    };
    setupFinder(0, 0);
    setupFinder(size - 7, 0);
    setupFinder(0, size - 7);

     const alignment = version === 2 ? 18 : version === 4 ? 26 : 30;
    [6, alignment].forEach((row) => [6, alignment].forEach((column) => {
      if (matrix[row][column] !== null) return;
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
          matrix[row + rowOffset][column + columnOffset] = Math.abs(rowOffset) === 2
            || Math.abs(columnOffset) === 2
            || (rowOffset === 0 && columnOffset === 0);
        }
      }
    }));

    for (let index = 8; index < size - 8; index += 1) {
      if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0;
      if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0;
    }

    const setFormatInfo = (value) => {
      for (let index = 0; index < 15; index += 1) {
        const dark = Boolean((value >>> index) & 1);
        if (index < 6) matrix[index][8] = dark;
        else if (index < 8) matrix[index + 1][8] = dark;
        else matrix[size - 15 + index][8] = dark;
        if (index < 8) matrix[8][size - index - 1] = dark;
        else if (index === 8) matrix[8][7] = dark;
        else matrix[8][15 - index - 1] = dark;
      }
      matrix[size - 8][8] = true;
    };
    setFormatInfo(0);

    let row = size - 1;
    let direction = -1;
    let bitIndex = 0;
    for (let rightColumn = size - 1; rightColumn > 0; rightColumn -= 2) {
      if (rightColumn === 6) rightColumn -= 1;
      while (true) {
        for (let offset = 0; offset < 2; offset += 1) {
          const column = rightColumn - offset;
          if (matrix[row][column] !== null) continue;
          let dark = bitIndex < dataBits.length ? dataBits[bitIndex] : false;
          if ((row + column) % 2 === 0) dark = !dark;
          matrix[row][column] = dark;
          bitIndex += 1;
        }
        row += direction;
        if (row >= 0 && row < size) continue;
        row -= direction;
        direction = -direction;
        break;
      }
    }
    setFormatInfo(qrFormatBits(0));
    return matrix;
  }

  function renderClassroomInviteQr(payload) {
    const canvas = classroomDialog?.querySelector("#classroomInviteQr");
    if (!canvas || !String(payload || "").trim()) return;
    const matrix = buildInviteQrMatrix(payload);
    const quietZone = 4;
    const moduleSize = 6;
    const pixelSize = (matrix.length + quietZone * 2) * moduleSize;
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pixelSize, pixelSize);
    context.fillStyle = "#111111";
    matrix.forEach((modules, row) => modules.forEach((dark, column) => {
      if (dark) context.fillRect((column + quietZone) * moduleSize, (row + quietZone) * moduleSize, moduleSize, moduleSize);
    }));
  }

  function invitePayloadFromQr(payload) {
    const value = String(payload || "").trim();
    try {
      const parsed = window.PhysicsStudioClassroom?.parseInvitePayload?.(value);
      return parsed?.serverUrl || parsed?.classId ? value : parsed?.code || "";
    } catch {
      // Invalid QR content is reported by the scan caller.
    }
    return "";
  }

  async function joinClassByInviteCode(rawPayload, displayName = "") {
    const client = window.PhysicsStudioClassroom;
    if (!client) throw new Error("班级客户端尚未加载。");
    const form = classroomDialog?.querySelector("#classroomStudentJoinForm, #classroomJoinForm");
    const serverInput = form?.querySelector('input[name="serverUrl"]');
    const configuredUrl = String(serverInput?.value || "").trim();
    if (configuredUrl && configuredUrl !== client.status().serverUrl) {
      client.configure({ serverUrl: configuredUrl });
    }
    const parsed = client.parseInvitePayload(rawPayload);
    const nextDisplayName = String(
      displayName
        || form?.querySelector('input[name="displayName"]')?.value
        || experience.displayName
        || "同学",
    ).trim().slice(0, 80) || "同学";
    experience.displayName = nextDisplayName;
    saveExperience();
    const joined = await client.joinInvite({ code: rawPayload, displayName: nextDisplayName });
    const response = await client.listClasses();
    ui.classroom.classes = Array.isArray(response?.items) ? response.items : [];
    ui.classroom.selectedClassId = joined?.classId && ui.classroom.classes.some((item) => item.id === joined.classId)
      ? joined.classId
      : ui.classroom.classes[0]?.id || "";
    if (ui.classroom.selectedClassId) {
      await loadStudentAssignments(ui.classroom.selectedClassId);
      await syncStudentLearningData(client, ui.classroom.selectedClassId);
    } else {
      ui.classroom.assignments = [];
      ui.classroom.assignmentSubmissions = {};
    }
    return joined;
  }

  async function imageSourceForClassroomQr(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function decodeClassroomInviteQr(file) {
    if (!(file instanceof Blob) || !String(file.type || "").toLowerCase().startsWith("image/")) {
      throw new Error("请选择二维码图片。");
    }
    if (file.size > 12 * 1024 * 1024) throw new Error("二维码图片不能超过 12 MB。");
    if (typeof window.jsQR !== "function") throw new Error("二维码识别模块未加载。");
    const source = await imageSourceForClassroomQr(file);
    try {
      const sourceWidth = source.width || source.naturalWidth;
      const sourceHeight = source.height || source.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error("二维码图片尺寸无效。");
      const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      const invitePayload = invitePayloadFromQr(decoded?.data);
      if (!invitePayload) throw new Error("图片中没有识别到有效的班级邀请码。");
      return invitePayload;
    } finally {
      if (typeof source.close === "function") source.close();
    }
  }

  function stopClassroomQrCamera() {
    if (classroomQrTimer) window.clearTimeout(classroomQrTimer);
    classroomQrTimer = 0;
    classroomQrStream?.getTracks?.().forEach((track) => track.stop());
    classroomQrStream = null;
    classroomDialog?.querySelector(".classroom-qr-camera-panel")?.remove();
  }

  async function startClassroomQrCamera() {
    stopClassroomQrCamera();
    if (!navigator.mediaDevices?.getUserMedia || typeof window.jsQR !== "function") {
      throw new Error("当前设备不支持摄像头二维码扫描，请拍照或选择二维码图片。");
    }
    classroomQrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    const panel = document.createElement("section");
    panel.className = "classroom-qr-camera-panel";
    panel.innerHTML = '<video autoplay muted playsinline aria-label="二维码摄像头预览"></video><canvas hidden></canvas><p>将二维码放入取景框内</p><button type="button" data-classroom-qr-camera-close>关闭扫描</button>';
    classroomDialog.querySelector("#classroomContent")?.append(panel);
    const video = panel.querySelector("video");
    const canvas = panel.querySelector("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    video.srcObject = classroomQrStream;
    const scan = async () => {
      if (!classroomQrStream || !video.videoWidth) {
        classroomQrTimer = window.setTimeout(scan, 120);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      const invitePayload = invitePayloadFromQr(decoded?.data);
      if (invitePayload) {
        stopClassroomQrCamera();
        await runClassroomAction(
          () => joinClassByInviteCode(invitePayload),
          "二维码已识别，已加入班级。",
          true,
        );
        return;
      }
      classroomQrTimer = window.setTimeout(scan, 120);
    };
    video.addEventListener("loadedmetadata", scan, { once: true });
    scan();
  }

  function openClassroom() {
    ui.classroom.message = "";
    ui.classroom.error = false;
    renderClassroom();
    if (!classroomDialog.open) classroomDialog.showModal();
    if (window.PhysicsStudioClassroom?.status?.().authenticated || window.PhysicsStudioClassroom?.status?.().ownerAuthenticated) refreshClassroomData(false);
  }

  function classroomRoleLabel(role) {
    return ({ student: "学生", teacher: "教师", parent: "家长", administrator: "管理员" })[role] || role || "未登录";
  }

  function renderClassroom() {
    const content = classroomDialog?.querySelector("#classroomContent");
    if (!content) return;
    const client = window.PhysicsStudioClassroom;
    if (!client) {
      content.innerHTML = `
        <header class="classroom-head"><div><span>班级连接</span><h2>班级与邀请码</h2></div><button data-classroom-action="close" type="button">×</button></header>
        <p class="classroom-boundary error">班级客户端模块未随应用加载。离线学习仍可使用，但不能显示在线班级。</p>`;
      return;
    }
    const status = client.status();
    const connectionMode = !status.serviceConfigured ? "本机离线（仅学习）"
      : status.hostedLocally ? "同网局域网服务（本机主机）"
      : /^https:\/\//i.test(status.serverUrl) ? "已配置 HTTPS 班级服务"
      : "同网局域网服务";
    const learningSync = ui.classroom.learningSyncOverride
      || client.syncStatus?.() || { label: "本机已保存", detail: "当前只写入本机学习记录。" };
    const selected = ui.classroom.classes.find((item) => item.id === ui.classroom.selectedClassId) || null;
    const disabled = ui.classroom.busy ? " disabled" : "";
    // The local experience role is the UI boundary. A previous teacher
    // session may still exist in sessionStorage on the same device, but it
    // must not make a student see teacher-only class management controls.
    const serverRole = status.authenticated ? status.user?.role : status.ownerAuthenticated ? "teacher" : "";
    const roleMatchesSession = experience.role === "student"
      ? serverRole === "student"
      : experience.role === "teacher"
        ? ["teacher", "administrator"].includes(serverRole)
        : false;
    const showAuthenticatedClassroom = Boolean((status.authenticated || status.ownerAuthenticated) && roleMatchesSession);
    content.innerHTML = `
      <header class="classroom-head">
         <div><span>班级连接与权限</span><h2>班级与邀请码</h2><p>当前模式：${escapeHtml(connectionMode)}。${status.authenticated ? `${escapeHtml(status.user.displayName)} · 服务端身份：${escapeHtml(classroomRoleLabel(status.user.role))}` : experience.role === "teacher" ? "班级创建以服务端确认为准；离线时仅保留本机学习数据" : "通过邀请码或二维码加入；离线时不会伪造加入状态"}</p><p class="classroom-sync-status" data-sync-state="${escapeHtml(learningSync.state)}">学习数据：${escapeHtml(learningSync.label)} · ${escapeHtml(learningSync.detail)}</p></div>
        <button data-classroom-action="close" type="button" aria-label="关闭">×</button>
      </header>
      ${ui.classroom.message ? `<p class="classroom-message ${ui.classroom.error ? "error" : ""}" role="status">${escapeHtml(ui.classroom.message)}</p>` : ""}
      ${showAuthenticatedClassroom ? renderAuthenticatedClassroom(status, selected, disabled, learningSync) : renderClassroomLogin(status, disabled)}
      <p class="classroom-boundary">${escapeHtml(status.boundary)} 学生只能通过有效邀请码加入并获得 student 权限；教师 owner 能力仅限自己创建的班级。</p>`;
    if (ui.classroom.lastInvite?.code) renderClassroomInviteQr(ui.classroom.lastInvite.joinUrl || ui.classroom.lastInvite.code);
  }

  function renderAuthenticatedClassroom(status, selected, disabled, learningSync) {
    const role = status.user.role;
    return `
      <section class="classroom-session-bar">
        <div><strong>${escapeHtml(status.user.displayName)}</strong><span>${escapeHtml(classroomRoleLabel(role))}账号 · ${escapeHtml(status.serverUrl)}</span><small>每 60 秒及恢复联网时自动刷新班级成员；学习数据状态：${escapeHtml(learningSync.label)}。</small></div>
        <div><button data-classroom-action="refresh" type="button"${disabled}>刷新</button><button data-classroom-action="logout" type="button"${disabled}>退出登录</button></div>
      </section>
      ${role === "teacher" || role === "administrator" ? renderTeacherClassroom(selected, disabled) : ""}
      ${role === "student" ? renderStudentClassroom(disabled) : ""}
      ${role === "parent" ? '<section class="classroom-empty"><strong>家长账号不直接加入班级</strong><p>当前接口没有授权家长查看班级成员；请继续使用本机家长摘要。</p></section>' : ""}`;
  }

  function classroomQuestionCatalog() {
    return (window.PhysicsStudioApp?.getQuestions?.() || []).filter(isCompleteStudentQuestion);
  }

  function classroomQuestionItems(ids) {
    const byId = new Map(classroomQuestionCatalog().map((question) => [question.id, question]));
    return ids.map((id) => byId.get(id)).filter(Boolean).map((question) => ({
      id: question.id,
      title: String(question.title || question.id),
      content: String(question.content || ""),
      questionType: String(question.questionType || "未标注"),
      options: (Array.isArray(question.options) ? question.options : []).map((option) =>
        typeof option === "string" ? option : String(option?.text || option?.label || "")).filter(Boolean),
      knowledgePointId: String(question.knowledgePointId || ""),
      difficulty: String(question.difficulty || ""),
      ...(/^(单项选择题|单选题)$/.test(question.questionType || "") && /^[A-D]$/i.test(String(question.answer || "").trim())
        ? { correctAnswer: String(question.answer).trim().toUpperCase() } : {})
    }));
  }

  function renderClassroomQuestionPicker() {
    const filter = ui.classroom.picker;
    const chosen = new Set(ui.classroom.selectedQuestionIds);
    const search = filter.search.trim().toLocaleLowerCase("zh-CN");
    const matched = classroomQuestionCatalog().filter((question) =>
      (filter.grade === "全部" || question.grade === filter.grade)
      && (filter.type === "全部" || questionTypeGroup(question) === filter.type)
      && (filter.difficulty === "全部" || question.difficulty === filter.difficulty)
      && (!search || [question.id, question.title, question.topic, question.curriculumChapter,
        question.curriculumBook, question.knowledgePointId].some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(search))));
    return `<div class="classroom-picker-summary">已选 ${chosen.size} 题 · 匹配 ${matched.length} 题（最多显示前 24 题）</div>
      ${matched.slice(0, 24).map((question) => `<label class="classroom-question-choice"><input type="checkbox" data-classroom-question="${escapeHtml(question.id)}"${chosen.has(question.id) ? " checked" : ""}><span><strong>${escapeHtml(question.title)}</strong><small>${escapeHtml(question.grade)} · ${escapeHtml(question.topic)} · ${escapeHtml(question.questionType)} · ${escapeHtml(question.difficulty)}</small></span></label>`).join("") || "<p>没有匹配的完整题目，请调整筛选条件。</p>"}`;
  }

  function renderTeacherClassroom(selected, disabled) {
    return `
      <div class="classroom-layout">
        <section class="classroom-sidebar">
          <form id="classroomCreateClassForm" class="classroom-compact-form">
            <h3>新建物理班级</h3>
            <label><span>班级名称</span><input name="name" required maxlength="120" placeholder="例如：高三物理一班"></label>
            <small>创建后可直接进入班级；年级和学校信息可在管理中补充。</small>
            <button type="submit"${disabled}>${ui.classroom.busy ? "正在创建…" : "创建班级"}</button>
          </form>
          <div class="classroom-list">
            <header><h3>我的班级</h3><strong>${ui.classroom.classes.length}</strong></header>
            ${ui.classroom.classes.map((item) => `<button class="${item.id === ui.classroom.selectedClassId ? "active" : ""}" data-classroom-select="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.grade)} · ${escapeHtml(item.status)}</span></button>`).join("") || "<p>尚未创建班级。</p>"}
          </div>
        </section>
        <section class="classroom-detail">
          ${selected ? renderSelectedClass(selected, disabled) : '<div class="classroom-empty"><strong>选择一个班级</strong><p>可生成邀请码、创建分组并审核学生加入。</p></div>'}
        </section>
      </div>`;
  }

  function renderSelectedClass(selected, disabled) {
    const invite = ui.classroom.lastInvite?.classId === selected.id ? ui.classroom.lastInvite : null;
    const activeStudents = ui.classroom.roster.filter((member) => member.status === "active");
    const published = ui.classroom.assignments.filter((assignment) => assignment.status === "published");
    const pending = ui.classroom.reviewCases.length;
    const unsubmitted = published.reduce((count, assignment) => {
      const recipients = activeStudents.filter((member) => assignment.targetType === "class"
        || assignment.targetType === "student" && assignment.targetId === member.id
        || assignment.targetType === "group" && assignment.targetId === member.groupId);
      return count + recipients.filter((member) => !ui.classroom.classSubmissions.some((submission) =>
        submission.assignmentId === assignment.id && submission.studentUserId === member.userId)).length;
    }, 0);
    return `
      <header class="classroom-class-head"><div><span>${escapeHtml(selected.grade)} · ${escapeHtml(selected.subject)}</span><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.schoolLabel || "未填写学校")}</p></div><strong>${escapeHtml(selected.status)}</strong></header>
      <div class="classroom-class-meta"><span>班级 ID：${escapeHtml(selected.id)}</span><span>当前学生：${activeStudents.length} 人</span><button class="danger" data-classroom-action="delete-class" type="button"${disabled}>删除班级</button></div>
      <section class="classroom-workbench"><h3>教学工作台</h3><p>以下数据来自当前班级服务；离线时为上次成功同步的快照。</p>
        <div><a href="#classroom-roster">学生 ${activeStudents.length} 人</a><a href="#classroom-assignment-form">进行中作业 ${published.length} 份</a><a href="#classroom-review-cases">待批改 ${pending} 份</a><a href="#classroom-assignment-status">未提交 ${unsubmitted} 人次</a></div>
        <nav aria-label="教学快捷操作"><a href="#classroom-assignment-form">布置作业</a><a href="#classroom-roster">管理班级</a><a href="#classroom-learning-summary">查看学情</a></nav>
      </section>
      <div class="classroom-action-grid">
        <form id="classroomInviteForm" class="classroom-compact-form">
          <h3>邀请学生加入</h3>
          <p>无需填写有效期或使用人数；点击后同时生成邀请码和二维码。</p>
          <button type="submit"${disabled}>生成邀请码与二维码</button>
           ${invite ? `<div class="classroom-invite-code"><span>本次生成后显示，请发送给本班学生</span><canvas id="classroomInviteQr" width="198" height="198" role="img" aria-label="班级邀请码二维码"></canvas><strong>${escapeHtml(invite.code)}</strong><small>安全有效期与防滥用上限由班级服务自动管理，教师无需填写。</small><div><button data-classroom-action="copy-invite" type="button">复制邀请码</button><button data-classroom-action="share-invite" type="button">分享邀请</button><button data-classroom-action="refresh-invite" type="button">刷新邀请码</button></div></div>` : ""}
        </form>
        <form id="classroomGroupForm" class="classroom-compact-form">
          <h3>新建分组</h3>
          <label><span>分组名称</span><input name="name" required maxlength="80" placeholder="例如：基础巩固组"></label>
          <button type="submit"${disabled}>添加分组</button>
          <div class="classroom-group-list">${ui.classroom.groups.map((group) => `<span>${escapeHtml(group.name)}</span>`).join("") || "<small>尚无分组。</small>"}</div>
        </form>
      </div>
      <section class="classroom-teaching-actions" id="classroom-assignment-form">
        <form id="classroomAssignmentForm" class="classroom-compact-form">
          <h3>从题库布置作业</h3>
          <p>选择完整题目后发布；学生会看到真实题干并逐题作答。未审核或只有题源的记录不参与选题。</p>
          <label><span>作业标题</span><input name="title" required maxlength="160" placeholder="例如：受力分析专项复测"></label>
          <label><span>作业说明</span><textarea name="instructions" rows="2" maxlength="30000" placeholder="说明完成顺序、迁移题或复测要求"></textarea></label>
          <label><span>截止时间（可选）</span><input name="dueAt" type="datetime-local"></label>
          <label><span>下发范围</span><select name="scope"><option value="class">全班</option>${ui.classroom.groups.map((group) => `<option value="group:${escapeHtml(group.id)}">小组：${escapeHtml(group.name)}</option>`).join("")}${ui.classroom.roster.filter((member) => member.status === "active").map((member) => `<option value="student:${escapeHtml(member.id)}">学生：${escapeHtml(member.displayName)}</option>`).join("")}</select></label>
          <fieldset class="classroom-question-picker"><legend>题库选题</legend>
            <div class="classroom-picker-filters">
              <label><span>搜索题名、章节或知识点</span><input data-classroom-picker="search" value="${escapeHtml(ui.classroom.picker.search)}" placeholder="输入关键词"></label>
              <label><span>年级</span><select data-classroom-picker="grade">${["全部", "八年级", "九年级", "高一", "高二", "高三"].map((value) => `<option${ui.classroom.picker.grade === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
              <label><span>题型</span><select data-classroom-picker="type">${["全部", "选择题", "填空题", "实验题", "计算与综合"].map((value) => `<option${ui.classroom.picker.type === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
              <label><span>难度</span><select data-classroom-picker="difficulty">${["全部", "基础", "进阶", "挑战"].map((value) => `<option${ui.classroom.picker.difficulty === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
            </div><div class="classroom-picker-results">${renderClassroomQuestionPicker()}</div>
          </fieldset>
          <label><span>预定达标条件</span><textarea name="target" rows="2" required maxlength="1000" placeholder="例如：3题中至少2题低提示独立正确，并完成1道经核验专项变式"></textarea></label>
          <label><span><input name="publish" type="checkbox" checked> 立即发布（取消勾选则保存服务端草稿）</span></label>
          <button type="submit"${disabled}>${ui.classroom.busy ? "正在处理…" : "保存作业"}</button>
        </form>
      </section>
      <section class="classroom-assignment-status" id="classroom-assignment-status"><header><h3>作业与提交</h3><strong>${published.length} 份已发布</strong></header>
        ${ui.classroom.assignments.map((assignment) => {
          const submissions = ui.classroom.classSubmissions.filter((item) => item.assignmentId === assignment.id);
          return `<article><strong>${escapeHtml(assignment.title)}</strong><span>${escapeHtml(assignment.status)} · ${assignment.questionIds.length} 题 · ${submissions.length} 次提交${assignment.dueAt ? ` · 截止 ${escapeHtml(new Date(assignment.dueAt).toLocaleString("zh-CN"))}` : ""}</span><small>${escapeHtml(assignment.target || "")}</small></article>`;
        }).join("") || "<p>尚无作业。可从上方题库选择题目。</p>"}
      </section>
      <section class="classroom-roster" id="classroom-roster">
        <header><div><span>逐级管理</span><h3>学生花名册</h3></div><strong>${ui.classroom.roster.length} 人</strong></header>
        ${ui.classroom.roster.map((member) => `
          <article>
            <div><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(member.studentNumber || "未填学号")} · ${member.status === "pending" ? "待审核" : member.status === "active" ? "已加入" : "已移出"}</span></div>
            <label><span>分组</span><select data-classroom-group-select="${escapeHtml(member.id)}"><option value="">未分组</option>${ui.classroom.groups.map((group) => `<option value="${escapeHtml(group.id)}"${group.id === member.groupId ? " selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select></label>
            <div>
              ${member.status === "pending" ? `<button data-classroom-member="${escapeHtml(member.id)}" data-classroom-status="active" type="button"${disabled}>批准加入</button>` : ""}
              ${member.status !== "removed" ? `<button data-classroom-assign="${escapeHtml(member.id)}" type="button"${disabled}>保存分组</button><button class="danger" data-classroom-member="${escapeHtml(member.id)}" data-classroom-status="removed" type="button"${disabled}>移出</button>` : ""}
            </div>
          </article>`).join("") || '<div class="classroom-empty"><strong>暂无学生</strong><p>生成邀请码后，学生提交加入申请；教师批准后才成为有效成员。</p></div>'}
      </section>
      <section class="classroom-learning-summary" id="classroom-learning-summary">
        <header><div><span>CLASS LEARNING EVIDENCE</span><h3>班级学情摘要</h3></div><strong>${ui.classroom.learningSummary.length} 名已同步学生</strong></header>
        <p>仅显示同步到服务端的证据摘要，不做学生排名；空值表示尚未同步或证据不足。</p>
        <div class="classroom-summary-grid">${ui.classroom.learningSummary.map((item) => `<article><strong>${escapeHtml(item.displayName)}</strong><span>正式作答 ${item.attemptCount || 0} 次 · 试卷 ${item.examCount || 0} 份</span><small>待人工复核 ${item.pendingReviewCount || 0} 项 · 最近证据 ${escapeHtml(item.lastEvidenceAt ? new Date(item.lastEvidenceAt).toLocaleString("zh-CN") : "无")}</small></article>`).join("") || "<p>当前班级没有可读取的学习摘要。</p>"}</div>
      </section>
      <section class="classroom-review-cases" id="classroom-review-cases">
        <header><div><span>TEACHER REVIEW</span><h3>待教师复核</h3></div><strong>${ui.classroom.reviewCases.length} 项</strong></header>
        <p>自动分析只提供待判断线索；提交复核决定后才会写入服务端审核状态。</p>
        ${ui.classroom.reviewCases.map((item) => `<form class="classroom-review-form" data-classroom-review-form="${escapeHtml(item.id)}">
          <div><strong>${escapeHtml(item.studentDisplayName || "学生作答")}</strong><span>作业 ${escapeHtml(ui.classroom.assignments.find((assignment) => assignment.id === item.assignmentId)?.title || item.assignmentId)} · 第 ${item.submissionVersion || 1} 次提交 · ${escapeHtml(new Date(item.submittedAt).toLocaleString("zh-CN"))}</span>
            ${(item.answers || []).map((answer) => `<div class="classroom-review-answer"><strong>题目 ${escapeHtml(answer.questionId)}</strong><p>回答：${escapeHtml(answer.response)}</p>${answer.steps ? `<p>过程：${escapeHtml(answer.steps)}</p>` : ""}<label><span>该题得分（0—100）</span><input name="questionScore:${escapeHtml(answer.questionId)}" type="number" min="0" max="100" step="0.5"></label></div>`).join("")}
            ${(item.previousAnswers || []).length ? `<details open><summary>查看上次作答</summary>${item.previousAnswers.map((answer) => `<p>${escapeHtml(answer.questionId)}：${escapeHtml(answer.response)}</p>`).join("")}</details>` : ""}
          </div>
          <label><span>决定</span><select name="decision"><option value="approve">通过</option><option value="return">退回订正</option><option value="rejudge">重新判定</option></select></label>
          <label><span>分数</span><input name="score" type="number" min="0" max="100" step="0.5" value="${item.currentScore == null ? "" : escapeHtml(item.currentScore)}" required></label>
          <label><span>教师理由与订正要求</span><textarea name="reason" maxlength="1000" required placeholder="指出错误位置、规律适用条件与下一步修改方法"></textarea></label>
          <button type="submit"${disabled}>提交复核</button>
        </form>`).join("") || "<p>当前没有待教师复核的提交。</p>"}
      </section>`;
  }

  function assignmentDraftKey(assignmentId) {
    const userId = window.PhysicsStudioClassroom?.status?.().user?.id || "local";
    return `physics-classroom-assignment-draft-v1:${userId}:${assignmentId}`;
  }

  function readAssignmentDraft(assignmentId) {
    try {
      return window.PhysicsStudioStorageRepository?.getJson?.(assignmentDraftKey(assignmentId), null) || { answers: {} };
    } catch (error) {
      ui.classroom.error = true;
      ui.classroom.message = `本机作业草稿无法读取：${error?.message || "存储错误"}`;
      return { answers: {} };
    }
  }

  function saveAssignmentDraftFromForm(form) {
    const assignmentId = form?.dataset?.classroomAssignmentAnswerForm;
    if (!assignmentId) return true;
    const previous = readAssignmentDraft(assignmentId);
    const answers = { ...previous.answers };
    form.querySelectorAll("[data-assignment-question]").forEach((field) => {
      const id = field.dataset.assignmentQuestion;
      const entry = answers[id] || { startedAt: new Date().toISOString() };
      entry[field.dataset.assignmentField] = field.value;
      answers[id] = entry;
    });
    try {
      window.PhysicsStudioStorageRepository?.setJson?.(assignmentDraftKey(assignmentId), {
        ...previous, answers, updatedAt: new Date().toISOString()
      });
    } catch (error) {
      ui.classroom.error = true;
      ui.classroom.message = `数据未保存：${error?.message || "本机空间不足"}`;
      const notice = classroomDialog.querySelector(".assignment-draft-status");
      if (notice) notice.textContent = ui.classroom.message;
      return false;
    }
    const notice = classroomDialog.querySelector(".assignment-draft-status");
    if (notice) notice.textContent = "草稿已保存在本机；尚未提交给教师。";
    return true;
  }

  function renderStudentAssignmentDetail(assignment, disabled) {
    const history = ui.classroom.assignmentSubmissions[assignment.id] || [];
    const latest = history[history.length - 1] || null;
    const draft = readAssignmentDraft(assignment.id);
    const local = new Map(classroomQuestionCatalog().map((question) => [question.id, question]));
    const snapshots = Array.isArray(assignment.questionItems) ? assignment.questionItems : [];
    const snapshotMap = new Map(snapshots.map((item) => [item.id, item]));
    const questions = (assignment.questionIds || []).map((id) => snapshotMap.get(id) || local.get(id)).filter(Boolean);
    const missing = questions.length !== assignment.questionIds?.length || !questions.length;
    const canCorrect = !latest || latest.status === "returned";
    const queued = Boolean(draft.queued && !latest);
    const priorAnswers = new Map((latest?.answers || []).map((answer) => [answer.questionId, answer]));
    return `<section class="student-assignment-detail">
      <button data-classroom-action="assignment-back" type="button">← 返回任务列表</button>
      <h3>${escapeHtml(assignment.title)}</h3>
      <p>${escapeHtml(assignment.instructions || "完成后提交给教师；完整答案须待教师反馈后再核对。")}</p>
      <p>当前状态：${queued ? "本机已保存，等待服务端确认" : latest ? latest.status === "returned" ? "教师退回，待订正" : latest.status === "accepted" ? "已反馈" : "已提交，待教师批改" : "未开始或本机草稿"} · ${assignment.dueAt ? `截止 ${escapeHtml(new Date(assignment.dueAt).toLocaleString("zh-CN"))}` : "无截止时间"}</p>
      ${history.length ? `<details><summary>提交与订正历史（${history.length} 次）</summary>${history.map((item) => `<article class="assignment-history"><strong>第 ${item.version || 1} 次 · ${escapeHtml(item.status)} · ${escapeHtml(new Date(item.submittedAt).toLocaleString("zh-CN"))}</strong>${(item.answers || []).map((answer) => `<p>${escapeHtml(answer.questionId)}：${escapeHtml(answer.response)}</p>`).join("")}<p>教师反馈：${escapeHtml(item.feedback || (item.reviewStatus === "pending" ? "待人工批改" : "暂无"))}${item.score == null ? "" : ` · ${escapeHtml(item.score)} 分`}</p></article>`).join("")}</details>` : ""}
      ${missing ? '<p class="classroom-message error">该旧作业缺少可读取的题目正文；请教师从题库重新发布。不能用空内容提交。</p>' : ""}
      ${canCorrect && !queued && !missing ? `<form data-classroom-assignment-answer-form="${escapeHtml(assignment.id)}" class="classroom-assignment-answer-form">
        ${questions.map((question, index) => {
          const old = priorAnswers.get(question.id);
          const saved = draft.answers?.[question.id] || {};
          return `<article><h4>${index + 1}. ${escapeHtml(question.title || question.id)}</h4><p>${escapeHtml(question.content || "")}</p>
            ${(question.options || []).map((option) => `<p class="assignment-option">${escapeHtml(typeof option === "string" ? option : option?.text || "")}</p>`).join("")}
            ${old ? `<small>上次回答：${escapeHtml(old.response || "")}</small>` : ""}
            <label><span>我的答案</span><textarea data-assignment-question="${escapeHtml(question.id)}" data-assignment-field="response" rows="3" maxlength="30000" required>${escapeHtml(saved.response ?? old?.response ?? "")}</textarea></label>
            <label><span>推理过程或实验记录</span><textarea data-assignment-question="${escapeHtml(question.id)}" data-assignment-field="steps" rows="3" maxlength="30000">${escapeHtml(saved.steps ?? old?.steps ?? "")}</textarea></label>
          </article>`;
        }).join("")}
        <p class="assignment-draft-status">草稿仅保存在本机，点击提交后才发送给教师。</p>
        <button type="submit"${disabled}>${latest?.status === "returned" ? "提交订正版本" : "提交逐题作答"}</button>
      </form>` : queued ? '<p>提交事件正在等待网络恢复；请勿重复提交。若同步失败，草稿仍保留在本机。</p>' : ""}
    </section>`;
  }

  function renderStudentClassroom(disabled) {
    return `
      <section class="student-classroom-panel">
        <form id="classroomStudentNameForm" class="classroom-compact-form">
          <label><span>班级内备注名</span><input name="displayName" maxlength="80" value="${escapeHtml(window.PhysicsStudioClassroom?.status?.().user?.displayName || experience.displayName || "同学")}" autocomplete="nickname"></label>
          <button type="submit"${disabled}>保存备注名</button>
        </form>
        <form id="classroomJoinForm" class="classroom-compact-form">
          <span>邀请码加入</span><h3>通过老师的邀请码加入班级</h3>
          <label><span>22 位邀请码</span><input name="code" data-classroom-join-code required minlength="22" maxlength="22" autocomplete="off" placeholder="输入老师提供的邀请码"></label>
          <label class="classroom-qr-scan"><span>扫描老师的二维码</span><input id="classroomInviteQrInput" type="file" accept="image/*" capture="environment"><small class="classroom-qr-status">可拍照或选择二维码图片，识别结果只用于填写邀请码。</small></label>
          <button type="submit"${disabled}>申请加入</button>
          <button type="button" data-classroom-qr-camera${disabled}>打开摄像头扫描</button>
          <p>邀请码由服务端验证；加入成功后立即显示班级，断网时不会伪造加入状态。</p>
        </form>
        <div class="classroom-list student">
          <header><h3>已加入班级</h3><strong>${ui.classroom.classes.length}</strong></header>
          ${ui.classroom.classes.map((item) => `<article><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.grade)} · ${escapeHtml(item.subject)} · ${escapeHtml(item.status)}</span></article>`).join("") || '<p>当前账号还没有已激活班级。</p>'}
        </div>
        <section class="student-assignment-list">
          <header><div><span>教师下发的真实题组</span><h3>我的作业</h3></div><strong>${ui.classroom.assignments.length}</strong></header>
          ${ui.classroom.assignments.map((assignment) => {
            const history = ui.classroom.assignmentSubmissions[assignment.id] || [];
            const latest = history[history.length - 1] || null;
            return `<article>
              <div><strong>${escapeHtml(assignment.title)}</strong><span>${escapeHtml(assignment.target || "按教师确认条件完成")} · ${assignment.dueAt ? escapeHtml(new Date(assignment.dueAt).toLocaleString("zh-CN")) : "无截止时间"}</span><small>${escapeHtml(assignment.instructions || "")}</small></div>
              <button data-classroom-open-assignment="${escapeHtml(assignment.id)}" type="button"${disabled}>${latest?.status === "returned" ? "查看反馈并订正" : latest ? "查看提交与反馈" : "开始作答"}</button>
            </article>`;
          }).join("") || '<p class="classroom-empty">当前没有已下发的专项方案。</p>'}
        </section>
        ${ui.classroom.activeAssignmentId ? (() => {
          const assignment = ui.classroom.assignments.find((item) => item.id === ui.classroom.activeAssignmentId);
          return assignment ? renderStudentAssignmentDetail(assignment, disabled) : "";
        })() : ""}
      </section>`;
  }

  async function refreshClassroomData(showMessage = true) {
    const client = window.PhysicsStudioClassroom;
    if (!client?.status?.().authenticated && !client?.status?.().ownerAuthenticated) return;
    await runClassroomAction(async () => {
      const response = await client.listClasses();
      ui.classroom.classes = Array.isArray(response?.items) ? response.items : [];
      if (!ui.classroom.classes.some((item) => item.id === ui.classroom.selectedClassId)) {
        ui.classroom.selectedClassId = ui.classroom.classes[0]?.id || "";
      }
      const role = client.status().user?.role;
      if ((role === "teacher" || role === "administrator") && ui.classroom.selectedClassId) {
        await loadClassroomDetail(ui.classroom.selectedClassId);
      } else if (role === "student" && ui.classroom.selectedClassId) {
        await loadStudentAssignments(ui.classroom.selectedClassId);
        await syncStudentLearningData(client, ui.classroom.selectedClassId);
      } else {
        ui.classroom.roster = [];
        ui.classroom.groups = [];
        ui.classroom.learningSummary = [];
        ui.classroom.reviewCases = [];
        ui.classroom.assignments = [];
        ui.classroom.assignmentSubmissions = {};
      }
    }, showMessage ? "班级数据已刷新。" : "", false);
  }

  async function syncClassroomSilently() {
    const client = window.PhysicsStudioClassroom;
    if (ui.classroom.busy || (!client?.status?.().authenticated && !client?.status?.().ownerAuthenticated) || navigator.onLine === false) return;
    ui.classroom.busy = true;
    try {
      const response = await client.listClasses();
      ui.classroom.classes = Array.isArray(response?.items) ? response.items : [];
      if (!ui.classroom.classes.some((item) => item.id === ui.classroom.selectedClassId)) {
        ui.classroom.selectedClassId = ui.classroom.classes[0]?.id || "";
      }
      const role = client.status().user?.role;
      if ((role === "teacher" || role === "administrator") && ui.classroom.selectedClassId) {
        await loadClassroomDetail(ui.classroom.selectedClassId);
      } else if (role === "student" && ui.classroom.selectedClassId) {
        await loadStudentAssignments(ui.classroom.selectedClassId);
        await syncStudentLearningData(client, ui.classroom.selectedClassId);
      }
      ui.classroom.error = false;
      ui.classroom.message = "班级状态已自动同步。";
    } catch (error) {
      if (classroomDialog?.open) {
        ui.classroom.error = true;
        ui.classroom.message = error?.message || "班级自动同步失败；离线学习不受影响。";
      }
    } finally {
      ui.classroom.busy = false;
      if (classroomDialog?.open) renderClassroom();
    }
  }

  async function loadClassroomDetail(classId) {
    const client = window.PhysicsStudioClassroom;
    const optionalClassCall = (call, label) => Promise.resolve()
      .then(call)
      .catch((error) => {
        console.warn(`${label}读取失败；保留已有班级功能。`, error);
        return { items: [] };
      });
    const [roster, groups, summary, reviews, assignments, submissions] = await Promise.all([
      client.listRoster(classId),
      client.listGroups(classId),
      typeof client.getClassLearningSummary === "function"
        ? optionalClassCall(() => client.getClassLearningSummary(classId), "班级学情摘要")
        : Promise.resolve({ items: [] }),
      typeof client.listReviewCases === "function"
        ? optionalClassCall(() => client.listReviewCases(classId), "教师复核队列")
        : Promise.resolve({ items: [] }),
      client.listAssignments ? optionalClassCall(() => client.listAssignments(classId), "班级作业") : Promise.resolve({ items: [] }),
      client.listClassSubmissions ? optionalClassCall(() => client.listClassSubmissions(classId), "作业提交") : Promise.resolve({ items: [] })
    ]);
    ui.classroom.roster = Array.isArray(roster?.items) ? roster.items : [];
    ui.classroom.groups = Array.isArray(groups?.items) ? groups.items : [];
    ui.classroom.learningSummary = Array.isArray(summary?.items) ? summary.items : [];
    ui.classroom.reviewCases = Array.isArray(reviews?.items) ? reviews.items : [];
    ui.classroom.assignments = Array.isArray(assignments?.items) ? assignments.items : [];
    ui.classroom.classSubmissions = Array.isArray(submissions?.items) ? submissions.items : [];
  }

  async function loadStudentAssignments(classId) {
    const client = window.PhysicsStudioClassroom;
    if (!client?.listAssignments || !classId) return;
    const [response, variantResponse, submissionResponse] = await Promise.all([
      client.listAssignments(classId),
      client.listVariantSets ? client.listVariantSets(classId).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      client.listOwnClassSubmissions ? client.listOwnClassSubmissions(classId).catch(() => ({ items: [] })) : Promise.resolve({ items: [] })
    ]);
    ui.classroom.assignments = Array.isArray(response?.items) ? response.items : [];
    const ownSubmissions = Array.isArray(submissionResponse?.items) ? submissionResponse.items : [];
    ui.classroom.assignmentSubmissions = Object.fromEntries(ui.classroom.assignments.map((assignment) => [
      assignment.id,
      ownSubmissions.filter((item) => item.assignmentId === assignment.id).sort((left, right) =>
        Number(left.version || 0) - Number(right.version || 0))
    ]));
    if (engine?.saveVariantSet && Array.isArray(variantResponse?.items) && variantResponse.items.length) {
      const state = engine.loadState();
      variantResponse.items.forEach((remote) => {
        engine.saveVariantSet(state, {
          id: remote.clientEntityId,
          cacheKey: remote.cacheKey,
          parentQuestionId: remote.parentQuestionId,
          sourceContentHash: remote.sourceContentHash,
          specVersion: remote.specVersion,
          generatorVersion: remote.generatorVersion,
          variants: remote.variants,
          generationMode: "classroom-approved-sync",
          status: "approved",
          approvalStatus: "teacher-approved",
          reviewRequired: false,
          stale: false,
          updatedAt: remote.updatedAt,
          createdAt: remote.updatedAt
        });
      });
      engine.saveState(state);
    }
  }

  async function publishConfirmedAssignment(assignment) {
    if (!assignment?.questionIds?.length || experience.role !== "teacher") return;
    const client = window.PhysicsStudioClassroom;
    const classId = ui.classroom.selectedClassId;
    if (!client?.createAssignment || !classId) {
      ui.classroom.message = "作业已保存在本机待发布；请先进入班级并选择目标班级。";
      ui.classroom.error = false;
      return;
    }
    try {
      const state = engine?.loadState?.();
      const selectedSets = (state?.variantSets || []).filter((set) => (assignment.variantSetIds || []).includes(set.id)
        && set.status === "approved" && set.stale !== true);
      if (selectedSets.length && client.syncVariantSets) {
        await client.syncVariantSets(classId, { sets: selectedSets });
      }
      const response = await client.createAssignment(classId, {
        title: assignment.title,
        instructions: `母题 ${assignment.parentQuestionIds?.length || assignment.questionCount} 道；完整变式 ${assignment.variantQuestionIds?.length || 0} 道。答案与完整解析须在学生提交后显示。`,
        targetType: "class",
        targetId: null,
        questionIds: assignment.questionIds,
        questionItems: classroomQuestionItems(assignment.questionIds),
        knowledgePointKeys: assignment.knowledgePointIds || (assignment.topic && assignment.topic !== "全部" ? [assignment.topic] : []),
        target: assignment.target || "完成作答、订正和专项复盘；不以一次训练形成长期能力结论。",
        publish: true
      });
      ui.classroom.message = response?.queued
        ? "作业和已审核变式已保存在同步队列，恢复联网后自动下发。"
        : "作业和已审核变式已下发到当前班级。";
      ui.classroom.error = false;
      if (classroomDialog?.open) {
        await loadClassroomDetail(classId);
        renderClassroom();
      }
    } catch (error) {
      ui.classroom.error = true;
      ui.classroom.message = error?.message || "作业发布失败；本机预览和学习数据仍保留。";
      if (classroomDialog?.open) renderClassroom();
    }
  }

  async function syncStudentLearningData(client, classId) {
    if (!engine?.buildLearningSyncPayload || !client?.syncLearning) return;
    const state = engine.loadState();
    const questions = window.PhysicsStudioApp?.getQuestions?.() || [];
    try {
      const payload = engine.buildLearningSyncPayload(state, questions, state.activeProfileId, { limit: 100 });
      const result = await client.syncLearning(classId, payload);
      if (engine.buildExamSyncPayload && state.examRecords?.some((item) => item.profileId === state.activeProfileId)) {
        const examPayload = engine.buildExamSyncPayload(state, state.activeProfileId, { limit: 100 });
        await client.syncExamRecords(classId, examPayload);
      }
      const sync = client.syncStatus?.();
      ui.classroom.learningSyncOverride = null;
      if (sync) ui.classroom.message = result?.queued ? `学习数据：${sync.label}。${sync.detail}` : `学习数据：${sync.label}。`;
    } catch (error) {
      ui.classroom.learningSyncOverride = { state: "sync-blocked", label: "未同步", detail: error?.message || "本机学习记录尚未发送。" };
      ui.classroom.message = `学习记录未同步：${error?.message || "班级服务不可用"}。作业列表仍可查看。`;
      ui.classroom.error = true;
    }
  }

  async function runClassroomAction(task, successMessage = "", clearInvite = false) {
    if (ui.classroom.busy) return;
    ui.classroom.busy = true;
    ui.classroom.error = false;
    ui.classroom.message = "正在处理…";
    if (clearInvite) ui.classroom.lastInvite = null;
    renderClassroom();
    try {
      await task();
      ui.classroom.error = false;
      if (successMessage) ui.classroom.message = successMessage;
    } catch (error) {
      ui.classroom.error = true;
      ui.classroom.message = error?.message || "班级操作失败，请稍后重试。";
    } finally {
      ui.classroom.busy = false;
      renderClassroom();
    }
  }

  async function handleClassroomSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const client = window.PhysicsStudioClassroom;
    if (!client || ui.classroom.busy) return;
    const values = new FormData(form);
    if (form.id === "classroomStudentNameForm") {
      await runClassroomAction(async () => {
        const user = await client.updateDisplayName(values.get("displayName"));
        experience.displayName = String(user?.displayName || values.get("displayName") || "同学").trim().slice(0, 80) || "同学";
        saveExperience();
        ui.classroom.message = "班级内备注名已保存";
      }, "班级内备注名已保存", false);
      return;
    }
    if (form.id === "classroomLoginForm") {
      await runClassroomAction(async () => {
        client.configure({ serverUrl: values.get("serverUrl") });
        await client.login({
          login: values.get("login"),
          password: values.get("password"),
          deviceName: values.get("deviceName")
        });
        ui.classroom.classes = [];
        ui.classroom.selectedClassId = "";
        const response = await client.listClasses();
        ui.classroom.classes = Array.isArray(response?.items) ? response.items : [];
        ui.classroom.selectedClassId = ui.classroom.classes[0]?.id || "";
        const role = client.status().user?.role;
        if ((role === "teacher" || role === "administrator") && ui.classroom.selectedClassId) {
          await loadClassroomDetail(ui.classroom.selectedClassId);
        } else if (role === "student" && ui.classroom.selectedClassId) {
          await loadStudentAssignments(ui.classroom.selectedClassId);
          await syncStudentLearningData(client, ui.classroom.selectedClassId);
        }
      }, "登录成功。服务端权限已生效。", true);
    } else if (form.id === "classroomServerConfigForm") {
      await runClassroomAction(async () => {
        client.configure({ serverUrl: values.get("serverUrl") });
      }, "联网服务地址已保存。", false);
    } else if (form.id === "classroomCreateClassForm") {
      await runClassroomAction(async () => {
        const created = await client.createClass({
          name: values.get("name")
        });
        ui.classroom.classes.unshift(created);
        ui.classroom.selectedClassId = created.id;
        const invite = await client.createInvite(created.id);
        ui.classroom.lastInvite = { ...invite, classId: created.id };
        await loadClassroomDetail(created.id);
      }, "班级已创建。", true);
    } else if (form.id === "classroomStudentJoinForm") {
      await runClassroomAction(async () => {
        await joinClassByInviteCode(values.get("code"), values.get("displayName"));
      }, "已加入班级，备注名可随时修改。", true);
    } else if (form.id === "classroomJoinForm") {
      await runClassroomAction(async () => {
        await joinClassByInviteCode(values.get("code"));
      }, "已加入班级。", false);
    } else if (form.id === "classroomInviteForm") {
      const classId = ui.classroom.selectedClassId;
      await runClassroomAction(async () => {
        const invite = await client.createInvite(classId);
        ui.classroom.lastInvite = { ...invite, classId };
      }, "邀请码与二维码已生成；请通过可信渠道发给本班学生。", false);
    } else if (form.id === "classroomGroupForm") {
      const classId = ui.classroom.selectedClassId;
      await runClassroomAction(async () => {
        await client.createGroup(classId, { name: values.get("name") });
        await loadClassroomDetail(classId);
      }, "分组已添加。", false);
    } else if (form.id === "classroomAssignmentForm") {
      const classId = ui.classroom.selectedClassId;
      await runClassroomAction(async () => {
        const questionIds = [...ui.classroom.selectedQuestionIds];
        const questionItems = classroomQuestionItems(questionIds);
        if (!questionIds.length || questionItems.length !== questionIds.length) {
          throw new Error("请从完整题库中至少选择一道可下发的题目。");
        }
        const scope = String(values.get("scope") || "class");
        const [scopeType, scopeId] = scope.split(":");
        const targetType = ["group", "student"].includes(scopeType) ? scopeType : "class";
        const created = await client.createAssignment(classId, {
          title: values.get("title"),
          instructions: values.get("instructions"),
          dueAt: values.get("dueAt") || null,
          targetType,
          targetId: targetType === "class" ? null : scopeId,
          questionIds,
          questionItems,
          knowledgePointKeys: [...new Set(questionItems.map((item) => item.knowledgePointId).filter(Boolean))],
          target: values.get("target"),
          publish: values.get("publish") === "on"
        });
        if (!created?.queued) {
          ui.classroom.selectedQuestionIds = [];
          await loadClassroomDetail(classId);
        }
        ui.classroom.message = created?.queued ? "作业待同步；服务端尚未确认发布。" : "作业已由班级服务确认。";
      }, "", false);
    } else if (form.matches("[data-classroom-assignment-answer-form]")) {
      const assignmentId = form.dataset.classroomAssignmentAnswerForm;
      const assignment = ui.classroom.assignments.find((item) => item.id === assignmentId);
      if (!assignment) return;
      const currentAnswers = (assignment.questionIds || []).map((questionId) => {
        const fields = [...form.querySelectorAll("[data-assignment-question]")].filter((field) => field.dataset.assignmentQuestion === questionId);
        const response = fields.find((field) => field.dataset.assignmentField === "response")?.value?.trim() || "";
        const steps = fields.find((field) => field.dataset.assignmentField === "steps")?.value?.trim() || "";
        return { questionId, response, steps };
      });
      clearTimeout(assignmentDraftTimer);
      if (!saveAssignmentDraftFromForm(form)) return;
      if (!currentAnswers.length || currentAnswers.some((answer) => !answer.response)) {
        ui.classroom.error = true;
        ui.classroom.message = "请填写每一道题的真实答案；草稿可稍后继续。";
        renderClassroom();
        return;
      }
      const saved = readAssignmentDraft(assignmentId);
      const clientEntityId = saved.clientEntityId || `assignment-${crypto.randomUUID()}`;
      await runClassroomAction(async () => {
        const result = await client.submitAssignment(assignmentId, {
          clientEntityId,
          answers: currentAnswers.map((answer) => ({
            ...answer,
            startedAt: saved.answers?.[answer.questionId]?.startedAt || new Date().toISOString(),
            hintViewCount: 0
          }))
        });
        if (result?.queued) {
          window.PhysicsStudioStorageRepository?.setJson?.(assignmentDraftKey(assignmentId), {
            ...saved, clientEntityId, queued: true, updatedAt: new Date().toISOString()
          });
          ui.classroom.message = "逐题答案已在本机排队，尚未由服务端确认；请恢复网络后查看状态。";
        } else {
          window.PhysicsStudioStorageRepository?.removeItem?.(assignmentDraftKey(assignmentId));
          await loadStudentAssignments(ui.classroom.selectedClassId);
          ui.classroom.message = "逐题作答已由服务端确认，等待教师批改。";
        }
      }, "", false);
    } else if (form.matches("[data-classroom-review-form]")) {
      const reviewId = form.dataset.classroomReviewForm;
      await runClassroomAction(async () => {
        const item = ui.classroom.reviewCases.find((entry) => entry.id === reviewId);
        const perQuestionScores = (item?.answers || []).map((answer) => ({
          questionId: answer.questionId,
          score: values.get(`questionScore:${answer.questionId}`) === "" ? null : Number(values.get(`questionScore:${answer.questionId}`))
        }));
        await client.decideReviewCase(reviewId, {
          decision: values.get("decision"),
          score: Number(values.get("score")),
          perQuestionScores,
          reason: values.get("reason"),
          annotation: { rubric: "教师按题目过程与结果复核；空题分表示未单独量化。" }
        }, ui.classroom.selectedClassId);
        await loadClassroomDetail(ui.classroom.selectedClassId);
      }, "教师复核决定已提交。", false);
    }
  }

  async function handleClassroomClick(event) {
    const client = window.PhysicsStudioClassroom;
    if (event.target.closest("[data-classroom-qr-camera-close]")) {
      stopClassroomQrCamera();
      return;
    }
    if (event.target.closest("[data-classroom-qr-camera]") && !ui.classroom.busy) {
      try {
        await startClassroomQrCamera();
      } catch (error) {
        stopClassroomQrCamera();
        ui.classroom.message = error?.message || "摄像头二维码扫描不可用";
        ui.classroom.error = true;
        renderClassroom();
      }
      return;
    }
    const select = event.target.closest("[data-classroom-select]");
    if (select && !ui.classroom.busy) {
      ui.classroom.selectedClassId = select.dataset.classroomSelect;
      ui.classroom.lastInvite = null;
      ui.classroom.selectedQuestionIds = [];
      await runClassroomAction(() => loadClassroomDetail(ui.classroom.selectedClassId), "班级花名册已载入。", false);
      return;
    }
    const member = event.target.closest("[data-classroom-member]");
    if (member && !ui.classroom.busy) {
      const status = member.dataset.classroomStatus;
      await runClassroomAction(async () => {
        await client.updateMembership(member.dataset.classroomMember, { status });
        await loadClassroomDetail(ui.classroom.selectedClassId);
      }, status === "active" ? "已批准学生加入。" : "已将学生移出班级。", false);
      return;
    }
    const assign = event.target.closest("[data-classroom-assign]");
    if (assign && !ui.classroom.busy) {
      const membershipId = assign.dataset.classroomAssign;
      const groupId = classroomDialog.querySelector(`[data-classroom-group-select="${CSS.escape(membershipId)}"]`)?.value || null;
      await runClassroomAction(async () => {
        await client.updateMembership(membershipId, { groupId });
        await loadClassroomDetail(ui.classroom.selectedClassId);
      }, "学生分组已更新。", false);
      return;
    }
    const openAssignment = event.target.closest("[data-classroom-open-assignment]");
    if (openAssignment && !ui.classroom.busy) {
      ui.classroom.activeAssignmentId = openAssignment.dataset.classroomOpenAssignment;
      renderClassroom();
      classroomDialog.querySelector(".student-assignment-detail")?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const action = event.target.closest("[data-classroom-action]")?.dataset.classroomAction;
    if (!action) return;
    if (action === "close") classroomDialog.close();
    else if (action === "assignment-back") {
      saveAssignmentDraftFromForm(classroomDialog.querySelector("[data-classroom-assignment-answer-form]"));
      ui.classroom.activeAssignmentId = "";
      renderClassroom();
    }
    else if (action === "refresh") await refreshClassroomData(true);
    else if (action === "delete-class") {
      const classId = ui.classroom.selectedClassId;
      const selectedClass = ui.classroom.classes.find((item) => item.id === classId);
      if (!classId || !selectedClass) return;
      if (!window.confirm(`确认删除班级“${selectedClass.name}”？删除后邀请码立即失效，学生下次同步将不再看到该班级。`)) return;
      await runClassroomAction(async () => {
        await client.deleteClass(classId);
        ui.classroom.classes = ui.classroom.classes.filter((item) => item.id !== classId);
        ui.classroom.selectedClassId = ui.classroom.classes[0]?.id || "";
        ui.classroom.lastInvite = null;
        ui.classroom.roster = [];
        ui.classroom.groups = [];
        ui.classroom.learningSummary = [];
        ui.classroom.reviewCases = [];
        if (ui.classroom.selectedClassId) await loadClassroomDetail(ui.classroom.selectedClassId);
      }, "班级已删除，原邀请码已失效。", true);
    }
    else if (action === "logout") {
      await runClassroomAction(async () => {
        try { await client.logout(); } finally {
          ui.classroom.classes = [];
          ui.classroom.selectedClassId = "";
          ui.classroom.roster = [];
          ui.classroom.groups = [];
          ui.classroom.learningSummary = [];
          ui.classroom.reviewCases = [];
          ui.classroom.lastInvite = null;
          ui.classroom.assignments = [];
          ui.classroom.assignmentSubmissions = {};
        }
      }, "已退出班级服务，继续使用本机离线数据。", false);
    } else if (action === "copy-invite") {
      const code = ui.classroom.lastInvite?.code || "";
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        ui.classroom.message = "邀请码已复制。";
        ui.classroom.error = false;
      } catch {
        window.prompt("请复制邀请码", code);
      }
      renderClassroom();
    } else if (action === "share-invite") {
      const code = ui.classroom.lastInvite?.code || "";
      const selected = ui.classroom.classes.find((item) => item.id === ui.classroom.selectedClassId);
      if (!code) return;
      const text = `请在费曼物理中加入“${selected?.name || "物理班级"}”，邀请码：${code}`;
      try {
        if (typeof navigator.share === "function") {
          await navigator.share({ title: "费曼物理班级邀请", text });
          ui.classroom.message = "已打开系统分享。";
        } else {
          await navigator.clipboard.writeText(text);
          ui.classroom.message = "班级邀请文字已复制。";
        }
        ui.classroom.error = false;
      } catch (error) {
        if (error?.name === "AbortError") return;
        window.prompt("请复制班级邀请", text);
      }
      renderClassroom();
    } else if (action === "refresh-invite") {
      const classId = ui.classroom.selectedClassId;
      if (!classId) return;
      await runClassroomAction(async () => {
        const invite = await client.createInvite(classId);
        ui.classroom.lastInvite = { ...invite, classId };
      }, "已刷新邀请码与二维码；旧邀请码已立即失效。", false);
    }
  }

  async function handleClassroomChange(event) {
    const picker = event.target.closest("[data-classroom-picker]");
    if (picker) {
      ui.classroom.picker[picker.dataset.classroomPicker] = picker.value;
      const results = classroomDialog.querySelector(".classroom-picker-results");
      if (results) results.innerHTML = renderClassroomQuestionPicker();
      return;
    }
    const question = event.target.closest("[data-classroom-question]");
    if (question) {
      const id = question.dataset.classroomQuestion;
      const chosen = new Set(ui.classroom.selectedQuestionIds);
      if (question.checked) chosen.add(id);
      else chosen.delete(id);
      if (chosen.size > 100) {
        question.checked = false;
        ui.classroom.message = "单次作业最多选择 100 题。";
        ui.classroom.error = true;
        return;
      }
      ui.classroom.selectedQuestionIds = [...chosen];
      const summary = classroomDialog.querySelector(".classroom-picker-summary");
      if (summary) summary.textContent = `已选 ${chosen.size} 题 · 可继续筛选或保存作业`;
      return;
    }
    const input = event.target.closest("#classroomInviteQrInput");
    if (!input) return;
    const status = classroomDialog.querySelector(".classroom-qr-status");
    const file = input.files?.[0];
    input.value = "";
    if (!file || !status) return;
    status.classList.remove("error");
    status.textContent = "正在本机识别二维码……";
    try {
      const code = await decodeClassroomInviteQr(file);
      status.textContent = "邀请码已识别，正在加入班级……";
      await runClassroomAction(
        () => joinClassByInviteCode(code),
        "二维码已识别，已加入班级。",
        true,
      );
    } catch (error) {
      status.classList.add("error");
      status.textContent = error?.message || "二维码识别失败，请改为手动输入邀请码。";
    }
  }

  function handleClassroomInput(event) {
    const assignmentField = event.target.closest("[data-assignment-question]");
    if (assignmentField) {
      clearTimeout(assignmentDraftTimer);
      assignmentDraftTimer = window.setTimeout(() => {
        saveAssignmentDraftFromForm(assignmentField.closest("[data-classroom-assignment-answer-form]"));
      }, 300);
      return;
    }
    const picker = event.target.closest('[data-classroom-picker="search"]');
    if (!picker) return;
    ui.classroom.picker.search = picker.value;
    const results = classroomDialog.querySelector(".classroom-picker-results");
    if (results) results.innerHTML = renderClassroomQuestionPicker();
  }

  function diagnosticPackageProgress(paper, learning) {
    const profileId = learning?.activeProfileId;
    const session = paper?.type === "placement" || String(paper?.id || "").startsWith("placement-")
      ? engine?.placementSessionForProfile?.(learning, profileId)
      : null;
    const sessionStartedAt = session ? new Date(session.startedAt || 0).getTime() : 0;
    const attempted = new Set((learning?.attempts || [])
      .filter((attempt) => attempt.profileId === profileId
        && (!session || new Date(attempt.completedAt || attempt.createdAt || 0).getTime() >= sessionStartedAt))
      .map((attempt) => attempt.questionId));
    const diagnosed = new Set((learning?.diagnosticAttempts || [])
      .filter((attempt) => attempt.profileId === profileId
        && (!session || new Date(attempt.createdAt || 0).getTime() >= sessionStartedAt))
      .map((attempt) => attempt.diagnosticId));
    const completedIds = new Set((paper?.items || []).filter((item) => {
      return item.kind === "misconception-diagnostic" ? diagnosed.has(item.id) : attempted.has(item.id);
    }).map((item) => item.id));
    const sessionIds = session ? new Set(session.questionIds || []) : null;
    const filteredIds = sessionIds ? new Set([...completedIds].filter((id) => sessionIds.has(id))) : completedIds;
    return {
      completedIds: filteredIds,
      completed: filteredIds.size,
      total: paper?.items?.length || 0,
      complete: Boolean(paper?.items?.length) && filteredIds.size === paper.items.length,
      session
    };
  }

  function renderDiagnosticPackage(kind, data) {
    const paper = kind === "broad" ? data.broadCoverage?.paper : data.placement;
    if (!paper?.items?.length || !data.learning) {
      window.alert("当前没有可用的完整诊断题包。");
      return;
    }
    if (kind === "placement" && engine?.startPlacementAssessment) {
      try {
        const session = engine.startPlacementAssessment(data.learning, paper, { profileId: data.learning.activeProfileId });
        if (session?.status === "in-progress") engine.saveState(data.learning);
      } catch (error) {
        window.alert(error.message || "无法开始摸底作答会话。");
        return;
      }
    }
    const progress = diagnosticPackageProgress({ ...paper, type: kind }, data.learning);
    ui.diagnosticPackage = { kind, paperId: paper.id };
    metricsDialog.querySelector("article").innerHTML = `
      <header><div><span>${kind === "broad" ? "BROAD COVERAGE CHECK" : "PLACEMENT DIAGNOSTIC"}</span><h2>${escapeHtml(paper.title)}</h2></div><button data-metrics-action="close" type="button">×</button></header>
      <section class="diagnostic-package-summary">
          <div><strong>${progress.completed}/${progress.total}</strong><span>本次摸底已提交</span></div>
          <div><strong>${paper.blueprintCoverage?.coveredCount ?? paper.coverage.coveredTopics.length}/${paper.blueprintCoverage?.targetCount ?? paper.coverage.availableTopics.length}</strong><span>蓝图目标覆盖</span></div>
        <div><strong>${paper.capabilityCoverage?.coveredCount ?? 0}/${paper.capabilityCoverage?.targetCount ?? 8}</strong><span>本次认知维度覆盖</span></div>
        <div><strong>${paper.longitudinalEvidenceCoverage?.coverageLabel || "0/0"}</strong><span>长期课程证据覆盖</span></div>
        <div><strong>${paper.misconceptionQuestionCount}</strong><span>前概念辨析</span></div>
        <p>${escapeHtml(paper.generationRule)} ${escapeHtml(paper.boundary)}</p>
      </section>
      ${paper.warnings?.length ? `<ul class="diagnostic-package-warnings">${paper.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
      <ol class="diagnostic-package-list">
        ${paper.items.map((item, index) => {
          const completed = progress.completedIds.has(item.id);
          const title = item.kind === "misconception-diagnostic"
            ? item.diagnostic.prompt
            : item.question.title;
          return `<li class="${completed ? "completed" : ""}">
            <i>${completed ? "✓" : index + 1}</i>
            <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(item.topic)} · ${escapeHtml(item.questionType)}</span></div>
            <button ${item.kind === "misconception-diagnostic" ? `data-diagnostic-concept="${escapeHtml(item.id)}"` : `data-diagnostic-question="${escapeHtml(item.id)}"`} type="button">${completed ? "复测" : "开始"}</button>
          </li>`;
        }).join("")}
      </ol>
      <footer class="diagnostic-package-footer"><button data-metrics-action="${kind === "broad" ? "complete-broad" : "complete-placement"}" type="button"${progress.complete ? "" : " disabled"}>${progress.complete ? (kind === "broad" ? "记录本次阶段检测完成" : "提交摸底并生成分析") : "完成全部题目后方可提交"}</button></footer>
      <p class="metrics-boundary">摸底和阶段检测用于形成后续学习证据，不用一次总分给学生贴标签；主观题仍需教师复核。</p>`;
    if (!metricsDialog.open) metricsDialog.showModal();
  }

  function showDiagnosticPackage(kind) {
    ui.diagnosticPackage = { kind, paperId: "", loading: true };
    metricsDialog.querySelector("article").innerHTML = `
      <header><div><span>${kind === "broad" ? "BROAD COVERAGE CHECK" : "PLACEMENT DIAGNOSTIC"}</span><h2>正在准备测评题包</h2></div><button data-metrics-action="close" type="button">×</button></header>
      <p class="metrics-loading" role="status">正在读取本机学习证据，请稍候。</p>`;
    if (!metricsDialog.open) metricsDialog.showModal();
    window.setTimeout(() => {
      if (!metricsDialog.open || ui.diagnosticPackage?.kind !== kind) return;
      renderDiagnosticPackage(kind, getStudentData({
        includePlacement: kind === "placement",
        includeBroadCoverage: kind === "broad"
      }));
    }, 0);
  }

  function showMasteryHelp() {
    const rules = engine?.masteryRules;
    metricsDialog.querySelector("article").innerHTML = `
      <header><div><span>掌握状态说明</span><h2>状态必须来自行为证据</h2></div><button data-metrics-action="close" type="button">×</button></header>
      <div class="mastery-help-list">
        <article><strong>学习中</strong><p>完成过练习，但尚未出现低提示独立正确。</p></article>
        <article><strong>已有独立正确证据</strong><p>至少一次正确，最高提示等级不超过 ${rules?.independentHintMaximum ?? 1}；这不是跨日期掌握结论。</p></article>
        <article><strong>已掌握</strong><p>跨日期且至少相隔 ${rules?.minimumRetentionIntervalHours ?? 24} 小时的低提示独立正确至少 ${rules?.masteredIndependentDates ?? 2} 次，并完成至少 ${rules?.masteredTransferEvidence ?? 1} 道经核验迁移作答。</p></article>
        <article><strong>待复习</strong><p>达到掌握标准，但已到间隔复习时间。</p></article>
        <article><strong>需巩固</strong><p>近期存在错误或提示依赖证据；建模记录不完整只作为检查线索，不能单独判定知识点薄弱。</p></article>
      </div>
      <p class="metrics-boundary">这些阈值是试运行产品规则，不是教育测量标准，必须通过初高中学生测试继续校准。</p>`;
    metricsDialog.showModal();
  }

  function externalStudentSearch() {
    if (!experience.studentExternalLinks) return;
    const query = ui.search.trim();
    if (!query) {
      window.alert("请先在练习页输入搜索关键词。");
      return;
    }
    const proceed = window.confirm("即将离开学生模式并打开外部网站。外部内容不受本应用审核，是否继续？");
    if (!proceed) return;
    const data = getStudentData({ includeAnalysis: true });
    const focusTopic = data.analysis?.weakest?.[0]?.topic || data.recommendations?.[0]?.question?.topic || "";
    const searchPrompt = [
      "长沙", experience.grade, "物理", query,
      focusTopic ? `当前巩固重点 ${focusTopic}` : "",
      "分步解题 已知量 研究对象 规律适用条件 单位与结果检验"
    ].filter(Boolean).join(" ");
    const url = `https://www.bing.com/search?q=${encodeURIComponent(searchPrompt)}`;
    window.open(url, "_blank", "noopener");
    recordEvent("student-external-search", { queryLength: query.length, focusTopic: focusTopic || null });
  }

  function openCapture() {
    resetCapture();
    captureDialog.querySelector("#studentCaptureGrade").value = experience.grade;
    captureDialog.showModal();
    recordEvent("capture-opened", {});
  }

  function resetCapture() {
    if (ui.capture?.source && typeof ui.capture.source.close === "function") ui.capture.source.close();
    ui.capture = {
      source: null,
      fileName: "",
      rotation: 0,
      contrast: 115,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      recognitionStatus: "学生已人工确认题目文字",
      recognitionEngine: "manual",
      confirmedText: ""
    };
    captureDialog.querySelector("form").reset();
    captureDialog.querySelector("#studentCaptureGrade").value = experience.grade;
    captureDialog.querySelector("#studentCaptureTopic").value = "待核对";
    captureDialog.querySelector("#studentCaptureTopic").removeAttribute("data-user-edited");
    captureDialog.querySelector("#studentCaptureContrast").value = "115";
    captureDialog.querySelector("#studentCaptureContrastValue").textContent = "115%";
    setRecognitionStatus("拍题录入不依赖 OCR：本应用未内置离线识别模型；仅在设备提供文字识别能力时生成待核对草稿。公式、图示和不确定字符请手工确认。", "等待图片");
    captureDialog.querySelector("#studentCaptureImageStatus").textContent = "图片处理仅用于提升可读性；自动裁边是图像估算，保存前必须检查。";
    renderCaptureCanvas();
  }

  function handleCaptureClick(event) {
    const action = event.target.closest("[data-capture-action]")?.dataset.captureAction;
    if (!action) return;
    event.preventDefault();
    if (action === "close") captureDialog.close();
    else if (action === "rotate") {
      ui.capture.rotation = (ui.capture.rotation + 90) % 360;
      renderCaptureCanvas();
      invalidateCaptureConfirmation("图片已旋转，原识别结果可能不再对应当前画面，请重新识别并确认。", "需重新识别");
    } else if (action === "reset-image") {
      ui.capture.crop = { x: 0, y: 0, width: 1, height: 1 };
      ui.capture.rotation = 0;
      ui.capture.contrast = 115;
      captureDialog.querySelector("#studentCaptureContrast").value = "115";
      captureDialog.querySelector("#studentCaptureContrastValue").textContent = "115%";
      renderCaptureCanvas();
      invalidateCaptureConfirmation("图片处理已重置，请重新识别并确认题干。", "需重新识别");
    } else if (action === "auto-crop") {
      estimateCaptureCrop();
      invalidateCaptureConfirmation("裁边范围已变化，请重新识别并确认题干。", "需重新识别");
    } else if (action === "recognize") {
      recognizeCaptureText();
    }
  }

  async function loadCaptureFile(file) {
    if (!(file instanceof Blob)) return;
    if (!String(file.type || "").startsWith("image/") || file.size > 20 * 1024 * 1024) {
      setCaptureStatus("请选择不超过 20 MB 的 JPG、PNG 或 WebP 图片。", true);
      return;
    }
    try {
      if (ui.capture.source && typeof ui.capture.source.close === "function") ui.capture.source.close();
      ui.capture.source = await loadImageSource(file);
      ui.capture.fileName = String(file.name || `试题扫描-${Date.now()}.jpg`).slice(0, 120);
      ui.capture.rotation = 0;
      ui.capture.crop = { x: 0, y: 0, width: 1, height: 1 };
      estimateCaptureCrop();
      captureDialog.querySelector("#studentCaptureText").value = "";
      ui.capture.recognitionStatus = "新图片尚未识别并人工确认";
      ui.capture.recognitionEngine = "manual";
      invalidateCaptureConfirmation("已载入新图片，请重新识别或输入题干并逐字确认。", "待识别 / 手工输入");
      captureDialog.querySelector("#studentRecognitionBadge").textContent = "待识别 / 手工输入";
      setCaptureStatus("图片已载入并估算裁边，请检查是否保留了全部题干、选项、单位和图示。");
    } catch (error) {
      console.error("Capture image load failed", error);
      setCaptureStatus("图片无法读取，请换一张清晰图片。", true);
    }
  }

  async function loadImageSource(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  function estimateCaptureCrop() {
    const source = ui.capture?.source;
    if (!source) {
      setCaptureStatus("请先拍照或选择图片。", true);
      return;
    }
    const sample = document.createElement("canvas");
    const scale = Math.min(1, 420 / Math.max(source.width, source.height));
    sample.width = Math.max(1, Math.round(source.width * scale));
    sample.height = Math.max(1, Math.round(source.height * scale));
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const cornerPoints = [
      [2, 2],
      [sample.width - 3, 2],
      [2, sample.height - 3],
      [sample.width - 3, sample.height - 3]
    ];
    const luminance = (x, y) => {
      const index = (Math.max(0, Math.min(sample.height - 1, y)) * sample.width
        + Math.max(0, Math.min(sample.width - 1, x))) * 4;
      return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    };
    const background = cornerPoints.reduce((sum, [x, y]) => sum + luminance(x, y), 0) / cornerPoints.length;
    let minX = sample.width;
    let minY = sample.height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < sample.height; y += 3) {
      for (let x = 0; x < sample.width; x += 3) {
        if (Math.abs(luminance(x, y) - background) > 24) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const foundWidth = maxX - minX;
    const foundHeight = maxY - minY;
    if (foundWidth > sample.width * 0.25 && foundHeight > sample.height * 0.2) {
      const padX = sample.width * 0.055;
      const padY = sample.height * 0.055;
      const x1 = clamp(minX - padX, 0, sample.width);
      const y1 = clamp(minY - padY, 0, sample.height);
      const x2 = clamp(maxX + padX, 0, sample.width);
      const y2 = clamp(maxY + padY, 0, sample.height);
      ui.capture.crop = {
        x: x1 / sample.width,
        y: y1 / sample.height,
        width: Math.max(0.1, (x2 - x1) / sample.width),
        height: Math.max(0.1, (y2 - y1) / sample.height)
      };
      setCaptureStatus("已按边缘明暗差估算裁边。该算法可能误裁浅色文字或图示，必须目视检查。");
    } else {
      ui.capture.crop = { x: 0, y: 0, width: 1, height: 1 };
      setCaptureStatus("没有找到足够稳定的页面边缘，已保留整张图片。");
    }
    renderCaptureCanvas();
  }

  function renderCaptureCanvas() {
    const canvas = captureDialog?.querySelector("#studentCaptureCanvas");
    const empty = captureDialog?.querySelector("#studentCaptureEmpty");
    if (!canvas || !empty) return;
    const source = ui.capture?.source;
    if (!source) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    const crop = ui.capture.crop;
    const sourceX = Math.round(crop.x * source.width);
    const sourceY = Math.round(crop.y * source.height);
    const sourceWidth = Math.max(1, Math.round(crop.width * source.width));
    const sourceHeight = Math.max(1, Math.round(crop.height * source.height));
    const rotated = ui.capture.rotation % 180 !== 0;
    const scale = Math.min(1, 1500 / Math.max(sourceWidth, sourceHeight));
    const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = rotated ? drawHeight : drawWidth;
    canvas.height = rotated ? drawWidth : drawHeight;
    const context = canvas.getContext("2d");
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = `contrast(${ui.capture.contrast}%)`;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(ui.capture.rotation * Math.PI / 180);
    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );
    context.restore();
    canvas.classList.remove("hidden");
    empty.classList.add("hidden");
  }

  function parseAndroidBridgeJson(raw) {
    if (raw && typeof raw === "object") return raw;
    if (typeof raw !== "string" || !raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function normalizeOcrLines(blocks, fallbackText = "") {
    const normalized = (Array.isArray(blocks) ? blocks : []).map((block) => {
      const text = String(block?.text || block?.rawValue || "").trim();
      if (!text) return "";
      const confidence = Number(block?.confidence);
      // Missing confidence is also uncertain. OCR confidence is never used to
      // infer a formula, vector, subscript or diagram label.
      return !Number.isFinite(confidence) || confidence < 0.8 ? `□${text}` : text;
    }).filter(Boolean);
    if (normalized.length) return normalized;
    const text = String(fallbackText || "").trim();
    return text ? text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => `□${line}`) : [];
  }

  function applyCaptureRecognition(lines, engine, statusMessage) {
    const text = lines.join("\n");
    captureDialog.querySelector("#studentCaptureText").value = text;
    captureDialog.querySelector("#studentCaptureTopic").value = inferTopic(lines.join(" "));
    ui.capture.recognitionStatus = `${engine} 识别草稿；待学生逐字人工确认`;
    ui.capture.recognitionEngine = engine;
    invalidateCaptureConfirmation(statusMessage, "全部待确认");
  }

  function tryAndroidNativeCaptureOcr(canvas) {
    const bridge = window.PhysicsStudioAndroid;
    if (!bridge || typeof bridge.ocrImage !== "function") {
      return { status: "unavailable", reason: "android_bridge_unavailable" };
    }
    let capability = null;
    if (typeof bridge.getOcrCapability === "function") {
      try {
        capability = parseAndroidBridgeJson(bridge.getOcrCapability());
      } catch (error) {
        console.error("Android OCR capability check failed", error);
        return { status: "failed", reason: "native_ocr_capability_failed", engine: "android-native" };
      }
    }
    if (capability && capability.available !== true) {
      return {
        status: "unavailable",
        reason: String(capability.reason || "native_ocr_unavailable"),
        engine: String(capability.engine || "none")
      };
    }
    try {
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const result = parseAndroidBridgeJson(bridge.ocrImage(imageDataUrl));
      if (!result || result.error) {
        return {
          status: "failed",
          reason: String(result?.error || "invalid_native_ocr_response"),
          engine: String(result?.engine || "android-native")
        };
      }
      const lines = normalizeOcrLines(result.blocks, result.text);
      if (!lines.length) {
        return { status: "empty", reason: "no_text", engine: String(result.engine || "android-native") };
      }
      return { status: "recognized", lines, engine: String(result.engine || "android-native") };
    } catch (error) {
      console.error("Android native OCR failed", error);
      return { status: "failed", reason: "native_ocr_call_failed", engine: "android-native" };
    }
  }

  async function recognizeCaptureText() {
    const canvas = captureDialog.querySelector("#studentCaptureCanvas");
    if (!ui.capture?.source) {
      setRecognitionStatus("请先拍照或选择图片。", "未识别", true);
      return;
    }
    invalidateCaptureConfirmation("正在重新识别；识别完成后仍须逐字人工确认。", "识别中");
    setRecognitionStatus("正在尝试 Android 原生离线 OCR…", "识别中");
    const nativeResult = tryAndroidNativeCaptureOcr(canvas);
    if (nativeResult.status === "recognized") {
      applyCaptureRecognition(
        nativeResult.lines,
        nativeResult.engine,
        "Android 原生离线 OCR 结果仅作为录入草稿；低置信度或无置信度文字已用“□”标记。公式、上下标、矢量和图示必须逐项核对。"
      );
      return;
    }

    if (typeof window.TextDetector !== "function") {
      const nativeBoundary = nativeResult.reason === "offline_ocr_engine_not_bundled"
        ? "当前 APK 未捆绑可离线运行的原生 OCR 模型，"
        : "Android 原生 OCR 当前不可用，";
      setRecognitionStatus(
        `${nativeBoundary}设备也未提供 TextDetector。请手工输入或粘贴题干；应用不会伪造 OCR 结果。`,
        "请人工输入",
        true
      );
      ui.capture.recognitionStatus = "本机 OCR 不可用；学生手工输入并确认";
      ui.capture.recognitionEngine = "manual";
      return;
    }
    try {
      setRecognitionStatus("原生 OCR 不可用，正在调用设备 TextDetector…", "识别中");
      const detector = new window.TextDetector();
      const blocks = await detector.detect(canvas);
      const lines = normalizeOcrLines(blocks);
      if (!lines.length) {
        setRecognitionStatus("未检测到清晰文字。请改善光线、裁切题目后重试，或手工输入。", "未检出", true);
        return;
      }
      applyCaptureRecognition(
        lines,
        "TextDetector",
        "TextDetector 结果仅作为录入草稿；低置信度或无置信度文字已用“□”标记。公式、上下标、矢量和图示必须逐项核对。"
      );
    } catch (error) {
      console.error("Text detection failed", error);
      ui.capture.recognitionStatus = "本机 OCR 调用失败；学生手工输入并确认";
      ui.capture.recognitionEngine = "manual";
      setRecognitionStatus("本机文字检测调用失败。请手工输入或粘贴题干。", "识别失败", true);
    }
  }

  function handleCapturePaste(event) {
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (imageItem) {
      event.preventDefault();
      loadCaptureFile(imageItem.getAsFile());
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text && event.target.id !== "studentCaptureText" && event.target.id !== "studentOriginalAnswer") {
      event.preventDefault();
      captureDialog.querySelector("#studentCaptureText").value = text;
      captureDialog.querySelector("#studentCaptureTopic").value = inferTopic(text);
      ui.capture.recognitionEngine = "manual";
      invalidateCaptureConfirmation("已粘贴文字。仍需与原题逐字核对，尤其是公式、上下标、单位和图中标注。", "粘贴待确认");
    }
  }

  async function saveCapturedQuestion(event) {
    event.preventDefault();
    const text = captureDialog.querySelector("#studentCaptureText").value.trim();
    const confirmed = captureDialog.querySelector("#studentCaptureConfirmed").checked;
    if (text.length < 8) {
      window.alert("请先填写并确认完整题干。");
      captureDialog.querySelector("#studentCaptureText").focus();
      return;
    }
    if (!confirmed || ui.capture?.confirmedText !== text) {
      window.alert("请逐字检查题干，并勾选人工确认。");
      captureDialog.querySelector("#studentCaptureConfirmed").focus();
      return;
    }
    if (!app?.addQuestion) {
      window.alert("题库仍在初始化，请稍后重试。");
      return;
    }
    const attachments = [];
    if (ui.capture?.source) {
      const canvas = captureDialog.querySelector("#studentCaptureCanvas");
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (blob) {
        attachments.push({
          id: `capture-${Date.now()}`,
          name: ui.capture.fileName || `试题扫描-${Date.now()}.jpg`,
          type: "image/jpeg",
          size: blob.size,
          kind: "image",
          createdAt: new Date().toISOString(),
          blob
        });
      }
    }
    const reason = captureDialog.querySelector('input[name="captureReason"]:checked')?.value || "我做错了";
    const grade = captureDialog.querySelector("#studentCaptureGrade").value;
    const topic = captureDialog.querySelector("#studentCaptureTopic").value.trim() || inferTopic(text);
    const title = buildCaptureTitle(text, topic);
    try {
      const question = await app.addQuestion({
        title,
        content: text,
        grade,
        topic,
        reason,
        studentOriginalAnswer: captureDialog.querySelector("#studentOriginalAnswer").value.trim(),
        recognitionStatus: ui.capture.recognitionStatus,
        attachments
      });
      captureDialog.close();
      recordEvent("capture-saved", {
        questionId: question.id,
        reason,
        usedImage: attachments.length > 0,
        usedDeviceTextDetection: ui.capture.recognitionEngine !== "manual",
        recognitionEngine: ui.capture.recognitionEngine
      });
      startQuestion(question.id, "capture-correction");
    } catch (error) {
      console.error("Captured question save failed", error);
      window.alert(error.message || "保存失败，请稍后重试。");
    }
  }

  function buildCaptureTitle(text, topic) {
    const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const cleaned = firstLine.replace(/^\d+[.、)]\s*/, "").slice(0, 46);
    return cleaned.length >= 6 ? cleaned : `${topic || "物理"}错题订正`;
  }

  function inferTopic(text) {
    const value = String(text || "");
    const rules = [
      [/平抛|斜抛|抛出/, "曲线运动"],
      [/加速度|匀变速|速度图|v[-−]t/, "运动学"],
      [/受力|摩擦|牛顿|斜面|合力/, "牛顿运动定律"],
      [/机械能|动能|势能|做功|功率/, "功和能"],
      [/动量|冲量|碰撞/, "动量"],
      [/电路|电流|电压|电阻|欧姆/, "电路与欧姆定律"],
      [/电场|电势|库仑|带电粒子/, "电场"],
      [/磁场|洛伦兹|安培|电磁感应/, "磁场与电磁感应"],
      [/浮力|液体压强|阿基米德/, "压强与浮力"],
      [/凸透镜|平面镜|光路|折射|反射/, "光学"],
      [/波长|频率|振动|声音/, "振动与波"],
      [/热量|内能|比热|温度/, "热学"]
    ];
    return rules.find(([pattern]) => pattern.test(value))?.[1] || "待核对";
  }

  function setCaptureStatus(message, error = false) {
    const node = captureDialog.querySelector("#studentCaptureImageStatus");
    node.textContent = message;
    node.classList.toggle("error", error);
  }

  function invalidateCaptureConfirmation(message, badge = "待人工确认") {
    const checkbox = captureDialog?.querySelector("#studentCaptureConfirmed");
    if (checkbox) checkbox.checked = false;
    if (ui.capture) {
      ui.capture.confirmedText = "";
      ui.capture.recognitionStatus = ui.capture.recognitionEngine === "manual"
        ? "学生手工录入题干；待逐字人工确认"
        : `${ui.capture.recognitionEngine} 识别草稿；待逐字人工确认`;
    }
    if (message) setRecognitionStatus(message, badge);
  }

  function setRecognitionStatus(message, badge, error = false) {
    const status = captureDialog.querySelector("#studentRecognitionStatus");
    const badgeNode = captureDialog.querySelector("#studentRecognitionBadge");
    status.textContent = message;
    status.classList.toggle("error", error);
    badgeNode.textContent = badge;
    badgeNode.classList.toggle("error", error);
  }

  function showMetrics() {
    const data = getStudentData();
    const events = experience.events;
    const count = (type) => events.filter((event) => event.type === type).length;
    const firstLatency = events.find((event) => event.type === "first-question-started")?.latencySeconds;
    const fullAnswerViews = events.filter((event) => event.type === "hint-viewed" && Number(event.hintLevel) === 5);
    const attemptedBeforeFull = fullAnswerViews.filter((event) => event.answerAttempted).length;
    const retention = retentionEvidence();
    metricsDialog.querySelector("article").innerHTML = `
      <header><div><span>上线验证</span><h2>学生学习闭环指标</h2></div><button data-metrics-action="close" type="button">×</button></header>
      <div class="validation-metrics">
        ${validationMetric("首次开始用时", firstLatency == null ? "尚无记录" : `${firstLatency} 秒`, "从本次打开到首次进入题目；不是跨设备用户分析")}
        ${validationMetric("开始学习点击", count("first-question-started") + count("question-started"), "今日页、练习页、错题或拍题入口")}
        ${validationMetric("正式作答完成", count("attempt-completed"), `${data.summary.completed} 条本机学习记录`)}
        ${validationMetric("完整答案前尝试率", fullAnswerViews.length ? `${Math.round(attemptedBeforeFull / fullAnswerViews.length * 100)}%` : "暂无样本", `${attemptedBeforeFull}/${fullAnswerViews.length} 次有作答证据`)}
        ${validationMetric("迁移题完成", count("transfer-completed"), "只统计完成记录，不把文字长度当作正确")}
        ${validationMetric("拍题后订正", count("capture-saved"), "拍题保存后会直接进入分步作答")}
        ${validationMetric("次日保持证据", retention.day2, retention.day2Detail)}
        ${validationMetric("七日保持证据", retention.day7, retention.day7Detail)}
      </div>
      <section class="validation-tasks"><h3>上线前人工可用性任务</h3><ol><li>首次使用并在一分钟内开始第一道题。</li><li>拍入一道错题并检查 OCR 不确定字符。</li><li>完成订正、错误归因和自我解释。</li><li>第二天完成到期复习。</li><li>在“我的”中解释“已有独立正确证据”和“已掌握”的区别。</li></ol></section>
      <p class="metrics-boundary">这些是本机产品验证计数，不是教育效果因果证据，也不含班级排名。应分别邀请初中生和高中生完成观察测试。</p>`;
    metricsDialog.showModal();
  }

  async function handleMetricsClick(event) {
    const question = event.target.closest("[data-diagnostic-question]");
    if (question) {
      metricsDialog.close();
      startQuestion(question.dataset.diagnosticQuestion, ui.diagnosticPackage?.kind || "diagnostic-package");
      return;
    }
    const diagnostic = event.target.closest("[data-diagnostic-concept]");
    if (diagnostic) {
      metricsDialog.close();
      openLab("diagnostic", "", diagnostic.dataset.diagnosticConcept);
      return;
    }
    const action = event.target.closest("[data-metrics-action]")?.dataset.metricsAction;
    if (action === "close") metricsDialog.close();
    else if (action === "complete-broad") completeBroadCoverageCheck();
    else if (action === "complete-placement") completePlacementAssessment();
    else if (action === "feynman-retest") {
      const retestQuestionId = metricsDialog.dataset.feynmanRetestId || "";
      metricsDialog.close();
      if (retestQuestionId) startQuestion(retestQuestionId, "feynman-new-context-retest");
    }
    else if (action === "save-feynman") {
      const learning = engine?.loadState?.();
      if (!learning || !engine?.recordFeynmanExplanation) {
        window.alert("讲解记录模块未加载，内容尚未保存。");
        return;
      }
      const questionId = metricsDialog.dataset.feynmanQuestionId || "";
      const question = (app?.getQuestions?.() || []).find((item) => item.id === questionId);
      try {
        const researchObject = metricsDialog.querySelector("#feynmanObject")?.value || "";
        const lawConditions = metricsDialog.querySelector("#feynmanConditions")?.value || "";
        const prediction = metricsDialog.querySelector("#feynmanPrediction")?.value || "";
        const predictionReason = metricsDialog.querySelector("#feynmanPredictionReason")?.value || "";
        const retest = engine.selectFeynmanRetestQuestion?.(
          app?.getQuestions?.() || [], questionId, question ? engine.topicKeyForQuestion(question) : "",
          experience.grade, (learning.attempts || []).filter((item) => item.profileId === learning.activeProfileId)
        );
        const selfCheck = engine.feynmanSelfCheck({ researchObject, lawConditions, prediction, predictionReason });
        engine.recordFeynmanExplanation(learning, {
          questionId,
          knowledgePointId: question ? engine.topicKeyForQuestion?.(question) : "",
          topic: metricsDialog.dataset.feynmanTopic || question?.topic || "当前物理知识",
          explanation: metricsDialog.querySelector("#feynmanExplanation")?.value,
          researchObject,
          lawConditions,
          analogy: metricsDialog.querySelector("#feynmanAnalogy")?.value,
          prediction,
          predictionReason,
          retestQuestionId: retest?.id || "",
          unclearPoint: metricsDialog.querySelector("#feynmanUnclear")?.value
        });
        engine.saveState(learning);
        await engine.awaitLastSave?.();
        studentDataCache = null;
        metricsDialog.dataset.feynmanRetestId = retest?.id || "";
        metricsDialog.querySelector("article").innerHTML = `<header><div><span>讲解自检</span><h2>核对三个关键点</h2></div><button data-metrics-action="close" type="button" aria-label="关闭">×</button></header><section class="feynman-self-check">${selfCheck.items.map((item) => `<article><strong>${escapeHtml(item.label)}：${escapeHtml(item.status)}</strong><p>${escapeHtml(item.prompt)}</p></article>`).join("")}<p>${escapeHtml(selfCheck.boundary)}</p>${retest ? `<button class="primary" data-metrics-action="feynman-retest" type="button">开始新情境复测：${escapeHtml(retest.title)}</button>` : "<p>当前没有可用的已审核同知识点新题，暂不安排复测。</p>"}</section>`;
        recordEvent("feynman-explanation-saved", { questionId });
        renderStudentViewOnly({ preserveScroll: true });
      } catch (error) {
        window.alert(error?.message || "讲解未保存，请检查内容后重试。");
      }
    }
  }

  async function completePlacementAssessment() {
    const data = getStudentData({ includePlacement: true });
    const session = data.placementState?.session
      || engine?.placementSessionForProfile?.(data.learning, data.learning?.activeProfileId);
    if (!session || !data.learning || !engine?.completePlacementAssessment) return;
    const paper = data.placement;
    const progress = diagnosticPackageProgress({ ...paper, type: "placement" }, data.learning);
    if (!progress.complete) {
      window.alert("请先完成本次摸底中的全部题目，再提交摸底。");
      return;
    }
    try {
      engine.completePlacementAssessment(data.learning, session.id);
      engine.saveState(data.learning);
      await engine.awaitLastSave?.();
      ui.diagnosticPackage = null;
      metricsDialog.close();
      recordEvent("placement-completed", { sessionId: session.id, submittedCount: session.questionIds.length });
      renderRoleExperience();
    } catch (error) {
      window.alert(error.message || "摸底提交失败，数据未保存。");
    }
  }

  async function completeBroadCoverageCheck() {
    const data = getStudentData({ includeBroadCoverage: true });
    const paper = data.broadCoverage?.paper;
    if (!paper || !data.learning || !engine?.recordBroadCoverageCheck) return;
    const progress = diagnosticPackageProgress(paper, data.learning);
    if (!progress.complete) {
      window.alert("请先完成本次阶段检测中的全部题目，再记录完成状态。");
      return;
    }
    try {
      engine.recordBroadCoverageCheck(data.learning, {
        profileId: data.learning.activeProfileId,
        questionIds: paper.items.filter((item) => item.kind === "bank-question").map((item) => item.id),
        coveredTopics: paper.coverage.coveredTopics,
        coverageComplete: paper.coverage.complete,
        title: paper.title
      });
      engine.saveState(data.learning);
      await engine.awaitLastSave?.();
      ui.diagnosticPackage = null;
      metricsDialog.close();
      recordEvent("broad-coverage-completed", { source: "student" });
      renderRoleExperience();
    } catch (error) {
      window.alert(error?.message || "阶段检测未保存，请重试。");
    }
  }

  function validationMetric(label, value, detail) {
    return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(detail)}</small></article>`;
  }

  function recordEvent(type, details) {
    const event = {
      type,
      at: new Date().toISOString(),
      ...sanitizeEventDetails(details)
    };
    experience.events.push(event);
    experience.events = experience.events.slice(-MAX_EVENTS);
    const date = localDateKey(event.at);
    if (!experience.activeDates.includes(date)) experience.activeDates.push(date);
    experience.activeDates = experience.activeDates.slice(-60);
    saveExperience();
  }

  function sanitizeEventDetails(details) {
    const allowed = [
      "role", "editing", "enabled", "source", "questionId", "latencySeconds", "type",
      "gradingStatus", "hintLevel", "durationSeconds", "variantIndex", "reason",
      "usedImage", "usedDeviceTextDetection", "answerAttempted", "queryLength"
    ];
    return Object.fromEntries(Object.entries(details || {}).filter(([key]) => allowed.includes(key)));
  }

  function retentionEvidence() {
    const dates = [...new Set(experience.activeDates)].sort();
    if (!dates.length) return {
      day2: "暂无样本",
      day2Detail: "至少需要两个自然日的使用记录",
      day7: "暂无样本",
      day7Detail: "至少需要跨七日的使用记录"
    };
    const first = new Date(`${dates[0]}T00:00:00`);
    const offset = (date) => Math.round((new Date(`${date}T00:00:00`) - first) / 86400000);
    const offsets = dates.map(offset);
    return {
      day2: offsets.includes(1) ? "有返回记录" : offsets.some((value) => value >= 1) ? "未在次日记录" : "观察中",
      day2Detail: "只表示本机次日是否有活动，不等同于知识保持率",
      day7: offsets.includes(7) ? "有返回记录" : offsets.some((value) => value >= 7) ? "第七日未记录" : "观察中",
      day7Detail: "只表示本机第七日是否有活动，不等同于知识保持率"
    };
  }

  function emptyLearningSummary() {
    return {
      completed: 0,
      independenceRate: 0,
      averageHint: 0,
      learningMinutes: 0,
      dueCount: 0,
      topics: [],
      knowledgePointEvidence: {
        totalKnowledgePoints: 0,
        evidencedKnowledgePoints: 0,
        coverageLabel: "0/0",
        coverageRate: null,
        insufficient: 0,
        reinforce: 0,
        basic: 0,
        transferable: 0,
        levelLabel: "证据不足"
      },
      mastery: {
        masteryRate: 0,
        counts: { "未开始": 0, "学习中": 0, "已有独立正确证据": 0, "已掌握": 0, "待复习": 0, "薄弱": 0 }
      }
    };
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 11) return "早上好";
    if (hour < 14) return "中午好";
    if (hour < 18) return "下午好";
    return "晚上好";
  }

  function startOfWeek() {
    const date = new Date();
    const day = date.getDay() || 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day + 1);
    return date.getTime();
  }

  function localDateKey(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function applyFontScale() {
    document.documentElement.style.setProperty("--student-font-scale", String(experience.fontScale));
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // A class invite is sufficient for student entry; existing local experience
  // data remains readable and no password form is rendered.
  function renderClassroomLogin(status, disabled) {
    if (experience.role === "teacher") {
      return `
        <section class="classroom-guest-teacher">
          <h3>创建教师班级</h3>
          <p>输入任意非空班级名称即可创建，创建者自动获得该班级管理权限。</p>
          <form id="classroomCreateClassForm" class="classroom-compact-form">
            <label><span>班级名称</span><input name="name" required maxlength="120" placeholder="例如：高三物理一班"></label>
            <button type="submit"${disabled}>${ui.classroom.busy ? "正在创建…" : "创建班级"}</button>
          </form>
          <details class="classroom-server-settings">
            <summary>联网服务地址</summary>
            <form id="classroomServerConfigForm"><input name="serverUrl" type="url" required value="${escapeHtml(status.serverUrl)}"><button type="submit">保存</button></form>
          </details>
        </section>`;
    }
    const isLocalDevelopment = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(status.serverUrl);
    return `
      <section class="classroom-guest-student">
        <h3>加入教师班级</h3>
        <p>只需输入邀请码或扫描二维码，不需要学生登录名和密码。加入后可修改备注名。</p>
        <form class="classroom-compact-form" id="classroomStudentJoinForm">
          <details class="classroom-server-settings"${isLocalDevelopment ? " open" : ""}>
            <summary>在线班级连接${isLocalDevelopment ? "（开发地址）" : ""}</summary>
            <label><span>班级服务地址</span><input name="serverUrl" type="url" required value="${escapeHtml(status.serverUrl)}" autocomplete="url"></label>
          </details>
          <label><span>学生备注名</span><input name="displayName" maxlength="80" value="${escapeHtml(experience.displayName || "同学")}" autocomplete="nickname" placeholder="例如：李明·一班"></label>
          <label><span>老师的邀请码</span><input name="code" data-classroom-join-code required minlength="22" maxlength="22" autocomplete="off" placeholder="输入22位邀请码"></label>
          <label class="classroom-qr-scan"><span>扫描老师的二维码</span><input id="classroomInviteQrInput" type="file" accept="image/*" capture="environment"><small class="classroom-qr-status">可直接拍照或选择二维码图片，识别成功后会通过同一联网流程加入班级。</small></label>
          <button type="button" data-classroom-qr-camera${disabled}>打开摄像头扫描</button>
          <button type="submit"${disabled}>${ui.classroom.busy ? "正在加入…" : "输入邀请码加入"}</button>
        </form>
      </section>`;
  }

  window.PhysicsExperience = Object.freeze({
    getState() {
      return {
        edition: APP_EDITION,
        role: experience.role,
        grade: experience.grade,
        textbook: experience.textbook,
        goal: experience.goal,
        onboarded: experience.onboarded,
        studentExternalLinks: experience.studentExternalLinks
      };
    },
    recordEvent,
    openClassroom,
    showMetrics,
    openFeedbackEmail,
    setStudentExternalLinks(enabled) {
      experience.studentExternalLinks = Boolean(enabled);
      saveExperience();
      recordEvent("student-external-links-setting", { enabled: experience.studentExternalLinks });
      return experience.studentExternalLinks;
    },
    openSettings() {
      showOnboarding(true);
    }
  });
})();
