(() => {
  "use strict";

  const STORAGE_KEY = "physics-experience-v2";
  const MAX_EVENTS = 600;
  const engine = window.PHYSICS_LEARNING_ENGINE;
  const STUDENT_MODULES = Object.freeze([
    { view: "library", icon: "▤", label: "题库", detail: "按年级、章节、知识点和难度检索完整题目" },
    { view: "wrong", icon: "!", label: "错题集", detail: "订正、错误归因、自我解释和同类迁移" },
    { view: "videos", icon: "▶", label: "方法视频", detail: "播放已关联视频或逐步动态方法讲解" },
    { view: "mastered", icon: "✓", label: "已掌握", detail: "只展示达到行为证据标准的题目" },
    { view: "progress", icon: "◴", label: "掌握进度", detail: "查看六类状态、章节覆盖和待复习内容" },
    { view: "curriculum", icon: "目", label: "教材知识点", detail: "八年级至高三完整册、章、节和核心要点" },
    { view: "analysis", icon: "◎", label: "本人学情分析", detail: "正确率、提示依赖、建模证据和成长记录" },
    { view: "lab", icon: "⌬", label: "学习实验室", detail: "诊断、导师、仿真、迁移、复习和实验工具" },
    { view: "advice", icon: "→", label: "学习建议", detail: "依据薄弱证据形成练习顺序和七日计划" }
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
    view: "today",
    search: "",
    practiceGrade: "全部",
    libraryGrade: "",
    libraryDifficulty: "全部",
    libraryTopic: "全部",
    libraryPage: 1,
    progressState: "全部",
    curriculumBookId: "",
    curriculumTarget: null,
    methodGrade: "",
    methodPlayer: null,
    capture: null,
    openedAt: Date.now(),
    firstQuestionStarted: false
  };

  let experience = loadExperience();
  let app = null;
  let shell = null;
  let onboarding = null;
  let captureDialog = null;
  let metricsDialog = null;
  let methodDialog = null;

  document.addEventListener("DOMContentLoaded", () => {
    const activation = window.PhysicsStudioActivation;
    if (!activation?.whenActivated) return;
    activation.whenActivated.then(initialize).catch(() => {});
  });

  function defaultExperience() {
    return {
      version: 2,
      onboarded: false,
      role: "student",
      displayName: "同学",
      grade: "高一",
      textbook: "人教版",
      goal: "日常巩固",
      examDate: "",
      weeklyGoal: 12,
      studentExternalLinks: false,
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
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!value || typeof value !== "object") return fallback;
      const normalized = {
        ...fallback,
        ...value,
        events: Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS) : [],
        activeDates: Array.isArray(value.activeDates) ? value.activeDates.slice(-60) : []
      };
      if (normalized.grade === "七年级") normalized.grade = "八年级";
      return normalized;
    } catch (error) {
      console.warn("使用设置读取失败，已使用安全默认值。", error);
      return fallback;
    }
  }

  function saveExperience() {
    experience.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(experience));
  }

  function initialize() {
    app = window.PhysicsStudioApp || null;
    createShell();
    createOnboarding();
    createCaptureDialog();
    createMetricsDialog();
    createMethodDialog();
    bindGlobalEvents();
    applyFontScale();
    applyRole();
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
          <div><strong>物理研习室</strong><h1>先选择你的使用方式</h1><p>只需最少信息，之后可在“我的”中修改。</p></div>
        </header>
        <fieldset class="role-choice">
          <legend>使用身份</legend>
          ${[
            ["student", "学生", "作答、错题、复习、实验和学习报告"],
            ["teacher", "教师", "内容导入、审核、组卷和班级证据"],
            ["parent", "家长", "只看学习摘要和可支持的知识模块"]
          ].map(([value, label, detail]) => `
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
      <form id="studentCaptureForm">
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
            <p class="capture-boundary" id="studentRecognitionStatus">离线版只在设备提供文字检测能力时尝试识别。公式、上下标、矢量符号和图示语义必须人工确认，不会伪装成可靠识别结果。</p>
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

  function bindGlobalEvents() {
    document.addEventListener("physics-studio-ready", () => {
      app = window.PhysicsStudioApp;
      renderRoleExperience();
    });
    document.addEventListener("physics-studio-questions-changed", renderRoleExperience);
    document.addEventListener("physics-learning-state-changed", renderRoleExperience);
    document.addEventListener("physics-learning-event", (event) => {
      recordEvent(event.detail?.type || "learning-event", event.detail || {});
      renderRoleExperience();
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
    });
    captureDialog.querySelector("#studentCaptureText").addEventListener("input", (event) => {
      const topic = inferTopic(event.target.value);
      const topicInput = captureDialog.querySelector("#studentCaptureTopic");
      if (!topicInput.dataset.userEdited) topicInput.value = topic;
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
  }

  function showOnboarding(editing) {
    onboarding.dataset.editing = editing ? "true" : "false";
    onboarding.querySelector(`input[name="experienceRole"][value="${experience.role}"]`).checked = true;
    onboarding.querySelector("#experienceName").value = experience.displayName;
    onboarding.querySelector("#experienceGrade").value = experience.grade;
    onboarding.querySelector("#experienceTextbook").value = experience.textbook;
    onboarding.querySelector("#experienceGoal").value = experience.goal;
    onboarding.querySelector("#experienceExamDate").value = experience.examDate || "";
    updateOnboardingVisibility();
    if (!onboarding.open) onboarding.showModal();
  }

  function updateOnboardingVisibility() {
    const role = onboarding.querySelector('input[name="experienceRole"]:checked')?.value || "student";
    const studentFields = onboarding.querySelector(".onboarding-fields");
    studentFields.classList.toggle("role-summary", role !== "student");
    onboarding.querySelector("#experienceExamDateField").classList.toggle("hidden", role !== "student");
  }

  function saveOnboarding(event) {
    event.preventDefault();
    const role = onboarding.querySelector('input[name="experienceRole"]:checked')?.value || "student";
    experience.role = ["student", "teacher", "parent"].includes(role) ? role : "student";
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
    document.body.classList.add(`role-${experience.role}`, "experience-ready");
    applyFontScale();
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
      renderTeacherBar();
      return;
    }
    removeTeacherBar();
    shell.innerHTML = experience.role === "parent" ? renderParent() : renderStudent();
  }

  function renderStudent() {
    const data = getStudentData();
    const primaryView = primaryStudentView(ui.view);
    return `
      <header class="student-header">
        <div><span>${greeting()}，${escapeHtml(experience.displayName)}</span><strong>${escapeHtml(experience.grade)} · 物理 · ${data.gradeQuestions.length} 道完整题</strong></div>
        <button data-shell-action="open-settings" type="button" aria-label="打开个人设置">⚙</button>
      </header>
      <main class="student-main">
        ${renderStudentView(data)}
      </main>
      <nav class="student-bottom-nav" aria-label="学生主导航">
        ${[
          ["today", "⌂", "今日"],
          ["practice", "▤", "练习"],
          ["wrong", "!", "错题"],
          ["profile", "○", "我的"]
        ].map(([view, icon, label]) => `<button class="${primaryView === view ? "active" : ""}" data-student-view="${view}" type="button"><span>${icon}</span><strong>${label}</strong></button>`).join("")}
      </nav>
      <button class="student-scan-fab" data-shell-action="capture" type="button"><span>▣</span><strong>拍题</strong></button>`;
  }

  function renderStudentView(data) {
    const renderers = {
      today: renderToday,
      practice: renderPractice,
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
    if (["library", "videos", "curriculum", "lab"].includes(view)) return "practice";
    if (["mastered", "progress", "analysis", "advice"].includes(view)) return "profile";
    return ["today", "practice", "wrong", "profile"].includes(view) ? view : "today";
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

  function getStudentData() {
    const questions = (app?.getQuestions?.() || []).filter(isCompleteStudentQuestion);
    const gradeQuestions = questions.filter((question) => question.grade === experience.grade);
    const learning = engine?.loadState?.() || null;
    const summary = learning ? engine.summarizeLearning(learning, gradeQuestions) : emptyLearningSummary();
    const recommendations = learning
      ? engine.recommendations(learning, gradeQuestions, 40, { profileId: learning.activeProfileId })
      : [];
    const activePlan = learning ? engine.activeLearningPlan(learning, learning.activeProfileId) : null;
    const planProgress = learning ? engine.learningPlanProgress(learning, activePlan) : null;
    const planCompleted = new Set(planProgress?.completedQuestionIds || []);
    const planItems = (activePlan?.items || []).map((item) => ({
      ...item,
      question: gradeQuestions.find((question) => question.id === item.questionId) || null,
      completed: planCompleted.has(item.questionId)
    })).filter((item) => item.question);
    const nextPlanItem = planItems.find((item) => !item.completed);
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
    const latestAttemptByQuestion = new Map();
    (learning?.attempts || [])
      .filter((attempt) => attempt.profileId === learning?.activeProfileId)
      .forEach((attempt) => latestAttemptByQuestion.set(attempt.questionId, attempt));
    const wrongQuestions = gradeQuestions.filter((question) => {
      const attempt = latestAttemptByQuestion.get(question.id);
      return attempt && attempt.grading?.status !== "correct";
    });
    const dailyTest = learning ? engine.dailyTest(learning, questions, {
      count: 5,
      date: new Date().toISOString().slice(0, 10)
    }) : null;
    const analysis = learning ? engine.studentAnalysis(learning, gradeQuestions) : null;
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
    return {
      questions,
      gradeQuestions,
      learning,
      summary,
      recommendations,
      activePlan,
      planProgress,
      planItems,
      next,
      weekAttempts,
      effectiveAttempts,
      newTopics,
      wrongQuestions,
      dailyTest,
      analysis,
      evidence,
      videoQuestions: gradeQuestions.filter(hasQuestionVideo),
      masteredQuestions: evidence.filter((item) => ["mastered", "due"].includes(item.evidence.code)),
      curriculumBooks,
      allCurriculumBooks,
      curriculumSectionCount
    };
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
    const evidenced = data.evidence.filter((item) => item.evidence.code !== "not-started").length;
    const metrics = {
      library: `${data.gradeQuestions.length} 道`,
      wrong: `${data.wrongQuestions.length} 道`,
      videos: data.videoQuestions.length ? `${data.videoQuestions.length} 个视频` : `${data.gradeQuestions.length} 个动态讲解`,
      mastered: `${data.masteredQuestions.length} 道`,
      progress: `${evidenced}/${data.gradeQuestions.length}`,
      curriculum: `${data.curriculumBooks.length} 册 · ${data.curriculumSectionCount} 节`,
      analysis: `${data.summary.completed} 次作答`,
      lab: "8 个学习工具",
      advice: `${Math.max(1, data.recommendations.length)} 项建议`
    };
    if (module.view === "progress" && counts["待复习"]) {
      return `${evidenced}/${data.gradeQuestions.length} · ${counts["待复习"]} 待复习`;
    }
    return metrics[module.view] || "";
  }

  function renderStudentModuleDirectory(data, title = "完整学习功能") {
    return `
      <section class="student-module-section">
        <header>
          <div><span>STUDENT LEARNING HUB</span><h2>${escapeHtml(title)}</h2></div>
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

  function renderModuleHeader(kicker, title, description, backView = "practice") {
    return `
      <section class="student-page-head module-page-head">
        <button class="module-back-button" data-student-view="${backView}" type="button">← 返回${backView === "profile" ? "我的" : "学习中心"}</button>
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
    const next = data.next?.question;
    return `
      <section class="today-intro">
        <span>今天建议学习 15 分钟</span>
        <h1>下一步，只完成一件事</h1>
      </section>
      ${next ? `
        <button class="continue-card" data-start-question="${escapeHtml(next.id)}" type="button">
          <span class="continue-label">继续学习</span>
          <h2>${escapeHtml(next.title)}</h2>
          <p>${escapeHtml(next.topic)} · ${escapeHtml(next.difficulty)} · 约 15 分钟</p>
          <small>${escapeHtml(data.next.reasons?.[0] || "根据当前学习记录推荐")}</small>
          <strong>开始作答 <i>→</i></strong>
        </button>` : `
        <article class="continue-card empty">
          <span class="continue-label">暂无可训练正文</span>
          <h2>请让教师先导入或添加可用试题</h2>
          <p>只有来源链接或未核实正文的记录不会进入学生训练。</p>
        </article>`}
      <div class="today-counters">
        <button data-shell-action="open-review" type="button"><strong>${due}</strong><span>待复习</span><small>到期题目</small></button>
        <button data-student-view="wrong" type="button"><strong>${wrong}</strong><span>错题</span><small>继续订正</small></button>
        <button data-student-view="practice" type="button"><strong>${Math.min(1, data.newTopics.length)}</strong><span>新知识</span><small>${data.newTopics[0] ? escapeHtml(data.newTopics[0]) : "暂无新组"}</small></button>
      </div>
      ${renderAssignedPlan(data)}
      ${renderStudentModuleDirectory(data, "题库、知识点、视频和学习证据")}
      <section class="weekly-goal-card">
        <div><span>本周目标</span><strong>已完成 ${completed}/${goal} 次有效练习</strong></div>
        <div class="weekly-track" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(goal, completed)}"><i style="width:${Math.min(100, completed / goal * 100)}%"></i></div>
        <p>有效练习需包含正式作答，并记录足够的学习过程；不是打开题目或查看答案次数。</p>
      </section>
      ${renderDailyTest(data.dailyTest)}
      ${experience.examDate ? renderExamPlan() : ""}`;
  }

  function renderAssignedPlan(data) {
    const plan = data.activePlan;
    if (!plan || !data.planItems.length) return "";
    const progress = data.planProgress || { completed: 0, total: data.planItems.length, percent: 0 };
    return `
      <section class="assigned-plan-card">
        <header>
          <div><span>教师已确认的专项方案</span><h2>${escapeHtml(plan.title)}</h2></div>
          <strong>${progress.completed}/${progress.total}</strong>
        </header>
        <p>${escapeHtml(plan.evidenceReason)}${plan.teacherNote ? ` · 教师说明：${escapeHtml(plan.teacherNote)}` : ""}</p>
        <div class="assigned-plan-track" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.completed}"><i style="width:${progress.percent}%"></i></div>
        <ol>
          ${data.planItems.map((item, index) => `
            <li class="${item.completed ? "completed" : ""}">
              <i>${item.completed ? "✓" : index + 1}</i>
              <div><strong>${escapeHtml(item.purpose)}</strong><span>${escapeHtml(item.question.title)} · ${escapeHtml(item.reason)}</span></div>
              <button data-start-question="${escapeHtml(item.question.id)}" type="button">${item.completed ? "复盘" : "开始"}</button>
            </li>`).join("")}
        </ol>
        <small>${escapeHtml(plan.selectionRule)}</small>
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
          <span>外部题源访问已由教师/家长设置开启</span>
          <button data-shell-action="external-search" type="button">用 Edge/Bing 搜外部网站 ↗</button>
        </div>` : '<p class="student-safe-search">学生模式默认只搜索站内试题；外部网站访问已关闭。</p>'}
      ${renderDailyTest(data.dailyTest)}`;
  }

  function normalizeSearchText(value) {
    return String(value || "").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
  }

  function questionSearchText(question) {
    return normalizeSearchText([
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
  }

  function questionMatchesCurriculum(question, target) {
    if (!target) return true;
    const search = questionSearchText(question);
    const exactFields = [
      question.curriculumBook,
      question.curriculumChapter,
      question.curriculumSection,
      question.topic
    ].map(normalizeSearchText);
    const section = normalizeSearchText(target.sectionTitle);
    const chapter = normalizeSearchText(target.chapterTitle);
    if (exactFields.includes(section) || (section.length >= 2 && search.includes(section))) return true;
    const guideMatch = KNOWLEDGE_GUIDES.some(([pattern]) => {
      pattern.lastIndex = 0;
      const targetMatches = pattern.test(`${target.chapterTitle || ""} ${target.sectionTitle || ""}`);
      pattern.lastIndex = 0;
      return targetMatches && pattern.test([
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
    const showDetail = options.showDetail !== false;
    const showMethod = options.showMethod !== false;
    return `
      <article class="student-question-card" data-question-id="${escapeHtml(question.id)}">
        <div class="student-question-body">
          <div class="question-meta-row">
            <span>${escapeHtml(question.grade || question.stage)} · ${escapeHtml(question.difficulty)} · ${escapeHtml(question.questionType || "物理题")}</span>
            <small class="evidence-${escapeHtml(evidence.code || "not-started")}">${escapeHtml(evidence.status || "未开始")}</small>
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
          ${showDetail ? `<button data-question-detail="${escapeHtml(question.id)}" type="button">详细解析</button>` : ""}
          ${showMethod ? `<button data-method-question="${escapeHtml(question.id)}" type="button">${actualVideo ? "视频与方法" : "方法讲解"}</button>` : ""}
        </div>
      </article>`;
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
    if (ui.libraryDifficulty !== "全部" && !difficulties.includes(ui.libraryDifficulty)) ui.libraryDifficulty = "全部";
    if (ui.libraryTopic !== "全部" && !topics.includes(ui.libraryTopic)) ui.libraryTopic = "全部";
    const query = normalizeSearchText(ui.search);
    const filtered = available.filter((question) => {
      return (ui.libraryDifficulty === "全部" || question.difficulty === ui.libraryDifficulty)
        && (ui.libraryTopic === "全部" || question.topic === ui.libraryTopic)
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
        </div>
        ${targetLabel ? `<div class="curriculum-filter-chip"><span>教材定位：${escapeHtml(targetLabel)}</span><button data-library-action="clear-curriculum" type="button">移除</button></div>` : ""}
      </section>
      <section class="library-result-head">
        <div><span>SEARCH RESULT</span><h2>${filtered.length ? `找到 ${filtered.length} 道题` : "没有符合条件的题目"}</h2></div>
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
    const weak = data.evidence.filter((item) => item.evidence.code === "weak").map((item) => item.question);
    const wrongQuestions = [...new Map([...data.wrongQuestions, ...weak].map((question) => [question.id, question])).values()];
    const errorCounts = learningErrorCounts(data.learning);
    const recentCorrections = data.evidence
      .filter((item) => item.evidence.latest)
      .sort((a, b) => new Date(b.evidence.latest.createdAt || 0) - new Date(a.evidence.latest.createdAt || 0))
      .slice(0, 5);
    return `
      <section class="student-page-head"><span>ERROR TO ACTION</span><h1>错题集</h1><p>错误会按原因、知识点和订正状态组织；看过答案不等于完成订正。</p></section>
      <section class="wrong-overview">
        <div class="wrong-summary">
          <strong>${wrongQuestions.length}</strong><span>道待订正或薄弱题</span>
          <p>订正闭环：重新独立作答 → 定位错误 → 用一句话解释规律 → 完成迁移题 → 安排复习。</p>
        </div>
        <div class="wrong-error-types">
          <h2>错误原因记录</h2>
          ${errorCounts.length
            ? errorCounts.slice(0, 7).map(([label, count]) => `<article><span>${escapeHtml(label)}</span><strong>${count}</strong></article>`).join("")
            : "<p>尚无结构化错误归因。完成一次订正后，可在作答流程中选择审题、概念、建模、公式、运算、单位或表达。</p>"}
        </div>
      </section>
      <section class="correction-workflow" aria-label="错题订正流程">
        ${["不看答案重做", "标记错误位置", "选择错误原因", "写关键规律", "完成一道变式"].map((label, index) => `<article><i>${index + 1}</i><strong>${label}</strong></article>`).join("")}
      </section>
      <section class="wrong-cause-guide">
        <header><span>ERROR MODEL</span><h2>怎样判断错误原因</h2><p>只选择最先导致答案偏离的主要原因，避免把所有错题都归为“粗心”。</p></header>
        <div>
          ${[
            ["审题", "漏读条件、对象、小问或图中信息；订正时重新圈出已知量和限制。"],
            ["概念", "物理意义或规律理解错误；用反例和实验现象修正前概念。"],
            ["建模", "研究对象、过程划分、理想化或坐标系不合适；先重画模型。"],
            ["公式", "公式适用条件不成立或物理量对应错位；补写条件再列式。"],
            ["运算", "代数、比例、指数或有效数字错误；保留符号式并逐步代入。"],
            ["单位", "没有统一单位、漏单位或量纲不一致；计算前后各检查一次。"],
            ["表达", "方向、正负号、图示或结论不完整；按题目设问逐项作答。"]
          ].map(([label, detail]) => `<article><strong>${label}</strong><p>${detail}</p></article>`).join("")}
        </div>
      </section>
      <div class="student-question-list wrong-list">
        ${wrongQuestions.length ? wrongQuestions.map((question) => {
          const evidence = evidenceFor(data, question.id);
          const latest = evidence.latest;
          return `
            <article class="student-question-card wrong">
              <div class="student-question-body">
                <div class="question-meta-row"><span>${escapeHtml(question.topic)} · ${escapeHtml(evidence.status || "待订正")}</span><small>${evidence.attempts || 0} 次作答</small></div>
                <h2>${escapeHtml(question.title)}</h2>
                <p>${latest?.errorType ? `上次归因：${escapeHtml(latest.errorType)}` : "尚未完成结构化错误归因"}${Number(latest?.hintLevel) >= 3 ? ` · 使用过第 ${latest.hintLevel} 级提示` : ""}</p>
                <div class="question-point-row">${(question.examPoints || [question.topic]).slice(0, 3).map((point) => `<span>${escapeHtml(point)}</span>`).join("")}</div>
              </div>
              <div class="student-question-actions">
                <button class="primary" data-start-question="${escapeHtml(question.id)}" type="button">重新订正</button>
                <button data-question-detail="${escapeHtml(question.id)}" type="button">核对解析</button>
                <button data-similar-topic="${escapeHtml(question.topic)}" type="button">同类迁移</button>
              </div>
            </article>`;
        }).join("") : '<div class="student-empty"><strong>当前没有待订正或薄弱题</strong><span>正式作答中的错误、高提示依赖或低建模评分会进入这里；你也可以用右下角“拍题”收录纸面错题。</span></div>'}
      </div>
      <section class="wrong-history">
        <header><div><span>RECENT EVIDENCE</span><h2>近期订正证据</h2></div><button data-student-view="progress" type="button">查看掌握进度 →</button></header>
        ${recentCorrections.length ? recentCorrections.map((item) => `
          <article>
            <div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(item.evidence.status)} · ${escapeHtml(item.evidence.reasons.slice(0, 2).join("；"))}</span></div>
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
          <header><div><span>ATTACHED VIDEO</span><h2>已关联方法视频</h2></div><strong>${actual.length} 个</strong></header>
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
        <header><div><span>STEP-BY-STEP</span><h2>逐步动态方法讲解</h2></div><strong>${walkthroughs.length} / ${questions.length}</strong></header>
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
          <article><strong>${rules.masteredIndependentDates ?? 2}</strong><span>个不同日期低提示独立正确</span></article>
          <article><strong>${rules.masteredTransferEvidence ?? 1}</strong><span>道迁移记录</span></article>
          <article><strong>≤ ${rules.independentHintMaximum ?? 1}</strong><span>独立正确的提示等级</span></article>
        </div>
      </section>
      <section class="mastered-summary-grid">
        <article><strong>${mastered.filter((item) => item.evidence.code === "mastered").length}</strong><span>已掌握</span></article>
        <article><strong>${mastered.filter((item) => item.evidence.code === "due").length}</strong><span>已掌握但待复习</span></article>
        <article><strong>${data.summary.mastery.masteryRate}%</strong><span>当前题库掌握率</span></article>
      </section>
      <section class="mastery-evidence-guide">
        <header><span>MASTERY PATH</span><h2>从“做过”到“掌握”的证据路径</h2></header>
        <div>
          ${[
            ["1", "首次独立尝试", "先作答再看提示；即使答错，也能形成真实起点证据。"],
            ["2", "低提示正确", "提示等级不高于1且结论正确，状态可进入“熟练”。"],
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
              <div class="question-meta-row"><span>${escapeHtml(item.question.topic)}</span><small class="evidence-${escapeHtml(item.evidence.code)}">${escapeHtml(item.evidence.status)}</small></div>
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
        <header><div><span>NEXT MILESTONE</span><h2>接近掌握</h2></div><button data-student-view="progress" type="button">查看全部状态 →</button></header>
        ${near.length ? near.map((item) => `
          <article><div><strong>${escapeHtml(item.question.title)}</strong><span>${escapeHtml(item.evidence.status)} · ${escapeHtml(item.evidence.reasons.join("；"))}</span></div><button data-start-question="${escapeHtml(item.question.id)}" type="button">继续取证</button></article>`).join("")
          : "<p>先完成正式作答，系统才会计算接近掌握的证据。</p>"}
      </section>`;
  }

  function renderProgress(data) {
    const counts = data.summary.mastery?.counts || {};
    const statusMap = {
      "未开始": "not-started",
      "学习中": "learning",
      "熟练": "proficient",
      "已掌握": "mastered",
      "待复习": "due",
      "薄弱": "weak"
    };
    const selectedCode = statusMap[ui.progressState] || "";
    const selected = data.evidence.filter((item) => !selectedCode || item.evidence.code === selectedCode);
    const chapters = chapterProgress(data);
    return `
      ${renderModuleHeader("MASTERY PROGRESS", "掌握进度", "同时查看题目状态、章节覆盖与复习到期情况；所有数值都来自本机正式作答证据。", "profile")}
      <section class="progress-state-grid">
        ${Object.entries(statusMap).map(([label, code]) => `
          <button class="${ui.progressState === label ? "active" : ""}" data-progress-state="${escapeHtml(label)}" type="button">
            <strong>${counts[label] || 0}</strong><span>${label}</span><small>${progressStateDescription(code)}</small>
          </button>`).join("")}
      </section>
      <section class="progress-overview">
        <div>
          <span>题库掌握率</span><strong>${data.summary.mastery?.masteryRate || 0}%</strong>
          <i><b style="width:${data.summary.mastery?.masteryRate || 0}%"></b></i>
        </div>
        <p>分母为当前 ${escapeHtml(experience.grade)} 的 ${data.gradeQuestions.length} 道完整题。未开始题保留在分母中，避免只练少数题造成虚高。</p>
      </section>
      <section class="chapter-progress-section">
        <header><div><span>CHAPTER COVERAGE</span><h2>章节学习覆盖</h2></div><button data-student-view="curriculum" type="button">打开教材目录 →</button></header>
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
        <header><div><span>STATUS LIST</span><h2>${escapeHtml(ui.progressState)}题目</h2></div><button data-progress-state="全部" type="button">显示全部</button></header>
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
      sectionTitle: section.title
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
    const totalCounts = curriculumCounts(allBooks);
    const currentCounts = curriculumCounts(data.curriculumBooks);
    return `
      ${renderModuleHeader("CURRICULUM MAP", "教材知识点", "按人教版八年级至高中选择性必修的册、章、节组织；每节包含核心要点、适用条件和对应练习。")}
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
            ${selected.chapters.map((chapter, chapterIndex) => `
              <details${chapterIndex === 0 ? " open" : ""}>
                <summary>
                  <span>${escapeHtml(chapter.chapterNo)}</span>
                  <strong>${escapeHtml(chapter.title)}</strong>
                  <small>${chapter.sections.length} 节</small>
                </summary>
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
                        </div>
                      </article>`;
                  }).join("")}
                </div>
              </details>`).join("")}
          </div>
        </section>` : '<div class="student-empty"><strong>教材目录未加载</strong><span>请检查 curriculum-taxonomy.js 是否随安装包完整发布。</span></div>'}
      <section class="curriculum-source-note">
        <strong>目录与内容边界</strong>
        <p>册、章、节结构依据应用内标注的教材目录；知识点说明由物理概念、公式适用条件、实验方法和题目考点组成，不复制教材课后题正文。出版社链接只用于核对目录，打开前会提示离开应用。</p>
      </section>`;
  }

  function renderStudentAnalysis(data) {
    const analysis = data.analysis || {};
    const radar = data.learning ? engine?.modelingRadar?.(data.learning) || [] : [];
    const errors = learningErrorCounts(data.learning);
    const misconceptions = (data.summary.misconceptionProfile || []).filter((item) => item.evidenceCount || item.risk).slice(0, 6);
    const weakest = analysis.weakest || [];
    const strongest = analysis.strongest || [];
    return `
      ${renderModuleHeader("PERSONAL LEARNING EVIDENCE", "本人学情分析", "结合正确率、独立完成、提示依赖、建模步骤、错因、复习和试卷记录形成可解释分析。", "profile")}
      <section class="analysis-evidence-note">
        <strong>${escapeHtml(analysis.conclusion || "当前尚无正式作答证据，不能形成可靠薄弱判断。")}</strong>
        <p>${escapeHtml(analysis.boundary || "本报告是形成性分析，不是标准化能力诊断。")}</p>
      </section>
      <section class="analysis-metric-grid">
        <article><strong>${data.summary.accuracy || 0}%</strong><span>作答正确率</span><small>${data.summary.correct || 0}/${data.summary.completed || 0} 次</small></article>
        <article><strong>${data.summary.independenceRate || 0}%</strong><span>独立完成率</span><small>正确且提示等级≤1</small></article>
        <article><strong>${data.summary.averageHint || 0}</strong><span>平均提示等级</span><small>越低表示依赖越少</small></article>
        <article><strong>${data.summary.learningMinutes || 0}</strong><span>累计学习分钟</span><small>来自正式作答计时</small></article>
        <article><strong>${data.summary.dueCount || 0}</strong><span>到期复习</span><small>按间隔复习调度</small></article>
        <article><strong>${data.summary.mastery?.masteryRate || 0}%</strong><span>题库掌握率</span><small>按行为证据判定</small></article>
      </section>
      <div class="analysis-two-column">
        <section class="analysis-topic-card">
          <header><span>WEAK EVIDENCE</span><h2>需要优先巩固</h2></header>
          ${weakest.length ? weakest.map((topic) => `
            <article>
              <div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts
                ? `${topic.attempts} 次作答 · 正确率 ${topic.accuracy}% · 提示 ${topic.averageHint}`
                : `试卷薄弱项记录 ${topic.examMentions || 0} 次 · 尚无专项作答`}</span></div>
              <i><b style="width:${topic.attempts ? topic.averageScore : Math.min(100, 25 + (topic.examMentions || 0) * 15)}%"></b></i>
              <button data-topic-filter="${escapeHtml(topic.topic)}" type="button">专项练习</button>
            </article>`).join("") : "<p>暂无足够证据。至少完成一组独立作答后再判断薄弱点。</p>"}
        </section>
        <section class="analysis-topic-card strong">
          <header><span>RELATIVE STRENGTH</span><h2>当前相对稳定</h2></header>
          ${strongest.length ? strongest.map((topic) => `
            <article><div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts} 次记录 · 平均得分 ${topic.averageScore}%</span></div><i><b style="width:${topic.averageScore}%"></b></i></article>`).join("")
            : "<p>记录不足，暂不标记优势模块。</p>"}
        </section>
      </div>
      <section class="modeling-analysis-card">
        <header><div><span>MODELING RADAR</span><h2>物理建模能力证据</h2></div><button data-student-view="lab" type="button">进入建模训练 →</button></header>
        <div class="modeling-axis-list">
          ${radar.map((axis) => `<article><span>${escapeHtml(axis.label)}</span><i><b style="width:${axis.value}%"></b></i><strong>${axis.value}%</strong></article>`).join("")
            || "<p>尚无建模步骤评分，不能绘制雷达证据。</p>"}
        </div>
      </section>
      <div class="analysis-two-column">
        <section class="error-analysis-card">
          <header><span>ERROR CAUSES</span><h2>错误原因分布</h2></header>
          ${errors.length ? errors.map(([label, count]) => `<article><span>${escapeHtml(label)}</span><strong>${count}</strong></article>`).join("")
            : "<p>尚未记录结构化错误原因。错题订正时请选择最主要原因。</p>"}
        </section>
        <section class="misconception-analysis-card">
          <header><span>MISCONCEPTION</span><h2>前概念诊断</h2></header>
          ${misconceptions.length ? misconceptions.map((item) => `<article><div><strong>${escapeHtml(item.title || item.label || item.code)}</strong><span>${escapeHtml(item.status)}</span></div><small>${item.evidenceCount} 次诊断证据 · 风险 ${item.risk}/5</small></article>`).join("")
            : '<p>还没有“答案＋理由＋置信度”诊断记录。可在学习实验室完成前概念诊断。</p>'}
          <button data-shell-action="open-diagnostic" type="button">开始概念诊断</button>
        </section>
      </div>
      <section class="analysis-growth-card">
        <header><div><span>GROWTH RECORD</span><h2>成长时间线与试卷趋势</h2></div><strong>${(analysis.growthTimeline || []).length} 条记录</strong></header>
        ${analysis.examTrend?.length ? `<div class="exam-trend-row">${analysis.examTrend.map((item) => `<article><time>${escapeHtml(new Date(item.date).toLocaleDateString("zh-CN"))}</time><strong>${item.percentage}%</strong><span>${escapeHtml(item.title)}</span></article>`).join("")}</div>` : "<p>尚未导入试卷成绩，暂不计算考试趋势。</p>"}
        <div class="growth-timeline">
          ${(analysis.growthTimeline || []).slice(0, 12).map((item) => `<article><time>${escapeHtml(new Date(item.date).toLocaleDateString("zh-CN"))}</time><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span><small>${escapeHtml(item.evidence || "")}</small></div></article>`).join("")
            || "<p>完成练习、复习或导入试卷后形成成长记录。</p>"}
        </div>
      </section>`;
  }

  function renderStudentLab(data) {
    const tools = [
      ["diagnostic", "◎", "前概念诊断", "用答案、理由和置信度区分不会、猜对与稳定误概念。"],
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
        <header><div><span>NEXT BEST ACTION</span><h2>当前优先级</h2></div><strong>${priorities.length} 项</strong></header>
        <ol>${priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
        <div><button class="primary" data-start-question="${escapeHtml(data.next?.question?.id || "")}" type="button"${data.next?.question ? "" : " disabled"}>开始第一项</button><button data-student-view="analysis" type="button">查看分析依据</button></div>
      </section>
      <section class="recommended-question-section">
        <header><div><span>WHY THIS QUESTION</span><h2>为你推荐的题目</h2></div><button data-student-view="library" type="button">打开完整题库 →</button></header>
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
        <header><span>LEARNING METHOD</span><h2>每道题怎样学得更扎实</h2></header>
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
          <article><strong>${data.summary.independenceRate}%</strong><span>独立完成率</span></article>
          <article><strong>${data.summary.averageHint}</strong><span>平均提示等级</span></article>
          <article><strong>${data.summary.learningMinutes}</strong><span>学习分钟</span></article>
        </div>
        <button data-shell-action="open-review" type="button">查看完整学习报告 →</button>
      </section>
      <section class="mastery-status-card">
        <header><div><span>知识掌握证据</span><h2>${mastery.masteryRate}% 达到掌握标准</h2></div><button data-shell-action="mastery-help" type="button">规则说明</button></header>
        <div>${Object.entries(mastery.counts).map(([label, count]) => `<article><strong>${count}</strong><span>${escapeHtml(label)}</span></article>`).join("")}</div>
      </section>
      <section class="topic-evidence-card">
        <h2>知识点表现</h2>
        ${topics.length ? topics.map((topic) => `<article><div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts} 次记录 · 提示 ${topic.averageHint}</span></div><i><b style="width:${topic.averageScore}%"></b></i><small>${topic.averageScore}%</small></article>`).join("") : "<p>完成正式作答后，这里才会生成知识点证据。</p>"}
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
        <button data-shell-action="open-settings" type="button"><span>⚙</span><div><strong>身份与学习设置</strong><small>修改年级、教材和近期目标</small></div><i>→</i></button>
      </section>
      <section class="student-accessibility">
        <div><strong>题干字号</strong><span>支持浏览器双指缩放；这里调整默认字号。</span></div>
        <div><button data-font-scale="-0.1" type="button" aria-label="缩小字号">A−</button><strong>${Math.round(experience.fontScale * 100)}%</strong><button data-font-scale="0.1" type="button" aria-label="放大字号">A＋</button></div>
      </section>
      <p class="student-safety-note">外部网站访问：${experience.studentExternalLinks ? "已由教师/家长设置开启" : "默认关闭"}。学习状态来自行为证据，不允许手动勾选“已掌握”。</p>`;
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
          <article><strong>${data.summary.independenceRate}%</strong><span>独立完成率</span><small>低提示正确占比</small></article>
        </div>
        <section class="parent-support">
          <h2>近期可支持的知识模块</h2>
          ${supportTopics.length ? supportTopics.map((topic) => `<article><div><strong>${escapeHtml(topic.topic)}</strong><span>${topic.attempts} 次学习记录</span></div><p>${topic.averageHint >= 3 ? "可提醒孩子先画图、明确研究对象，再决定公式。" : "继续保持独立作答，并按时完成迁移与复习。"}</p></article>`).join("") : "<p>当前记录不足，先帮助孩子完成一次不受打断的正式练习。</p>"}
        </section>
        <section class="parent-actions">
          <h2>适合家长做的事</h2>
          <ul><li>提供稳定、少干扰的 15 分钟学习时间。</li><li>询问“这道题的关键规律是什么”，不要直接给答案。</li><li>关注到期复习是否完成，不用单次错误评价能力。</li></ul>
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
        <label class="teacher-link-setting"><input id="teacherExternalLinks" type="checkbox"${experience.studentExternalLinks ? " checked" : ""}><span>允许学生访问外部题源</span></label>
        <button data-teacher-action="metrics" type="button">上线验证指标</button>
        <button data-teacher-action="center" type="button">打开教师中心</button>
        <button data-teacher-action="switch" type="button">切换身份</button>
      </div>`;
    bar.onclick = handleTeacherBarClick;
    bar.querySelector("#teacherExternalLinks").onchange = (event) => {
      experience.studentExternalLinks = event.target.checked;
      saveExperience();
      recordEvent("student-external-links-setting", { enabled: experience.studentExternalLinks });
    };
  }

  function removeTeacherBar() {
    document.getElementById("teacherExperienceBar")?.remove();
  }

  function handleTeacherBarClick(event) {
    const action = event.target.closest("[data-teacher-action]")?.dataset.teacherAction;
    if (action === "center") openLab("teacher");
    else if (action === "metrics") showMetrics();
    else if (action === "switch") showOnboarding(true);
  }

  function handleShellClick(event) {
    const nav = event.target.closest("[data-student-view]");
    if (nav) {
      ui.view = nav.dataset.studentView;
      renderRoleExperience();
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      renderRoleExperience();
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      renderRoleExperience();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const progressState = event.target.closest("[data-progress-state]");
    if (progressState) {
      ui.progressState = progressState.dataset.progressState;
      renderRoleExperience();
      return;
    }
    const curriculumBook = event.target.closest("[data-curriculum-book]");
    if (curriculumBook) {
      ui.curriculumBookId = curriculumBook.dataset.curriculumBook;
      renderRoleExperience();
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        ui.search = "";
        ui.libraryPage = 1;
        ui.view = "library";
        renderRoleExperience();
        window.scrollTo({ top: 0, behavior: "smooth" });
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
        ui.curriculumTarget = null;
      } else if (libraryAction.dataset.libraryAction === "clear-curriculum") {
        ui.curriculumTarget = null;
      }
      ui.libraryPage = 1;
      renderRoleExperience();
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
      renderRoleExperience();
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
    else if (action === "mastery-help") showMasteryHelp();
    else if (action === "external-search") externalStudentSearch();
  }

  function handleShellInput(event) {
    if (["studentPracticeSearch", "studentLibrarySearch", "studentMethodSearch"].includes(event.target.id)) {
      ui.search = event.target.value;
      ui.libraryPage = 1;
      const inputId = event.target.id;
      renderRoleExperience();
      requestAnimationFrame(() => {
        const input = document.getElementById(inputId);
        input?.focus();
        input?.setSelectionRange(ui.search.length, ui.search.length);
      });
    }
  }

  function handleShellChange(event) {
    if (event.target.id === "studentPracticeGrade") {
      ui.practiceGrade = event.target.value;
      renderRoleExperience();
    } else if (event.target.id === "studentLibraryGrade") {
      ui.libraryGrade = event.target.value;
      ui.libraryDifficulty = "全部";
      ui.libraryTopic = "全部";
      ui.curriculumTarget = null;
      ui.libraryPage = 1;
      renderRoleExperience();
    } else if (event.target.id === "studentLibraryDifficulty") {
      ui.libraryDifficulty = event.target.value;
      ui.libraryPage = 1;
      renderRoleExperience();
    } else if (event.target.id === "studentLibraryTopic") {
      ui.libraryTopic = event.target.value;
      ui.libraryPage = 1;
      renderRoleExperience();
    } else if (event.target.id === "studentMethodGrade") {
      ui.methodGrade = event.target.value;
      renderRoleExperience();
    } else if (event.target.id === "studentCurriculumBook") {
      ui.curriculumBookId = event.target.value;
      renderRoleExperience();
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

  function openLab(tab, questionId = "") {
    document.dispatchEvent(new CustomEvent("physics-studio-open-lab", {
      detail: { tab, questionId }
    }));
  }

  function showMasteryHelp() {
    const rules = engine?.masteryRules;
    metricsDialog.querySelector("article").innerHTML = `
      <header><div><span>掌握状态说明</span><h2>状态必须来自行为证据</h2></div><button data-metrics-action="close" type="button">×</button></header>
      <div class="mastery-help-list">
        <article><strong>学习中</strong><p>完成过练习，但尚未出现低提示独立正确。</p></article>
        <article><strong>熟练</strong><p>至少一次正确，最高提示等级不超过 ${rules?.independentHintMaximum ?? 1}。</p></article>
        <article><strong>已掌握</strong><p>不同日期低提示独立正确至少 ${rules?.masteredIndependentDates ?? 2} 次，并完成至少 ${rules?.masteredTransferEvidence ?? 1} 道迁移记录。</p></article>
        <article><strong>待复习</strong><p>达到掌握标准，但已到间隔复习时间。</p></article>
        <article><strong>薄弱</strong><p>近期作答错误、提示依赖高，或建模评分较低。</p></article>
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
    const url = `https://www.bing.com/search?q=${encodeURIComponent(`长沙 初高中 物理 ${query}`)}`;
    window.open(url, "_blank", "noopener");
    recordEvent("student-external-search", { queryLength: query.length });
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
      recognitionStatus: "学生已人工确认题目文字"
    };
    captureDialog.querySelector("form").reset();
    captureDialog.querySelector("#studentCaptureGrade").value = experience.grade;
    captureDialog.querySelector("#studentCaptureTopic").value = "待核对";
    captureDialog.querySelector("#studentCaptureTopic").removeAttribute("data-user-edited");
    captureDialog.querySelector("#studentCaptureContrast").value = "115";
    captureDialog.querySelector("#studentCaptureContrastValue").textContent = "115%";
    captureDialog.querySelector("#studentRecognitionBadge").textContent = "等待图片";
    captureDialog.querySelector("#studentRecognitionStatus").textContent = "离线版只在设备提供文字检测能力时尝试识别。公式、上下标、矢量符号和图示语义必须人工确认，不会伪装成可靠识别结果。";
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
    } else if (action === "reset-image") {
      ui.capture.crop = { x: 0, y: 0, width: 1, height: 1 };
      ui.capture.rotation = 0;
      ui.capture.contrast = 115;
      captureDialog.querySelector("#studentCaptureContrast").value = "115";
      captureDialog.querySelector("#studentCaptureContrastValue").textContent = "115%";
      renderCaptureCanvas();
    } else if (action === "auto-crop") {
      estimateCaptureCrop();
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

  async function recognizeCaptureText() {
    const canvas = captureDialog.querySelector("#studentCaptureCanvas");
    if (!ui.capture?.source) {
      setRecognitionStatus("请先拍照或选择图片。", "未识别", true);
      return;
    }
    if (typeof window.TextDetector !== "function") {
      setRecognitionStatus(
        "当前设备未提供可调用的本地文字检测能力。请手工输入或粘贴题干；应用不会伪造 OCR 结果。",
        "设备不支持",
        true
      );
      return;
    }
    try {
      setRecognitionStatus("正在调用设备提供的本地文字检测…", "识别中");
      const detector = new window.TextDetector();
      const blocks = await detector.detect(canvas);
      const lines = (Array.isArray(blocks) ? blocks : []).map((block) => {
        const text = String(block.rawValue || block.text || "").trim();
        if (!text) return "";
        return Number.isFinite(Number(block.confidence)) && Number(block.confidence) < 0.8
          ? `□${text}`
          : text;
      }).filter(Boolean);
      if (!lines.length) {
        setRecognitionStatus("未检测到清晰文字。请改善光线、裁切题目后重试，或手工输入。", "未检出", true);
        return;
      }
      captureDialog.querySelector("#studentCaptureText").value = lines.join("\n");
      captureDialog.querySelector("#studentCaptureTopic").value = inferTopic(lines.join(" "));
      ui.capture.recognitionStatus = "设备文字检测结果；所有字符均由学生人工确认";
      setRecognitionStatus(
        "设备接口没有提供可靠的逐字符置信度，因此全部识别文字都视为“待确认”；若出现“□”，该处尤其不确定。公式、上下标和图示必须逐项核对。",
        "全部待确认"
      );
    } catch (error) {
      console.error("Text detection failed", error);
      setRecognitionStatus("设备文字检测调用失败。请手工输入或粘贴题干。", "识别失败", true);
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
      setRecognitionStatus("已粘贴文字。仍需与原题逐字核对，尤其是公式、上下标、单位和图中标注。", "粘贴待确认");
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
    if (!confirmed) {
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
        usedDeviceTextDetection: ui.capture.recognitionStatus.startsWith("设备")
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
      <section class="validation-tasks"><h3>上线前人工可用性任务</h3><ol><li>首次使用并在一分钟内开始第一道题。</li><li>拍入一道错题并检查 OCR 不确定字符。</li><li>完成订正、错误归因和自我解释。</li><li>第二天完成到期复习。</li><li>在“我的”中解释“熟练”和“已掌握”的区别。</li></ol></section>
      <p class="metrics-boundary">这些是本机产品验证计数，不是教育效果因果证据，也不含班级排名。应分别邀请初中生和高中生完成观察测试。</p>`;
    metricsDialog.showModal();
  }

  function handleMetricsClick(event) {
    if (event.target.closest("[data-metrics-action]")?.dataset.metricsAction === "close") metricsDialog.close();
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
      mastery: {
        masteryRate: 0,
        counts: { "未开始": 0, "学习中": 0, "熟练": 0, "已掌握": 0, "待复习": 0, "薄弱": 0 }
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

  window.PhysicsExperience = Object.freeze({
    getState() {
      return {
        role: experience.role,
        grade: experience.grade,
        textbook: experience.textbook,
        goal: experience.goal,
        onboarded: experience.onboarded,
        studentExternalLinks: experience.studentExternalLinks
      };
    },
    recordEvent,
    openSettings() {
      showOnboarding(true);
    }
  });
})();
