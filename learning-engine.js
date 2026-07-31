(() => {
  "use strict";

  const STORAGE_KEY = "physics-learning-loop-v1";
  const STATE_VERSION = 4;
  const DAY = 24 * 60 * 60 * 1000;
  const MASTERY_RULES = Object.freeze({
    experimental: true,
    independentHintMaximum: 1,
    masteredIndependentDates: 2,
    masteredTransferEvidence: 1,
    weakHintMinimum: 3,
    weakModelingBelow: 50
  });

  const misconceptionCatalog = [
    {
      code: "force-maintains-motion",
      title: "认为运动必须由持续的力维持",
      statement: "物体若不再受到向前的力，就会立刻停止。",
      correction: "力改变运动状态；合力为零时，物体保持静止或匀速直线运动。",
      topics: ["惯性", "牛顿第一定律", "受力分析"],
      diagnostic: {
        id: "diag-force-motion",
        prompt: "光滑水平面上的小车正向右运动。撤去推力后，小车将怎样运动？",
        choices: [
          ["A", "立刻停止"],
          ["B", "先减速后停止"],
          ["C", "继续向右做匀速直线运动"],
          ["D", "向左运动"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "没有力就没有速度"],
          ["R2", "小车具有惯性，且水平方向合力为零"],
          ["R3", "撤去推力后会出现向右的惯性力"],
          ["R4", "重力会让小车沿水平方向减速"]
        ],
        correctReason: "R2",
        explanation: "撤去推力后水平方向合力为零，小车依据牛顿第一定律保持原速度。惯性是性质，不是额外的力。"
      }
    },
    {
      code: "zero-velocity-zero-acceleration",
      title: "认为速度为零时加速度一定为零",
      statement: "某一时刻速度为零，就说明该时刻没有加速度。",
      correction: "速度描述状态，加速度描述速度变化；二者可在某一时刻分别为零或不为零。",
      topics: ["速度", "加速度", "竖直上抛"],
      diagnostic: {
        id: "diag-zero-velocity",
        prompt: "小球竖直向上抛出，忽略空气阻力。小球到达最高点的瞬间，其速度和加速度分别为多少？",
        choices: [
          ["A", "速度为零，加速度为零"],
          ["B", "速度为零，加速度竖直向下、大小为 g"],
          ["C", "速度竖直向上，加速度为零"],
          ["D", "速度和加速度都竖直向下"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "最高点运动停止，所以所有运动学量都为零"],
          ["R2", "最高点仍受重力，合力不为零"],
          ["R3", "速度方向改变时必须先静止一段时间"],
          ["R4", "加速度方向总与速度方向相同"]
        ],
        correctReason: "R2",
        explanation: "最高点瞬时速度为零，但重力仍存在，因此加速度始终竖直向下、大小为 g。"
      }
    },
    {
      code: "heavy-falls-faster",
      title: "认为重物在真空中下落更快",
      statement: "物体越重，自由下落的加速度越大。",
      correction: "忽略空气阻力时，同一地点所有物体的自由落体加速度相同。",
      topics: ["自由落体", "重力", "牛顿第二定律"],
      diagnostic: {
        id: "diag-free-fall",
        prompt: "在同一地点的真空管中，同时由静止释放质量分别为 0.1 kg 和 1.0 kg 的两个小球。它们将怎样落地？",
        choices: [
          ["A", "1.0 kg 小球先落地"],
          ["B", "0.1 kg 小球先落地"],
          ["C", "同时落地"],
          ["D", "无法判断"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "重力越大，加速度一定越大"],
          ["R2", "重力与质量都成正比，a = mg/m = g"],
          ["R3", "轻物体惯性小，所以加速更快"],
          ["R4", "真空中没有重力"]
        ],
        correctReason: "R2",
        explanation: "真空中只受重力，F = mg；由 a = F/m 得 a = g，与物体质量无关。"
      }
    },
    {
      code: "current-is-consumed",
      title: "认为电流经过用电器后被消耗",
      statement: "电流流过灯泡后会变小，剩余电流再流回电源。",
      correction: "稳恒串联电路中各处电流相等；用电器转化的是电能，不消耗电荷。",
      topics: ["串联电路", "电流", "电能"],
      diagnostic: {
        id: "diag-current",
        prompt: "两个不同规格的小灯泡串联接入稳定直流电路。稳定发光时，通过两灯的电流关系是怎样的？",
        choices: [
          ["A", "先经过的灯电流更大"],
          ["B", "更亮的灯电流更大"],
          ["C", "两灯电流相等"],
          ["D", "靠近电源正极的灯电流更大"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "电流经过灯泡时会被灯泡消耗"],
          ["R2", "串联电路只有一条电流路径，稳定时各处电荷流率相同"],
          ["R3", "电压大的位置电流一定大"],
          ["R4", "电源正极会不断释放更多电流"]
        ],
        correctReason: "R2",
        explanation: "串联电路中单位时间通过各截面的电荷量相同，所以各处电流相等；灯泡消耗的是电能。"
      }
    },
    {
      code: "virtual-image-is-real-convergence",
      title: "混淆虚像位置与实际光线会聚位置",
      statement: "看到平面镜中的像，说明光线在镜后真正会聚。",
      correction: "虚像是反射光线反向延长线的交点，实际光线没有到达镜后像的位置。",
      topics: ["平面镜成像", "虚像", "光路"],
      diagnostic: {
        id: "diag-virtual-image",
        prompt: "人看到平面镜中的像。关于像的位置，下列说法正确的是？",
        choices: [
          ["A", "反射光线在镜后实际会聚"],
          ["B", "反射光线的反向延长线在镜后相交"],
          ["C", "像位于镜面上"],
          ["D", "只有闭上一只眼睛才能形成像"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "眼睛看到哪里，光就一定在哪里会聚"],
          ["R2", "人眼沿直线反向追踪进入眼睛的反射光线"],
          ["R3", "镜子把物体复制到了镜后"],
          ["R4", "镜后存在折射介质"]
        ],
        correctReason: "R2",
        explanation: "进入眼睛的是反射光。人眼按光的直线传播经验反向追踪，形成位于镜后的虚像。"
      }
    },
    {
      code: "normal-always-equals-weight",
      title: "认为支持力总等于重力",
      statement: "只要物体接触支持面，支持力就等于物体重力。",
      correction: "支持力由垂直接触面的动力学条件决定，不一定等于重力。",
      topics: ["支持力", "斜面", "受力分析"],
      diagnostic: {
        id: "diag-normal-force",
        prompt: "质量为 m 的物块静止在倾角为 θ 的固定斜面上。斜面对物块的支持力大小为多少？",
        choices: [
          ["A", "mg"],
          ["B", "mgsinθ"],
          ["C", "mgcosθ"],
          ["D", "0"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "支持力总与重力平衡"],
          ["R2", "垂直斜面方向没有加速度，支持力平衡重力的垂直分量"],
          ["R3", "沿斜面方向没有运动，所以支持力沿斜面"],
          ["R4", "静止物体不受力"]
        ],
        correctReason: "R2",
        explanation: "沿垂直斜面方向列平衡方程 N − mgcosθ = 0，因此 N = mgcosθ。"
      }
    },
    {
      code: "temperature-equals-heat",
      title: "混淆温度、内能和热量",
      statement: "温度高的物体一定含有更多热量。",
      correction: "热量是传热过程中转移的能量，不是物体含有的状态量；内能还与质量和状态等有关。",
      topics: ["温度", "内能", "热量"],
      diagnostic: {
        id: "diag-thermal",
        prompt: "关于温度、内能和热量，下列说法正确的是？",
        choices: [
          ["A", "物体温度越高，含有的热量越多"],
          ["B", "热量是物体具有的一种状态量"],
          ["C", "热传递过程中转移的是能量"],
          ["D", "0 ℃ 的物体一定没有内能"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "热量像质量一样储存在物体内部"],
          ["R2", "热量描述由于温度差而发生的能量转移"],
          ["R3", "只有温度高于 0 ℃ 才有分子运动"],
          ["R4", "温度就是物体内能"]
        ],
        correctReason: "R2",
        explanation: "热量只描述传热过程中转移的能量；物体具有内能，但不能说物体“含有热量”。"
      }
    },
    {
      code: "acceleration-follows-velocity",
      title: "认为加速度方向总与速度方向相同",
      statement: "物体沿某方向运动，其加速度也一定沿该方向。",
      correction: "加速度方向由合力方向决定，可与速度同向、反向或垂直。",
      topics: ["加速度", "圆周运动", "合力"],
      diagnostic: {
        id: "diag-circular-motion",
        prompt: "物体做速度大小不变的匀速圆周运动时，下列说法正确的是？",
        choices: [
          ["A", "速度不变，所以加速度为零"],
          ["B", "加速度沿速度方向"],
          ["C", "加速度指向圆心，与瞬时速度垂直"],
          ["D", "合力沿圆周切线方向"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "速度大小不变就表示速度矢量不变"],
          ["R2", "速度方向不断改变，需要指向圆心的加速度"],
          ["R3", "运动方向就是受力方向"],
          ["R4", "圆周运动不需要合力"]
        ],
        correctReason: "R2",
        explanation: "匀速圆周运动的速度方向持续变化，向心加速度和合力均指向圆心。"
      }
    }
  ];

  const formulaCatalog = [
    { id: "motion-v", stage: "初中", topic: "机械运动", name: "速度", formula: "v = s / t", condition: "同一参考系；平均速度用总路程除以总时间。", dimensionEquation: "v=s/t" },
    { id: "motion-a", stage: "高中", topic: "运动学", name: "加速度", formula: "a = Δv / Δt", condition: "速度变化量和时间间隔应对应同一过程。", dimensionEquation: "a=v/t" },
    { id: "motion-x", stage: "高中", topic: "匀变速运动", name: "位移公式", formula: "x = v₀t + ½at²", condition: "加速度恒定；各量正负号服从同一坐标轴。", dimensionEquation: "x=v*t+a*t^2" },
    { id: "newton-2", stage: "全部", topic: "力学", name: "牛顿第二定律", formula: "F合 = ma", condition: "F合为研究对象所受外力的矢量和；方向与加速度一致。", dimensionEquation: "F=m*a" },
    { id: "pressure", stage: "初中", topic: "压强", name: "压强", formula: "p = F / S", condition: "F 为垂直作用在受力面上的压力。", dimensionEquation: "p=F/S" },
    { id: "buoyancy", stage: "初中", topic: "浮力", name: "阿基米德原理", formula: "F浮 = ρ液gV排", condition: "V排为浸入液体部分排开的液体体积。", dimensionEquation: "F=rho*g*V" },
    { id: "work", stage: "全部", topic: "功和能", name: "恒力做功", formula: "W = Fs cosθ", condition: "F 为恒力，θ 为力与位移的夹角。", dimensionEquation: "W=F*s" },
    { id: "kinetic", stage: "高中", topic: "机械能", name: "动能", formula: "Eₖ = ½mv²", condition: "速度相对所选参考系。", dimensionEquation: "E=m*v^2" },
    { id: "potential", stage: "全部", topic: "机械能", name: "重力势能", formula: "Eₚ = mgh", condition: "近地面匀强重力场；先选定零势能面。", dimensionEquation: "E=m*g*h" },
    { id: "momentum", stage: "高中", topic: "动量", name: "动量", formula: "p动 = mv", condition: "动量是矢量，方向与速度一致。", dimensionEquation: "momentum=m*v" },
    { id: "impulse", stage: "高中", topic: "动量", name: "动量定理", formula: "F合Δt = Δp", condition: "F合应取过程内的合外力；注意矢量方向。", dimensionEquation: "F*t=momentum" },
    { id: "ohm", stage: "全部", topic: "电路", name: "欧姆定律", formula: "I = U / R", condition: "适用于给定状态下的导体；电阻可能随温度变化。", dimensionEquation: "I=U/R" },
    { id: "electric-power", stage: "全部", topic: "电功率", name: "电功率", formula: "P = UI", condition: "U、I 应对应同一用电器和同一工作状态。", dimensionEquation: "P=U*I" },
    { id: "coulomb", stage: "高中", topic: "电场", name: "库仑定律", formula: "F = k|q₁q₂| / r²", condition: "真空中的静止点电荷；r 为两电荷距离。", dimensionEquation: "" },
    { id: "electric-field", stage: "高中", topic: "电场", name: "电场强度定义", formula: "E场 = F / q", condition: "试探电荷足够小；方向按正电荷受力方向规定。", dimensionEquation: "field=F/q" },
    { id: "magnetic", stage: "高中", topic: "磁场", name: "洛伦兹力", formula: "F = qvB sinθ", condition: "θ 为速度与磁场夹角；力垂直于速度和磁场。", dimensionEquation: "F=q*v*B" },
    { id: "induction", stage: "高中", topic: "电磁感应", name: "法拉第电磁感应定律", formula: "E感 = n|ΔΦ/Δt|", condition: "n 为线圈匝数；方向由楞次定律判断。", dimensionEquation: "" },
    { id: "wave", stage: "全部", topic: "机械波", name: "波速", formula: "v = λf", condition: "同一均匀介质中的稳定波；频率由波源决定。", dimensionEquation: "v=lambda*f" },
    { id: "lens", stage: "初中", topic: "透镜", name: "薄透镜成像", formula: "1/f = 1/u + 1/v", condition: "近轴光线、薄透镜模型；实虚量的符号约定应统一。", dimensionEquation: "" },
    { id: "gas", stage: "高中", topic: "热学", name: "理想气体状态方程", formula: "pV / T = 常量", condition: "一定质量的理想气体；T 必须使用热力学温度。", dimensionEquation: "" }
  ];

  const constants = [
    ["标准重力加速度", "g₀", "9.80665 m/s²", "定义值；中学习题常按题设取 9.8 或 10 m/s²"],
    ["真空光速", "c", "299 792 458 m/s", "定义值"],
    ["元电荷", "e", "1.602 176 634 × 10⁻¹⁹ C", "定义值"],
    ["普朗克常量", "h", "6.626 070 15 × 10⁻³⁴ J·s", "定义值"],
    ["阿伏伽德罗常量", "Nₐ", "6.022 140 76 × 10²³ mol⁻¹", "定义值"],
    ["玻尔兹曼常量", "k", "1.380 649 × 10⁻²³ J/K", "定义值"],
    ["真空磁导率", "μ₀", "约 1.256 637 062 × 10⁻⁶ N/A²", "实验确定值"],
    ["电子质量", "mₑ", "约 9.109 383 714 × 10⁻³¹ kg", "推荐值"],
    ["质子质量", "mₚ", "约 1.672 621 926 × 10⁻²⁷ kg", "推荐值"],
    ["水的密度", "ρ水", "约 1.0 × 10³ kg/m³", "中学习题常用近似值，随温度变化"]
  ];

  const lawHints = [
    [/惯性|牛顿第一|匀速/, "先判断研究对象所受合力是否为零，再用牛顿第一定律描述运动状态。"],
    [/受力|摩擦|斜面|牛顿第二/, "隔离研究对象，画出全部外力，选坐标轴后分方向列牛顿第二定律。"],
    [/机械能|动能|势能|功和能/, "先确定系统和始末状态，再检查是否只有保守力做功或应用动能定理。"],
    [/动量|碰撞|冲量/, "先确定系统与过程，检查外力冲量能否忽略，再按选定正方向写动量方程。"],
    [/电路|欧姆|电功率|电热/, "先识别串并联关系与电表对象，再用电路约束、欧姆定律和功率关系。"],
    [/电场|带电粒子/, "先判断电场力方向与做功正负，再选择动力学、能量或类平抛模型。"],
    [/磁场|洛伦兹|电磁感应/, "先用左手定则或楞次定律判断方向，再写受力、圆周运动或能量方程。"],
    [/浮力|密度/, "明确浸没体积与排液体积，比较浮力、重力或物体与液体密度。"],
    [/光|透镜|平面镜/, "先画实际光线，再区分实际光线与反向延长线，最后判断实像或虚像。"],
    [/波|振动|声音/, "区分介质质点振动与波的传播，用周期、频率、波长和相位关系建模。"],
    [/热|温度|比热|气体/, "先划分物态或气体过程，明确状态量与过程量，再选热量或状态方程。"]
  ];

  const unitDefinitions = {
    m: { dimension: "L", factor: 1 },
    cm: { dimension: "L", factor: 0.01 },
    mm: { dimension: "L", factor: 0.001 },
    km: { dimension: "L", factor: 1000 },
    s: { dimension: "T", factor: 1 },
    min: { dimension: "T", factor: 60 },
    h: { dimension: "T", factor: 3600 },
    "m/s": { dimension: "speed", factor: 1 },
    "km/h": { dimension: "speed", factor: 1 / 3.6 },
    kg: { dimension: "M", factor: 1 },
    g: { dimension: "M", factor: 0.001 },
    N: { dimension: "force", factor: 1 },
    Pa: { dimension: "pressure", factor: 1 },
    kPa: { dimension: "pressure", factor: 1000 },
    J: { dimension: "energy", factor: 1 },
    kJ: { dimension: "energy", factor: 1000 },
    W: { dimension: "power", factor: 1 },
    kW: { dimension: "power", factor: 1000 },
    V: { dimension: "voltage", factor: 1 },
    A: { dimension: "current", factor: 1 },
    mA: { dimension: "current", factor: 0.001 },
    Ω: { dimension: "resistance", factor: 1 },
    "m³": { dimension: "volume", factor: 1 },
    "cm³": { dimension: "volume", factor: 1e-6 },
    "kg/m³": { dimension: "density", factor: 1 },
    "g/cm³": { dimension: "density", factor: 1000 },
    Hz: { dimension: "frequency", factor: 1 }
  };

  const quantityDimensions = {
    s: { L: 1 }, x: { L: 1 }, h: { L: 1 }, r: { L: 1 }, L: { L: 1 },
    u: { L: 1 }, lambda: { L: 1 }, V: { L: 3 }, S: { L: 2 },
    t: { T: 1 }, T: { T: 1 }, f: { T: -1 },
    v: { L: 1, T: -1 }, v0: { L: 1, T: -1 },
    a: { L: 1, T: -2 }, g: { L: 1, T: -2 },
    m: { M: 1 }, rho: { M: 1, L: -3 },
    F: { M: 1, L: 1, T: -2 }, N: { M: 1, L: 1, T: -2 },
    p: { M: 1, L: -1, T: -2 },
    W: { M: 1, L: 2, T: -2 }, E: { M: 1, L: 2, T: -2 },
    P: { M: 1, L: 2, T: -3 },
    momentum: { M: 1, L: 1, T: -1 },
    q: { I: 1, T: 1 }, I: { I: 1 },
    U: { M: 1, L: 2, T: -3, I: -1 },
    R: { M: 1, L: 2, T: -3, I: -2 },
    B: { M: 1, T: -2, I: -1 },
    field: { M: 1, L: 1, T: -3, I: -1 }
  };

  function createId(prefix = "record") {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isPublishedQuestion(question = {}) {
    const catalogCheck = globalThis.PhysicsStudioContentCatalog?.isPublishedQuestion;
    if (catalogCheck) return catalogCheck(question);
    return Boolean(question
      && !question.resourceOnly
      && question.fullTextIncluded !== false
      && question.contentReviewStatus !== "待教师审核"
      && question.contentReviewStatus !== "教师已退回");
  }

  function defaultState() {
    return {
      version: STATE_VERSION,
      activeProfileId: "student-default",
      profiles: [{
        id: "student-default",
        name: "本机学生",
        role: "student",
        stage: "高中",
        grade: "高一",
        subject: "物理",
        goal: "日常巩固",
        analysisNote: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      diagnosticAttempts: [],
      attempts: [],
      reviews: {},
      assignments: [],
      learningPlans: [],
      examRecords: [],
      growthRecords: [],
      importedReports: [],
      contentReviews: {},
      experimentRecords: [],
      settings: { dailyGoal: 5, preferredStage: "全部" },
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeState(value) {
    const fallback = defaultState();
    if (!value || typeof value !== "object") return fallback;
    return {
      ...fallback,
      ...value,
      version: STATE_VERSION,
      profiles: Array.isArray(value.profiles) && value.profiles.length
        ? value.profiles.map(normalizeProfile).map((profile) => {
          return profile.id === "student-default" && profile.role !== "student"
            ? { ...profile, role: "student" }
            : profile;
        })
        : fallback.profiles,
      diagnosticAttempts: Array.isArray(value.diagnosticAttempts) ? value.diagnosticAttempts : [],
      attempts: Array.isArray(value.attempts) ? value.attempts : [],
      reviews: value.reviews && typeof value.reviews === "object" && !Array.isArray(value.reviews) ? value.reviews : {},
      assignments: Array.isArray(value.assignments) ? value.assignments : [],
      learningPlans: Array.isArray(value.learningPlans) ? value.learningPlans.slice(-500) : [],
      examRecords: Array.isArray(value.examRecords) ? value.examRecords.slice(-2000) : [],
      growthRecords: Array.isArray(value.growthRecords) ? value.growthRecords.slice(-2000) : [],
      importedReports: Array.isArray(value.importedReports) ? value.importedReports : [],
      contentReviews: value.contentReviews && typeof value.contentReviews === "object" ? value.contentReviews : {},
      experimentRecords: Array.isArray(value.experimentRecords) ? value.experimentRecords : [],
      settings: { ...fallback.settings, ...(value.settings || {}) }
    };
  }

  function loadState() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (error) {
      console.warn("学习闭环数据读取失败，已使用空白档案。", error);
      return defaultState();
    }
  }

  function saveState(value) {
    const normalized = normalizeState(value);
    normalized.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function activeProfile(state) {
    return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
  }

  function normalizeProfile(profile) {
    const grade = ["八年级", "九年级", "高一", "高二", "高三"].includes(profile?.grade)
      ? profile.grade
      : "高一";
    return {
      id: String(profile?.id || createId("profile")).slice(0, 160),
      name: String(profile?.name || "本机学生").trim().slice(0, 30) || "本机学生",
      role: ["student", "teacher", "parent"].includes(profile?.role) ? profile.role : "student",
      stage: ["八年级", "九年级"].includes(grade) ? "初中" : "高中",
      grade,
      subject: "物理",
      goal: String(profile?.goal || "日常巩固").slice(0, 40),
      analysisNote: String(profile?.analysisNote || "").slice(0, 2000),
      createdAt: profile?.createdAt || new Date().toISOString(),
      updatedAt: profile?.updatedAt || profile?.createdAt || new Date().toISOString()
    };
  }

  function addProfile(state, input = {}) {
    const profile = normalizeProfile({
      ...input,
      id: createId("profile"),
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    state.profiles.push(profile);
    return profile;
  }

  function updateProfile(state, profileId, changes = {}) {
    const index = state.profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) throw new Error("未找到学生档案。");
    const current = state.profiles[index];
    const updated = normalizeProfile({
      ...current,
      ...changes,
      id: current.id,
      role: current.role,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    });
    state.profiles[index] = updated;
    return updated;
  }

  function deleteProfile(state, profileId) {
    if (state.profiles.length <= 1) throw new Error("至少保留一个本机档案。");
    const index = state.profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) return false;
    state.profiles.splice(index, 1);
    state.attempts = state.attempts.filter((attempt) => attempt.profileId !== profileId);
    state.diagnosticAttempts = state.diagnosticAttempts.filter((attempt) => attempt.profileId !== profileId);
    state.examRecords = state.examRecords.filter((record) => record.profileId !== profileId);
    state.growthRecords = state.growthRecords.filter((record) => record.profileId !== profileId);
    state.experimentRecords = state.experimentRecords.filter((record) => record.profileId !== profileId);
    state.learningPlans = state.learningPlans.filter((plan) => plan.profileId !== profileId);
    Object.keys(state.reviews).forEach((key) => {
      if (state.reviews[key]?.profileId === profileId) delete state.reviews[key];
    });
    if (state.activeProfileId === profileId) state.activeProfileId = state.profiles[0].id;
    return true;
  }

  function recordDiagnostic(state, input) {
    const item = misconceptionCatalog.find((entry) => entry.diagnostic.id === input.diagnosticId);
    if (!item) throw new Error("Unknown diagnostic item");
    const answerCorrect = input.answer === item.diagnostic.correctAnswer;
    const reasonCorrect = input.reason === item.diagnostic.correctReason;
    const confidence = Math.max(1, Math.min(5, Number(input.confidence) || 1));
    let classification = "secure";
    if (answerCorrect && !reasonCorrect) classification = confidence >= 4 ? "confident-guess" : "guess";
    else if (!answerCorrect && confidence >= 4) classification = "stable-misconception";
    else if (!answerCorrect) classification = "not-yet-understood";
    else if (confidence <= 2) classification = "fragile-correct";
    const attempt = {
      id: createId("diagnostic"),
      profileId: state.activeProfileId,
      diagnosticId: input.diagnosticId,
      misconceptionCode: item.code,
      answer: input.answer,
      reason: input.reason,
      confidence,
      answerCorrect,
      reasonCorrect,
      classification,
      createdAt: new Date().toISOString()
    };
    state.diagnosticAttempts.push(attempt);
    return { attempt, item };
  }

  function misconceptionProfile(state, profileId = state.activeProfileId) {
    return misconceptionCatalog.map((item) => {
      const evidence = state.diagnosticAttempts.filter((attempt) => {
        return attempt.profileId === profileId && attempt.misconceptionCode === item.code;
      });
      const latest = evidence.at(-1);
      const risk = evidence.reduce((total, attempt) => {
        if (attempt.classification === "stable-misconception") return total + 3;
        if (attempt.classification === "confident-guess") return total + 2;
        if (attempt.classification === "not-yet-understood") return total + 1.5;
        if (attempt.classification === "guess" || attempt.classification === "fragile-correct") return total + 1;
        return Math.max(0, total - 1);
      }, 0);
      return {
        ...item,
        evidenceCount: evidence.length,
        latest,
        risk: Math.min(5, Math.round(risk * 10) / 10),
        status: risk >= 3 ? "高风险" : risk > 0 ? "需观察" : evidence.length ? "已纠正" : "未诊断"
      };
    }).sort((a, b) => b.risk - a.risk);
  }

  function findLawHint(question) {
    const haystack = [
      question.topic,
      question.title,
      ...(Array.isArray(question.examPoints) ? question.examPoints : [])
    ].filter(Boolean).join(" ");
    return lawHints.find(([pattern]) => pattern.test(haystack))?.[1]
      || "先明确研究对象、物理过程和已知未知量，再选择满足适用条件的物理规律。";
  }

  function extractFormulaLines(solution = "") {
    return String(solution)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /=|守恒|定律|公式/.test(line))
      .slice(0, 3);
  }

  function createHintLadder(question) {
    const points = Array.isArray(question.examPoints) && question.examPoints.length
      ? question.examPoints.join("、")
      : question.topic || "相关物理规律";
    const solutionLines = String(question.solution || "").split(/\r?\n/).filter((line) => line.trim());
    const formulaLines = extractFormulaLines(question.solution);
    const partialCount = Math.max(1, Math.ceil(solutionLines.length * 0.45));
    return [
      {
        level: 1,
        label: "方向提示",
        text: `先不要列式。确定研究对象和过程边界，并判断本题主要考察：${points}。`
      },
      {
        level: 2,
        label: "关键规律",
        text: findLawHint(question)
      },
      {
        level: 3,
        label: "公式提示",
        text: formulaLines.length
          ? `可重点检查这些关系及其适用条件：\n${formulaLines.join("\n")}`
          : "从定义式或守恒关系开始，确保每个物理量对应同一研究对象和同一过程。"
      },
      {
        level: 4,
        label: "局部步骤",
        text: solutionLines.slice(0, partialCount).join("\n") || "先写出符号方程，再统一单位代入。"
      },
      {
        level: 5,
        label: "完整解法",
        text: `${question.solution || "暂无完整解法。"}${question.answer ? `\n\n结论：${question.answer}` : ""}`
      }
    ];
  }

  function socraticPrompts(question) {
    const topic = [question.topic, question.title, ...(question.examPoints || [])].join(" ");
    const prompts = [
      "研究对象是谁？系统边界包含哪些物体？",
      "题目可以划分为几个物理过程或状态？",
      "已知量、未知量及其单位分别是什么？",
      "需要作出哪些理想化假设？这些假设为什么合理？"
    ];
    if (/力|运动|碰撞|斜面|抛/.test(topic)) {
      prompts.push("物体受到哪些外力？哪个方向适合建立坐标轴？");
    }
    if (/能|功|动量/.test(topic)) {
      prompts.push("系统满足哪一种守恒条件？是否存在不能忽略的外力功或外力冲量？");
    }
    if (/电路|电流|电压/.test(topic)) {
      prompts.push("哪些元件串联或并联？电压、电流和功率分别对应哪个元件？");
    }
    if (/电场|磁场|电磁/.test(topic)) {
      prompts.push("电荷符号、速度方向和场方向确定后，受力或感应方向是什么？");
    }
    prompts.push("结果的符号、单位、数量级和极限情况是否合理？");
    return prompts.slice(0, 7);
  }

  function normalizeChoice(value) {
    const text = String(value || "").toUpperCase();
    const explicit = text.match(/(?:^|选|答案(?:为|是)?)\s*([A-D](?:\s*[、,，/]\s*[A-D])*)/);
    if (explicit) return [...new Set(explicit[1].match(/[A-D]/g) || [])].sort().join("");
    const tokens = [];
    const pattern = /(^|[^A-Z])([A-D])(?=$|[^A-Z])/g;
    let match;
    while ((match = pattern.exec(text))) tokens.push(match[2]);
    return [...new Set(tokens)].sort().join("");
  }

  function expectedChoice(answer) {
    const match = String(answer || "").match(/选\s*([A-D](?:\s*[、,，/]\s*[A-D])*)/i);
    return match ? normalizeChoice(match[1]) : "";
  }

  function normalizeScientificText(value) {
    const superscript = { "⁻": "-", "⁺": "+", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
    return String(value || "")
      .replace(/[⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (character) => superscript[character])
      .replace(/×\s*10\s*\^?\s*([+-]?\d+)/gi, "e$1")
      .replace(/(\d)\s*·\s*(\d)/g, "$1.$2")
      .replace(/[（(]\s*\d+\s*[）)]/g, " ");
  }

  function extractQuantities(value) {
    const normalized = normalizeScientificText(value);
    const pattern = /([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)\s*(kg\/m(?:\^?3|³)|g\/cm(?:\^?3|³)|km\/h|m\/s(?:\^?2|²)?|cm(?:\^?3|³)|m(?:\^?3|³)|kPa|Pa|kJ|J|kW|W|mA|A|V|Ω|Hz|kg|km|cm|mm|m|min|s|%|℃)?/gi;
    const quantities = [];
    let match;
    while ((match = pattern.exec(normalized))) {
      const number = Number(match[1]);
      if (!Number.isFinite(number)) continue;
      let unit = match[2] || "";
      unit = unit
        .replace(/m\^?2|m²/g, "m²")
        .replace(/m\^?3|m³/g, "m³")
        .replace(/cm\^?3|cm³/g, "cm³");
      quantities.push({ value: number, unit });
    }
    return quantities;
  }

  function comparableValue(quantity) {
    const definition = unitDefinitions[quantity.unit];
    if (!definition) return { value: quantity.value, dimension: quantity.unit || "number" };
    return { value: quantity.value * definition.factor, dimension: definition.dimension };
  }

  function gradeFinalAnswer(question, response) {
    const answer = String(question.answer || "");
    const expected = expectedChoice(answer);
    const actualChoice = normalizeChoice(response);
    if (expected) {
      const correct = actualChoice === expected;
      return {
        status: correct ? "correct" : "incorrect",
        score: correct ? 1 : 0,
        summary: correct ? "选项正确。" : `选项不匹配。你填写的是 ${actualChoice || "空白"}，应重新检查题设和规律。`,
        issues: correct ? [] : [{ type: "choice", location: "最终选项", reason: "选项与参考结论不一致", next: "先核对研究对象和公式适用条件，再重新选择。" }],
        expected: expected.split("").join("、")
      };
    }

    const expectedQuantities = extractQuantities(answer);
    const actualQuantities = extractQuantities(response);
    if (!expectedQuantities.length) {
      return {
        status: "review-required",
        score: null,
        summary: "该题答案包含解释性文本，离线规则无法可靠自动判定，需要教师或学生按评分要点复核。",
        issues: [{ type: "manual", location: "完整作答", reason: "没有可唯一提取的数值或选项答案", next: "逐项对照结论、理由、方向和适用条件，不要只看关键词。" }],
        expected: answer
      };
    }
    if (!actualQuantities.length) {
      return {
        status: "incorrect",
        score: 0,
        summary: "未识别到可比较的数值结果。",
        issues: [{ type: "missing-value", location: "最终答案", reason: "答案缺少明确数值", next: "写出数值、单位；矢量题还要写方向。" }],
        expected: answer
      };
    }

    const count = Math.min(expectedQuantities.length, actualQuantities.length);
    const issues = [];
    let matched = 0;
    for (let index = 0; index < count; index += 1) {
      const expectedValue = comparableValue(expectedQuantities[index]);
      const actualValue = comparableValue(actualQuantities[index]);
      if (expectedValue.dimension !== actualValue.dimension
        && expectedQuantities[index].unit && actualQuantities[index].unit) {
        issues.push({
          type: "unit",
          location: `第 ${index + 1} 个结果`,
          reason: `单位量纲不一致：${actualQuantities[index].unit} 与 ${expectedQuantities[index].unit}`,
          next: "先统一到同一物理量的单位，再比较数值。"
        });
        continue;
      }
      const scale = Math.max(Math.abs(expectedValue.value), 1e-12);
      const relativeError = Math.abs(actualValue.value - expectedValue.value) / scale;
      if (relativeError <= 0.015) {
        matched += 1;
        if (expectedQuantities[index].unit && !actualQuantities[index].unit) {
          issues.push({
            type: "missing-unit",
            location: `第 ${index + 1} 个结果`,
            reason: "数值匹配但没有单位",
            next: `补写单位 ${expectedQuantities[index].unit}。`
          });
        }
      } else {
        issues.push({
          type: Math.sign(actualValue.value) !== Math.sign(expectedValue.value) ? "sign" : "value",
          location: `第 ${index + 1} 个结果`,
          reason: Math.sign(actualValue.value) !== Math.sign(expectedValue.value)
            ? "正负号或方向约定不一致"
            : `数值相对偏差约 ${(relativeError * 100).toFixed(1)}%`,
          next: "检查坐标正方向、单位换算、代入顺序和计算过程。"
        });
      }
    }
    if (actualQuantities.length < expectedQuantities.length) {
      issues.push({
        type: "incomplete",
        location: "多问结果",
        reason: `识别到 ${expectedQuantities.length} 个参考结果，但只填写了 ${actualQuantities.length} 个`,
        next: "逐问作答，确保每个小问都有结论。"
      });
    }
    const ratio = matched / expectedQuantities.length;
    const blockingIssues = issues.filter((issue) => !["missing-unit"].includes(issue.type));
    const missingUnitCount = issues.filter((issue) => issue.type === "missing-unit").length;
    return {
      status: ratio === 1 && issues.length === 0 ? "correct" : ratio > 0 ? "partial" : "incorrect",
      score: Math.max(0, Math.min(1, ratio - blockingIssues.length * 0.05 - missingUnitCount * 0.03)),
      summary: ratio === 1 && !issues.length
        ? "数值和单位均与参考结论一致。"
        : `匹配 ${matched}/${expectedQuantities.length} 个结果；请按错误位置修改。`,
      issues,
      expected: answer
    };
  }

  function verifyPhysicsAnswer(question, response, model = {}, grading = gradeFinalAnswer(question, response)) {
    const issues = grading.issues || [];
    const answer = String(question.answer || "");
    const responseText = String(response || "");
    const expectedQuantities = extractQuantities(answer);
    const equationCandidates = String(model.equations || "")
      .split(/\r?\n|[；;]/)
      .map((line) => line.trim().replace(/[，。].*$/, ""))
      .filter((line) => line.includes("=") && line.split("=").length === 2);
    const dimensionResults = equationCandidates.map((equation) => ({
      equation,
      result: validateDimension(equation)
    }));
    const conservationRelevant = /机械能|动量|电荷|碰撞|能量|守恒/.test([
      question.topic,
      question.title,
      ...(question.examPoints || [])
    ].join(" "));
    const directionRelevant = /方向|矢量|正负|向左|向右|向上|向下|电流方向|受力/.test([
      question.content,
      answer,
      question.topic
    ].join(" "));
    const graphRelevant = /图像|图线|函数|轨迹|x[−-]t|v[−-]t|a[−-]t/.test([
      question.content,
      question.topic,
      ...(question.examPoints || [])
    ].join(" "));
    const hasUnitIssue = issues.some((issue) => issue.type === "unit" || issue.type === "missing-unit");
    const hasSignIssue = issues.some((issue) => issue.type === "sign");
    const numericComparable = expectedQuantities.length > 0;

    return [
      {
        key: "conclusion",
        label: "最终结论",
        status: grading.status === "correct" ? "pass" : grading.status === "review-required" ? "manual" : "fail",
        detail: grading.summary
      },
      {
        key: "unit",
        label: "单位与物理量",
        status: hasUnitIssue ? "fail" : numericComparable && grading.status === "correct" ? "pass" : "manual",
        detail: hasUnitIssue
          ? "已检测到单位缺失或单位所属物理量不一致。"
          : numericComparable && grading.status === "correct"
            ? "参考结果与作答已换算到同类物理量后比较。"
            : "当前答案结构不足以自动确认单位完整性。"
      },
      {
        key: "direction",
        label: "正负号与方向",
        status: hasSignIssue ? "fail" : directionRelevant && /向|正|负|顺|逆/.test(responseText) ? "evidence" : "manual",
        detail: hasSignIssue
          ? "自动比较发现符号不一致，应检查坐标正方向。"
          : directionRelevant
            ? "该题涉及方向；系统只确认作答中是否提供方向证据，仍需核对定义。"
            : "当前题目未提取到明确的方向校验目标。"
      },
      {
        key: "dimension",
        label: "方程量纲",
        status: !dimensionResults.length
          ? "manual"
          : dimensionResults.every((item) => item.result.valid) ? "pass" : "fail",
        detail: !dimensionResults.length
          ? "未提取到可由内置符号表解析的方程。"
          : dimensionResults.map((item) => `${item.equation}：${item.result.status}`).join("；")
      },
      {
        key: "magnitude",
        label: "数值与数量级",
        status: numericComparable
          ? grading.status === "correct" ? "pass" : grading.status === "partial" ? "evidence" : "fail"
          : "manual",
        detail: numericComparable
          ? "按参考结果进行同量纲数值比较；允许 1.5% 的数值舍入误差。"
          : "没有可唯一提取的参考数值，不能自动判断数量级。"
      },
      {
        key: "conservation",
        label: "守恒条件",
        status: conservationRelevant && /守恒/.test(String(model.process || "") + String(model.equations || ""))
          ? "evidence"
          : "manual",
        detail: conservationRelevant
          ? "需要逐项确认系统边界以及外力功、外力冲量或电荷交换条件。"
          : "未识别为必须使用守恒律的题目；仍需按具体过程复核。"
      },
      {
        key: "extreme",
        label: "极限与合理性",
        status: /极限|边界|数量级|合理/.test(String(model.reasonableness || "")) ? "evidence" : "manual",
        detail: "自然语言中的极限条件需要学习者或教师确认，系统不把关键词出现等同于物理正确。"
      },
      {
        key: "graph",
        label: "图像—方程一致性",
        status: graphRelevant && /图|斜率|面积|截距/.test(String(model.reasonableness || "")) ? "evidence" : "manual",
        detail: graphRelevant
          ? "应检查图像的斜率、面积、截距和方程是否对应同一物理量。"
          : "当前题目未提取到必须核对的图像关系。"
      },
      {
        key: "alternative",
        label: "第二种方法复算",
        status: "manual",
        detail: "离线规则引擎不会虚构第二种独立解法；请用定义式、动力学或能量方法交叉复核。"
      }
    ];
  }

  function scoreModeling(model) {
    const checks = [
      ["object", "研究对象", 12, /./],
      ["known", "已知量", 10, /=|已知|给出|m|s|kg|N|V|A|Ω/],
      ["unknown", "未知量", 6, /求|未知|目标|[a-zA-Z]\s*=/],
      ["process", "过程划分", 18, /阶段|过程|初态|末态|碰撞|上升|下落|加速|平衡/],
      ["assumptions", "理想化假设", 12, /忽略|视为|理想|光滑|质点|匀强|不计|恒定/],
      ["coordinates", "坐标系", 8, /正方向|坐标|沿|水平|竖直|切向|径向/],
      ["forces", "受力分析", 12, /重力|支持力|摩擦|拉力|弹力|电场力|洛伦兹力|合力/],
      ["equations", "方程与条件", 12, /=|守恒|定律|公式|平衡/],
      ["reasonableness", "结果检验", 12, /单位|量纲|方向|数量级|极限|守恒|合理|正负/]
    ];
    const detail = {};
    checks.forEach(([key, label, minimum, pattern]) => {
      const value = String(model[key] || "").trim();
      const lengthScore = Math.min(3, value.length / minimum * 3);
      const evidence = pattern.test(value) ? 1 : 0;
      detail[key] = {
        label,
        score: Math.min(4, Math.round((lengthScore + evidence) * 10) / 10),
        feedback: !value
          ? `尚未填写${label}。`
          : evidence ? `${label}中已出现可核查的物理信息。` : `${label}已有内容，但建议补充明确的物理关键词或条件。`
      };
    });
    const total = Object.values(detail).reduce((sum, item) => sum + item.score, 0);
    return { total: Math.round(total / (checks.length * 4) * 100), detail };
  }

  function recordAttempt(state, input) {
    const modelScore = scoreModeling(input.model || {});
    const attempt = {
      id: createId("attempt"),
      profileId: state.activeProfileId,
      questionId: input.questionId,
      topic: input.topic || "待分类",
      stage: input.stage || "全部",
      startedAt: input.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: Math.max(0, Number(input.durationSeconds) || 0),
      confidenceBefore: Math.max(1, Math.min(5, Number(input.confidenceBefore) || 1)),
      confidenceAfter: Math.max(1, Math.min(5, Number(input.confidenceAfter) || 1)),
      hintLevel: Math.max(0, Math.min(5, Number(input.hintLevel) || 0)),
      finalAnswer: String(input.finalAnswer || ""),
      grading: input.grading || { status: "review-required", score: null, issues: [] },
      errorType: input.errorType || "",
      reflection: String(input.reflection || ""),
      selfExplanation: String(input.selfExplanation || ""),
      draftImageData: /^data:image\//.test(String(input.draftImageData || ""))
        && String(input.draftImageData).length <= 900000
        ? String(input.draftImageData)
        : "",
      draftImageName: String(input.draftImageName || "").slice(0, 120),
      model: input.model || {},
      modelScore,
      transferType: input.transferType || "",
      createdAt: new Date().toISOString()
    };
    state.attempts.push(attempt);
    return attempt;
  }

  function scheduleReview(state, questionId, rating, now = Date.now()) {
    const profileId = state.activeProfileId;
    const storageKey = `${profileId}::${questionId}`;
    const legacy = state.reviews[questionId];
    const previous = state.reviews[storageKey]
      || (legacy && (!legacy.profileId || legacy.profileId === profileId) ? legacy : null)
      || {
      questionId,
      intervalDays: 0,
      ease: 2.3,
      repetitions: 0,
      lapses: 0
    };
    const normalizedRating = Math.max(0, Math.min(3, Number(rating) || 0));
    let intervalDays;
    let repetitions = previous.repetitions;
    let lapses = previous.lapses;
    let ease = previous.ease;
    if (normalizedRating === 0) {
      intervalDays = 10 / (24 * 60);
      repetitions = 0;
      lapses += 1;
      ease = Math.max(1.5, ease - 0.2);
    } else if (normalizedRating === 1) {
      intervalDays = repetitions === 0 ? 1 : Math.max(1, previous.intervalDays * 1.2);
      repetitions += 1;
      ease = Math.max(1.5, ease - 0.1);
    } else if (normalizedRating === 2) {
      intervalDays = repetitions === 0 ? 3 : Math.max(3, previous.intervalDays * ease);
      repetitions += 1;
    } else {
      intervalDays = repetitions === 0 ? 7 : Math.max(7, previous.intervalDays * (ease + 0.4));
      repetitions += 1;
      ease = Math.min(3.2, ease + 0.08);
    }
    intervalDays = Math.min(180, Math.round(intervalDays * 10000) / 10000);
    const review = {
      ...previous,
      profileId,
      intervalDays,
      ease,
      repetitions,
      lapses,
      lastRating: normalizedRating,
      lastReviewedAt: new Date(now).toISOString(),
      dueAt: new Date(now + intervalDays * DAY).toISOString()
    };
    state.reviews[storageKey] = review;
    if (state.reviews[questionId] === legacy) delete state.reviews[questionId];
    return review;
  }

  function reviewsForProfile(state, profileId = state.activeProfileId) {
    const byQuestion = new Map();
    Object.values(state.reviews).forEach((review) => {
      if (!review?.questionId) return;
      const belongsToProfile = review.profileId
        ? review.profileId === profileId
        : profileId === "student-default";
      if (!belongsToProfile) return;
      const current = byQuestion.get(review.questionId);
      const currentTime = new Date(current?.lastReviewedAt || 0).getTime();
      const candidateTime = new Date(review.lastReviewedAt || 0).getTime();
      if (!current || candidateTime >= currentTime) byQuestion.set(review.questionId, review);
    });
    return [...byQuestion.values()];
  }

  function dueReviews(state, now = Date.now(), profileId = state.activeProfileId) {
    return reviewsForProfile(state, profileId)
      .filter((review) => new Date(review.dueAt).getTime() <= now)
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  }

  function localDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function transferEvidence(state, questionId, profileId = state.activeProfileId) {
    return state.experimentRecords.filter((record) => {
      return record?.type === "transfer"
        && record.questionId === questionId
        && record.profileId === profileId
        && String(record.response || "").trim().length >= 10
        && ["教师已通过", "自动判定正确"].includes(record.verificationStatus);
    });
  }

  function questionMasteryEvidence(state, questionId, profileId = state.activeProfileId, now = Date.now()) {
    const attempts = state.attempts
      .filter((attempt) => attempt.profileId === profileId && attempt.questionId === questionId)
      .sort((a, b) => new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt));
    const latest = attempts.at(-1) || null;
    const independentCorrect = attempts.filter((attempt) => {
      return attempt.grading?.status === "correct"
        && Number(attempt.hintLevel || 0) <= MASTERY_RULES.independentHintMaximum;
    });
    const independentDates = [...new Set(independentCorrect
      .map((attempt) => localDateKey(attempt.completedAt || attempt.createdAt))
      .filter(Boolean))];
    const transfers = transferEvidence(state, questionId, profileId);
    const review = reviewsForProfile(state, profileId).find((item) => item.questionId === questionId) || null;
    const reviewDue = Boolean(review && new Date(review.dueAt).getTime() <= now);
    const latestWeak = Boolean(latest && (
      !["correct", "review-required"].includes(latest.grading?.status)
      || Number(latest.hintLevel || 0) >= MASTERY_RULES.weakHintMinimum
      || (Number.isFinite(Number(latest.modelScore?.total))
        && Number(latest.modelScore.total) < MASTERY_RULES.weakModelingBelow)
    ));

    let status = "未开始";
    let code = "not-started";
    if (attempts.length) {
      status = "学习中";
      code = "learning";
    }
    if (independentCorrect.length >= 1) {
      status = "熟练";
      code = "proficient";
    }
    if (independentDates.length >= MASTERY_RULES.masteredIndependentDates
      && transfers.length >= MASTERY_RULES.masteredTransferEvidence) {
      status = reviewDue ? "待复习" : "已掌握";
      code = reviewDue ? "due" : "mastered";
    }
    if (latestWeak) {
      status = "薄弱";
      code = "weak";
    }

    const reasons = [];
    if (!attempts.length) reasons.push("尚无正式作答记录");
    else reasons.push(`已完成 ${attempts.length} 次正式作答`);
    if (independentCorrect.length) reasons.push(`${independentCorrect.length} 次低提示独立正确`);
    if (independentDates.length) reasons.push(`分布在 ${independentDates.length} 个日期`);
    if (transfers.length) reasons.push(`完成 ${transfers.length} 道迁移记录（尚需人工核对质量）`);
    if (latestWeak) reasons.push("近期存在错误、高提示依赖或较低建模评分");
    if (reviewDue) reasons.push("已到间隔复习时间");

    return {
      questionId,
      profileId,
      code,
      status,
      attempts: attempts.length,
      independentCorrect: independentCorrect.length,
      independentDates: independentDates.length,
      transferEvidence: transfers.length,
      reviewDue,
      latest,
      review,
      reasons,
      rules: MASTERY_RULES
    };
  }

  function masteryProfile(state, questions = [], profileId = state.activeProfileId, now = Date.now()) {
    return questions.map((question) => ({
      question,
      ...questionMasteryEvidence(state, question.id, profileId, now)
    }));
  }

  function masterySummary(state, questions = [], profileId = state.activeProfileId, now = Date.now()) {
    const profile = masteryProfile(state, questions, profileId, now);
    const counts = {
      "未开始": 0,
      "学习中": 0,
      "熟练": 0,
      "已掌握": 0,
      "待复习": 0,
      "薄弱": 0
    };
    profile.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    const evidenced = profile.filter((item) => item.code !== "not-started").length;
    const mastered = counts["已掌握"] + counts["待复习"];
    return {
      total: profile.length,
      evidenced,
      mastered,
      masteryRate: profile.length ? Math.round(mastered / profile.length * 100) : 0,
      counts,
      profile,
      rules: MASTERY_RULES
    };
  }

  function topicPerformance(state, profileId = state.activeProfileId) {
    const groups = new Map();
    state.attempts.filter((attempt) => attempt.profileId === profileId).forEach((attempt) => {
      const topic = attempt.topic || "待分类";
      const current = groups.get(topic) || { topic, attempts: 0, correct: 0, scoreTotal: 0, hintTotal: 0, modelTotal: 0 };
      current.attempts += 1;
      current.correct += attempt.grading?.status === "correct" ? 1 : 0;
      current.scoreTotal += Number(attempt.grading?.score) || 0;
      current.hintTotal += Number(attempt.hintLevel) || 0;
      current.modelTotal += Number(attempt.modelScore?.total) || 0;
      groups.set(topic, current);
    });
    return [...groups.values()].map((item) => ({
      ...item,
      accuracy: item.attempts ? Math.round(item.correct / item.attempts * 100) : 0,
      averageScore: item.attempts ? Math.round(item.scoreTotal / item.attempts * 100) : 0,
      averageHint: item.attempts ? Math.round(item.hintTotal / item.attempts * 10) / 10 : 0,
      modeling: item.attempts ? Math.round(item.modelTotal / item.attempts) : 0
    })).sort((a, b) => a.averageScore - b.averageScore || b.attempts - a.attempts);
  }

  function summarizeLearning(state, questions = [], profileId = state.activeProfileId) {
    const attempts = state.attempts.filter((attempt) => attempt.profileId === profileId);
    const completed = attempts.length;
    const correct = attempts.filter((attempt) => attempt.grading?.status === "correct").length;
    const independent = attempts.filter((attempt) => {
      return attempt.grading?.status === "correct" && Number(attempt.hintLevel) <= 1;
    }).length;
    const durationSeconds = attempts.reduce((sum, attempt) => sum + (Number(attempt.durationSeconds) || 0), 0);
    const hintTotal = attempts.reduce((sum, attempt) => sum + (Number(attempt.hintLevel) || 0), 0);
    const recent = attempts.slice(-14);
    const trend = recent.map((attempt, index) => ({
      index: index + 1,
      score: Math.round((Number(attempt.grading?.score) || 0) * 100),
      hintLevel: attempt.hintLevel,
      date: attempt.createdAt
    }));
    const due = dueReviews(state);
    const topics = topicPerformance(state, profileId);
    const mastery = masterySummary(state, questions, profileId);
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    return {
      completed,
      correct,
      accuracy: completed ? Math.round(correct / completed * 100) : 0,
      independent,
      independenceRate: completed ? Math.round(independent / completed * 100) : 0,
      averageHint: completed ? Math.round(hintTotal / completed * 10) / 10 : 0,
      learningMinutes: Math.round(durationSeconds / 60),
      dueCount: due.length,
      dueQuestions: due.map((review) => ({ ...review, question: questionMap.get(review.questionId) })).filter((item) => item.question),
      topics,
      trend,
      misconceptionProfile: misconceptionProfile(state, profileId),
      mastery
    };
  }

  function modelingRadar(state, profileId = state.activeProfileId) {
    const attempts = state.attempts.filter((attempt) => attempt.profileId === profileId && attempt.modelScore?.detail);
    const axes = [
      ["object", "研究对象"],
      ["known", "已知量"],
      ["unknown", "未知量"],
      ["process", "过程划分"],
      ["assumptions", "理想化"],
      ["coordinates", "坐标系"],
      ["forces", "受力分析"],
      ["equations", "方程条件"],
      ["reasonableness", "合理性检验"]
    ];
    return axes.map(([key, label]) => {
      const values = attempts.map((attempt) => Number(attempt.modelScore.detail[key]?.score) || 0);
      return {
        key,
        label,
        value: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 4 * 100) : 0
      };
    });
  }

  function recommendations(state, questions, limit = 8, options = {}) {
    const now = Date.now();
    const profileId = options.profileId || state.activeProfileId;
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const dueMap = new Map(dueReviews(state, now, profileId).map((review) => [review.questionId, review]));
    const recentAttempts = new Map();
    state.attempts.filter((attempt) => attempt.profileId === profileId).forEach((attempt) => {
      recentAttempts.set(attempt.questionId, attempt);
    });
    const topicRisk = new Map(topicPerformance(state, profileId).map((item, index) => [
      item.topic,
      Math.max(0, 40 - item.averageScore * 0.4) + Math.max(0, 3 - index)
    ]));
    const examWeakness = new Map();
    state.examRecords
      .filter((record) => record.profileId === profileId)
      .slice(-12)
      .forEach((record) => (record.weakTopics || []).forEach((topic) => {
        examWeakness.set(topic, (examWeakness.get(topic) || 0) + 1);
      }));
    const ranked = questions
      .filter((question) => isPublishedQuestion(question)
        && (!profile?.grade || question.grade === profile.grade))
      .map((question) => {
        const last = recentAttempts.get(question.id);
        let score = 0;
        const reasons = [];
        if (dueMap.has(question.id)) {
          score += 100;
          reasons.push("已到间隔复习时间");
        }
        if (!last) {
          score += 8;
        } else {
          if (last.grading?.status !== "correct") {
            score += 70;
            reasons.push("本人上次作答未完全正确");
          }
          if (last.hintLevel >= 3) {
            score += 25;
            reasons.push(`上次使用第 ${last.hintLevel} 级提示`);
          }
          if (last.modelScore?.total < 60) {
            score += 20;
            reasons.push("建模步骤需要加强");
          }
          if (last.errorType) {
            score += 10;
            reasons.push(`上次主要错误：${last.errorType}`);
          }
        }
        score += topicRisk.get(question.topic) || 0;
        const examWeakCount = examWeakness.get(question.topic) || 0;
        if (examWeakCount) {
          score += Math.min(45, 20 + examWeakCount * 5);
          reasons.push(`最近试卷将“${question.topic}”标为薄弱项`);
        }
        if (options.focusTopic && options.focusTopic !== "自动依据学情") {
          if (question.topic === options.focusTopic) {
            score += 120;
            reasons.unshift(`教师指定专项：${options.focusTopic}`);
          } else {
            score -= 80;
          }
        }
        if (!reasons.length) reasons.push("用于形成初始诊断证据");
        return { question, score, reasons: reasons.slice(0, 3) };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.question.title.localeCompare(b.question.title, "zh-CN"));

    const selected = [];
    const seenFamilies = new Set();
    for (const item of ranked) {
      const family = item.question.modelFamilyId || item.question.id;
      if (seenFamilies.has(family)) continue;
      selected.push(item);
      seenFamilies.add(family);
      if (selected.length >= limit) break;
    }
    if (selected.length < limit) {
      ranked.forEach((item) => {
        if (selected.some((chosen) => chosen.question.id === item.question.id)) return;
        selected.push(item);
      });
    }
    return selected.slice(0, limit);
  }

  function addExamRecord(state, input = {}) {
    const profileId = String(input.profileId || state.activeProfileId);
    if (!state.profiles.some((profile) => profile.id === profileId)) {
      throw new Error("试卷记录对应的学生不存在。");
    }
    const score = Number(input.score);
    const totalScore = Number(input.totalScore);
    if (!Number.isFinite(score) || !Number.isFinite(totalScore) || totalScore <= 0 || score < 0 || score > totalScore) {
      throw new Error("试卷得分和总分不符合要求。");
    }
    const date = new Date(input.examDate || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error("考试日期无效。");
    const record = {
      id: createId("exam"),
      profileId,
      title: String(input.title || "物理测试").trim().slice(0, 120) || "物理测试",
      examDate: date.toISOString(),
      score: Math.round(score * 100) / 100,
      totalScore: Math.round(totalScore * 100) / 100,
      percentage: Math.round(score / totalScore * 1000) / 10,
      stage: String(input.stage || activeProfile(state)?.stage || "高中").slice(0, 20),
      grade: String(input.grade || state.profiles.find((profile) => profile.id === profileId)?.grade || "高一").slice(0, 20),
      topics: Array.isArray(input.topics)
        ? input.topics.slice(0, 30).map((topic) => String(topic).trim().slice(0, 100)).filter(Boolean)
        : String(input.topics || "").split(/[、,，;；]/).map((topic) => topic.trim()).filter(Boolean).slice(0, 30),
      weakTopics: Array.isArray(input.weakTopics)
        ? input.weakTopics.slice(0, 30).map((topic) => String(topic).trim().slice(0, 100)).filter(Boolean)
        : String(input.weakTopics || "").split(/[、,，;；]/).map((topic) => topic.trim()).filter(Boolean).slice(0, 30),
      sourceFileName: String(input.sourceFileName || "").slice(0, 160),
      note: String(input.note || "").slice(0, 2000),
      createdAt: new Date().toISOString()
    };
    state.examRecords.push(record);
    return record;
  }

  function importExamRecords(state, records = [], profileId = state.activeProfileId) {
    if (!Array.isArray(records) || records.length > 500) throw new Error("试卷记录数量不符合要求。");
    const added = [];
    const errors = [];
    records.forEach((record, index) => {
      try {
        added.push(addExamRecord(state, { ...record, profileId }));
      } catch (error) {
        errors.push({ index, message: error.message });
      }
    });
    return { added, errors };
  }

  function addGrowthRecord(state, input = {}) {
    const profileId = String(input.profileId || state.activeProfileId);
    if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error("学生档案不存在。");
    const record = {
      id: createId("growth"),
      profileId,
      type: ["milestone", "teacher-note", "goal", "support"].includes(input.type) ? input.type : "teacher-note",
      title: String(input.title || "成长记录").trim().slice(0, 120) || "成长记录",
      detail: String(input.detail || "").trim().slice(0, 3000),
      evidence: String(input.evidence || "").trim().slice(0, 2000),
      recordedAt: new Date(input.recordedAt || Date.now()).toISOString(),
      createdAt: new Date().toISOString()
    };
    state.growthRecords.push(record);
    return record;
  }

  function growthTimeline(state, profileId = state.activeProfileId, limit = 100) {
    const manual = state.growthRecords
      .filter((record) => record.profileId === profileId)
      .map((record) => ({
        id: record.id,
        type: record.type,
        date: record.recordedAt,
        title: record.title,
        detail: record.detail,
        evidence: record.evidence
      }));
    const exams = state.examRecords
      .filter((record) => record.profileId === profileId)
      .map((record) => ({
        id: record.id,
        type: "exam",
        date: record.examDate,
        title: record.title,
        detail: `${record.score}/${record.totalScore}（${record.percentage}%）`,
        evidence: record.weakTopics.length ? `需继续练习：${record.weakTopics.join("、")}` : "未记录薄弱知识点"
      }));
    const attempts = state.attempts
      .filter((attempt) => attempt.profileId === profileId)
      .map((attempt) => ({
        id: attempt.id,
        type: "practice",
        date: attempt.createdAt,
        title: `完成${attempt.topic || "物理"}练习`,
        detail: `${attempt.grading?.status === "correct" ? "作答正确" : "需复核或订正"} · 提示等级 ${attempt.hintLevel}`,
        evidence: `建模评分 ${Number(attempt.modelScore?.total) || 0} · 信心 ${attempt.confidenceBefore}→${attempt.confidenceAfter}`
      }));
    return [...manual, ...exams, ...attempts]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  }

  function studentAnalysis(state, questions = [], profileId = state.activeProfileId) {
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const summary = summarizeLearning(state, questions, profileId);
    const topics = summary.topics;
    const strongest = topics.slice().sort((a, b) => b.averageScore - a.averageScore || b.attempts - a.attempts).slice(0, 3);
    const exams = state.examRecords
      .filter((record) => record.profileId === profileId)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
    const examWeakCounts = new Map();
    exams.slice(-10).forEach((record) => (record.weakTopics || []).forEach((topic) => {
      examWeakCounts.set(topic, (examWeakCounts.get(topic) || 0) + 1);
    }));
    const combinedWeak = new Map(topics.map((topic) => [topic.topic, {
      ...topic,
      evidenceSource: "practice",
      examMentions: examWeakCounts.get(topic.topic) || 0
    }]));
    examWeakCounts.forEach((count, topic) => {
      if (combinedWeak.has(topic)) return;
      combinedWeak.set(topic, {
        topic,
        attempts: 0,
        correct: 0,
        scoreTotal: 0,
        hintTotal: 0,
        modelTotal: 0,
        accuracy: 0,
        averageScore: 0,
        averageHint: 0,
        modeling: 0,
        evidenceSource: "exam-record",
        examMentions: count
      });
    });
    const weakest = [...combinedWeak.values()]
      .sort((a, b) => {
        const aRisk = (a.attempts ? 100 - a.averageScore : 35) + a.examMentions * 15;
        const bRisk = (b.attempts ? 100 - b.averageScore : 35) + b.examMentions * 15;
        return bRisk - aRisk || b.attempts - a.attempts;
      })
      .slice(0, 5);
    const examTrend = exams.slice(-10).map((record) => ({
      date: record.examDate,
      title: record.title,
      percentage: record.percentage
    }));
    const trendDelta = examTrend.length >= 2
      ? Math.round((examTrend.at(-1).percentage - examTrend[0].percentage) * 10) / 10
      : null;
    const priorities = [];
    if (summary.dueCount) priorities.push(`先完成 ${summary.dueCount} 道到期复习题`);
    weakest.forEach((topic) => {
      const causes = [];
      if (topic.examMentions) causes.push(`最近试卷标记 ${topic.examMentions} 次`);
      if (topic.averageHint >= 3) causes.push("提示依赖较高");
      if (topic.modeling < 60) causes.push("建模步骤证据偏弱");
      if (topic.accuracy < 60) causes.push("近期正确率较低");
      priorities.push(`${topic.topic}：${causes.join("、") || "需要增加独立提取练习"}`);
    });
    if (!priorities.length) priorities.push("先完成一组独立作答，形成可分析证据");
    return {
      generatedAt: new Date().toISOString(),
      profile,
      summary,
      weakest,
      strongest,
      examTrend,
      trendDelta,
      priorities: priorities.slice(0, 6),
      growthTimeline: growthTimeline(state, profileId, 40),
      evidenceLevel: summary.completed >= 12 || exams.length >= 3
        ? "较充分"
        : summary.completed >= 4 || exams.length >= 1
          ? "初步"
          : "不足",
      conclusion: summary.completed
        ? `当前分析基于 ${summary.completed} 次正式作答、${exams.length} 次试卷记录；优先级由正确率、提示依赖、建模评分和复习到期情况共同确定。`
        : "当前尚无正式作答证据，不能形成可靠的薄弱环节判断。",
      boundary: "本报告是本机学习行为的形成性分析，不是标准化能力诊断；少量记录、人工评分题和上传材料仍需教师复核。"
    };
  }

  function dailyTest(state, questions = [], options = {}) {
    const profileId = options.profileId || state.activeProfileId;
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const count = Math.max(1, Math.min(8, Number(options.count) || 5));
    const dateKey = String(options.date || new Date().toISOString().slice(0, 10));
    const usableQuestions = questions.filter((question) => {
      return isPublishedQuestion(question)
        && question.grade !== "七年级";
    });
    const candidates = usableQuestions.filter((question) => !profile?.grade || question.grade === profile.grade);
    const scopedState = { ...state, activeProfileId: profileId };
    const priority = recommendations(
      scopedState,
      candidates,
      Math.min(candidates.length, count * 4),
      { profileId }
    );
    const chosen = [];
    const used = new Set();
    priority.slice(0, Math.ceil(count * 0.8)).forEach((item) => {
      chosen.push({ ...item, source: "weakness-and-review" });
      used.add(item.question.id);
    });
    seededShuffle(candidates.filter((question) => !used.has(question.id)), `${profileId}|${dateKey}`)
      .slice(0, Math.max(0, count - chosen.length))
      .forEach((question) => {
        used.add(question.id);
        chosen.push({
          question,
          score: 0,
          reasons: ["按日期固定抽取，兼顾未覆盖知识点"],
          source: "daily-variety"
        });
      });
    if (chosen.length < count) {
      const sameStageFallback = usableQuestions.filter((question) => {
        return !used.has(question.id) && (!profile?.grade || question.grade === profile.grade);
      });
      seededShuffle(sameStageFallback, `${profileId}|${dateKey}|stage-fallback`)
        .slice(0, count - chosen.length)
        .forEach((question) => {
          used.add(question.id);
          chosen.push({
            question,
            score: 0,
            reasons: ["补充当前年级尚未覆盖的知识点"],
            source: "same-grade-fallback"
          });
        });
    }
    return {
      id: `daily-${profileId}-${dateKey}`,
      profileId,
      date: dateKey,
      title: `${dateKey} 课后物理测试`,
      questionCount: chosen.length,
      items: chosen,
      generationRule: "默认5题、最多8题：优先选取到期复习、本人近期错题、试卷薄弱点、高提示依赖或低建模评分题，再补当前年级迁移题；同一天重复打开保持一致。"
    };
  }

  function activeLearningPlan(state, profileId = state.activeProfileId) {
    return state.learningPlans
      .filter((plan) => plan.profileId === profileId && plan.status === "active")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
  }

  function learningPlanProgress(state, plan) {
    if (!plan) return { completed: 0, total: 0, percent: 0, completedQuestionIds: [] };
    const startedAt = new Date(plan.createdAt || 0).getTime();
    const completedQuestionIds = [...new Set(state.attempts
      .filter((attempt) => {
        return attempt.profileId === plan.profileId
          && plan.questionIds.includes(attempt.questionId)
          && new Date(attempt.createdAt || attempt.completedAt || 0).getTime() >= startedAt;
      })
      .map((attempt) => attempt.questionId))];
    return {
      completed: completedQuestionIds.length,
      total: plan.questionIds.length,
      percent: plan.questionIds.length
        ? Math.round(completedQuestionIds.length / plan.questionIds.length * 100)
        : 0,
      completedQuestionIds
    };
  }

  function buildTargetedLearningPlan(state, questions = [], options = {}) {
    const profileId = options.profileId || state.activeProfileId;
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("未找到要制定方案的学生。");
    const count = [3, 5, 7].includes(Number(options.count)) ? Number(options.count) : 5;
    const eligible = questions.filter((question) => {
      return isPublishedQuestion(question)
        && question.grade === profile.grade
        && String(question.content || "").trim()
        && String(question.solution || "").trim()
        && String(question.answer || "").trim();
    });
    if (!eligible.length) throw new Error("当前学生年级没有已发布的完整题。");

    const analysis = studentAnalysis(state, eligible, profileId);
    const requestedTopic = String(options.focusTopic || "").trim();
    const focusTopic = requestedTopic && requestedTopic !== "自动依据学情"
      ? requestedTopic
      : analysis.weakest[0]?.topic || eligible[0].topic;
    const topicQuestions = eligible.filter((question) => question.topic === focusTopic);
    const pool = topicQuestions.length ? topicQuestions : eligible;
    const questionMap = new Map(eligible.map((question) => [question.id, question]));
    const recentWrong = state.attempts
      .filter((attempt) => attempt.profileId === profileId
        && attempt.topic === focusTopic
        && attempt.grading?.status !== "correct")
      .slice()
      .reverse()
      .map((attempt) => questionMap.get(attempt.questionId))
      .find(Boolean);
    const coreCandidates = pool.filter((question) => question.variantRole === "core" && question.modelFamilyId);
    const anchor = recentWrong?.modelFamilyId
      ? pool.find((question) => question.modelFamilyId === recentWrong.modelFamilyId && question.variantRole === "core") || recentWrong
      : coreCandidates[0] || pool[0];
    const roleOrder = count === 3
      ? ["core", "near", "counter"]
      : ["core", "near", "far", "counter"];
    const selected = [];
    const used = new Set();
    const addQuestion = (question, purpose, reason) => {
      if (!question || used.has(question.id) || selected.length >= count) return;
      used.add(question.id);
      selected.push({
        questionId: question.id,
        modelFamilyId: question.modelFamilyId || "",
        variantRole: question.variantRole || "",
        purpose,
        reason
      });
    };

    if (anchor?.modelFamilyId) {
      roleOrder.forEach((role) => {
        const related = pool.find((question) => {
          return question.modelFamilyId === anchor.modelFamilyId && question.variantRole === role;
        });
        const labels = {
          core: ["前测母题", "先独立作答，确认断点发生在概念、建模、公式还是运算"],
          near: ["条件变化", "保持模型不变，只改变条件，检验公式适用和量值关系"],
          far: ["跨情境迁移", "把同一物理结构迁移到不同表面情境"],
          counter: ["反例辨析", "识别表面相似但规律不适用的条件"]
        };
        addQuestion(related, labels[role][0], labels[role][1]);
      });
    } else {
      addQuestion(anchor, "前测母题", "先形成该知识点的独立作答证据");
    }

    const ranked = recommendations(
      { ...state, activeProfileId: profileId },
      pool,
      Math.min(pool.length, 30),
      { profileId, focusTopic }
    );
    ranked.forEach((item) => {
      const role = item.question.variantRole;
      const purpose = role === "counter" ? "反例复测"
        : role === "far" ? "迁移复测"
          : "专项复测";
      addQuestion(item.question, purpose, item.reasons[0] || `围绕${focusTopic}补充证据`);
    });
    pool.forEach((question) => addQuestion(question, "专项复测", `补充${focusTopic}的不同模型证据`));

    const sourceWeak = analysis.weakest.find((item) => item.topic === focusTopic);
    const evidenceReason = sourceWeak?.examMentions
      ? `最近试卷记录将该知识点标记为薄弱项 ${sourceWeak.examMentions} 次`
      : sourceWeak?.attempts
        ? `已有 ${sourceWeak.attempts} 次作答，平均得分 ${sourceWeak.averageScore}%`
        : "当前证据不足，先用少量题完成诊断，不作能力结论";
    return {
      id: createId("plan"),
      profileId,
      profileName: profile.name,
      grade: profile.grade,
      subject: "物理",
      title: `${focusTopic}专项微循环`,
      focusTopics: [focusTopic],
      target: `用少量题完成“母题理解—条件变化—跨情境迁移—反例辨析—复测”`,
      evidenceLevel: analysis.evidenceLevel,
      evidenceReason,
      questionIds: selected.map((item) => item.questionId),
      items: selected,
      questionCount: selected.length,
      expectedMinutes: selected.length * 8,
      teacherNote: String(options.teacherNote || "").trim().slice(0, 2000),
      status: "draft",
      generatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      selectionRule: "严格限定学生年级；优先本人错题、到期复习、试卷薄弱点和低提示独立作答证据；同一模型采用母题、近迁移、远迁移、反例与复测，不以题量替代诊断。"
    };
  }

  function saveTargetedLearningPlan(state, plan) {
    if (!plan || !state.profiles.some((profile) => profile.id === plan.profileId)) {
      throw new Error("学习方案缺少有效学生。");
    }
    if (!Array.isArray(plan.questionIds) || !plan.questionIds.length || plan.questionIds.length > 8) {
      throw new Error("专项方案题量必须为1至8题。");
    }
    state.learningPlans.forEach((item) => {
      if (item.profileId === plan.profileId && item.status === "active") {
        item.status = "replaced";
        item.updatedAt = new Date().toISOString();
      }
    });
    const saved = {
      ...plan,
      status: "active",
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.learningPlans.push(saved);
    return saved;
  }

  function seededShuffle(items, seedText) {
    let seed = 2166136261;
    for (const character of String(seedText)) {
      seed ^= character.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      seed += 0x6d2b79f5;
      let value = seed;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      const random = ((value ^ value >>> 14) >>> 0) / 4294967296;
      const swapIndex = Math.floor(random * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function transferVariants(question) {
    const topic = [question.topic, question.title, ...(question.examPoints || [])].join(" ");
    const variants = [];
    if (/机械能|动能|势能|功和能/.test(topic)) {
      variants.push(
        { type: "结构迁移", title: "换成弹簧—物块系统", prompt: "保持能量转化结构不变，把重力势能改为弹性势能。重新确定系统边界、初末状态和零势能位置。" },
        { type: "跨情境", title: "换成带电粒子在电场中运动", prompt: "把重力做功替换为电场力做功，比较电势能变化与动能变化的符号关系。" },
        { type: "反例辨析", title: "存在不可忽略摩擦力", prompt: "加入动摩擦后，机械能是否仍守恒？应改用哪一个功能关系，耗散能量如何表示？" }
      );
    } else if (/牛顿|受力|斜面|摩擦/.test(topic)) {
      variants.push(
        { type: "结构迁移", title: "改变斜面角度与摩擦因数", prompt: "保持研究对象不变，比较 θ 增大或 μ 改变时支持力、摩擦力和加速度怎样变化。" },
        { type: "跨情境", title: "迁移到电梯超重失重", prompt: "把斜面坐标改为竖直坐标，用同一牛顿第二定律解释支持力读数变化。" },
        { type: "反例辨析", title: "静摩擦而非滑动摩擦", prompt: "物体未相对滑动时，为什么不能直接写 f = μN？应如何由平衡或动力学求静摩擦力？" }
      );
    } else if (/电路|欧姆|电功率|电热/.test(topic)) {
      variants.push(
        { type: "结构迁移", title: "改变串并联结构", prompt: "把原电路中的一个串联元件改为并联，重新标出各支路电流和元件两端电压。" },
        { type: "跨情境", title: "迁移到传感器动态电路", prompt: "把定值电阻替换为热敏或光敏电阻，判断环境量变化怎样影响电表示数。" },
        { type: "反例辨析", title: "非纯电阻用电器", prompt: "电动机工作时，为什么不能把全部电功都写成 I²Rt？区分输入电能、机械功和内能。" }
      );
    } else if (/电场|磁场|带电粒子/.test(topic)) {
      variants.push(
        { type: "结构迁移", title: "改变粒子电性或入射方向", prompt: "只改变电荷正负或速度方向，重新判断受力方向、轨迹弯曲方向和半径。" },
        { type: "跨情境", title: "电场加速后进入磁场", prompt: "先由电场做功求速度，再由洛伦兹力提供向心力，连接两个物理过程。" },
        { type: "反例辨析", title: "速度不垂直磁场", prompt: "入射速度与磁场不垂直时，为什么轨迹不再是平面圆？分解平行和垂直速度。" }
      );
    } else {
      variants.push(
        { type: "改变条件", title: "改变一个关键参数", prompt: `围绕“${question.topic}”只改变一个已知量，先定性预测结果，再重新计算。` },
        { type: "逆向设问", title: "由结果反求条件", prompt: "把原题结论改为已知量，反求一个关键条件，并检查是否存在多解或无解。" },
        { type: "反例辨析", title: "破坏公式适用条件", prompt: "改变一个使原公式不再适用的条件，说明错误使用会导致什么矛盾。" }
      );
    }
    return variants;
  }

  function dimensionAdd(first, second, multiplier = 1) {
    const result = { ...first };
    Object.entries(second).forEach(([key, value]) => {
      result[key] = (result[key] || 0) + value * multiplier;
      if (Math.abs(result[key]) < 1e-9) delete result[key];
    });
    return result;
  }

  function sameDimension(first, second) {
    return ["M", "L", "T", "I"].every((key) => (first[key] || 0) === (second[key] || 0));
  }

  function parseDimensionTerm(term) {
    let normalized = term.replace(/\s+/g, "").replace(/[·×]/g, "*").replace(/²/g, "^2").replace(/³/g, "^3");
    normalized = normalized.replace(/^\+/, "");
    if (!normalized) return { dimension: {}, unknown: [] };
    const factors = normalized.split(/([*/])/).filter(Boolean);
    let operator = "*";
    let dimension = {};
    const unknown = [];
    factors.forEach((factor) => {
      if (factor === "*" || factor === "/") {
        operator = factor;
        return;
      }
      if (/^[-+]?\d+(?:\.\d+)?$/.test(factor)) return;
      const match = factor.match(/^([A-Za-z]+|rho|lambda)(?:\^([-+]?\d+))?$/);
      if (!match) {
        unknown.push(factor);
        return;
      }
      const symbol = match[1];
      const power = Number(match[2] || 1) * (operator === "/" ? -1 : 1);
      const source = quantityDimensions[symbol];
      if (!source) {
        unknown.push(symbol);
        return;
      }
      dimension = dimensionAdd(dimension, source, power);
    });
    return { dimension, unknown };
  }

  function parseDimensionSide(side) {
    const terms = side.replace(/\s+/g, "").split(/(?=[+-])/).filter(Boolean);
    const parsed = terms.map((term) => parseDimensionTerm(term.replace(/^[+-]/, "")));
    const unknown = parsed.flatMap((item) => item.unknown);
    if (unknown.length) return { dimension: {}, unknown };
    const dimension = parsed[0]?.dimension || {};
    const inconsistentSum = parsed.some((item) => !sameDimension(item.dimension, dimension));
    return { dimension, unknown: [], inconsistentSum };
  }

  function formatDimension(dimension) {
    const entries = ["M", "L", "T", "I"]
      .map((key) => [key, dimension[key] || 0])
      .filter(([, value]) => value !== 0);
    return entries.length ? entries.map(([key, value]) => value === 1 ? key : `${key}^${value}`).join(" ") : "1";
  }

  function validateDimension(equation) {
    const normalized = String(equation || "")
      .replace(/ρ/g, "rho")
      .replace(/λ/g, "lambda")
      .replace(/Δ/g, "")
      .replace(/₀/g, "0");
    const parts = normalized.split("=");
    if (parts.length !== 2) {
      return { valid: false, status: "无法校验", message: "请输入一个只含一个等号的方程，例如 F=m*a。" };
    }
    const left = parseDimensionSide(parts[0]);
    const right = parseDimensionSide(parts[1]);
    const unknown = [...left.unknown, ...right.unknown];
    if (unknown.length) {
      return { valid: false, status: "符号待定义", message: `暂不认识这些符号或表达式：${[...new Set(unknown)].join("、")}。` };
    }
    if (left.inconsistentSum || right.inconsistentSum) {
      return { valid: false, status: "量纲不一致", message: "同一侧相加减的各项量纲不一致。" };
    }
    const valid = sameDimension(left.dimension, right.dimension);
    return {
      valid,
      status: valid ? "量纲一致" : "量纲不一致",
      message: `左侧：[${formatDimension(left.dimension)}]；右侧：[${formatDimension(right.dimension)}]。${valid ? "方程通过量纲检查，但仍需检查物理条件、方向和数值。" : "请检查公式、指数或物理量定义。"}`
    };
  }

  function convertUnit(value, from, to) {
    const source = unitDefinitions[from];
    const target = unitDefinitions[to];
    if (!source || !target) throw new Error("不支持的单位");
    if (source.dimension !== target.dimension) throw new Error("两个单位不属于同一物理量");
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("请输入有效数值");
    return number * source.factor / target.factor;
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function standardDeviation(values) {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
  }

  function linearRegression(points) {
    const usable = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (usable.length < 2) return { slope: 0, intercept: 0, r2: 0, count: usable.length };
    const xMean = mean(usable.map((point) => point.x));
    const yMean = mean(usable.map((point) => point.y));
    const numerator = usable.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
    const denominator = usable.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
    const slope = denominator ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;
    const total = usable.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0);
    const residual = usable.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0);
    const r2 = total ? 1 - residual / total : 1;
    return { slope, intercept, r2, count: usable.length };
  }

  function generateAssignment(questions, options = {}) {
    const count = Math.max(1, Math.min(50, Number(options.count) || 10));
    const candidates = questions.filter((question) => {
      const topicMatch = !options.topic || options.topic === "全部" || question.topic === options.topic;
      const difficultyMatch = !options.difficulty || options.difficulty === "全部" || question.difficulty === options.difficulty;
      const stageMatch = !options.stage || options.stage === "全部" || question.stage === options.stage;
      const gradeMatch = !options.grade || options.grade === "全部" || question.grade === options.grade;
      return topicMatch && difficultyMatch && stageMatch && gradeMatch && isPublishedQuestion(question);
    });
    const ranked = candidates.sort((a, b) => {
      const difficultyOrder = { 基础: 1, 进阶: 2, 挑战: 3 };
      return (difficultyOrder[a.difficulty] || 2) - (difficultyOrder[b.difficulty] || 2)
        || a.title.localeCompare(b.title, "zh-CN");
    });
    const selected = [];
    if (ranked.length) {
      const step = ranked.length / Math.min(count, ranked.length);
      for (let index = 0; index < Math.min(count, ranked.length); index += 1) {
        selected.push(ranked[Math.min(ranked.length - 1, Math.floor(index * step))]);
      }
    }
    return {
      id: createId("assignment"),
      title: options.title || `${options.topic && options.topic !== "全部" ? options.topic : "物理"}分层练习`,
      stage: options.stage || "全部",
      grade: options.grade || "全部",
      topic: options.topic || "全部",
      difficulty: options.difficulty || "全部",
      questionIds: selected.map((question) => question.id),
      questionCount: selected.length,
      reviewStatus: "教师待审核",
      createdAt: new Date().toISOString()
    };
  }

  function auditQuestion(question = {}) {
    const issues = [];
    const add = (severity, code, label, detail, next) => {
      issues.push({ severity, code, label, detail, next });
    };
    const title = String(question.title || "").trim();
    const content = String(question.content || "").trim();
    const solution = String(question.solution || "").trim();
    const answer = String(question.answer || "").trim();
    const source = String(question.source || "").trim();
    const sourceLicense = String(question.sourceLicense || "").trim();
    const attachments = Array.isArray(question.attachments) ? question.attachments : [];
    const hasImage = attachments.some((attachment) => {
      return attachment?.kind === "image" || String(attachment?.type || "").startsWith("image/");
    });

    if (!title) add("error", "missing-title", "缺少题名", "没有可用于检索和识别的题名。", "补充与实际设问一致的简洁题名。");
    if (content.length < 12) add("error", "short-content", "题干不完整", "题干过短，无法确认条件和设问是否齐全。", "补充全部条件、图示说明和小问。");
    if (solution.length < 20) add("error", "short-solution", "解析不完整", "解析不足以说明研究对象、规律、步骤和结论。", "按物理过程分步补充解析。");
    if (!answer) add("warning", "missing-answer", "缺少参考答案", "自动反馈无法与明确结论核对。", "补充数值、单位、方向或评分要点。");

    const titleChecks = [
      ["加速度", /加速度|求\s*a(?:\W|$)/i],
      ["速度", /速度|速率|求\s*v(?:\W|$)/i],
      ["位移", /位移|路程|距离|求\s*[sx](?:\W|$)/i],
      ["功率", /功率|求\s*p(?:\W|$)/i],
      ["电流", /电流|求\s*i(?:\W|$)/i],
      ["电压", /电压|求\s*u(?:\W|$)/i]
    ];
    titleChecks.forEach(([term, pattern]) => {
      if (title.includes(term) && content && !pattern.test(content)) {
        add(
          "warning",
          `title-question-${term}`,
          "题名与设问可能不一致",
          `题名包含“${term}”，但题干中未检出对应设问。`,
          "核对题名，或在题干中补充实际要求计算/判断的物理量。"
        );
      }
    });

    if (/(?:如|由|根据)(?:下|右|左|上)?图|图中|图示|电路图|光路图/.test(content) && !hasImage) {
      add("error", "missing-figure", "可能缺少图示", "题干引用了图，但附件中没有图像。", "上传原图并确认图中的标注清晰可读。");
    }

    const optionLabels = [...content.matchAll(/(?:^|\n|\s)([A-D])[.．、:：)]/g)].map((match) => match[1]);
    const uniqueOptions = [...new Set(optionLabels)];
    if (uniqueOptions.length > 0 && uniqueOptions.length < 4) {
      add("warning", "incomplete-options", "选项可能不完整", `只检出 ${uniqueOptions.join("、")} 选项。`, "确认选择题的全部选项均已收录。");
    }

    const questionParts = [...content.matchAll(/(?:^|\n)\s*(?:\(\d+\)|（\d+）|\d+[.、])/g)].length;
    const answerParts = [...answer.matchAll(/(?:^|\n)\s*(?:\(\d+\)|（\d+）|\d+[.、])/g)].length;
    if (questionParts >= 2 && answer && answerParts === 0 && !/[；;]/.test(answer)) {
      add("warning", "multi-part-answer", "多问答案可能缺项", `题干检出约 ${questionParts} 个小问，但答案未分项。`, "逐问给出结论，并让解析对应每个小问。");
    }

    if (/\d/.test(answer) && /求|计算/.test(content)
      && !/(?:m|s|kg|N|Pa|J|W|V|A|Ω|Hz|℃|度|rad|%)(?:\b|²|³|\/)/i.test(answer)
      && !/无量纲|比值|倍/.test(content)) {
      add("warning", "answer-unit", "数值答案可能缺少单位", "答案含数值，但未检出常见物理单位。", "确认该物理量是否有单位；如有，请补写并统一单位。");
    }

    if ((/=|守恒|定律|公式/.test(solution))
      && !/条件|适用|忽略|不计|光滑|理想|匀强|恒定|系统|边界/.test(solution)) {
      add("warning", "missing-condition", "公式适用条件未说明", "解析给出了公式或定律，但未检出适用条件。", "说明模型假设、系统边界和公式成立条件。");
    }

    const stageGradeMismatch = (question.stage === "初中" && /^高[一二三]$/.test(question.grade || ""))
      || (question.stage === "高中" && /^(?:七|八|九)年级$/.test(question.grade || ""));
    if (stageGradeMismatch) {
      add("error", "stage-grade", "学段与年级冲突", `${question.stage}与“${question.grade}”不匹配。`, "修正学段或年级。");
    }
    if (!question.topic) add("warning", "missing-topic", "知识点未分类", "无法进入知识点掌握分析和个性化推荐。", "选择最直接的主知识点，必要时再补充考点标签。");
    if (!question.curriculumChapter && !question.textbookUnit) {
      add("info", "missing-curriculum", "尚未关联教材章节", "题目仍可练习，但教材路径推荐会变弱。", "由系统推荐后请教师核对教材章节。");
    }

    if (!source) add("warning", "missing-source", "来源未填写", "无法追溯题目出处。", "填写自编、学生上传、试卷名称或可核查来源。");
    if (!sourceLicense) {
      add("error", "missing-rights", "权利状态未填写", "无法判断正文是否可在题库中保存和分发。", "选择原创、已授权、官方公开许可或仅保存来源链接。");
    } else if (question.fullTextIncluded !== false && sourceLicense === "仅保存来源链接") {
      add("error", "rights-full-text", "正文与权利标记冲突", "题目保存了正文，但权利状态仅允许保留来源链接。", "移除正文或补充经核实的授权依据。");
    }

    const riskIssues = issues.filter((issue) => issue.severity === "error" || issue.severity === "warning");
    const errors = issues.filter((issue) => issue.severity === "error").length;
    return {
      status: errors ? "high-risk" : riskIssues.length ? "review" : "clear",
      label: errors ? "存在高风险项" : riskIssues.length ? "建议复核" : "未发现规则风险",
      requiresTeacherReview: riskIssues.length > 0,
      errorCount: errors,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
      infoCount: issues.filter((issue) => issue.severity === "info").length,
      issues,
      checkedAt: new Date().toISOString(),
      boundary: "自动检查只提示可解释的结构风险，不能替代教师对物理正确性、开放题评分和授权凭证的审核。"
    };
  }

  function createReportPayload(state, questions = []) {
    const profile = activeProfile(state);
    const summary = summarizeLearning(state, questions, profile.id);
    const analysis = studentAnalysis(state, questions, profile.id);
    return {
      format: "physics-learning-profile",
      version: 2,
      exportedAt: new Date().toISOString(),
      profile: {
        id: profile.id,
        name: profile.name,
        role: profile.role,
        stage: profile.stage,
        grade: profile.grade,
        subject: profile.subject,
        goal: profile.goal,
        analysisNote: profile.analysisNote
      },
      summary: {
        completed: summary.completed,
        accuracy: summary.accuracy,
        independenceRate: summary.independenceRate,
        averageHint: summary.averageHint,
        learningMinutes: summary.learningMinutes,
        dueCount: summary.dueCount,
        mastery: {
          counts: summary.mastery.counts,
          masteryRate: summary.mastery.masteryRate,
          rules: summary.mastery.rules
        },
        topics: summary.topics,
        misconceptionProfile: summary.misconceptionProfile.map((item) => ({
          code: item.code,
          title: item.title,
          risk: item.risk,
          status: item.status,
          evidenceCount: item.evidenceCount
        })),
        modelingRadar: modelingRadar(state, profile.id)
      },
      attempts: state.attempts
        .filter((attempt) => attempt.profileId === profile.id)
        .map(({ draftImageData, ...attempt }) => ({
          ...attempt,
          draftImageIncludedInLocalRecord: Boolean(draftImageData)
        })),
      reviews: Object.fromEntries(
        Object.entries(state.reviews).filter(([, review]) => {
          return review?.profileId
            ? review.profileId === profile.id
            : profile.id === "student-default";
        })
      ),
      examRecords: state.examRecords.filter((record) => record.profileId === profile.id),
      growthRecords: state.growthRecords.filter((record) => record.profileId === profile.id),
      analysis: {
        weakest: analysis.weakest,
        strongest: analysis.strongest,
        examTrend: analysis.examTrend,
        trendDelta: analysis.trendDelta,
        priorities: analysis.priorities,
        conclusion: analysis.conclusion,
        boundary: analysis.boundary
      }
    };
  }

  window.PHYSICS_LEARNING_ENGINE = Object.freeze({
    version: "2.5.0",
    storageKey: STORAGE_KEY,
    masteryRules: MASTERY_RULES,
    misconceptionCatalog: Object.freeze(misconceptionCatalog),
    formulaCatalog: Object.freeze(formulaCatalog),
    constants: Object.freeze(constants),
    unitDefinitions: Object.freeze(unitDefinitions),
    createId,
    defaultState,
    normalizeState,
    loadState,
    saveState,
    activeProfile,
    normalizeProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    recordDiagnostic,
    misconceptionProfile,
    createHintLadder,
    socraticPrompts,
    gradeFinalAnswer,
    verifyPhysicsAnswer,
    scoreModeling,
    recordAttempt,
    scheduleReview,
    reviewsForProfile,
    dueReviews,
    isPublishedQuestion,
    questionMasteryEvidence,
    masteryProfile,
    masterySummary,
    topicPerformance,
    summarizeLearning,
    modelingRadar,
    recommendations,
    addExamRecord,
    importExamRecords,
    addGrowthRecord,
    growthTimeline,
    studentAnalysis,
    dailyTest,
    activeLearningPlan,
    learningPlanProgress,
    buildTargetedLearningPlan,
    saveTargetedLearningPlan,
    transferVariants,
    validateDimension,
    convertUnit,
    mean,
    standardDeviation,
    linearRegression,
    generateAssignment,
    auditQuestion,
    createReportPayload
  });
})();
