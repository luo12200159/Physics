(() => {
  "use strict";

  const OFFICIAL_BASIS_URL = "https://jyt.hunan.gov.cn/jyt/sjyt/xxgk/c100951/202503/t20250310_33607705.html";
  const COPYRIGHT_NOTE = "原创同步练习，依据课程标准与教材知识结构编写，非教材原题或教材参考答案复制。";

  const gradeMetadata = {
    八年级: {
      stage: "初中",
      source: "长沙人教版八年级物理同步·原创练习",
      basis: "依据长沙市2025年春季用书目录中的人教版八年级物理及义务教育物理课程标准知识要求编写。"
    },
    九年级: {
      stage: "初中",
      source: "长沙九年级物理同步·原创练习",
      basis: "依据义务教育物理课程标准、长沙九年级物理课程和综合复习知识要求编写。"
    },
    高一: {
      stage: "高中",
      source: "长沙人教版高中物理同步·原创练习",
      basis: "依据长沙市2025年春季用书目录中的人教版高中物理必修第二册，并结合高中物理必修课程知识序列编写。"
    },
    高二: {
      stage: "高中",
      source: "长沙人教版高中物理同步·原创练习",
      basis: "依据长沙市2025年春季用书目录中的人教版高中物理选择性必修第三册，并结合高中物理必修、选择性必修课程知识序列编写。"
    },
    高三: {
      stage: "高中",
      source: "长沙高中物理综合复习·原创练习",
      basis: "依据普通高中物理课程标准与长沙高三物理综合复习范围编写；高三部分为跨模块复习题，不标称当季新增教材课后题。"
    }
  };

  function formatDetailedSolution(definition) {
    const existing = String(definition.solution || "").trim();
    if (/^【考察点】/.test(existing)) return existing;
    const points = definition.examPoints?.length ? definition.examPoints : [definition.topic];
    const fragments = existing
      .split(/\r?\n/)
      .flatMap((line) => line.split(/(?<=[。；])\s*/))
      .map((line) => line.replace(/^(?:第\s*)?\d+(?:\s*步)?[.、：:]\s*/, "").trim())
      .filter(Boolean);
    const reasoning = [
      `先明确题目条件、所求结论和研究对象，本题主要考察${points.join("、")}。`,
      ...fragments,
      `整理上述推理，按题目要求写出结论：${definition.answer}`
    ];
    return [
      `【考察点】${points.join("、")}`,
      "【分步解析】",
      ...reasoning.map((line, index) => `${index + 1}. ${line}`),
      `【最终结论】${definition.answer}`,
      "【结果复核】核对题目设问、物理规律适用条件、单位、方向和数量级；选择题同时核对其余选项为何不成立。"
    ].join("\n");
  }

  function inferQuestionType(definition = {}) {
    const explicit = String(definition.questionType || "").trim();
    if (explicit) return explicit;
    const text = [definition.title, definition.content, definition.solution].join(" ");
    if (/选择题|单选|多选|[A-D][.、)]/.test(text)) return "单项选择题";
    if (/填空|（\s*）|\(\s*\)|____|横线上/.test(text)) return "填空题";
    if (/实验|探究|器材|测量|装置|数据处理/.test(text)) return "实验题";
    if (/判断/.test(text)) return "判断题";
    if (/简答|说明|解释|为什么|论述/.test(text)) return "简答题";
    if (/求|计算|速度|质量|电流|电压|功率|能量|周期|距离|时间/.test(text)) return "计算题";
    return "未标注";
  }

  const definitions = [
    {
      id: "cs-original-v1-g8-01",
      grade: "八年级",
      topic: "机械运动",
      difficulty: "基础",
      textbookUnit: "八年级上册·机械运动",
      title: "骑行过程的平均速度",
      content: "一名学生骑行 3.6 km，用时 12 min。求全程平均速度，结果用 m/s 表示。",
      solution: "3.6 km = 3600 m，12 min = 720 s。平均速度 v = s/t = 3600 m ÷ 720 s = 5 m/s。",
      answer: "5 m/s。"
    },
    {
      id: "cs-original-v1-g8-02",
      grade: "八年级",
      topic: "声现象",
      difficulty: "进阶",
      textbookUnit: "八年级上册·声现象",
      title: "利用回声估算距离",
      content: "人在山壁前发出短促声音，0.80 s 后听到回声。空气中的声速取 340 m/s，求人到山壁的距离。",
      solution: "0.80 s 是声音往返的总时间。声音传播总路程 s = vt = 340 m/s × 0.80 s = 272 m。人到山壁的距离为总路程的一半，即 136 m。",
      answer: "136 m。"
    },
    {
      id: "cs-original-v1-g8-03",
      questionType: "简答题",
      grade: "八年级",
      topic: "声音特性",
      difficulty: "基础",
      textbookUnit: "八年级上册·声现象",
      title: "比较音调与响度",
      content: "甲、乙两个声源振动频率分别为 256 Hz 和 512 Hz，振幅相同。比较两者的音调和响度。",
      solution: "频率越高，音调越高，因此乙的音调高。振幅相同且其他传播条件相同时，响度可视为相同。",
      answer: "乙的音调更高；在其他条件相同时，两者响度相同。"
    },
    {
      id: "cs-original-v1-g8-04",
      grade: "八年级",
      topic: "物态变化",
      difficulty: "基础",
      textbookUnit: "八年级上册·物态变化",
      title: "判断冰熔化时的温度变化",
      content: "标准大气压下，把 0 ℃ 的冰缓慢加热。冰尚未完全熔化时，混合物温度怎样变化？吸收的热量用于什么过程？",
      solution: "晶体在熔化过程中继续吸热，但温度保持在熔点。此时吸收的热量主要用于改变物质状态，使冰转化为水。",
      answer: "温度保持 0 ℃；热量用于冰的熔化。"
    },
    {
      id: "cs-original-v1-g8-05",
      grade: "八年级",
      topic: "平面镜成像",
      difficulty: "进阶",
      textbookUnit: "八年级上册·光现象",
      title: "人靠近平面镜时的像距",
      content: "人原来距平面镜 1.8 m，随后向平面镜靠近 0.5 m。此时像到平面镜的距离是多少？人与像之间的距离是多少？",
      solution: "靠近后人到镜面的距离为 1.8 m − 0.5 m = 1.3 m。平面镜成像时像距等于物距，所以像到镜面也是 1.3 m；人与像相距 1.3 m + 1.3 m = 2.6 m。",
      answer: "像到平面镜 1.3 m；人与像相距 2.6 m。"
    },
    {
      id: "cs-original-v1-g8-06",
      grade: "八年级",
      topic: "凸透镜成像",
      difficulty: "进阶",
      textbookUnit: "八年级上册·透镜及其应用",
      title: "判断凸透镜成像性质",
      content: "凸透镜焦距为 10 cm，物体放在距透镜 30 cm 处。说明像的正倒、大小、虚实以及能否用光屏承接。",
      solution: "物距 30 cm 大于二倍焦距 20 cm。凸透镜在物距大于二倍焦距时成倒立、缩小的实像；实像可以用光屏承接。",
      answer: "成倒立、缩小的实像，可以用光屏承接。"
    },
    {
      id: "cs-original-v1-g8-07",
      grade: "八年级",
      topic: "质量与密度",
      difficulty: "基础",
      textbookUnit: "八年级上册·质量与密度",
      title: "计算均匀物体的密度",
      content: "一个均匀物体质量为 540 g，体积为 200 cm³。求其密度。",
      solution: "ρ = m/V = 540 g ÷ 200 cm³ = 2.7 g/cm³。换算成国际单位为 2.7 × 10³ kg/m³。",
      answer: "2.7 g/cm³，即 2.7 × 10³ kg/m³。"
    },
    {
      id: "cs-original-v1-g8-08",
      grade: "八年级",
      topic: "力与运动",
      difficulty: "基础",
      textbookUnit: "八年级下册·运动和力",
      title: "同一直线上二力的合成",
      content: "物体同时受到水平向右 25 N 和水平向左 9 N 的力。求这两个力的合力。",
      solution: "两个力方向相反，合力大小等于较大力减较小力：25 N − 9 N = 16 N；方向与较大的力相同。",
      answer: "16 N，方向水平向右。"
    },
    {
      id: "cs-original-v1-g8-09",
      grade: "八年级",
      topic: "压强",
      difficulty: "进阶",
      textbookUnit: "八年级下册·压强",
      title: "计算物体对地面的压强",
      content: "一个总重为 600 N 的箱子静止在水平地面上，与地面的接触面积为 0.030 m²。求箱子对地面的压强。",
      solution: "静止时箱子对地面的压力大小等于箱子总重。p = F/S = 600 N ÷ 0.030 m² = 2.0 × 10⁴ Pa。",
      answer: "2.0 × 10⁴ Pa。"
    },
    {
      id: "cs-original-v1-g8-10",
      grade: "八年级",
      topic: "浮力",
      difficulty: "进阶",
      textbookUnit: "八年级下册·浮力",
      title: "用称重法计算浮力",
      content: "物体挂在弹簧测力计下，在空气中示数为 15 N，完全浸没在水中时示数为 10 N。取水的密度 1.0 × 10³ kg/m³，g = 10 N/kg。求物体受到的浮力和排开水的体积。",
      solution: "称重法得浮力 F浮 = G − F示 = 15 N − 10 N = 5 N。由 F浮 = ρ水gV排，V排 = 5 N ÷ (1.0 × 10³ kg/m³ × 10 N/kg) = 5.0 × 10⁻⁴ m³。",
      answer: "浮力为 5 N；排开水的体积为 5.0 × 10⁻⁴ m³。"
    },
    {
      id: "cs-original-v1-g8-11",
      grade: "八年级",
      topic: "功和功率",
      difficulty: "进阶",
      textbookUnit: "八年级下册·功和机械能",
      title: "提升物体时的功和功率",
      content: "用竖直向上 200 N 的力把物体匀速提升 3.0 m，用时 5.0 s。求拉力做的功和功率。",
      solution: "功 W = Fs = 200 N × 3.0 m = 600 J。功率 P = W/t = 600 J ÷ 5.0 s = 120 W。",
      answer: "做功 600 J；功率 120 W。"
    },
    {
      id: "cs-original-v1-g9-01",
      grade: "九年级",
      topic: "分子热运动",
      difficulty: "基础",
      textbookUnit: "九年级全一册·内能",
      title: "用分子运动解释扩散",
      content: "把少量红墨水滴入一杯静置的清水中，不搅拌，较长时间后整杯水颜色趋于均匀。用分子观点解释这一现象。",
      solution: "物质由不停做无规则运动的分子组成。红墨水和水的分子持续无规则运动并相互进入对方间隙，因此宏观上出现扩散，最终颜色趋于均匀。",
      answer: "这是分子不停做无规则运动产生的扩散现象。"
    },
    {
      id: "cs-original-v1-g9-02",
      grade: "九年级",
      topic: "比热容",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·内能的利用",
      title: "计算水吸收的热量",
      content: "质量为 2.0 kg 的水温度升高 5 ℃。水的比热容取 4.2 × 10³ J/(kg·℃)，求水吸收的热量。",
      solution: "Q吸 = cmΔT = 4.2 × 10³ J/(kg·℃) × 2.0 kg × 5 ℃ = 4.2 × 10⁴ J。",
      answer: "4.2 × 10⁴ J。"
    },
    {
      id: "cs-original-v1-g9-03",
      grade: "九年级",
      topic: "热效率",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·内能的利用",
      title: "根据燃料放热量求效率",
      content: "完全燃烧 0.020 kg 某燃料，燃料热值为 3.0 × 10⁷ J/kg，装置获得的有用能量为 1.8 × 10⁵ J。求装置的能量利用效率。",
      solution: "燃料完全燃烧放热 Q放 = mq = 0.020 kg × 3.0 × 10⁷ J/kg = 6.0 × 10⁵ J。效率 η = Q有用/Q放 = 1.8 × 10⁵ ÷ 6.0 × 10⁵ = 0.30。",
      answer: "30%。"
    },
    {
      id: "cs-original-v1-g9-04",
      grade: "九年级",
      topic: "串联电路",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·欧姆定律",
      title: "串联电路的电流与分压",
      content: "把 6 Ω 和 9 Ω 两个电阻串联接在 12 V 电源两端，不计电源内阻。求电路电流和 9 Ω 电阻两端电压。",
      solution: "总电阻 R = 6 Ω + 9 Ω = 15 Ω。电流 I = U/R = 12 V ÷ 15 Ω = 0.8 A。9 Ω 电阻两端电压 U₂ = IR₂ = 0.8 A × 9 Ω = 7.2 V。",
      answer: "电流为 0.8 A；9 Ω 电阻两端电压为 7.2 V。"
    },
    {
      id: "cs-original-v1-g9-05",
      grade: "九年级",
      topic: "并联电路",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·电流和电路",
      title: "并联支路电流与干路电流",
      content: "6 Ω 和 3 Ω 两个电阻并联接在 6 V 电源两端。求两支路电流和干路总电流。",
      solution: "并联各支路电压均为 6 V。I₁ = 6 V ÷ 6 Ω = 1 A；I₂ = 6 V ÷ 3 Ω = 2 A。干路电流 I = I₁ + I₂ = 3 A。",
      answer: "两支路电流分别为 1 A、2 A；干路电流为 3 A。"
    },
    {
      id: "cs-original-v1-g9-06",
      grade: "九年级",
      topic: "欧姆定律",
      difficulty: "基础",
      textbookUnit: "九年级全一册·欧姆定律",
      title: "同一电阻在不同电压下的电流",
      content: "一个 6 Ω 定值电阻两端电压先为 9 V，后降为 6 V。分别求两种情况下通过电阻的电流。",
      solution: "由 I = U/R。电压为 9 V 时 I₁ = 9 V ÷ 6 Ω = 1.5 A；电压为 6 V 时 I₂ = 6 V ÷ 6 Ω = 1.0 A。",
      answer: "分别为 1.5 A 和 1.0 A。"
    },
    {
      id: "cs-original-v1-g9-07",
      grade: "九年级",
      topic: "电功率",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·电功率",
      title: "计算电热水壶的电流和耗电量",
      content: "额定电压 220 V、额定功率 1100 W 的电热水壶正常工作 10 min。求工作电流和消耗的电能。",
      solution: "正常工作电流 I = P/U = 1100 W ÷ 220 V = 5 A。10 min = 600 s，电能 W = Pt = 1100 W × 600 s = 6.6 × 10⁵ J，约为 0.183 kW·h。",
      answer: "电流 5 A；消耗电能 6.6 × 10⁵ J，约 0.183 kW·h。"
    },
    {
      id: "cs-original-v1-g9-08",
      grade: "九年级",
      topic: "焦耳定律",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·生活用电",
      title: "计算电阻产生的热量",
      content: "电流为 2.0 A，通过阻值 5.0 Ω 的电阻持续 3.0 min。求电阻产生的热量。",
      solution: "3.0 min = 180 s。由焦耳定律 Q = I²Rt = (2.0 A)² × 5.0 Ω × 180 s = 3600 J。",
      answer: "3600 J。"
    },
    {
      id: "cs-original-v1-g9-09",
      grade: "九年级",
      topic: "安全用电",
      difficulty: "进阶",
      textbookUnit: "九年级全一册·生活用电",
      title: "判断插座是否过载",
      content: "一个标有“220 V 10 A”的插座已接入 2000 W 电热水壶，又准备同时接入 700 W 电饭煲。忽略其他因素，判断是否适合同时使用。",
      solution: "插座允许的最大功率约为 P最大 = UI = 220 V × 10 A = 2200 W。两用电器总功率为 2000 W + 700 W = 2700 W，大于 2200 W，会造成过载风险。",
      answer: "不适合同时使用；总功率 2700 W 超过插座约 2200 W 的承载上限。"
    },
    {
      id: "cs-original-v1-g9-10",
      grade: "九年级",
      topic: "电与磁",
      difficulty: "基础",
      textbookUnit: "九年级全一册·电与磁",
      title: "电磁铁与发电机原理辨析",
      content: "给电磁铁线圈中的电流换向，磁极会怎样变化？发电机把机械能转化为电能所依据的主要物理现象是什么？",
      solution: "电磁铁的磁极方向与线圈电流方向有关，电流换向后南、北极对调。发电机工作时，导体在磁场中切割磁感线或闭合电路的磁通量发生变化而产生感应电流，依据的是电磁感应。",
      answer: "电磁铁磁极对调；发电机依据电磁感应现象。"
    },
    {
      id: "cs-original-v1-h1-01",
      grade: "高一",
      topic: "速度与位移",
      difficulty: "进阶",
      textbookUnit: "必修第一册·运动的描述",
      title: "区分平均速率和平均速度",
      content: "物体先向东运动 100 m，再向西运动 60 m，总用时 40 s。求平均速率和平均速度。",
      solution: "总路程为 100 m + 60 m = 160 m，平均速率为 160 m ÷ 40 s = 4.0 m/s。位移为向东 40 m，平均速度为 40 m ÷ 40 s = 1.0 m/s，方向向东。",
      answer: "平均速率 4.0 m/s；平均速度 1.0 m/s，方向向东。"
    },
    {
      id: "cs-original-v1-h1-02",
      grade: "高一",
      topic: "匀变速直线运动",
      difficulty: "基础",
      textbookUnit: "必修第一册·匀变速直线运动的研究",
      title: "由加速度求末速度和位移",
      content: "物体从静止开始做匀加速直线运动，加速度为 2.0 m/s²，运动 5.0 s。求末速度和位移。",
      solution: "末速度 v = v₀ + at = 0 + 2.0 m/s² × 5.0 s = 10 m/s。位移 x = v₀t + ½at² = 0.5 × 2.0 × 5.0² m = 25 m。",
      answer: "末速度 10 m/s；位移 25 m。"
    },
    {
      id: "cs-original-v1-h1-03",
      grade: "高一",
      topic: "制动问题",
      difficulty: "进阶",
      textbookUnit: "必修第一册·匀变速直线运动的研究",
      title: "车辆匀减速制动",
      content: "车辆以 20 m/s 的速度行驶，随后以大小为 4.0 m/s² 的加速度匀减速至停止。求制动时间和制动距离。",
      solution: "取初速度方向为正，加速度 a = −4.0 m/s²。由 0 = 20 m/s − 4.0 m/s² × t，得 t = 5.0 s。平均速度为 (20 + 0)/2 = 10 m/s，位移 x = 10 m/s × 5.0 s = 50 m。",
      answer: "制动时间 5.0 s；制动距离 50 m。"
    },
    {
      id: "cs-original-v1-h1-04",
      grade: "高一",
      topic: "牛顿第二定律",
      difficulty: "进阶",
      textbookUnit: "必修第一册·运动和力的关系",
      title: "水平面上的加速度",
      content: "质量为 2.0 kg 的物体在水平面上受到水平向右 10 N 的拉力，同时受到水平向左 2.0 N 的滑动摩擦力。求物体的加速度。",
      solution: "水平方向合力 F合 = 10 N − 2.0 N = 8.0 N。由牛顿第二定律 a = F合/m = 8.0 N ÷ 2.0 kg = 4.0 m/s²，方向向右。",
      answer: "4.0 m/s²，方向水平向右。"
    },
    {
      id: "cs-original-v1-h1-05",
      grade: "高一",
      topic: "力的合成",
      difficulty: "进阶",
      textbookUnit: "必修第一册·相互作用——力",
      title: "求两个垂直分力的合力",
      content: "物体受到水平向东 6 N 和水平向北 8 N 的两个力。求合力大小和方向。",
      solution: "两个分力互相垂直，合力大小 F = √(6² + 8²) N = 10 N。设合力与正东方向夹角为 θ，则 tanθ = 8/6，θ ≈ 53.1°。",
      answer: "合力 10 N，方向为东偏北约 53.1°。"
    },
    {
      id: "cs-original-v1-h1-06",
      grade: "高一",
      topic: "平抛运动",
      difficulty: "进阶",
      textbookUnit: "必修第二册·抛体运动",
      title: "平抛运动的落地时间和水平位移",
      content: "小球从距地面 20 m 高处以 10 m/s 初速度水平抛出，忽略空气阻力，取 g = 10 m/s²。求落地时间和水平位移。",
      solution: "竖直方向做自由落体运动：h = ½gt²，t = √(2h/g) = √(40/10) s = 2.0 s。水平方向匀速，x = v₀t = 10 m/s × 2.0 s = 20 m。",
      answer: "落地时间 2.0 s；水平位移 20 m。"
    },
    {
      id: "cs-original-v1-h1-07",
      grade: "高一",
      topic: "圆周运动",
      difficulty: "进阶",
      textbookUnit: "必修第二册·圆周运动",
      title: "计算向心加速度和向心力",
      content: "质量为 0.50 kg 的小球以 6.0 m/s 的速率做半径为 3.0 m 的匀速圆周运动。求向心加速度和所需向心力。",
      solution: "向心加速度 aₙ = v²/r = 6.0² ÷ 3.0 m/s² = 12 m/s²。向心力 Fₙ = maₙ = 0.50 kg × 12 m/s² = 6.0 N。",
      answer: "向心加速度 12 m/s²；向心力 6.0 N。"
    },
    {
      id: "cs-original-v1-h1-08",
      grade: "高一",
      topic: "万有引力",
      difficulty: "挑战",
      textbookUnit: "必修第二册·万有引力与宇宙航行",
      title: "比较不同轨道卫星的周期",
      content: "两颗卫星绕同一中心天体做圆周运动，轨道半径之比 r₂:r₁ = 4:1。求公转周期之比 T₂:T₁。",
      solution: "绕同一中心天体的卫星满足开普勒第三定律 T² ∝ r³，因此 T ∝ r^(3/2)。T₂/T₁ = (r₂/r₁)^(3/2) = 4^(3/2) = 8。",
      answer: "T₂:T₁ = 8:1。"
    },
    {
      id: "cs-original-v1-h2-01",
      grade: "高二",
      topic: "动量定理",
      difficulty: "进阶",
      textbookUnit: "选择性必修第一册·动量守恒定律",
      title: "反弹过程的冲量与平均力",
      content: "质量 0.20 kg 的小球以 10 m/s 速度沿正方向运动，碰撞后以 6.0 m/s 速度反向弹回。碰撞时间为 0.040 s。求小球动量变化量和所受平均合力。",
      solution: "取初速度方向为正，v₁ = 10 m/s，v₂ = −6.0 m/s。Δp = m(v₂ − v₁) = 0.20 × (−6.0 − 10) = −3.2 kg·m/s。平均合力 F = Δp/Δt = −3.2 ÷ 0.040 N = −80 N。",
      answer: "动量变化量为 −3.2 kg·m/s；平均合力为 −80 N，即大小 80 N、方向与初速度相反。"
    },
    {
      id: "cs-original-v1-h2-02",
      grade: "高二",
      topic: "动量守恒",
      difficulty: "进阶",
      textbookUnit: "选择性必修第一册·动量守恒定律",
      title: "完全非弹性碰撞后的共同速度",
      content: "质量 1.0 kg 的小车以 4.0 m/s 运动，与前方静止的 3.0 kg 小车碰撞后粘在一起。忽略外力冲量，求共同速度。",
      solution: "碰撞过程中系统动量守恒：m₁v₁ + m₂v₂ = (m₁ + m₂)v。代入得 1.0 × 4.0 + 3.0 × 0 = 4.0v，所以 v = 1.0 m/s，方向与第一辆小车原运动方向相同。",
      answer: "1.0 m/s，方向与第一辆小车原运动方向相同。"
    },
    {
      id: "cs-original-v1-h2-03",
      grade: "高二",
      topic: "简谐运动",
      difficulty: "基础",
      textbookUnit: "选择性必修第一册·机械振动",
      title: "由周期求频率和振动次数",
      content: "一个振子的振动周期为 0.50 s。求振动频率以及 10 s 内完成的完整振动次数。",
      solution: "频率 f = 1/T = 1 ÷ 0.50 s = 2.0 Hz。10 s 内振动次数 N = t/T = 10 s ÷ 0.50 s = 20。",
      answer: "频率 2.0 Hz；10 s 内完成 20 次完整振动。"
    },
    {
      id: "cs-original-v1-h2-04",
      grade: "高二",
      topic: "机械波",
      difficulty: "基础",
      textbookUnit: "选择性必修第一册·机械波",
      title: "由波速和频率求波长",
      content: "一列简谐横波在介质中的传播速度为 20 m/s，频率为 5.0 Hz。求波长。",
      solution: "波速、波长和频率满足 v = λf，因此 λ = v/f = 20 m/s ÷ 5.0 Hz = 4.0 m。",
      answer: "4.0 m。"
    },
    {
      id: "cs-original-v1-h2-05",
      grade: "高二",
      topic: "电场强度",
      difficulty: "进阶",
      textbookUnit: "必修第三册·静电场及其应用",
      title: "由试探电荷受力求电场强度",
      content: "电荷量为 2.0 × 10⁻⁸ C 的正试探电荷在某点受到 3.0 × 10⁻⁴ N 的电场力。求该点电场强度大小。",
      solution: "电场强度 E = F/q = 3.0 × 10⁻⁴ N ÷ (2.0 × 10⁻⁸ C) = 1.5 × 10⁴ N/C。",
      answer: "1.5 × 10⁴ N/C。"
    },
    {
      id: "cs-original-v1-h2-06",
      grade: "高二",
      topic: "电容器",
      difficulty: "进阶",
      textbookUnit: "必修第三册·静电场中的能量",
      title: "计算电容器所带电荷量",
      content: "一个电容为 20 μF 的电容器两端电压为 12 V。求电容器所带电荷量。",
      solution: "由 Q = CU，Q = 20 × 10⁻⁶ F × 12 V = 2.4 × 10⁻⁴ C，也就是 240 μC。",
      answer: "2.4 × 10⁻⁴ C，即 240 μC。"
    },
    {
      id: "cs-original-v1-h2-07",
      grade: "高二",
      topic: "闭合电路",
      difficulty: "进阶",
      textbookUnit: "必修第三册·电路及其应用",
      title: "含内阻电源的路端电压",
      content: "电源电动势为 6.0 V、内阻为 1.0 Ω，外接电阻为 5.0 Ω。求电路电流、路端电压和电源内部的热功率。",
      solution: "总电阻 R总 = R + r = 6.0 Ω，电流 I = E/(R + r) = 6.0 V ÷ 6.0 Ω = 1.0 A。路端电压 U = IR = 5.0 V。内阻热功率 P内 = I²r = 1.0 W。",
      answer: "电流 1.0 A；路端电压 5.0 V；内部热功率 1.0 W。"
    },
    {
      id: "cs-original-v1-h2-08",
      grade: "高二",
      topic: "电磁感应",
      difficulty: "进阶",
      textbookUnit: "选择性必修第二册·电磁感应",
      title: "由磁通量变化求感应电动势",
      content: "50 匝线圈中，每匝线圈的磁通量在 0.20 s 内均匀变化了 0.0040 Wb。求线圈中感应电动势的大小。",
      solution: "由法拉第电磁感应定律，感应电动势大小 E = N|ΔΦ|/Δt = 50 × 0.0040 Wb ÷ 0.20 s = 1.0 V。",
      answer: "1.0 V。"
    },
    {
      id: "cs-original-v1-h3-01",
      grade: "高三",
      topic: "力与能量综合",
      difficulty: "挑战",
      textbookUnit: "高三综合复习·力学综合",
      title: "用动力学和能量观点求末速度",
      content: "质量 2.0 kg 的物体从静止开始在水平面上运动，受到水平拉力 10 N 和滑动摩擦力 2.0 N。经过 4.0 m 后速度多大？",
      solution: "合力为 8.0 N，加速度 a = F合/m = 4.0 m/s²。由 v² = 2ax，v = √(2 × 4.0 × 4.0) m/s = √32 m/s ≈ 5.7 m/s。也可用合力做功 8.0 N × 4.0 m = 32 J 等于动能增量验证。",
      answer: "√32 m/s，约 5.7 m/s。"
    },
    {
      id: "cs-original-v1-h3-02",
      grade: "高三",
      topic: "带电粒子在磁场中运动",
      difficulty: "挑战",
      textbookUnit: "高三综合复习·电磁学综合",
      title: "计算电子在匀强磁场中的轨道半径",
      content: "电子以 2.0 × 10⁶ m/s 的速度垂直射入磁感应强度为 1.0 × 10⁻² T 的匀强磁场。取电子质量 9.1 × 10⁻³¹ kg，电荷量绝对值 1.6 × 10⁻¹⁹ C。求轨道半径。",
      solution: "洛伦兹力提供向心力：|q|vB = mv²/r，所以 r = mv/(|q|B)。代入得 r = (9.1 × 10⁻³¹ × 2.0 × 10⁶) ÷ (1.6 × 10⁻¹⁹ × 1.0 × 10⁻²) m ≈ 1.14 × 10⁻³ m。",
      answer: "约 1.14 × 10⁻³ m。"
    },
    {
      id: "cs-original-v1-h3-03",
      grade: "高三",
      topic: "理想气体",
      difficulty: "进阶",
      textbookUnit: "高三综合复习·热学综合",
      title: "定容气体的压强变化",
      content: "一定质量的理想气体在体积不变时，温度由 300 K 升高到 360 K，初始压强为 1.0 × 10⁵ Pa。求末状态压强。",
      solution: "定容条件下 p/T 为常量。p₂ = p₁T₂/T₁ = 1.0 × 10⁵ Pa × 360/300 = 1.2 × 10⁵ Pa。",
      answer: "1.2 × 10⁵ Pa。"
    },
    {
      id: "cs-original-v1-h3-04",
      grade: "高三",
      topic: "光的干涉",
      difficulty: "进阶",
      textbookUnit: "高三综合复习·振动、波与光",
      title: "计算双缝干涉条纹间距",
      content: "双缝间距为 0.30 mm，屏到双缝的距离为 1.5 m，单色光波长为 600 nm。求相邻亮条纹间距。",
      solution: "相邻亮条纹间距 Δx = λL/d。统一单位后，λ = 6.00 × 10⁻⁷ m，d = 3.0 × 10⁻⁴ m。Δx = 6.00 × 10⁻⁷ × 1.5 ÷ (3.0 × 10⁻⁴) m = 3.0 × 10⁻³ m。",
      answer: "3.0 × 10⁻³ m，即 3.0 mm。"
    },
    {
      id: "cs-original-v1-h3-05",
      grade: "高三",
      topic: "光电效应",
      difficulty: "进阶",
      textbookUnit: "高三综合复习·近代物理",
      title: "光电子最大初动能和遏止电压",
      content: "某金属逸出功为 2.2 eV，入射光光子能量为 3.0 eV。求光电子最大初动能和遏止电压。",
      solution: "由爱因斯坦光电效应方程 Eₖmax = hν − W₀ = 3.0 eV − 2.2 eV = 0.8 eV。由 eUₛ = Eₖmax，若能量以 eV 表示，则数值对应的遏止电压为 0.8 V。",
      answer: "最大初动能 0.8 eV；遏止电压 0.8 V。"
    },
    {
      id: "cs-original-v1-h3-06",
      grade: "高三",
      topic: "实验数据处理",
      difficulty: "挑战",
      textbookUnit: "高三综合复习·物理实验",
      title: "由位移与时间平方图像求加速度",
      content: "物体从静止开始做匀加速直线运动。实验得到四组 (t², x) 数据：(0.04 s², 0.20 m)、(0.09 s², 0.45 m)、(0.16 s², 0.80 m)、(0.25 s², 1.25 m)。求 x-t² 图线斜率和物体加速度。",
      solution: "各组数据的 x/t² 都等于 5.0 m/s²，因此 x-t² 图线斜率 k = 5.0 m/s²。由 x = ½at² 可知 k = a/2，所以 a = 2k = 10 m/s²。",
      answer: "图线斜率为 5.0 m/s²；物体加速度为 10 m/s²。"
    }
  ];

  const questions = definitions.map((definition, index) => {
    const metadata = gradeMetadata[definition.grade];
    const [curriculumBook = "", curriculumChapter = ""] = definition.textbookUnit.split("·");
    const taxonomy = window.PHYSICS_CURRICULUM_TAXONOMY;
    const bookMatch = taxonomy?.books?.find((book) => book.title === curriculumBook);
    const chapterMatch = bookMatch?.chapters?.find((chapter) => chapter.title === curriculumChapter);
    const sectionMatch = chapterMatch?.sections?.find((section) => {
      return section.title.includes(definition.topic) || definition.topic.includes(section.title);
    });
    const timestamp = new Date(Date.UTC(2026, 6, 23, 0, 0, index)).toISOString();
    return {
      ...definition,
      questionType: inferQuestionType(definition),
      solution: formatDetailedSolution(definition),
      examPoints: definition.examPoints?.length ? [...definition.examPoints] : [definition.topic],
      stage: metadata.stage,
      source: metadata.source,
      sourceUrl: OFFICIAL_BASIS_URL,
      curriculumBasis: metadata.basis,
      copyrightNote: COPYRIGHT_NOTE,
      collection: "changsha-curriculum-original",
      originalExercise: true,
      evidenceTier: "diagnostic-anchor",
      modelDefinitionId: `curriculum-${definition.id}`,
      retestGroupId: `curriculum-retest-${definition.id}`,
      diagnosticEligible: true,
      autoScorable: ["单项选择题", "多项选择题", "填空题", "判断题", "计算题"].includes(inferQuestionType(definition)),
      sourceLicense: "应用内原创",
      curriculumBook,
      curriculumChapter,
      curriculumSection: sectionMatch?.title || definition.topic,
      curriculumBookId: bookMatch?.id || "",
      curriculumChapterId: chapterMatch?.id || "",
      curriculumSectionId: sectionMatch?.id || "",
      videoType: "none",
      videoUrl: "",
      mastered: false,
      wrong: false,
      wrongAt: null,
      wrongCount: 0,
      transferNotes: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });

  const normalizedQuestions = questions.map((question) => ({
    ...question,
    knowledgePointId: question.knowledgePointId || question.curriculumSectionId || `kp:${String(question.topic || question.id).normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-")}`,
    cognitiveDemand: question.cognitiveDemand || "基础",
    representationType: question.representationType || "文字/公式",
    independenceGroupId: question.independenceGroupId || question.modelDefinitionId,
    assessmentPurpose: question.assessmentPurpose || "diagnostic"
  }));

  window.PHYSICS_CURRICULUM_BANK = Object.freeze({
    version: 3,
    contentVersion: "2026.07.29-detailed-solutions-r2",
    verifiedAt: "2026-07-29",
    officialBasisUrl: OFFICIAL_BASIS_URL,
    title: "长沙八年级至高三物理原创同步题库",
    copyrightNote: COPYRIGHT_NOTE,
    questions: Object.freeze(normalizedQuestions.map(Object.freeze))
  });
})();
