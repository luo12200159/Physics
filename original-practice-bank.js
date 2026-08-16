(() => {
  "use strict";

  const VERSION = 1;
  const CONTENT_VERSION = "2026.07.29-original-1500-r3";
  const CREATED_AT = "2026-07-29T00:00:00.000Z";
  const TARGET_PER_GRADE = 300;
  const ADDITION_COUNTS = Object.freeze({
    "八年级": 288,
    "九年级": 266,
    "高一": 291,
    "高二": 292,
    "高三": 279
  });

  function number(value, digits = 3) {
    if (!Number.isFinite(value)) throw new Error("题目参数不是有限数值。");
    const rounded = Number(value.toFixed(digits));
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }

  function steps(...items) {
    return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  function choose(items, index) {
    return items[((index % items.length) + items.length) % items.length];
  }

  function inferQuestionType(templateResult = {}) {
    const explicit = String(templateResult.questionType || "").trim();
    if (explicit) return explicit;
    const text = [templateResult.title, templateResult.content, templateResult.solution].join(" ");
    if (/选择题|单选|多选|[A-D][.、)]/.test(text)) return "单项选择题";
    if (/填空|（\s*）|\(\s*\)|____|横线上/.test(text)) return "填空题";
    if (/实验|探究|器材|测量|装置|数据处理/.test(text)) return "实验题";
    if (/判断/.test(text)) return "判断题";
    if (/简答|说明|解释|为什么|论述/.test(text)) return "简答题";
    if (/求|计算|速度|质量|电流|电压|功率|能量|周期|距离|时间/.test(text)) return "计算题";
    return "未标注";
  }

  function buildQuestion(grade, sequence, templateResult, templateIndex = 0) {
    const stage = /^高/.test(grade) ? "高中" : "初中";
    const gradeCode = {
      "八年级": "g8",
      "九年级": "g9",
      "高一": "h1",
      "高二": "h2",
      "高三": "h3"
    }[grade];
    const examPoints = templateResult.examPoints || [templateResult.topic];
    const detailedSolution = [
      `【考察点】${examPoints.join("、")}`,
      "【分步解析】",
      templateResult.solution,
      `【最终结论】${templateResult.answer}`,
      "【结果复核】把结论代回题意，核对所求物理量、公式适用条件、单位（若有）、方向（若有）和数量级。"
    ].join("\n");
    const result = {
      id: `cs-original-1500-${gradeCode}-${String(sequence + 1).padStart(4, "0")}`,
      title: `${templateResult.title}｜变式${String(sequence + 1).padStart(3, "0")}`,
      stage,
      grade,
      topic: templateResult.topic,
      difficulty: templateResult.difficulty || choose(["基础", "进阶", "挑战"], sequence),
      questionType: inferQuestionType(templateResult),
      content: templateResult.content,
      solution: detailedSolution,
      answer: templateResult.answer,
      examPoints,
      source: "物理研习室原创·长沙课程适配练习",
      sourceUrl: "",
      sourceLicense: "原创内容；非教材原题、非官方真题",
      curriculumBasis: templateResult.curriculumBasis || `${grade}物理课程知识结构`,
      copyrightNote: "本题由确定性物理模型与参数模板原创生成，未复制第三方试题正文。",
      curriculumBook: templateResult.book || `${grade}物理`,
      curriculumChapter: templateResult.chapter || templateResult.topic,
      curriculumSection: templateResult.section || templateResult.examPoints?.[0] || templateResult.topic,
      collection: "changsha-original-practice-1500",
      syncOrigin: "bundled-original-practice",
      originalExercise: true,
      fullTextIncluded: true,
      evidenceTier: sequence < 75 ? "diagnostic-anchor" : "practice-variant",
      modelDefinitionId: templateResult.modelDefinitionId || `${gradeCode}-original-template-${String(templateIndex).padStart(3, "0")}`,
      retestGroupId: templateResult.retestGroupId || `${gradeCode}-original-template-${String(templateIndex).padStart(3, "0")}`,
      diagnosticEligible: sequence < 75,
      autoScorable: ["单项选择题", "多项选择题", "判断题", "填空题", "计算题"].includes(inferQuestionType(templateResult)),
      contentReviewStatus: "公式与数值规则校验通过，建议教师抽检",
      metadataReviewStatus: "已按年级、章节、知识点和难度分类",
      videoType: "none",
      videoUrl: "",
      videoName: "",
      attachments: [],
      mastered: false,
      wrong: false,
      wrongAt: null,
      wrongCount: 0,
      transferNotes: {},
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    };
    const required = ["id", "title", "grade", "topic", "content", "solution", "answer"];
    if (required.some((field) => !String(result[field] || "").trim())) {
      throw new Error(`原创题 ${result.id} 缺少必要字段。`);
    }
    if (/NaN|Infinity|undefined|null/.test(
      [result.content, result.solution, result.answer].join(" ")
    )) {
      throw new Error(`原创题 ${result.id} 含无效数值。`);
    }
    return result;
  }

  const grade8Templates = [
    (r) => {
      const speed = 2 + (r % 7);
      const time = 20 + 5 * (r % 9);
      const distance = speed * time;
      return {
        title: "校园直线运动的路程",
        topic: "机械运动",
        difficulty: "基础",
        content: `一名学生在长沙校园直跑道上以 ${speed} m/s 的速度做匀速直线运动，持续 ${time} s。求通过的路程。`,
        solution: steps(
          "研究学生的平动过程，已知速度和时间，匀速运动满足 s=vt。",
          `代入 s=${speed} m/s×${time} s=${distance} m。`,
          "单位校验：m/s 与 s 相乘得到 m。"
        ),
        answer: `通过的路程为 ${distance} m。`,
        examPoints: ["速度公式", "单位运算"],
        book: "八年级上册",
        chapter: "机械运动"
      };
    },
    (r) => {
      const d1 = 120 + 20 * (r % 8);
      const d2 = 180 + 30 * (r % 7);
      const t1 = 30 + 5 * (r % 5);
      const t2 = 40 + 5 * (r % 6);
      const average = (d1 + d2) / (t1 + t2);
      return {
        title: "分段运动的平均速度",
        topic: "机械运动",
        difficulty: "进阶",
        content: `一名学生先用 ${t1} s 走过 ${d1} m，又用 ${t2} s 走过 ${d2} m。求全程平均速度。`,
        solution: steps(
          `全程路程 s=${d1}+${d2}=${d1 + d2} m。`,
          `全程时间 t=${t1}+${t2}=${t1 + t2} s。`,
          `平均速度 v̄=s/t=${d1 + d2}/${t1 + t2}=${number(average)} m/s；不能直接平均两段速度。`
        ),
        answer: `全程平均速度为 ${number(average)} m/s。`,
        examPoints: ["平均速度", "分段运动"],
        book: "八年级上册",
        chapter: "机械运动"
      };
    },
    (r) => {
      const density = choose([0.8, 1.2, 2.5, 2.7, 7.8], r);
      const volume = 40 + 10 * (r % 12);
      const mass = density * volume;
      return {
        title: "物质密度与质量",
        topic: "质量与密度",
        difficulty: "基础",
        content: `某均匀实心样品的密度为 ${number(density)} g/cm³，体积为 ${volume} cm³。求样品质量。`,
        solution: steps(
          "均匀物质满足 ρ=m/V，因此 m=ρV。",
          `代入 m=${number(density)} g/cm³×${volume} cm³=${number(mass)} g。`,
          "cm³ 约去，结果单位为 g。"
        ),
        answer: `样品质量为 ${number(mass)} g。`,
        examPoints: ["密度公式", "质量计算"],
        book: "八年级上册",
        chapter: "质量与密度"
      };
    },
    (r) => {
      const soundSpeed = 340;
      const time = 0.8 + 0.1 * r;
      const distance = soundSpeed * time / 2;
      return {
        title: "回声测距",
        topic: "声现象",
        difficulty: "进阶",
        content: `某同学面向山崖发声，经过 ${number(time, 1)} s 听到回声。取空气中声速 340 m/s，求人与山崖的距离。`,
        solution: steps(
          "回声时间对应声音往返路程，单程距离应除以2。",
          `声音往返路程 s总=vt=340×${number(time, 1)}=${number(soundSpeed * time)} m。`,
          `人与山崖距离 d=s总/2=${number(distance)} m。`
        ),
        answer: `人与山崖的距离为 ${number(distance)} m。`,
        examPoints: ["声音传播", "回声测距"],
        book: "八年级上册",
        chapter: "声现象"
      };
    },
    (r) => {
      const mirrorAngle = 15 + 3 * r;
      const incidence = 90 - mirrorAngle;
      return {
        title: "光的反射角",
        topic: "光的反射",
        difficulty: "基础",
        content: `一束光与平面镜镜面成 ${mirrorAngle}° 角入射。求入射角和反射角。`,
        solution: steps(
          "入射角是入射光线与法线的夹角，法线与镜面垂直。",
          `入射角 i=90°-${mirrorAngle}°=${incidence}°。`,
          `根据反射定律，反射角 r=i=${incidence}°。`
        ),
        answer: `入射角和反射角均为 ${incidence}°。`,
        examPoints: ["反射定律", "法线与角度"],
        book: "八年级上册",
        chapter: "光现象"
      };
    },
    (r) => {
      const focal = 8 + 2 * (r % 7);
      const ratio = choose([0.5, 1.5, 2, 3], r);
      const objectDistance = focal * ratio;
      let image;
      if (ratio < 1) image = "正立、放大的虚像";
      else if (ratio === 2) image = "倒立、等大的实像";
      else if (ratio > 2) image = "倒立、缩小的实像";
      else image = "倒立、放大的实像";
      return {
        title: "凸透镜成像判断",
        topic: "透镜及其应用",
        difficulty: "进阶",
        questionType: "判断题",
        content: `凸透镜焦距为 ${focal} cm，物体到透镜的距离为 ${number(objectDistance)} cm。判断所成像的性质。`,
        solution: steps(
          `比较物距 u=${number(objectDistance)} cm 与焦距 f=${focal} cm、2f=${2 * focal} cm。`,
          ratio < 1
            ? "u<f，光屏不能承接该像，按凸透镜成像规律形成正立放大的虚像。"
            : ratio === 2
              ? "u=2f，形成倒立等大的实像。"
              : ratio > 2
                ? "u>2f，形成倒立缩小的实像。"
                : "f<u<2f，形成倒立放大的实像。",
          "结论只描述薄透镜近轴成像模型。"
        ),
        answer: `成${image}。`,
        examPoints: ["凸透镜成像规律", "物距与焦距"],
        book: "八年级上册",
        chapter: "透镜及其应用"
      };
    },
    (r) => {
      const mass = 2 + r;
      const g = 10;
      const gravity = mass * g;
      return {
        title: "物体重力",
        topic: "力",
        difficulty: "基础",
        content: `质量为 ${mass} kg 的物体位于地面附近，取 g=10 N/kg。求物体所受重力。`,
        solution: steps(
          "重力大小满足 G=mg，方向竖直向下。",
          `代入 G=${mass} kg×10 N/kg=${gravity} N。`,
          "kg 约去，单位为 N。"
        ),
        answer: `重力为 ${gravity} N，方向竖直向下。`,
        examPoints: ["重力公式", "力的方向"],
        book: "八年级下册",
        chapter: "力"
      };
    },
    (r) => {
      const pull = 12 + 2 * (r % 10);
      const friction = 3 + (r % 6);
      const mass = 2 + (r % 5);
      const net = pull - friction;
      const acceleration = net / mass;
      return {
        title: "水平拉力与运动状态",
        topic: "力与运动",
        difficulty: "进阶",
        content: `质量为 ${mass} kg 的物体在水平面上受到 ${pull} N 的水平拉力和 ${friction} N 的滑动摩擦力，两力方向相反。求合力；若用 F合=ma 估算加速度，求 a。`,
        solution: steps(
          "竖直方向重力与支持力平衡，只合成水平方向两力。",
          `合力 F合=${pull}-${friction}=${net} N，方向与拉力相同。`,
          `由 F合=ma，a=${net}/${mass}=${number(acceleration)} m/s²。`
        ),
        answer: `合力为 ${net} N，方向与拉力相同；加速度为 ${number(acceleration)} m/s²。`,
        examPoints: ["二力合成", "牛顿第二定律初步"],
        book: "八年级下册",
        chapter: "运动和力"
      };
    },
    (r) => {
      const force = 200 + 50 * (r % 10);
      const areaCm2 = 100 + 20 * (r % 9);
      const area = areaCm2 / 10000;
      const pressure = force / area;
      return {
        title: "接触面的压强",
        topic: "压强",
        difficulty: "进阶",
        content: `物体对水平地面的压力为 ${force} N，受力面积为 ${areaCm2} cm²。求物体对地面的压强。`,
        solution: steps(
          `换算面积 S=${areaCm2} cm²=${number(area, 4)} m²。`,
          "压强公式 p=F/S。",
          `代入 p=${force}/${number(area, 4)}=${number(pressure)} Pa。`
        ),
        answer: `压强为 ${number(pressure)} Pa。`,
        examPoints: ["压强公式", "面积单位换算"],
        book: "八年级下册",
        chapter: "压强"
      };
    },
    (r) => {
      const density = choose([800, 1000, 1200], r);
      const depth = 0.2 + 0.1 * r;
      const pressure = density * 10 * depth;
      return {
        title: "液体内部压强",
        topic: "液体压强",
        difficulty: "基础",
        content: `密度为 ${density} kg/m³ 的液体中，某点距自由液面的深度为 ${number(depth, 1)} m。取 g=10 N/kg，求该点由液体产生的压强。`,
        solution: steps(
          "同种静止液体内部压强可用 p=ρgh。",
          `代入 p=${density}×10×${number(depth, 1)}=${number(pressure)} Pa。`,
          "这里只计算液体产生的压强，不含大气压。"
        ),
        answer: `液体产生的压强为 ${number(pressure)} Pa。`,
        examPoints: ["液体压强", "深度"],
        book: "八年级下册",
        chapter: "压强"
      };
    },
    (r) => {
      const gravity = 20 + 5 * (r % 10);
      const apparent = gravity - (4 + (r % 8));
      const buoyancy = gravity - apparent;
      return {
        title: "称重法测浮力",
        topic: "浮力",
        difficulty: "基础",
        content: `物体在空气中用弹簧测力计测得重力为 ${gravity} N，完全浸没在水中时示数为 ${apparent} N。求物体受到的浮力。`,
        solution: steps(
          "物体静止时，竖直方向满足拉力与浮力之和等于重力。",
          "称重法公式 F浮=G-F示。",
          `代入 F浮=${gravity}-${apparent}=${buoyancy} N，方向竖直向上。`
        ),
        answer: `浮力为 ${buoyancy} N，方向竖直向上。`,
        examPoints: ["称重法测浮力", "受力平衡"],
        book: "八年级下册",
        chapter: "浮力"
      };
    },
    (r) => {
      const force1 = 20 + 5 * (r % 9);
      const arm1 = 0.2 + 0.1 * (r % 5);
      const arm2 = 0.4 + 0.1 * (r % 6);
      const force2 = force1 * arm1 / arm2;
      return {
        title: "杠杆平衡",
        topic: "简单机械",
        difficulty: "进阶",
        content: `杠杆水平平衡。动力为 ${force1} N，动力臂为 ${number(arm1, 1)} m，阻力臂为 ${number(arm2, 1)} m。求阻力。`,
        solution: steps(
          "杠杆平衡条件为 F₁l₁=F₂l₂。",
          `整理得 F₂=F₁l₁/l₂=${force1}×${number(arm1, 1)}/${number(arm2, 1)}。`,
          `计算得 F₂=${number(force2)} N。`
        ),
        answer: `阻力为 ${number(force2)} N。`,
        examPoints: ["杠杆平衡条件", "力臂"],
        book: "八年级下册",
        chapter: "简单机械"
      };
    },
    (r) => {
      const force = 50 + 10 * (r % 10);
      const distance = 2 + (r % 8);
      const time = 4 + (r % 7);
      const work = force * distance;
      const power = work / time;
      return {
        title: "机械功和功率",
        topic: "功和机械能",
        difficulty: "进阶",
        content: `水平恒力 ${force} N 使物体沿力的方向移动 ${distance} m，用时 ${time} s。求恒力做的功和平均功率。`,
        solution: steps(
          `力与位移同向，功 W=Fs=${force}×${distance}=${work} J。`,
          `平均功率 P=W/t=${work}/${time}=${number(power)} W。`,
          "功率反映做功快慢，不等同于做功多少。"
        ),
        answer: `做功 ${work} J，平均功率 ${number(power)} W。`,
        examPoints: ["功", "功率"],
        book: "八年级下册",
        chapter: "功和机械能"
      };
    },
    (r) => {
      const mass = 1 + (r % 6);
      const height = 2 + (r % 8);
      const energy = mass * 10 * height;
      const speed = Math.sqrt(2 * 10 * height);
      return {
        title: "重力势能转化",
        topic: "机械能",
        difficulty: "挑战",
        content: `质量为 ${mass} kg 的小球从距地面 ${height} m 高处由静止下落，忽略空气阻力，取 g=10 N/kg。求初始重力势能；用机械能守恒估算落地前速度。`,
        solution: steps(
          `取地面为零势能面，Ep=mgh=${mass}×10×${height}=${energy} J。`,
          "忽略阻力时机械能守恒，落地前有 ½mv²=mgh。",
          `约去质量，v=√(2gh)=√(2×10×${height})=${number(speed)} m/s。`
        ),
        answer: `初始重力势能为 ${energy} J，落地前速度约为 ${number(speed)} m/s。`,
        examPoints: ["重力势能", "机械能守恒初步"],
        book: "八年级下册",
        chapter: "功和机械能"
      };
    },
    (r) => {
      const initial = -10 + 2 * (r % 8);
      const final = initial + 15 + (r % 10);
      const change = final - initial;
      const state = choose(["熔化", "凝固", "汽化", "液化", "升华", "凝华"], r);
      const heat = ["熔化", "汽化", "升华"].includes(state) ? "吸热" : "放热";
      return {
        title: "温度变化与物态变化",
        topic: "物态变化",
        difficulty: "基础",
        questionType: "综合填空题",
        content: `某物体温度由 ${initial} ℃ 变为 ${final} ℃，温度变化量是多少？另判断物质发生“${state}”时是吸热还是放热。`,
        solution: steps(
          `温度变化量 ΔT=T末-T初=${final}-(${initial})=${change} ℃。`,
          `${state}属于${heat === "吸热" ? "物质能量增加" : "物质能量减少"}的物态变化，因此${heat}。`,
          "温度变化与物态变化潜热是两个不同问题，应分别判断。"
        ),
        answer: `温度变化量为 ${change} ℃；${state}过程${heat}。`,
        examPoints: ["温度变化量", "物态变化吸放热"],
        book: "八年级上册",
        chapter: "物态变化"
      };
    }
  ];

  const grade9Templates = [
    (r) => {
      const mass = 0.5 + 0.1 * (r % 10);
      const delta = 10 + 5 * (r % 8);
      const c = 4200;
      const heat = mass * c * delta;
      return {
        title: "水吸收的热量",
        topic: "内能与热传递",
        difficulty: "基础",
        content: `质量为 ${number(mass, 1)} kg 的水温度升高 ${delta} ℃，水的比热容取 4.2×10³ J/(kg·℃)。求水吸收的热量。`,
        solution: steps(
          "无物态变化时，吸热公式 Q=cmΔT。",
          `代入 Q=4.2×10³×${number(mass, 1)}×${delta}=${number(heat)} J。`,
          "质量用 kg、温差用 ℃，与比热容单位一致。"
        ),
        answer: `水吸收的热量为 ${number(heat)} J。`,
        examPoints: ["比热容", "热量计算"],
        book: "九年级全一册",
        chapter: "内能"
      };
    },
    (r) => {
      const mass = 0.02 + 0.01 * r;
      const q = choose([3.0e7, 4.2e7, 4.6e7], r);
      const heat = mass * q;
      return {
        title: "燃料完全燃烧放热",
        topic: "热机与能源",
        difficulty: "基础",
        content: `质量为 ${number(mass, 2)} kg 的燃料完全燃烧，热值为 ${number(q / 1e7, 1)}×10⁷ J/kg。求放出的热量。`,
        solution: steps(
          "燃料完全燃烧放热满足 Q放=mq。",
          `代入 Q放=${number(mass, 2)}×${number(q / 1e7, 1)}×10⁷=${number(heat)} J。`,
          "热值表示单位质量燃料完全燃烧放出的热量。"
        ),
        answer: `完全燃烧放热 ${number(heat)} J。`,
        examPoints: ["热值", "燃料放热"],
        book: "九年级全一册",
        chapter: "内能的利用"
      };
    },
    (r) => {
      const total = 2.0e6 + 2.0e5 * (r % 10);
      const efficiency = 0.2 + 0.05 * (r % 9);
      const useful = total * efficiency;
      return {
        title: "热机效率",
        topic: "热机效率",
        difficulty: "进阶",
        content: `某热机燃料完全燃烧释放 ${number(total)} J 热量，效率为 ${number(efficiency * 100)}%。求转化为有用机械功的能量。`,
        solution: steps(
          "热机效率 η=W有用/Q放。",
          `整理 W有用=ηQ放=${number(efficiency)}×${number(total)}。`,
          `得到 W有用=${number(useful)} J；其余能量主要散失到环境。`
        ),
        answer: `有用机械功为 ${number(useful)} J。`,
        examPoints: ["热机效率", "能量转化"],
        book: "九年级全一册",
        chapter: "内能的利用"
      };
    },
    (r) => {
      const voltage = choose([3, 4.5, 6, 9, 12], r);
      const resistance = choose([3, 5, 6, 9, 12, 15], r + 2);
      const current = voltage / resistance;
      return {
        title: "欧姆定律求电流",
        topic: "欧姆定律",
        difficulty: "基础",
        content: `某定值电阻两端电压为 ${voltage} V，电阻为 ${resistance} Ω。求通过电阻的电流。`,
        solution: steps(
          "定值电阻在给定状态下满足欧姆定律 I=U/R。",
          `代入 I=${voltage}/${resistance}=${number(current)} A。`,
          "电压单位 V、电阻单位 Ω，所得电流单位 A。"
        ),
        answer: `电流为 ${number(current)} A。`,
        examPoints: ["欧姆定律", "电流计算"],
        book: "九年级全一册",
        chapter: "欧姆定律"
      };
    },
    (r) => {
      const r1 = 3 + (r % 8);
      const r2 = 5 + (r % 10);
      const voltage = 6 + 3 * (r % 5);
      const total = r1 + r2;
      const current = voltage / total;
      const u2 = current * r2;
      return {
        title: "串联电路电流与分压",
        topic: "串联电路",
        difficulty: "进阶",
        content: `电阻 R₁=${r1} Ω、R₂=${r2} Ω 串联接在 ${voltage} V 电源两端，不计电源内阻。求电流及 R₂ 两端电压。`,
        solution: steps(
          `串联总电阻 R总=R₁+R₂=${r1}+${r2}=${total} Ω。`,
          `电流 I=U/R总=${voltage}/${total}=${number(current)} A。`,
          `R₂两端电压 U₂=IR₂=${number(current)}×${r2}=${number(u2)} V。`,
          `校验：U₁+U₂=${voltage} V。`
        ),
        answer: `电流为 ${number(current)} A，R₂两端电压为 ${number(u2)} V。`,
        examPoints: ["串联电路", "欧姆定律", "分压"],
        book: "九年级全一册",
        chapter: "欧姆定律"
      };
    },
    (r) => {
      const r1 = 4 + r;
      const r2 = 6 + 2 * r;
      const voltage = choose([6, 9, 12], r);
      const i1 = voltage / r1;
      const i2 = voltage / r2;
      const totalCurrent = i1 + i2;
      const equivalent = voltage / totalCurrent;
      return {
        title: "并联电路支路电流",
        topic: "并联电路",
        difficulty: "进阶",
        content: `R₁=${r1} Ω、R₂=${r2} Ω 并联在 ${voltage} V 电源两端。求两支路电流、干路电流和等效电阻。`,
        solution: steps(
          `并联支路电压相等，I₁=U/R₁=${voltage}/${r1}=${number(i1)} A。`,
          `I₂=U/R₂=${voltage}/${r2}=${number(i2)} A。`,
          `干路电流 I=I₁+I₂=${number(totalCurrent)} A。`,
          `等效电阻 R等=U/I=${voltage}/${number(totalCurrent)}=${number(equivalent)} Ω。`
        ),
        answer: `I₁=${number(i1)} A，I₂=${number(i2)} A，干路电流 ${number(totalCurrent)} A，等效电阻 ${number(equivalent)} Ω。`,
        examPoints: ["并联电路", "支路电流", "等效电阻"],
        book: "九年级全一册",
        chapter: "欧姆定律"
      };
    },
    (r) => {
      const voltage = choose([6, 9, 12, 24], r);
      const current = 0.2 + 0.05 * r;
      const power = voltage * current;
      return {
        title: "用电器电功率",
        topic: "电功率",
        difficulty: "基础",
        content: `某用电器两端电压为 ${voltage} V，通过的电流为 ${number(current, 2)} A。求用电器的电功率。`,
        solution: steps(
          "用电器在该工作状态下的电功率 P=UI。",
          `代入 P=${voltage}×${number(current, 2)}=${number(power)} W。`,
          "电功率表示单位时间消耗或转化的电能。"
        ),
        answer: `电功率为 ${number(power)} W。`,
        examPoints: ["电功率", "P=UI"],
        book: "九年级全一册",
        chapter: "电功率"
      };
    },
    (r) => {
      const powerKw = 0.5 + 0.25 * (r % 9);
      const hours = 1 + 0.5 * (r % 8);
      const price = 0.55 + 0.05 * (r % 5);
      const energy = powerKw * hours;
      const cost = energy * price;
      return {
        title: "家庭用电量与电费",
        topic: "电能",
        difficulty: "进阶",
        content: `额定功率为 ${number(powerKw)} kW 的用电器正常工作 ${number(hours, 1)} h。电价按 ${number(price, 2)} 元/(kW·h) 计算，求耗电量和电费。`,
        solution: steps(
          `用电量 W=Pt=${number(powerKw)}×${number(hours, 1)}=${number(energy)} kW·h。`,
          `电费=${number(energy)}×${number(price, 2)}=${number(cost, 2)} 元。`,
          "kW 与 h 配套可直接得到 kW·h。"
        ),
        answer: `耗电量 ${number(energy)} kW·h，电费约 ${number(cost, 2)} 元。`,
        examPoints: ["电能", "千瓦时", "生活用电"],
        book: "九年级全一册",
        chapter: "电功率"
      };
    },
    (r) => {
      const current = 1 + 0.2 * (r % 8);
      const resistance = 5 + (r % 10);
      const time = 60 + 30 * (r % 9);
      const heat = current * current * resistance * time;
      return {
        title: "焦耳定律",
        topic: "电热",
        difficulty: "进阶",
        content: `电流 ${number(current, 1)} A 通过 ${resistance} Ω 的电阻 ${time} s。电能全部转化为内能，求产生的热量。`,
        solution: steps(
          "纯电阻电路产生的热量可用 Q=I²Rt。",
          `代入 Q=${number(current, 1)}²×${resistance}×${time}=${number(heat)} J。`,
          "电流应先平方，时间单位使用 s。"
        ),
        answer: `产生热量 ${number(heat)} J。`,
        examPoints: ["焦耳定律", "电热"],
        book: "九年级全一册",
        chapter: "生活用电"
      };
    },
    (r) => {
      const ratedVoltage = choose([6, 12, 24, 220], r);
      const ratedPower = 3 + 3 * r;
      const resistance = ratedVoltage * ratedVoltage / ratedPower;
      const current = ratedPower / ratedVoltage;
      return {
        title: "额定状态参数",
        topic: "电功率",
        difficulty: "进阶",
        content: `某纯电阻用电器标有“${ratedVoltage} V ${ratedPower} W”。求其正常工作电流和工作电阻。`,
        solution: steps(
          `额定状态下 I额=P额/U额=${ratedPower}/${ratedVoltage}=${number(current)} A。`,
          `由 P=U²/R 得 R=U额²/P额=${ratedVoltage}²/${ratedPower}=${number(resistance)} Ω。`,
          "只在额定电压下称为正常工作。"
        ),
        answer: `正常工作电流 ${number(current)} A，电阻 ${number(resistance)} Ω。`,
        examPoints: ["额定功率", "电阻计算"],
        book: "九年级全一册",
        chapter: "电功率"
      };
    },
    (r) => {
      const voltage = 12;
      const fixed = 6 + 2 * (r % 6);
      const variable1 = 2 + (r % 5);
      const variable2 = variable1 + 3 + (r % 4);
      const current1 = voltage / (fixed + variable1);
      const current2 = voltage / (fixed + variable2);
      return {
        title: "滑动变阻器动态电路",
        topic: "动态电路",
        difficulty: "挑战",
        content: `定值电阻 ${fixed} Ω 与滑动变阻器串联在 12 V 电源上。变阻器接入电阻由 ${variable1} Ω 增大到 ${variable2} Ω。分别求两状态电流，并判断电流表示数变化。`,
        solution: steps(
          `初态总电阻 R总1=${fixed}+${variable1}=${fixed + variable1} Ω，I₁=12/${fixed + variable1}=${number(current1)} A。`,
          `末态总电阻 R总2=${fixed}+${variable2}=${fixed + variable2} Ω，I₂=12/${fixed + variable2}=${number(current2)} A。`,
          "电源电压不变而总电阻增大，所以电流表示数减小。"
        ),
        answer: `初态 ${number(current1)} A，末态 ${number(current2)} A；电流表示数减小。`,
        examPoints: ["滑动变阻器", "动态电路", "欧姆定律"],
        book: "九年级全一册",
        chapter: "欧姆定律"
      };
    },
    (r) => {
      const weight = 200 + 50 * (r % 8);
      const height = 1 + 0.5 * (r % 6);
      // 理想动滑轮自由端拉力下限为 G/2；额外加量用于表示轮轴摩擦等损耗，
      // 从参数源头保证总功大于有用功、机械效率严格小于 100%。
      const pull = Math.ceil(weight / 2 + 20 + 5 * (r % 5));
      const distance = 2 * height;
      const useful = weight * height;
      const total = pull * distance;
      const efficiency = useful / total * 100;
      return {
        title: "动滑轮机械效率",
        topic: "机械效率",
        difficulty: "挑战",
        content: `用动滑轮把重 ${weight} N 的物体匀速提升 ${number(height, 1)} m，自由端拉力为 ${pull} N，自由端移动距离取物体升高距离的2倍。求有用功、总功和机械效率。`,
        solution: steps(
          `有用功 W有=Gh=${weight}×${number(height, 1)}=${number(useful)} J。`,
          `自由端距离 s=2h=${number(distance, 1)} m，总功 W总=Fs=${pull}×${number(distance, 1)}=${number(total)} J。`,
          `机械效率 η=W有/W总×100%=${number(efficiency, 1)}%。`
        ),
        answer: `有用功 ${number(useful)} J，总功 ${number(total)} J，效率约 ${number(efficiency, 1)}%。`,
        examPoints: ["有用功", "总功", "机械效率"],
        book: "九年级综合复习",
        chapter: "简单机械"
      };
    },
    (r) => {
      const hotMass = 0.2 + 0.1 * (r % 5);
      const coldMass = 0.3 + 0.1 * (r % 6);
      const hotTemp = 70 + 2 * (r % 10);
      const coldTemp = 10 + 2 * (r % 8);
      const finalTemp = (hotMass * hotTemp + coldMass * coldTemp) / (hotMass + coldMass);
      return {
        title: "同种液体混合温度",
        topic: "热平衡",
        difficulty: "挑战",
        content: `将 ${number(hotMass, 1)} kg、${hotTemp} ℃ 的热水与 ${number(coldMass, 1)} kg、${coldTemp} ℃ 的冷水混合，忽略容器吸热和热损失。求平衡温度。`,
        solution: steps(
          "同为水且无热损失，热水放热等于冷水吸热。",
          `m热c(T热-T)=m冷c(T-T冷)，比热容 c 可约去。`,
          `整理 T=(m热T热+m冷T冷)/(m热+m冷)=(${number(hotMass, 1)}×${hotTemp}+${number(coldMass, 1)}×${coldTemp})/${number(hotMass + coldMass, 1)}=${number(finalTemp)} ℃。`,
          "结果位于冷热水初温之间，数量级合理。"
        ),
        answer: `平衡温度约为 ${number(finalTemp)} ℃。`,
        examPoints: ["热平衡", "吸放热相等"],
        book: "九年级综合复习",
        chapter: "内能"
      };
    },
    (r) => {
      const direction = choose([
        ["闭合线圈中的磁通量增大", "产生感应电流", "闭合回路中的磁通量发生变化"],
        ["闭合线圈中的磁通量减小", "产生感应电流", "闭合回路中的磁通量发生变化"],
        ["闭合线圈静止在恒定匀强磁场中，面积和方向均不变", "不产生感应电流", "闭合回路中的磁通量保持不变"],
        ["一根未接成闭合回路的导体棒垂直切割磁感线", "不产生持续感应电流", "导体两端虽可出现感应电动势，但电路没有闭合"],
        ["闭合电路的一部分导体垂直切割磁感线", "产生感应电流", "闭合电路的一部分导体切割磁感线"],
        ["闭合线圈整体在恒定匀强磁场中平移，面积和方向均不变", "不产生感应电流", "穿过线圈的磁通量没有变化"],
        ["条形磁体插入闭合线圈", "产生感应电流", "穿过线圈的磁通量发生变化"],
        ["条形磁体从闭合线圈中抽出", "产生感应电流", "穿过线圈的磁通量发生变化"],
        ["条形磁体在线圈内保持静止", "不产生感应电流", "磁体与线圈相对静止，磁通量不变"],
        ["闭合线圈在匀强磁场中绕直径转动", "产生感应电流", "线圈与磁场夹角改变，磁通量随时间变化"],
        ["闭合线圈平面与磁场方向平行并保持静止", "不产生感应电流", "磁通量虽为零但没有发生变化"],
        ["闭合线圈在磁场中的面积逐渐增大", "产生感应电流", "穿过线圈的磁通量随面积改变"],
        ["闭合线圈静止，但垂直线圈平面的磁场逐渐增强", "产生感应电流", "穿过线圈的磁通量随磁场强度改变"],
        ["闭合线圈静止，但磁场方向逐渐改变", "产生感应电流", "磁场与线圈夹角改变使磁通量变化"],
        ["磁体与闭合线圈保持相对静止并一起匀速移动", "不产生感应电流", "相对位置不变，穿过线圈的磁通量不变"],
        ["闭合电路中的直导线沿磁感线方向运动", "不产生感应电流", "导线没有切割磁感线，磁通量不变"],
        ["闭合电路中的直导线垂直磁感线运动", "产生感应电流", "闭合电路的一部分导体切割磁感线"]
      ], r);
      return {
        title: "电磁感应条件",
        topic: "电与磁",
        difficulty: "基础",
        questionType: "判断题",
        content: `判断下列过程是否产生感应电流，并说明依据：${direction[0]}。`,
        solution: steps(
          "先确认研究对象是否形成闭合电路。",
          "再判断穿过闭合回路的磁通量是否变化，或导体是否切割磁感线。",
          `${direction[0]}，${direction[2]}，因此${direction[1]}。`
        ),
        answer: `${direction[1]}；判断依据是${direction[2]}。`,
        examPoints: ["电磁感应", "感应电流条件"],
        book: "九年级全一册",
        chapter: "信息的传递与能源"
      };
    },
    (r) => {
      const scene = choose([
        ["更换灯泡前先断开开关", "正确", "可避免带电操作"],
        ["用湿手触摸工作中的开关", "错误", "水会降低人体和接触处电阻，增大触电风险"],
        ["金属外壳用电器使用三脚插头", "正确", "保护接地可在外壳漏电时降低触电风险"],
        ["保险丝熔断后用粗铜丝替代", "错误", "铜丝不易及时熔断，会失去过流保护"],
        ["导线绝缘层破损后继续使用", "错误", "裸露导体会增加触电和短路风险"],
        ["在同一插线板上同时使用多个大功率用电器", "错误", "总电流可能超过导线和插座允许值而过热"],
        ["电器着火时先切断电源再采用合适方式灭火", "正确", "先断电可降低触电和持续短路风险"],
        ["拔插头时直接拉扯电源线", "错误", "可能损伤导线连接和绝缘层"],
        ["照明开关接在火线上", "正确", "断开开关后灯具与火线隔离，检修风险较低"],
        ["家庭总电路安装合格的剩余电流动作保护器", "正确", "发生漏电时保护器可及时切断电路"],
        ["用手直接接触导线判断是否带电", "错误", "人体可能形成触电回路，应使用合格检测工具"],
        ["在高压线附近放风筝", "错误", "风筝线可能靠近或接触高压线造成放电事故"],
        ["发现落地电线后立即靠近查看", "错误", "落地点附近可能存在跨步电压，应远离并报告"],
        ["清洁用电器前拔下电源插头", "正确", "切断电源可避免误启动和触电"],
        ["用电器冒烟后仍继续通电观察", "错误", "故障可能扩大并导致触电或火灾"],
        ["把保护地线接到燃气管道上", "错误", "燃气管道不能代替专用保护接地导体"],
        ["有幼儿的家庭为闲置插座安装安全保护盖", "正确", "可降低幼儿误触带电插孔的风险"]
      ], r);
      return {
        title: "家庭电路安全",
        topic: "安全用电",
        difficulty: "基础",
        questionType: "判断题",
        content: `判断做法是否符合安全用电原则：${scene[0]}。`,
        solution: steps(
          "识别是否存在人体接触带电体、漏电或过流风险。",
          `该做法${scene[1]}，因为${scene[2]}。`,
          "安全判断不能只看设备是否暂时能工作，还要考虑保护装置和人体电流。"
        ),
        answer: `${scene[1]}；${scene[2]}。`,
        examPoints: ["家庭电路", "安全用电"],
        book: "九年级全一册",
        chapter: "生活用电"
      };
    }
  ];

  const high1Templates = [
    (r) => {
      const v0 = 2 + (r % 8);
      const a = 1 + 0.5 * (r % 6);
      const t = 2 + (r % 7);
      const v = v0 + a * t;
      return {
        title: "匀变速直线运动速度",
        topic: "匀变速直线运动",
        difficulty: "基础",
        content: `物体沿直线运动，初速度 ${v0} m/s，加速度 ${number(a, 1)} m/s²，经过 ${t} s。求末速度。`,
        solution: steps(
          "规定初速度方向为正，加速度与初速度同向。",
          `匀变速速度公式 v=v₀+at=${v0}+${number(a, 1)}×${t}=${number(v)} m/s。`,
          "加速度为正，末速度大于初速度，方向判断一致。"
        ),
        answer: `末速度为 ${number(v)} m/s。`,
        examPoints: ["速度时间关系", "正方向"],
        book: "高中物理必修第一册",
        chapter: "匀变速直线运动"
      };
    },
    (r) => {
      const v0 = 1 + (r % 6);
      const a = 1 + (r % 5);
      const t = 2 + (r % 6);
      const displacement = v0 * t + 0.5 * a * t * t;
      return {
        title: "匀加速运动位移",
        topic: "匀变速直线运动",
        difficulty: "进阶",
        content: `物体以 ${v0} m/s 初速度做加速度为 ${a} m/s² 的匀加速直线运动，持续 ${t} s。求位移。`,
        solution: steps(
          "选择运动方向为正，位移公式 x=v₀t+½at²。",
          `代入 x=${v0}×${t}+½×${a}×${t}²=${number(displacement)} m。`,
          "两项单位均为 m，可以相加。"
        ),
        answer: `位移为 ${number(displacement)} m。`,
        examPoints: ["位移时间关系", "匀加速运动"],
        book: "高中物理必修第一册",
        chapter: "匀变速直线运动"
      };
    },
    (r) => {
      const speed = 10 + 2 * (r % 11);
      const deceleration = 2 + (r % 5);
      const time = speed / deceleration;
      const distance = speed * speed / (2 * deceleration);
      return {
        title: "汽车制动距离",
        topic: "匀变速直线运动",
        difficulty: "进阶",
        content: `汽车以 ${speed} m/s 行驶后做加速度大小为 ${deceleration} m/s² 的匀减速运动，直至停止。求制动时间和制动距离。`,
        solution: steps(
          "取原运动方向为正，则 a=-" + deceleration + " m/s²，末速度 v=0。",
          `由 v=v₀+at，t=(0-${speed})/(-${deceleration})=${number(time)} s。`,
          `由 v²-v₀²=2ax，x=${speed}²/(2×${deceleration})=${number(distance)} m。`
        ),
        answer: `制动时间 ${number(time)} s，制动距离 ${number(distance)} m。`,
        examPoints: ["匀减速运动", "制动距离"],
        book: "高中物理必修第一册",
        chapter: "匀变速直线运动"
      };
    },
    (r) => {
      const time = 1 + 0.25 * r;
      const g = 10;
      const speed = g * time;
      const height = 0.5 * g * time * time;
      return {
        title: "自由落体运动",
        topic: "自由落体",
        difficulty: "基础",
        content: `小球从静止开始自由下落 ${number(time, 2)} s，忽略空气阻力，取 g=10 m/s²。求末速度和下落高度。`,
        solution: steps(
          "自由落体是初速度为0、加速度为g的匀加速直线运动。",
          `末速度 v=gt=10×${number(time, 2)}=${number(speed)} m/s，方向竖直向下。`,
          `高度 h=½gt²=½×10×${number(time, 2)}²=${number(height)} m。`
        ),
        answer: `末速度 ${number(speed)} m/s，方向向下；下落高度 ${number(height)} m。`,
        examPoints: ["自由落体", "运动学公式"],
        book: "高中物理必修第一册",
        chapter: "匀变速直线运动"
      };
    },
    (r) => {
      const mass = 2 + (r % 8);
      const force = 10 + 2 * (r % 10);
      const friction = 2 + (r % 5);
      const acceleration = (force - friction) / mass;
      return {
        title: "水平面牛顿第二定律",
        topic: "牛顿运动定律",
        difficulty: "进阶",
        content: `质量为 ${mass} kg 的物体在水平面上受水平拉力 ${force} N，滑动摩擦力 ${friction} N。求加速度大小和方向。`,
        solution: steps(
          "以物体为研究对象，竖直方向支持力与重力平衡。",
          `水平方向合力 F合=${force}-${friction}=${force - friction} N，方向与拉力相同。`,
          `由 F合=ma，a=${force - friction}/${mass}=${number(acceleration)} m/s²。`
        ),
        answer: `加速度为 ${number(acceleration)} m/s²，方向与拉力相同。`,
        examPoints: ["受力分析", "牛顿第二定律"],
        book: "高中物理必修第一册",
        chapter: "牛顿运动定律"
      };
    },
    (r) => {
      const mass = 1 + (r % 6);
      const mu = 0.1 + 0.05 * (r % 7);
      const angle = choose([
        { name: "30°", sin: 0.5, cos: Math.sqrt(3) / 2 },
        { name: "约37°", sin: 0.6, cos: 0.8 },
        { name: "约53°", sin: 0.8, cos: 0.6 }
      ], r);
      const acceleration = 10 * (angle.sin - mu * angle.cos);
      return {
        title: "斜面滑块加速度",
        topic: "牛顿运动定律",
        difficulty: "挑战",
        content: `质量为 ${mass} kg 的滑块沿倾角 ${angle.name} 的斜面下滑，动摩擦因数 μ=${number(mu, 2)}，取 g=10 m/s²，sin${angle.name}=${number(angle.sin)}，cos${angle.name}=${number(angle.cos)}。求加速度。`,
        solution: steps(
          "沿斜面向下建立正方向，支持力 N=mgcosθ。",
          "滑动摩擦力 f=μN=μmgcosθ，方向沿斜面向上。",
          "沿斜面列式 ma=mgsinθ-μmgcosθ。",
          `a=g(sinθ-μcosθ)=10×(${number(angle.sin)}-${number(mu, 2)}×${number(angle.cos)})=${number(acceleration)} m/s²。`
        ),
        answer: `加速度约为 ${number(acceleration)} m/s²，方向沿斜面向下。`,
        examPoints: ["斜面受力", "摩擦力", "牛顿第二定律"],
        book: "高中物理必修第一册",
        chapter: "牛顿运动定律"
      };
    },
    (r) => {
      const m1 = 1 + (r % 5);
      const m2 = 2 + (r % 6);
      const force = 12 + 3 * (r % 8);
      const acceleration = force / (m1 + m2);
      const tension = m2 * acceleration;
      return {
        title: "连接体整体与隔离",
        topic: "连接体",
        difficulty: "挑战",
        content: `光滑水平面上质量 ${m1} kg 和 ${m2} kg 的两个物块用轻绳相连，水平恒力 ${force} N 作用在前一个物块上。求系统加速度和绳中张力。`,
        solution: steps(
          `以两物块整体为研究对象，外力只有 ${force} N，a=F/(m₁+m₂)=${force}/${m1 + m2}=${number(acceleration)} m/s²。`,
          `隔离质量 ${m2} kg 的后物块，其水平合力为张力 T。`,
          `T=m₂a=${m2}×${number(acceleration)}=${number(tension)} N。`
        ),
        answer: `系统加速度 ${number(acceleration)} m/s²，绳中张力 ${number(tension)} N。`,
        examPoints: ["整体法", "隔离法", "连接体"],
        book: "高中物理必修第一册",
        chapter: "牛顿运动定律"
      };
    },
    (r) => {
      const height = 5 * (1 + (r % 8));
      const speed = 5 + (r % 11);
      const time = Math.sqrt(2 * height / 10);
      const range = speed * time;
      return {
        title: "平抛运动时间与射程",
        topic: "曲线运动",
        difficulty: "进阶",
        content: `小球从 ${height} m 高处以 ${speed} m/s 水平抛出，忽略空气阻力，取 g=10 m/s²。求落地时间和水平位移。`,
        solution: steps(
          "竖直方向为自由落体，h=½gt²。",
          `t=√(2h/g)=√(2×${height}/10)=${number(time)} s。`,
          `水平方向匀速，x=v₀t=${speed}×${number(time)}=${number(range)} m。`
        ),
        answer: `落地时间约 ${number(time)} s，水平位移约 ${number(range)} m。`,
        examPoints: ["平抛运动", "运动分解"],
        book: "高中物理必修第二册",
        chapter: "抛体运动"
      };
    },
    (r) => {
      const speed = 4 + (r % 9);
      const radius = 2 + (r % 7);
      const mass = 0.5 + 0.5 * (r % 6);
      const acceleration = speed * speed / radius;
      const force = mass * acceleration;
      return {
        title: "圆周运动向心量",
        topic: "圆周运动",
        difficulty: "进阶",
        content: `质量为 ${number(mass, 1)} kg 的物体以 ${speed} m/s 速度做半径 ${radius} m 的匀速圆周运动。求向心加速度和所需向心力。`,
        solution: steps(
          `向心加速度 aₙ=v²/r=${speed}²/${radius}=${number(acceleration)} m/s²。`,
          `向心力是合力沿半径方向的分量，Fₙ=maₙ=${number(mass, 1)}×${number(acceleration)}=${number(force)} N。`,
          "向心加速度和向心力始终指向圆心。"
        ),
        answer: `向心加速度 ${number(acceleration)} m/s²，向心力 ${number(force)} N，均指向圆心。`,
        examPoints: ["向心加速度", "向心力"],
        book: "高中物理必修第二册",
        chapter: "圆周运动"
      };
    },
    (r) => {
      const mass = 1 + (r % 7);
      const initial = 2 + (r % 6);
      const final = initial + 3 + (r % 5);
      const work = 0.5 * mass * (final * final - initial * initial);
      return {
        title: "动能定理求合力功",
        topic: "动能定理",
        difficulty: "进阶",
        content: `质量为 ${mass} kg 的物体速度由 ${initial} m/s 增大到 ${final} m/s。求此过程中合力所做的功。`,
        solution: steps(
          "动能定理：合力功 W合=ΔEk。",
          `W合=½m(v²-v₀²)=½×${mass}×(${final}²-${initial}²)。`,
          `计算 W合=${number(work)} J；结果为正，符合速度增大的事实。`
        ),
        answer: `合力做功 ${number(work)} J。`,
        examPoints: ["动能定理", "合力功"],
        book: "高中物理必修第二册",
        chapter: "机械能守恒定律"
      };
    },
    (r) => {
      const mass = 1 + (r % 5);
      const height = 2 + (r % 9);
      const speed = Math.sqrt(20 * height);
      return {
        title: "机械能守恒求速度",
        topic: "机械能守恒",
        difficulty: "进阶",
        content: `质量为 ${mass} kg 的小球从高 ${height} m 处由静止下落，忽略阻力，取 g=10 m/s²。求到达零势能面时的速度。`,
        solution: steps(
          "只有重力做功，机械能守恒。",
          "选零势能面为末位置，mgh=½mv²，质量约去。",
          `v=√(2gh)=√(20×${height})=${number(speed)} m/s。`,
          "速度与质量无关是该理想模型的结果。"
        ),
        answer: `速度约为 ${number(speed)} m/s。`,
        examPoints: ["机械能守恒", "零势能面"],
        book: "高中物理必修第二册",
        chapter: "机械能守恒定律"
      };
    },
    (r) => {
      const force = 500 + 100 * (r % 10);
      const speed = 5 + (r % 8);
      const power = force * speed;
      return {
        title: "牵引力的瞬时功率",
        topic: "功率",
        difficulty: "基础",
        content: `车辆在水平路面上以 ${speed} m/s 匀速行驶，牵引力为 ${force} N 且与速度同向。求牵引力的瞬时功率。`,
        solution: steps(
          "力与速度同向，瞬时功率 P=Fv。",
          `代入 P=${force}×${speed}=${power} W。`,
          `换算为 ${number(power / 1000)} kW。`
        ),
        answer: `瞬时功率为 ${power} W，即 ${number(power / 1000)} kW。`,
        examPoints: ["瞬时功率", "P=Fv"],
        book: "高中物理必修第二册",
        chapter: "功与功率"
      };
    },
    (r) => {
      const force = 10 + 2 * (r % 10);
      const time = 0.5 + 0.5 * (r % 8);
      const mass = 1 + (r % 6);
      const impulse = force * time;
      const deltaV = impulse / mass;
      return {
        title: "冲量与动量变化",
        topic: "动量定理",
        difficulty: "进阶",
        content: `质量为 ${mass} kg 的物体受到方向不变、大小 ${force} N 的合力作用 ${number(time, 1)} s。求合力冲量及速度变化量。`,
        solution: steps(
          `冲量 I=Ft=${force}×${number(time, 1)}=${number(impulse)} N·s。`,
          "动量定理 I=Δp=mΔv。",
          `Δv=I/m=${number(impulse)}/${mass}=${number(deltaV)} m/s，方向与合力相同。`
        ),
        answer: `冲量 ${number(impulse)} N·s，速度变化量 ${number(deltaV)} m/s，方向与合力相同。`,
        examPoints: ["冲量", "动量定理"],
        book: "高中物理选择性必修第一册",
        chapter: "动量守恒定律"
      };
    },
    (r) => {
      const m1 = 1 + (r % 5);
      const m2 = 1 + ((r + 2) % 6);
      const v1 = 2 + (r % 8);
      const velocity = m1 * v1 / (m1 + m2);
      return {
        title: "完全非弹性碰撞",
        topic: "动量守恒",
        difficulty: "挑战",
        content: `质量 ${m1} kg 的物体以 ${v1} m/s 速度撞上静止的 ${m2} kg 物体，碰后粘在一起。忽略外力冲量，求共同速度。`,
        solution: steps(
          "以两物体为系统，碰撞时间短且外力冲量可忽略，系统动量守恒。",
          `m₁v₁=(m₁+m₂)v，共同速度 v=${m1}×${v1}/${m1 + m2}。`,
          `计算 v=${number(velocity)} m/s，方向与原运动方向相同。`
        ),
        answer: `共同速度为 ${number(velocity)} m/s，方向与原运动方向相同。`,
        examPoints: ["动量守恒", "完全非弹性碰撞"],
        book: "高中物理选择性必修第一册",
        chapter: "动量守恒定律"
      };
    },
    (r) => {
      const extension = 0.02 + 0.005 * r;
      const stiffness = 100 + 10 * r;
      const force = stiffness * extension;
      return {
        title: "胡克定律",
        topic: "弹力",
        difficulty: "基础",
        content: `弹簧在弹性限度内伸长 ${number(extension, 3)} m，劲度系数为 ${stiffness} N/m。求弹簧弹力大小。`,
        solution: steps(
          "在弹性限度内，胡克定律 F=kx。",
          `代入 F=${stiffness}×${number(extension, 3)}=${number(force)} N。`,
          "弹力方向与形变量方向相反，指向恢复原状的方向。"
        ),
        answer: `弹力大小为 ${number(force)} N，方向指向恢复原状的方向。`,
        examPoints: ["胡克定律", "弹力方向"],
        book: "高中物理必修第一册",
        chapter: "相互作用力"
      };
    }
  ];

  const high2Templates = [
    (r) => {
      const q1 = (1 + r % 5) * 1e-6;
      const q2 = (2 + r % 6) * 1e-6;
      const distance = 0.1 + 0.05 * (r % 8);
      const force = 9e9 * q1 * q2 / (distance * distance);
      return {
        title: "库仑力大小",
        topic: "静电场",
        difficulty: "进阶",
        content: `真空中两个点电荷电量分别为 ${number(q1 * 1e6)} μC、${number(q2 * 1e6)} μC，相距 ${number(distance, 2)} m。取 k=9.0×10⁹ N·m²/C²，求库仑力大小。`,
        solution: steps(
          "点电荷且距离远大于电荷尺度，可用库仑定律 F=k|q₁q₂|/r²。",
          `换算 q₁=${number(q1 * 1e6)}×10⁻⁶ C，q₂=${number(q2 * 1e6)}×10⁻⁶ C。`,
          `代入 F=9.0×10⁹×${number(q1 * 1e6)}×10⁻⁶×${number(q2 * 1e6)}×10⁻⁶/${number(distance, 2)}²=${number(force)} N。`
        ),
        answer: `库仑力大小为 ${number(force)} N；同号相斥、异号相吸。`,
        examPoints: ["库仑定律", "电荷单位换算"],
        book: "高中物理选择性必修第三册",
        chapter: "静电场"
      };
    },
    (r) => {
      const charge = (1 + r % 8) * 1e-6;
      const force = 0.02 + 0.01 * (r % 10);
      const field = force / charge;
      return {
        title: "由试探电荷求场强",
        topic: "电场强度",
        difficulty: "基础",
        content: `正试探电荷电量为 ${number(charge * 1e6)} μC，在某点所受电场力为 ${number(force, 2)} N。求该点电场强度。`,
        solution: steps(
          "电场强度定义 E=F/q，方向与正试探电荷受力方向相同。",
          `换算 q=${number(charge * 1e6)}×10⁻⁶ C。`,
          `E=${number(force, 2)}/(${number(charge * 1e6)}×10⁻⁶)=${number(field)} N/C。`
        ),
        answer: `场强为 ${number(field)} N/C，方向与正试探电荷受力方向相同。`,
        examPoints: ["电场强度定义", "方向判断"],
        book: "高中物理选择性必修第三册",
        chapter: "静电场"
      };
    },
    (r) => {
      const charge = (1 + r % 8) * 1e-6;
      const voltage = 50 + 25 * (r % 10);
      const work = charge * voltage;
      return {
        title: "电场力做功与电势差",
        topic: "电势能",
        difficulty: "进阶",
        content: `电量为 ${number(charge * 1e6)} μC 的正电荷从 A 点移到 B 点，U_AB=${voltage} V。求电场力做功和电势能变化。`,
        solution: steps(
          "电势差定义对应电场力功 W_AB=qU_AB。",
          `代入 W=${number(charge * 1e6)}×10⁻⁶×${voltage}=${number(work, 8)} J。`,
          "电场力做正功时，电势能减少，ΔEp=-W。"
        ),
        answer: `电场力做功 ${number(work, 8)} J，电势能减少 ${number(work, 8)} J。`,
        examPoints: ["电场力做功", "电势能变化"],
        book: "高中物理选择性必修第三册",
        chapter: "静电场"
      };
    },
    (r) => {
      const capacitance = (2 + r % 9) * 1e-6;
      const voltage = 10 + 5 * (r % 10);
      const charge = capacitance * voltage;
      const energy = 0.5 * capacitance * voltage * voltage;
      return {
        title: "电容器电荷量与能量",
        topic: "电容器",
        difficulty: "进阶",
        content: `电容为 ${number(capacitance * 1e6)} μF 的电容器接在 ${voltage} V 电源上。求电荷量及储存的电场能。`,
        solution: steps(
          `电荷量 Q=CU=${number(capacitance * 1e6)}×10⁻⁶×${voltage}=${number(charge, 8)} C。`,
          "理想电容器电场能 E=½CU²。",
          `E=½×${number(capacitance * 1e6)}×10⁻⁶×${voltage}²=${number(energy, 8)} J。`
        ),
        answer: `电荷量 ${number(charge, 8)} C，电场能 ${number(energy, 8)} J。`,
        examPoints: ["电容定义", "电容器能量"],
        book: "高中物理选择性必修第三册",
        chapter: "静电场"
      };
    },
    (r) => {
      const emf = 6 + r;
      const external = 2 + 0.5 * r;
      const internal = 0.5 + 0.1 * (r % 6);
      const current = emf / (external + internal);
      const terminal = current * external;
      return {
        title: "闭合电路欧姆定律",
        topic: "恒定电流",
        difficulty: "进阶",
        content: `电源电动势为 ${emf} V、内阻为 ${number(internal, 1)} Ω，外电阻为 ${number(external, 1)} Ω。求电路电流和路端电压。`,
        solution: steps(
          `闭合电路电流 I=E/(R+r)=${emf}/(${number(external, 1)}+${number(internal, 1)})=${number(current)} A。`,
          `路端电压 U=IR=${number(current)}×${number(external, 1)}=${number(terminal)} V。`,
          `也可用 U=E-Ir 校验，结果小于电动势。`
        ),
        answer: `电流 ${number(current)} A，路端电压 ${number(terminal)} V。`,
        examPoints: ["闭合电路欧姆定律", "路端电压"],
        book: "高中物理选择性必修第三册",
        chapter: "恒定电流"
      };
    },
    (r) => {
      const charge = (1 + r % 6) * 1e-6;
      const speed = (2 + r % 8) * 1e5;
      const field = 0.1 + 0.05 * (r % 8);
      const force = charge * speed * field;
      return {
        title: "带电粒子洛伦兹力",
        topic: "磁场",
        difficulty: "基础",
        content: `电量绝对值为 ${number(charge * 1e6)} μC 的粒子以 ${number(speed / 1e5)}×10⁵ m/s 垂直进入 ${number(field, 2)} T 匀强磁场。求洛伦兹力大小。`,
        solution: steps(
          "速度与磁场垂直，洛伦兹力大小 F=|q|vB。",
          `代入 F=${number(charge * 1e6)}×10⁻⁶×${number(speed / 1e5)}×10⁵×${number(field, 2)}=${number(force, 8)} N。`,
          "力方向垂直于速度和磁场，正负电荷方向相反。"
        ),
        answer: `洛伦兹力大小为 ${number(force, 8)} N。`,
        examPoints: ["洛伦兹力", "左手定则"],
        book: "高中物理选择性必修第二册",
        chapter: "磁场"
      };
    },
    (r) => {
      const current = 2 + (r % 8);
      const length = 0.2 + 0.1 * (r % 7);
      const field = 0.1 + 0.05 * (r % 8);
      const force = field * current * length;
      return {
        title: "通电导线安培力",
        topic: "磁场",
        difficulty: "基础",
        content: `长 ${number(length, 1)} m 的直导线垂直放在 ${number(field, 2)} T 匀强磁场中，电流为 ${current} A。求安培力大小。`,
        solution: steps(
          "导线与磁场垂直，安培力 F=BIL。",
          `代入 F=${number(field, 2)}×${current}×${number(length, 1)}=${number(force)} N。`,
          "方向由左手定则判断，并同时垂直于电流和磁场。"
        ),
        answer: `安培力大小 ${number(force)} N。`,
        examPoints: ["安培力", "左手定则"],
        book: "高中物理选择性必修第二册",
        chapter: "磁场"
      };
    },
    (r) => {
      const mass = 1.67e-27;
      const charge = 1.6e-19;
      const speed = (2 + r % 8) * 1e6;
      const field = 0.2 + 0.1 * (r % 7);
      const radius = mass * speed / (charge * field);
      return {
        title: "带电粒子磁场半径",
        topic: "带电粒子在磁场中的运动",
        difficulty: "挑战",
        content: `质子以 ${number(speed / 1e6)}×10⁶ m/s 垂直进入 ${number(field, 1)} T 匀强磁场。取质子质量 1.67×10⁻²⁷ kg、电量 1.60×10⁻¹⁹ C。求轨道半径。`,
        solution: steps(
          "洛伦兹力提供向心力：qvB=mv²/r。",
          "整理 r=mv/(qB)。",
          `代入 r=(1.67×10⁻²⁷×${number(speed / 1e6)}×10⁶)/(1.60×10⁻¹⁹×${number(field, 1)})=${number(radius, 6)} m。`
        ),
        answer: `轨道半径约 ${number(radius, 6)} m。`,
        examPoints: ["洛伦兹力提供向心力", "轨道半径"],
        book: "高中物理选择性必修第二册",
        chapter: "磁场"
      };
    },
    (r) => {
      const turns = 50 + 10 * (r % 10);
      const deltaFlux = (1 + r % 8) * 1e-4;
      const time = 0.02 + 0.01 * (r % 8);
      const emf = turns * deltaFlux / time;
      return {
        title: "法拉第电磁感应定律",
        topic: "电磁感应",
        difficulty: "进阶",
        content: `匝数 ${turns} 的线圈中，每匝磁通量在 ${number(time, 2)} s 内改变 ${number(deltaFlux * 1e4)}×10⁻⁴ Wb。求平均感应电动势。`,
        solution: steps(
          "平均感应电动势大小 E=N|ΔΦ|/Δt。",
          `代入 E=${turns}×${number(deltaFlux * 1e4)}×10⁻⁴/${number(time, 2)}=${number(emf)} V。`,
          "楞次定律用于判断方向，本题只求大小。"
        ),
        answer: `平均感应电动势为 ${number(emf)} V。`,
        examPoints: ["法拉第电磁感应定律", "磁通量变化"],
        book: "高中物理选择性必修第二册",
        chapter: "电磁感应"
      };
    },
    (r) => {
      const field = 0.2 + 0.1 * (r % 7);
      const length = 0.4 + 0.1 * (r % 6);
      const speed = 2 + (r % 8);
      const emf = field * length * speed;
      return {
        title: "导体棒切割磁感线",
        topic: "电磁感应",
        difficulty: "进阶",
        content: `长 ${number(length, 1)} m 的导体棒以 ${speed} m/s 速度垂直切割 ${number(field, 1)} T 匀强磁场，棒、速度和磁场两两垂直。求感应电动势。`,
        solution: steps(
          "在两两垂直且匀速切割条件下，E=BLv。",
          `代入 E=${number(field, 1)}×${number(length, 1)}×${speed}=${number(emf)} V。`,
          "若回路闭合，再结合总电阻求感应电流。"
        ),
        answer: `感应电动势为 ${number(emf)} V。`,
        examPoints: ["动生电动势", "切割磁感线"],
        book: "高中物理选择性必修第二册",
        chapter: "电磁感应"
      };
    },
    (r) => {
      const rms = 110 + 5 * r;
      const peak = rms * Math.sqrt(2);
      return {
        title: "正弦交流电峰值",
        topic: "交变电流",
        difficulty: "基础",
        content: `某正弦交流电压有效值为 ${rms} V。求其峰值。`,
        solution: steps(
          "正弦交流电有效值与峰值满足 U=Um/√2。",
          `因此 Um=√2U=√2×${rms}=${number(peak)} V。`,
          "电表交流挡通常显示有效值。"
        ),
        answer: `峰值约为 ${number(peak)} V。`,
        examPoints: ["交流电有效值", "峰值"],
        book: "高中物理选择性必修第二册",
        chapter: "交变电流"
      };
    },
    (r) => {
      const n1 = 500 + 50 * r;
      const n2 = 50 + 10 * r;
      const u1 = 220;
      const u2 = u1 * n2 / n1;
      return {
        title: "理想变压器电压",
        topic: "变压器",
        difficulty: "进阶",
        content: `理想变压器原线圈 ${n1} 匝接 220 V 交流电，副线圈 ${n2} 匝。求副线圈电压。`,
        solution: steps(
          "理想变压器满足 U₁/U₂=n₁/n₂。",
          `U₂=U₁n₂/n₁=220×${n2}/${n1}=${number(u2)} V。`,
          `${n2 < n1 ? "副线圈匝数少，是降压变压器。" : "副线圈匝数多，是升压变压器。"}`
        ),
        answer: `副线圈电压为 ${number(u2)} V。`,
        examPoints: ["理想变压器", "匝数比"],
        book: "高中物理选择性必修第二册",
        chapter: "交变电流"
      };
    },
    (r) => {
      const frequency = 50 + 5 * r;
      const wavelength = 0.5 + 0.05 * r;
      const speed = frequency * wavelength;
      return {
        title: "机械波传播速度",
        topic: "机械波",
        difficulty: "基础",
        content: `一列简谐波频率为 ${frequency} Hz，波长为 ${number(wavelength, 2)} m。求波速。`,
        solution: steps(
          "同一介质中的波速满足 v=fλ。",
          `代入 v=${frequency}×${number(wavelength, 2)}=${number(speed)} m/s。`,
          "频率由波源决定，波速由介质性质决定。"
        ),
        answer: `波速为 ${number(speed)} m/s。`,
        examPoints: ["波速公式", "频率与波长"],
        book: "高中物理选择性必修第一册",
        chapter: "机械波"
      };
    },
    (r) => {
      const mass = 0.2 + 0.1 * (r % 8);
      const stiffness = 20 + 10 * (r % 10);
      const period = 2 * Math.PI * Math.sqrt(mass / stiffness);
      return {
        title: "弹簧振子周期",
        topic: "简谐运动",
        difficulty: "进阶",
        content: `水平弹簧振子质量为 ${number(mass, 1)} kg，弹簧劲度系数 ${stiffness} N/m，忽略阻力。求振动周期。`,
        solution: steps(
          "理想弹簧振子周期 T=2π√(m/k)。",
          `代入 T=2π√(${number(mass, 1)}/${stiffness})=${number(period)} s。`,
          "周期与振幅无关，但依赖质量和劲度系数。"
        ),
        answer: `振动周期约 ${number(period)} s。`,
        examPoints: ["简谐运动周期", "弹簧振子"],
        book: "高中物理选择性必修第一册",
        chapter: "机械振动"
      };
    },
    (r) => {
      const slit = (0.2 + 0.05 * (r % 8)) * 1e-3;
      const distance = 1 + 0.2 * (r % 8);
      const wavelength = (500 + 10 * (r % 10)) * 1e-9;
      const spacing = wavelength * distance / slit;
      return {
        title: "双缝干涉条纹间距",
        topic: "光的干涉",
        difficulty: "挑战",
        content: `双缝间距 ${number(slit * 1e3, 2)} mm，缝到屏距离 ${number(distance, 1)} m，单色光波长 ${number(wavelength * 1e9)} nm。求相邻亮条纹间距。`,
        solution: steps(
          "小角度近似下，条纹间距 Δx=λL/d。",
          `统一为SI单位：λ=${number(wavelength * 1e9)}×10⁻⁹ m，d=${number(slit * 1e3, 2)}×10⁻³ m。`,
          `Δx=λL/d=${number(spacing, 6)} m=${number(spacing * 1000)} mm。`
        ),
        answer: `相邻亮条纹间距约 ${number(spacing * 1000)} mm。`,
        examPoints: ["双缝干涉", "条纹间距"],
        book: "高中物理选择性必修第一册",
        chapter: "光"
      };
    }
  ];

  const high3Templates = [
    (r) => {
      const mass = 1 + (r % 5);
      const height = 2 + (r % 8);
      const frictionWork = 5 + 5 * (r % 8);
      const kinetic = Math.max(0, mass * 10 * height - frictionWork);
      const speed = Math.sqrt(2 * kinetic / mass);
      return {
        title: "含阻力的能量转化",
        topic: "力学综合",
        difficulty: "挑战",
        content: `质量为 ${mass} kg 的物体从高 ${height} m 处由静止滑下，重力势能以地面为零，过程中克服阻力做功 ${frictionWork} J。取 g=10 m/s²，求到达底端时速度。`,
        solution: steps(
          `初始重力势能 Ep=mgh=${mass}×10×${height}=${mass * 10 * height} J。`,
          `功能关系：末动能 Ek=mgh-W阻=${mass * 10 * height}-${frictionWork}=${kinetic} J。`,
          `由 Ek=½mv²，v=√(2Ek/m)=${number(speed)} m/s。`,
          "末动能小于无阻力情形，方向与能量损失判断一致。"
        ),
        answer: `底端速度约为 ${number(speed)} m/s。`,
        examPoints: ["功能关系", "机械能损失", "动能"],
        book: "高三物理综合复习",
        chapter: "力学综合"
      };
    },
    (r) => {
      const mass = 1 + (r % 4);
      const speed = 4 + (r % 8);
      const secondMass = 1 + ((r + 1) % 5);
      const common = mass * speed / (mass + secondMass);
      const height = common * common / 20;
      return {
        title: "碰撞后上升高度",
        topic: "动量与能量",
        difficulty: "挑战",
        content: `质量 ${mass} kg 的物块以 ${speed} m/s 撞上静止的 ${secondMass} kg 物块并粘在一起，随后无摩擦冲上斜面。取 g=10 m/s²，求共同速度和最大竖直高度。`,
        solution: steps(
          "碰撞阶段外力冲量可忽略，动量守恒。",
          `共同速度 v=${mass}×${speed}/${mass + secondMass}=${number(common)} m/s。`,
          "碰后上滑阶段机械能守恒：½(m₁+m₂)v²=(m₁+m₂)gh。",
          `h=v²/(2g)=${number(common)}²/20=${number(height)} m。`
        ),
        answer: `共同速度 ${number(common)} m/s，最大竖直高度 ${number(height)} m。`,
        examPoints: ["动量守恒", "机械能守恒", "过程分段"],
        book: "高三物理综合复习",
        chapter: "动量与能量综合"
      };
    },
    (r) => {
      const voltage = 100 + 50 * (r % 8);
      const charge = 1.6e-19;
      const mass = 1.67e-27;
      const speed = Math.sqrt(2 * charge * voltage / mass);
      const field = 0.2 + 0.1 * (r % 6);
      const radius = mass * speed / (charge * field);
      return {
        title: "电场加速后进入磁场",
        topic: "电磁场综合",
        difficulty: "挑战",
        content: `质子由静止经 ${voltage} V 电压加速后垂直进入 ${number(field, 1)} T 匀强磁场。取 e=1.60×10⁻¹⁹ C，m=1.67×10⁻²⁷ kg。求速度和轨道半径。`,
        solution: steps(
          "电场加速阶段由动能定理 eU=½mv²。",
          `v=√(2eU/m)=${number(speed)} m/s。`,
          "磁场中洛伦兹力提供向心力，r=mv/(eB)。",
          `r=1.67×10⁻²⁷×${number(speed)}/(1.60×10⁻¹⁹×${number(field, 1)})=${number(radius, 6)} m。`
        ),
        answer: `速度约 ${number(speed)} m/s，轨道半径约 ${number(radius, 6)} m。`,
        examPoints: ["电场加速", "洛伦兹力", "过程组合"],
        book: "高三物理综合复习",
        chapter: "电磁场综合"
      };
    },
    (r) => {
      const field = 0.5 + 0.1 * (r % 6);
      const length = 0.5 + 0.1 * (r % 6);
      const speed = 2 + (r % 7);
      const resistance = 1 + 0.5 * (r % 8);
      const emf = field * length * speed;
      const current = emf / resistance;
      const power = current * current * resistance;
      return {
        title: "导体棒感应电流与功率",
        topic: "电磁感应综合",
        difficulty: "挑战",
        content: `导体棒长 ${number(length, 1)} m，以 ${speed} m/s 垂直切割 ${number(field, 1)} T 匀强磁场，闭合回路总电阻 ${number(resistance, 1)} Ω。忽略其他损耗，求感应电动势、电流和热功率。`,
        solution: steps(
          `动生电动势 E=BLv=${number(field, 1)}×${number(length, 1)}×${speed}=${number(emf)} V。`,
          `电流 I=E/R=${number(emf)}/${number(resistance, 1)}=${number(current)} A。`,
          `热功率 P=I²R=${number(current)}²×${number(resistance, 1)}=${number(power)} W。`,
          "匀速维持时外力机械功率等于电路热功率。"
        ),
        answer: `E=${number(emf)} V，I=${number(current)} A，热功率 ${number(power)} W。`,
        examPoints: ["动生电动势", "闭合电路", "能量转化"],
        book: "高三物理综合复习",
        chapter: "电磁感应综合"
      };
    },
    (r) => {
      const trueResistance = 5 + (r % 16);
      const current = 0.1 + 0.05 * (r % 10);
      const voltage = trueResistance * current;
      return {
        title: "伏安法测电阻数据处理",
        topic: "电学实验",
        difficulty: "进阶",
        content: `伏安法测电阻的一组数据为 U=${number(voltage)} V、I=${number(current, 2)} A。求电阻；若电压表测量值偏大而电流值准确，判断计算结果偏大还是偏小。`,
        solution: steps(
          `由 R=U/I=${number(voltage)}/${number(current, 2)}=${trueResistance} Ω。`,
          "误差判断应直接分析比值 R测=U测/I测。",
          "电压测量值偏大而分母准确，因此计算电阻偏大。"
        ),
        answer: `电阻为 ${trueResistance} Ω；所述误差会使计算结果偏大。`,
        examPoints: ["伏安法测电阻", "实验误差"],
        book: "高三物理实验复习",
        chapter: "电学实验"
      };
    },
    (r) => {
      const workFunction = 2 + 0.1 * (r % 10);
      const photonEnergy = workFunction + 0.5 + 0.2 * (r % 8);
      const maxKinetic = photonEnergy - workFunction;
      const stopping = maxKinetic;
      return {
        title: "光电效应逸出功",
        topic: "光电效应",
        difficulty: "进阶",
        content: `某金属逸出功为 ${number(workFunction, 1)} eV，入射光子能量为 ${number(photonEnergy, 1)} eV。求光电子最大初动能和遏止电压。`,
        solution: steps(
          "爱因斯坦光电效应方程 Ekmax=hν-W₀。",
          `Ekmax=${number(photonEnergy, 1)}-${number(workFunction, 1)}=${number(maxKinetic, 1)} eV。`,
          "遏止电压满足 eUc=Ekmax；当能量用 eV 表示时，数值对应 V。",
          `Uc=${number(stopping, 1)} V。`
        ),
        answer: `最大初动能 ${number(maxKinetic, 1)} eV，遏止电压 ${number(stopping, 1)} V。`,
        examPoints: ["光电效应方程", "遏止电压"],
        book: "高中物理选择性必修第三册",
        chapter: "波粒二象性"
      };
    },
    (r) => {
      const momentum = (2 + 0.5 * r) * 1e-24;
      const wavelength = 6.626e-34 / momentum;
      return {
        title: "德布罗意波长",
        topic: "波粒二象性",
        difficulty: "进阶",
        content: `某粒子动量大小为 ${number(momentum / 1e-24)}×10⁻²⁴ kg·m/s，取普朗克常量 h=6.626×10⁻³⁴ J·s。求德布罗意波长。`,
        solution: steps(
          "物质波波长 λ=h/p。",
          `代入 λ=6.626×10⁻³⁴/(${number(momentum / 1e-24)}×10⁻²⁴)。`,
          `计算 λ=${number(wavelength, 12)} m=${number(wavelength * 1e9)} nm。`
        ),
        answer: `德布罗意波长约 ${number(wavelength * 1e9)} nm。`,
        examPoints: ["德布罗意关系", "动量"],
        book: "高中物理选择性必修第三册",
        chapter: "波粒二象性"
      };
    },
    (r) => {
      const halfLife = 2 + (r % 8);
      const periods = 1 + (r % 6);
      const initial = 80 * Math.pow(2, periods);
      const remaining = initial / Math.pow(2, periods);
      const time = halfLife * periods;
      return {
        title: "放射性半衰期",
        topic: "原子核",
        difficulty: "基础",
        content: `某放射性样品初始质量 ${initial} mg，半衰期 ${halfLife} d。经过 ${time} d 后尚未衰变的质量是多少？`,
        solution: steps(
          `经过的半衰期数 n=t/T=${time}/${halfLife}=${periods}。`,
          `剩余质量 m=m₀(1/2)ⁿ=${initial}×(1/2)^${periods}=${remaining} mg。`,
          "半衰期是统计规律，不表示单个原子在固定时间衰变。"
        ),
        answer: `尚未衰变的质量为 ${remaining} mg。`,
        examPoints: ["半衰期", "指数衰减"],
        book: "高中物理选择性必修第三册",
        chapter: "原子核"
      };
    },
    (r) => {
      const massDefectU = 0.002 + 0.0005 * r;
      const energyMeV = massDefectU * 931.5;
      return {
        title: "质量亏损与核能",
        topic: "核能",
        difficulty: "进阶",
        content: `某核反应质量亏损为 ${number(massDefectU, 4)} u，取 1 u 对应 931.5 MeV/c²。求释放能量。`,
        solution: steps(
          "质能关系 ΔE=Δmc²。",
          "使用给定换算，质量亏损以 u 表示时，能量 ΔE=Δm×931.5 MeV。",
          `ΔE=${number(massDefectU, 4)}×931.5=${number(energyMeV)} MeV。`
        ),
        answer: `释放能量约 ${number(energyMeV)} MeV。`,
        examPoints: ["质能方程", "质量亏损"],
        book: "高中物理选择性必修第三册",
        chapter: "原子核"
      };
    },
    (r) => {
      const pressure1 = 1.0e5 + 0.1e5 * (r % 6);
      const volume1 = 2 + 0.5 * (r % 7);
      const pressure2 = 1.5e5 + 0.1e5 * (r % 6);
      const volume2 = pressure1 * volume1 / pressure2;
      return {
        title: "等温气体状态变化",
        topic: "气体实验定律",
        difficulty: "进阶",
        content: `一定质量理想气体温度不变，初态压强 ${number(pressure1 / 1e5, 1)}×10⁵ Pa、体积 ${number(volume1, 1)} L；末态压强 ${number(pressure2 / 1e5, 1)}×10⁵ Pa。求末态体积。`,
        solution: steps(
          "一定质量理想气体等温变化满足 p₁V₁=p₂V₂。",
          `V₂=p₁V₁/p₂=${number(pressure1 / 1e5, 1)}×${number(volume1, 1)}/${number(pressure2 / 1e5, 1)}=${number(volume2)} L。`,
          "压强增大时体积减小，趋势与结果一致。"
        ),
        answer: `末态体积约 ${number(volume2)} L。`,
        examPoints: ["玻意耳定律", "等温变化"],
        book: "高中物理选择性必修第三册",
        chapter: "气体"
      };
    },
    (r) => {
      const heat = 500 + 100 * (r % 10);
      const workByGas = 100 + 50 * (r % 8);
      const deltaU = heat - workByGas;
      return {
        title: "热力学第一定律",
        topic: "热力学定律",
        difficulty: "进阶",
        content: `气体吸收热量 ${heat} J，同时对外做功 ${workByGas} J。求气体内能变化。`,
        solution: steps(
          "采用 ΔU=Q-W，其中 Q 为气体吸热，W 为气体对外做功。",
          `代入 ΔU=${heat}-${workByGas}=${deltaU} J。`,
          `${deltaU > 0 ? "内能增加" : "内能减少"}，符号与能量收支一致。`
        ),
        answer: `气体内能增加 ${deltaU} J。`,
        examPoints: ["热力学第一定律", "符号约定"],
        book: "高中物理选择性必修第三册",
        chapter: "热力学定律"
      };
    },
    (r) => {
      const frequency = 200 + 10 * r;
      const speed = 340;
      const wavelength = speed / frequency;
      return {
        title: "声波频率与波长",
        topic: "机械波综合",
        difficulty: "基础",
        content: `空气中声速取 340 m/s，某声波频率为 ${frequency} Hz。求波长。`,
        solution: steps(
          "波速、频率和波长满足 v=fλ。",
          `λ=v/f=340/${frequency}=${number(wavelength)} m。`,
          "在同一介质中声速近似固定，频率越高波长越短。"
        ),
        answer: `波长约 ${number(wavelength)} m。`,
        examPoints: ["波速公式", "声波"],
        book: "高三物理综合复习",
        chapter: "机械振动与机械波"
      };
    },
    (r) => {
      const focal = 0.1 + 0.005 * r;
      const objectDistance = focal * choose([1.5, 2, 2.5, 3], r);
      const imageDistance = 1 / (1 / focal - 1 / objectDistance);
      return {
        title: "薄透镜成像公式",
        topic: "几何光学",
        difficulty: "挑战",
        content: `薄凸透镜焦距 ${number(focal, 3)} m，实物位于透镜前 ${number(objectDistance, 3)} m。按 1/f=1/u+1/v 求像距。`,
        solution: steps(
          "在薄透镜近轴模型下使用 1/f=1/u+1/v。",
          `1/v=1/${number(focal, 3)}-1/${number(objectDistance, 3)}。`,
          `求得 v=${number(imageDistance, 3)} m，v>0 表示形成实像。`
        ),
        answer: `像距约 ${number(imageDistance, 3)} m，形成实像。`,
        examPoints: ["薄透镜公式", "实像判断"],
        book: "高三物理综合复习",
        chapter: "光学"
      };
    },
    (r) => {
      const amplitude = 0.05 + 0.01 * (r % 10);
      const stiffness = 100 + 20 * (r % 8);
      const energy = 0.5 * stiffness * amplitude * amplitude;
      return {
        title: "简谐振动机械能",
        topic: "机械振动",
        difficulty: "进阶",
        content: `水平弹簧振子劲度系数 ${stiffness} N/m，振幅 ${number(amplitude, 2)} m，忽略阻力。求振动总机械能。`,
        solution: steps(
          "在最大位移处速度为0，总能量等于弹性势能。",
          "E=½kA²。",
          `代入 E=½×${stiffness}×${number(amplitude, 2)}²=${number(energy)} J。`,
          "无阻尼理想模型中该机械能保持不变。"
        ),
        answer: `振动总机械能为 ${number(energy)} J。`,
        examPoints: ["简谐运动能量", "弹性势能"],
        book: "高三物理综合复习",
        chapter: "机械振动"
      };
    },
    (r) => {
      const orbitalRadius = (7 + 0.25 * r) * 1e6;
      const mu = 4.0e14;
      const speed = Math.sqrt(mu / orbitalRadius);
      const period = 2 * Math.PI * Math.sqrt(Math.pow(orbitalRadius, 3) / mu);
      return {
        title: "卫星圆轨道速度与周期",
        topic: "万有引力",
        difficulty: "挑战",
        content: `某卫星绕地球做半径 ${number(orbitalRadius / 1e6)}×10⁶ m 的匀速圆周运动，取地球引力参数 GM=4.0×10¹⁴ m³/s²。求轨道速度和周期。`,
        solution: steps(
          "万有引力提供向心力，GMm/r²=mv²/r。",
          `v=√(GM/r)=√(4.0×10¹⁴/(${number(orbitalRadius / 1e6)}×10⁶))=${number(speed)} m/s。`,
          "周期 T=2πr/v，也可用 T=2π√(r³/GM)。",
          `计算 T=${number(period)} s。`
        ),
        answer: `轨道速度约 ${number(speed)} m/s，周期约 ${number(period)} s。`,
        examPoints: ["万有引力提供向心力", "卫星周期"],
        book: "高三物理综合复习",
        chapter: "万有引力与航天"
      };
    }
  ];

  const templateGroups = {
    "八年级": grade8Templates,
    "九年级": grade9Templates,
    "高一": high1Templates,
    "高二": high2Templates,
    "高三": high3Templates
  };

  const questions = Object.entries(ADDITION_COUNTS).flatMap(([grade, count]) => {
    const templates = templateGroups[grade];
    return Array.from({ length: count }, (_, sequence) => {
      const templateIndex = sequence % templates.length;
      const template = templates[templateIndex];
      const round = Math.floor(sequence / templates.length);
      return buildQuestion(grade, sequence, template(round, sequence), templateIndex);
    });
  });

  const ids = new Set();
  const counts = {};
  const invalid = [];
  questions.forEach((question) => {
    counts[question.grade] = (counts[question.grade] || 0) + 1;
    if (ids.has(question.id)) invalid.push(`${question.id}:重复编号`);
    ids.add(question.id);
    if (!question.solution.includes("1.") || question.solution.length < 50) {
      invalid.push(`${question.id}:解题步骤不完整`);
    }
  });
  const expectedTotal = Object.values(ADDITION_COUNTS).reduce((sum, count) => sum + count, 0);
  if (questions.length !== expectedTotal || invalid.length) {
    throw new Error(`原创1500题库生成失败：${invalid[0] || "数量不符"}`);
  }

  const normalizedQuestions = questions.map((question) => ({
    ...question,
    knowledgePointId: question.knowledgePointId || `kp:${String(question.topic || question.id).normalize("NFKC").replace(/中的?/g, "").replace(/[^\p{L}\p{N}]+/gu, "-")}`,
    cognitiveDemand: question.cognitiveDemand || (question.difficulty === "挑战" ? "迁移" : question.difficulty === "进阶" ? "应用" : "基础"),
    representationType: question.representationType || (/实验|探究/.test(String(question.questionType || "")) ? "实验" : /图|图像/.test(String(question.content || "")) ? "图像" : "文字/公式"),
    independenceGroupId: question.independenceGroupId || question.modelDefinitionId,
    assessmentPurpose: question.assessmentPurpose || "practice"
  }));

  window.PHYSICS_ORIGINAL_PRACTICE_BANK = Object.freeze({
    version: VERSION,
    contentVersion: CONTENT_VERSION,
    targetCompleteQuestions: 1500,
    targetPerGrade: TARGET_PER_GRADE,
    additionCounts: ADDITION_COUNTS,
    questions: Object.freeze(normalizedQuestions.map(Object.freeze)),
    manifest: Object.freeze({
      generatedCount: questions.length,
      counts: Object.freeze({ ...counts }),
      templateCounts: Object.freeze(Object.fromEntries(
        Object.entries(templateGroups).map(([grade, templates]) => [grade, templates.length])
      )),
      duplicateCount: questions.length - ids.size,
      invalidCount: invalid.length,
      classification: "八年级至高三，按年级、章节、知识点和难度分类",
      provenance: "物理研习室原创参数化练习；非官方真题、非教材原题"
    })
  });
})();
