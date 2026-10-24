(() => {
  "use strict";

  const STORAGE_KEY = "physics-learning-loop-v1";
  const VERSION_SOURCE = globalThis.PHYSICS_STUDIO_VERSION || Object.freeze({
    appVersion: "4.1.0",
    stateVersion: 10,
    reportFormatVersion: 4
  });
  const APP_VERSION = String(VERSION_SOURCE.appVersion || "4.1.0");
  // v2.9 state migration keeps every v2.8 record and adds explicit placement
  // sessions plus stable portable student identities.
  const STATE_VERSION = Math.max(10, Number(VERSION_SOURCE.stateVersion) || 10);
  const DAY = 24 * 60 * 60 * 1000;
  const MASTERY_RULES = Object.freeze({
    experimental: true,
    independentHintMaximum: 1,
    masteredIndependentDates: 2,
    // Product rule, not a standardized educational threshold: a midnight
    // crossing alone is not evidence of delayed retention.
    minimumRetentionIntervalHours: 24,
    masteredTransferEvidence: 1,
    weakHintMinimum: 3,
    weakModelingBelow: 50
  });
  const BROAD_COVERAGE_INTERVAL_DAYS = 14;
  const INTERVENTION_COMPARISON_RULE = Object.freeze({
    version: 1,
    minimumMatchedPairs: 3,
    minimumDistinctDates: 2,
    emergingMaximumPairs: 2,
    standardizedAssessmentRule: false
  });
  const ERROR_TYPE_DEFINITIONS = Object.freeze([
    { code: "concept", label: "概念理解", aliases: /概念|前概念|认知/u },
    { code: "modeling", label: "研究对象\/建模", aliases: /建模|研究对象|过程划分|受力分析|理想化/u },
    { code: "law-condition", label: "规律选择或适用条件", aliases: /规律|定律|适用条件|条件错误|公式选错|选错公式/u },
    { code: "graph-representation", label: "图像与表征", aliases: /图像|图表|坐标|表征|电路图|受力图|光路图/u },
    { code: "formula-algebra", label: "公式与代数", aliases: /公式|代数|变形|联立|运算步骤/u },
    { code: "unit-direction", label: "单位\/方向\/符号", aliases: /单位|有效数字|方向|符号|正负/u },
    { code: "experiment-data", label: "实验与数据处理", aliases: /实验|器材|控制变量|数据处理|拟合|误差/u },
    { code: "reading-calculation", label: "审题或计算疏漏", aliases: /审题|读题|看错|条件遗漏|信息提取|计算|运算|粗心/u }
  ]);
  const LEGACY_ERROR_TYPE_LABELS = Object.freeze({
    "审题错误": "审题或计算疏漏",
    "概念错误": "概念理解",
    "建模错误": "研究对象/建模",
    "规律条件错误": "规律选择或适用条件",
    "计算/单位错误": "单位/方向/符号",
    "图像/实验错误": "图像与表征"
  });
  const CLOSED_LOOP_BADGES = Object.freeze([
    { id: "closed-loop-3", days: 3, title: "稳定起步" },
    { id: "closed-loop-7", days: 7, title: "一周闭环" },
    { id: "closed-loop-14", days: 14, title: "双周坚持" },
    { id: "closed-loop-30", days: 30, title: "月度坚持" }
  ]);

  const misconceptionCatalog = [
    {
      code: "force-maintains-motion",
      category: "力与运动",
      grades: ["八年级", "高一"],
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
      category: "力与运动",
      grades: ["高一"],
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
      category: "力与运动",
      grades: ["高一"],
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
      category: "电路与电学",
      grades: ["九年级", "高二"],
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
      category: "光学",
      grades: ["八年级"],
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
      category: "力与运动",
      grades: ["八年级", "高一"],
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
      category: "热学与物态变化",
      grades: ["八年级", "九年级", "高三"],
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
      category: "曲线运动与万有引力",
      grades: ["高一"],
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
    },
    {
      code: "sound-can-travel-in-vacuum",
      category: "声学",
      grades: ["八年级"],
      title: "认为声音可以在真空中传播",
      statement: "只要声源振动足够强，真空中也能听到声音。",
      correction: "声音是机械波，传播需要介质；真空不能传声。",
      topics: ["声音的传播", "声学", "机械波"],
      diagnostic: {
        id: "diag-sound-medium",
        prompt: "把正在响铃的闹钟放入密闭玻璃罩并逐渐抽去空气。若不考虑罩体传声，听到的铃声将怎样变化？",
        choices: [
          ["A", "越来越响"],
          ["B", "逐渐减弱，接近真空时听不到"],
          ["C", "音调升高但响度不变"],
          ["D", "始终不变"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "真空会增强声源的振动"],
          ["R2", "声音传播需要介质，空气减少会削弱传声"],
          ["R3", "声音和光一样都能在真空中传播"],
          ["R4", "抽气只改变音调，不影响传播"]
        ],
        correctReason: "R2",
        explanation: "声音由介质中的机械振动传播。玻璃罩内空气逐渐减少，空气传声能力减弱；理想真空中不能传声。"
      }
    },
    {
      code: "pitch-depends-on-amplitude",
      category: "声学",
      grades: ["八年级"],
      title: "混淆音调和响度的决定因素",
      statement: "振幅越大，声音的音调越高。",
      correction: "音调主要由频率决定，响度与振幅、距离等因素有关。",
      topics: ["音调", "响度", "频率", "振幅"],
      diagnostic: {
        id: "diag-pitch-frequency",
        prompt: "同一根琴弦以相同频率振动。增大振幅而频率保持不变，听到的声音主要发生什么变化？",
        choices: [
          ["A", "音调升高"],
          ["B", "音调降低"],
          ["C", "响度增大，音调基本不变"],
          ["D", "传播速度增大"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "振幅决定每秒振动次数"],
          ["R2", "频率决定音调，振幅增大通常使响度增大"],
          ["R3", "声音越响，传播速度一定越大"],
          ["R4", "音调和响度是同一个物理量"]
        ],
        correctReason: "R2",
        explanation: "频率未变，所以音调基本不变；振幅增大使声源振动更强，通常表现为响度增大。"
      }
    },
    {
      code: "convex-lens-always-magnifies",
      category: "光学",
      grades: ["八年级"],
      title: "认为凸透镜成像总是放大",
      statement: "凸透镜是放大镜，因此形成的像一定比物体大。",
      correction: "凸透镜成像性质取决于物距与焦距的关系，可成放大、等大或缩小的像。",
      topics: ["凸透镜成像", "透镜", "光路"],
      diagnostic: {
        id: "diag-convex-lens-image",
        prompt: "物体位于凸透镜二倍焦距以外，光屏上能得到怎样的像？",
        choices: [
          ["A", "正立、放大的虚像"],
          ["B", "倒立、缩小的实像"],
          ["C", "倒立、放大的实像"],
          ["D", "正立、缩小的实像"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "凸透镜总有放大作用"],
          ["R2", "物距大于二倍焦距时，像位于一倍与二倍焦距之间"],
          ["R3", "能在光屏上成的像一定正立"],
          ["R4", "像的大小只由透镜口径决定"]
        ],
        correctReason: "R2",
        explanation: "当 u＞2f 时，凸透镜在 f＜v＜2f 的位置形成倒立、缩小的实像。"
      }
    },
    {
      code: "melting-stops-absorbing-heat",
      category: "热学与物态变化",
      grades: ["八年级"],
      title: "认为晶体熔化时温度不变就不吸热",
      statement: "冰熔化过程中温度保持不变，所以不再吸收热量。",
      correction: "晶体在熔点熔化时继续吸热，吸收的能量用于改变物态。",
      topics: ["物态变化", "熔化", "晶体"],
      diagnostic: {
        id: "diag-melting-heat",
        prompt: "标准大气压下，0 ℃ 的冰水混合物持续从外界吸热且仍有冰存在。其温度和能量变化是怎样的？",
        choices: [
          ["A", "温度升高，停止熔化"],
          ["B", "温度基本不变，冰继续熔化"],
          ["C", "温度降低，内能不变"],
          ["D", "温度不变，也不吸收能量"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "温度不变说明没有能量进入系统"],
          ["R2", "晶体熔化时吸收的能量用于物态变化"],
          ["R3", "冰只能在高于 0 ℃ 时熔化"],
          ["R4", "熔化过程一定向外放热"]
        ],
        correctReason: "R2",
        explanation: "在给定压强下，冰熔化时温度保持在熔点附近，但仍吸收熔化潜热，冰的质量逐渐减少。"
      }
    },
    {
      code: "density-changes-with-size",
      category: "质量与密度",
      grades: ["八年级"],
      title: "认为同种物质的密度随质量或体积改变",
      statement: "把均匀金属块切去一半，剩余部分的密度也变为原来的一半。",
      correction: "在状态不变时，密度是物质的特性；同种均匀物质的质量与体积按相同比例改变。",
      topics: ["质量与密度", "密度", "质量"],
      diagnostic: {
        id: "diag-density-property",
        prompt: "把一块均匀实心铜块切成体积相等的两块，温度不变。每一小块与原铜块相比，密度怎样变化？",
        choices: [
          ["A", "变为一半"],
          ["B", "变为两倍"],
          ["C", "保持不变"],
          ["D", "无法判断"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "质量减半，所以密度减半"],
          ["R2", "质量和体积都减半，m/V 的比值不变"],
          ["R3", "体积越小，物质排列一定越紧密"],
          ["R4", "密度只由物体形状决定"]
        ],
        correctReason: "R2",
        explanation: "切割不改变铜的物质种类和状态。每块的质量、体积均减半，因此密度 ρ=m/V 不变。"
      }
    },
    {
      code: "action-reaction-cancel",
      category: "力与运动",
      grades: ["八年级", "高一"],
      title: "把作用力与反作用力当作平衡力",
      statement: "作用力和反作用力大小相等、方向相反，所以它们相互抵消。",
      correction: "作用力与反作用力分别作用在两个物体上，不能在同一物体的受力方程中相互抵消。",
      topics: ["相互作用力", "牛顿第三定律", "受力分析"],
      diagnostic: {
        id: "diag-action-reaction",
        prompt: "人用手水平推墙。关于手对墙的力与墙对手的力，下列说法正确的是？",
        choices: [
          ["A", "前者大于后者"],
          ["B", "后者大于前者"],
          ["C", "两力等大反向，分别作用在墙和手上"],
          ["D", "墙没有运动，所以墙对手没有力"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "运动的物体施力一定更大"],
          ["R2", "这是一对相互作用力，同时产生并作用于不同物体"],
          ["R3", "静止物体不能施力"],
          ["R4", "两力作用在同一物体上并相互抵消"]
        ],
        correctReason: "R2",
        explanation: "依据牛顿第三定律，两力等大、反向、同时存在，但受力物体不同，不能作为同一物体上的平衡力。"
      }
    },
    {
      code: "pressure-equals-force",
      category: "压强与浮力",
      grades: ["八年级"],
      title: "混淆压力和压强",
      statement: "压力相同，对接触面的作用效果一定相同。",
      correction: "压力作用效果还与受力面积有关；压强等于压力与受力面积之比。",
      topics: ["压强", "压力", "受力面积"],
      diagnostic: {
        id: "diag-solid-pressure",
        prompt: "同一长方体分别平放和竖放在水平桌面上，均保持静止。哪种放法对桌面的压强较大？",
        choices: [
          ["A", "平放较大"],
          ["B", "竖放较大"],
          ["C", "两者相等"],
          ["D", "取决于桌面质量"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "两种放法压力相同，所以压强相同"],
          ["R2", "压力相同，竖放时受力面积更小，p=F/S 更大"],
          ["R3", "物体越高，重力越大"],
          ["R4", "压强只与物体体积有关"]
        ],
        correctReason: "R2",
        explanation: "两种放法对水平桌面的压力均等于物体重力；竖放的受力面积较小，因此压强较大。"
      }
    },
    {
      code: "buoyancy-increases-with-depth",
      category: "压强与浮力",
      grades: ["八年级"],
      title: "认为物体越深浮力一定越大",
      statement: "物体在液体中所处深度越大，受到的浮力就一定越大。",
      correction: "液体密度和排开体积不变时，完全浸没物体的浮力不随深度改变。",
      topics: ["浮力", "阿基米德原理", "液体压强"],
      diagnostic: {
        id: "diag-buoyancy-depth",
        prompt: "一个刚性小球完全浸没在密度均匀的水中，先后静止在不同深度且不接触容器。水的密度不变时，浮力怎样变化？",
        choices: [
          ["A", "越深越大"],
          ["B", "越深越小"],
          ["C", "保持不变"],
          ["D", "先增大后减小"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "深度越大，物体各处压强都大，所以合力一定更大"],
          ["R2", "F浮=ρ液gV排，ρ液和 V排均不变"],
          ["R3", "浮力只由物体质量决定"],
          ["R4", "完全浸没后物体不受浮力"]
        ],
        correctReason: "R2",
        explanation: "深度增加会使物体上下表面压强都增大，但压强差对应的浮力仍为 ρ液gV排；在给定条件下浮力不变。"
      }
    },
    {
      code: "force-always-does-work",
      category: "功与简单机械",
      grades: ["八年级", "高一"],
      title: "认为有力作用就一定做机械功",
      statement: "只要物体受到力，这个力就一定对物体做功。",
      correction: "机械功还要求物体沿力的方向具有位移分量。",
      topics: ["功", "机械功", "功和能"],
      diagnostic: {
        id: "diag-work-displacement",
        prompt: "人用竖直向上的力托住一本书，书相对地面保持静止。此过程中托力对书做的机械功是多少？",
        choices: [
          ["A", "正功"],
          ["B", "负功"],
          ["C", "零"],
          ["D", "取决于托举时间"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "人感到疲劳，所以托力一定做了机械功"],
          ["R2", "书没有发生位移，W=Fs cosθ 中 s=0"],
          ["R3", "有力就必然有功"],
          ["R4", "静止物体只可能受到负功"]
        ],
        correctReason: "R2",
        explanation: "机械功由力和物体位移共同决定。书相对地面没有位移，因此托力对书所做机械功为零。"
      }
    },
    {
      code: "machine-saves-work",
      category: "功与简单机械",
      grades: ["八年级"],
      title: "认为省力机械同时省功",
      statement: "使用省力的简单机械，可以在提升同一重物时少做机械功。",
      correction: "理想机械不省功；省力通常要多移动距离，实际机械还需克服额外阻力。",
      topics: ["简单机械", "机械效率", "功"],
      diagnostic: {
        id: "diag-machine-work",
        prompt: "不计摩擦和机械自重，用省力装置把同一重物提升相同高度。与直接提升相比，人的输入功怎样？",
        choices: [
          ["A", "一定更小"],
          ["B", "一定更大"],
          ["C", "相等"],
          ["D", "变为零"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "省力就必然省功"],
          ["R2", "理想机械中力与距离互相补偿，输入功等于有用功"],
          ["R3", "机械能凭空增多"],
          ["R4", "提升高度与功无关"]
        ],
        correctReason: "R2",
        explanation: "理想机械满足功的原理：不能省功。所需力减小时，力的作用点通常移动更长距离。"
      }
    },
    {
      code: "parallel-current-equals-voltage",
      category: "电路与电学",
      grades: ["九年级"],
      title: "混淆并联电路的电流和电压规律",
      statement: "并联各支路电流相加，因此各支路电压也相加。",
      correction: "并联支路两端连接在同一对节点上，支路电压相等；干路电流等于各支路电流之和。",
      topics: ["并联电路", "电压", "电流"],
      diagnostic: {
        id: "diag-parallel-voltage",
        prompt: "两个电阻并联接在稳定电源两端。忽略导线电阻，两支路电压 U₁、U₂ 与电源电压 U 的关系是什么？",
        choices: [
          ["A", "U=U₁+U₂"],
          ["B", "U₁=U₂=U"],
          ["C", "U₁、U₂ 都为零"],
          ["D", "电阻大的支路电压一定更大"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "电流能相加，所以电压也必须相加"],
          ["R2", "各支路接在同一对节点之间，电势差相同"],
          ["R3", "电压流经支路后会被消耗"],
          ["R4", "支路电压只由电阻大小决定"]
        ],
        correctReason: "R2",
        explanation: "并联支路具有相同的两个端点，因此两端电压相等并等于电源两端电压；相加的是支路电流。"
      }
    },
    {
      code: "resistance-created-by-voltage",
      category: "电路与电学",
      grades: ["九年级"],
      title: "认为导体电阻由所加电压决定",
      statement: "导体两端电压增大，它的电阻就一定按比例增大。",
      correction: "给定温度下，欧姆导体的电阻主要由材料、长度和横截面积决定，不由瞬时电压、电流的比值任意改变。",
      topics: ["电阻", "欧姆定律", "电压"],
      diagnostic: {
        id: "diag-resistance-property",
        prompt: "某金属定值电阻温度保持不变。把它两端电压增大为原来的两倍，在欧姆定律适用范围内，其电阻怎样变化？",
        choices: [
          ["A", "变为两倍"],
          ["B", "变为一半"],
          ["C", "近似不变"],
          ["D", "变为零"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "R=U/I 表明 R 由 U 单独决定"],
          ["R2", "温度和导体本身不变时，定值电阻不因 U、I 同比例变化而改变"],
          ["R3", "电压越大，材料长度越大"],
          ["R4", "有电流时导体才有电阻"]
        ],
        correctReason: "R2",
        explanation: "对于温度不变的欧姆导体，电压加倍时电流也加倍，U/I 的比值即电阻近似保持不变。"
      }
    },
    {
      code: "kilowatt-hour-is-power",
      category: "电路与电学",
      grades: ["九年级"],
      title: "混淆电功率和电能",
      statement: "千瓦时是电功率的单位。",
      correction: "瓦特、千瓦是功率单位；千瓦时是能量单位。",
      topics: ["电功率", "电能", "电功"],
      diagnostic: {
        id: "diag-electric-energy-unit",
        prompt: "家庭电能表读数增加 1 kW·h，表示用电器消耗了什么物理量？",
        choices: [
          ["A", "1 kW 的电功率"],
          ["B", "1 kW·h 的电能"],
          ["C", "1 A 的电流"],
          ["D", "1 V 的电压"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "单位中有 kW，所以它只能表示功率"],
          ["R2", "功率乘时间得到能量，1 kW·h 是能量单位"],
          ["R3", "电能表直接测量电流"],
          ["R4", "所有家用电器功率都等于 1 kW"]
        ],
        correctReason: "R2",
        explanation: "由 W=Pt 可知，kW·h 是功率与时间的乘积，属于能量单位；1 kW·h=3.6×10⁶ J。"
      }
    },
    {
      code: "magnetic-lines-are-material",
      category: "磁学",
      grades: ["九年级", "高二"],
      title: "把磁感线当作真实存在的物质细线",
      statement: "磁场中存在可被切断、相互碰撞的真实磁感线。",
      correction: "磁感线是描述磁场方向和强弱的模型，不是客观存在的物质线。",
      topics: ["磁场", "磁感线", "磁现象"],
      diagnostic: {
        id: "diag-magnetic-field-lines",
        prompt: "关于磁感线，下列说法正确的是？",
        choices: [
          ["A", "磁感线是磁场中真实存在的细线"],
          ["B", "某点磁感线切线方向表示该点磁场方向"],
          ["C", "磁感线可以在空间任意相交"],
          ["D", "没有画磁感线的区域一定没有磁场"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "只有看得见的线才能描述磁场"],
          ["R2", "磁感线是模型，其切线和疏密分别表征方向和相对强弱"],
          ["R3", "同一点可以同时具有任意多个磁场方向"],
          ["R4", "图上画线的数量就是实际线的数量"]
        ],
        correctReason: "R2",
        explanation: "磁感线是人为引入的模型。磁场中一点的方向唯一，因此磁感线不相交；图线疏密仅用于表示相对强弱。"
      }
    },
    {
      code: "motion-in-field-always-induces-current",
      category: "电磁感应",
      grades: ["九年级"],
      title: "认为导体在磁场中运动就一定产生感应电流",
      statement: "只要导体在磁场中运动，电路中就一定有感应电流。",
      correction: "产生持续感应电流需要闭合电路，并使穿过电路的磁通量发生变化。",
      topics: ["电磁感应", "感应电流", "磁生电"],
      diagnostic: {
        id: "diag-induction-condition",
        prompt: "闭合电路的一段导体在磁场中运动。要观察到感应电流，该运动至少应满足什么条件？",
        choices: [
          ["A", "导体沿任意方向运动即可"],
          ["B", "导体使闭合回路所围区域的磁通量发生变化"],
          ["C", "导体温度升高"],
          ["D", "导体必须由磁性材料制成"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "运动本身就是电流"],
          ["R2", "闭合回路磁通量变化时才产生可测的感应电流"],
          ["R3", "只有磁铁可以导电"],
          ["R4", "感应电流来自导体受热"]
        ],
        correctReason: "R2",
        explanation: "闭合是形成电流的条件，磁通量变化是产生感应电动势的条件；仅在磁场中平移不必然满足这一条件。"
      }
    },
    {
      code: "induction-requires-conductor-motion",
      category: "电磁感应",
      grades: ["高二"],
      title: "认为电磁感应必须由导体运动产生",
      statement: "线圈和磁铁都不运动时，线圈中不可能产生感应电动势。",
      correction: "只要穿过回路的磁通量随时间变化，就会产生感应电动势；磁场随时间变化也可以实现。",
      topics: ["电磁感应", "磁通量", "法拉第电磁感应定律"],
      diagnostic: {
        id: "diag-changing-flux",
        prompt: "一个静止闭合线圈放在方向不变但磁感应强度随时间增大的匀强磁场中，磁场垂直线圈平面。线圈中是否有感应电流？",
        choices: [
          ["A", "没有，因为线圈没有运动"],
          ["B", "有，因为穿过线圈的磁通量发生变化"],
          ["C", "没有，因为磁场方向没有变化"],
          ["D", "只有线圈面积改变时才有"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "感应电动势只与机械运动有关"],
          ["R2", "Φ=BS，此处 B 随时间变化，所以磁通量变化"],
          ["R3", "磁场方向不变就表示磁通量不变"],
          ["R4", "闭合线圈会屏蔽所有变化磁场"]
        ],
        correctReason: "R2",
        explanation: "法拉第电磁感应定律关注磁通量的变化率。线圈虽静止，但 B 增大使 Φ=BS 增大，因而产生感应电动势和电流。"
      }
    },
    {
      code: "projectile-components-affect-time",
      category: "曲线运动与万有引力",
      grades: ["高一"],
      title: "认为平抛的水平速度会改变下落时间",
      statement: "同一高度平抛时，水平初速度越大，物体落地越晚。",
      correction: "忽略空气阻力时，平抛运动的竖直分运动是自由落体，下落时间由高度和重力加速度决定。",
      topics: ["平抛运动", "运动的合成与分解", "自由落体"],
      diagnostic: {
        id: "diag-projectile-time",
        prompt: "从同一高度同时释放两个相同小球：甲自由下落，乙以水平初速度平抛。忽略空气阻力，它们何时落地？",
        choices: [
          ["A", "甲先落地"],
          ["B", "乙先落地"],
          ["C", "同时落地"],
          ["D", "取决于乙的水平初速度"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "乙路径更长，所以一定更晚"],
          ["R2", "两球竖直初速度均为零，竖直方向运动完全相同"],
          ["R3", "水平速度会抵消部分重力"],
          ["R4", "甲没有水平速度，所以重力更大"]
        ],
        correctReason: "R2",
        explanation: "平抛运动的水平和竖直分运动相互独立。两球竖直方向初始条件及加速度相同，因此同时落地。"
      }
    },
    {
      code: "weightlessness-means-no-gravity",
      category: "曲线运动与万有引力",
      grades: ["高一", "高三"],
      title: "认为完全失重表示不受万有引力",
      statement: "航天器中的物体完全失重，说明地球对它没有引力。",
      correction: "完全失重是支持力或测得的视重为零；轨道运动中的物体仍受地球引力，并由其提供向心加速度。",
      topics: ["万有引力", "失重", "圆周运动"],
      diagnostic: {
        id: "diag-orbit-weightlessness",
        prompt: "航天员随空间站绕地球做近圆轨道运动时处于完全失重状态。关于航天员受力，下列说法正确的是？",
        choices: [
          ["A", "不再受到地球引力"],
          ["B", "仍受地球引力，且引力提供轨道运动所需的向心作用"],
          ["C", "所受合力为零"],
          ["D", "只受沿轨道切线方向的力"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "失重就是重力消失"],
          ["R2", "航天员和空间站共同自由落体，支持力近似为零但引力仍存在"],
          ["R3", "圆周运动速度大小不变，所以合力为零"],
          ["R4", "太空中不存在引力场"]
        ],
        correctReason: "R2",
        explanation: "轨道高度仍处于地球引力场中。失重反映支持力近似为零，不代表万有引力消失。"
      }
    },
    {
      code: "momentum-always-conserved",
      category: "动量",
      grades: ["高一", "高二"],
      title: "认为任何过程中系统动量都守恒",
      statement: "只要两个物体发生碰撞，它们的总动量和总动能就都守恒。",
      correction: "系统总动量守恒要求过程中的合外力冲量可忽略；动能只在弹性碰撞中守恒。",
      topics: ["动量", "动量守恒", "碰撞"],
      diagnostic: {
        id: "diag-momentum-condition",
        prompt: "研究两小球短时碰撞。若碰撞过程中系统合外力冲量可忽略，下列结论一定成立的是？",
        choices: [
          ["A", "系统总动量守恒"],
          ["B", "系统总动能守恒"],
          ["C", "每个小球动量均不变"],
          ["D", "两球碰后一定粘在一起"]
        ],
        correctAnswer: "A",
        reasons: [
          ["R1", "合外力冲量可忽略时，系统总动量的变化量为零"],
          ["R2", "所有碰撞都不会产生内能"],
          ["R3", "总动量守恒意味着各物体动量分别守恒"],
          ["R4", "碰撞是否弹性与外力冲量是同一条件"]
        ],
        correctReason: "R1",
        explanation: "由系统动量定理，合外力冲量可忽略时总动量守恒；非弹性碰撞中总动能可以减少。"
      }
    },
    {
      code: "shm-equilibrium-means-rest",
      category: "振动与波",
      grades: ["高二"],
      title: "认为简谐运动经过平衡位置时速度为零",
      statement: "振子到达平衡位置时位移为零，因此速度也为零。",
      correction: "简谐运动经过平衡位置时回复力和加速度为零，速度大小最大。",
      topics: ["简谐运动", "振动", "回复力"],
      diagnostic: {
        id: "diag-shm-equilibrium",
        prompt: "做简谐运动的弹簧振子经过平衡位置的瞬间，下列描述正确的是？",
        choices: [
          ["A", "速度为零，加速度最大"],
          ["B", "速度最大，加速度为零"],
          ["C", "速度和加速度都为零"],
          ["D", "速度和加速度都最大"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "位移为零就意味着所有运动学量为零"],
          ["R2", "平衡位置回复力为零、势能最小，动能和速度达到最大"],
          ["R3", "速度最大时加速度必定同向最大"],
          ["R4", "振子在平衡位置会停留一段时间"]
        ],
        correctReason: "R2",
        explanation: "简谐运动中 a=-ω²x。平衡位置 x=0，故 a=0；机械能守恒时该处动能最大，速度大小最大。"
      }
    },
    {
      code: "wave-transports-matter",
      category: "振动与波",
      grades: ["八年级", "高二"],
      title: "认为机械波把介质质点持续带向远方",
      statement: "波向前传播时，介质中的质点也随波整体向前迁移。",
      correction: "机械波传播振动状态和能量，介质质点通常只在平衡位置附近振动。",
      topics: ["机械波", "波的传播", "振动"],
      diagnostic: {
        id: "diag-wave-particles",
        prompt: "一列水面波向右传播。水面上一片轻小叶子随水面振动且无明显水流时，叶子的主要运动是怎样的？",
        choices: [
          ["A", "随波峰一直向右移动"],
          ["B", "在平衡位置附近振动，波形和能量向右传播"],
          ["C", "保持绝对静止"],
          ["D", "以波速持续向左移动"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "波传播就是介质整体搬运"],
          ["R2", "机械波传递振动状态和能量，质点不随波长距离迁移"],
          ["R3", "有波时介质质点不能振动"],
          ["R4", "波速就是每个质点的恒定速度"]
        ],
        correctReason: "R2",
        explanation: "在无明显流动的理想化情形下，介质质点在平衡位置附近振动；向外传播的是相位和能量。"
      }
    },
    {
      code: "gas-law-uses-celsius",
      category: "热学与物态变化",
      grades: ["高三"],
      title: "在气体定律中直接使用摄氏温度比例",
      statement: "一定质量气体从 20 ℃ 升到 40 ℃，热力学温度就变为两倍。",
      correction: "气体状态方程中的温度必须使用热力学温度，T=t+273.15 K。",
      topics: ["气体", "热力学温度", "理想气体状态方程"],
      diagnostic: {
        id: "diag-gas-kelvin",
        prompt: "一定质量理想气体体积不变，从 27 ℃ 加热到 327 ℃。若初压强为 p，末压强约为多少？",
        choices: [
          ["A", "2p"],
          ["B", "约 12.1p"],
          ["C", "p/2"],
          ["D", "仍为 p"]
        ],
        correctAnswer: "A",
        reasons: [
          ["R1", "定容时 p∝T，300 K 升到 600 K，压强加倍"],
          ["R2", "应直接用 327/27 计算比例"],
          ["R3", "摄氏温度与热力学温度的零点相同"],
          ["R4", "体积不变时压强与温度无关"]
        ],
        correctReason: "R1",
        explanation: "定容、定量理想气体满足 p/T 为常量。27 ℃≈300 K，327 ℃≈600 K，所以末压强约为 2p。"
      }
    },
    {
      code: "zero-potential-means-zero-field",
      category: "电场",
      grades: ["高二"],
      title: "认为电势为零处电场强度一定为零",
      statement: "某点电势为零，就说明该点没有电场。",
      correction: "电势零点可人为选择；电场强度与电势的空间变化有关，电势值为零不代表梯度为零。",
      topics: ["电场", "电势", "电场强度"],
      diagnostic: {
        id: "diag-zero-potential-field",
        prompt: "等量异种点电荷 +q 和 -q 连线中点处，取无穷远电势为零。该点的电势和电场强度分别怎样？",
        choices: [
          ["A", "电势为零，电场强度也为零"],
          ["B", "电势为零，电场强度不为零"],
          ["C", "电势不为零，电场强度为零"],
          ["D", "二者都无法判断"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "电势和电场强度是同一个物理量"],
          ["R2", "两电荷的电势代数和为零，但电场方向相同而叠加"],
          ["R3", "电势为零意味着没有电荷"],
          ["R4", "标量为零时所有矢量都必须为零"]
        ],
        correctReason: "R2",
        explanation: "中点到两电荷距离相等，电势的正负贡献抵消；两电场矢量均由 +q 指向 -q，故合场强不为零。"
      }
    },
    {
      code: "magnetic-force-changes-speed",
      category: "磁场",
      grades: ["高二"],
      title: "认为洛伦兹力能改变带电粒子的速率",
      statement: "带电粒子受到磁场力后动能一定改变。",
      correction: "单独的磁洛伦兹力始终垂直于瞬时速度，不做功，只改变速度方向。",
      topics: ["磁场", "洛伦兹力", "带电粒子运动"],
      diagnostic: {
        id: "diag-magnetic-force-work",
        prompt: "带电粒子仅受匀强磁场的洛伦兹力作用。忽略其他力，其运动速率和动能怎样变化？",
        choices: [
          ["A", "速率增大，动能增大"],
          ["B", "速率减小，动能减小"],
          ["C", "速率和动能均不变，速度方向可改变"],
          ["D", "速率不变，但动能改变"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "只要有力就一定改变速率"],
          ["R2", "磁场力垂直于速度，功率 F·v 为零"],
          ["R3", "圆周运动需要不断消耗动能"],
          ["R4", "方向改变意味着动能必然改变"]
        ],
        correctReason: "R2",
        explanation: "磁洛伦兹力与粒子速度垂直，对粒子不做功，所以动能和速率不变，但速度方向会改变。"
      }
    },
    {
      code: "transformer-raises-current-and-voltage",
      category: "交流电",
      grades: ["高三"],
      title: "认为理想变压器升高电压时也升高电流",
      statement: "变压器把电压升高后，输出电流也会按相同比例增大。",
      correction: "理想变压器近似满足输入功率等于输出功率；升压时，在给定负载状态下输出电流相应较小。",
      topics: ["交流电", "变压器", "电能输送"],
      diagnostic: {
        id: "diag-transformer-current",
        prompt: "理想变压器原、副线圈匝数满足 N₂＞N₁，接入合适交流负载并正常工作。若 U₂＞U₁，则电流关系怎样？",
        choices: [
          ["A", "I₂＞I₁"],
          ["B", "I₂＜I₁"],
          ["C", "I₂=I₁"],
          ["D", "原线圈一定没有电流"]
        ],
        correctAnswer: "B",
        reasons: [
          ["R1", "电压和电流会同时按匝数比增大"],
          ["R2", "理想情况下 U₁I₁=U₂I₂，升压对应降流"],
          ["R3", "副线圈匝数多会产生额外能量"],
          ["R4", "变压器只能改变直流电压"]
        ],
        correctReason: "R2",
        explanation: "理想变压器满足 U₂/U₁=N₂/N₁，且输入、输出功率近似相等，因此 U₂较大时 I₂较小。"
      }
    },
    {
      code: "photoelectric-intensity-controls-max-energy",
      category: "光电与原子核",
      grades: ["高三"],
      title: "认为光强决定光电子最大初动能",
      statement: "用同频率光照射金属时，光越强，逸出光电子的最大初动能越大。",
      correction: "频率高于截止频率时，最大初动能由单个光子能量与逸出功之差决定；光强主要影响单位时间光子数和光电流。",
      topics: ["光电效应", "光子", "逸出功"],
      diagnostic: {
        id: "diag-photoelectric-frequency",
        prompt: "频率高于截止频率的单色光照射同一金属。只增大光强而保持频率不变，饱和光电流和光电子最大初动能如何变化？",
        choices: [
          ["A", "饱和光电流增大，最大初动能不变"],
          ["B", "二者都增大"],
          ["C", "饱和光电流不变，最大初动能增大"],
          ["D", "二者都不变"]
        ],
        correctAnswer: "A",
        reasons: [
          ["R1", "光强增大使单位时间入射光子数增加，但单个光子能量 hν 不变"],
          ["R2", "光强就是单个光子的能量"],
          ["R3", "最大初动能只由照射时间决定"],
          ["R4", "只要有光照就与频率无关"]
        ],
        correctReason: "R1",
        explanation: "爱因斯坦光电方程 Kmax=hν-W₀。频率不变时 Kmax 不变；光强增大通常使逸出光电子数和饱和光电流增大。"
      }
    },
    {
      code: "atom-absorbs-any-photon",
      category: "光电与原子核",
      grades: ["高三"],
      title: "认为原子可吸收任意能量的光子",
      statement: "只要光子照到原子，原子就能吸收任意大小的光子能量。",
      correction: "处于束缚态的原子具有分立能级；通常只有光子能量与允许跃迁的能级差匹配时才发生相应吸收。",
      topics: ["原子结构", "能级", "光谱"],
      diagnostic: {
        id: "diag-atomic-transition",
        prompt: "某原子从能量 E₁ 的定态跃迁到较高的允许定态 E₂。所吸收单个光子的频率应满足什么关系？",
        choices: [
          ["A", "hν=E₂-E₁"],
          ["B", "hν可以小于 E₂-E₁ 的任意值"],
          ["C", "hν=E₁+E₂"],
          ["D", "频率与能级差无关"]
        ],
        correctAnswer: "A",
        reasons: [
          ["R1", "能量守恒且原子能级分立，光子能量需匹配能级差"],
          ["R2", "原子内部能量可以连续取任意值"],
          ["R3", "光子的能量只由光强决定"],
          ["R4", "跃迁不需要交换能量"]
        ],
        correctReason: "R1",
        explanation: "光子能量为 hν。对 E₁→E₂ 的允许吸收跃迁，能量守恒要求 hν=E₂-E₁。"
      }
    },
    {
      code: "half-life-changes-with-environment",
      category: "光电与原子核",
      grades: ["高三"],
      title: "认为加热或加压能显著改变放射性半衰期",
      statement: "提高温度或压强可以使放射性核素的半衰期明显缩短。",
      correction: "在中学讨论的通常条件下，放射性核素的半衰期由原子核自身性质决定，不随温度、压强和化学状态显著改变。",
      topics: ["原子核", "放射性", "半衰期"],
      diagnostic: {
        id: "diag-nuclear-half-life",
        prompt: "把某放射性核素样品加热并加压，但不发生核反应。其半衰期通常怎样变化？",
        choices: [
          ["A", "明显缩短"],
          ["B", "明显延长"],
          ["C", "基本不变"],
          ["D", "变为零"]
        ],
        correctAnswer: "C",
        reasons: [
          ["R1", "温度越高，所有微观过程都会按相同比例加快"],
          ["R2", "通常条件下半衰期由原子核内部性质决定"],
          ["R3", "压强会直接压碎原子核"],
          ["R4", "半衰期由样品质量决定"]
        ],
        correctReason: "R2",
        explanation: "若不发生核反应，常规温度、压强和化学变化不改变核素本身，半衰期基本不变。"
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
    "m/s²": { dimension: "acceleration", factor: 1 },
    "m²": { dimension: "area", factor: 1 },
    "cm²": { dimension: "area", factor: 0.0001 },
    "mm²": { dimension: "area", factor: 0.000001 },
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

  function normalizeQuestionType(value) {
    const normalized = String(value || "").trim().slice(0, 50);
    if (!normalized) return "未标注";
    if (/^(?:单选题|单项题)$/u.test(normalized)) return "单项选择题";
    if (/^(?:多选题|多项题)$/u.test(normalized)) return "多项选择题";
    return normalized;
  }

  function normalizeErrorType(value) {
    const normalized = String(value || "").trim().replaceAll("／", "/").slice(0, 80);
    if (!normalized) return "";
    if (LEGACY_ERROR_TYPE_LABELS[normalized]) return LEGACY_ERROR_TYPE_LABELS[normalized];
    const exact = ERROR_TYPE_DEFINITIONS.find((item) => {
      return normalized === item.label || normalized === item.label.replace("错误", "");
    });
    if (exact) return exact.label;
    const inferred = ERROR_TYPE_DEFINITIONS.find((item) => item.aliases.test(normalized));
    return inferred?.label || normalized;
  }

  function errorTypeCode(value) {
    const normalized = normalizeErrorType(value);
    if (!normalized) return "";
    return ERROR_TYPE_DEFINITIONS.find((item) => item.label === normalized)?.code || "other";
  }

  function normalizeAttemptEvidence(attempt = {}) {
    const normalizedErrorType = normalizeErrorType(attempt.errorType);
    const knowledgePointId = String(topicKeyForQuestion(attempt) || attempt.knowledgePointId || "").trim();
    return {
      ...attempt,
      knowledgePointId,
      modelDefinitionId: String(attempt.modelDefinitionId || attempt.modelFamilyId || "").trim(),
      independenceGroupId: String(attempt.independenceGroupId || attempt.modelDefinitionId || attempt.modelFamilyId || "").trim(),
      topicKey: topicKeyForQuestion(attempt),
      questionType: normalizeQuestionType(attempt.questionType || attempt.examQuestionType),
      errorType: normalizedErrorType,
      errorTypeCode: normalizedErrorType ? errorTypeCode(normalizedErrorType) : ""
    };
  }

  // Scoring evidence is deliberately kept separate from submitted work.  An
  // open response can be stored and shown to a teacher without silently
  // becoming a zero score in any student metric.
  function isPendingManualReview(attempt = {}) {
    return attempt?.grading?.legacyReview?.status === "pending"
      || String(attempt?.grading?.status || "") === "review-required";
  }

  // Opt-in only: preserve original grading and raw evidence; never regrade all
  // history merely because the installed grading engine changed.
  function markLegacyGradingForReview(state, attemptIds = [], reason = "旧评分规则需要核验") {
    const ids = new Set(attemptIds);
    const marked = [];
    (state.attempts || []).forEach((attempt) => {
      if (!ids.has(attempt.id) || attempt.grading?.manualReview || attempt.grading?.gradingVersion === GRADING_VERSION) return;
      attempt.grading = { ...attempt.grading, legacyReview: { status: "pending", reason: String(reason).slice(0, 500), markedAt: new Date().toISOString(), originalGradingVersion: attempt.grading?.gradingVersion || "legacy-unversioned" } };
      (state.variantAttempts || []).filter((record) => record.attemptId === attempt.id).forEach((record) => { record.verificationStatus = "pending-manual-review"; });
      marked.push(attempt.id);
    });
    return marked;
  }

  function isAutoScoredAttempt(attempt = {}) {
    if (isPendingManualReview(attempt)) return false;
    const status = String(attempt?.grading?.status || "");
    return ["correct", "incorrect", "partial", "wrong"].includes(status)
      && Number.isFinite(Number(attempt?.grading?.score));
  }

  function isValidAccuracyEvidence(attempt = {}) {
    return isAutoScoredAttempt(attempt);
  }

  function summarizeAttemptEvidence(attempts = []) {
    const submittedCount = Array.isArray(attempts) ? attempts.length : 0;
    const pendingReviewCount = (attempts || []).filter(isPendingManualReview).length;
    const scored = (attempts || []).filter(isValidAccuracyEvidence);
    const correctCount = scored.filter((attempt) => attempt.grading?.status === "correct").length;
    const scoreTotal = scored.reduce((sum, attempt) => sum + Number(attempt.grading?.score), 0);
    const hintTotal = (attempts || []).reduce((sum, attempt) => sum + (Number(attempt.hintLevel) || 0), 0);
    return {
      submittedCount,
      scoredCount: scored.length,
      correctCount,
      pendingReviewCount,
      accuracy: scored.length ? Math.round(correctCount / scored.length * 100) : null,
      scoreTotal,
      averageScore: scored.length ? Math.round(scoreTotal / scored.length * 100) : null,
      hintTotal,
      averageHint: submittedCount ? Math.round(hintTotal / submittedCount * 10) / 10 : 0
    };
  }

  function createId(prefix = "record") {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createPortableProfileId() {
    if (globalThis.crypto?.randomUUID) return `student-${globalThis.crypto.randomUUID()}`;
    // Browsers without randomUUID still have a cryptographically random source
    // in normal WebView contexts; the timestamp is only a collision guard.
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return `student-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
    }
    return `student-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
  }

  function storageRepository() {
    if (globalThis.PhysicsStudioStorageRepository) return globalThis.PhysicsStudioStorageRepository;
    return {
      getItem: () => null,
      setItem: () => { throw new Error("Storage repository unavailable"); }
    };
  }

  function localCalendarDateKey(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
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

  function normalizeVariantQuestion(value = {}, index = 0) {
    if (!value || typeof value !== "object") return null;
    const rawRole = String(value.variantRole || "");
    const role = ["core", "near", "far", "counter"].includes(rawRole)
      ? rawRole
      : ["reverse", "context"].includes(rawRole) ? "far"
        : ["near", "far", "counter"][index] || "near";
    const legacyTechnique = rawRole === "reverse" ? "reverse" : rawRole === "context" ? "context" : "";
    const content = String(value.content || "").trim().slice(0, 60000);
    const answer = String(value.answer || "").trim().slice(0, 30000);
    const solution = String(value.solution || "").trim().slice(0, 60000);
    if (!value.id || !content || !answer || !solution) return null;
    const validation = value.validation && typeof value.validation === "object"
      ? {
        ...value.validation,
        passed: value.validation.passed === true,
        verificationStatus: String(value.validation.verificationStatus || (value.validation.passed ? "validated" : "failed")),
        failedReasons: Array.isArray(value.validation.failedReasons) ? value.validation.failedReasons.slice(0, 50) : []
      }
      : { passed: false, verificationStatus: "unverified", checks: {}, failedReasons: ["缺少独立质量门禁记录"] };
    return {
      ...value,
      id: String(value.id).slice(0, 240),
      sourceQuestionId: String(value.sourceQuestionId || "").slice(0, 200),
      sourceCandidateId: String(value.sourceCandidateId || "").slice(0, 200),
      variantRole: role,
      variantRoleLabel: String(({ core: "母题", near: "近迁移", far: "远迁移", counter: "反例辨析" }[role])).slice(0, 80),
      variantTechnique: String(value.variantTechnique || legacyTechnique || ({ near: "condition", far: "context", counter: "counterexample", core: "parameter" }[role])).slice(0, 80),
      sequence: Math.max(1, Math.min(3, Number(value.sequence) || index + 1)),
      title: String(value.title || `专项变式 ${index + 1}`).slice(0, 240),
      content,
      answer,
      solution,
      options: Array.isArray(value.options) ? value.options.slice(0, 12) : [],
      examPoints: Array.isArray(value.examPoints) ? value.examPoints.slice(0, 20) : [],
      knowledgePoints: Array.isArray(value.knowledgePoints) ? value.knowledgePoints.slice(0, 20) : [],
      questionType: normalizeQuestionType(value.questionType),
      knowledgePointId: String(value.knowledgePointId || value.topicKey || "").slice(0, 200),
      modelDefinitionId: String(value.modelDefinitionId || value.modelFamilyId || "").slice(0, 200),
      modelFamilyId: String(value.modelFamilyId || value.modelDefinitionId || "").slice(0, 200),
      transferGroupId: String(value.transferGroupId || value.retestGroupId || "").slice(0, 200),
      independenceGroupId: String(value.independenceGroupId || value.modelDefinitionId || value.modelFamilyId || "").slice(0, 200),
      changeSummary: String(value.changeSummary || "").slice(0, 2000),
      relationToParent: String(value.relationToParent || "").slice(0, 2000),
      source: String(value.source || "应用内变式").slice(0, 300),
      approvalStatus: String(value.approvalStatus || "pending-teacher-review").slice(0, 80),
      reviewRequired: value.reviewRequired !== false,
      validation,
      fullTextIncluded: true
    };
  }

  function normalizeVariantSet(value = {}) {
    if (!value || typeof value !== "object" || !value.id || !value.parentQuestionId) return null;
    const variants = (Array.isArray(value.variants) ? value.variants : [])
      .slice(0, 3)
      .map(normalizeVariantQuestion)
      .filter(Boolean);
    return {
      ...value,
      id: String(value.id).slice(0, 240),
      cacheKey: String(value.cacheKey || "").slice(0, 600),
      parentQuestionId: String(value.parentQuestionId).slice(0, 200),
      sourceContentHash: String(value.sourceContentHash || "").slice(0, 160),
      specVersion: String(value.specVersion || "variant_generation_v1").slice(0, 80),
      generatorVersion: String(value.generatorVersion || "legacy").slice(0, 80),
      variants,
      status: String(value.status || (variants.length >= 2 ? "pending-review" : "unavailable")).slice(0, 80),
      approvalStatus: String(value.approvalStatus || "pending-teacher-review").slice(0, 80),
      reviewRequired: value.reviewRequired !== false,
      stale: value.stale === true,
      createdAt: String(value.createdAt || new Date().toISOString()),
      updatedAt: String(value.updatedAt || value.createdAt || new Date().toISOString())
    };
  }

  function normalizeVariantAttempt(value = {}) {
    if (!value || typeof value !== "object" || !value.id || !value.attemptId || !value.variantQuestionId) return null;
    return {
      ...value,
      id: String(value.id).slice(0, 240),
      variantSetId: String(value.variantSetId || "").slice(0, 240),
      parentQuestionId: String(value.parentQuestionId || "").slice(0, 200),
      variantQuestionId: String(value.variantQuestionId).slice(0, 240),
      profileId: String(value.profileId || "student-default").slice(0, 200),
      variantRole: ["core", "near", "far", "counter"].includes(String(value.variantRole))
        ? String(value.variantRole)
        : ["reverse", "context"].includes(String(value.variantRole)) ? "far" : "near",
      variantTechnique: String(value.variantTechnique || (value.variantRole === "reverse" ? "reverse" : value.variantRole === "context" ? "context" : "")).slice(0, 80),
      attemptId: String(value.attemptId).slice(0, 240),
      hintLevel: Math.max(0, Math.min(5, Number(value.hintLevel) || 0)),
      gradingStatus: String(value.gradingStatus || "review-required").slice(0, 80),
      verificationStatus: String(value.verificationStatus || "practice-only").slice(0, 80),
      solutionViewed: value.solutionViewed === true || Number(value.hintLevel) >= 5,
      completedAt: String(value.completedAt || value.createdAt || new Date().toISOString())
    };
  }

  function normalizeVariantPreset(value = {}) {
    if (!value || typeof value !== "object" || !value.id) return null;
    return {
      ...value,
      id: String(value.id).slice(0, 200),
      name: String(value.name || "常用变式组卷参数").slice(0, 120),
      parentCount: Math.max(1, Math.min(30, Number(value.parentCount) || 3)),
      variantsPerParent: Math.max(2, Math.min(3, Number(value.variantsPerParent) || 3)),
      difficultyRatios: value.difficultyRatios && typeof value.difficultyRatios === "object"
        ? value.difficultyRatios
        : { basic: 50, advanced: 35, challenge: 15 },
      includeWrong: value.includeWrong !== false,
      includeReverse: value.includeReverse !== false,
      includeContext: value.includeContext !== false,
      updatedAt: String(value.updatedAt || new Date().toISOString())
    };
  }

  function normalizeFeynmanExplanation(value = {}) {
    if (!value || typeof value !== "object" || !value.id || !value.questionId) return null;
    const explanation = String(value.explanation || "").trim().slice(0, 12000);
    if (!explanation) return null;
    const evidenceIds = Array.isArray(value.evidenceIds)
      ? [...new Set(value.evidenceIds.map(String).filter(Boolean))].slice(0, 100)
      : [];
    return {
      ...value,
      id: String(value.id).slice(0, 240),
      profileId: String(value.profileId || "student-default").slice(0, 200),
      questionId: String(value.questionId).slice(0, 240),
      knowledgePointId: String(value.knowledgePointId || value.topicKey || "").slice(0, 200),
      topic: String(value.topic || "待分类").slice(0, 160),
      explanation,
      researchObject: String(value.researchObject || "").trim().slice(0, 2000),
      lawConditions: String(value.lawConditions || "").trim().slice(0, 4000),
      analogy: String(value.analogy || "").trim().slice(0, 6000),
      prediction: String(value.prediction || "").trim().slice(0, 6000),
      predictionReason: String(value.predictionReason || "").trim().slice(0, 6000),
      retestQuestionId: String(value.retestQuestionId || "").slice(0, 240),
      unclearPoint: String(value.unclearPoint || "").trim().slice(0, 6000),
      evidenceIds,
      verificationStatus: String(value.verificationStatus || "student-reflection-only").slice(0, 80),
      createdAt: String(value.createdAt || new Date().toISOString()),
      updatedAt: String(value.updatedAt || value.createdAt || new Date().toISOString())
    };
  }

  function defaultState() {
    return {
      version: STATE_VERSION,
      activeProfileId: "student-default",
      profiles: [{
        id: "student-default",
        portableProfileId: createPortableProfileId(),
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
      broadCoverageChecks: [],
      examRecords: [],
      growthRecords: [],
      importedReports: [],
      contentReviews: {},
      experimentRecords: [],
      temporaryLearningGroups: [],
      assessmentSessions: [],
      variantSets: [],
      variantAttempts: [],
      variantPresets: [],
      feynmanExplanations: [],
      settings: {
        dailyGoal: 5,
        preferredStage: "全部",
        dataMode: "local-only",
        aiDataNoticeAcceptedAt: ""
      },
      updatedAt: new Date().toISOString()
    };
  }

  function migrateState(value) {
    const source = value && typeof value === "object" ? value : {};
    const version = Number(source.version) || 1;
    const migrated = { ...source };
    if (version < 5) {
      // v5 adds source identities and canonical topic metadata. Legacy arrays
      // remain intact and are normalized below; no record is discarded.
      migrated.version = 5;
    }
    if (version < 6) {
      // v6 adds evidence accounting and comparable-intervention fields.  The
      // existing attempts/plans are retained; normalizeState fills defaults.
      migrated.version = 6;
    }
    if (version < 7) {
      // v7 introduces explicit placement sessions.  Existing practice,
      // diagnostic and broad-coverage evidence is deliberately not promoted
      // to a completed placement assessment.
      migrated.version = 7;
      if (!Array.isArray(migrated.assessmentSessions)) migrated.assessmentSessions = [];
    }
    if (version < 8) {
      // v8 adds stable cross-device report identities, explicit legacy identity
      // resolution and consent metadata. No legacy evidence is promoted,
      // merged, deleted or reassigned during this migration.
      migrated.version = 8;
      if (!Array.isArray(migrated.importedReports)) migrated.importedReports = [];
    }
    if (version < 9) {
      // v9 adds complete generated-variant sets and their evidence links. Old
      // transferNotes/experimentRecords remain untouched and are not promoted
      // to verified transfer evidence without their original verification.
      migrated.version = 9;
      if (!Array.isArray(migrated.variantSets)) migrated.variantSets = [];
      if (!Array.isArray(migrated.variantAttempts)) migrated.variantAttempts = [];
      if (!Array.isArray(migrated.variantPresets)) migrated.variantPresets = [];
    }
    if (version < 10) {
      // v10 adds student Feynman self-explanations and canonical transfer
      // roles. Existing transferNotes, variant sets and attempts are retained;
      // normalizeState maps legacy reverse/context roles without changing IDs.
      migrated.version = 10;
      if (!Array.isArray(migrated.feynmanExplanations)) migrated.feynmanExplanations = [];
    }
    return migrated;
  }

  function normalizeState(value) {
    const fallback = defaultState();
    if (!value || typeof value !== "object") return fallback;
    const migrated = migrateState(value);
    return {
      ...fallback,
      ...migrated,
      version: STATE_VERSION,
      profiles: (() => {
        const usedPortableIds = new Set();
        const profiles = Array.isArray(migrated.profiles) && migrated.profiles.length
          ? migrated.profiles.map(normalizeProfile).map((profile) => {
            let next = profile;
            if (usedPortableIds.has(profile.portableProfileId)) {
              next = { ...profile, portableProfileId: createPortableProfileId() };
            }
            usedPortableIds.add(next.portableProfileId);
            return next.id === "student-default" && next.role !== "student"
              ? { ...next, role: "student" }
              : next;
          })
          : fallback.profiles;
        return profiles;
      })(),
      diagnosticAttempts: Array.isArray(migrated.diagnosticAttempts) ? migrated.diagnosticAttempts : [],
      attempts: Array.isArray(migrated.attempts) ? migrated.attempts.map(normalizeAttemptEvidence) : [],
      reviews: migrated.reviews && typeof migrated.reviews === "object" && !Array.isArray(migrated.reviews) ? migrated.reviews : {},
      assignments: Array.isArray(migrated.assignments) ? migrated.assignments : [],
      learningPlans: Array.isArray(migrated.learningPlans)
        ? migrated.learningPlans.slice(-500).map((plan) => ({
          ...plan,
          baselineEvidenceIds: Array.isArray(plan.baselineEvidenceIds) ? plan.baselineEvidenceIds : [],
          focusTopicKeys: Array.isArray(plan.focusTopicKeys)
            ? plan.focusTopicKeys
            : (Array.isArray(plan.focusTopics) ? plan.focusTopics.map(topicKeyForLabel) : []),
          retestEvidenceIds: Array.isArray(plan.retestEvidenceIds) ? plan.retestEvidenceIds : [],
          comparisonRule: String(plan.comparisonRule || "same-topic-scored-equivalent-model").slice(0, 300),
          comparisonStatus: ["comparable", "emerging", "insufficient", "unmatched"].includes(plan.comparisonStatus)
            ? plan.comparisonStatus
            : "insufficient",
          sessions: Array.isArray(plan.sessions) && plan.sessions.length
            ? plan.sessions.map((session, index) => ({
              id: String(session.id || `session-${index + 1}`),
              sequence: Number(session.sequence) || index + 1,
              title: String(session.title || `第 ${index + 1} 次学习`),
              questionIds: Array.isArray(session.questionIds) ? session.questionIds : [],
              expectedMinutes: Math.max(1, Number(session.expectedMinutes) || 12),
              status: String(session.status || (index ? "locked" : "ready")),
              dueAt: String(session.dueAt || "")
            }))
            : [{
              id: "legacy-session",
              sequence: 1,
              title: "旧版专项方案",
              questionIds: Array.isArray(plan.questionIds) ? plan.questionIds : [],
              expectedMinutes: Math.max(1, Math.min(15, Number(plan.expectedMinutes) || 15)),
              status: plan.status === "completed" ? "completed" : "ready",
              dueAt: String(plan.dueAt || "")
            }],
          currentSessionIndex: Math.max(0, Number(plan.currentSessionIndex) || 0),
          totalExpectedMinutes: Math.max(1, Number(plan.totalExpectedMinutes || plan.expectedMinutes) || 15)
        }))
        : [],
      broadCoverageChecks: Array.isArray(migrated.broadCoverageChecks)
        ? migrated.broadCoverageChecks.slice(-500)
        : [],
      examRecords: Array.isArray(migrated.examRecords)
        ? migrated.examRecords.map(normalizeExamRecord).slice(-2000)
        : [],
      growthRecords: Array.isArray(migrated.growthRecords) ? migrated.growthRecords.slice(-2000) : [],
      importedReports: Array.isArray(migrated.importedReports)
        ? migrated.importedReports.slice(-2000).map(normalizeImportedReport)
        : [],
      contentReviews: migrated.contentReviews && typeof migrated.contentReviews === "object" ? migrated.contentReviews : {},
      experimentRecords: Array.isArray(migrated.experimentRecords) ? migrated.experimentRecords : [],
      temporaryLearningGroups: Array.isArray(migrated.temporaryLearningGroups)
        ? migrated.temporaryLearningGroups.slice(-500)
        : [],
      assessmentSessions: Array.isArray(migrated.assessmentSessions)
        ? migrated.assessmentSessions.slice(-200).map(normalizeAssessmentSession)
        : [],
      variantSets: Array.isArray(migrated.variantSets)
        ? migrated.variantSets.slice(-1000).map(normalizeVariantSet).filter(Boolean)
        : [],
      variantAttempts: Array.isArray(migrated.variantAttempts)
        ? migrated.variantAttempts.slice(-10000).map(normalizeVariantAttempt).filter(Boolean)
        : [],
      variantPresets: Array.isArray(migrated.variantPresets)
        ? migrated.variantPresets.slice(-100).map(normalizeVariantPreset).filter(Boolean)
        : [],
      feynmanExplanations: Array.isArray(migrated.feynmanExplanations)
        ? migrated.feynmanExplanations.slice(-5000).map(normalizeFeynmanExplanation).filter(Boolean)
        : [],
      settings: { ...fallback.settings, ...(migrated.settings || {}) }
    };
  }

  function loadState() {
    const repository = storageRepository();
    try {
      const raw = repository.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      if (!repository.storageFault?.().readOnly) repository.enterReadOnlyFault?.(error, "read");
      throw error;
    }
  }

  let lastSavePromise = Promise.resolve({ saved: true, revision: "initial" });

  function awaitLastSave() {
    return lastSavePromise;
  }

  function saveState(value) {
    const normalized = normalizeState(value);
    normalized.updatedAt = new Date().toISOString();
    const repository = storageRepository();
    if (typeof repository.stageLearningState === "function") {
      lastSavePromise = Promise.resolve(repository.stageLearningState(STORAGE_KEY, normalized));
      lastSavePromise.catch((error) => {
        try {
          globalThis.dispatchEvent?.(new CustomEvent("physics-storage-error", {
            detail: { message: "数据未保存", errorCode: String(error?.name || "storage-write-failed") }
          }));
        } catch (_dispatchError) { /* host may not implement CustomEvent */ }
      });
    } else {
      lastSavePromise = Promise.resolve(repository.setItem(STORAGE_KEY, JSON.stringify(normalized)))
        .then((outcome) => outcome || { saved: true, fallback: "localStorage" });
    }
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
      portableProfileId: String(profile?.portableProfileId || createPortableProfileId()).trim().slice(0, 200),
      name: String(profile?.name || "本机学生").trim().slice(0, 30) || "本机学生",
      role: ["student", "teacher", "parent"].includes(profile?.role) ? profile.role : "student",
      stage: ["八年级", "九年级"].includes(grade) ? "初中" : "高中",
      grade,
      subject: "物理",
      goal: String(profile?.goal || "日常巩固").slice(0, 40),
      analysisNote: String(profile?.analysisNote || "").slice(0, 2000),
      sourceProfileId: profile?.sourceProfileId ? String(profile.sourceProfileId).slice(0, 200) : "",
      studentNumber: profile?.studentNumber ? String(profile.studentNumber).trim().slice(0, 80) : "",
      sourceRecordFingerprint: profile?.sourceRecordFingerprint
        ? String(profile.sourceRecordFingerprint).slice(0, 200)
        : "",
      identityStatus: ["resolved", "unresolved-legacy", "duplicate-suspected"].includes(profile?.identityStatus)
        ? profile.identityStatus
        : "resolved",
      dataSource: ["local", "roster-import", "report-import", "cloud-classroom"].includes(profile?.dataSource)
        ? profile.dataSource
        : "local",
      placementBaselineDecision: ["", "supplement-placement", "use-existing-evidence"].includes(profile?.placementBaselineDecision)
        ? profile.placementBaselineDecision
        : "",
      guardianConsentStatus: ["not-required", "unknown", "pending", "granted", "withdrawn"].includes(profile?.guardianConsentStatus)
        ? profile.guardianConsentStatus
        : "unknown",
      consentVersion: String(profile?.consentVersion || "").slice(0, 80),
      consentedAt: profile?.consentedAt ? String(profile.consentedAt) : "",
      withdrawnAt: profile?.withdrawnAt ? String(profile.withdrawnAt) : "",
      minorAgeBand: ["unknown", "under14", "14plus"].includes(profile?.minorAgeBand)
        ? profile.minorAgeBand
        : "unknown",
      createdAt: profile?.createdAt || new Date().toISOString(),
      updatedAt: profile?.updatedAt || profile?.createdAt || new Date().toISOString()
    };
  }

  function normalizeImportedReport(report = {}) {
    const profile = report.profile && typeof report.profile === "object" ? { ...report.profile } : {};
    const portableProfileId = String(profile.portableProfileId || report.portableProfileId || "").trim().slice(0, 200);
    const boundProfileId = String(report.boundProfileId || "").trim().slice(0, 180);
    const identityStatus = portableProfileId || boundProfileId
      ? "resolved"
      : "unresolved-legacy";
    return {
      ...report,
      id: String(report.id || createId("student-report")).slice(0, 180),
      profile: { ...profile, portableProfileId },
      portableProfileId,
      exportedAt: report.exportedAt ? String(report.exportedAt) : "",
      importedAt: report.importedAt ? String(report.importedAt) : new Date().toISOString(),
      reportVersion: Number(report.reportVersion || report.version) || 1,
      identityStatus,
      boundProfileId,
      sourceFingerprint: String(report.sourceFingerprint || "").slice(0, 220)
    };
  }

  function normalizeAssessmentSession(session = {}) {
    const status = ["not-started", "in-progress", "completed", "needs-review"].includes(String(session.status))
      ? String(session.status)
      : "not-started";
    const questionIds = [...new Set((Array.isArray(session.questionIds) ? session.questionIds : [])
      .map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 100);
    const submittedCount = Math.max(0, Math.min(questionIds.length || 100, Number(session.submittedCount) || 0));
    const scoredCount = Math.max(0, Math.min(submittedCount, Number(session.scoredCount) || 0));
    const pendingReviewCount = Math.max(0, Math.min(submittedCount, Number(session.pendingReviewCount) || 0));
    return {
      ...session,
      id: String(session.id || createId("placement")).slice(0, 180),
      profileId: String(session.profileId || "").slice(0, 180),
      type: "placement",
      grade: String(session.grade || "").slice(0, 20),
      scopeType: String(session.scopeType || "semester").slice(0, 40),
      scopeIds: [...new Set((Array.isArray(session.scopeIds) ? session.scopeIds : [])
        .map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 100),
      blueprintVersion: String(session.blueprintVersion || "v1").slice(0, 80),
      questionIds,
      startedAt: session.startedAt ? String(session.startedAt) : "",
      completedAt: session.completedAt ? String(session.completedAt) : "",
      submittedCount,
      scoredCount,
      pendingReviewCount,
      coverage: session.coverage && typeof session.coverage === "object" ? session.coverage : {},
      status,
      createdAt: session.createdAt ? String(session.createdAt) : new Date().toISOString(),
      updatedAt: session.updatedAt ? String(session.updatedAt) : new Date().toISOString()
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

  function resolveImportedStudentId(state, rawStudentId) {
    const raw = String(rawStudentId ?? "").trim();
    if (!raw) return { status: "missing", profileId: "", profile: null, rawStudentId: raw };
    const tiers = [
      ["sourceProfileId", "studentNumber", "portableProfileId"],
      ["id"]
    ];
    for (const fields of tiers) {
      const matches = state.profiles.filter((profile) => fields.some((field) => {
        const candidate = profile?.[field];
        return candidate && String(candidate).trim() === raw;
      }));
      if (matches.length === 1) {
        return {
          status: "matched",
          profileId: matches[0].id,
          profile: matches[0],
          rawStudentId: raw,
          matchedBy: fields.find((field) => String(matches[0]?.[field] || "").trim() === raw) || ""
        };
      }
      if (matches.length > 1) return { status: "ambiguous", profileId: "", profile: null, rawStudentId: raw, matchedBy: fields.join("|") };
    }
    return { status: "unresolved", profileId: "", profile: null, rawStudentId: raw };
  }

  function importStudentReport(state, payload = {}) {
    if (payload?.format !== "physics-learning-profile" || !payload.summary || !payload.profile) {
      throw new Error("文件不是有效的物理学习报告。");
    }
    const exportedAt = String(payload.exportedAt || "").trim();
    const portableProfileId = String(payload.profile.portableProfileId || "").trim();
    const fingerprint = `report:${shortHash(stableSerialize({
      portableProfileId,
      exportedAt,
      version: Number(payload.version) || 1,
      summary: payload.summary,
      attemptIds: (payload.attempts || []).map((item) => item?.id).filter(Boolean)
    }))}`;
    const duplicate = (state.importedReports || []).find((report) => {
      if (String(report.sourceFingerprint || "") === fingerprint) return true;
      return Boolean(portableProfileId && exportedAt
        && report.portableProfileId === portableProfileId
        && report.exportedAt === exportedAt);
    });
    if (duplicate) return { status: "duplicate", report: duplicate };
    const report = normalizeImportedReport({
      ...payload,
      id: createId("student-report"),
      reportVersion: Number(payload.version) || 1,
      sourceFingerprint: fingerprint,
      importedAt: new Date().toISOString()
    });
    if (!Array.isArray(state.importedReports)) state.importedReports = [];
    state.importedReports.push(report);
    return { status: report.identityStatus === "resolved" ? "imported" : "identity-required", report };
  }

  function bindImportedReportIdentity(state, reportId, options = {}) {
    const report = (state.importedReports || []).find((item) => item.id === reportId);
    if (!report) throw new Error("未找到待绑定的旧版学习报告。");
    let profile = options.profileId
      ? state.profiles.find((item) => item.id === String(options.profileId))
      : null;
    if (!profile && options.createNew === true) {
      profile = addProfile(state, {
        name: report.profile?.name || "导入学生",
        grade: report.profile?.grade || "高一",
        goal: report.profile?.goal || "查漏补缺",
        sourceProfileId: "",
        dataSource: "report-import"
      });
    }
    if (!profile) throw new Error("必须明确选择现有学生，或明确建立新的学生档案。");
    report.boundProfileId = profile.id;
    report.identityStatus = "resolved";
    report.identityResolvedAt = new Date().toISOString();
    report.identityResolution = options.createNew === true ? "created-new-profile" : "bound-existing-profile";
    let evidenceImportResult = null;
    if (options.applyEvidence !== false && Array.isArray(report.attempts)) {
      evidenceImportResult = importLearningProfile(state, report, { bindProfileId: profile.id });
    }
    return { report, profile, evidenceImportResult };
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
    state.variantAttempts = (state.variantAttempts || []).filter((record) => record.profileId !== profileId);
    state.feynmanExplanations = (state.feynmanExplanations || []).filter((record) => record.profileId !== profileId);
    state.learningPlans = state.learningPlans.filter((plan) => plan.profileId !== profileId);
    state.assessmentSessions = (Array.isArray(state.assessmentSessions) ? state.assessmentSessions : [])
      .filter((session) => session.profileId !== profileId);
    state.importedReports = (Array.isArray(state.importedReports) ? state.importedReports : [])
      .map((report) => report.boundProfileId === profileId
        ? { ...report, boundProfileId: "", identityStatus: report.portableProfileId ? "resolved" : "unresolved-legacy" }
        : report);
    state.broadCoverageChecks = (Array.isArray(state.broadCoverageChecks) ? state.broadCoverageChecks : [])
      .filter((record) => record.profileId !== profileId);
    Object.keys(state.reviews).forEach((key) => {
      if (state.reviews[key]?.profileId === profileId) delete state.reviews[key];
    });
    if (state.activeProfileId === profileId) state.activeProfileId = state.profiles[0].id;
    return true;
  }

  function findMisconceptionConfirmation(state, profileId, item, input) {
    return state.diagnosticAttempts
      .filter((attempt) => {
        if (attempt.profileId !== profileId || attempt.misconceptionCode !== item.code) return false;
        if (attempt.diagnosticId === input.diagnosticId || attempt.answerCorrect !== false) return false;
        const sameReason = Boolean(input.reason && attempt.reason && input.reason === attempt.reason);
        const sameAnswerPattern = Boolean(input.answer && attempt.answer && input.answer === attempt.answer);
        return sameReason || sameAnswerPattern;
      })
      .sort((a, b) => evidenceTimestamp(a.createdAt) - evidenceTimestamp(b.createdAt))
      .at(-1) || null;
  }

  function diagnosticClassificationLabel(attempt = {}) {
    if (attempt.classification === "stable-misconception" && !attempt.confirmationEvidenceId) {
      return "\u5386\u53f2\u89c4\u5219\u7ed3\u679c\uff0c\u5f85\u6559\u5e08\u590d\u6838";
    }
    if (attempt.classification === "stable-misconception") return "\u7a33\u5b9a\u8bef\u6982\u5ff5\u98ce\u9669";
    if (attempt.classification === "high-confidence-error") return "\u9ad8\u7f6e\u4fe1\u9519\u8bef\uff0c\u5f85\u9a8c\u8bc1\u8bef\u6982\u5ff5";
    if (attempt.classification === "not-yet-understood") return "\u672a\u7406\u89e3\uff0c\u9700\u7ee7\u7eed\u89c2\u5bdf";
    if (attempt.classification === "confident-guess") return "\u9ad8\u7f6e\u4fe1\u7325\u731c";
    if (attempt.classification === "fragile-correct") return "\u4f4e\u7f6e\u4fe1\u6b63\u786e";
    return "\u5df2\u8bb0\u5f55";
  }

  function recordDiagnostic(state, input) {
    const item = misconceptionCatalog.find((entry) => entry.diagnostic.id === input.diagnosticId);
    if (!item) throw new Error("Unknown diagnostic item");
    const answerCorrect = input.answer === item.diagnostic.correctAnswer;
    const reasonCorrect = input.reason === item.diagnostic.correctReason;
    const confidence = Math.max(1, Math.min(5, Number(input.confidence) || 1));
    let classification = "secure";
    if (answerCorrect && !reasonCorrect) classification = confidence >= 4 ? "confident-guess" : "guess";
    else if (!answerCorrect && confidence >= 4) {
      const confirmation = findMisconceptionConfirmation(state, state.activeProfileId, item, input);
      classification = confirmation ? "stable-misconception" : "high-confidence-error";
    }
    else if (!answerCorrect) classification = "not-yet-understood";
    else if (confidence <= 2) classification = "fragile-correct";
    const attempt = {
      id: createId("diagnostic"),
      profileId: state.activeProfileId,
      diagnosticId: input.diagnosticId,
      misconceptionCode: item.code,
      topics: item.topics.slice(),
      questionType: "前概念诊断",
      answer: input.answer,
      reason: input.reason,
      confidence,
      answerCorrect,
      reasonCorrect,
      classification,
      confirmationEvidenceId: classification === "stable-misconception"
        ? findMisconceptionConfirmation(state, state.activeProfileId, item, input)?.id || ""
        : "",
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
        if (attempt.classification === "high-confidence-error") return total + 2;
        if (attempt.classification === "confident-guess") return total + 2;
        if (attempt.classification === "not-yet-understood") return total + 1.5;
        if (attempt.classification === "guess" || attempt.classification === "fragile-correct") return total + 1;
        return Math.max(0, total - 1);
      }, 0);
      const confirmed = evidence.some((attempt) => {
        return attempt.classification === "stable-misconception" && attempt.confirmationEvidenceId;
      });
      const legacyStable = evidence.some((attempt) => {
        return attempt.classification === "stable-misconception" && !attempt.confirmationEvidenceId;
      });
      const status = confirmed
        ? "稳定误概念风险"
        : legacyStable
          ? "历史规则结果，待教师复核"
          : risk > 0
            ? "待验证误概念"
            : evidence.length
              ? "已纠正"
              : "未诊断";
      return {
        ...item,
        evidenceCount: evidence.length,
        latest,
        risk: Math.min(5, Math.round(risk * 10) / 10),
        status
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
    if (/^\s*(?:选|答案(?:为|是)?\s*[:：]?)?\s*[A-D](?:\s*[、,，/]?\s*[A-D])*\s*[。.]?\s*$/.test(text)) {
      return [...new Set(text.match(/[A-D]/g) || [])].sort().join("");
    }
    const explicit = text.match(/(?:^|选|答案(?:为|是)?)\s*([A-D](?:\s*[、,，/]\s*[A-D])*)/);
    if (explicit) return [...new Set(explicit[1].match(/[A-D]/g) || [])].sort().join("");
    const tokens = [];
    const pattern = /(^|[^A-Z])([A-D])(?=$|[^A-Z])/g;
    let match;
    while ((match = pattern.exec(text))) tokens.push(match[2]);
    return [...new Set(tokens)].sort().join("");
  }

  function expectedChoice(answer) {
    if (/^\s*[A-D](?:\s*[、,，/]?\s*[A-D])*\s*$/i.test(String(answer || ""))) return normalizeChoice(answer);
    const match = String(answer || "").match(/选\s*([A-D](?:\s*[、,，/]\s*[A-D])*)/i);
    return match ? normalizeChoice(match[1]) : "";
  }

  function normalizeScientificText(value) {
    const superscript = { "⁻": "-", "⁺": "+", "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
    return String(value || "")
      .replace(/[−﹣－]/g, "-")
      .replace(/[⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (character) => superscript[character])
      .replace(/×\s*10\s*\^?\s*([+-]?\d+)/gi, "e$1")
      .replace(/(\d)\s*·\s*(\d)/g, "$1.$2")
      .replace(/[（(]\s*\d+\s*[）)]/g, " ");
  }

  function extractQuantities(value) {
    const normalized = normalizeScientificText(value);
    // Preserve unknown units and case: N and n must not silently become unitless.
    const pattern = /([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)\s*([A-Za-zΩ℃%]+(?:\^?[-+]?\d+)?(?:\/[A-Za-z]+(?:\^?[-+]?\d+)?)?)?/g;
    const quantities = [];
    let match;
    while ((match = pattern.exec(normalized))) {
      const number = Number(match[1]);
      if (!Number.isFinite(number)) continue;
      let unit = match[2] || "";
      unit = unit.replace(/\^?2/g, "²").replace(/\^?3/g, "³");
      quantities.push({ value: number, unit });
    }
    return quantities;
  }

  function comparableValue(quantity) {
    const definition = unitDefinitions[quantity.unit];
    if (!definition) return { value: quantity.value, dimension: quantity.unit || "number" };
    return { value: quantity.value * definition.factor, dimension: definition.dimension };
  }

  function explicitBlankAnswers(value, allowBareMarker = false) {
    const marker = "第\\s*([一二三四五六七八九十百0-9]+)\\s*空";
    const connector = allowBareMarker
      ? "(?:应?填(?:写)?|答案(?:为|是)|为|[:：])?"
      : "(?:应?填(?:写)?|答案(?:为|是)|为|[:：])";
    const pattern = new RegExp(
      `${marker}\\s*${connector}\\s*([\\s\\S]*?)(?=(?:[，,；;。\\n]\\s*)?${marker}|$)`,
      "gu"
    );
    const results = [];
    let match;
    while ((match = pattern.exec(String(value || "")))) {
      const blankAnswer = String(match[2] || "")
        .trim()
        .replace(/^[“”‘’"'：:，,；;。]+|[“”‘’"'，,；;。]+$/gu, "")
        .trim();
      results.push({ ordinal: match[1], answer: blankAnswer });
    }
    return results;
  }

  function normalizeBlankText(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/^[“”‘’"']+|[“”‘’"'。；;，,]+$/gu, "")
      .replace(/\s+/gu, "")
      .toLocaleLowerCase("zh-CN");
  }

  function reliableTextBlankAnswers(question, answer) {
    const questionType = normalizeQuestionType(question.questionType || question.examQuestionType);
    if (!/填空/u.test(questionType)) return [];
    const results = explicitBlankAnswers(answer);
    if (results.length < 2 || new Set(results.map((item) => item.ordinal)).size !== results.length) return [];
    const unreliable = results.some((item) => {
      return !item.answer
        || item.answer.length > 40
        || /因为|所以|依据|解析|理由|说明|可知|故而/u.test(item.answer)
        || extractQuantities(item.answer).length > 0;
    });
    return unreliable ? [] : results;
  }

  function responseBlankAnswers(response, expectedCount) {
    const explicit = explicitBlankAnswers(response, true);
    if (explicit.length === expectedCount && explicit.every((item) => item.answer)) {
      return explicit.map((item) => item.answer);
    }
    const text = String(response || "").trim();
    if (!text) return [];
    const separators = [/\r?\n+/u, /[；;|]+/u, /[、]+/u, /[，,]+/u, /\s+/u];
    for (const separator of separators) {
      const parts = text.split(separator).map((item) => item.trim()).filter(Boolean);
      if (parts.length === expectedCount && parts.every((item) => item.length <= 40)) return parts;
    }
    return expectedCount === 1 && text.length <= 40 ? [text] : [];
  }

  const GRADING_VERSION = "physics-structured-v1";

  function gradeFinalAnswer(question, response) {
    return {
      ...(question.answerSchema ? gradeStructuredAnswer(question, response) : gradeFinalAnswerLegacy(question, response)),
      gradingVersion: GRADING_VERSION,
      questionContentVersion: question.questionContentVersion || question.contentVersion || null,
      answerSchemaVersion: question.answerSchema?.answerSchemaVersion || null,
      rawResponse: typeof response === "string" ? response : JSON.parse(JSON.stringify(response ?? null))
    };
  }

  function gradeStructuredAnswer(question, response) {
    const schema = question.answerSchema;
    const pending = (reason, type = "manual") => ({ status: "review-required", score: null, summary: "答案规范或作答结构需要确认，暂不自动评分。", issues: [{ type, location: "答案规范", reason, next: "逐项核对答案规范与原始作答。" }], expected: question.answer || "" });
    if (schema.answerSchemaVersion !== 1 || !Array.isArray(schema.parts) || !schema.parts.length) return pending("不支持或缺少答案规范版本/小问");
    const parts = response?.parts;
    const ids = schema.parts.map((part) => part.id);
    if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) return pending("答案规范小问 ID 无效或重复");
    if (!Array.isArray(parts) || parts.length !== ids.length || new Set(parts.map((part) => part?.id)).size !== ids.length || parts.some((part) => !ids.includes(part?.id))) return pending("作答缺少小问、包含重复 ID 或未知小问", "part-structure");
    const issues = [];
    let matched = 0;
    const directions = { right: "right", left: "left", up: "up", down: "down", "向右": "right", "向左": "left", "向上": "up", "向下": "down" };
    for (const part of schema.parts) {
      const actual = parts.find((item) => item.id === part.id);
      if (part.kind === "choice") {
        if (!Array.isArray(part.expectedOptionIds) || !part.expectedOptionIds.length || !Array.isArray(actual.optionIds)) return pending("选项 ID 数组缺失", "part-structure");
        const expectedIds = [...new Set(part.expectedOptionIds)].sort();
        const actualIds = [...new Set(actual.optionIds)].sort();
        if (JSON.stringify(expectedIds) === JSON.stringify(actualIds)) matched++;
        else issues.push({ type: "choice", location: part.id, reason: "选项集合不一致", next: "核对本小问选项。" });
        continue;
      }
      if (part.kind !== "quantity") return pending("解释、判断或未知类型需要人工评分规范");
      const expected = part.expected;
      const tolerance = part.tolerance;
      const quantityKinds = { force: "force", mass: "M", area: "area", pressure: "pressure", speed: "speed", acceleration: "acceleration", length: "L", time: "T", volume: "volume", energy: "energy", power: "power", voltage: "voltage", current: "current", resistance: "resistance", density: "density", frequency: "frequency" };
      if (!expected || typeof expected.value !== "number" || !Number.isFinite(expected.value) || !unitDefinitions[expected.unit]
        || !tolerance || !Number.isFinite(tolerance.absolute) || !Number.isFinite(tolerance.relative) || tolerance.absolute < 0 || tolerance.relative < 0) return pending("期望物理量、支持单位或题目级容差缺失");
      if (!quantityKinds[part.quantity] || quantityKinds[part.quantity] !== unitDefinitions[expected.unit].dimension) return pending("物理量身份与期望单位不一致或尚未定义");
      const value = typeof actual.value === "number" ? actual.value : /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?$/.test(normalizeScientificText(actual.value).trim()) ? Number(normalizeScientificText(actual.value).trim()) : NaN;
      if (!Number.isFinite(value)) return pending("数值不是可确认的有限数值", "missing-value");
      if (!actual.unit && part.unitRequired !== false) return pending("未填写要求的单位", "missing-unit");
      const unit = actual.unit || expected.unit;
      if (!unitDefinitions[unit]) { issues.push({ type: "unknown-unit", location: part.id, reason: `未支持的单位：${unit}`, next: "确认单位拼写及物理量。" }); continue; }
      const expectedValue = comparableValue(expected);
      const actualValue = comparableValue({ value, unit });
      if (expectedValue.dimension !== actualValue.dimension) { issues.push({ type: "unit", location: part.id, reason: "单位所属物理量不一致", next: "使用同物理量的单位。" }); continue; }
      if (part.directionRequired) {
        const expectedDirection = directions[part.expectedDirection];
        const actualDirection = directions[actual.direction];
        if (!expectedDirection || !actualDirection) return pending("方向缺失或方向含义未定义", "direction");
        if (actualDirection !== expectedDirection) { issues.push({ type: "direction", location: part.id, reason: "方向与要求相反或不一致", next: "核对坐标及方向定义。" }); continue; }
      }
      // Absolute tolerance is expressed in the expected unit; compare in SI.
      const allowedError = Math.max(tolerance.absolute * unitDefinitions[expected.unit].factor, tolerance.relative * Math.abs(expectedValue.value));
      if (Math.abs(actualValue.value - expectedValue.value) <= allowedError) matched++;
      else issues.push({ type: Math.sign(value) !== Math.sign(expected.value) ? "sign" : "value", location: part.id, reason: "数值或正负号超出本题容差", next: "核对数值、坐标与单位换算。" });
    }
    const score = matched / schema.parts.length;
    return { status: matched === schema.parts.length ? "correct" : matched ? "partial" : "incorrect", score, summary: `按小问 ID 核对 ${matched}/${schema.parts.length} 项。`, issues, expected: question.answer || "" };
  }

  function gradeFinalAnswerLegacy(question, response) {
    const answer = String(question.answer || "");
    const questionType = normalizeQuestionType(question.questionType || question.examQuestionType);
    if (/实验/u.test(questionType)) {
      return {
        status: "review-required",
        score: null,
        summary: "实验题涉及操作、现象、图表或论证过程，离线规则不将其自动判为正确，需要按评分要点人工复核。",
        issues: [{ type: "manual", location: "实验作答", reason: "仅比较关键词不能可靠评价实验过程", next: "逐项核对器材、步骤、变量控制、现象、数据处理和结论。" }],
        expected: answer
      };
    }
    const expected = expectedChoice(answer);
    const actualChoice = normalizeChoice(response);
    if (expected) {
      if (/不选|不是|非[ABCD]|排除|不能选|not\s/iu.test(String(response || ""))) {
        return { status: "review-required", score: null, summary: "作答含否定或排除选项的表述，需要确认最终选项。", issues: [{ type: "manual", location: "最终选项", reason: "不能把提到的选项当成已选择", next: "明确填写最终选项。" }], expected };
      }
      const correct = actualChoice === expected;
      return {
        status: correct ? "correct" : "incorrect",
        score: correct ? 1 : 0,
        summary: correct ? "选项正确。" : `选项不匹配。你填写的是 ${actualChoice || "空白"}，应重新检查题设和规律。`,
        issues: correct ? [] : [{ type: "choice", location: "最终选项", reason: "选项与参考结论不一致", next: "先核对研究对象和公式适用条件，再重新选择。" }],
        expected: expected.split("").join("、")
      };
    }

    const expectedTextBlanks = reliableTextBlankAnswers(question, answer);
    if (expectedTextBlanks.length) {
      const actualTextBlanks = responseBlankAnswers(response, expectedTextBlanks.length);
      if (!actualTextBlanks.length) {
        const hasResponse = Boolean(String(response || "").trim());
        return {
          status: hasResponse ? "review-required" : "incorrect",
          score: hasResponse ? null : 0,
          summary: hasResponse
            ? "参考答案可逐空提取，但当前作答无法可靠识别空格顺序，需要人工确认。"
            : "尚未填写文本空格。",
          issues: [{ type: "blank-structure", location: "填空答案", reason: "作答数量或分隔方式与参考空格不一致", next: "按第一空、第二空的顺序逐项填写，并用换行或分号分隔。" }],
          expected: expectedTextBlanks.map((item) => item.answer)
        };
      }
      let matched = 0;
      const issues = [];
      expectedTextBlanks.forEach((item, index) => {
        if (normalizeBlankText(actualTextBlanks[index]) === normalizeBlankText(item.answer)) {
          matched += 1;
        } else {
          issues.push({
            type: "text-blank",
            location: `第 ${index + 1} 空`,
            reason: "文本与明确标注的参考填空不一致",
            next: "回到题干条件核对该空对应的物理概念、方向或现象。"
          });
        }
      });
      const ratio = matched / expectedTextBlanks.length;
      return {
        status: ratio === 1 ? "correct" : ratio > 0 ? "partial" : "incorrect",
        score: ratio,
        summary: ratio === 1
          ? `逐空匹配 ${matched}/${expectedTextBlanks.length}，文本填空与参考答案一致。`
          : `逐空匹配 ${matched}/${expectedTextBlanks.length}；请按错误空格修改。`,
        issues,
        expected: expectedTextBlanks.map((item) => item.answer)
      };
    }

    const expectedQuantities = extractQuantities(answer);
    const actualQuantities = extractQuantities(response);
    if (expectedQuantities.some((item) => item.unit && !unitDefinitions[item.unit])) {
      return { status: "review-required", score: null, summary: "参考答案单位尚未支持，需要人工确认。", issues: [{ type: "unknown-unit", location: "参考答案", reason: "未知单位不能作为自动评分依据", next: "确认单位定义。" }], expected: answer };
    }
    // Only a single, explicit scalar result is safe to infer from old free text.
    // Explanations, multi-part results and vector direction need an answer schema.
    const scalarText = normalizeScientificText(answer).trim();
    const simpleScalar = /^\s*(?:[A-Za-z][A-Za-z0-9_]*\s*=\s*)?[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?\s*(?:[A-Za-zΩ℃%]+(?:\^?[-+]?\d+)?(?:\/[A-Za-z]+(?:\^?[-+]?\d+)?)?)?\s*[。.]?\s*$/.test(scalarText);
    if (!simpleScalar || expectedQuantities.length !== 1 || /解释|论述|证明|判断/u.test(questionType)) {
      return { status: "review-required", score: null, summary: "该题没有可确定逐项核对的答案规范，需要人工复核结论、方向和各小问。", issues: [{ type: "manual", location: "完整作答", reason: "自由文本不构成可靠的结构化评分规范", next: "按评分要点逐项复核。" }], expected: answer };
    }
    const responseScalar = normalizeScientificText(response).trim();
    const expectedSymbol = scalarText.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=/)?.[1];
    const actualSymbol = responseScalar.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=/)?.[1];
    if ((expectedSymbol && actualSymbol && expectedSymbol !== actualSymbol) || (!expectedQuantities[0].unit && actualQuantities.some((item) => item.unit))) {
      return { status: "review-required", score: null, summary: "物理量身份或参考单位不明确，需要人工确认。", issues: [{ type: "quantity", location: "最终答案", reason: "不同物理量不能仅按数字比较", next: "说明物理量及其单位。" }], expected: answer };
    }
    if (!/^\s*(?:[A-Za-z][A-Za-z0-9_]*\s*=\s*)?[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?\s*(?:[A-Za-zΩ℃%]+(?:\^?[-+]?\d+)?(?:\/[A-Za-z]+(?:\^?[-+]?\d+)?)?)?\s*[。.]?\s*$/.test(responseScalar) || actualQuantities.length !== 1) {
      return { status: "review-required", score: null, summary: "作答不是一个可唯一核对的数值结果，需要确认数值对应的结论。", issues: [{ type: "manual", location: "最终答案", reason: "包含解释、否定、方向或额外数值", next: "确认每项结果及其物理含义。" }], expected: answer };
    }
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
      result: validateDimension(equation, { symbols: { ...(question.dimensionSymbols || {}), ...(model.dimensionSymbols || {}) } })
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
    const hasUnitIssue = issues.some((issue) => ["unit", "missing-unit", "unknown-unit"].includes(issue.type));
    const hasSignIssue = issues.some((issue) => issue.type === "sign" || (issue.type === "direction" && grading.status !== "review-required"));
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
          : dimensionResults.some((item) => item.result.valid === false) ? "fail"
            : dimensionResults.every((item) => item.result.valid === true) ? "pass" : "manual",
        detail: !dimensionResults.length
          ? "未提取到可由内置符号表解析的方程。"
          : dimensionResults.map((item) => `${item.equation}：${item.result.status}`).join("；")
      },
      {
        key: "magnitude",
        label: "数值与数量级",
        status: numericComparable
          ? grading.status === "correct" ? "pass" : grading.status === "partial" ? "evidence" : grading.status === "review-required" ? "manual" : "fail"
          : "manual",
        detail: numericComparable
          ? question.answerSchema ? "按答案规范中每个小问的物理量、单位和容差核对。" : "单一数值按同量纲比较；旧题兼容规则允许 1.5% 舍入误差。"
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

  function scoreModeling(model, applicableDimensions = null) {
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
    const applicable = Array.isArray(applicableDimensions)
      ? new Set(applicableDimensions.map((key) => String(key)))
      : null;
    const selectedChecks = applicable
      ? checks.filter(([key]) => applicable.has(key))
      : checks;
    const detail = {};
    selectedChecks.forEach(([key, label, minimum, pattern]) => {
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
    return {
      total: selectedChecks.length ? Math.round(total / (selectedChecks.length * 4) * 100) : null,
      detail,
      valueType: "rule-completeness",
      label: "\u5efa\u6a21\u8bb0\u5f55\u5b8c\u6574\u5ea6\uff08\u89c4\u5219\u503c\uff09",
      applicableDimensions: selectedChecks.map(([key]) => key),
      needsCheck: Boolean(selectedChecks.length && total / (selectedChecks.length * 4) * 100 < MASTERY_RULES.weakModelingBelow)
    };
  }

  function recordAttempt(state, input) {
    const now = new Date().toISOString();
    const normalizeTimestamp = (value, fallback) => {
      const parsed = new Date(value || fallback);
      return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
    };
    // Imported/fixture evidence may carry its original timestamps.  Keep them
    // when valid so cross-date mastery and intervention comparisons are based
    // on the evidence timeline rather than the import time.
    const createdAt = normalizeTimestamp(input.createdAt, now);
    const completedAt = normalizeTimestamp(input.completedAt, createdAt);
    const applicableDimensions = Array.isArray(input.applicableDimensions)
      ? input.applicableDimensions
      : Array.isArray(input.question?.applicableDimensions) ? input.question.applicableDimensions : null;
    const modelScore = scoreModeling(input.model || {}, applicableDimensions);
    const normalizedErrorType = normalizeErrorType(input.errorType);
    const attempt = {
      id: createId("attempt"),
      profileId: state.activeProfileId,
      questionId: input.questionId,
      knowledgePointId: String(input.knowledgePointId || input.question?.knowledgePointId
        || input.topicKey || topicKeyForQuestion(input.question || { topic: input.topic }) || "").slice(0, 200),
      topicKey: String(input.knowledgePointId || input.question?.knowledgePointId
        || input.topicKey || topicKeyForQuestion(input.question || { topic: input.topic }) || "").slice(0, 200),
      topic: input.topic || "待分类",
      questionType: normalizeQuestionType(input.questionType || input.examQuestionType),
      modelDefinitionId: String(input.modelDefinitionId || input.question?.modelDefinitionId
        || input.modelFamilyId || input.question?.modelFamilyId || "").slice(0, 200),
      modelFamilyId: String(input.modelFamilyId || input.question?.modelFamilyId
        || input.modelDefinitionId || input.question?.modelDefinitionId || "").slice(0, 200),
      independenceGroupId: String(input.independenceGroupId || input.question?.independenceGroupId
        || input.modelDefinitionId || input.question?.modelDefinitionId
        || input.modelFamilyId || input.question?.modelFamilyId || "").slice(0, 200),
      stage: input.stage || "全部",
      startedAt: normalizeTimestamp(input.startedAt, createdAt),
      completedAt,
      durationSeconds: Math.max(0, Number(input.durationSeconds) || 0),
      confidenceBefore: Math.max(1, Math.min(5, Number(input.confidenceBefore) || 1)),
      confidenceAfter: Math.max(1, Math.min(5, Number(input.confidenceAfter) || 1)),
      hintLevel: Math.max(0, Math.min(5, Number(input.hintLevel) || 0)),
      finalAnswer: String(input.finalAnswer || ""),
      grading: input.grading || { status: "review-required", score: null, issues: [] },
      errorType: normalizedErrorType,
      errorTypeCode: normalizedErrorType ? errorTypeCode(normalizedErrorType) : "",
      reflection: String(input.reflection || ""),
      selfExplanation: String(input.selfExplanation || ""),
      draftImageData: /^data:image\//.test(String(input.draftImageData || ""))
        && String(input.draftImageData).length <= 900000
        ? String(input.draftImageData)
        : "",
      draftImageName: String(input.draftImageName || "").slice(0, 120),
      model: input.model || {},
      modelScore,
      applicableDimensions: modelScore.applicableDimensions,
      modelingRecordNeedsCheck: modelScore.needsCheck,
      transferType: input.transferType || "",
      createdAt
    };
    state.attempts.push(attempt);
    return attempt;
  }

  function feynmanSelfCheck(input = {}) {
    const object = String(input.researchObject || "").trim();
    const conditions = String(input.lawConditions || "").trim();
    const prediction = String(input.prediction || "").trim();
    const reason = String(input.predictionReason || "").trim();
    return {
      boundary: "仅检查讲解要素是否已填写；内容是否正确仍需与题目条件和解析核对，不能据此判定掌握。",
      items: [
        { key: "researchObject", label: "研究对象", status: object ? "待与解析核对" : "待补充", prompt: "对象是谁？系统边界包含哪些物体？" },
        { key: "lawConditions", label: "规律适用条件", status: conditions ? "待与解析核对" : "待补充", prompt: "该规律成立需要什么条件？题目是否满足？" },
        { key: "predictionReason", label: "预测依据", status: prediction && reason ? "待与解析核对" : "待补充", prompt: "条件改变后会怎样？依据哪个关系式或物理过程？" }
      ]
    };
  }

  function selectFeynmanRetestQuestion(questions = [], sourceQuestionId = "", knowledgePointId = "", grade = "", attempts = []) {
    const source = questions.find((question) => question.id === sourceQuestionId);
    const topicKey = String(knowledgePointId || (source && topicKeyForQuestion(source)) || "");
    if (!topicKey || !source) return null;
    const previouslyAnswered = new Set((Array.isArray(attempts) ? attempts : []).map((attempt) => attempt.questionId));
    return questions.filter((question) => question.id !== sourceQuestionId
      && question.grade === grade
      && topicKeyForQuestion(question) === topicKey
      && isPublishedQuestion(question)
      && String(question.content || "").trim()
      && String(question.answer || "").trim()
      && String(question.solution || "").trim())
      .sort((left, right) => {
        const rank = (question) => (previouslyAnswered.has(question.id) ? 0 : 2)
          + (source.modelDefinitionId && question.modelDefinitionId && source.modelDefinitionId !== question.modelDefinitionId ? 1 : 0);
        return rank(right) - rank(left) || String(left.id).localeCompare(String(right.id));
      })[0] || null;
  }

  function recordFeynmanExplanation(state, input = {}) {
    const profileId = String(input.profileId || state.activeProfileId || "");
    if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error("未找到学生档案。");
    const questionId = String(input.questionId || "").trim();
    const explanation = String(input.explanation || "").trim();
    if (!questionId) throw new Error("请选择要讲解的题目或知识点。");
    if (explanation.length < 12) throw new Error("请至少用一句完整的话说明对象、规律或因果关系。");
    const relatedAttemptIds = (state.attempts || [])
      .filter((attempt) => attempt.profileId === profileId && attempt.questionId === questionId)
      .map((attempt) => attempt.id)
      .filter(Boolean)
      .slice(-20);
    const record = normalizeFeynmanExplanation({
      id: createId("feynman"),
      profileId,
      questionId,
      knowledgePointId: String(input.knowledgePointId || input.topicKey || ""),
      topic: String(input.topic || "待分类"),
      explanation,
      researchObject: input.researchObject,
      lawConditions: input.lawConditions,
      analogy: input.analogy,
      prediction: input.prediction,
      predictionReason: input.predictionReason,
      retestQuestionId: input.retestQuestionId,
      unclearPoint: input.unclearPoint,
      evidenceIds: Array.isArray(input.evidenceIds) && input.evidenceIds.length
        ? input.evidenceIds
        : relatedAttemptIds,
      verificationStatus: "student-reflection-only",
      createdAt: new Date().toISOString()
    });
    state.feynmanExplanations = Array.isArray(state.feynmanExplanations) ? state.feynmanExplanations : [];
    state.feynmanExplanations.push(record);
    if (state.feynmanExplanations.length > 5000) {
      state.feynmanExplanations.splice(0, state.feynmanExplanations.length - 5000);
    }
    return record;
  }

  function saveVariantSet(state, input) {
    const normalized = normalizeVariantSet(input);
    if (!normalized) throw new Error("变式题组结构不完整，未保存。 ");
    if (normalized.variants.length && normalized.variants.length < 2) {
      throw new Error("正式变式题组至少需要 2 道完整题。 ");
    }
    state.variantSets = Array.isArray(state.variantSets) ? state.variantSets : [];
    state.variantSets.forEach((set) => {
      if (set.parentQuestionId === normalized.parentQuestionId
        && set.id !== normalized.id
        && set.sourceContentHash !== normalized.sourceContentHash) {
        set.stale = true;
        set.status = set.status === "approved" ? "stale" : set.status;
        set.updatedAt = new Date().toISOString();
      }
    });
    const index = state.variantSets.findIndex((set) => set.id === normalized.id || (normalized.cacheKey && set.cacheKey === normalized.cacheKey));
    const saved = { ...normalized, updatedAt: new Date().toISOString() };
    if (index >= 0) state.variantSets[index] = saved;
    else state.variantSets.push(saved);
    if (state.variantSets.length > 1000) state.variantSets.splice(0, state.variantSets.length - 1000);
    return saved;
  }

  function variantSetForParent(state, parentQuestionId, sourceContentHash = "") {
    const matches = (Array.isArray(state.variantSets) ? state.variantSets : [])
      .filter((set) => set.parentQuestionId === parentQuestionId && set.stale !== true)
      .filter((set) => !sourceContentHash || set.sourceContentHash === sourceContentHash)
      .sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt));
    return matches[0] || null;
  }

  function decideVariantReview(state, setId, decision = {}) {
    const set = (state.variantSets || []).find((item) => item.id === setId);
    if (!set) throw new Error("未找到待审核变式题组。 ");
    const action = ["approve", "reject", "pending"].includes(decision.action) ? decision.action : "pending";
    const selected = new Set(Array.isArray(decision.variantIds) && decision.variantIds.length
      ? decision.variantIds.map(String)
      : set.variants.map((variant) => variant.id));
    set.variants = set.variants.map((variant) => {
      if (!selected.has(variant.id)) return variant;
      if (action === "approve" && variant.validation?.passed !== true) {
        throw new Error(`变式“${variant.title}”未通过质量门禁，不能批准。`);
      }
      return {
        ...variant,
        approvalStatus: action === "approve" ? "teacher-approved" : action === "reject" ? "teacher-rejected" : "pending-teacher-review",
        reviewRequired: action !== "approve",
        teacherReview: {
          action,
          reviewedBy: String(decision.reviewedBy || "local-teacher").slice(0, 120),
          comment: String(decision.comment || "").slice(0, 2000),
          reviewedAt: new Date().toISOString()
        }
      };
    });
    const approvedCount = set.variants.filter((variant) => ["system-validated", "teacher-approved"].includes(variant.approvalStatus) && variant.validation?.passed).length;
    const pendingCount = set.variants.filter((variant) => variant.approvalStatus === "pending-teacher-review").length;
    set.approvalStatus = approvedCount >= 2 ? "teacher-approved" : pendingCount ? "pending-teacher-review" : "rejected";
    set.status = approvedCount >= 2 ? "approved" : pendingCount ? "pending-review" : "rejected";
    set.reviewRequired = pendingCount > 0;
    set.updatedAt = new Date().toISOString();
    return set;
  }

  function recordVariantAttempt(state, input = {}) {
    const set = (state.variantSets || []).find((item) => item.id === input.variantSetId);
    if (!set || set.stale === true) throw new Error("变式题组不存在或母题已更新。 ");
    const variant = set.variants.find((item) => item.id === input.variantQuestionId);
    if (!variant) throw new Error("未找到本次变式题。 ");
    const approved = ["system-validated", "teacher-approved"].includes(variant.approvalStatus)
      && variant.validation?.passed === true;
    if (!approved) throw new Error("该变式尚未通过质量门禁和必要审核，不能进入正式训练。 ");
    const hintLevel = Math.max(0, Math.min(5, Number(input.hintLevel) || 0));
    const solutionViewed = input.solutionViewed === true || hintLevel >= 5;
    const attempt = recordAttempt(state, {
      ...input,
      question: variant,
      questionId: variant.id,
      topic: variant.topic,
      knowledgePointId: variant.knowledgePointId,
      modelDefinitionId: variant.modelDefinitionId,
      modelFamilyId: variant.modelFamilyId,
      independenceGroupId: variant.independenceGroupId,
      questionType: variant.questionType,
      stage: variant.stage,
      hintLevel,
      transferType: variant.variantRole
    });
    const gradingStatus = String(attempt.grading?.status || "review-required");
    const verifiedTransfer = gradingStatus === "correct" && hintLevel <= 1 && !solutionViewed;
    const link = normalizeVariantAttempt({
      id: createId("variant-attempt"),
      variantSetId: set.id,
      parentQuestionId: set.parentQuestionId,
      variantQuestionId: variant.id,
      profileId: attempt.profileId,
      variantRole: variant.variantRole,
      variantTechnique: variant.variantTechnique || "",
      attemptId: attempt.id,
      hintLevel,
      gradingStatus,
      completedAt: attempt.completedAt,
      verificationStatus: verifiedTransfer ? "verified-transfer" : gradingStatus === "review-required" ? "pending-manual-review" : "practice-only",
      solutionViewed,
      independentCorrect: verifiedTransfer,
      validationVersion: variant.validation?.version || 1,
      sourceContentHash: set.sourceContentHash,
      createdAt: attempt.createdAt
    });
    state.variantAttempts = Array.isArray(state.variantAttempts) ? state.variantAttempts : [];
    state.variantAttempts.push(link);
    if (state.variantAttempts.length > 10000) state.variantAttempts.splice(0, state.variantAttempts.length - 10000);
    return { attempt, variantAttempt: link };
  }

  function variantSetProgress(state, setId, profileId = state.activeProfileId) {
    const set = (state.variantSets || []).find((item) => item.id === setId) || null;
    if (!set) return { set: null, completed: 0, total: 0, results: [], complete: false };
    const records = (state.variantAttempts || []).filter((item) => item.variantSetId === setId && item.profileId === profileId);
    const latestByQuestion = new Map();
    records.forEach((record) => {
      const previous = latestByQuestion.get(record.variantQuestionId);
      if (!previous || new Date(record.completedAt) > new Date(previous.completedAt)) latestByQuestion.set(record.variantQuestionId, record);
    });
    const trainable = trainableVariants(set);
    const results = trainable.map((variant) => ({ variant, record: latestByQuestion.get(variant.id) || null }));
    const completed = results.filter((item) => item.record).length;
    return { set, completed, total: trainable.length, results, complete: trainable.length >= 2 && completed === trainable.length };
  }

  function trainableVariants(set) {
    return (Array.isArray(set?.variants) ? set.variants : []).filter((variant) =>
      variant?.validation?.passed === true
      && ["system-validated", "teacher-approved"].includes(variant.approvalStatus));
  }

  function saveVariantPreset(state, input = {}) {
    const normalized = normalizeVariantPreset({ ...input, id: input.id || createId("variant-preset"), updatedAt: new Date().toISOString() });
    if (!normalized) throw new Error("组卷参数无效。 ");
    state.variantPresets = Array.isArray(state.variantPresets) ? state.variantPresets : [];
    const index = state.variantPresets.findIndex((preset) => preset.id === normalized.id);
    if (index >= 0) state.variantPresets[index] = normalized;
    else state.variantPresets.push(normalized);
    return normalized;
  }

  function completeManualReview(state, attemptId, review = {}) {
    const attempt = state.attempts.find((item) => item.id === attemptId);
    if (!attempt || !isPendingManualReview(attempt)) {
      throw new Error("未找到待人工复核的作答记录。");
    }
    const status = ["correct", "incorrect", "partial"].includes(String(review.status))
      ? String(review.status)
      : "partial";
    const score = Number(review.score);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new Error("人工复核得分必须在0到1之间。");
    }
    attempt.grading = {
      ...attempt.grading,
      status,
      score,
      summary: String(review.summary || attempt.grading?.summary || "教师完成人工复核").slice(0, 500),
      issues: Array.isArray(review.issues) ? review.issues.slice(0, 20) : (attempt.grading?.issues || []),
      reviewedAt: new Date().toISOString(),
      reviewedBy: String(review.reviewedBy || "teacher").slice(0, 120),
      manualReview: true
    };
    if (attempt.grading.legacyReview) attempt.grading.legacyReview = { ...attempt.grading.legacyReview, status: "reviewed" };
    attempt.teacherReviewStatus = "completed";
    attempt.updatedAt = new Date().toISOString();
    (state.assessmentSessions || [])
      .filter((session) => session.type === "placement"
        && session.profileId === attempt.profileId
        && session.status === "needs-review"
        && (session.questionIds || []).includes(attempt.questionId))
      .forEach((session) => refreshPlacementAssessment(state, session.id));
    return attempt;
  }

  function reviewAttemptTimestamp(attempt = {}) {
    const timestamp = new Date(attempt.completedAt || attempt.createdAt || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function automaticReviewRating(attempt = {}) {
    if (isPendingManualReview(attempt)) return 1;
    const status = String(attempt?.grading?.status || "");
    if (status === "correct") {
      return Number(attempt.hintLevel || 0) <= MASTERY_RULES.independentHintMaximum ? 2 : 1;
    }
    if (status === "partial" || status === "review-required") return 1;
    if (status === "incorrect" || status === "wrong") return 0;
    throw new Error("作答尚无可用于复习调度的评分状态。");
  }

  function completedReviewAttempt(state, questionId, profileId, previous, options = {}) {
    const requestedAttemptId = String(options.attemptId || "").trim();
    const previousAttemptId = String(previous?.evidenceAttemptId || "").trim();
    const previousReviewAt = new Date(previous?.lastReviewedAt || 0).getTime();
    const candidates = (Array.isArray(state.attempts) ? state.attempts : [])
      .filter((attempt) => {
        if (!attempt || attempt.profileId !== profileId || attempt.questionId !== questionId) return false;
        if (!String(attempt.id || "").trim() || !String(attempt.finalAnswer || "").trim()) return false;
        if (requestedAttemptId && attempt.id !== requestedAttemptId) return false;
        if (previousAttemptId && attempt.id === previousAttemptId) return false;
        const completedAt = reviewAttemptTimestamp(attempt);
        if (!completedAt) return false;
        if (Number.isFinite(previousReviewAt) && previousReviewAt > 0 && completedAt <= previousReviewAt) return false;
        try {
          automaticReviewRating(attempt);
          return true;
        } catch (error) {
          return false;
        }
      })
      .sort((a, b) => reviewAttemptTimestamp(a) - reviewAttemptTimestamp(b));
    return candidates.at(-1) || null;
  }

  function scheduleReview(state, questionId, rating, now = Date.now(), options = {}) {
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
    const attempt = completedReviewAttempt(state, questionId, profileId, previous, options);
    if (!attempt) {
      throw new Error("完成新的真实作答后，才能安排或刷新下一次复习。");
    }
    // `rating` stays in the signature so older callers do not crash, but it is
    // intentionally ignored. Confidence and self-reported difficulty remain
    // metadata; only the stored answer result and hint level set the interval.
    const ratingSource = "automatic-answer-and-hints";
    const normalizedRating = automaticReviewRating(attempt);
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
      ratingSource,
      evidenceAttemptId: attempt.id,
      evidenceCompletedAt: new Date(reviewAttemptTimestamp(attempt)).toISOString(),
      lastReviewedAt: new Date(now).toISOString(),
      dueAt: new Date(now + intervalDays * DAY).toISOString()
    };
    state.reviews[storageKey] = review;
    if (state.reviews[questionId] === legacy) delete state.reviews[questionId];
    return review;
  }

  function scheduleReviewFromAttempt(state, questionId, attemptId, now = Date.now()) {
    return scheduleReview(state, questionId, null, now, {
      attemptId,
      ratingSource: "automatic-answer-and-hints"
    });
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
    return localCalendarDateKey(value);
  }

  function evidenceTimestamp(value) {
    const timestamp = new Date(value || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function retainedLowHintDates(attempts) {
    const minimumInterval = MASTERY_RULES.minimumRetentionIntervalHours * 60 * 60 * 1000;
    const selected = [];
    const dates = new Set();
    attempts.slice().sort((a, b) => evidenceTimestamp(a.completedAt || a.createdAt)
      - evidenceTimestamp(b.completedAt || b.createdAt)).forEach((attempt) => {
      const value = attempt.completedAt || attempt.createdAt;
      const timestamp = evidenceTimestamp(value);
      const date = timestamp > 0 ? localDateKey(value) : "";
      if (!date || dates.has(date)) return;
      if (selected.length && timestamp - selected.at(-1).timestamp < minimumInterval) return;
      selected.push({ date, timestamp, evidenceId: attempt.id });
      dates.add(date);
    });
    return selected;
  }

  function countedLabels(values) {
    const counts = new Map();
    values.filter(Boolean).forEach((value) => {
      const label = String(value);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
  }

  function normalizeTopicText(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/[\s\u3000]+/g, " ")
      .toLocaleLowerCase("zh-CN");
  }

  function resolveKnowledgePointIdentity(value = {}) {
    const source = value && typeof value === "object" ? value : { label: value };
    const rawExplicit = String(source.knowledgePointId || source.key || source.topicKey || source.topicId || "").trim();
    const sourceLabel = String(source.label || source.name || source.topic || source.knowledgePoint || source.topicLabel || "").trim();
    const legacyTextKey = rawExplicit.startsWith("topic:") && Boolean(sourceLabel);
    const resolver = globalThis.PHYSICS_CURRICULUM_TAXONOMY?.resolveKnowledgePoint;
    if (typeof resolver === "function") {
      return resolver({
        label: sourceLabel,
        knowledgePointId: legacyTextKey ? "" : rawExplicit
      });
    }
    const label = sourceLabel;
    const explicit = legacyTextKey ? "" : rawExplicit;
    const normalized = normalizeTopicText(label)
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
    return {
      id: explicit || (normalized ? `kp:${normalized}` : ""),
      label: label || explicit,
      resolution: explicit ? "explicit" : (normalized ? "legacy-fallback" : "unresolved"),
      unresolved: !explicit
    };
  }

  function topicKeyForLabel(value) {
    return resolveKnowledgePointIdentity({ label: value }).id;
  }

  function topicKeyForQuestion(question = {}) {
    const resolved = resolveKnowledgePointIdentity(question);
    if (resolved.id) return resolved.id;
    return String(question.curriculumSectionId || question.curriculumChapterId || "").trim();
  }

  function topicCatalog(questions = [], grade = "") {
    const catalog = new Map();
    (Array.isArray(questions) ? questions : []).forEach((question) => {
      if (grade && question.grade && question.grade !== grade) return;
      const label = String(question.topic || question.knowledgePoint || "").trim();
      const key = topicKeyForQuestion(question);
      if (!label || !key) return;
      const aliases = [label, question.knowledgePoint, question.topicLabel]
        .filter(Boolean)
        .map(normalizeTopicText);
      const current = catalog.get(key);
      catalog.set(key, {
        key,
        label: current?.label || label,
        aliases: [...new Set([...(current?.aliases || []), ...aliases])],
        grade: question.grade || grade || ""
      });
    });
    return [...catalog.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }

  function normalizeTopic(value, options = {}) {
    const valueIsKey = typeof value === "string" && /^(?:topic|kp):/.test(value);
    const raw = value && typeof value === "object"
      ? value
      : { label: value };
    const label = String(raw.label || raw.name || raw.topic || (valueIsKey ? "" : "")).trim();
    const explicitKey = String(raw.key || raw.topicKey || raw.knowledgePointId || raw.topicId
      || (valueIsKey ? value : "")).trim();
    const catalog = Array.isArray(options.catalog) ? options.catalog : [];
    const normalizedLabel = normalizeTopicText(label);
    const matched = catalog.find((item) => {
      return item.key === explicitKey
        || item.aliases?.includes(normalizedLabel)
        || normalizeTopicText(item.label) === normalizedLabel;
    });
    if (matched) return { key: matched.key, label: matched.label, unresolved: false, resolution: "catalog" };
    const resolved = resolveKnowledgePointIdentity({ label, knowledgePointId: explicitKey });
    const key = resolved.id;
    return {
      key,
      label: label || resolved.label || explicitKey,
      unresolved: resolved.unresolved || Boolean(label && !explicitKey && catalog.length),
      resolution: resolved.resolution
    };
  }

  function canonicalTopicKey(label, explicitKey = "", catalog = []) {
    return normalizeTopic({ label, key: explicitKey }, { catalog }).key || topicKeyForLabel(label);
  }

  function topicValues(value) {
    if (Array.isArray(value)) return value;
    return String(value || "")
      .split(/[、,，;；\n\r]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeTopicValues(values, options = {}) {
    const normalized = topicValues(values)
      .map((value) => normalizeTopic(value, options))
      .filter((item) => item.key || item.label);
    return {
      keys: [...new Set(normalized.map((item) => item.key).filter(Boolean))],
      labels: [...new Set(normalized.map((item) => item.label).filter(Boolean))],
      unresolved: [...new Set(normalized.filter((item) => item.unresolved).map((item) => item.label))]
    };
  }

  function normalizeExamRecord(record = {}) {
    const hasExplicitKeys = Array.isArray(record.weakTopicKeys) && record.weakTopicKeys.length > 0;
    const weak = normalizeTopicValues(hasExplicitKeys
      ? record.weakTopicKeys.map((key, index) => ({
        key,
        label: record.weakTopics?.[index] || key
      }))
      : record.weakTopics);
    return {
      ...record,
      weakTopics: weak.labels,
      weakTopicKeys: weak.keys,
      unresolvedWeakTopics: Array.isArray(record.unresolvedWeakTopics)
        ? [...new Set([...record.unresolvedWeakTopics, ...weak.unresolved, ...(hasExplicitKeys ? [] : weak.labels)])]
        : [...new Set([...weak.unresolved, ...(hasExplicitKeys ? [] : weak.labels)])]
    };
  }

  function resolveExamRecordTopics(record = {}, questions = []) {
    const catalog = topicCatalog(questions, record.grade || "");
    const unresolved = new Set(record.unresolvedWeakTopics || []);
    const raw = Array.isArray(record.weakTopics) && record.weakTopics.length
      ? record.weakTopics.map((label, index) => unresolved.has(label)
        ? { label }
        : { label, key: record.weakTopicKeys?.[index] || "" })
      : record.weakTopicKeys;
    const normalized = normalizeTopicValues(raw, { catalog });
    return {
      ...record,
      weakTopics: normalized.labels,
      weakTopicKeys: normalized.keys,
      unresolvedWeakTopics: normalized.unresolved
    };
  }

  function diagnosticTopics(attempt) {
    if (Array.isArray(attempt?.topics) && attempt.topics.length) return attempt.topics;
    return misconceptionCatalog.find((item) => item.code === attempt?.misconceptionCode)?.topics || [];
  }

  function topicEvidenceProfile(state, questions = [], profileId = state.activeProfileId, now = Date.now()) {
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const questionList = Array.isArray(questions) ? questions : [];
    const eligibleQuestions = questionList.filter((question) => {
      return isPublishedQuestion(question)
        && question.grade !== "七年级"
        && (!profile?.grade || !question.grade || question.grade === profile.grade);
    });
    const questionMap = new Map(questionList.map((question) => [question.id, question]));
    const attempts = state.attempts.filter((attempt) => attempt.profileId === profileId);
    const diagnostics = state.diagnosticAttempts.filter((attempt) => attempt.profileId === profileId);
    const verifiedTransfers = state.experimentRecords.filter((record) => {
      return record?.profileId === profileId
        && record.type === "transfer"
        && String(record.response || "").trim().length >= 10
        && ["教师已通过", "自动判定正确"].includes(record.verificationStatus);
    }).concat((state.variantAttempts || [])
      .filter((record) => record.profileId === profileId && record.verificationStatus === "verified-transfer")
      .map((record) => ({ ...record, questionId: record.parentQuestionId, type: "verified-variant" })));
    const catalog = topicCatalog(eligibleQuestions, profile?.grade || "");
    const topicEntries = new Map();
    const addTopic = (label, explicitKey = "") => {
      const rawLabel = String(label || "").trim();
      const normalized = normalizeTopic({ label: rawLabel, key: explicitKey }, { catalog });
      const key = normalized.key || topicKeyForLabel(rawLabel);
      if (!key) return;
      topicEntries.set(key, normalized.label || rawLabel || key);
    };
    eligibleQuestions.forEach((question) => addTopic(question.topic, topicKeyForQuestion(question)));
    attempts.forEach((attempt) => addTopic(attempt.topic || "待分类", attempt.topicKey));
    diagnostics.forEach((attempt) => diagnosticTopics(attempt).forEach((topic) => addTopic(topic)));

    // Build the evidence joins once. The previous implementation filtered the
    // complete question/evidence arrays again for every knowledge point, which
    // made opening an analysis page O(topics × records) on the WebView thread.
    const appendGrouped = (map, key, value) => {
      if (!key) return;
      const values = map.get(key) || [];
      values.push(value);
      map.set(key, values);
    };
    const availableQuestionCountByTopic = new Map();
    eligibleQuestions.forEach((question) => {
      const key = canonicalTopicKey(question.topic, topicKeyForQuestion(question), catalog);
      if (key) availableQuestionCountByTopic.set(key, (availableQuestionCountByTopic.get(key) || 0) + 1);
    });
    const attemptsByTopic = new Map();
    attempts.forEach((attempt) => {
      const key = canonicalTopicKey(attempt.topic || "待分类", attempt.knowledgePointId || attempt.topicKey, catalog);
      appendGrouped(attemptsByTopic, key, attempt);
    });
    const diagnosticsByTopic = new Map();
    diagnostics.forEach((attempt) => {
      const keys = new Set(diagnosticTopics(attempt)
        .map((value) => canonicalTopicKey(value, "", catalog))
        .filter(Boolean));
      keys.forEach((key) => appendGrouped(diagnosticsByTopic, key, attempt));
    });
    const transfersByTopic = new Map();
    verifiedTransfers.forEach((record) => {
      const question = questionMap.get(record.questionId);
      if (!question) return;
      const key = canonicalTopicKey(question.topic, topicKeyForQuestion(question), catalog);
      appendGrouped(transfersByTopic, key, record);
    });

    const statusOrder = { "需巩固": 0, "证据不足": 1, "基本掌握": 2, "可迁移": 3 };
    return [...topicEntries.entries()].map(([topicKey, topic]) => {
      const topicAttempts = (attemptsByTopic.get(topicKey) || [])
        .slice()
        .sort((a, b) => evidenceTimestamp(a.completedAt || a.createdAt) - evidenceTimestamp(b.completedAt || b.createdAt));
      const topicDiagnostics = diagnosticsByTopic.get(topicKey) || [];
      const topicTransfers = transfersByTopic.get(topicKey) || [];
      const evidenceSummary = summarizeAttemptEvidence(topicAttempts);
      const scoredAttempts = topicAttempts.filter(isValidAccuracyEvidence);
      const correct = scoredAttempts.filter((attempt) => attempt.grading?.status === "correct");
      const independentCorrect = correct.filter((attempt) => {
        return Number(attempt.hintLevel || 0) <= MASTERY_RULES.independentHintMaximum;
      });
      const independenceGroupFor = (record) => {
        const question = questionMap.get(record.questionId) || {};
        return String(record.independenceGroupId || question.independenceGroupId
          || record.modelDefinitionId || question.modelDefinitionId
          || record.modelFamilyId || question.modelFamilyId || "legacy-unclassified");
      };
      const independentGroups = new Set(independentCorrect.map(independenceGroupFor));
      const independentDates = retainedLowHintDates(independentCorrect);
      const successfulTransferAttempts = independentCorrect.filter((attempt) => {
        return String(attempt.transferType || "").trim().length > 0;
      });
      const transferSuccessCount = successfulTransferAttempts.length + topicTransfers.length;
      topicTransfers.forEach((record) => independentGroups.add(independenceGroupFor(record)));
      const latest = topicAttempts.at(-1) || null;
      const latestDiagnostic = topicDiagnostics
        .slice()
        .sort((a, b) => evidenceTimestamp(a.createdAt) - evidenceTimestamp(b.createdAt))
        .at(-1) || null;
      const diagnosticRisk = Boolean(latestDiagnostic
        && ["stable-misconception", "confident-guess", "not-yet-understood"].includes(latestDiagnostic.classification));
      const diagnosticReviewRequired = Boolean(latestDiagnostic
        && latestDiagnostic.classification === "stable-misconception"
        && !latestDiagnostic.confirmationEvidenceId);
      const hintTotal = topicAttempts.reduce((sum, attempt) => sum + (Number(attempt.hintLevel) || 0), 0);
      const modelScores = scoredAttempts
        .map((attempt) => Number(attempt.modelScore?.total))
        .filter(Number.isFinite);
      const accuracy = evidenceSummary.accuracy;
      const averageScore = evidenceSummary.averageScore;
      const averageHint = topicAttempts.length
        ? Math.round(hintTotal / topicAttempts.length * 10) / 10
        : 0;
      const modeling = modelScores.length
        ? Math.round(modelScores.reduce((sum, value) => sum + value, 0) / modelScores.length)
        : null;
      const evidenceTimes = [
        ...topicAttempts.map((attempt) => evidenceTimestamp(attempt.completedAt || attempt.createdAt)),
        ...topicDiagnostics.map((attempt) => evidenceTimestamp(attempt.createdAt)),
        ...topicTransfers.map((record) => evidenceTimestamp(record.createdAt || record.completedAt))
      ].filter((value) => value > 0 && value <= Number(now) + DAY);
      const latestTimestamp = evidenceTimes.length ? Math.max(...evidenceTimes) : 0;
      const sampleSize = topicAttempts.length + topicDiagnostics.length + topicTransfers.length;
      const latestWeak = Boolean(latest && !isPendingManualReview(latest) && (
        (isValidAccuracyEvidence(latest) && latest.grading?.status !== "correct")
        || Number(latest.hintLevel || 0) >= MASTERY_RULES.weakHintMinimum
      ));
      const modelingRecordNeedsCheck = Boolean(latest?.modelingRecordNeedsCheck
        || latest?.modelScore?.needsCheck);

      let code = "insufficient";
      let status = "证据不足";
      if (evidenceSummary.scoredCount >= 3 && (
        diagnosticRisk || latestWeak || (accuracy !== null && accuracy < 60)
        || (evidenceSummary.scoredCount > 0 && averageHint >= 3)
      )) {
        code = "reinforce";
        status = "需巩固";
      } else if (evidenceSummary.scoredCount >= 3
        && independentDates.length >= MASTERY_RULES.masteredIndependentDates
        && transferSuccessCount >= MASTERY_RULES.masteredTransferEvidence
        && independentGroups.size >= 2) {
        code = "transferable";
        status = "可迁移";
      } else if (evidenceSummary.scoredCount >= 3 && independentCorrect.length >= 1
        && accuracy !== null && accuracy >= 70 && averageHint <= 2) {
        code = "basic";
        status = "基本掌握";
      }

      const reasons = [];
      if (modelingRecordNeedsCheck) reasons.push("需要检查建模记录，不能单独作为知识点薄弱证据");
      if (!sampleSize) reasons.push("尚无作答、诊断或迁移证据");
      else reasons.push(`共有 ${sampleSize} 条证据，其中正式作答 ${topicAttempts.length} 次，已评分 ${evidenceSummary.scoredCount} 次${evidenceSummary.pendingReviewCount ? `，待人工复核 ${evidenceSummary.pendingReviewCount} 次` : ""}`);
      if (independentDates.length) reasons.push(`符合至少 ${MASTERY_RULES.minimumRetentionIntervalHours} 小时间隔规则的低提示正确日期 ${independentDates.length} 个`);
      if (independentCorrect.length) reasons.push(`低提示正确证据来自 ${independentGroups.size} 个独立模型组；同模板参数变式只计为一个独立组`);
      if (transferSuccessCount) reasons.push(`有 ${transferSuccessCount} 条迁移成功证据`);
      if (transferSuccessCount && independentGroups.size < 2) reasons.push("迁移证据仍来自同一模板/模型组，暂不判为可迁移");
      if (diagnosticReviewRequired) reasons.push("历史规则诊断结果，需教师复核后才能解释为稳定误概念风险");
      else if (diagnosticRisk) reasons.push("最近前概念诊断仍显示待验证风险");
      if (latestWeak) reasons.push("最近作答存在错误或高提示依赖");
      if (evidenceSummary.scoredCount < 3) reasons.push("已评分证据不足 3 条，可补充练习，但不作薄弱或稳定结论");

      return {
        topic,
        topicKey,
        code,
        status,
        sampleSize,
        attemptCount: topicAttempts.length,
        submittedCount: evidenceSummary.submittedCount,
        scoredCount: evidenceSummary.scoredCount,
        correctCount: evidenceSummary.correctCount,
        pendingReviewCount: evidenceSummary.pendingReviewCount,
        evidenceIds: [...new Set([
          ...topicAttempts.map((item) => item.id),
          ...topicDiagnostics.map((item) => item.id),
          ...topicTransfers.map((item) => item.id)
        ].filter(Boolean))],
        diagnosticCount: topicDiagnostics.length,
        transferSuccessCount,
        availableQuestionCount: availableQuestionCountByTopic.get(topicKey) || 0,
        latestEvidenceAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
        latestEvidenceDate: latestTimestamp ? localDateKey(latestTimestamp) : null,
        correct: correct.length,
        accuracy,
        averageScore,
        averageHint,
        modeling,
        modelingRecordNeedsCheck,
        diagnosticReviewRequired,
        independentCorrect: independentCorrect.length,
        independentDates: independentDates.length,
        independentModelGroups: independentGroups.size,
        evidenceFreshness: {
          latestEvidenceAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
          ageDays: latestTimestamp ? Math.max(0, Math.floor((Number(now) - latestTimestamp) / DAY)) : null,
          needsReconfirmation: !latestTimestamp || Number(now) - latestTimestamp > 45 * DAY
        },
        questionTypes: countedLabels([
          ...topicAttempts.map((attempt) => normalizeQuestionType(attempt.questionType || attempt.examQuestionType)),
          ...topicDiagnostics.map(() => "前概念诊断")
        ]),
        errorTypes: countedLabels(topicAttempts.map((attempt) => normalizeErrorType(attempt.errorType))),
        reasons
      };
    }).sort((a, b) => statusOrder[a.status] - statusOrder[b.status]
      || b.sampleSize - a.sampleSize
      || a.topic.localeCompare(b.topic, "zh-CN"));
  }

  function knowledgePointEvidenceSummary(state, questions = [], profileId = state.activeProfileId, now = Date.now(), options = {}) {
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const eligibleQuestions = (Array.isArray(questions) ? questions : []).filter((question) => {
      return isPublishedQuestion(question)
        && question.grade !== "七年级"
        && (!profile?.grade || !question.grade || question.grade === profile.grade);
    });
    const catalog = Array.isArray(options.catalog)
      ? options.catalog
      : topicCatalog(eligibleQuestions, profile?.grade || "");
    const evidenceProfile = Array.isArray(options.evidenceProfile)
      ? options.evidenceProfile
      : topicEvidenceProfile(state, eligibleQuestions, profileId, now);
    const byKey = new Map(evidenceProfile.map((item) => [item.topicKey || topicKeyForLabel(item.topic), item]));
    const exams = state.examRecords.filter((record) => record.profileId === profileId);
    const examByKey = new Map();
    exams.forEach((record) => {
      const normalized = resolveExamRecordTopics(record, eligibleQuestions);
      normalized.weakTopicKeys.forEach((key) => {
        const current = examByKey.get(key) || { count: 0, latest: 0 };
        current.count += 1;
        current.latest = Math.max(current.latest, evidenceTimestamp(record.examDate || record.createdAt));
        examByKey.set(key, current);
      });
    });
    const byTopic = catalog.map((item) => {
      const evidence = byKey.get(item.key);
      const exam = examByKey.get(item.key) || { count: 0, latest: 0 };
      const attemptCount = evidence?.attemptCount || 0;
      const diagnosticCount = evidence?.diagnosticCount || 0;
      const transferCount = evidence?.transferSuccessCount || 0;
      const sampleSize = attemptCount + diagnosticCount + transferCount + exam.count;
      const latestTimestamp = Math.max(
        evidenceTimestamp(evidence?.latestEvidenceAt),
        exam.latest
      );
      return {
        key: item.key,
        label: item.label,
        grade: item.grade,
        code: evidence?.code || "insufficient",
        status: evidence?.status || "证据不足",
        sampleSize,
        attemptCount,
        submittedCount: evidence?.submittedCount || 0,
        scoredCount: evidence?.scoredCount || 0,
        correctCount: evidence?.correctCount || 0,
        pendingReviewCount: evidence?.pendingReviewCount || 0,
        diagnosticCount,
        transferCount,
        examCount: exam.count,
        latestEvidenceAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
        latestEvidenceDate: latestTimestamp ? localCalendarDateKey(latestTimestamp) : null,
        reasons: evidence?.reasons || ["\u5c1a\u65e0\u53ef\u8ffd\u6eaf\u7684\u5b66\u60c5\u8bc1\u636e"]
      };
    });
    const evidenced = byTopic.filter((item) => item.sampleSize > 0);
    const counts = evidenced.reduce((result, item) => {
      if (item.code === "transferable") result.transferable += 1;
      else if (item.code === "basic") result.basic += 1;
      else if (item.code === "reinforce") result.reinforce += 1;
      else result.insufficient += 1;
      return result;
    }, { insufficient: 0, reinforce: 0, basic: 0, transferable: 0 });
    const denominator = catalog.length;
    const numerator = evidenced.length;
    const coverageRate = denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
    const maxTopicEvidence = evidenced.reduce((max, item) => Math.max(max, item.sampleSize), 0);
    const broadlyDistributed = numerator > 0 && maxTopicEvidence <= Math.max(3, Math.ceil(evidenced.reduce((sum, item) => sum + item.sampleSize, 0) * 0.6));
    const levelCode = !numerator
      ? "insufficient"
      : numerator / Math.max(1, denominator) >= 0.6 && broadlyDistributed
        ? "adequate"
        : "partial";
    const levelLabel = {
      insufficient: "\u8bc1\u636e\u4e0d\u8db3",
      partial: "\u5c40\u90e8\u8bc1\u636e",
      adequate: "\u8986\u76d6\u8f83\u5145\u5206"
    }[levelCode];
    return {
      totalKnowledgePoints: denominator,
      evidencedKnowledgePoints: numerator,
      insufficient: counts.insufficient,
      reinforce: counts.reinforce,
      basic: counts.basic,
      transferable: counts.transferable,
      coverageRate,
      coverageNumerator: numerator,
      coverageDenominator: denominator,
      coverageLabel: `${numerator}/${denominator}`,
      levelCode,
      levelLabel,
      byTopic,
      reason: `${levelLabel}\uff1a\u5df2\u8986\u76d6 ${numerator}/${denominator} \u4e2a\u53ef\u8bc4\u4f30\u77e5\u8bc6\u70b9\uff0c\u6700\u8fd1\u8bc1\u636e\u6309\u77e5\u8bc6\u70b9\u5206\u5e03\u7edf\u8ba1\uff1b\u91cd\u590d\u540c\u4e00\u77e5\u8bc6\u70b9\u4e0d\u4f1a\u5355\u72ec\u63d0\u9ad8\u8986\u76d6\u7ea7\u522b\u3002`
    };
  }

  function transferEvidence(state, questionId, profileId = state.activeProfileId) {
    const legacy = state.experimentRecords.filter((record) => {
      return record?.type === "transfer"
        && record.questionId === questionId
        && record.profileId === profileId
        && String(record.response || "").trim().length >= 10
        && ["教师已通过", "自动判定正确"].includes(record.verificationStatus);
    });
    const variants = (state.variantAttempts || []).filter((record) => {
      return record?.parentQuestionId === questionId
        && record.profileId === profileId
        && record.verificationStatus === "verified-transfer";
    });
    return [...legacy, ...variants];
  }

  function questionMasteryEvidence(state, questionId, profileId = state.activeProfileId, now = Date.now()) {
    const attempts = state.attempts
      .filter((attempt) => attempt.profileId === profileId && attempt.questionId === questionId)
      .sort((a, b) => new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt));
    const latest = attempts.at(-1) || null;
    const independentCorrect = attempts.filter((attempt) => {
      return isValidAccuracyEvidence(attempt) && attempt.grading?.status === "correct"
        && Number(attempt.hintLevel || 0) <= MASTERY_RULES.independentHintMaximum;
    });
    const independentDates = retainedLowHintDates(independentCorrect);
    const transfers = transferEvidence(state, questionId, profileId);
    const review = reviewsForProfile(state, profileId).find((item) => item.questionId === questionId) || null;
    const reviewDue = Boolean(review && new Date(review.dueAt).getTime() <= now);
    const latestWeak = Boolean(latest && !isPendingManualReview(latest) && (
      !["correct", "review-required"].includes(latest.grading?.status)
      || Number(latest.hintLevel || 0) >= MASTERY_RULES.weakHintMinimum
    ));
    const modelingRecordNeedsCheck = Boolean(latest?.modelingRecordNeedsCheck
      || latest?.modelScore?.needsCheck);

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
      status = "待订正";
      code = "correction";
    }

    const reasons = [];
    if (modelingRecordNeedsCheck) reasons.push("需要检查建模记录，不能单独作为知识点薄弱证据");
    if (!attempts.length) reasons.push("尚无正式作答记录");
    else reasons.push(`已完成 ${attempts.length} 次正式作答`);
    if (independentCorrect.length) reasons.push(`${independentCorrect.length} 次低提示正确`);
    if (independentDates.length) reasons.push(`符合至少 ${MASTERY_RULES.minimumRetentionIntervalHours} 小时间隔规则的日期 ${independentDates.length} 个`);
    if (transfers.length) reasons.push(`完成 ${transfers.length} 条已核验迁移证据`);
    if (latestWeak) reasons.push("近期存在错误或高提示依赖");
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
      modelingRecordNeedsCheck,
      review,
      reasons,
      rules: MASTERY_RULES
    };
  }

  function masteryDisplayLabel(value) {
    const rawCode = typeof value === "string" ? value : value?.code;
    const legacyCodes = {
      "未开始": "not-started",
      "学习中": "learning",
      "熟练": "proficient",
      "已有独立正确证据": "proficient",
      "已掌握": "mastered",
      "待复习": "due",
      "薄弱": "weak",
      "需巩固": "weak"
    };
    const code = legacyCodes[rawCode] || rawCode;
    const labels = {
      "not-started": "\u672a\u5f00\u59cb",
      learning: "\u5b66\u4e60\u4e2d",
      proficient: "\u5df2\u6709\u72ec\u7acb\u6b63\u786e\u8bc1\u636e",
      mastered: "\u5df2\u638c\u63e1",
      due: "\u5df2\u638c\u63e1\uff0c\u5f85\u590d\u4e60",
      weak: "\u9700\u5de9\u56fa"
    };
    return labels[code] || "\u8bc1\u636e\u4e0d\u8db3";
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
      const topicKey = attempt.knowledgePointId || attempt.topicKey || topicKeyForLabel(topic);
      const current = groups.get(topicKey) || {
        topic,
        topicKey,
        attempts: 0,
        submittedCount: 0,
        scoredCount: 0,
        correct: 0,
        correctCount: 0,
        pendingReviewCount: 0,
        scoreTotal: 0,
        hintTotal: 0,
        modelTotal: 0,
        modelCount: 0
      };
      current.attempts += 1;
      current.submittedCount += 1;
      if (isPendingManualReview(attempt)) current.pendingReviewCount += 1;
      if (isValidAccuracyEvidence(attempt)) {
        current.scoredCount += 1;
        current.correct += attempt.grading?.status === "correct" ? 1 : 0;
        current.correctCount = current.correct;
        current.scoreTotal += Number(attempt.grading?.score);
      }
      current.hintTotal += Number(attempt.hintLevel) || 0;
      const modelValue = Number(attempt.modelScore?.total);
      if (attempt.modelScore?.total != null && Number.isFinite(modelValue)) {
        current.modelTotal += modelValue;
        current.modelCount += 1;
      }
      groups.set(topicKey, current);
    });
    return [...groups.values()].map((item) => ({
      ...item,
      accuracy: item.scoredCount ? Math.round(item.correct / item.scoredCount * 100) : null,
      averageScore: item.scoredCount ? Math.round(item.scoreTotal / item.scoredCount * 100) : null,
      averageHint: item.attempts ? Math.round(item.hintTotal / item.attempts * 10) / 10 : 0,
      modeling: item.modelCount ? Math.round(item.modelTotal / item.modelCount) : null,
      modelingSampleSize: item.modelCount
    })).sort((a, b) => {
      if (a.averageScore == null && b.averageScore != null) return 1;
      if (a.averageScore != null && b.averageScore == null) return -1;
      return (a.averageScore ?? 0) - (b.averageScore ?? 0) || b.attempts - a.attempts;
    });
  }

  // A pending submission does not erase an earlier scored correction need.
  // It is shown separately until a teacher has scored that submission.
  function questionCorrectionState(attempts = [], profileId = "", questionId = "") {
    const records = attempts.filter((attempt) => attempt?.profileId === profileId
      && attempt.questionId === questionId);
    const latestScored = records.filter(isValidAccuracyEvidence).at(-1) || null;
    const pending = records.filter(isPendingManualReview);
    return {
      needsCorrection: Boolean(latestScored && latestScored.grading?.status !== "correct"),
      latestScoredEvidenceId: latestScored?.id || null,
      pendingReviewCount: pending.length,
      pendingEvidenceIds: pending.map((attempt) => attempt.id).filter(Boolean)
    };
  }

  function summarizeLearning(state, questions = [], profileId = state.activeProfileId) {
    const attempts = state.attempts.filter((attempt) => attempt.profileId === profileId);
    const evidenceSummary = summarizeAttemptEvidence(attempts);
    const completed = evidenceSummary.submittedCount;
    const correct = evidenceSummary.correctCount;
    const independent = attempts.filter((attempt) => {
      return isValidAccuracyEvidence(attempt)
        && attempt.grading?.status === "correct" && Number(attempt.hintLevel) <= 1;
    }).length;
    const durationSeconds = attempts.reduce((sum, attempt) => sum + (Number(attempt.durationSeconds) || 0), 0);
    const hintTotal = attempts.reduce((sum, attempt) => sum + (Number(attempt.hintLevel) || 0), 0);
    const recent = attempts.slice(-14);
    const trend = recent.filter(isValidAccuracyEvidence).map((attempt, index) => ({
      index: index + 1,
      score: Math.round(Number(attempt.grading?.score) * 100),
      hintLevel: attempt.hintLevel,
      date: attempt.createdAt
    }));
    const due = dueReviews(state, Date.now(), profileId);
    const topics = topicPerformance(state, profileId);
    const mastery = masterySummary(state, questions, profileId);
    const closedLoop = closedLoopStreak(state, profileId);
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    return {
      completed,
      correct,
      submittedCount: evidenceSummary.submittedCount,
      scoredCount: evidenceSummary.scoredCount,
      correctCount: evidenceSummary.correctCount,
      pendingReviewCount: evidenceSummary.pendingReviewCount,
      accuracy: evidenceSummary.accuracy,
      independent,
      independenceRate: evidenceSummary.scoredCount ? Math.round(independent / evidenceSummary.scoredCount * 100) : null,
      averageHint: evidenceSummary.averageHint,
      averageScore: evidenceSummary.averageScore,
      learningMinutes: Math.round(durationSeconds / 60),
      dueCount: due.length,
      dueQuestions: due.map((review) => ({ ...review, question: questionMap.get(review.questionId) })).filter((item) => item.question),
      topics,
      trend,
      misconceptionProfile: misconceptionProfile(state, profileId),
      mastery,
      closedLoop
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
      item.topicKey || topicKeyForLabel(item.topic),
      item.scoredCount >= 3
        ? Math.max(0, 40 - item.averageScore * 0.4) + Math.max(0, 3 - index)
        : 0
    ]));
    const examWeakness = new Map();
    state.examRecords
      .filter((record) => record.profileId === profileId)
      .slice(-12)
      .forEach((record) => (record.weakTopicKeys?.length ? record.weakTopicKeys : record.weakTopics || [])
        .forEach((topic) => {
        const key = record.weakTopicKeys?.length ? String(topic) : topicKeyForLabel(topic);
        examWeakness.set(key, (examWeakness.get(key) || 0) + 1);
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
          if (isValidAccuracyEvidence(last) && last.grading?.status !== "correct") {
            score += 70;
            reasons.push("本人上次作答未完全正确");
          }
          if (last.hintLevel >= 3) {
            score += 25;
            reasons.push(`上次使用第 ${last.hintLevel} 级提示`);
          }
          if (!isPendingManualReview(last) && last.modelingRecordNeedsCheck) {
            score += 20;
            reasons.push("建模记录需要检查（需教师复核）");
          }
          if (!isPendingManualReview(last) && last.errorType) {
            score += 10;
            reasons.push(`上次主要错误：${last.errorType}`);
          }
        }
        const questionTopicKey = topicKeyForQuestion(question);
        score += topicRisk.get(questionTopicKey) || 0;
        const examWeakCount = examWeakness.get(questionTopicKey) || 0;
        if (examWeakCount) {
          score += Math.min(45, 20 + examWeakCount * 5);
          reasons.push(`最近试卷记录提示复核“${question.topic}”，仍需足量已评分作答核实`);
        }
        const focusKey = String(options.focusTopicKey || "").trim();
        if (focusKey || (options.focusTopic && options.focusTopic !== "自动依据学情")) {
          if ((focusKey && questionTopicKey === focusKey) || (!focusKey && question.topic === options.focusTopic)) {
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
    const normalizedRecord = normalizeExamRecord(record);
    state.examRecords.push(normalizedRecord);
    return normalizedRecord;
  }

  function importExamRecords(state, records = [], profileId = null) {
    if (!Array.isArray(records) || records.length > 500) throw new Error("试卷记录数量不符合要求。");
    const valid = [];
    const errors = [];
    records.forEach((record, index) => {
      try {
        const score = Number(record.score);
        const totalScore = Number(record.totalScore);
        const examDate = new Date(record.examDate || Date.now());
        if (!Number.isFinite(score) || !Number.isFinite(totalScore) || totalScore <= 0
          || score < 0 || score > totalScore || Number.isNaN(examDate.getTime())) {
          throw new Error("试卷得分、总分或日期无效。");
        }
        const recordProfileId = String(record.profileId || profileId || "").trim();
        if (!recordProfileId || !state.profiles.some((profile) => profile.id === recordProfileId)) {
          throw new Error("试卷记录未匹配到明确学生档案。");
        }
        valid.push({ ...record, profileId: recordProfileId, score, totalScore, examDate: examDate.toISOString() });
      } catch (error) {
        errors.push({ index, message: error.message });
      }
    });
    // A batch import may contain multiple students.  The validated profileId
    // on each record is authoritative; `profileId` remains only a compatibility
    // default for the explicit single-student API.
    const merged = mergeImportedCollection(state, "examRecords", valid, null, "exam", normalizeExamRecord);
    return { added: merged.added, skipped: merged.skipped, conflicts: merged.conflicts, errors };
  }

  function stableSerialize(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }

  function shortHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function importedRecordFingerprint(kind, record = {}) {
    const sourceId = String(record.sourceRecordId || record.originalId || "").trim();
    if (sourceId) return `${kind}:id:${sourceId}`;
    const copy = { ...record };
    delete copy.id;
    delete copy.profileId;
    delete copy.sourceRecordFingerprint;
    return `${kind}:hash:${shortHash(stableSerialize(copy))}`;
  }

  function mergeImportedCollection(state, collectionName, records, profileId, kind, normalize = (value) => value) {
    if (!Array.isArray(records)) return { added: [], skipped: [], conflicts: [], errors: [] };
    const collection = Array.isArray(state[collectionName]) ? state[collectionName] : [];
    const added = [];
    const skipped = [];
    const conflicts = [];
    const errors = [];
    records.forEach((source, index) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        errors.push({ index, message: "record must be an object" });
        return;
      }
      const targetProfileId = String(source.profileId || profileId || "").trim();
      if (targetProfileId && !state.profiles.some((profile) => profile.id === targetProfileId)) {
        errors.push({ index, message: "record profileId does not resolve to a local profile" });
        return;
      }
      if (!targetProfileId && collectionName !== "contentReviews") {
        errors.push({ index, message: "record profileId is required" });
        return;
      }
      const fingerprint = importedRecordFingerprint(kind, source);
      const sourceRecordId = String(source.sourceRecordId || source.originalId || source.id || "").trim();
      const existing = collection.find((record) => {
        if (targetProfileId && record.profileId !== targetProfileId) return false;
        return (sourceRecordId && String(record.sourceRecordId || "") === sourceRecordId)
          || String(record.sourceRecordFingerprint || "") === fingerprint;
      });
      if (existing) {
        const comparableExisting = { ...existing };
        const comparableIncoming = { ...source, profileId: targetProfileId };
        delete comparableExisting.id;
        delete comparableExisting.sourceRecordId;
        delete comparableExisting.sourceRecordFingerprint;
        delete comparableExisting.importedAt;
        delete comparableIncoming.id;
        delete comparableIncoming.sourceRecordId;
        delete comparableIncoming.sourceRecordFingerprint;
        delete comparableIncoming.importedAt;
        if (stableSerialize(comparableExisting) === stableSerialize(comparableIncoming)) skipped.push(existing);
        else conflicts.push({ existing, incoming: source });
        return;
      }
      const normalized = normalize({ ...source, profileId: targetProfileId });
      const record = {
        ...normalized,
        id: collection.some((item) => item.id === source.id) ? createId(kind) : String(source.id || createId(kind)),
        profileId: targetProfileId,
        sourceRecordId: sourceRecordId || "",
        sourceRecordFingerprint: fingerprint,
        importedAt: new Date().toISOString()
      };
      collection.push(record);
      added.push(record);
    });
    state[collectionName] = collection;
    return { added, skipped, conflicts, errors };
  }

  function importLearningProfile(state, payload = {}, options = {}) {
    const incoming = payload.profile;
    const sourceProfileId = String(incoming?.sourceProfileId || incoming?.id || "").trim();
    if (!sourceProfileId) throw new Error("Imported profile must have a stable profile.id");
    const portableProfileId = String(incoming?.portableProfileId || "").trim();
    const unresolvedLegacyIdentity = !portableProfileId && sourceProfileId === "student-default";
    if (unresolvedLegacyIdentity && !options.bindProfileId && options.createNewLegacy !== true) {
      const error = new Error("旧版报告只有 student-default，无法确认跨设备学生身份；请明确绑定花名册成员或建立新学生。");
      error.code = "unresolved-legacy-identity";
      throw error;
    }
    let profile = options.bindProfileId
      ? state.profiles.find((item) => item.id === String(options.bindProfileId))
      : state.profiles.find((item) => {
        if (portableProfileId) return item.portableProfileId === portableProfileId;
        if (unresolvedLegacyIdentity) return false;
        return item.sourceProfileId === sourceProfileId || item.studentNumber === sourceProfileId;
      });
    if (options.bindProfileId && !profile) throw new Error("所选学生档案不存在，未导入任何记录。");
    const profileAction = profile ? "updated" : "created";
    if (!profile) {
      profile = normalizeProfile({
        ...incoming,
        id: createId("profile"),
        portableProfileId: portableProfileId || createPortableProfileId(),
        sourceProfileId: unresolvedLegacyIdentity ? "" : sourceProfileId,
        identityStatus: "resolved",
        dataSource: "report-import",
        role: "student",
        createdAt: incoming.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      state.profiles.push(profile);
    } else {
      // Keep the local profile id and local learning records. Only profile
      // metadata is refreshed, with the source identity retained.
      profile = normalizeProfile({
        ...profile,
        name: incoming.name || profile.name,
        grade: incoming.grade || profile.grade,
        goal: incoming.goal || profile.goal,
        analysisNote: incoming.analysisNote || profile.analysisNote,
        portableProfileId: portableProfileId || profile.portableProfileId,
        sourceProfileId: unresolvedLegacyIdentity ? profile.sourceProfileId : sourceProfileId,
        id: profile.id,
        role: profile.role,
        createdAt: profile.createdAt,
        updatedAt: new Date().toISOString()
      });
      state.profiles[state.profiles.findIndex((item) => item.id === profile.id)] = profile;
    }

    const result = { profile, profileAction, collections: {} };
    result.collections.attempts = mergeImportedCollection(
      state, "attempts", payload.attempts, profile.id, "attempt", normalizeAttemptEvidence
    );
    result.collections.diagnosticAttempts = mergeImportedCollection(
      state, "diagnosticAttempts", payload.diagnosticAttempts, profile.id, "diagnostic"
    );
    result.collections.examRecords = mergeImportedCollection(
      state, "examRecords", payload.examRecords, profile.id, "exam", normalizeExamRecord
    );
    result.collections.growthRecords = mergeImportedCollection(
      state, "growthRecords", payload.growthRecords, profile.id, "growth"
    );
    result.collections.experimentRecords = mergeImportedCollection(
      state, "experimentRecords", payload.experimentRecords, profile.id, "experiment"
    );
    result.collections.feynmanExplanations = mergeImportedCollection(
      state, "feynmanExplanations", payload.feynmanExplanations, profile.id, "feynman", normalizeFeynmanExplanation
    );
    result.collections.learningPlans = mergeImportedCollection(
      state, "learningPlans", payload.learningPlans, profile.id, "learning-plan"
    );
    result.collections.assessmentSessions = mergeImportedCollection(
      state, "assessmentSessions", payload.assessmentSessions, profile.id, "placement", normalizeAssessmentSession
    );
    result.collections.variantAttempts = mergeImportedCollection(
      state, "variantAttempts", payload.variantAttempts, profile.id, "variant-attempt", normalizeVariantAttempt
    );
    const importedVariantSets = (Array.isArray(payload.variantSets) ? payload.variantSets : [])
      .map(normalizeVariantSet)
      .filter(Boolean);
    let variantSetsAdded = 0;
    importedVariantSets.forEach((set) => {
      const existing = (state.variantSets || []).find((item) => item.id === set.id || (set.cacheKey && item.cacheKey === set.cacheKey));
      if (!existing) {
        state.variantSets.push({ ...set, importedForProfileId: profile.id, importedAt: new Date().toISOString() });
        variantSetsAdded += 1;
      }
    });
    result.collections.variantSets = { added: importedVariantSets.slice(0, variantSetsAdded), skipped: [], conflicts: [], errors: [] };
    const reviewRecords = payload.reviews && typeof payload.reviews === "object"
      ? Object.values(payload.reviews).map((review) => ({ ...review, id: review.id || review.questionId }))
      : [];
    const reviewResult = mergeImportedCollection(
      state, "_importedReviews", reviewRecords, profile.id, "review"
    );
    if (reviewResult.added.length) {
      reviewResult.added.forEach((review) => {
        state.reviews[`${profile.id}::${review.questionId}`] = { ...review, profileId: profile.id };
      });
    }
    delete state._importedReviews;
    result.collections.reviews = reviewResult;
    state.activeProfileId = profile.id;
    return result;
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
        evidence: `建模记录完整度（规则值） ${Number(attempt.modelScore?.total) || 0} · 信心 ${attempt.confidenceBefore}→${attempt.confidenceAfter}`
      }));
    return [...manual, ...exams, ...attempts]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  }

  function studentAnalysis(state, questions = [], profileId = state.activeProfileId, options = {}) {
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const summary = options.summary || summarizeLearning(state, questions, profileId);
    const topics = summary.topics;
    const knowledgePoints = Array.isArray(options.knowledgePoints)
      ? options.knowledgePoints
      : topicEvidenceProfile(state, questions, profileId);
    const evidenceCoverage = options.evidenceCoverage || knowledgePointEvidenceSummary(
      state,
      questions,
      profileId,
      Date.now(),
      { evidenceProfile: knowledgePoints }
    );
    const profileAttempts = state.attempts.filter((attempt) => attempt.profileId === profileId);
    const knowledgePointCounts = knowledgePoints.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, { "证据不足": 0, "需巩固": 0, "基本掌握": 0, "可迁移": 0 });
    const sufficientlyScoredTopics = topics.filter((topic) => topic.scoredCount >= 3);
    const strongest = sufficientlyScoredTopics.slice()
      .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || b.attempts - a.attempts)
      .slice(0, 3);
    const exams = state.examRecords
      .filter((record) => record.profileId === profileId)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
    const examWeakCounts = new Map();
    exams.slice(-10).forEach((record) => (record.weakTopics || []).forEach((topic, index) => {
      const topicKey = record.weakTopicKeys?.[index] || topicKeyForLabel(topic);
      const current = examWeakCounts.get(topicKey) || { label: topic, count: 0 };
      current.count += 1;
      examWeakCounts.set(topicKey, current);
    }));
    const combinedWeak = new Map(sufficientlyScoredTopics.map((topic) => [topic.topicKey || topicKeyForLabel(topic.topic), {
      ...topic,
      evidenceSource: "practice",
      examMentions: examWeakCounts.get(topic.topicKey || topicKeyForLabel(topic.topic))?.count || 0
    }]));
    const weakest = [...combinedWeak.values()]
      .filter((topic) => topic.accuracy < 70 || topic.averageHint >= 3
        || (topic.examMentions > 0 && topic.accuracy < 80))
      .sort((a, b) => {
        const aRisk = (a.scoredCount ? 100 - a.averageScore : (a.pendingReviewCount ? 0 : 35)) + a.examMentions * 15;
        const bRisk = (b.scoredCount ? 100 - b.averageScore : (b.pendingReviewCount ? 0 : 35)) + b.examMentions * 15;
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
      if (topic.modelingRecordNeedsCheck) causes.push("需要检查建模记录");
      if (topic.accuracy !== null && topic.accuracy < 60) causes.push("近期已评分正确率较低");
      priorities.push(`${topic.topic}：${causes.join("、") || "需要增加独立提取练习"}`);
    });
    if (!priorities.length) priorities.push("优先补充每个知识点至少 3 条已评分作答，再判断薄弱或相对稳定");
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
      knowledgePoints,
      abilityProfile: {
        knowledgePointCounts,
        questionTypes: countedLabels(profileAttempts.map((attempt) => {
          return normalizeQuestionType(attempt.questionType || attempt.examQuestionType);
        })),
        errorTypes: countedLabels(profileAttempts.map((attempt) => normalizeErrorType(attempt.errorType))),
        closedLoop: summary.closedLoop,
        evidenceRule: "知识点结论同时参考样本量、最近证据、正确率、提示依赖、建模表现、跨日独立正确和迁移成功；证据不足时不作掌握结论。"
      },
      evidenceCoverage,
      evidenceLevel: evidenceCoverage.levelLabel,
      conclusion: summary.completed
        ? `当前分析基于 ${summary.submittedCount} 次正式作答（已评分 ${summary.scoredCount} 次${summary.pendingReviewCount ? `，待人工复核 ${summary.pendingReviewCount} 次` : ""}）、${exams.length} 次试卷记录；优先级由可评分正确率、提示依赖、建模记录完整度（规则值）和复习到期情况共同确定。`
        : "当前尚无正式作答证据，不能形成可靠的薄弱环节判断。",
      boundary: "本报告是本机学习行为的形成性分析，不是标准化能力诊断；少量记录、人工评分题和上传材料仍需教师复核。"
    };
  }

  /**
   * Build a deterministic, evidence-traceable diagnosis from the records that
   * are actually stored for one student.  This is deliberately descriptive:
   * no psychological or standardized-score inference is made.  A knowledge
   * point is considered sample-sufficient only when at least three scored
   * observations exist; pending manual reviews remain visible in submitted
   * counts but never enter accuracy or trend calculations.
   */
  function buildStudentLearningDiagnosis(state, questions = [], profileId = state.activeProfileId) {
    const questionMap = new Map((Array.isArray(questions) ? questions : []).map((question) => [question.id, question]));
    const attempts = (Array.isArray(state?.attempts) ? state.attempts : [])
      .filter((attempt) => attempt?.profileId === profileId)
      .map((attempt) => normalizeAttemptEvidence(attempt));
    const scored = attempts.filter(isValidAccuracyEvidence);
    const pendingReviewCount = attempts.filter(isPendingManualReview).length;
    const correctCount = scored.filter((attempt) => attempt.grading?.status === "correct").length;
    const overall = {
      submittedCount: attempts.length,
      scoredCount: scored.length,
      correctCount,
      pendingReviewCount,
      accuracy: scored.length ? Math.round(correctCount / scored.length * 100) : null
    };
    const groups = new Map();
    for (const attempt of attempts) {
      const question = questionMap.get(attempt.questionId);
      const knowledgePointId = String(
        attempt.knowledgePointId
          || question?.knowledgePointId
          || attempt.topicKey
          || question?.topicKey
          || topicKeyForLabel(attempt.topic || question?.topic || "")
          || "unresolved"
      ).trim() || "unresolved";
      const label = String(question?.topic || attempt.topic || "未标注知识点").trim() || "未标注知识点";
      const current = groups.get(knowledgePointId) || {
        knowledgePointId,
        label,
        attempts: [],
        evidenceIds: [],
        scoredEvidenceIds: [],
        submittedCount: 0,
        scoredCount: 0,
        correctCount: 0,
        pendingReviewCount: 0,
        wrongCount: 0,
        durationSeconds: [],
        errorCounts: new Map()
      };
      current.attempts.push(attempt);
      current.submittedCount += 1;
      if (attempt.id) current.evidenceIds.push(String(attempt.id));
      if (isPendingManualReview(attempt)) current.pendingReviewCount += 1;
      if (isValidAccuracyEvidence(attempt)) {
        current.scoredCount += 1;
        if (attempt.id) current.scoredEvidenceIds.push(String(attempt.id));
        if (attempt.grading?.status === "correct") current.correctCount += 1;
        else current.wrongCount += 1;
      }
      const duration = Number(attempt.durationSeconds);
      if (Number.isFinite(duration) && duration >= 0) current.durationSeconds.push(duration);
      const errorType = String(attempt.errorType || "").trim();
      if (errorType && isValidAccuracyEvidence(attempt) && attempt.grading?.status !== "correct") {
        current.errorCounts.set(errorType, (current.errorCounts.get(errorType) || 0) + 1);
      }
      groups.set(knowledgePointId, current);
    }
    const dateValue = (attempt) => {
      const value = new Date(attempt.completedAt || attempt.createdAt || 0).getTime();
      return Number.isFinite(value) ? value : 0;
    };
    const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    const topicResults = [...groups.values()].map((group) => {
      const ordered = group.attempts.slice().sort((a, b) => dateValue(a) - dateValue(b));
      const orderedScored = ordered.filter(isValidAccuracyEvidence);
      const split = Math.ceil(orderedScored.length / 2);
      const earlier = orderedScored.slice(0, split);
      const recent = orderedScored.slice(split);
      const accuracyOf = (records) => records.length
        ? Math.round(records.filter((attempt) => attempt.grading?.status === "correct").length / records.length * 100)
        : null;
      const historicalAccuracy = accuracyOf(orderedScored);
      const recentAccuracy = accuracyOf(recent.length ? recent : orderedScored.slice(-3));
      const pairedBefore = [];
      const pairedAfter = [];
      const usedBefore = new Set();
      for (const after of recent) {
        const match = earlier.find((before) => !usedBefore.has(before.id)
          && dateValue(before) < dateValue(after)
          && localDateKey(before.completedAt || before.createdAt) !== localDateKey(after.completedAt || after.createdAt)
          && isComparableQuestionPair(questionMap.get(before.questionId), questionMap.get(after.questionId)));
        if (!match) continue;
        usedBefore.add(match.id);
        pairedBefore.push(match);
        pairedAfter.push(after);
      }
      const pairedPreAccuracy = accuracyOf(pairedBefore);
      const pairedPostAccuracy = accuracyOf(pairedAfter);
      const trend = orderedScored.length < 3
        ? "insufficient"
        : !pairedBefore.length ? "unmatched"
          : pairedPostAccuracy > pairedPreAccuracy ? "improving"
            : pairedPostAccuracy < pairedPreAccuracy ? "declining" : "stable";
      const repeatedErrorCount = [...group.errorCounts.values()]
        .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
      const lastPracticeAt = ordered.length ? (ordered.at(-1).completedAt || ordered.at(-1).createdAt || null) : null;
      const risk = group.scoredCount
        ? (100 - (group.correctCount / group.scoredCount * 100)) + repeatedErrorCount * 12 + group.pendingReviewCount * 2
        : group.pendingReviewCount ? 1 : 0;
      return {
        knowledgePointId: group.knowledgePointId,
        label: group.label,
        attemptCount: group.attempts.length,
        submittedCount: group.submittedCount,
        scoredCount: group.scoredCount,
        correctCount: group.correctCount,
        pendingReviewCount: group.pendingReviewCount,
        accuracy: group.scoredCount ? Math.round(group.correctCount / group.scoredCount * 100) : null,
        recentAccuracy,
        historicalAccuracy,
        pairedPreAccuracy,
        pairedPostAccuracy,
        matchedPairCount: pairedBefore.length,
        matchedEvidenceIds: pairedBefore.map((item) => item.id)
          .concat(pairedAfter.map((item) => item.id)).filter(Boolean),
        comparisonReason: trend === "unmatched"
          ? "题目未配平：尚无不同题目、跨日期且知识点、难度、模型或等价组可比的前后证据。"
          : trend === "insufficient" ? "本知识点不足 3 条已评分证据。" : "",
        wrongCount: group.wrongCount,
        repeatedErrorCount,
        lastPracticeAt,
        averageDurationSeconds: average(group.durationSeconds),
        recentAverageDurationSeconds: average(ordered.slice(-3).map((attempt) => Number(attempt.durationSeconds)).filter((value) => Number.isFinite(value) && value >= 0)),
        trend,
        evidenceIds: group.evidenceIds,
        scoredEvidenceIds: group.scoredEvidenceIds,
        dominantErrorTypes: [...group.errorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
        risk
      };
    }).sort((a, b) => b.risk - a.risk || b.attemptCount - a.attemptCount || a.label.localeCompare(b.label));
    const priorities = topicResults
      .filter((item) => item.scoredCount > 0 || item.pendingReviewCount > 0)
      .slice(0, 3)
      .map((item) => ({
        knowledgePointId: item.knowledgePointId,
        label: item.label,
        evidenceIds: item.scoredEvidenceIds.length ? item.scoredEvidenceIds.slice() : item.evidenceIds.slice(),
        reason: item.scoredCount === 0
          ? "当前只有待人工复核记录，先完成教师复核后再作判断。"
          : `已评分 ${item.scoredCount} 题，正确 ${item.correctCount} 题，正确率 ${item.accuracy}%${item.repeatedErrorCount ? `；重复错误 ${item.repeatedErrorCount} 次` : ""}。`
      }));
    const sampleStatus = overall.scoredCount >= 3 ? "sufficient" : "insufficient";
    return {
      profileId,
      generatedAt: new Date().toISOString(),
      sampleStatus,
      overall,
      knowledgePoints: topicResults,
      priorities,
      recommendation: priorities.length
        ? `下一阶段优先复习：${priorities.map((item) => item.label).join("、")}`
        : "先完成至少三条可评分作答，形成可分析证据。",
      boundary: sampleStatus === "insufficient"
        ? "当前样本不足，暂不做稳定结论；待人工复核记录不计入正确率。"
        : "本诊断仅基于软件已保存的作答记录，属于描述性学习反馈，不是标准化测评或人格判断。"
    };
  }

  function buildStudentFormativeReport(state, questions = [], profileId = state.activeProfileId) {
    const diagnosis = buildStudentLearningDiagnosis(state, questions, profileId);
    const knowledgePoints = diagnosis.knowledgePoints || [];
    const stable = knowledgePoints
      .filter((item) => item.scoredCount >= 3 && item.accuracy >= 80 && item.trend !== "declining")
      .slice(0, 3);
    const needsWork = knowledgePoints
      .filter((item) => item.scoredCount >= 3 && (item.accuracy < 70 || item.repeatedErrorCount > 0))
      .slice(0, 3);
    const insufficient = knowledgePoints
      .filter((item) => item.scoredCount < 3)
      .slice(0, 5);
    const repeatedErrors = knowledgePoints
      .filter((item) => item.repeatedErrorCount > 0)
      .slice(0, 3)
      .map((item) => ({
        knowledgePointId: item.knowledgePointId,
        label: item.label,
        repeatedErrorCount: item.repeatedErrorCount,
        dominantErrorTypes: item.dominantErrorTypes,
        evidenceIds: item.scoredEvidenceIds
      }));
    const recentTrend = knowledgePoints
      .filter((item) => item.trend !== "insufficient")
      .slice(0, 5)
      .map((item) => ({
        knowledgePointId: item.knowledgePointId,
        label: item.label,
        trend: item.trend,
        historicalAccuracy: item.historicalAccuracy,
        recentAccuracy: item.recentAccuracy,
        pairedPreAccuracy: item.pairedPreAccuracy,
        pairedPostAccuracy: item.pairedPostAccuracy,
        matchedPairCount: item.matchedPairCount,
        comparisonReason: item.comparisonReason,
        evidenceIds: item.matchedEvidenceIds.length ? item.matchedEvidenceIds : item.scoredEvidenceIds
      }));
    const nextActions = [];
    const dueCount = reviewsForProfile(state, profileId)
      .filter((review) => new Date(review.dueAt || 0).getTime() <= Date.now()).length;
    if (dueCount) nextActions.push({
      actionId: "review.due",
      label: `先完成 ${dueCount} 道到期复习`,
      reason: "到期复习来自既有复习调度，必须重新真实作答后才会更新间隔。",
      evidenceIds: reviewsForProfile(state, profileId).filter((review) => new Date(review.dueAt || 0).getTime() <= Date.now()).map((review) => review.questionId)
    });
    needsWork.forEach((item) => {
      if (nextActions.length >= 3) return;
      nextActions.push({
        actionId: "training.topic",
        knowledgePointId: item.knowledgePointId,
        label: `用 3 题巩固“${item.label}”`,
        reason: `已评分 ${item.scoredCount} 题，正确 ${item.correctCount} 题${item.repeatedErrorCount ? `，重复错误 ${item.repeatedErrorCount} 次` : ""}。`,
        evidenceIds: item.scoredEvidenceIds
      });
    });
    if (!nextActions.length) nextActions.push({
      actionId: "practice.collect-evidence",
      label: "完成一组独立作答，补充可评分证据",
      reason: diagnosis.overall.scoredCount < 3
        ? "当前样本不足，暂不做稳定结论。"
        : "当前没有达到产品规则的明确薄弱项，继续保持广覆盖练习。",
      evidenceIds: []
    });
    return {
      profileId,
      generatedAt: new Date().toISOString(),
      currentLearning: knowledgePoints.slice(0, 8).map((item) => ({
        knowledgePointId: item.knowledgePointId,
        label: item.label,
        submittedCount: item.submittedCount,
        scoredCount: item.scoredCount,
        lastPracticeAt: item.lastPracticeAt,
        evidenceIds: item.evidenceIds
      })),
      stable,
      needsWork,
      insufficient,
      repeatedErrors,
      recentTrend,
      nextActions: nextActions.slice(0, 3),
      overall: diagnosis.overall,
      sampleStatus: diagnosis.sampleStatus,
      boundary: diagnosis.boundary,
      evidenceRule: "正确率只使用已评分证据；待人工复核不进入分母。知识点至少有 3 条已评分证据后才进入相对稳定或需巩固候选。本规则是形成性产品规则，不是标准化测评阈值。"
    };
  }

  function dailyTest(state, questions = [], options = {}) {
    const profileId = options.profileId || state.activeProfileId;
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    const count = Math.max(1, Math.min(8, Number(options.count) || 5));
    const dateKey = String(options.date || localCalendarDateKey());
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
       generationRule: "默认5题、最多8题：优先选取到期复习、本人近期错题、试卷薄弱点或高提示依赖题；如建模记录需要检查，只作为复核线索，不单独判定知识点薄弱；再补当前年级迁移题。"
    };
  }

  function activeLearningPlan(state, profileId = state.activeProfileId) {
    return state.learningPlans
      .filter((plan) => plan.profileId === profileId && plan.status === "active")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
  }

  function learningPlanProgress(state, plan, now = Date.now()) {
    if (!plan) return {
      completed: 0,
      total: 0,
      percent: 0,
      completedQuestionIds: [],
      sessions: [],
      currentSession: null,
      currentSessionIndex: -1,
      currentQuestionIds: []
    };
    const startedAt = new Date(plan.createdAt || 0).getTime();
    const completedQuestionIds = [...new Set(state.attempts
      .filter((attempt) => {
        return attempt.profileId === plan.profileId
          && plan.questionIds.includes(attempt.questionId)
          && new Date(attempt.createdAt || attempt.completedAt || 0).getTime() >= startedAt;
      })
      .map((attempt) => attempt.questionId))];
    const completedSet = new Set(completedQuestionIds);
    const sourceSessions = Array.isArray(plan.sessions) && plan.sessions.length
      ? plan.sessions
      : [{
        id: "legacy-session",
        sequence: 1,
        title: "专项训练",
        questionIds: Array.isArray(plan.questionIds) ? plan.questionIds : [],
        expectedMinutes: Math.max(1, Math.min(15, Number(plan.expectedMinutes) || 15)),
        dueAt: ""
      }];
    let previousRequiredCompleted = true;
    const sessions = sourceSessions.map((session, index) => {
      const questionIds = [...new Set((session.questionIds || []).filter((id) => plan.questionIds.includes(id)))];
      const completedIds = questionIds.filter((id) => completedSet.has(id));
      const required = questionIds.length > 0 && session.status !== "not-required";
      const completed = required && completedIds.length === questionIds.length;
      const dueAt = new Date(session.dueAt || 0).getTime();
      let status = "not-required";
      if (required && completed) status = "completed";
      else if (required && !previousRequiredCompleted) status = "locked";
      else if (required && Number.isFinite(dueAt) && dueAt > Number(now)) status = "scheduled";
      else if (required) status = "ready";
      if (required) previousRequiredCompleted = completed;
      return {
        ...session,
        sequence: Number(session.sequence) || index + 1,
        questionIds,
        completedQuestionIds: completedIds,
        completedCount: completedIds.length,
        totalCount: questionIds.length,
        status,
        available: status === "ready"
      };
    });
    const currentSessionIndex = sessions.findIndex((session) => !["completed", "not-required"].includes(session.status));
    const currentSession = currentSessionIndex >= 0 ? sessions[currentSessionIndex] : null;
    return {
      completed: completedQuestionIds.length,
      total: plan.questionIds.length,
      percent: plan.questionIds.length
        ? Math.round(completedQuestionIds.length / plan.questionIds.length * 100)
        : 0,
      completedQuestionIds,
      sessions,
      currentSession,
      currentSessionIndex,
      currentQuestionIds: currentSession?.questionIds || [],
      currentSessionAvailable: Boolean(currentSession?.available),
      currentExpectedMinutes: currentSession?.expectedMinutes || 0
    };
  }

  function questionModelKey(question = {}) {
    return String(question.modelDefinitionId || question.modelFamilyId || question.retestGroupId || "").trim();
  }

  function isComparableQuestionPair(beforeQuestion, afterQuestion) {
    if (!beforeQuestion || !afterQuestion || beforeQuestion.id === afterQuestion.id) return false;
    const beforeModel = questionModelKey(beforeQuestion);
    const afterModel = questionModelKey(afterQuestion);
    const sameModel = Boolean(beforeModel && afterModel && beforeModel === afterModel);
    const sameRetestGroup = Boolean(beforeQuestion.retestGroupId
      && afterQuestion.retestGroupId
      && beforeQuestion.retestGroupId === afterQuestion.retestGroupId);
    const explicitlyParallel = Boolean(beforeQuestion.parallelEquivalent
      || afterQuestion.parallelEquivalent
      || beforeQuestion.equivalentGroupId && beforeQuestion.equivalentGroupId === afterQuestion.equivalentGroupId);
    const difficultyA = String(beforeQuestion.difficulty || "").trim();
    const difficultyB = String(afterQuestion.difficulty || "").trim();
    const sameDifficulty = difficultyA && difficultyB && difficultyA === difficultyB;
    return (sameModel || sameRetestGroup || explicitlyParallel) && (sameDifficulty || explicitlyParallel);
  }

  function buildComparableInterventionOutcome(state, plan, questions = []) {
    const currentPlan = plan && typeof plan === "object" ? plan : {};
    const profileId = currentPlan.profileId || state.activeProfileId;
    const questionMap = new Map((Array.isArray(questions) ? questions : []).map((question) => [question.id, question]));
    const focusLabels = Array.isArray(currentPlan.focusTopics) ? currentPlan.focusTopics : [];
    const rawFocusKeys = Array.isArray(currentPlan.focusTopicKeys) && currentPlan.focusTopicKeys.length
      ? currentPlan.focusTopicKeys
      : focusLabels.map(topicKeyForLabel);
    const focusKeys = new Set(rawFocusKeys.map((key, index) => resolveKnowledgePointIdentity({
      knowledgePointId: key,
      label: focusLabels[index] || ""
    }).id).filter(Boolean));
    const attemptTopicKey = (attempt) => {
      const question = questionMap.get(attempt.questionId);
      return resolveKnowledgePointIdentity({
        label: attempt.topic || question?.topic,
        knowledgePointId: attempt.knowledgePointId || attempt.topicKey || question?.knowledgePointId
      }).id || topicKeyForQuestion(question || attempt);
    };
    const matchesTopic = (attempt) => {
      if (!focusKeys.size) return true;
      return focusKeys.has(attemptTopicKey(attempt));
    };
    const attempts = state.attempts.filter((attempt) => attempt.profileId === profileId && matchesTopic(attempt));
    const valid = attempts.filter(isValidAccuracyEvidence);
    const pendingReviewCount = attempts.filter(isPendingManualReview).length;
    const createdAt = new Date(currentPlan.createdAt || currentPlan.generatedAt || 0).getTime();
    const explicitBaseline = new Set(Array.isArray(currentPlan.baselineEvidenceIds) ? currentPlan.baselineEvidenceIds : []);
    const explicitRetest = new Set(Array.isArray(currentPlan.retestEvidenceIds) ? currentPlan.retestEvidenceIds : []);
    const before = valid.filter((attempt) => explicitBaseline.size
      ? explicitBaseline.has(attempt.id)
      : Number.isFinite(createdAt) && new Date(attempt.completedAt || attempt.createdAt || 0).getTime() < createdAt);
    const post = valid.filter((attempt) => explicitRetest.size
      ? explicitRetest.has(attempt.id)
      : Number.isFinite(createdAt) && new Date(attempt.completedAt || attempt.createdAt || 0).getTime() >= createdAt);
    const pairs = [];
    const usedBefore = new Set();
    const usedAfter = new Set();
    post.slice().sort((a, b) => new Date(a.completedAt || a.createdAt || 0) - new Date(b.completedAt || b.createdAt || 0)).forEach((after) => {
      const afterQuestion = questionMap.get(after.questionId);
      const candidate = before
        .filter((item) => !usedBefore.has(item.id) && !usedAfter.has(after.id))
        .map((item) => ({ item, question: questionMap.get(item.questionId) }))
        .filter(({ item, question }) => attemptTopicKey(item) === attemptTopicKey(after)
          && isComparableQuestionPair(question, afterQuestion))
        .sort((a, b) => new Date(b.item.completedAt || b.item.createdAt || 0) - new Date(a.item.completedAt || a.item.createdAt || 0))[0];
      if (candidate) {
        usedBefore.add(candidate.item.id);
        usedAfter.add(after.id);
        pairs.push({ beforeEvidenceId: candidate.item.id, retestEvidenceId: after.id });
      }
    });
    const pairedBefore = pairs.map((pair) => before.find((item) => item.id === pair.beforeEvidenceId)).filter(Boolean);
    const pairedAfter = pairs.map((pair) => post.find((item) => item.id === pair.retestEvidenceId)).filter(Boolean);
    const accuracy = (items) => items.length
      ? Math.round(items.filter((item) => item.grading?.status === "correct").length / items.length * 100)
      : null;
    const preAccuracy = accuracy(pairedBefore);
    const postAccuracy = accuracy(pairedAfter);
    const pairDates = new Set(pairs.flatMap((pair) => {
      const beforeItem = before.find((item) => item.id === pair.beforeEvidenceId);
      const afterItem = post.find((item) => item.id === pair.retestEvidenceId);
      return [beforeItem, afterItem].map((item) => localDateKey(item?.completedAt || item?.createdAt)).filter(Boolean);
    }));
    let comparisonStatus = "insufficient";
    let comparisonReason = "前后均需至少一条同一专项、已评分且可配对的证据。";
    if (!before.length || !post.length) {
      comparisonStatus = "insufficient";
      comparisonReason = "目前只有单侧有效证据，需完成另一侧复测后再比较。";
    } else if (!pairs.length) {
      comparisonStatus = "unmatched";
      comparisonReason = "前后都有已评分记录，但没有满足知识点、模型/等价组、难度和题目独立性要求的配对。";
    } else if (pairs.length < INTERVENTION_COMPARISON_RULE.minimumMatchedPairs
      || pairDates.size < INTERVENTION_COMPARISON_RULE.minimumDistinctDates) {
      comparisonStatus = "emerging";
      comparisonReason = `已找到 ${pairs.length} 对可比证据，但产品规则要求至少 ${INTERVENTION_COMPARISON_RULE.minimumMatchedPairs} 对且覆盖至少 ${INTERVENTION_COMPARISON_RULE.minimumDistinctDates} 个不同日期后才计算百分点变化；该规则不是标准化测评阈值。`;
    } else {
      comparisonStatus = "comparable";
      comparisonReason = "已按同知识点、同模型/等价组、相同难度、不同题目且跨日期配对；仅使用配对证据计算变化。";
    }
    const pairedIds = new Set([...pairedBefore, ...pairedAfter].map((item) => item.id));
    const supplementalEvidence = [...before, ...post]
      .filter((item) => !pairedIds.has(item.id))
      .map((item) => item.id);
    return {
      preScoredCount: before.length,
      postScoredCount: post.length,
      pendingReviewCount,
      matchedPairCount: pairs.length,
      pairedPreScoredCount: pairedBefore.length,
      pairedPostScoredCount: pairedAfter.length,
      preAccuracy,
      postAccuracy,
      pairedPreAccuracy: preAccuracy,
      pairedPostAccuracy: postAccuracy,
      pairedDelta: comparisonStatus === "comparable" ? postAccuracy - preAccuracy : null,
      delta: comparisonStatus === "comparable" ? postAccuracy - preAccuracy : null,
      comparisonStatus,
      comparisonReason,
      pairs,
      supplementalEvidence,
      evidenceLevel: comparisonStatus === "comparable" ? "comparable"
        : comparisonStatus === "emerging" ? "emerging" : "insufficient",
      comparisonRule: `configurable:v${INTERVENTION_COMPARISON_RULE.version}; >=${INTERVENTION_COMPARISON_RULE.minimumMatchedPairs} matched pairs and >=${INTERVENTION_COMPARISON_RULE.minimumDistinctDates} dates required; not a standardized assessment threshold`,
      conclusion: comparisonStatus !== "comparable"
        ? "证据不足"
        : postAccuracy >= 80 && postAccuracy >= preAccuracy ? "达标"
          : postAccuracy >= 60 ? "部分达标" : "未达标"
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
    const selectedQuestion = requestedTopic && requestedTopic !== "自动依据学情"
      ? eligible.find((question) => question.topic === requestedTopic)
      : null;
    if (requestedTopic && requestedTopic !== "自动依据学情" && !selectedQuestion && !options.focusTopicKey) {
      throw new Error("所选知识点没有该年级已发布完整题，请重新选择。");
    }
    const requestedKey = String(options.focusTopicKey
      || (requestedTopic.startsWith("kp:") ? requestedTopic : selectedQuestion ? topicKeyForQuestion(selectedQuestion) : "")).trim();
    const focusTopicKey = requestedKey && requestedKey !== "自动依据学情"
      ? requestedKey
      : analysis.weakest[0]?.topicKey || topicKeyForQuestion(eligible[0]);
    const focusTopic = analysis.weakest.find((item) => item.topicKey === focusTopicKey)?.topic
      || eligible.find((question) => topicKeyForQuestion(question) === focusTopicKey)?.topic
      || requestedTopic || eligible[0].topic;
    const topicQuestions = eligible.filter((question) => topicKeyForQuestion(question) === focusTopicKey);
    const pool = topicQuestions.length ? topicQuestions : eligible;
    const questionMap = new Map(eligible.map((question) => [question.id, question]));
    const recentWrong = state.attempts
      .filter((attempt) => attempt.profileId === profileId
        && (attempt.knowledgePointId || attempt.topicKey || topicKeyForLabel(attempt.topic)) === focusTopicKey
        && isValidAccuracyEvidence(attempt)
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
      { profileId, focusTopic, focusTopicKey }
    );
    ranked.forEach((item) => {
      const role = item.question.variantRole;
      const purpose = role === "counter" ? "反例复测"
        : role === "far" ? "迁移复测"
          : "专项复测";
      addQuestion(item.question, purpose, item.reasons[0] || `围绕${focusTopic}补充证据`);
    });
    pool.forEach((question) => addQuestion(question, "专项复测", `补充${focusTopic}的不同模型证据`));

    const sourceWeak = analysis.weakest.find((item) => item.topicKey === focusTopicKey);
    const examMentions = (state.examRecords || [])
      .filter((record) => record.profileId === profileId)
      .slice(-10)
      .reduce((count, record) => count + (record.weakTopicKeys || record.weakTopics || [])
        .filter((key) => resolveKnowledgePointIdentity({ knowledgePointId: key, label: key }).id === focusTopicKey).length, 0);
    const evidenceReason = examMentions
      ? `最近试卷记录提到该知识点 ${examMentions} 次；${sourceWeak?.scoredCount >= 3 ? "结合应用内已评分作答制定专项" : "应用内已评分证据不足，先诊断，不作稳定薄弱结论"}`
      : sourceWeak?.attempts
        ? `已有 ${sourceWeak.attempts} 次作答，${sourceWeak.scoredCount ? `平均得分 ${sourceWeak.averageScore}%` : "尚无可评分证据"}`
        : "当前证据不足，先用少量题完成诊断，不作能力结论";
    const planCreatedAt = new Date().toISOString();
    const baselineEvidenceIds = state.attempts
      .filter((attempt) => attempt.profileId === profileId
        && isValidAccuracyEvidence(attempt)
        && (attempt.knowledgePointId || attempt.topicKey || topicKeyForLabel(attempt.topic)) === focusTopicKey)
      .map((attempt) => attempt.id)
      .slice(-20);
    const selectedRoles = [...new Set(selected.map((item) => item.variantRole).filter(Boolean))];
    const hasFullStructure = ["core", "near", "far", "counter"].every((role) => selectedRoles.includes(role));
    const selectedQuestionIds = selected.map((item) => item.questionId);
    const sessionOneCount = selectedQuestionIds.length <= 3 ? 1 : 2;
    const sessionThreeCount = selectedQuestionIds.length >= 3 ? 1 : 0;
    const sessionOneIds = selectedQuestionIds.slice(0, sessionOneCount);
    const sessionThreeIds = sessionThreeCount ? selectedQuestionIds.slice(-sessionThreeCount) : [];
    const sessionTwoIds = selectedQuestionIds.slice(sessionOneCount, selectedQuestionIds.length - sessionThreeCount);
    const retestDueAt = new Date(Date.now() + 3 * DAY).toISOString();
    const interventionSessions = [
      {
        id: "session-1",
        sequence: 1,
        title: "诊断与母题",
        questionIds: sessionOneIds,
        expectedMinutes: 12,
        status: "ready",
        dueAt: planCreatedAt
      },
      {
        id: "session-2",
        sequence: 2,
        title: "条件变化与迁移",
        questionIds: sessionTwoIds,
        expectedMinutes: 12,
        status: sessionTwoIds.length ? "locked" : "not-required",
        dueAt: ""
      },
      {
        id: "session-3",
        sequence: 3,
        title: "延迟独立复测",
        questionIds: sessionThreeIds,
        expectedMinutes: 10,
        status: sessionThreeIds.length ? "scheduled" : "not-required",
        dueAt: retestDueAt
      }
    ];
    return {
      id: createId("plan"),
      profileId,
      profileName: profile.name,
      grade: profile.grade,
      subject: "物理",
      title: `${focusTopic}专项微循环`,
      focusTopics: [focusTopic],
      focusTopicKeys: [focusTopicKey],
      focusKnowledgePointIds: [focusTopicKey],
      baselineEvidenceIds,
      retestEvidenceIds: [],
      comparisonRule: "同一 focus topic；已评分；不同 questionId；同 modelDefinitionId/retestGroupId 或明确等价；difficulty 相同或明确 parallel/equivalent。",
      comparisonStatus: "insufficient",
      variantCoverage: selectedRoles,
      structureLabel: hasFullStructure ? "母题—近迁移—远迁移—反例" : `当前方案实际包含：${selectedRoles.join("、") || "未标注迁移角色"}`,
      target: hasFullStructure
        ? "用少量题完成母题理解、条件变化、跨情境迁移、反例辨析与延迟复测"
        : `按当前已审核题目完成针对性练习与延迟复测；${profile.grade}尚不宣称具备完整四类迁移题族`,
      evidenceLevel: analysis.evidenceLevel,
      evidenceReason,
      questionIds: selectedQuestionIds,
      items: selected,
      questionCount: selected.length,
      sessions: interventionSessions,
      currentSessionIndex: 0,
      expectedMinutes: interventionSessions[0].expectedMinutes,
      totalExpectedMinutes: interventionSessions
        .filter((session) => session.status !== "not-required")
        .reduce((sum, session) => sum + session.expectedMinutes, 0),
      teacherNote: String(options.teacherNote || "").trim().slice(0, 2000),
      status: "draft",
      generatedAt: new Date().toISOString(),
      createdAt: planCreatedAt,
      updatedAt: new Date().toISOString(),
      selectionRule: hasFullStructure
        ? "严格限定学生年级；优先本人错题、到期复习、试卷薄弱点和低提示独立作答证据；同一模型采用已审核的母题、近迁移、远迁移、反例与复测，不以题量替代诊断。"
        : "严格限定学生年级和已审核完整题；只陈述本次实际题型结构，不用同模板数字变式冒充独立迁移证据。"
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
      confirmationStatus: "teacher-confirmed",
      teacherConfirmedBy: String(plan.teacherConfirmedBy || "local-teacher").slice(0, 120),
      teacherConfirmedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.learningPlans.push(saved);
    return saved;
  }

  function saveSelfDirectedLearningPlan(state, plan) {
    if (!plan || plan.profileId !== state.activeProfileId) {
      throw new Error("学生只能为当前本人档案建立自主训练方案。");
    }
    if (!Array.isArray(plan.questionIds) || !plan.questionIds.length || plan.questionIds.length > 7) {
      throw new Error("自主专项方案题量必须为1至7题。");
    }
    const teacherPlan = state.learningPlans.find((item) => item.profileId === plan.profileId
      && item.status === "active"
      && item.confirmationStatus === "teacher-confirmed");
    if (teacherPlan) {
      throw new Error("当前有教师已确认的专项方案，请先完成该方案。自主训练不会覆盖教师任务。");
    }
    state.learningPlans.forEach((item) => {
      if (item.profileId === plan.profileId
        && item.status === "active"
        && item.confirmationStatus === "student-self-directed") {
        item.status = "replaced";
        item.updatedAt = new Date().toISOString();
      }
    });
    const saved = {
      ...plan,
      status: "active",
      confirmationStatus: "student-self-directed",
      teacherConfirmedBy: "",
      teacherConfirmedAt: "",
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.learningPlans.push(saved);
    return saved;
  }

  function buildTeacherPrescription(state, questions = [], profileIds = []) {
    const selectedProfiles = (state.profiles || []).filter((profile) => profile.role === "student"
      && (!profileIds.length || profileIds.includes(profile.id)));
    const shared = new Map();
    const insufficient = new Map();
    const individualSupport = [];
    const pendingManualReview = [];
    const awaitingRetest = [];
    selectedProfiles.forEach((profile) => {
      const analysis = studentAnalysis(state, questions, profile.id);
      analysis.knowledgePoints.forEach((topic) => {
        const target = topic.code === "reinforce" ? shared : topic.code === "insufficient" ? insufficient : null;
        if (!target) return;
        const current = target.get(topic.topicKey) || { topicKey: topic.topicKey, topic: topic.topic, profileIds: [], evidenceIds: [] };
        current.profileIds.push(profile.id);
        current.evidenceIds.push(...(topic.evidenceIds || []));
        target.set(topic.topicKey, current);
      });
      const priorities = analysis.weakest.slice(0, 3);
      if (priorities.length) individualSupport.push({
        profileId: profile.id,
        profileName: profile.name,
        priorityKnowledgePointIds: priorities.map((item) => item.topicKey),
        evidenceIds: [...new Set(priorities.flatMap((item) => item.evidenceIds || []))],
        suggestedQuestionCount: priorities.some((item) => item.scoredCount >= 4) ? 5 : 3
      });
      const pending = state.attempts.filter((attempt) => attempt.profileId === profile.id && isPendingManualReview(attempt));
      if (pending.length) pendingManualReview.push({ profileId: profile.id, profileName: profile.name, evidenceIds: pending.map((item) => item.id) });
      const activePlan = activeLearningPlan(state, profile.id);
      const progress = learningPlanProgress(state, activePlan);
      if (activePlan && progress.total > 0 && progress.completed >= progress.total) awaitingRetest.push({ profileId: profile.id, profileName: profile.name, planId: activePlan.id });
    });
    const commonWeaknesses = [...shared.values()]
      .filter((item) => item.profileIds.length >= 2)
      .sort((a, b) => b.profileIds.length - a.profileIds.length)
      .map((item) => ({ ...item, profileIds: [...new Set(item.profileIds)], evidenceIds: [...new Set(item.evidenceIds)] }));
    const insufficientKnowledgePoints = [...insufficient.values()]
      .sort((a, b) => b.profileIds.length - a.profileIds.length)
      .map((item) => ({ ...item, profileIds: [...new Set(item.profileIds)], evidenceIds: [...new Set(item.evidenceIds)] }));
    return {
      generatedAt: new Date().toISOString(),
      profileIds: selectedProfiles.map((profile) => profile.id),
      commonWeaknesses,
      insufficientKnowledgePoints,
      individualSupport,
      pendingManualReview,
      awaitingRetest,
      suggestedGroups: commonWeaknesses.slice(0, 5).map((item) => ({
        groupKey: `prescription:${item.topicKey}`,
        title: `${item.topic}临时支持组`,
        profileIds: item.profileIds,
        evidenceIds: item.evidenceIds,
        suggestedPlanSize: item.profileIds.length >= 6 ? 7 : item.profileIds.length >= 3 ? 5 : 3
      })),
      status: "teacher-confirmation-required",
      boundary: "处方由确定性规则基于可追溯证据生成；教师确认前不创建分组、作业或专项方案，AI 不得修改掌握状态或正式评分。"
    };
  }

  function buildTieredAssignmentDraft(state, questions = [], options = {}) {
    const requestedProfiles = Array.isArray(options.profileIds) ? options.profileIds.filter(Boolean) : [];
    const prescription = buildTeacherPrescription(state, questions, requestedProfiles);
    const common = prescription.commonWeaknesses.find((item) => item.profileIds.length >= 2);
    const individual = prescription.individualSupport[0] || null;
    const focusTopicKey = String(options.focusTopicKey || common?.topicKey || individual?.priorityKnowledgePointIds?.[0] || "").trim();
    const studentIds = common?.profileIds?.length ? common.profileIds : individual ? [individual.profileId] : [];
    const studentScope = studentIds.map((profileId) => state.profiles.find((profile) => profile.id === profileId))
      .filter(Boolean)
      .map((profile) => ({
        profileId: profile.id,
        portableProfileId: profile.portableProfileId || "",
        name: profile.name,
        grade: profile.grade
      }));
    const evidenceIds = [...new Set(common?.evidenceIds || individual?.evidenceIds || [])];
    if (!focusTopicKey || !studentScope.length || !evidenceIds.length) {
      return {
        id: createId("tiered-assignment-draft"),
        generatedAt: new Date().toISOString(),
        status: "insufficient-evidence",
        publish: false,
        studentScope,
        knowledgePointIds: focusTopicKey ? [focusTopicKey] : [],
        evidenceIds,
        questionCandidates: [],
        questionIds: [],
        questionCount: 0,
        boundary: "当前没有足够、可追溯且已评分的共同薄弱证据；系统不会用题库数量或 AI 猜测代替教师判断。"
      };
    }
    const count = [3, 5, 7].includes(Number(options.count))
      ? Number(options.count)
      : common?.profileIds?.length >= 6 ? 7 : common?.profileIds?.length >= 3 ? 5 : 3;
    const anchorProfile = state.profiles.find((profile) => profile.id === studentScope[0].profileId);
    let plan;
    try {
      plan = buildTargetedLearningPlan(state, questions, {
        profileId: anchorProfile.id,
        focusTopicKey,
        count,
        teacherNote: options.teacherNote || ""
      });
    } catch {
      plan = null;
    }
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const questionCandidates = (plan?.items || []).map((item) => {
      const question = questionMap.get(item.questionId);
      return {
        id: item.questionId,
        title: String(question?.title || item.questionId),
        grade: String(question?.grade || anchorProfile.grade),
        difficulty: String(question?.difficulty || "未标注"),
        source: String(question?.source || "来源未标注"),
        sourceLicense: String(question?.sourceLicense || "授权状态未标注"),
        knowledgePointId: topicKeyForQuestion(question || { knowledgePointId: focusTopicKey }),
        variantRole: String(item.variantRole || ""),
        reason: String(item.reason || "")
      };
    });
    if (!questionCandidates.length) {
      return {
        id: createId("tiered-assignment-draft"),
        generatedAt: new Date().toISOString(),
        status: "insufficient-evidence",
        publish: false,
        studentScope,
        knowledgePointIds: [focusTopicKey],
        evidenceIds,
        questionCandidates: [],
        questionIds: [],
        questionCount: 0,
        boundary: "已找到薄弱证据，但当前没有适合同年级且已发布的完整题目；不得自动生成未经审核内容。"
      };
    }
    return {
      id: createId("tiered-assignment-draft"),
      generatedAt: new Date().toISOString(),
      status: "teacher-confirmation-required",
      reviewStatus: "教师待审核",
      publish: false,
      title: `${plan.focusTopics[0]}分层专项`,
      studentScope,
      targetProfileIds: studentScope.map((item) => item.profileId),
      knowledgePointIds: [focusTopicKey],
      evidenceIds,
      questionCandidates,
      questionIds: questionCandidates.map((item) => item.id),
      questionCount: questionCandidates.length,
      structureLabel: plan.structureLabel,
      target: plan.target,
      sourcePlanId: plan.id,
      boundary: "候选学生、知识点、题目来源与数量均来自可追溯本机证据；教师确认前不创建作业、不发布内容，AI 不得绕过审核。"
    };
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

  function diagnosticMatchesQuestion(item, question) {
    if (Array.isArray(item.grades) && item.grades.length
      && question.grade && !item.grades.includes(question.grade)) {
      return false;
    }
    const questionTopic = String(question.topic || "").trim();
    const searchable = [
      questionTopic,
      question.title,
      ...(Array.isArray(question.examPoints) ? question.examPoints : [])
    ].filter(Boolean).join(" ");
    return item.topics.some((topic) => searchable.includes(topic)
      || (questionTopic && (questionTopic.includes(topic) || topic.includes(questionTopic))));
  }

  const PLACEMENT_CAPABILITY_DIMENSIONS = Object.freeze([
    "基础概念", "条件判断", "模型识别", "图像/表征理解",
    "实验与探究", "建模", "定量计算", "迁移/反例"
  ]);

  function placementCapabilityTags(question = {}) {
    const questionType = String(question.questionType || question.examQuestionType || "");
    const cognitive = String(question.cognitiveDemand || question.cognitiveRequirement || "");
    const representation = String(question.representationType || "");
    const purpose = String(question.assessmentPurpose || "");
    const searchable = `${question.title || ""} ${question.content || ""} ${questionType} ${cognitive} ${representation} ${purpose}`;
    const tags = new Set();
    if (/基础|概念|判断|辨析/.test(searchable) || question.difficulty === "基础") tags.add("基础概念");
    if (/条件|适用|判断|辨析|反例/.test(searchable)) tags.add("条件判断");
    if (/模型|研究对象|过程|受力|等效|识别/.test(searchable) || /应用/.test(cognitive)) tags.add("模型识别");
    if (/图|图像|图线|图表|电路|光路|受力图|表征/.test(searchable)) tags.add("图像/表征理解");
    if (/实验|探究|测量|误差|操作/.test(searchable)) tags.add("实验与探究");
    if (/建模|研究对象|过程划分|模型/.test(searchable) || /综合|计算/.test(questionType)) tags.add("建模");
    if (/计算|定量|数值|填空/.test(searchable)) tags.add("定量计算");
    if (/迁移|反例|变式|挑战|综合/.test(searchable) || question.difficulty === "挑战") tags.add("迁移/反例");
    return [...tags];
  }

  function generatePlacementDiagnostic(state, questions = [], options = {}) {
    const profileId = options.profileId || state.activeProfileId;
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    if (!profile) throw new Error("未找到要生成摸底卷的学生档案。");
    const requestedCount = Math.max(20, Math.min(30, Number(options.count) || 24));
    const seed = String(options.seed || `${profileId}|${profile.grade}|placement`);
    const scopeType = ["semester", "chapter", "custom"].includes(options.scopeType)
      ? options.scopeType
      : "semester";
    const scopeIds = [...new Set((Array.isArray(options.scopeIds) ? options.scopeIds : [])
      .map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 100);
    const requestedTargets = [...new Set((Array.isArray(options.targetKnowledgePointIds)
      ? options.targetKnowledgePointIds
      : []).map((value) => resolveKnowledgePointIdentity({ knowledgePointId: value }).id).filter(Boolean))];
    const eligible = (Array.isArray(questions) ? questions : []).filter((question) => {
      if (!(isPublishedQuestion(question)
        && question.grade === profile.grade
        && question.grade !== "七年级"
        && String(question.content || "").trim()
        && String(question.answer || "").trim()
        && String(question.solution || "").trim())) return false;
      if (scopeType === "chapter" && scopeIds.length) {
        const chapterIds = [question.curriculumChapterId, question.chapterId, question.chapter]
          .map((value) => String(value || "").trim());
        return scopeIds.some((id) => chapterIds.includes(id));
      }
      if (scopeType === "custom" && (requestedTargets.length || scopeIds.length)) {
        return requestedTargets.includes(topicKeyForQuestion(question))
          || scopeIds.includes(String(question.id || ""));
      }
      if (options.semester && !["", "学期初", "全年级"].includes(String(options.semester))) {
        const semester = String(question.semester || question.book || question.volume || "");
        if (semester && semester !== String(options.semester)) return false;
      }
      return true;
    });
    const diagnosticAnchors = eligible.filter((question) => {
      return question.diagnosticEligible === true || question.evidenceTier === "diagnostic-anchor";
    });
    const diagnosticPool = diagnosticAnchors.length ? diagnosticAnchors : eligible;
    const availableTopics = [...new Set(eligible.map((question) => String(question.knowledgePointId || topicKeyForQuestion(question) || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const relevantDiagnostics = misconceptionCatalog.filter((item) => {
      return eligible.some((question) => diagnosticMatchesQuestion(item, question));
    });
    const diagnosticTarget = relevantDiagnostics.length
      ? Math.min(relevantDiagnostics.length, Math.max(1, Math.min(8, Math.round(requestedCount / 4))))
      : 0;
    const selectedDiagnostics = seededShuffle(relevantDiagnostics, `${seed}|misconceptions`)
      .slice(0, diagnosticTarget);
    // A 20-30 item placement cannot observe the complete course taxonomy.  The
    // blueprint therefore declares a bounded set of core targets before any
    // item is selected.  This is the denominator for this placement only.
    const targetKnowledgePointIds = requestedTargets.length
      ? requestedTargets.filter((id) => availableTopics.includes(id))
      : seededShuffle(availableTopics, `${seed}|blueprint-targets`).slice(
        0,
        Math.min(availableTopics.length, Math.max(1, Math.min(12, requestedCount - diagnosticTarget)))
      );
    const capabilityDimensions = PLACEMENT_CAPABILITY_DIMENSIONS.slice();
    const coveredCapabilities = new Set(selectedDiagnostics.length ? ["基础概念", "条件判断"] : []);
    const items = selectedDiagnostics.map((item) => ({
      id: item.diagnostic.id,
      kind: "misconception-diagnostic",
      questionType: "前概念诊断",
      topic: item.topics[0],
      topics: item.topics.slice(),
      misconceptionCode: item.code,
      diagnostic: item.diagnostic
    }));
    const usedQuestionIds = new Set();
    const coveredTopics = new Set();
    selectedDiagnostics.forEach((item) => {
      eligible.filter((question) => diagnosticMatchesQuestion(item, question))
        .forEach((question) => coveredTopics.add(topicKeyForQuestion(question)));
    });
    const addQuestion = (question) => {
      if (!question || usedQuestionIds.has(question.id) || items.length >= requestedCount) return;
      usedQuestionIds.add(question.id);
      coveredTopics.add(topicKeyForQuestion(question));
      const capabilityTags = placementCapabilityTags(question);
      capabilityTags.forEach((tag) => coveredCapabilities.add(tag));
      items.push({
        id: question.id,
        kind: "bank-question",
        topic: question.topic || "待分类",
        knowledgePointId: question.knowledgePointId || topicKeyForQuestion(question),
        questionType: normalizeQuestionType(question.questionType || question.examQuestionType),
        evidenceTier: question.evidenceTier || "practice-variant",
        modelDefinitionId: question.modelDefinitionId || question.modelFamilyId || "",
        capabilityDimensions: capabilityTags,
        cognitiveRequirement: /实验|探究/.test(String(question.questionType || "")) ? "实验推理"
          : /图|图像|函数/.test(String(question.content || "")) ? "图像理解"
            : question.difficulty === "挑战" ? "迁移"
              : question.difficulty === "进阶" ? "模型识别/条件判断" : "基础概念",
        question
      });
    };
    capabilityDimensions.forEach((dimension) => {
      if (coveredCapabilities.has(dimension)) return;
      const candidate = seededShuffle(
        diagnosticPool.filter((question) => !usedQuestionIds.has(question.id)
          && placementCapabilityTags(question).includes(dimension)),
        `${seed}|capability|${dimension}`
      )[0];
      addQuestion(candidate);
    });
    const topicOrder = seededShuffle(targetKnowledgePointIds, `${seed}|topics`).sort((left, right) => {
      return Number(coveredTopics.has(left)) - Number(coveredTopics.has(right));
    });
    topicOrder.forEach((topic) => {
      const candidates = seededShuffle(
        diagnosticPool.filter((question) => topicKeyForQuestion(question) === topic),
        `${seed}|topic|${topic}`
      );
      addQuestion(candidates[0]);
    });
    seededShuffle([...diagnosticPool, ...eligible.filter((question) => !diagnosticPool.includes(question))], `${seed}|fill`).forEach(addQuestion);

    const coveredTopicList = availableTopics.filter((topic) => coveredTopics.has(topic));
    const coveredBlueprintTargets = targetKnowledgePointIds.filter((topic) => coveredTopics.has(topic));
    const missingTopics = targetKnowledgePointIds.filter((topic) => !coveredTopics.has(topic));
    const longitudinalEvidenceCoverage = knowledgePointEvidenceSummary(state, questions, profileId);
    const missingCapabilityDimensions = capabilityDimensions.filter((dimension) => !coveredCapabilities.has(dimension));
    const warnings = [];
    if (!relevantDiagnostics.length) {
      warnings.push("现有前概念诊断与该年级题库元数据未形成可核对的知识点匹配，本卷未强行加入不确定的前概念题。");
    }
    if (items.length < requestedCount) {
      warnings.push(`现有已发布完整题与匹配前概念题只能提供 ${items.length} 题，少于目标 ${requestedCount} 题。`);
    }
    if (missingTopics.length) {
      warnings.push(`受题量上限或题库覆盖限制，尚未覆盖：${missingTopics.join("、")}。`);
    }
    if (missingCapabilityDimensions.length) {
      warnings.push(`现有题库元数据无法形成以下认知维度证据：${missingCapabilityDimensions.join("、")}；报告必须标记证据不足，不能假定已测。`);
    }
    return {
      id: `placement-${profileId}-${seed.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48)}`,
      profileId,
      grade: profile.grade,
      title: String(options.title || `${profile.grade}入学/学期初物理摸底诊断`).slice(0, 120),
      requestedCount,
      questionCount: items.length,
      targetRange: { minimum: 20, maximum: 30 },
      meetsTargetRange: items.length >= 20 && items.length <= 30,
      targetCountMet: items.length === requestedCount,
      containsMisconceptionDiagnostics: selectedDiagnostics.length > 0,
      misconceptionQuestionCount: selectedDiagnostics.length,
      bankQuestionCount: items.length - selectedDiagnostics.length,
      items,
      // `coverage` is retained for v2.8 readers. New UI must use
      // blueprintCoverage; longitudinal course evidence is a separate metric.
      coverage: {
        availableTopics,
        coveredTopics: coveredTopicList,
        missingTopics,
        coverageRate: availableTopics.length
          ? Math.round(coveredTopicList.length / availableTopics.length * 100)
          : 0,
        complete: availableTopics.length > 0 && missingTopics.length === 0
      },
      warnings,
      generationRule: "仅从当前年级已发布且题干、答案、解析完整的现有题目，以及已收录的前概念诊断中选取；优先覆盖不同知识点，再补足题量。",
      blueprintVersion: "placement-v2",
      scopeType,
      scopeIds,
      blueprint: {
        grade: profile.grade,
        semester: String(options.semester || "学期初"),
        scope: scopeType,
        targetKnowledgePointIds,
        capabilityDimensions,
        minimumObservations: 1,
        preferredQuestionTypes: ["选择题", "填空题", "实验题", "计算题"],
        modelFamilyDiversity: 2
      },
      blueprintCoverage: {
        targetCount: targetKnowledgePointIds.length,
        coveredCount: coveredBlueprintTargets.length,
        coverageRate: targetKnowledgePointIds.length
          ? Math.round(coveredBlueprintTargets.length / targetKnowledgePointIds.length * 100)
          : null,
        coveredKnowledgePointIds: coveredBlueprintTargets,
        missingKnowledgePointIds: missingTopics
      },
      capabilityCoverage: {
        targetCount: capabilityDimensions.length,
        coveredCount: coveredCapabilities.size,
        coverageRate: Math.round(coveredCapabilities.size / capabilityDimensions.length * 100),
        coveredDimensions: capabilityDimensions.filter((dimension) => coveredCapabilities.has(dimension)),
        missingDimensions: missingCapabilityDimensions
      },
      longitudinalEvidenceCoverage,
      diagnosticBlueprint: ["基础概念", "模型识别", "条件判断", "图像理解", "实验推理", "建模", "计算", "迁移"],
      hintsDisabled: true,
      boundary: "摸底结果属于形成性证据；覆盖不足、主观题和前概念判断仍需结合后续作答及教师复核。"
    };
  }

  function placementSessionForProfile(state, profileId = state.activeProfileId) {
    return (Array.isArray(state.assessmentSessions) ? state.assessmentSessions : [])
      .filter((session) => session.type === "placement" && session.profileId === profileId)
      .sort((a, b) => evidenceTimestamp(b.updatedAt || b.createdAt) - evidenceTimestamp(a.updatedAt || a.createdAt))[0] || null;
  }

  function placementEvidenceForSession(state, session) {
    if (!session) return { submittedCount: 0, scoredCount: 0, pendingReviewCount: 0, submittedIds: [] };
    const ids = new Set((session.questionIds || []).map((value) => String(value)));
    const startedAt = evidenceTimestamp(session.startedAt);
    const attempts = (Array.isArray(state.attempts) ? state.attempts : []).filter((attempt) => {
      return attempt.profileId === session.profileId && ids.has(String(attempt.questionId))
        && evidenceTimestamp(attempt.completedAt || attempt.createdAt) >= startedAt;
    });
    const diagnostics = (Array.isArray(state.diagnosticAttempts) ? state.diagnosticAttempts : []).filter((attempt) => {
      return attempt.profileId === session.profileId && ids.has(String(attempt.diagnosticId))
        && evidenceTimestamp(attempt.createdAt) >= startedAt;
    });
    const submittedIds = [...new Set([
      ...attempts.map((attempt) => String(attempt.questionId || "")),
      ...diagnostics.map((attempt) => String(attempt.diagnosticId || ""))
    ].filter(Boolean))];
    return {
      submittedCount: Math.min(ids.size, submittedIds.length),
      scoredCount: attempts.filter(isValidAccuracyEvidence).length + diagnostics.filter((attempt) => typeof attempt.answerCorrect === "boolean").length,
      pendingReviewCount: attempts.filter(isPendingManualReview).length,
      submittedIds
    };
  }

  function placementStatus(state, profileId = state.activeProfileId) {
    const session = placementSessionForProfile(state, profileId);
    if (!session) {
      const hasLegacyEvidence = (state.attempts || []).some((attempt) => attempt.profileId === profileId)
        || (state.diagnosticAttempts || []).some((attempt) => attempt.profileId === profileId)
        || (state.examRecords || []).some((record) => record.profileId === profileId)
        || (state.broadCoverageChecks || []).some((record) => record.profileId === profileId);
      const profile = state.profiles.find((item) => item.id === profileId);
      if (hasLegacyEvidence && profile?.placementBaselineDecision === "use-existing-evidence") {
        return {
          status: "legacy-evidence-accepted",
          session: null,
          label: "未完成正式摸底；教师已选择从现有证据开始教学",
          actionable: false,
          placementCompleted: false,
          legacyDecision: "use-existing-evidence"
        };
      }
      return {
        status: hasLegacyEvidence ? "legacy-unknown" : "not-started",
        session: null,
        label: hasLegacyEvidence ? "需补做摸底" : "开始摸底",
        actionable: true,
        placementCompleted: false
      };
    }
    const evidence = placementEvidenceForSession(state, session);
    const completed = session.status === "completed" || session.status === "needs-review";
    return {
      status: session.status,
      session,
      submittedCount: evidence.submittedCount,
      scoredCount: evidence.scoredCount,
      pendingReviewCount: evidence.pendingReviewCount,
      label: completed ? (session.status === "needs-review" ? "摸底已提交，待复核" : "摸底已完成")
        : session.status === "in-progress" ? "继续摸底" : "开始摸底",
      actionable: !completed,
      placementCompleted: session.status === "completed"
    };
  }

  function startPlacementAssessment(state, blueprint, options = {}) {
    const profileId = String(options.profileId || blueprint?.profileId || state.activeProfileId);
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("未找到摸底学生档案。");
    const source = blueprint && typeof blueprint === "object" ? blueprint : {};
    const questionIds = [...new Set((Array.isArray(source.items) ? source.items : [])
      .map((item) => String(item.id || item.questionId || "").trim()).filter(Boolean))].slice(0, 30);
    if (!questionIds.length) throw new Error("摸底卷没有可作答题目。");
    const existing = placementSessionForProfile(state, profileId);
    if (existing && ["in-progress", "completed", "needs-review"].includes(existing.status)
      && !options.forceNew) return existing;
    const now = new Date().toISOString();
    const session = normalizeAssessmentSession({
      id: createId("placement-session"),
      profileId,
      type: "placement",
      grade: profile.grade,
      scopeType: source.scopeType || options.scopeType || "semester",
      scopeIds: source.scopeIds || options.scopeIds || [],
      blueprintVersion: source.blueprintVersion || "v1",
      questionIds,
      startedAt: now,
      status: "in-progress",
      coverage: source.blueprintCoverage || source.coverage || {},
      createdAt: now,
      updatedAt: now
    });
    if (!Array.isArray(state.assessmentSessions)) state.assessmentSessions = [];
    state.assessmentSessions.push(session);
    return session;
  }

  function refreshPlacementAssessment(state, sessionId) {
    const session = (state.assessmentSessions || []).find((item) => item.id === sessionId);
    if (!session) throw new Error("未找到摸底作答会话。");
    const evidence = placementEvidenceForSession(state, session);
    Object.assign(session, evidence, { updatedAt: new Date().toISOString() });
    if (session.status === "needs-review"
      && evidence.submittedCount >= session.questionIds.length
      && evidence.pendingReviewCount === 0) {
      session.status = "completed";
      session.completedAt = session.completedAt || session.updatedAt;
    }
    return session;
  }

  function completePlacementAssessment(state, sessionId) {
    const session = refreshPlacementAssessment(state, sessionId);
    if (session.submittedCount < session.questionIds.length) {
      throw new Error(`摸底尚未完成：还需完成 ${session.questionIds.length - session.submittedCount} 题。`);
    }
    session.completedAt = new Date().toISOString();
    session.status = session.pendingReviewCount > 0 ? "needs-review" : "completed";
    session.updatedAt = session.completedAt;
    return session;
  }

  function recordBroadCoverageCheck(state, input = {}) {
    const profileId = String(input.profileId || state.activeProfileId);
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("阶段检测对应的学生档案不存在。");
    const questionIds = [...new Set((Array.isArray(input.questionIds) ? input.questionIds : [])
      .map((value) => String(value).trim()).filter(Boolean))].slice(0, 30);
    if (!questionIds.length) throw new Error("阶段检测至少需要一条已完成题目证据。");
    const completedAt = new Date(input.completedAt || Date.now());
    if (Number.isNaN(completedAt.getTime())) throw new Error("阶段检测完成日期无效。");
    const record = {
      id: String(input.id || createId("broad-coverage")).slice(0, 160),
      profileId,
      grade: profile.grade,
      title: String(input.title || `${profile.grade}广覆盖阶段检测`).trim().slice(0, 120),
      questionIds,
      coveredTopics: [...new Set((Array.isArray(input.coveredTopics) ? input.coveredTopics : [])
        .map((value) => String(value).trim().slice(0, 100)).filter(Boolean))],
      coverageComplete: Boolean(input.coverageComplete),
      completedAt: completedAt.toISOString(),
      createdAt: new Date().toISOString()
    };
    if (!Array.isArray(state.broadCoverageChecks)) state.broadCoverageChecks = [];
    state.broadCoverageChecks.push(record);
    if (state.broadCoverageChecks.length > 500) state.broadCoverageChecks.splice(0, state.broadCoverageChecks.length - 500);
    return record;
  }

  function scheduleBroadCoverageCheck(state, questions = [], options = {}) {
    const profileId = options.profileId || state.activeProfileId;
    const profile = state.profiles.find((item) => item.id === profileId) || activeProfile(state);
    if (!profile) throw new Error("未找到阶段检测对应的学生档案。");
    const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
    if (!Number.isFinite(now)) throw new Error("阶段检测调度日期无效。");
    const records = (Array.isArray(state.broadCoverageChecks) ? state.broadCoverageChecks : [])
      .filter((record) => record.profileId === profileId && evidenceTimestamp(record.completedAt) > 0)
      .sort((a, b) => evidenceTimestamp(a.completedAt) - evidenceTimestamp(b.completedAt));
    const last = records.at(-1) || null;
    const profileCreatedAt = evidenceTimestamp(profile.createdAt) || now;
    const anchor = last ? evidenceTimestamp(last.completedAt) : profileCreatedAt;
    const nextDueTimestamp = anchor + BROAD_COVERAGE_INTERVAL_DAYS * DAY;
    const due = now >= nextDueTimestamp;
    const shouldGeneratePreview = options.deferPreview
      ? options.includePreview === true
      : due || options.includePreview;
    const paper = shouldGeneratePreview
      ? generatePlacementDiagnostic(state, questions, {
        profileId,
        count: options.count || 20,
        seed: options.seed || `${profileId}|broad|${localDateKey(nextDueTimestamp)}`,
        title: `${profile.grade}双周广覆盖检测`
      })
      : null;
    return {
      profileId,
      intervalDays: BROAD_COVERAGE_INTERVAL_DAYS,
      due,
      lastCompletedAt: last?.completedAt || null,
      nextDueAt: new Date(nextDueTimestamp).toISOString(),
      daysUntilDue: due ? 0 : Math.ceil((nextDueTimestamp - now) / DAY),
      overdueDays: due ? Math.floor((now - nextDueTimestamp) / DAY) : 0,
      paper,
      rule: "每14天安排一次当前年级广覆盖检测，用于发现尚未进入专项推荐的知识盲区；覆盖不足会在试卷中明确标注。"
    };
  }

  function dateKeyOrdinal(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!match) return null;
    return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY);
  }

  function isClosedLoopAttempt(attempt) {
    const status = attempt?.grading?.status;
    if (!["correct", "incorrect", "partial", "review-required"].includes(status)) return false;
    if (!String(attempt.finalAnswer || "").trim()) return false;
    const hasExplanation = String(attempt.selfExplanation || attempt.reflection || "").trim().length >= 4;
    if (!hasExplanation) return false;
    return status === "correct" || Boolean(normalizeErrorType(attempt.errorType));
  }

  function closedLoopStreak(state, profileId = state.activeProfileId, now = Date.now()) {
    const nowTimestamp = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(nowTimestamp)) throw new Error("连续学习统计日期无效。");
    const eligibleAttempts = state.attempts.filter((attempt) => {
      return attempt.profileId === profileId
        && evidenceTimestamp(attempt.completedAt || attempt.createdAt) <= nowTimestamp
        && isClosedLoopAttempt(attempt);
    });
    const dayKeys = [...new Set(eligibleAttempts
      .map((attempt) => localDateKey(attempt.completedAt || attempt.createdAt))
      .filter(Boolean))]
      .sort((a, b) => dateKeyOrdinal(a) - dateKeyOrdinal(b));
    let running = 0;
    let longestStreak = 0;
    let previousOrdinal = null;
    const earnedDates = new Map();
    dayKeys.forEach((key) => {
      const ordinal = dateKeyOrdinal(key);
      running = previousOrdinal !== null && ordinal === previousOrdinal + 1 ? running + 1 : 1;
      previousOrdinal = ordinal;
      longestStreak = Math.max(longestStreak, running);
      CLOSED_LOOP_BADGES.forEach((badge) => {
        if (running === badge.days && !earnedDates.has(badge.id)) earnedDates.set(badge.id, key);
      });
    });
    const todayOrdinal = dateKeyOrdinal(localDateKey(nowTimestamp));
    const latestOrdinal = dayKeys.length ? dateKeyOrdinal(dayKeys.at(-1)) : null;
    const currentStreak = latestOrdinal !== null && todayOrdinal - latestOrdinal <= 1 ? running : 0;
    return {
      profileId,
      currentStreak,
      longestStreak,
      totalClosedLoopDays: dayKeys.length,
      eligibleAttemptCount: eligibleAttempts.length,
      latestClosedLoopDate: dayKeys.at(-1) || null,
      badges: CLOSED_LOOP_BADGES.map((badge) => ({
        id: badge.id,
        title: badge.title,
        requiredDays: badge.days,
        earned: longestStreak >= badge.days,
        earnedAt: earnedDates.get(badge.id) || null
      })),
      rankingEnabled: false,
      feedbackPolicy: "仅展示本人连续完成闭环学习的记录，不设置积分、排行榜或同伴比较。"
    };
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

  function parseDimensionTerm(term, symbols) {
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
      const match = factor.match(/^([A-Za-z][A-Za-z0-9]*)(?:\^([-+]?\d+))?$/);
      if (!match) {
        unknown.push(factor);
        return;
      }
      const symbol = match[1];
      const power = Number(match[2] || 1) * (operator === "/" ? -1 : 1);
      const source = symbols[symbol];
      if (!source) {
        unknown.push(symbol);
        return;
      }
      dimension = dimensionAdd(dimension, source, power);
    });
    return { dimension, unknown };
  }

  function parseDimensionSide(side, symbols) {
    const terms = side.replace(/\s+/g, "").split(/(?<!\^)(?=[+-])/).filter(Boolean);
    const parsed = terms.map((term) => parseDimensionTerm(term.replace(/^[+-]/, ""), symbols));
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

  function validateDimension(equation, context = {}) {
    const symbols = { ...quantityDimensions };
    delete symbols.p;
    delete symbols.E;
    const semanticDimensions = {
      pressure: quantityDimensions.p, momentum: quantityDimensions.momentum,
      energy: quantityDimensions.E, electricField: quantityDimensions.field,
      speed: quantityDimensions.v
    };
    Object.entries(context.symbols || context.dimensionSymbols || {}).forEach(([symbol, definition]) => {
      const dimension = typeof definition === "string" ? semanticDimensions[definition] || quantityDimensions[definition] : definition;
      if (dimension && typeof dimension === "object" && Object.keys(dimension).every((key) => ["M", "L", "T", "I"].includes(key) && Number.isFinite(dimension[key]))) symbols[symbol] = dimension;
      else delete symbols[symbol];
    });
    const normalized = String(equation || "")
      .replace(/ρ/g, "rho")
      .replace(/λ/g, "lambda")
      .replace(/Δ/g, "")
      .replace(/₀/g, "0");
    const parts = normalized.split("=");
    if (parts.length !== 2) {
      return { valid: false, status: "无法校验", message: "请输入一个只含一个等号的方程，例如 F=m*a。" };
    }
    const left = parseDimensionSide(parts[0], symbols);
    const right = parseDimensionSide(parts[1], symbols);
    const unknown = [...left.unknown, ...right.unknown];
    if (unknown.length) {
      return { valid: null, status: "符号待定义", message: `请先说明这些符号或表达式的含义：${[...new Set(unknown)].join("、")}。` };
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
    const preferredQuestionIds = new Set(Array.isArray(options.preferredQuestionIds) ? options.preferredQuestionIds.map(String) : []);
    const candidates = questions.filter((question) => {
      const topicMatch = !options.topic || options.topic === "全部" || question.topic === options.topic;
      const difficultyMatch = !options.difficulty || options.difficulty === "全部" || question.difficulty === options.difficulty;
      const stageMatch = !options.stage || options.stage === "全部" || question.stage === options.stage;
      const gradeMatch = !options.grade || options.grade === "全部" || question.grade === options.grade;
      return topicMatch && difficultyMatch && stageMatch && gradeMatch && isPublishedQuestion(question);
    });
    const ranked = candidates.sort((a, b) => {
      const difficultyOrder = { 基础: 1, 进阶: 2, 挑战: 3 };
      return (preferredQuestionIds.has(a.id) ? -1 : 0) - (preferredQuestionIds.has(b.id) ? -1 : 0)
        || (difficultyOrder[a.difficulty] || 2) - (difficultyOrder[b.difficulty] || 2)
        || a.title.localeCompare(b.title, "zh-CN");
    });
    const selected = [];
    const ratios = options.difficulty === "全部" && options.difficultyRatios && typeof options.difficultyRatios === "object"
      ? ["基础", "进阶", "挑战"].map((difficulty) => ({ difficulty, weight: Math.max(0, Number(options.difficultyRatios[difficulty]) || 0) }))
      : [];
    const ratioTotal = ratios.reduce((sum, item) => sum + item.weight, 0);
    if (ranked.length && ratioTotal > 0) {
      const quotas = ratios.map((item) => {
        const exact = count * item.weight / ratioTotal;
        return { ...item, exact, quota: Math.floor(exact), fraction: exact - Math.floor(exact) };
      });
      let remainingQuota = count - quotas.reduce((sum, item) => sum + item.quota, 0);
      quotas.slice().sort((a, b) => b.fraction - a.fraction).forEach((item) => {
        if (remainingQuota <= 0) return;
        quotas.find((entry) => entry.difficulty === item.difficulty).quota += 1;
        remainingQuota -= 1;
      });
      quotas.forEach(({ difficulty, quota }) => {
        const pool = ranked.filter((question) => question.difficulty === difficulty && !selected.includes(question));
        const take = Math.min(quota, pool.length);
        if (!take) return;
        const step = pool.length / take;
        for (let index = 0; index < take; index += 1) selected.push(pool[Math.min(pool.length - 1, Math.floor(index * step))]);
      });
      ranked.filter((question) => !selected.includes(question)).slice(0, Math.max(0, count - selected.length)).forEach((question) => selected.push(question));
    } else if (ranked.length) {
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
      difficultyRatios: ratioTotal > 0 ? Object.fromEntries(ratios.map((item) => [item.difficulty, item.weight])) : null,
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
      version: Number(VERSION_SOURCE.reportFormatVersion) || 4,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: {
        id: profile.id,
        portableProfileId: profile.portableProfileId,
        name: profile.name,
        role: profile.role,
        stage: profile.stage,
        grade: profile.grade,
        subject: profile.subject,
        goal: profile.goal,
        analysisNote: profile.analysisNote,
        sourceProfileId: profile.sourceProfileId || profile.id
      },
      summary: {
        completed: summary.completed,
        accuracy: summary.accuracy,
        independenceRate: summary.independenceRate,
        averageHint: summary.averageHint,
        learningMinutes: summary.learningMinutes,
        dueCount: summary.dueCount,
        closedLoop: summary.closedLoop,
        evidenceCoverage: analysis.evidenceCoverage,
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
      diagnosticAttempts: state.diagnosticAttempts.filter((record) => record.profileId === profile.id),
      experimentRecords: state.experimentRecords.filter((record) => record.profileId === profile.id),
      feynmanExplanations: (state.feynmanExplanations || []).filter((record) => record.profileId === profile.id),
      variantSets: (state.variantSets || []).filter((set) => (state.variantAttempts || []).some((record) => record.profileId === profile.id && record.variantSetId === set.id)),
      variantAttempts: (state.variantAttempts || []).filter((record) => record.profileId === profile.id),
      learningPlans: state.learningPlans.filter((record) => record.profileId === profile.id),
      assessmentSessions: (state.assessmentSessions || []).filter((record) => record.profileId === profile.id),
      analysis: {
        weakest: analysis.weakest,
        strongest: analysis.strongest,
        examTrend: analysis.examTrend,
        trendDelta: analysis.trendDelta,
        priorities: analysis.priorities,
        knowledgePoints: analysis.knowledgePoints,
        evidenceCoverage: analysis.evidenceCoverage,
        abilityProfile: analysis.abilityProfile,
        conclusion: analysis.conclusion,
        boundary: analysis.boundary
      }
    };
  }

  function syncClientEntityId(value, fallback = "record") {
    let normalized = String(value || fallback).normalize("NFKC")
      .replace(/[^A-Za-z0-9._:-]/g, "-")
      .replace(/^[^A-Za-z0-9]+/g, "")
      .slice(0, 160);
    if (!normalized) normalized = fallback;
    return normalized;
  }

  function syncQuestionType(value) {
    const normalized = String(value || "");
    if (/选择/.test(normalized)) return "choice";
    if (/填空|数值|计算/.test(normalized)) return "numeric";
    if (/证明/.test(normalized)) return "proof";
    if (/实验|探究/.test(normalized)) return "experiment";
    if (/建模|模型/.test(normalized)) return "modeling";
    return "shortAnswer";
  }

  function syncDifficulty(value) {
    const normalized = String(value || "");
    if (/挑战/.test(normalized) || /challenge/i.test(normalized)) return "挑战";
    if (/进阶/.test(normalized) || /advanced/i.test(normalized)) return "进阶";
    return "基础";
  }

  function syncErrorType(value) {
    const normalized = String(value || "");
    if (/审题/.test(normalized)) return "审题";
    if (/概念/.test(normalized)) return "概念";
    if (/建模/.test(normalized)) return "建模";
    if (/适用|条件/.test(normalized)) return "规律适用条件";
    if (/计算/.test(normalized)) return "计算";
    if (/单位/.test(normalized)) return "单位";
    if (/方向|符号/.test(normalized)) return "方向或符号";
    if (/图像|实验/.test(normalized)) return "图像或实验";
    if (/表达/.test(normalized)) return "表达";
    if (/猜测/.test(normalized)) return "猜测作答";
    return null;
  }

  function assertCloudSyncAllowed(state, profileId) {
    const requestedProfileId = String(profileId || "").trim();
    if (!requestedProfileId) throw new Error("云同步缺少明确学生 ID，未发送任何数据。");
    const profile = state.profiles.find((item) => item.id === requestedProfileId);
    if (!profile) throw new Error("云同步学生 ID 无法匹配本机档案，未发送任何数据。");
    if (!profile.portableProfileId) throw new Error("学生缺少稳定跨设备 ID，未发送任何数据。");
    if (!["under14", "14plus"].includes(profile.minorAgeBand)) {
      throw new Error("学生年龄段尚未确认，不能假定已满 14 周岁；云同步未发送任何数据。");
    }
    if (profile.guardianConsentStatus === "withdrawn") {
      throw new Error("该学生已撤回数据授权，不能继续云同步。");
    }
    if (profile.minorAgeBand === "under14" && profile.guardianConsentStatus !== "granted") {
      throw new Error("未满14周岁学生尚无有效监护人授权，不能启用云同步。");
    }
    return profile;
  }

  function buildLearningSyncPayload(state, questions = [], profileId = state.activeProfileId, options = {}) {
    const profile = assertCloudSyncAllowed(state, profileId);
    const questionMap = new Map((Array.isArray(questions) ? questions : []).map((question) => [question.id, question]));
    const profileClientEntityId = syncClientEntityId(profile.portableProfileId, "profile-local");
    const attempts = state.attempts
      .filter((attempt) => attempt.profileId === profile.id)
      .slice(-(Math.max(1, Math.min(100, Number(options.limit) || 100))))
      .map((attempt) => {
        const question = questionMap.get(attempt.questionId) || {};
        const gradingStatus = attempt.grading?.status === "correct"
          ? "correct"
          : attempt.grading?.status === "partial"
            ? "partial"
            : attempt.grading?.status === "incorrect" || attempt.grading?.status === "wrong"
              ? "incorrect"
              : "pending";
        const rawScore = Number(attempt.grading?.score);
        const score = Number.isFinite(rawScore)
          ? Math.max(0, Math.min(100, rawScore <= 1 ? rawScore * 100 : rawScore))
          : null;
        const completedAt = new Date(attempt.completedAt || attempt.createdAt || Date.now());
        const startedAt = new Date(attempt.startedAt || completedAt);
        return {
          clientEntityId: syncClientEntityId(attempt.sourceRecordId || attempt.id),
          profileClientEntityId,
          questionId: syncClientEntityId(attempt.questionId, "question-local"),
          sessionClientId: syncClientEntityId(attempt.sessionClientId || `session-${attempt.id}`, "session-local"),
          knowledgePointIds: [syncClientEntityId(attempt.topicKey || topicKeyForLabel(attempt.topic), "topic-unknown")],
          questionType: syncQuestionType(attempt.questionType || question.questionType),
          modelFamilyId: attempt.modelFamilyId ? syncClientEntityId(attempt.modelFamilyId) : null,
          variantRole: ["near", "reverse", "context", "far", "counter", "review"].includes(attempt.transferType) ? attempt.transferType : "core",
          difficulty: syncDifficulty(attempt.difficulty || question.difficulty),
          startedAt: Number.isFinite(startedAt.getTime()) ? startedAt.toISOString() : new Date().toISOString(),
          completedAt: Number.isFinite(completedAt.getTime()) ? completedAt.toISOString() : new Date().toISOString(),
          activeDurationSeconds: Math.max(0, Math.min(86_400, Number(attempt.durationSeconds) || 0)),
          hintViewCount: Math.max(0, Math.min(100, Number(attempt.hintLevel) || 0)),
          maxHintLevel: Math.max(0, Math.min(5, Number(attempt.hintLevel) || 0)),
          confidenceBefore: Number.isFinite(Number(attempt.confidenceBefore)) ? Math.max(1, Math.min(5, Number(attempt.confidenceBefore))) : null,
          confidenceAfter: Number.isFinite(Number(attempt.confidenceAfter)) ? Math.max(1, Math.min(5, Number(attempt.confidenceAfter))) : null,
          finalAnswer: String(attempt.finalAnswer || "").slice(0, 30_000),
          gradingStatus,
          score,
          verificationIssues: Array.isArray(attempt.grading?.issues) ? attempt.grading.issues.slice(0, 100) : [],
          primaryErrorType: syncErrorType(attempt.errorType),
          secondaryErrorTypes: [],
          reflection: String(attempt.reflection || "").slice(0, 10_000),
          selfExplanation: String(attempt.selfExplanation || "").slice(0, 10_000),
          modelEvidence: attempt.model && typeof attempt.model === "object" && !Array.isArray(attempt.model) ? attempt.model : {},
          modelScore: Number.isFinite(Number(attempt.modelScore?.total)) ? Number(attempt.modelScore.total) : null,
          teacherReviewStatus: gradingStatus === "pending" || attempt.modelingRecordNeedsCheck ? "pending" : "notRequired"
        };
      });
    return {
      baseRevision: Number.isInteger(options.baseRevision) && options.baseRevision >= 0 ? options.baseRevision : 0,
      profile: {
        clientEntityId: profileClientEntityId,
        displayName: String(profile.name || "本机学生").slice(0, 80),
        grade: profile.grade || "高一",
        curriculumVersion: `physics-studio-${APP_VERSION}`
      },
      attempts
    };
  }

  function buildExamSyncPayload(state, profileId = state.activeProfileId, options = {}) {
    const profile = assertCloudSyncAllowed(state, profileId);
    const profileClientEntityId = syncClientEntityId(profile.portableProfileId, "profile-local");
    const records = state.examRecords
      .filter((record) => record.profileId === profile.id)
      .filter((record) => Number.isFinite(Number(record.score)) && Number(record.totalScore) > 0 && Number(record.score) <= Number(record.totalScore))
      .slice(-(Math.max(1, Math.min(100, Number(options.limit) || 100))))
      .map((record) => ({
        clientEntityId: syncClientEntityId(record.sourceRecordId || record.id),
        profileClientEntityId,
        examName: String(record.title || "未命名试卷").slice(0, 160),
        occurredOn: /^\d{4}-\d{2}-\d{2}$/.test(String(record.examDate || ""))
          ? record.examDate
          : localCalendarDateKey(record.createdAt || new Date()),
        score: Number(record.score),
        maxScore: Number(record.totalScore),
        knowledgePointScores: (record.weakTopicKeys || record.weakTopics || []).slice(0, 100)
      }));
    return {
      baseRevision: Number.isInteger(options.baseRevision) && options.baseRevision >= 0 ? options.baseRevision : 0,
      profile: {
        clientEntityId: profileClientEntityId,
        displayName: String(profile.name || "本机学生").slice(0, 80),
        grade: profile.grade || "高一",
        curriculumVersion: `physics-studio-${APP_VERSION}`
      },
      records
    };
  }

  window.PHYSICS_LEARNING_ENGINE = Object.freeze({
    version: APP_VERSION,
    gradingVersion: GRADING_VERSION,
    storageKey: STORAGE_KEY,
    masteryRules: MASTERY_RULES,
    interventionComparisonRule: INTERVENTION_COMPARISON_RULE,
    misconceptionCatalog: Object.freeze(misconceptionCatalog),
    errorTypeDefinitions: ERROR_TYPE_DEFINITIONS,
    formulaCatalog: Object.freeze(formulaCatalog),
    constants: Object.freeze(constants),
    unitDefinitions: Object.freeze(unitDefinitions),
    createId,
    localCalendarDateKey,
    defaultState,
    normalizeState,
    loadState,
    saveState,
    awaitLastSave,
    activeProfile,
    normalizeProfile,
    normalizeAssessmentSession,
    addProfile,
    createPortableProfileId,
    resolveImportedStudentId,
    importStudentReport,
    bindImportedReportIdentity,
    updateProfile,
    deleteProfile,
    recordDiagnostic,
    diagnosticClassificationLabel,
    misconceptionProfile,
    normalizeQuestionType,
    isPendingManualReview,
    isAutoScoredAttempt,
    isValidAccuracyEvidence,
    summarizeAttemptEvidence,
    normalizeErrorType,
    createHintLadder,
    socraticPrompts,
    gradeFinalAnswer,
    markLegacyGradingForReview,
    verifyPhysicsAnswer,
    scoreModeling,
    recordAttempt,
    normalizeVariantSet,
    normalizeVariantAttempt,
    normalizeFeynmanExplanation,
    saveVariantSet,
    variantSetForParent,
    decideVariantReview,
    recordVariantAttempt,
    recordFeynmanExplanation,
    feynmanSelfCheck,
    selectFeynmanRetestQuestion,
    variantSetProgress,
    trainableVariants,
    saveVariantPreset,
    completeManualReview,
    automaticReviewRating,
    scheduleReview,
    scheduleReviewFromAttempt,
    reviewsForProfile,
    dueReviews,
    isPublishedQuestion,
    questionMasteryEvidence,
    masteryProfile,
    masterySummary,
    topicPerformance,
    questionCorrectionState,
    topicEvidenceProfile,
    knowledgePointEvidenceSummary,
    masteryDisplayLabel,
    normalizeTopic,
    resolveKnowledgePointIdentity,
    topicKeyForQuestion,
    topicCatalog,
    resolveExamRecordTopics,
    summarizeLearning,
    modelingRadar,
    recommendations,
    addExamRecord,
    importExamRecords,
    importLearningProfile,
    addGrowthRecord,
    growthTimeline,
    studentAnalysis,
    buildStudentLearningDiagnosis,
    buildStudentFormativeReport,
    dailyTest,
    generatePlacementDiagnostic,
    placementSessionForProfile,
    placementStatus,
    startPlacementAssessment,
    refreshPlacementAssessment,
    completePlacementAssessment,
    scheduleBroadCoverageCheck,
    recordBroadCoverageCheck,
    closedLoopStreak,
    activeLearningPlan,
    learningPlanProgress,
    buildTargetedLearningPlan,
    buildComparableInterventionOutcome,
    saveTargetedLearningPlan,
    saveSelfDirectedLearningPlan,
    buildTeacherPrescription,
    buildTieredAssignmentDraft,
    transferVariants,
    validateDimension,
    convertUnit,
    mean,
    standardDeviation,
    linearRegression,
    generateAssignment,
    auditQuestion,
    createReportPayload,
    buildLearningSyncPayload,
    buildExamSyncPayload
  });
})();
