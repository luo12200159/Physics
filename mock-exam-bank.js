(() => {
  "use strict";

  const COPYRIGHT_NOTE = "物理研习室原创模拟题，可随应用离线使用；不是历年真题，也不是第三方模拟卷原题。";
  const JUNIOR_BASIS = "依据《义务教育物理课程标准（2022年版）》相关内容要求，结合长沙初中物理常见综合复习知识结构编写。";
  const SENIOR_BASIS = "依据《普通高中物理课程标准（2017年版2020年修订）》相关内容要求，结合湖南高考物理复习知识结构编写。";

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
      `先明确题目条件、研究对象和所求结论，本题主要考察${points.join("、")}。`,
      ...fragments,
      `整理上述推理，按题目要求写出结论：${definition.answer}`
    ];
    return [
      `【考察点】${points.join("、")}`,
      "【分步解析】",
      ...reasoning.map((line, index) => `${index + 1}. ${line}`),
      `【最终结论】${definition.answer}`,
      "【结果复核】核对设问、公式或规律的适用条件、单位、方向和数量级；选择题同时核对其余选项。"
    ].join("\n");
  }

  const juniorDefinitions = [
    {
      id: "cs-mock-2027-zk-a-q01",
      number: 1,
      questionType: "单项选择题",
      topic: "声现象",
      difficulty: "基础",
      title: "声音的产生与传播",
      content: `用橡皮锤敲击频率为 440 Hz 的音叉，音叉发声。下列说法正确的是（　）
A. 音叉振动产生声音，声音不能在真空中传播
B. 音叉不振动也能持续发声
C. 440 Hz 表示音叉每分钟振动 440 次
D. 声音在空气中的传播不需要介质`,
      solution: `第 1 步：声音由物体振动产生，发声的音叉正在振动。
第 2 步：声音是机械波，传播需要介质，不能在真空中传播。
第 3 步：频率 440 Hz 表示音叉每秒振动 440 次，而不是每分钟。
因此只有 A 正确。`,
      answer: "选 A。音叉振动是声源，空气是传播声音的介质；440 Hz 的物理意义是每秒振动 440 次。",
      examPoints: ["声音的产生", "声音传播的条件", "频率的物理意义"]
    },
    {
      id: "cs-mock-2027-zk-a-q02",
      number: 2,
      questionType: "单项选择题",
      topic: "物态变化",
      difficulty: "基础",
      title: "冰饮料瓶外水珠的形成",
      content: `夏天，从冰箱中取出一瓶温度较低的饮料，过一会儿瓶外出现小水珠。小水珠形成时发生的物态变化是（　）
A. 熔化　　B. 汽化　　C. 液化　　D. 凝华`,
      solution: `瓶外的小水珠并不是从瓶内渗出的。空气中的水蒸气遇到温度较低的瓶壁，放出热量并由气态变为液态，这一过程叫液化。`,
      answer: "选 C。空气中的水蒸气遇冷液化成小水滴，附着在饮料瓶外壁。",
      examPoints: ["液化", "生活中的物态变化", "吸放热判断"]
    },
    {
      id: "cs-mock-2027-zk-a-q03",
      number: 3,
      questionType: "单项选择题",
      topic: "平面镜成像",
      difficulty: "基础",
      title: "人靠近平面镜时像与人的距离",
      content: `一名同学站在竖直平面镜前 2.0 m 处。她沿垂直镜面的方向向镜面靠近 0.5 m 后，像与她之间的距离为（　）
A. 1.0 m　　B. 1.5 m　　C. 2.0 m　　D. 3.0 m`,
      solution: `移动后，人到镜面的距离为 2.0 m − 0.5 m = 1.5 m。平面镜所成的像到镜面的距离等于物体到镜面的距离，所以像到镜面的距离也为 1.5 m。人和像分居镜面两侧，两者距离为 1.5 m + 1.5 m = 3.0 m。`,
      answer: "选 D。移动后人和像各距镜面 1.5 m，因此人到像的距离为 3.0 m。",
      examPoints: ["平面镜成像特点", "像距与物距", "对称关系"]
    },
    {
      id: "cs-mock-2027-zk-a-q04",
      number: 4,
      questionType: "单项选择题",
      topic: "惯性",
      difficulty: "基础",
      title: "公交车制动时的惯性现象",
      content: `公交车向前直线行驶时突然制动，站立的乘客身体容易向前倾。对此解释正确的是（　）
A. 乘客受到向前的惯性力
B. 乘客上身由于惯性仍保持原来的运动状态
C. 制动后乘客的惯性消失
D. 速度越小，乘客的质量越小`,
      solution: `制动时，乘客的脚与车厢接触，受到车厢作用而较快减速；上身由于惯性仍要保持原来的向前运动状态，因此身体向前倾。惯性是物体保持原有运动状态的性质，不是一种力，也不会因制动而消失；质量不随速度改变。`,
      answer: "选 B。脚随车减速，上身由于惯性仍趋向保持原来的运动状态，所以乘客向前倾。",
      examPoints: ["惯性", "运动状态改变", "惯性不是力"]
    },
    {
      id: "cs-mock-2027-zk-a-q05",
      number: 5,
      questionType: "单项选择题",
      topic: "压强",
      difficulty: "基础",
      title: "水平地面所受压强",
      content: `一个质量为 2.0 kg、底面积为 100 cm² 的均匀实心物块静止在水平地面上。取 g = 10 N/kg，物块对地面的压强为（　）
A. 200 Pa　　B. 2.0 × 10³ Pa　　C. 2.0 × 10⁴ Pa　　D. 2.0 × 10⁵ Pa`,
      solution: `物块静止在水平面上，对地面的压力等于重力：F = G = mg = 2.0 kg × 10 N/kg = 20 N。
底面积换算为国际单位：100 cm² = 100 × 10⁻⁴ m² = 0.010 m²。
由 p = F/S 得 p = 20 N ÷ 0.010 m² = 2.0 × 10³ Pa。`,
      answer: "选 B。压力为 20 N，受力面积为 0.010 m²，压强为 2.0 × 10³ Pa。",
      examPoints: ["压力与重力", "压强公式", "面积单位换算"]
    },
    {
      id: "cs-mock-2027-zk-a-q06",
      number: 6,
      questionType: "单项选择题",
      topic: "杠杆",
      difficulty: "基础",
      title: "杠杆平衡条件的应用",
      content: `用轻质杠杆撬起重物。重物对杠杆的作用力为 120 N，力臂为 0.20 m；动力臂为 0.60 m。杠杆水平平衡时，所需动力为（　）
A. 30 N　　B. 40 N　　C. 120 N　　D. 360 N`,
      solution: `杠杆平衡时满足动力 × 动力臂 = 阻力 × 阻力臂，即 F × 0.60 m = 120 N × 0.20 m。
解得 F = 120 × 0.20 ÷ 0.60 N = 40 N。`,
      answer: "选 B。由 F₁l₁ = F₂l₂，所需动力为 40 N。",
      examPoints: ["杠杆平衡条件", "力臂", "简单机械"]
    },
    {
      id: "cs-mock-2027-zk-a-q07",
      number: 7,
      questionType: "单项选择题",
      topic: "安全用电",
      difficulty: "基础",
      title: "金属外壳用电器的安全连接",
      content: `关于家庭电路和安全用电，下列做法正确的是（　）
A. 用湿手拔插头
B. 用铜丝代替空气开关
C. 金属外壳用电器的外壳可靠接地
D. 多个大功率用电器同时接在同一插线板上`,
      solution: `湿手操作可能使人体触电；铜丝不能在电流过大时可靠切断电路；多个大功率用电器共用插线板容易造成电流过大。金属外壳可靠接地后，若内部火线与外壳接触，故障电流可经地线导走并促使保护装置动作，降低触电风险。`,
      answer: "选 C。金属外壳可靠接地是防止漏电触电的重要保护措施，其余做法均存在安全隐患。",
      examPoints: ["家庭电路", "保护接地", "安全用电"]
    },
    {
      id: "cs-mock-2027-zk-a-q08",
      number: 8,
      questionType: "单项选择题",
      topic: "电与磁",
      difficulty: "基础",
      title: "电动机工作原理",
      content: `电动自行车中的电动机把电能转化为机械能。电动机的主要工作原理是（　）
A. 电流的热效应
B. 通电导体在磁场中受到力的作用
C. 电磁感应
D. 异种电荷相互吸引`,
      solution: `电动机线圈通电后处在磁场中，线圈的不同边受到方向合适的磁场力，从而产生转动。电磁感应主要用于发电机，把机械能转化为电能。`,
      answer: "选 B。电动机依据通电导体在磁场中受到力的作用工作，实现电能向机械能的转化。",
      examPoints: ["磁场对通电导线的作用", "电动机", "能量转化"]
    },
    {
      id: "cs-mock-2027-zk-a-q09",
      number: 9,
      questionType: "单项选择题",
      topic: "热量计算",
      difficulty: "基础",
      title: "水吸收热量的计算",
      content: `质量为 0.50 kg 的水，温度从 20 ℃ 升高到 40 ℃。水的比热容取 4.2 × 10³ J/(kg·℃)，水吸收的热量为（　）
A. 4.2 × 10³ J　　B. 2.1 × 10⁴ J　　C. 4.2 × 10⁴ J　　D. 8.4 × 10⁴ J`,
      solution: `水的温度变化量 Δt = 40 ℃ − 20 ℃ = 20 ℃。
由 Q吸 = cmΔt，得 Q吸 = 4.2 × 10³ J/(kg·℃) × 0.50 kg × 20 ℃ = 4.2 × 10⁴ J。`,
      answer: "选 C。温差为 20 ℃，代入 Q = cmΔt 得水吸收 4.2 × 10⁴ J 热量。",
      examPoints: ["比热容", "热量公式", "温度变化量"]
    },
    {
      id: "cs-mock-2027-zk-a-q10",
      number: 10,
      questionType: "单项选择题",
      topic: "密度与浮沉",
      difficulty: "进阶",
      title: "由密度判断物体浮沉",
      content: `一个质量为 0.20 kg、体积为 1.0 × 10⁻⁴ m³ 的均匀实心物体，完全浸没在水中后释放。水的密度为 1.0 × 10³ kg/m³，不计水的阻力。物体将（　）
A. 上浮　　B. 悬浮　　C. 下沉　　D. 无法判断`,
      solution: `先求物体密度：ρ物 = m/V = 0.20 kg ÷ (1.0 × 10⁻⁴ m³) = 2.0 × 10³ kg/m³。
因为 ρ物 > ρ水，完全浸没时物体重力大于浮力，所以释放后下沉。也可比较 G = 2.0 N 与 F浮 = ρ水gV = 1.0 N。`,
      answer: "选 C。物体密度为 2.0 × 10³ kg/m³，大于水的密度，完全浸没释放后将下沉。",
      examPoints: ["密度计算", "阿基米德原理", "浮沉条件"]
    },
    {
      id: "cs-mock-2027-zk-a-q11",
      number: 11,
      questionType: "多项选择题",
      topic: "动态电路",
      difficulty: "进阶",
      title: "串联电路中滑动变阻器的调节",
      content: `电压恒为 6 V 的电源、10 Ω 定值电阻 R₀ 和滑动变阻器 R 串联。闭合开关后，将滑片向使 R 接入电路的阻值增大的方向移动。下列判断正确的是（　）
A. 电路总电阻增大
B. 电路电流减小
C. R₀ 两端电压增大
D. 电路总功率减小`,
      solution: `R 接入电路的阻值增大，串联电路总电阻 R总 = R₀ + R 增大，所以 A 正确。
电源电压不变，由 I = U/R总 可知电流减小，所以 B 正确。
R₀ 两端电压 U₀ = IR₀，R₀ 不变而 I 减小，因此 U₀ 减小，C 错误。
电路总功率 P = UI，U 不变而 I 减小，因此总功率减小，D 正确。`,
      answer: "选 A、B、D。变阻器阻值增大使总电阻增大、电流减小，定值电阻两端电压和电路总功率都减小。",
      examPoints: ["欧姆定律", "串联电路", "电功率", "动态电路分析"]
    },
    {
      id: "cs-mock-2027-zk-a-q12",
      number: 12,
      questionType: "多项选择题",
      topic: "机械能",
      difficulty: "进阶",
      title: "竖直上抛过程中的机械能",
      content: `质量为 2.0 kg 的小球从地面以 10 m/s 的初速度竖直向上抛出。忽略空气阻力，取 g = 10 N/kg，地面为重力势能零点。下列说法正确的是（　）
A. 小球上升过程中动能减小
B. 小球上升过程中机械能减小
C. 小球能上升的最大高度为 5.0 m
D. 小球在最高点的机械能为 100 J`,
      solution: `忽略空气阻力，只有重力做功，机械能守恒。小球上升时速度减小，动能减小，重力势能增大，所以 A 正确、B 错误。
初始机械能 E = ½mv² = ½ × 2.0 kg × (10 m/s)² = 100 J。
最高点速度为零，由 mgh = 100 J 得 h = 100 ÷ (2.0 × 10) m = 5.0 m，所以 C 正确。
机械能守恒，最高点机械能仍为 100 J，所以 D 正确。`,
      answer: "选 A、C、D。小球上升时动能转化为重力势能，机械能保持 100 J，最大高度为 5.0 m。",
      examPoints: ["动能", "重力势能", "机械能守恒", "竖直上抛"]
    },
    {
      id: "cs-mock-2027-zk-a-q13",
      number: 13,
      questionType: "填空题",
      topic: "分子热运动",
      difficulty: "基础",
      title: "扩散现象与温度的关系",
      content: "走进花店能闻到花香，这是分子不停地做无规则运动形成的______现象；温度越高，花香传播通常越快，说明分子的无规则运动越______。",
      solution: `不同物质的分子彼此进入对方的现象叫扩散，闻到花香说明花香分子扩散到空气中。温度越高，分子的无规则运动越剧烈，因此扩散通常越快。`,
      answer: "第一空填“扩散”；第二空填“剧烈”。依据是分子永不停息地做无规则运动，且温度越高，热运动越剧烈。",
      examPoints: ["扩散现象", "分子热运动", "温度与分子运动"]
    },
    {
      id: "cs-mock-2027-zk-a-q14",
      number: 14,
      questionType: "填空题",
      topic: "凸透镜成像",
      difficulty: "进阶",
      title: "由物距判断凸透镜成像性质",
      content: "一凸透镜焦距为 10 cm，物体位于透镜前 30 cm 处。屏上可得到一个倒立、______的实像；由透镜成像公式可求得像距为______cm。",
      solution: `物距 u = 30 cm，大于 2f = 20 cm，所以成倒立、缩小的实像。
由 1/f = 1/u + 1/v，得 1/v = 1/10 − 1/30 = 1/15，因此 v = 15 cm。`,
      answer: "第一空填“缩小”；第二空填“15”。因为 u > 2f，像位于 f 与 2f 之间，成倒立、缩小的实像。",
      examPoints: ["凸透镜成像规律", "焦距与物距", "透镜成像公式"]
    },
    {
      id: "cs-mock-2027-zk-a-q15",
      number: 15,
      questionType: "填空题",
      topic: "功率与效率",
      difficulty: "进阶",
      title: "提升重物时的功率和效率",
      content: "一台电动机在 10 s 内把重 200 N 的物体匀速提升 5.0 m。电动机的输入功率为 125 W，则其有用功率为______W，效率为______。",
      solution: `有用功 W有 = Gh = 200 N × 5.0 m = 1000 J。
有用功率 P有 = W有/t = 1000 J ÷ 10 s = 100 W。
效率 η = P有/P入 = 100 W ÷ 125 W = 0.80 = 80%。`,
      answer: "第一空填“100”；第二空填“80%”。电动机做的有用功为 1000 J，有用功率 100 W。",
      examPoints: ["功", "功率", "机械效率"]
    },
    {
      id: "cs-mock-2027-zk-a-q16",
      number: 16,
      questionType: "填空题",
      topic: "信息传递",
      difficulty: "基础",
      title: "卫星通信与运动参照物",
      content: "通信卫星利用______传递信息；卫星绕地球运行时，以地球为参照物，卫星是______的。",
      solution: `卫星通信使用电磁波，电磁波可以在真空中传播。卫星相对于地球的位置随时间改变，因此以地球为参照物，卫星是运动的。`,
      answer: "第一空填“电磁波”；第二空填“运动”。电磁波能在真空中传播，卫星相对地球的位置发生变化。",
      examPoints: ["电磁波", "卫星通信", "参照物与运动"]
    },
    {
      id: "cs-mock-2027-zk-a-q17",
      number: 17,
      questionType: "作图与表述题",
      topic: "力的示意图",
      difficulty: "基础",
      title: "水平运动物体的受力示意",
      content: "一个木块在水平地面上向右滑动，已撤去推力。请说明应在木块受力示意图中画出的各个力及其方向，忽略空气阻力。",
      solution: `先确定研究对象为木块。木块受到地球施加的重力，方向竖直向下；受到地面的支持力，方向竖直向上；木块相对地面向右滑动，受到地面的滑动摩擦力，方向与相对运动方向相反，即水平向左。推力已经撤去，不能再画向右的推力。`,
      answer: "应画三个力：重力 G 竖直向下，支持力 N 竖直向上，滑动摩擦力 f 水平向左；不画已撤去的推力。",
      examPoints: ["受力分析", "重力与支持力", "滑动摩擦力方向"]
    },
    {
      id: "cs-mock-2027-zk-a-q18",
      number: 18,
      questionType: "实验探究题",
      topic: "水的沸腾",
      difficulty: "进阶",
      title: "分析水沸腾实验数据",
      content: `某小组给水持续加热，每隔 1 min 记录一次温度。第 0～6 min 的温度依次为 92 ℃、96 ℃、98 ℃、100 ℃、100 ℃、100 ℃、100 ℃。请回答：
（1）水的沸点是多少？
（2）第 3～6 min 继续加热，水的温度为何不再升高？
（3）若停止加热，沸腾能否持续较长时间？说明理由。`,
      solution: `（1）水在第 3 min 后温度稳定在 100 ℃，因此本次实验测得的沸点为 100 ℃。
（2）沸腾过程中水继续吸热，但吸收的能量主要用于使液态水变成水蒸气，所以温度保持在沸点附近不变。
（3）停止加热后，水不能继续获得维持剧烈汽化所需的热量，沸腾很快停止，因而不能持续较长时间。`,
      answer: "（1）100 ℃。（2）沸腾时水继续吸热，温度保持在沸点，能量用于汽化。（3）不能；停止加热后缺少持续热量供给，沸腾很快停止。",
      examPoints: ["沸点判定", "沸腾特点", "沸腾的吸热条件", "实验数据分析"]
    },
    {
      id: "cs-mock-2027-zk-a-q19",
      number: 19,
      questionType: "实验探究题",
      topic: "滑动摩擦力",
      difficulty: "进阶",
      title: "探究接触面粗糙程度对摩擦力的影响",
      content: `用弹簧测力计水平拉同一木块，使它分别在水平木板和水平毛巾表面做匀速直线运动，测力计示数分别为 2.0 N 和 3.5 N。两次实验中木块对接触面的压力相同。请回答：
（1）为什么要让木块做匀速直线运动？
（2）两次滑动摩擦力各是多少？
（3）可得出什么结论？`,
      solution: `（1）木块做匀速直线运动时处于平衡状态，水平方向的拉力与滑动摩擦力大小相等，因而可由测力计示数间接测出摩擦力。
（2）在木板上 f₁ = 2.0 N，在毛巾上 f₂ = 3.5 N。
（3）两次压力相同，而毛巾表面更粗糙、摩擦力更大，说明压力相同时，接触面越粗糙，滑动摩擦力越大。`,
      answer: "（1）利用二力平衡，使拉力等于滑动摩擦力。（2）2.0 N、3.5 N。（3）压力相同时，接触面越粗糙，滑动摩擦力越大。",
      examPoints: ["二力平衡", "滑动摩擦力测量", "控制变量法", "实验结论表述"]
    },
    {
      id: "cs-mock-2027-zk-a-q20",
      number: 20,
      questionType: "实验探究题",
      topic: "密度测量",
      difficulty: "进阶",
      title: "用天平和量筒测金属块密度",
      content: `用天平测得一个金属块的质量为 54.0 g。量筒中原有 30.0 mL 水，金属块完全浸没后液面示数为 50.0 mL，且没有水溅出。求：
（1）金属块的体积；
（2）金属块的密度，分别用 g/cm³ 和 kg/m³ 表示；
（3）若改用一块能吸水的多孔材料，仍按上述先测质量、再浸水测体积的方法操作，测得的密度会偏大还是偏小？`,
      solution: `（1）排开水的体积等于金属块体积：V = 50.0 mL − 30.0 mL = 20.0 mL = 20.0 cm³。
（2）ρ = m/V = 54.0 g ÷ 20.0 cm³ = 2.70 g/cm³。因为 1 g/cm³ = 1.0 × 10³ kg/m³，所以 ρ = 2.70 × 10³ kg/m³。
（3）吸水材料浸入量筒后会吸收一部分水，使液面增加量小于材料的真实外形体积，测得体积偏小；质量使用浸水前的测量值，因此计算出的密度偏大。`,
      answer: "（1）20.0 cm³。（2）2.70 g/cm³，即 2.70 × 10³ kg/m³。（3）偏大，因为吸水会使排水法测得的体积偏小。",
      examPoints: ["排水法测体积", "密度公式", "密度单位换算", "实验误差分析"]
    },
    {
      id: "cs-mock-2027-zk-a-q21",
      number: 21,
      questionType: "实验探究题",
      topic: "测量小灯泡电功率",
      difficulty: "进阶",
      title: "小灯泡额定功率测量",
      content: `在“测量小灯泡电功率”实验中，小灯泡额定电压为 2.5 V。调节滑动变阻器，使电压表示数为 2.5 V 时，电流表示数为 0.30 A。请回答：
（1）连接电路时开关应处于什么状态，滑动变阻器应如何放置？
（2）小灯泡的额定功率是多少？
（3）若电压表示数为 2.2 V，要测额定功率，应怎样调节？`,
      solution: `（1）为保护电路，连接时开关应断开，滑动变阻器应处在接入电路阻值最大的位置。
（2）额定状态下 P额 = U额I额 = 2.5 V × 0.30 A = 0.75 W。
（3）当前灯泡电压低于额定电压，应减小滑动变阻器接入电路的阻值，使电路电流和灯泡两端电压增大，直至电压表示数为 2.5 V。调节时应观察电压表，不能直接把变阻器调到最小阻值。`,
      answer: "（1）开关断开，变阻器置于最大阻值位置。（2）0.75 W。（3）逐渐减小变阻器接入电路的阻值，直到电压表为 2.5 V。",
      examPoints: ["电路连接规范", "滑动变阻器", "额定功率", "P=UI"]
    },
    {
      id: "cs-mock-2027-zk-a-q22",
      number: 22,
      questionType: "计算题",
      topic: "压强与浮力",
      difficulty: "进阶",
      title: "车辆压强和浸没物体浮力",
      content: `取 g = 10 N/kg，水的密度为 1.0 × 10³ kg/m³。
（1）一辆质量为 1.5 × 10³ kg 的汽车静止在水平路面上，四个轮胎与路面的总接触面积为 0.060 m²。求汽车对路面的压强。
（2）一个物体在空气中用弹簧测力计测得重力为 5.0 N，完全浸没在水中且不接触容器时，测力计示数为 3.0 N。求物体受到的浮力和物体体积。`,
      solution: `（1）汽车对水平路面的压力等于汽车重力：
F = G = mg = 1.5 × 10³ kg × 10 N/kg = 1.5 × 10⁴ N。
由 p = F/S 得：
p = 1.5 × 10⁴ N ÷ 0.060 m² = 2.5 × 10⁵ Pa。

（2）称重法求浮力：
F浮 = G − F示 = 5.0 N − 3.0 N = 2.0 N。
物体完全浸没，V排 = V物。由 F浮 = ρ水gV排 得：
V物 = F浮/(ρ水g) = 2.0 N ÷ (1.0 × 10³ kg/m³ × 10 N/kg)
= 2.0 × 10⁻⁴ m³。`,
      answer: "（1）汽车对路面的压强为 2.5 × 10⁵ Pa。（2）物体所受浮力为 2.0 N，体积为 2.0 × 10⁻⁴ m³。",
      examPoints: ["固体压强", "称重法测浮力", "阿基米德原理", "单位与科学记数法"]
    },
    {
      id: "cs-mock-2027-zk-a-q23",
      number: 23,
      questionType: "计算题",
      topic: "电热综合",
      difficulty: "挑战",
      title: "双挡电热器的功率和耗电量",
      content: `某电热器接在 220 V 家庭电路中，内部有两个阻值均为 44 Ω 的电热丝。高温挡只接入一根电热丝；低温挡将两根电热丝串联接入。忽略温度对电阻的影响。求：
（1）高温挡功率；
（2）低温挡功率；
（3）使用高温挡连续工作 10 min 消耗的电能。`,
      solution: `（1）高温挡总电阻 R高 = 44 Ω。
P高 = U²/R高 = (220 V)² ÷ 44 Ω = 1100 W。

（2）低温挡两根电热丝串联：
R低 = 44 Ω + 44 Ω = 88 Ω。
P低 = U²/R低 = (220 V)² ÷ 88 Ω = 550 W。

（3）工作时间 t = 10 min = 600 s。
W = P高t = 1100 W × 600 s = 6.6 × 10⁵ J。
换算为千瓦时：W = 1.1 kW × (10/60) h ≈ 0.183 kW·h。`,
      answer: "（1）高温挡功率 1100 W。（2）低温挡功率 550 W。（3）高温挡工作 10 min 消耗 6.6 × 10⁵ J，约合 0.183 kW·h。",
      examPoints: ["串联电阻", "电功率", "焦耳热", "电能单位换算", "多挡用电器"]
    }
  ];

  const seniorDefinitions = [
    {
      id: "hn-mock-2027-gk-a-q01",
      number: 1,
      questionType: "单项选择题",
      topic: "原子核",
      difficulty: "基础",
      title: "放射性核素的半衰期",
      content: `某放射性核素的半衰期为 8 d。现有该核素样品，经过 24 d 后，未发生衰变的原子核数约为初始原子核数的（　）
A. 1/2　　B. 1/4　　C. 1/8　　D. 1/16`,
      solution: `经过的半衰期个数 n = 24 d ÷ 8 d = 3。
未衰变原子核所占比例为 (1/2)ⁿ = (1/2)³ = 1/8。半衰期描述大量原子核的统计规律，不表示某一个原子核必在固定时刻衰变。`,
      answer: "选 C。24 d 等于 3 个半衰期，未衰变原子核数约为初始值的 (1/2)³ = 1/8。",
      examPoints: ["半衰期", "指数衰变", "原子核衰变的统计性"]
    },
    {
      id: "hn-mock-2027-gk-a-q02",
      number: 2,
      questionType: "单项选择题",
      topic: "运动图像",
      difficulty: "基础",
      title: "由速度时间关系求位移",
      content: `一质点沿直线运动，0～4 s 内速度随时间满足 v = 2 + 3t（各物理量均采用国际单位）。该质点在这 4 s 内的位移为（　）
A. 14 m　　B. 24 m　　C. 28 m　　D. 32 m`,
      solution: `由 v = v₀ + at 可知初速度 v₀ = 2 m/s，加速度 a = 3 m/s²。
位移 x = v₀t + ½at² = 2 × 4 + ½ × 3 × 4² m = 8 m + 24 m = 32 m。
也可用 v-t 图像下的梯形面积计算。`,
      answer: "选 D。初速度为 2 m/s、加速度为 3 m/s²，4 s 内位移为 32 m。",
      examPoints: ["匀变速直线运动", "v-t关系", "位移计算"]
    },
    {
      id: "hn-mock-2027-gk-a-q03",
      number: 3,
      questionType: "单项选择题",
      topic: "机械波",
      difficulty: "基础",
      title: "波速和相位关系",
      content: `一列简谐横波在均匀介质中传播，波长为 4.0 m，频率为 5.0 Hz。关于该波，下列说法正确的是（　）
A. 波速为 0.80 m/s
B. 波速为 20 m/s
C. 相距 2.0 m 的两质点振动始终同相
D. 介质质点随波向前迁移`,
      solution: `波速 v = λf = 4.0 m × 5.0 Hz = 20 m/s，所以 B 正确、A 错误。
相距 2.0 m 等于半个波长，对同一列简谐波而言两点相位相差 π，振动反相，C 错误。
波传播的是振动形式和能量，介质质点只在平衡位置附近振动，不随波整体迁移，D 错误。`,
      answer: "选 B。波速为 20 m/s；相距半个波长的两点反相，介质质点不随波整体迁移。",
      examPoints: ["波速公式", "波长与相位", "机械波传播特征"]
    },
    {
      id: "hn-mock-2027-gk-a-q04",
      number: 4,
      questionType: "单项选择题",
      topic: "万有引力",
      difficulty: "进阶",
      title: "行星表面重力加速度和环绕速度",
      content: `设某行星质量为 M、半径为 R，表面重力加速度为 g，近表面圆轨道速度为 v。另一颗行星质量也为 M、半径为 2R，则其表面重力加速度和近表面圆轨道速度分别为（　）
A. g/2，v/2　　B. g/4，v/√2　　C. g/4，v/2　　D. g/2，v/√2`,
      solution: `行星表面重力加速度 g = GM/R²。质量不变、半径变为 2R 时，g' = GM/(2R)² = g/4。
近表面圆轨道速度 v = √(GM/R)。半径变为 2R 时，v' = √[GM/(2R)] = v/√2。
因此选 B。`,
      answer: "选 B。由 g = GM/R² 得 g' = g/4；由 v = √(GM/R) 得 v' = v/√2。",
      examPoints: ["万有引力定律", "表面重力加速度", "第一宇宙速度"]
    },
    {
      id: "hn-mock-2027-gk-a-q05",
      number: 5,
      questionType: "单项选择题",
      topic: "电场",
      difficulty: "进阶",
      title: "匀强电场中的电场力和电势能",
      content: `在场强大小 E = 200 N/C、方向水平向右的匀强电场中，一个电荷量 q = +2.0 × 10⁻⁶ C 的粒子沿电场方向移动 0.50 m。忽略其他力。下列说法正确的是（　）
A. 电场力大小为 1.0 × 10⁻⁴ N
B. 电场力做功为 −2.0 × 10⁻⁴ J
C. 粒子的电势能增加 2.0 × 10⁻⁴ J
D. 电场力做功为 2.0 × 10⁻⁴ J`,
      solution: `电场力 F = qE = 2.0 × 10⁻⁶ C × 200 N/C = 4.0 × 10⁻⁴ N，A 错误。
正电荷受力方向与电场方向相同，位移也沿电场方向，所以电场力做正功：
W = qEs = 2.0 × 10⁻⁶ × 200 × 0.50 J = 2.0 × 10⁻⁴ J。
电场力做正功，电势能减少同样大小，故 D 正确。`,
      answer: "选 D。电场力为 4.0 × 10⁻⁴ N，做正功 2.0 × 10⁻⁴ J，粒子电势能减少 2.0 × 10⁻⁴ J。",
      examPoints: ["电场强度", "电场力做功", "电势能变化"]
    },
    {
      id: "hn-mock-2027-gk-a-q06",
      number: 6,
      questionType: "单项选择题",
      topic: "变压器",
      difficulty: "进阶",
      title: "理想变压器的电压和电流",
      content: `一理想变压器原、副线圈匝数比 N₁:N₂ = 10:1，原线圈接 220 V 正弦交流电。副线圈接一个 11 Ω 纯电阻。下列结果正确的是（　）
A. 副线圈电压为 22 V，原线圈电流为 0.20 A
B. 副线圈电压为 22 V，原线圈电流为 2.0 A
C. 副线圈电压为 2200 V，原线圈电流为 0.20 A
D. 副线圈电压为 2200 V，原线圈电流为 2.0 A`,
      solution: `理想变压器满足 U₁/U₂ = N₁/N₂，所以 U₂ = 220 V × 1/10 = 22 V。
副线圈电流 I₂ = U₂/R = 22 V ÷ 11 Ω = 2.0 A。
理想变压器输入功率等于输出功率：U₁I₁ = U₂I₂，故 I₁ = 22 × 2.0 ÷ 220 A = 0.20 A。`,
      answer: "选 A。副线圈电压为 22 V，副线圈电流为 2.0 A，原线圈电流为 0.20 A。",
      examPoints: ["理想变压器", "匝数比", "电功率守恒", "交流电"]
    },
    {
      id: "hn-mock-2027-gk-a-q07",
      number: 7,
      questionType: "多项选择题",
      topic: "碰撞",
      difficulty: "进阶",
      title: "等质量小球的一维弹性碰撞",
      content: `质量均为 m 的小球 A、B 位于光滑水平面上。A 以速度 v₀ 向右运动，B 静止。两球发生正碰，碰撞为弹性碰撞。下列说法正确的是（　）
A. 碰撞过程中两球组成的系统动量守恒
B. 碰撞过程中两球的总动能始终保持不变
C. 碰撞结束后 A 静止，B 以 v₀ 向右运动
D. 碰撞前后系统总动能相等`,
      solution: `光滑水平面上系统水平方向不受外力，所以碰撞过程中系统动量守恒，A 正确。
弹性碰撞的定义是碰撞前后系统总动能相等，因此 D 正确。接触形变期间，部分动能会暂时转化为弹性势能，不能说两球总动能在碰撞的每一时刻都不变，B 错误。
一维弹性正碰且两球质量相等时，两球交换速度，所以 A 停止、B 以 v₀ 向右运动，C 正确。`,
      answer: "选 A、C、D。系统动量守恒，弹性碰撞前后总动能相等；等质量一维正碰后两球交换速度。",
      examPoints: ["动量守恒", "弹性碰撞", "动能守恒", "等质量碰撞"]
    },
    {
      id: "hn-mock-2027-gk-a-q08",
      number: 8,
      questionType: "多项选择题",
      topic: "带电粒子在磁场中的运动",
      difficulty: "进阶",
      title: "质子在匀强磁场中的圆周运动",
      content: `质子以 2.0 × 10⁶ m/s 的速度垂直进入磁感应强度为 0.50 T 的匀强磁场。取质子质量 m = 1.67 × 10⁻²⁷ kg，电荷量 q = 1.60 × 10⁻¹⁹ C，忽略重力。下列判断正确的是（　）
A. 洛伦兹力不做功
B. 质子速率保持不变
C. 轨道半径约为 4.2 × 10⁻² m
D. 运动周期与入射速率成正比`,
      solution: `洛伦兹力始终与瞬时速度垂直，因此不做功，质子的动能和速率不变，A、B 正确。
洛伦兹力提供向心力：qvB = mv²/r，所以
r = mv/(qB) = (1.67 × 10⁻²⁷ × 2.0 × 10⁶)/(1.60 × 10⁻¹⁹ × 0.50) m
≈ 4.18 × 10⁻² m，C 正确。
周期 T = 2πm/(qB)，与速率无关，D 错误。`,
      answer: "选 A、B、C。洛伦兹力不做功，速率不变；轨道半径约 4.2 × 10⁻² m，周期与速率无关。",
      examPoints: ["洛伦兹力", "匀速圆周运动", "轨道半径", "回旋周期"]
    },
    {
      id: "hn-mock-2027-gk-a-q09",
      number: 9,
      questionType: "多项选择题",
      topic: "电磁感应",
      difficulty: "挑战",
      title: "导体棒切割磁感线",
      content: `长 L = 0.50 m 的导体棒垂直于磁感应强度 B = 0.80 T 的匀强磁场，以 v = 4.0 m/s 的速度垂直切割磁感线。导体棒与总电阻 R = 2.0 Ω 的闭合回路构成电路，其他电阻不计。下列结果正确的是（　）
A. 感应电动势为 1.6 V
B. 感应电流为 0.80 A
C. 导体棒所受安培力大小为 0.32 N
D. 外力维持匀速运动的机械功率为 0.64 W`,
      solution: `感应电动势 E = BLv = 0.80 × 0.50 × 4.0 V = 1.6 V，A 正确。
感应电流 I = E/R = 1.6 V ÷ 2.0 Ω = 0.80 A，B 正确。
安培力 F = BIL = 0.80 × 0.80 × 0.50 N = 0.32 N，C 正确。
匀速时外力大小等于安培力，机械功率 P = Fv = 0.32 × 4.0 W = 1.28 W；也等于 I²R，故 D 错误。`,
      answer: "选 A、B、C。电动势 1.6 V，电流 0.80 A，安培力 0.32 N；外力功率应为 1.28 W。",
      examPoints: ["动生电动势", "闭合电路欧姆定律", "安培力", "能量转化"]
    },
    {
      id: "hn-mock-2027-gk-a-q10",
      number: 10,
      questionType: "多项选择题",
      topic: "牛顿运动定律",
      difficulty: "进阶",
      title: "粗糙斜面上的匀加速运动",
      content: `质量为 2.0 kg 的物块从倾角为 37° 的粗糙斜面顶端由静止下滑。物块与斜面间的动摩擦因数 μ = 0.25，取 sin37° = 0.60、cos37° = 0.80、g = 10 m/s²。下列说法正确的是（　）
A. 物块受到的支持力为 16 N
B. 滑动摩擦力为 4.0 N
C. 物块沿斜面向下的加速度为 4.0 m/s²
D. 物块下滑 2.0 s 时的速度为 4.0 m/s`,
      solution: `垂直斜面方向平衡，支持力 N = mgcos37° = 2.0 × 10 × 0.80 N = 16 N，A 正确。
滑动摩擦力 f = μN = 0.25 × 16 N = 4.0 N，B 正确。
沿斜面向下的重力分力 mgsin37° = 2.0 × 10 × 0.60 N = 12 N。
合力 F = 12 N − 4.0 N = 8.0 N，加速度 a = F/m = 8.0 ÷ 2.0 m/s² = 4.0 m/s²，C 正确。
由静止开始，2.0 s 时 v = at = 4.0 × 2.0 m/s = 8.0 m/s，D 错误。`,
      answer: "选 A、B、C。支持力 16 N、摩擦力 4.0 N、加速度 4.0 m/s²；2.0 s 时速度为 8.0 m/s。",
      examPoints: ["受力分析", "滑动摩擦力", "牛顿第二定律", "匀加速直线运动"]
    },
    {
      id: "hn-mock-2027-gk-a-q11",
      number: 11,
      questionType: "实验题",
      topic: "探究弹簧振子周期",
      difficulty: "挑战",
      title: "由周期数据估算弹簧劲度系数",
      content: `用质量可忽略的同一弹簧和不同质量的砝码组成竖直弹簧振子。测得三组数据如下：
砝码质量 m/kg：0.10，0.20，0.30
振动周期 T/s：0.40，0.57，0.69
已知弹簧振子的理论周期 T = 2π√(m/k)，取 π² = 9.87。请回答：
（1）为减小计时偶然误差，应怎样测量周期？
（2）说明 T² 与 m 的关系。
（3）用第一、第三组数据估算弹簧劲度系数 k。`,
      solution: `（1）让振子稳定振动后，测量连续多个完整周期的总时间，再除以周期数；可重复测量取平均值。
（2）由 T = 2π√(m/k) 得 T² = (4π²/k)m，因此同一弹簧的 T² 与 m 成正比。
（3）第一组 T₁² = 0.40² s² = 0.160 s²；第三组 T₃² = 0.69² s² = 0.4761 s²。
T²-m 图线斜率近似为
a = (0.4761 − 0.160)/(0.30 − 0.10) s²/kg = 1.5805 s²/kg。
由 a = 4π²/k 得
k = 4π²/a = 4 × 9.87 ÷ 1.5805 N/m ≈ 25.0 N/m。
数据取两位有效数字时可写约 25 N/m。`,
      answer: "（1）测多个周期的总时间并除以周期数，重复取平均。（2）T² 与 m 成正比。（3）由斜率约 1.58 s²/kg 得 k ≈ 25 N/m。",
      examPoints: ["累积法测周期", "函数关系线性化", "图像斜率", "弹簧振子"]
    },
    {
      id: "hn-mock-2027-gk-a-q12",
      number: 12,
      questionType: "实验题",
      topic: "测量电源电动势和内阻",
      difficulty: "进阶",
      title: "由两组闭合电路数据求电动势和内阻",
      content: `某同学测量一节电池的电动势 E 和内阻 r。忽略电流表内阻，电压表不接入电路。改变外电阻得到两组数据：
外电阻 R₁ = 4.0 Ω 时，电流 I₁ = 1.20 A；
外电阻 R₂ = 9.0 Ω 时，电流 I₂ = 0.60 A。
（1）写出两组闭合电路方程。
（2）求 E 和 r。
（3）求接 R₁ 时电源内部消耗的功率。`,
      solution: `（1）闭合电路欧姆定律可写为 E = I(R + r)，所以
E = 1.20(4.0 + r)，
E = 0.60(9.0 + r)。
（2）联立：
4.8 + 1.20r = 5.4 + 0.60r，
0.60r = 0.60，得 r = 1.0 Ω。
代回得 E = 1.20 × (4.0 + 1.0) V = 6.0 V。
（3）接 R₁ 时内部功率 P内 = I₁²r = (1.20 A)² × 1.0 Ω = 1.44 W。`,
      answer: "（1）E = 1.20(4.0 + r)，E = 0.60(9.0 + r)。（2）E = 6.0 V，r = 1.0 Ω。（3）内部功率为 1.44 W。",
      examPoints: ["闭合电路欧姆定律", "电动势与内阻", "方程组", "电源内部功率"]
    },
    {
      id: "hn-mock-2027-gk-a-q13",
      number: 13,
      questionType: "计算题",
      topic: "理想气体",
      difficulty: "进阶",
      title: "理想气体的等压和等温过程",
      content: `一定质量的理想气体初态压强 p₁ = 1.0 × 10⁵ Pa、体积 V₁ = 2.0 × 10⁻³ m³、热力学温度 T₁ = 300 K。气体先在压强不变时缓慢升温到 T₂ = 450 K，再在 450 K 下等温压缩到体积 V₃ = 1.5 × 10⁻³ m³。求：
（1）等压过程结束时的体积 V₂；
（2）末态压强 p₃；
（3）等压膨胀过程中气体对外做的功。`,
      solution: `（1）等压过程中 V/T 为常量：
V₂/V₁ = T₂/T₁，
V₂ = 2.0 × 10⁻³ × 450/300 m³ = 3.0 × 10⁻³ m³。

（2）第二阶段为等温过程，满足 p₂V₂ = p₃V₃。由于 p₂ = p₁ = 1.0 × 10⁵ Pa，
p₃ = p₂V₂/V₃
= 1.0 × 10⁵ × (3.0 × 10⁻³)/(1.5 × 10⁻³) Pa
= 2.0 × 10⁵ Pa。

（3）等压膨胀时气体对外做功
W = p₁(V₂ − V₁)
= 1.0 × 10⁵ × (3.0 × 10⁻³ − 2.0 × 10⁻³) J
= 100 J。`,
      answer: "（1）V₂ = 3.0 × 10⁻³ m³。（2）p₃ = 2.0 × 10⁵ Pa。（3）气体对外做功 100 J。",
      examPoints: ["理想气体状态方程", "等压过程", "等温过程", "气体做功"]
    },
    {
      id: "hn-mock-2027-gk-a-q14",
      number: 14,
      questionType: "计算题",
      topic: "带电粒子在复合场中的运动",
      difficulty: "挑战",
      title: "加速电场与匀强磁场",
      content: `一个带正电粒子从静止开始，经电势差 U = 200 V 的加速电场加速后，垂直进入磁感应强度 B = 0.20 T 的匀强磁场。已知粒子的比荷 q/m = 1.0 × 10⁸ C/kg，忽略重力和相对论效应。求：
（1）粒子进入磁场时的速度大小；
（2）粒子在磁场中做圆周运动的半径；
（3）粒子在磁场中运动的周期。`,
      solution: `（1）电场力做功转化为动能：
qU = ½mv²。
两边同除以 m，得 (q/m)U = ½v²，
v = √[2(q/m)U]
= √(2 × 1.0 × 10⁸ × 200) m/s
= √(4.0 × 10¹⁰) m/s
= 2.0 × 10⁵ m/s。

（2）洛伦兹力提供向心力：
qvB = mv²/r，
r = mv/(qB) = v/[(q/m)B]
= 2.0 × 10⁵ ÷ (1.0 × 10⁸ × 0.20) m
= 1.0 × 10⁻² m。

（3）周期
T = 2πm/(qB) = 2π/[(q/m)B]
= 2π ÷ (1.0 × 10⁸ × 0.20) s
= π × 10⁻⁷ s
≈ 3.14 × 10⁻⁷ s。`,
      answer: "（1）速度为 2.0 × 10⁵ m/s。（2）轨道半径为 1.0 × 10⁻² m。（3）周期为 π × 10⁻⁷ s，约 3.14 × 10⁻⁷ s。",
      examPoints: ["动能定理", "加速电场", "洛伦兹力", "圆周运动半径与周期"]
    },
    {
      id: "hn-mock-2027-gk-a-q15",
      number: 15,
      questionType: "计算题",
      topic: "动量与平抛运动",
      difficulty: "挑战",
      title: "小车碰撞后的平抛运动",
      content: `光滑水平轨道末端与高 h = 1.25 m 的水平桌面平齐。质量 m₁ = 1.0 kg 的小车 A 以 v₀ = 6.0 m/s 向右运动，与静止的质量 m₂ = 2.0 kg 的小车 B 碰撞后粘在一起，随后以共同速度从桌边水平飞出。取 g = 10 m/s²，忽略空气阻力。求：
（1）碰撞后的共同速度；
（2）碰撞过程中系统损失的机械能；
（3）两车落地点到桌边的水平距离。`,
      solution: `（1）碰撞时间很短，水平方向外力冲量可忽略，动量守恒：
m₁v₀ = (m₁ + m₂)v。
v = m₁v₀/(m₁ + m₂)
= 1.0 × 6.0/(1.0 + 2.0) m/s
= 2.0 m/s。

（2）碰撞前动能
E前 = ½m₁v₀² = ½ × 1.0 × 6.0² J = 18 J。
碰撞后动能
E后 = ½(m₁ + m₂)v² = ½ × 3.0 × 2.0² J = 6.0 J。
损失的机械能
ΔE = E前 − E后 = 12 J。

（3）两车从桌边水平飞出后做平抛运动。竖直方向：
h = ½gt²，
t = √(2h/g) = √(2 × 1.25/10) s = 0.50 s。
水平方向匀速：
x = vt = 2.0 × 0.50 m = 1.0 m。`,
      answer: "（1）共同速度为 2.0 m/s，方向向右。（2）碰撞损失机械能 12 J。（3）落地点到桌边的水平距离为 1.0 m。",
      examPoints: ["动量守恒", "完全非弹性碰撞", "机械能损失", "平抛运动"]
    }
  ];

  const buildQuestions = (definitions, exam) => {
    return definitions.map((definition, index) => {
      const timestamp = new Date(Date.UTC(2026, 6, 24, exam.level === "中考" ? 0 : 1, 0, index)).toISOString();
      return {
        ...definition,
        solution: formatDetailedSolution(definition),
        stage: exam.stage,
        grade: exam.grade,
        source: "物理研习室原创模拟卷",
        sourceUrl: "",
        sourceLicense: "应用内原创",
        curriculumBasis: exam.curriculumBasis,
        copyrightNote: COPYRIGHT_NOTE,
        collection: "changsha-original-mock-exams",
        syncOrigin: "bundled-original-mock",
        originalExercise: true,
        originalMock: true,
        examLevel: exam.level,
        examYear: 2027,
        examRegion: exam.region,
        examPaperTitle: exam.title,
        examQuestionNumber: definition.number,
        examQuestionType: definition.questionType,
        examPaperStatus: "原创训练卷",
        resourceRightsStatus: "应用内原创，可离线使用",
        fullTextIncluded: true,
        evidenceTier: "diagnostic-anchor",
        modelDefinitionId: `${exam.key}-model-${String(definition.number).padStart(2, "0")}`,
        retestGroupId: `${exam.key}-retest-${String(definition.number).padStart(2, "0")}`,
        diagnosticEligible: true,
        autoScorable: ["单项选择题", "多项选择题", "填空题", "计算题"].includes(definition.questionType),
        videoType: "none",
        videoUrl: "",
        videoName: "",
        mastered: false,
        wrong: false,
        wrongAt: null,
        wrongCount: 0,
        transferNotes: {},
        attachments: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });
  };

  const exams = [
    {
      key: "cs-mock-2027-zk-a",
      level: "中考",
      stage: "初中",
      grade: "九年级",
      region: "长沙",
      title: "2027届长沙中考物理原创综合训练卷 A",
      curriculumBasis: JUNIOR_BASIS,
      questionCount: juniorDefinitions.length
    },
    {
      key: "hn-mock-2027-gk-a",
      level: "高考",
      stage: "高中",
      grade: "高三",
      region: "湖南（长沙考生适用）",
      title: "2027届湖南高考物理原创综合训练卷 A（长沙考生适用）",
      curriculumBasis: SENIOR_BASIS,
      questionCount: seniorDefinitions.length
    }
  ];

  const questions = [
    ...buildQuestions(juniorDefinitions, exams[0]),
    ...buildQuestions(seniorDefinitions, exams[1])
  ];

  const normalizedQuestions = questions.map((question) => ({
    ...question,
    knowledgePointId: question.knowledgePointId || `kp:${String(question.topic || question.id).normalize("NFKC").replace(/中的?/g, "").replace(/[^\p{L}\p{N}]+/gu, "-")}`,
    cognitiveDemand: question.cognitiveDemand || (/实验|探究/.test(String(question.questionType || "")) ? "实验推理" : /计算/.test(String(question.questionType || "")) ? "定量计算" : "基础概念"),
    representationType: question.representationType || (/实验|探究/.test(String(question.questionType || "")) ? "实验" : /图|图像/.test(String(question.content || "")) ? "图像" : "文字/公式"),
    independenceGroupId: question.independenceGroupId || question.modelDefinitionId,
    assessmentPurpose: question.assessmentPurpose || "exam"
  }));

  window.PHYSICS_MOCK_EXAM_BANK = Object.freeze({
    version: 2,
    contentVersion: "2026.07.29-detailed-solutions-r2",
    verifiedAt: "2026-07-29",
    title: "长沙中考与湖南高考原创物理综合训练题库",
    copyrightNote: COPYRIGHT_NOTE,
    exams: Object.freeze(exams),
    questions: Object.freeze(normalizedQuestions.map(Object.freeze))
  });
})();
