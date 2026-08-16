(() => {
  "use strict";

  const VERSION = 1;
  const CONTENT_VERSION = "2026.07.30-targeted-transfer-400-r1";
  const CREATED_AT = "2026-07-30T00:00:00.000Z";
  const ROUNDS_PER_MODEL = 5;
  const VARIANTS = Object.freeze([
    { key: "core", label: "母题", difficulty: "基础" },
    { key: "near", label: "条件变化", difficulty: "进阶" },
    { key: "far", label: "跨情境迁移", difficulty: "进阶" },
    { key: "counter", label: "反例辨析", difficulty: "挑战" }
  ]);

  function number(value, digits = 3) {
    if (!Number.isFinite(value)) throw new Error("专项题参数不是有限数值。");
    const rounded = Number(value.toFixed(digits));
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }

  function detailedSolution(examPoints, solutionSteps, answer, check) {
    return [
      `【考察点】${examPoints.join("、")}`,
      "【分步解析】",
      ...solutionSteps.map((step, index) => `${index + 1}. ${step}`),
      `【最终结论】${answer}`,
      `【结果复核】${check || "核对公式适用条件、单位、方向和数量级，并把结论代回题意。"}`
    ].join("\n");
  }

  function buildQuestion(grade, familyNumber, model, variant, payload) {
    const gradeCode = grade === "九年级" ? "g9" : "h3";
    const stage = grade === "九年级" ? "初中" : "高中";
    const familyId = `cs-targeted-${gradeCode}-${String(familyNumber).padStart(3, "0")}`;
    const examPoints = payload.examPoints || model.examPoints;
    const answer = payload.answer;
    return {
      id: `${familyId}-${variant.key}`,
      title: `${model.title}专项｜${variant.label} ${String(familyNumber).padStart(2, "0")}`,
      stage,
      grade,
      topic: model.topic,
      difficulty: payload.difficulty || variant.difficulty,
      questionType: payload.questionType || (variant.key === "counter" ? "辨析题" : "计算题"),
      content: payload.content,
      solution: detailedSolution(examPoints, payload.steps, answer, payload.check),
      answer,
      examPoints,
      modelFamilyId: familyId,
      modelDefinitionId: familyId,
      variantRole: variant.key,
      transferGroupId: familyId,
      retestGroupId: familyId,
      evidenceTier: variant.key === "core" ? "diagnostic-anchor" : variant.key === "counter" ? "transfer-anchor" : "practice-variant",
      diagnosticEligible: variant.key === "core",
      autoScorable: ["选择题", "填空题", "判断题", "计算题"].some((type) => String(payload.questionType || "计算题").includes(type)),
      misconceptionTags: [...(payload.misconceptionTags || model.misconceptionTags || [])],
      recommendationTags: [model.topic, ...examPoints, variant.label],
      source: "物理研习室原创·长沙模拟考结构适配专项",
      sourceUrl: "",
      sourceLicense: "应用内原创；非长沙学校模拟卷原题",
      curriculumBasis: `${grade}物理复习知识结构与模拟考常见模型的原创适配`,
      copyrightNote: "本题为应用内原创模型题，未复制第三方试卷题干、图像或答案。",
      curriculumBook: grade === "九年级" ? "九年级物理综合复习" : "高三物理综合复习",
      curriculumChapter: model.chapter || model.topic,
      curriculumSection: model.section || examPoints[0],
      collection: "changsha-targeted-transfer-400",
      syncOrigin: "bundled-targeted-practice",
      originalExercise: true,
      fullTextIncluded: true,
      contentReviewStatus: "应用内原创已发布",
      metadataReviewStatus: "已按模型族、迁移角色、知识点和难度分类",
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
  }

  const grade9Models = [
    {
      id: "density",
      title: "密度测量",
      topic: "质量与密度",
      chapter: "质量与密度",
      examPoints: ["密度公式", "质量与体积", "等体积法"],
      misconceptionTags: ["密度随物体质量改变", "单位换算遗漏"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const volume = 80 + 10 * r;
          const density = 2 + 0.2 * r;
          const mass = volume * density;
          return {
            content: `一金属块质量为 ${number(mass)} g，体积为 ${volume} cm³。求金属块的密度，并换算成 kg/m³。`,
            steps: [
              "研究对象是金属块，已知质量和体积，使用 ρ=m/V。",
              `ρ=${number(mass)}/${volume}=${number(density)} g/cm³。`,
              `1 g/cm³=1.0×10³ kg/m³，所以 ρ=${number(density * 1000)} kg/m³。`
            ],
            answer: `${number(density)} g/cm³，即 ${number(density * 1000)} kg/m³。`,
            check: "密度单位由 g/cm³ 换成 kg/m³ 时数值应乘1000；所得数量级符合常见金属或固体材料。"
          };
        }
        if (role === "near") {
          const density = 0.8 + 0.1 * r;
          const volume = 150 + 20 * r;
          const mass = density * volume;
          return {
            content: `某液体密度为 ${number(density, 1)} g/cm³，量筒中液体体积为 ${volume} cm³。求这部分液体的质量。`,
            steps: [
              "由密度定义式 ρ=m/V 变形得 m=ρV。",
              `m=${number(density, 1)}×${volume}=${number(mass)} g。`,
              "质量和体积采用 g、cm³，与密度单位 g/cm³ 配套。"
            ],
            answer: `${number(mass)} g。`
          };
        }
        if (role === "far") {
          const bottle = 40 + 2 * r;
          const waterMass = 100 + 5 * r;
          const liquidMass = 75 + 4 * r;
          const density = liquidMass / waterMass;
          return {
            content: `同一只瓶子空瓶质量为 ${bottle} g，装满水后总质量为 ${bottle + waterMass} g，装满待测液体后总质量为 ${bottle + liquidMass} g。取水的密度为1.0 g/cm³，求待测液体密度。`,
            steps: [
              `瓶中水的质量为 ${bottle + waterMass}-${bottle}=${waterMass} g，因此瓶的容积 V=${waterMass}/1.0=${waterMass} cm³。`,
              `待测液体质量为 ${bottle + liquidMass}-${bottle}=${liquidMass} g。`,
              `ρ液=m液/V=${liquidMass}/${waterMass}=${number(density)} g/cm³。`
            ],
            answer: `${number(density)} g/cm³。`,
            check: "同一瓶子两次装满，体积相同；液体质量小于等体积水的质量，因此密度应小于1.0 g/cm³。"
          };
        }
        return {
          content: `把一块均匀实心材料切成质量相等的 ${r + 1} 块。有人认为每一块的质量变为原来的1/${r + 1}，所以密度也变为原来的1/${r + 1}。判断该说法是否正确，并说明理由。`,
          steps: [
            "密度是物质单位体积的质量，均匀材料的密度由材料种类和状态决定。",
            "切开后每一块的质量和体积都减半。",
            "由 ρ=m/V 可知分子、分母同比例变化，比值不变。"
          ],
          answer: "说法错误；两块材料的密度均与切开前相同。",
          check: "用极端情况检验：继续切成更小颗粒不会使同种材料密度趋近于零。"
        };
      }
    },
    {
      id: "pressure",
      title: "压强模型",
      topic: "压强",
      chapter: "压强与流体",
      examPoints: ["压强公式", "受力面积", "增大和减小压强"],
      misconceptionTags: ["压力越大压强一定越大", "受力面积识别错误"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const force = 240 + 40 * r;
          const area = 0.04 + 0.01 * r;
          const pressure = force / area;
          return {
            content: `某物体对水平地面的压力为 ${force} N，与地面的接触面积为 ${number(area, 2)} m²。求物体对地面的压强。`,
            steps: [
              "水平地面受到的压力和受力面积均已给出，使用 p=F/S。",
              `p=${force}/${number(area, 2)}=${number(pressure)} Pa。`,
              "Pa 等于 N/m²，单位与代入量一致。"
            ],
            answer: `${number(pressure)} Pa。`
          };
        }
        if (role === "near") {
          const mass = 4 + r;
          const length = 0.3 + 0.02 * r;
          const width = 0.2;
          const pressure = mass * 10 / (length * width);
          return {
            content: `质量为 ${mass} kg 的长方体平放在水平桌面上，底面长 ${number(length, 2)} m、宽 ${number(width, 1)} m，取 g=10 N/kg。求它对桌面的压强。`,
            steps: [
              `静止在水平桌面上，压力 F=G=mg=${mass}×10=${mass * 10} N。`,
              `受力面积 S=${number(length, 2)}×${number(width, 1)}=${number(length * width, 3)} m²。`,
              `p=F/S=${mass * 10}/${number(length * width, 3)}=${number(pressure)} Pa。`
            ],
            answer: `${number(pressure)} Pa。`
          };
        }
        if (role === "far") {
          const force = 500 + 50 * r;
          const oldArea = 0.02;
          const newArea = 0.08 + 0.01 * r;
          const ratio = oldArea / newArea;
          return {
            content: `救援人员受到雪地的总压力为 ${force} N。普通鞋底总接触面积为 ${oldArea} m²，穿雪板后总接触面积为 ${number(newArea, 2)} m²。求穿雪板后的压强，并求它是普通鞋底压强的多少倍。`,
            steps: [
              `穿雪板后 p板=F/S板=${force}/${number(newArea, 2)}=${number(force / newArea)} Pa。`,
              "两种状态压力相同，压强之比 p板/p鞋=S鞋/S板。",
              `p板/p鞋=${oldArea}/${number(newArea, 2)}=${number(ratio)}。`
            ],
            answer: `穿雪板后压强为 ${number(force / newArea)} Pa，是普通鞋底压强的 ${number(ratio)} 倍。`,
            check: "接触面积增大，压强应减小，因此倍数应小于1。"
          };
        }
        return {
          content: `甲、乙两个物体对地面的压力均为 ${300 + 50 * r} N，甲的接触面积为 ${number(0.01 * r, 2)} m²，乙的接触面积为 ${number(0.02 * r, 2)} m²。有人只根据“压力相同”判断两者压强相同。判断并说明理由。`,
          steps: [
            "压强由压力和受力面积共同决定，公式为 p=F/S。",
            "两物体压力相同，但甲的受力面积更小。",
            "分子相同而甲的分母更小，所以甲的压强更大。"
          ],
          answer: "判断错误；甲的压强大于乙的压强。"
        };
      }
    },
    {
      id: "buoyancy",
      title: "浮力状态",
      topic: "浮力",
      chapter: "浮力",
      examPoints: ["阿基米德原理", "称重法", "漂浮条件"],
      misconceptionTags: ["下沉物体浮力一定更大", "把物重当作浮力"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const volume = (120 + 20 * r) / 1e6;
          const buoyancy = 1000 * 10 * volume;
          return {
            content: `体积为 ${number(volume * 1e6)} cm³ 的物体完全浸没在水中，取 ρ水=1.0×10³ kg/m³、g=10 N/kg。求物体受到的浮力。`,
            steps: [
              `排开水的体积等于物体体积：V排=${number(volume * 1e6)} cm³=${number(volume, 6)} m³。`,
              "根据阿基米德原理 F浮=ρ液gV排。",
              `F浮=1.0×10³×10×${number(volume, 6)}=${number(buoyancy)} N。`
            ],
            answer: `${number(buoyancy)} N。`
          };
        }
        if (role === "near") {
          const weight = 5 + r;
          const indicated = 3 + 0.5 * r;
          const buoyancy = weight - indicated;
          return {
            content: `物体在空气中的重力为 ${weight} N，完全浸没在某液体中时弹簧测力计示数为 ${number(indicated, 1)} N。求物体受到的浮力。`,
            steps: [
              "物体静止时，竖直方向满足拉力与浮力之和等于重力。",
              "称重法得到 F浮=G-F示。",
              `F浮=${weight}-${number(indicated, 1)}=${number(buoyancy, 1)} N。`
            ],
            answer: `${number(buoyancy, 1)} N。`
          };
        }
        if (role === "far") {
          const density = 600 + 50 * r;
          const fraction = density / 1000;
          return {
            content: `一均匀物块密度为 ${density} kg/m³，静止漂浮在水面上。取 ρ水=1000 kg/m³，求物块浸入水中的体积占总体积的比例。`,
            steps: [
              "漂浮时物块所受浮力等于物重。",
              "ρ水gV排=ρ物gV物，约去 g。",
              `V排/V物=ρ物/ρ水=${density}/1000=${number(fraction)}。`
            ],
            answer: `浸入比例为 ${number(fraction)}，即 ${number(fraction * 100)}%。`,
            check: "物块密度小于水，浸入比例应小于1。"
          };
        }
        return {
          content: `体积均为 ${100 + 20 * r} cm³ 的铁块和铝块都完全浸没在同一种水中。有人认为铁块更重，所以它受到的浮力一定更大。判断并说明理由。`,
          steps: [
            "阿基米德原理表明 F浮=ρ液gV排。",
            "两物体完全浸没、体积相同，因此排开水的体积相同。",
            "液体密度和 g 也相同，所以两者浮力相同，与物体自身质量无直接关系。"
          ],
          answer: "说法错误；两物体受到的浮力相同。"
        };
      }
    },
    {
      id: "lever",
      title: "杠杆平衡",
      topic: "简单机械",
      chapter: "功和机械能",
      examPoints: ["杠杆平衡条件", "力臂", "省力与费距离"],
      misconceptionTags: ["把杠杆长度当力臂", "省力机械省功"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const resistance = 120 + 20 * r;
          const resistanceArm = 0.2 + 0.02 * r;
          const powerArm = 0.6 + 0.03 * r;
          const power = resistance * resistanceArm / powerArm;
          return {
            content: `杠杆水平平衡，阻力为 ${resistance} N，阻力臂为 ${number(resistanceArm, 2)} m，动力臂为 ${number(powerArm, 2)} m。求动力大小。`,
            steps: [
              "杠杆平衡条件为 F动l动=F阻l阻。",
              `F动=${resistance}×${number(resistanceArm, 2)}/${number(powerArm, 2)}。`,
              `计算得 F动=${number(power)} N。`
            ],
            answer: `${number(power)} N。`
          };
        }
        if (role === "near") {
          const power = 40 + 5 * r;
          const powerArm = 0.8;
          const resistance = 160 + 20 * r;
          const resistanceArm = power * powerArm / resistance;
          return {
            content: `用动力 ${power} N 使杠杆平衡，动力臂为 ${powerArm} m，阻力为 ${resistance} N。求阻力臂。`,
            steps: [
              "仍使用 F动l动=F阻l阻。",
              `l阻=F动l动/F阻=${power}×${powerArm}/${resistance}。`,
              `l阻=${number(resistanceArm)} m。`
            ],
            answer: `${number(resistanceArm)} m。`
          };
        }
        if (role === "far") {
          const child = 300 + 20 * r;
          const childArm = 1.2;
          const adultArm = 0.6 + 0.05 * r;
          const adult = child * childArm / adultArm;
          return {
            content: `跷跷板可看作杠杆。小孩重 ${child} N，坐在距支点 ${childArm} m 处；另一人坐在支点另一侧距支点 ${number(adultArm, 2)} m 处。忽略板重，求另一人的重力才能平衡。`,
            steps: [
              "支点两侧重力对支点产生方向相反的力矩。",
              `G另×${number(adultArm, 2)}=${child}×${childArm}。`,
              `G另=${child}×${childArm}/${number(adultArm, 2)}=${number(adult)} N。`
            ],
            answer: `${number(adult)} N。`
          };
        }
        return {
          content: `使用理想省力杠杆把重物提升 ${number(0.1 * r, 1)} m 时，有人认为既然动力变小，动力做的功也一定比直接提升少。判断并说明理由。`,
          steps: [
            "理想机械只能改变力的大小或方向，不能省功。",
            "省力杠杆的动力作用点移动距离更大。",
            "忽略损耗时，动力功等于克服阻力所做的功。"
          ],
          answer: "说法错误；理想省力杠杆省力但费距离，不省功。"
        };
      }
    },
    {
      id: "efficiency",
      title: "机械效率",
      topic: "机械效率",
      chapter: "简单机械",
      examPoints: ["有用功", "总功", "机械效率"],
      misconceptionTags: ["机械效率可超过100%", "有用功和额外功混淆"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const mass = 20 + 2 * r;
          const height = 2 + 0.2 * r;
          const total = mass * 10 * height + 100 + 10 * r;
          const useful = mass * 10 * height;
          const efficiency = useful / total * 100;
          return {
            content: `用机械把质量为 ${mass} kg 的物体提升 ${number(height, 1)} m，取 g=10 N/kg，实际做总功 ${number(total)} J。求有用功和机械效率。`,
            steps: [
              `有用功 W有=mgh=${mass}×10×${number(height, 1)}=${number(useful)} J。`,
              "机械效率 η=W有/W总×100%。",
              `η=${number(useful)}/${number(total)}×100%=${number(efficiency, 1)}%。`
            ],
            answer: `有用功 ${number(useful)} J，机械效率 ${number(efficiency, 1)}%。`
          };
        }
        if (role === "near") {
          const force = 120 + 10 * r;
          const distance = 3 + 0.2 * r;
          const weight = 300 + 20 * r;
          const height = 1 + 0.1 * r;
          const efficiency = weight * height / (force * distance) * 100;
          return {
            content: `用斜面把重为 ${weight} N 的物体提升 ${number(height, 1)} m，沿斜面拉力为 ${force} N，物体沿斜面移动 ${number(distance, 1)} m。求斜面的机械效率。`,
            steps: [
              `有用功 W有=Gh=${weight}×${number(height, 1)}=${number(weight * height)} J。`,
              `总功 W总=Fs=${force}×${number(distance, 1)}=${number(force * distance)} J。`,
              `η=W有/W总×100%=${number(efficiency, 1)}%。`
            ],
            answer: `${number(efficiency, 1)}%。`,
            check: "存在摩擦损耗，机械效率必须小于100%。"
          };
        }
        if (role === "far") {
          const usefulPower = 800 + 50 * r;
          const inputPower = usefulPower + 200 + 20 * r;
          const efficiency = usefulPower / inputPower * 100;
          return {
            content: `某提升设备输入功率为 ${inputPower} W，其中用于提升货物的有用功率为 ${usefulPower} W。求设备效率及每秒损耗的能量。`,
            steps: [
              `η=P有/P总×100%=${usefulPower}/${inputPower}×100%=${number(efficiency, 1)}%。`,
              `损耗功率 P损=P总-P有=${inputPower}-${usefulPower}=${inputPower - usefulPower} W。`,
              "1 W=1 J/s，因此每秒损耗能量数值等于损耗功率。"
            ],
            answer: `效率 ${number(efficiency, 1)}%，每秒损耗 ${inputPower - usefulPower} J。`
          };
        }
        return {
          content: `某同学计算出一台实际机械的效率为 ${105 + 5 * r}%。判断结果是否可能，并指出优先检查哪些量。`,
          steps: [
            "机械效率 η=W有/W总，实际机械的总功包含有用功和额外功。",
            "实际机械中 W总≥W有，所以效率不可能超过100%。",
            "应检查有用功与总功是否颠倒、单位是否统一以及路程或高度是否代错。"
          ],
          answer: "不可能；实际机械效率应不大于100%，应复核功的分类、单位和代入数据。"
        };
      }
    },
    {
      id: "heat",
      title: "热量与比热",
      topic: "内能与热传递",
      chapter: "内能",
      examPoints: ["吸热公式", "比热容", "热平衡"],
      misconceptionTags: ["温度高含热量多", "质量和比热容遗漏"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const mass = 1 + 0.2 * r;
          const delta = 20 + 5 * r;
          const heat = 4.2e3 * mass * delta;
          return {
            content: `质量为 ${number(mass, 1)} kg 的水从20 ℃升高到 ${20 + delta} ℃，水的比热容为4.2×10³ J/(kg·℃)。求水吸收的热量。`,
            steps: [
              `温度变化 Δt=${20 + delta}-20=${delta} ℃。`,
              "使用 Q吸=cmΔt。",
              `Q=4.2×10³×${number(mass, 1)}×${delta}=${number(heat)} J。`
            ],
            answer: `${number(heat)} J。`
          };
        }
        if (role === "near") {
          const hotMass = 0.4 + 0.1 * r;
          const coldMass = 0.6 + 0.1 * r;
          const hotTemp = 80;
          const coldTemp = 20;
          const finalTemp = (hotMass * hotTemp + coldMass * coldTemp) / (hotMass + coldMass);
          return {
            content: `把 ${number(hotMass, 1)} kg、80 ℃的水与 ${number(coldMass, 1)} kg、20 ℃的水混合，忽略热损失，求平衡温度。`,
            steps: [
              "同种物质混合且无热损失，热水放热等于冷水吸热。",
              `m热c(80-t)=m冷c(t-20)，约去 c。`,
              `${number(hotMass, 1)}(80-t)=${number(coldMass, 1)}(t-20)，解得 t=${number(finalTemp, 1)} ℃。`
            ],
            answer: `${number(finalTemp, 1)} ℃。`,
            check: "平衡温度应位于20 ℃与80 ℃之间，并更接近质量较大一侧的初温。"
          };
        }
        if (role === "far") {
          const areaEnergy = 2.0e6 + 0.2e6 * r;
          const efficiency = 0.4 + 0.05 * r;
          const waterMass = 20 + 5 * r;
          const delta = areaEnergy * efficiency / (4.2e3 * waterMass);
          return {
            content: `太阳能装置一天接收太阳能 ${number(areaEnergy)} J，热效率为 ${number(efficiency * 100)}%，用于加热 ${waterMass} kg 水。忽略其他损失，水温升高多少？`,
            steps: [
              `水吸收热量 Q吸=ηQ太阳=${number(efficiency)}×${number(areaEnergy)}=${number(areaEnergy * efficiency)} J。`,
              "由 Q吸=cmΔt 得 Δt=Q吸/(cm)。",
              `Δt=${number(areaEnergy * efficiency)}/(4.2×10³×${waterMass})=${number(delta, 1)} ℃。`
            ],
            answer: `约 ${number(delta, 1)} ℃。`
          };
        }
        return {
          content: `质量均为 ${number(0.5 + 0.1 * r, 1)} kg 的水和食用油吸收相同热量，水的比热容较大。有人认为两者升高的温度相同。判断并说明理由。`,
          steps: [
            "由 Q=cmΔt 得 Δt=Q/(cm)。",
            "质量和吸收热量相同，温升与比热容成反比。",
            "水的比热容较大，因此水的温升较小。"
          ],
          answer: "说法错误；水升高的温度较小，食用油升高的温度较大。"
        };
      }
    },
    {
      id: "fuel",
      title: "燃料与效率",
      topic: "热机与能源",
      chapter: "内能的利用",
      examPoints: ["热值", "效率", "能量转化"],
      misconceptionTags: ["热值随燃料质量改变", "输入能量和有用能量颠倒"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const mass = 0.2 + 0.05 * r;
          const heatValue = 4.2e7;
          const heat = mass * heatValue;
          return {
            content: `完全燃烧 ${number(mass, 2)} kg 某燃料，热值为4.2×10⁷ J/kg。求燃料完全燃烧放出的热量。`,
            steps: [
              "燃料完全燃烧放热公式 Q放=mq。",
              `Q放=${number(mass, 2)}×4.2×10⁷。`,
              `Q放=${number(heat)} J。`
            ],
            answer: `${number(heat)} J。`
          };
        }
        if (role === "near") {
          const mass = 0.4 + 0.05 * r;
          const heatValue = 3.0e7;
          const efficiency = 0.3 + 0.03 * r;
          const useful = mass * heatValue * efficiency;
          return {
            content: `热机完全燃烧 ${number(mass, 2)} kg 燃料，热值为3.0×10⁷ J/kg，热机效率为 ${number(efficiency * 100)}%。求转化成机械功的能量。`,
            steps: [
              `燃料放热 Q放=mq=${number(mass, 2)}×3.0×10⁷=${number(mass * heatValue)} J。`,
              "有用机械功 W=ηQ放。",
              `W=${number(efficiency)}×${number(mass * heatValue)}=${number(useful)} J。`
            ],
            answer: `${number(useful)} J。`
          };
        }
        if (role === "far") {
          const work = 6e6 + r * 5e5;
          const efficiency = 0.25 + 0.02 * r;
          const heatValue = 4e7;
          const fuelMass = work / efficiency / heatValue;
          return {
            content: `一台机械完成 ${number(work)} J 的有用功，热机效率为 ${number(efficiency * 100)}%，所用燃料热值为4.0×10⁷ J/kg。求至少需要完全燃烧多少千克燃料。`,
            steps: [
              `效率 η=W有/Q放，所以 Q放=W有/η=${number(work)}/${number(efficiency)}=${number(work / efficiency)} J。`,
              "由 Q放=mq 得 m=Q放/q。",
              `m=${number(work / efficiency)}/(4.0×10⁷)=${number(fuelMass, 3)} kg。`
            ],
            answer: `约 ${number(fuelMass, 3)} kg。`
          };
        }
        return {
          content: `把同一种燃料分成两份，其中一份质量是另一份的 ${r + 1} 倍。有人认为质量较大的那份热值也变为 ${r + 1} 倍。判断并说明理由。`,
          steps: [
            "热值表示单位质量燃料完全燃烧放出的热量，是燃料种类的特性。",
            "同种燃料在状态相同时热值相同，不随取用质量改变。",
            "质量较大的那份完全燃烧放出的总热量更大，但热值不变。"
          ],
          answer: "说法错误；两份燃料热值相同，质量大的只是在完全燃烧时总放热更多。"
        };
      }
    },
    {
      id: "ohm",
      title: "欧姆定律",
      topic: "欧姆定律",
      chapter: "欧姆定律",
      examPoints: ["串并联电路", "欧姆定律", "电压分配"],
      misconceptionTags: ["电流经过用电器被消耗", "串并联关系混淆"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const r1 = 4 + r;
          const r2 = 8 + r;
          const voltage = 12 + 3 * r;
          const current = voltage / (r1 + r2);
          return {
            content: `电阻 R₁=${r1} Ω、R₂=${r2} Ω 串联接在 ${voltage} V 电源两端，不计电源内阻。求电路电流和 R₂ 两端电压。`,
            steps: [
              `串联总电阻 R=R₁+R₂=${r1}+${r2}=${r1 + r2} Ω。`,
              `I=U/R=${voltage}/${r1 + r2}=${number(current)} A。`,
              `U₂=IR₂=${number(current)}×${r2}=${number(current * r2)} V。`
            ],
            answer: `电流 ${number(current)} A，R₂ 两端电压 ${number(current * r2)} V。`,
            check: "串联分压之和应等于电源电压。"
          };
        }
        if (role === "near") {
          const r1 = 6 + r;
          const r2 = 12 + 2 * r;
          const voltage = 12;
          const i1 = voltage / r1;
          const i2 = voltage / r2;
          return {
            content: `电阻 R₁=${r1} Ω、R₂=${r2} Ω 并联接在12 V电源两端。求两支路电流和干路电流。`,
            steps: [
              "并联各支路两端电压均等于电源电压。",
              `I₁=U/R₁=12/${r1}=${number(i1)} A，I₂=12/${r2}=${number(i2)} A。`,
              `干路电流 I=I₁+I₂=${number(i1 + i2)} A。`
            ],
            answer: `I₁=${number(i1)} A，I₂=${number(i2)} A，干路电流 ${number(i1 + i2)} A。`
          };
        }
        if (role === "far") {
          const fixed = 10 + r;
          const sensor = 20 + 2 * r;
          const voltage = 9 + r;
          const current = voltage / (fixed + sensor);
          return {
            content: `传感器可等效为 ${sensor} Ω 电阻，与 ${fixed} Ω 定值电阻串联接在 ${voltage} V 电源上。求电路电流和传感器两端电压。若传感器电阻增大，传感器分得的电压如何变化？`,
            steps: [
              `串联总电阻 R总=${sensor}+${fixed}=${sensor + fixed} Ω。`,
              `I=${voltage}/${sensor + fixed}=${number(current)} A，U传=IR传=${number(current * sensor)} V。`,
              "由 U传=U·R传/(R传+R定) 可知，在U、R定不变时，R传增大，分压增大。"
            ],
            answer: `电流 ${number(current)} A，传感器电压 ${number(current * sensor)} V；传感器电阻增大时其分压增大。`
          };
        }
        return {
          content: `在由 ${r + 1} 个灯泡组成的稳定串联电路中，有人认为电流每经过一个灯泡都会“被消耗一部分”，所以越靠后的灯泡电流越小。判断并说明理由。`,
          steps: [
            "稳定串联电路只有一条电流路径。",
            "单位时间通过各截面的电荷量相同，否则某处会持续积累电荷。",
            "用电器转化的是电能，不消耗电荷，因此串联各处电流相等。"
          ],
          answer: "说法错误；稳定串联电路各处电流相等，用电器消耗的是电能而不是电流。"
        };
      }
    },
    {
      id: "electric-power",
      title: "电功率与电能",
      topic: "电功率",
      chapter: "电功率",
      examPoints: ["电功率", "电能", "额定值"],
      misconceptionTags: ["功率与耗电量混淆", "额定功率等于实际功率"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const voltage = 12 + 2 * r;
          const current = 0.5 + 0.1 * r;
          const power = voltage * current;
          return {
            content: `某用电器两端电压为 ${voltage} V，通过电流为 ${number(current, 1)} A。求它的电功率；连续工作10 min消耗多少电能？`,
            steps: [
              `P=UI=${voltage}×${number(current, 1)}=${number(power)} W。`,
              "时间10 min=600 s。",
              `W=Pt=${number(power)}×600=${number(power * 600)} J。`
            ],
            answer: `功率 ${number(power)} W，10 min消耗 ${number(power * 600)} J。`
          };
        }
        if (role === "near") {
          const ratedVoltage = 220;
          const ratedPower = 880 + 110 * r;
          const resistance = ratedVoltage ** 2 / ratedPower;
          return {
            content: `某电热器铭牌标有“220 V ${ratedPower} W”。假设电阻不随温度变化，求其正常工作电流和电阻。`,
            steps: [
              `正常工作电流 I=P/U=${ratedPower}/220=${number(ratedPower / 220)} A。`,
              `由 P=U²/R 得 R=U²/P=220²/${ratedPower}。`,
              `R=${number(resistance)} Ω。`
            ],
            answer: `电流 ${number(ratedPower / 220)} A，电阻 ${number(resistance)} Ω。`
          };
        }
        if (role === "far") {
          const power = 1.2 + 0.2 * r;
          const hours = 2 + r;
          const days = 30;
          const energy = power * hours * days;
          const price = 0.6;
          return {
            content: `一台功率为 ${number(power, 1)} kW 的电器每天使用 ${hours} h，连续使用30天。求消耗电能及按0.60元/(kW·h)计算的电费。`,
            steps: [
              `总时间 t=${hours}×30=${hours * days} h。`,
              `W=Pt=${number(power, 1)}×${hours * days}=${number(energy)} kW·h。`,
              `电费=${number(energy)}×0.60=${number(energy * price, 2)} 元。`
            ],
            answer: `消耗 ${number(energy)} kW·h，电费 ${number(energy * price, 2)} 元。`
          };
        }
        return {
          content: `两台电器的额定功率分别为 ${800 + 100 * r} W和 ${400 + 50 * r} W。有人认为前者工作一次一定比后者耗电多。判断并说明还需比较什么。`,
          steps: [
            "功率表示单位时间消耗电能的快慢，电能 W=Pt。",
            "总耗电量同时取决于实际功率和工作时间。",
            "若1000 W电器工作时间足够短，其耗电量可以小于500 W电器。"
          ],
          answer: "不能仅凭功率判断；还需比较实际功率和工作时间。"
        };
      }
    },
    {
      id: "home-circuit",
      title: "家庭电路",
      topic: "生活用电",
      chapter: "生活用电",
      examPoints: ["家庭电路并联", "总功率与总电流", "安全用电"],
      misconceptionTags: ["家用电器串联", "保险装置额定值越大越好"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const powers = [800 + 100 * r, 1000 + 100 * r, 200];
          const total = powers.reduce((sum, value) => sum + value, 0);
          const current = total / 220;
          return {
            content: `家庭电路中同时使用 ${powers[0]} W电热器、${powers[1]} W电饭锅和200 W电视机，电压为220 V。求总功率和干路电流。`,
            steps: [
              "家用电器并联，同时工作时总功率等于各用电器功率之和。",
              `P总=${powers.join("+")}=${total} W。`,
              `I总=P总/U=${total}/220=${number(current)} A。`
            ],
            answer: `总功率 ${total} W，干路电流 ${number(current)} A。`
          };
        }
        if (role === "near") {
          const ratedCurrent = 10 + 2 * r;
          const maxPower = 220 * ratedCurrent;
          return {
            content: `某家庭支路允许通过的最大电流为 ${ratedCurrent} A，电压为220 V。求该支路允许同时使用的最大总功率。若已使用 ${maxPower - 500} W电器，还能否再接入800 W电器？`,
            steps: [
              `最大功率 Pmax=UImax=220×${ratedCurrent}=${maxPower} W。`,
              `接入后总功率=${maxPower - 500}+800=${maxPower + 300} W。`,
              "该总功率超过允许最大值，因此不能同时接入。"
            ],
            answer: `最大总功率 ${maxPower} W；不能再接入800 W电器。`
          };
        }
        if (role === "far") {
          const power = 1200 + 100 * r;
          const time = 300 + 30 * r;
          const mass = 1.5 + 0.1 * r;
          const heat = 4.2e3 * mass * 50;
          const input = power * time;
          const efficiency = heat / input * 100;
          return {
            content: `一台电热水壶功率为 ${power} W，加热 ${number(mass, 1)} kg 水使其升温50 ℃，用时 ${time} s。水的比热容为4.2×10³ J/(kg·℃)。求水吸热、电流做功和加热效率。`,
            steps: [
              `水吸热 Q=cmΔt=4.2×10³×${number(mass, 1)}×50=${number(heat)} J。`,
              `电流做功 W=Pt=${power}×${time}=${number(input)} J。`,
              `η=Q/W×100%=${number(efficiency, 1)}%。`
            ],
            answer: `水吸热 ${number(heat)} J，电流做功 ${number(input)} J，效率 ${number(efficiency, 1)}%。`
          };
        }
        return {
          content: `某家庭支路原配额定电流 ${8 + r} A 的保险装置。为了避免频繁断开，有人建议直接换成 ${16 + 2 * r} A。判断这种做法是否安全，并说明原因。`,
          steps: [
            "保险装置的额定电流应与导线允许电流和支路设计负荷匹配。",
            "额定电流过大时，线路过载后保险装置可能不能及时切断电路。",
            "导线会因过热增加火灾风险，因此不能任意加大额定电流。"
          ],
          answer: "不安全；保险装置额定电流应与线路匹配，不能任意增大。"
        };
      }
    }
  ];

  const high3Models = [
    {
      id: "braking",
      title: "匀变速制动",
      topic: "直线运动",
      chapter: "运动学综合",
      examPoints: ["匀变速运动", "制动距离", "反应时间"],
      misconceptionTags: ["速度为零时加速度一定为零", "反应距离遗漏"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const speed = 16 + 2 * r;
          const deceleration = 4 + 0.5 * r;
          const time = speed / deceleration;
          const distance = speed ** 2 / (2 * deceleration);
          return {
            content: `汽车以 ${speed} m/s 匀速行驶，随后以大小为 ${number(deceleration, 1)} m/s² 的加速度匀减速直至停止。求制动时间和制动距离。`,
            steps: [
              "取初速度方向为正，制动加速度 a 为负，大小为给定值。",
              `由 0=v₀-at 得 t=v₀/a=${speed}/${number(deceleration, 1)}=${number(time)} s。`,
              `由 0-v₀²=-2as 得 s=v₀²/(2a)=${speed}²/(2×${number(deceleration, 1)})=${number(distance)} m。`
            ],
            answer: `制动时间 ${number(time)} s，制动距离 ${number(distance)} m。`
          };
        }
        if (role === "near") {
          const speed = 18 + 2 * r;
          const reaction = 0.6 + 0.1 * r;
          const deceleration = 5;
          const reactionDistance = speed * reaction;
          const brakeDistance = speed ** 2 / (2 * deceleration);
          return {
            content: `汽车速度为 ${speed} m/s，驾驶员反应时间为 ${number(reaction, 1)} s，制动加速度大小为5 m/s²。反应阶段速度不变，求从发现障碍到停止的总距离。`,
            steps: [
              `反应距离 s₁=v₀t反=${speed}×${number(reaction, 1)}=${number(reactionDistance)} m。`,
              `制动距离 s₂=v₀²/(2a)=${speed}²/(2×5)=${number(brakeDistance)} m。`,
              `总距离 s=s₁+s₂=${number(reactionDistance + brakeDistance)} m。`
            ],
            answer: `${number(reactionDistance + brakeDistance)} m。`
          };
        }
        if (role === "far") {
          const speedKmh = 72 + 9 * r;
          const speed = speedKmh / 3.6;
          const distance = 80 + 10 * r;
          const deceleration = speed ** 2 / (2 * distance);
          return {
            content: `列车以 ${speedKmh} km/h 行驶，开始制动后恰好在 ${distance} m 内匀减速停下。求制动加速度的大小。`,
            steps: [
              `先统一单位：v₀=${speedKmh}/3.6=${number(speed)} m/s。`,
              "由 0-v₀²=-2as 得加速度大小 a=v₀²/(2s)。",
              `a=${number(speed)}²/(2×${distance})=${number(deceleration)} m/s²。`
            ],
            answer: `${number(deceleration)} m/s²。`
          };
        }
        return {
          content: `小球以 ${10 + 2 * r} m/s 竖直上抛，到达最高点时速度瞬时为零。有人据此判断该时刻加速度也为零。忽略空气阻力，判断并说明理由。`,
          steps: [
            "速度描述运动状态，加速度描述速度变化快慢，两者不是同一物理量。",
            "最高点小球仍受重力作用，合力不为零。",
            "因此最高点加速度仍为重力加速度，方向竖直向下。"
          ],
          answer: "判断错误；最高点速度为零，但加速度仍为g，方向竖直向下。"
        };
      }
    },
    {
      id: "newton-incline",
      title: "斜面受力",
      topic: "牛顿运动定律",
      chapter: "动力学综合",
      examPoints: ["受力分析", "牛顿第二定律", "摩擦力"],
      misconceptionTags: ["运动必须持续受力", "摩擦力方向固定"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const mass = 2 + 0.5 * r;
          const mu = 0.1 + 0.02 * r;
          const sin = 0.5;
          const cos = Math.sqrt(3) / 2;
          const acceleration = 10 * (sin - mu * cos);
          return {
            content: `质量为 ${number(mass, 1)} kg 的物块从倾角30°的粗糙斜面上由静止下滑，动摩擦因数为 ${number(mu, 2)}，取 g=10 m/s²、sin30°=0.5、cos30°=0.866。求物块加速度。`,
            steps: [
              "沿斜面向下为正。支持力 N=mgcos30°，滑动摩擦力 f=μN，方向沿斜面向上。",
              "沿斜面列牛顿第二定律：mgsin30°-μmgcos30°=ma。",
              `a=g(sin30°-μcos30°)=10×(0.5-${number(mu, 2)}×0.866)=${number(acceleration)} m/s²。`
            ],
            answer: `${number(acceleration)} m/s²，方向沿斜面向下。`
          };
        }
        if (role === "near") {
          const mass = 3 + r;
          const force = 30 + 5 * r;
          const mu = 0.2;
          const acceleration = (force - mu * mass * 10) / mass;
          return {
            content: `质量为 ${mass} kg 的物块置于水平粗糙面上，受到水平向右 ${force} N 拉力，动摩擦因数为0.20，取 g=10 m/s²。物块滑动时求加速度。`,
            steps: [
              `竖直方向平衡，N=mg=${mass * 10} N。`,
              `滑动摩擦力 f=μN=0.20×${mass * 10}=${2 * mass} N，方向向左。`,
              `由 F-f=ma，a=(${force}-${2 * mass})/${mass}=${number(acceleration)} m/s²。`
            ],
            answer: `${number(acceleration)} m/s²，方向水平向右。`
          };
        }
        if (role === "far") {
          const mass = 50 + 5 * r;
          const acceleration = 1 + 0.2 * r;
          const support = mass * (10 + acceleration);
          return {
            content: `质量为 ${mass} kg 的学生站在竖直向上加速的电梯内，电梯加速度为 ${number(acceleration, 1)} m/s²，取 g=10 m/s²。求地板对学生的支持力。`,
            steps: [
              "研究学生，受重力mg向下、支持力N向上。",
              "取向上为正，由 N-mg=ma。",
              `N=m(g+a)=${mass}×(10+${number(acceleration, 1)})=${number(support)} N。`
            ],
            answer: `${number(support)} N。`
          };
        }
        return {
          content: `质量为 ${2 + r} kg 的物体在光滑水平面上以 ${3 + r} m/s 做匀速直线运动。有人认为要维持该速度，水平方向必须始终有一个恒力。判断并说明理由。`,
          steps: [
            "牛顿第一定律说明物体在合力为零时保持静止或匀速直线运动。",
            "光滑水平面上重力与支持力平衡，水平方向无需持续外力。",
            "持续恒力会使物体产生加速度，而不是维持原速度。"
          ],
          answer: "说法错误；合力为零即可保持匀速直线运动，持续恒力会改变速度。"
        };
      }
    },
    {
      id: "energy",
      title: "功能关系",
      topic: "机械能",
      chapter: "功能关系",
      examPoints: ["机械能守恒", "动能定理", "弹性势能"],
      misconceptionTags: ["有速度就一定有机械能守恒", "忽略非保守力做功"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const height = 2 + 0.4 * r;
          const speed = Math.sqrt(2 * 10 * height);
          return {
            content: `物体从光滑轨道上距最低点 ${number(height, 1)} m 高处由静止滑下，取 g=10 m/s²。求到达最低点时速度。`,
            steps: [
              "轨道光滑，支持力不做功，物体机械能守恒。",
              "取最低点重力势能为零：mgh=½mv²。",
              `v=√(2gh)=√(2×10×${number(height, 1)})=${number(speed)} m/s。`
            ],
            answer: `${number(speed)} m/s。`
          };
        }
        if (role === "near") {
          const mass = 2 + 0.5 * r;
          const force = 4 + r;
          const distance = 6 + r;
          const initialSpeed = 2;
          const finalSpeed = Math.sqrt(initialSpeed ** 2 + 2 * force * distance / mass);
          return {
            content: `质量为 ${number(mass, 1)} kg 的物体在水平面上以2 m/s运动，受到沿运动方向恒力 ${force} N，作用距离 ${distance} m，忽略摩擦。求末速度。`,
            steps: [
              "恒力做功改变物体动能，使用动能定理。",
              `Fs=½mv²-½mv₀²。`,
              `v=√(v₀²+2Fs/m)=√(2²+2×${force}×${distance}/${number(mass, 1)})=${number(finalSpeed)} m/s。`
            ],
            answer: `${number(finalSpeed)} m/s。`
          };
        }
        if (role === "far") {
          const mass = 1 + 0.2 * r;
          const k = 100 + 20 * r;
          const compression = 0.2 + 0.02 * r;
          const speed = compression * Math.sqrt(k / mass);
          return {
            content: `质量为 ${number(mass, 1)} kg 的物块与劲度系数 ${k} N/m 的轻弹簧相连，弹簧压缩 ${number(compression, 2)} m 后由静止释放。水平面光滑，求弹簧恢复原长时物块速度。`,
            steps: [
              "水平面光滑，弹簧和物块系统机械能守恒。",
              "初态弹性势能转化为物块动能：½kx²=½mv²。",
              `v=x√(k/m)=${number(compression, 2)}×√(${k}/${number(mass, 1)})=${number(speed)} m/s。`
            ],
            answer: `${number(speed)} m/s。`
          };
        }
        return {
          content: `物块沿动摩擦因数为 ${number(0.1 + 0.02 * r, 2)} 的粗糙斜面下滑，摩擦不可忽略。有人直接令重力势能减少量等于动能增加量。判断该做法是否成立，并给出正确关系。`,
          steps: [
            "摩擦力对物块做负功，机械能发生耗散。",
            "因此重力势能减少量不只转化为动能，还转化为内能。",
            "正确关系可写为 mgh=ΔEk+Q，或使用合力功等于动能变化。"
          ],
          answer: "不成立；应计入摩擦耗散，mgh=ΔEk+Q（Q为产生的内能）。"
        };
      }
    },
    {
      id: "momentum",
      title: "动量守恒",
      topic: "动量",
      chapter: "碰撞与动量",
      examPoints: ["动量守恒", "完全非弹性碰撞", "反冲"],
      misconceptionTags: ["任何系统动量都守恒", "动量守恒等于机械能守恒"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const m1 = 2 + r;
          const v1 = 4 + r;
          const m2 = 3 + r;
          const common = m1 * v1 / (m1 + m2);
          return {
            content: `质量 ${m1} kg 的物体以 ${v1} m/s 向右运动，与前方静止的 ${m2} kg 物体碰撞后粘在一起。碰撞时间很短，忽略外力冲量，求共同速度。`,
            steps: [
              "取向右为正，碰撞系统外力冲量可忽略，动量守恒。",
              `m₁v₁=(m₁+m₂)v。`,
              `v=${m1}×${v1}/(${m1}+${m2})=${number(common)} m/s。`
            ],
            answer: `${number(common)} m/s，方向向右。`
          };
        }
        if (role === "near") {
          const m1 = 1 + 0.5 * r;
          const v1 = 6 + r;
          const m2 = 2 + 0.5 * r;
          const v2 = -2;
          const common = (m1 * v1 + m2 * v2) / (m1 + m2);
          return {
            content: `质量 ${number(m1, 1)} kg 的甲以 ${v1} m/s 向右运动，质量 ${number(m2, 1)} kg 的乙以2 m/s向左运动。两者碰后粘在一起，忽略外力冲量。求共同速度。`,
            steps: [
              "取向右为正，乙的初速度为-2 m/s。",
              `m甲v甲+m乙v乙=(m甲+m乙)v。`,
              `v=[${number(m1, 1)}×${v1}+${number(m2, 1)}×(-2)]/[${number(m1 + m2, 1)}]=${number(common)} m/s。`
            ],
            answer: `${number(Math.abs(common))} m/s，方向${common >= 0 ? "向右" : "向左"}。`
          };
        }
        if (role === "far") {
          const person = 50 + 5 * r;
          const board = 20 + 2 * r;
          const personSpeed = 2 + 0.2 * r;
          const boardSpeed = person * personSpeed / board;
          return {
            content: `质量为 ${person} kg 的人站在质量为 ${board} kg 的静止小车上。人相对地面以 ${number(personSpeed, 1)} m/s 向右跳出，忽略水平外力冲量，求小车相对地面的速度。`,
            steps: [
              "人和小车初动量为零，跳出过程水平动量守恒。",
              "取向右为正：m人v人+m车v车=0。",
              `v车=-m人v人/m车=-${person}×${number(personSpeed, 1)}/${board}=-${number(boardSpeed)} m/s。`
            ],
            answer: `${number(boardSpeed)} m/s，方向向左。`
          };
        }
        return {
          content: `一小球以 ${5 + r} m/s 的速率落地后反弹，把“小球”单独作为系统。有人认为碰撞时间很短，所以小球动量必然守恒。判断并说明理由。`,
          steps: [
            "动量是否守恒取决于所选系统所受外力冲量是否可忽略。",
            "小球与地面碰撞时受到地面较大的冲量，若只选小球为系统，该冲量是外力冲量。",
            "因此小球单独的动量不守恒；可扩大系统并重新检查外力冲量。"
          ],
          answer: "说法错误；小球受到地面不可忽略的外力冲量，单独看小球动量不守恒。"
        };
      }
    },
    {
      id: "circular",
      title: "圆周运动",
      topic: "圆周运动",
      chapter: "圆周运动综合",
      examPoints: ["向心力", "临界条件", "圆周运动模型"],
      misconceptionTags: ["向心力是一种独立的力", "速度越大向心力越小"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const radius = 20 + 5 * r;
          const mu = 0.4 + 0.05 * r;
          const maxSpeed = Math.sqrt(mu * 10 * radius);
          return {
            content: `汽车在水平圆弯道上行驶，弯道半径 ${radius} m，轮胎与路面的最大静摩擦因数为 ${number(mu, 2)}，取 g=10 m/s²。求不侧滑的最大速度。`,
            steps: [
              "水平弯道上静摩擦力提供向心力。",
              "临界时 μmg=mv²/r。",
              `vmax=√(μgr)=√(${number(mu, 2)}×10×${radius})=${number(maxSpeed)} m/s。`
            ],
            answer: `${number(maxSpeed)} m/s。`
          };
        }
        if (role === "near") {
          const radius = 1 + 0.2 * r;
          const minSpeed = Math.sqrt(10 * radius);
          return {
            content: `小球用轻绳系住在竖直面内做圆周运动，圆周半径为 ${number(radius, 1)} m。取 g=10 m/s²，求小球恰好通过最高点时的最小速度。`,
            steps: [
              "恰好通过最高点时绳张力为零，重力恰好提供向心力。",
              "mg=mv²/r。",
              `vmin=√(gr)=√(10×${number(radius, 1)})=${number(minSpeed)} m/s。`
            ],
            answer: `${number(minSpeed)} m/s。`
          };
        }
        if (role === "far") {
          const radius = 30 + 5 * r;
          const angle = 30;
          const speed = Math.sqrt(10 * radius / Math.sqrt(3));
          return {
            content: `无摩擦倾斜弯道半径为 ${radius} m，路面倾角30°，取 g=10 m/s²、tan30°=1/√3。求车辆恰好无需侧向摩擦时的速度。`,
            steps: [
              "支持力的竖直分量平衡重力，水平分量提供向心力。",
              "两式相除得 tanθ=v²/(rg)。",
              `v=√(rg tanθ)=√(${radius}×10/√3)=${number(speed)} m/s。`
            ],
            answer: `${number(speed)} m/s。`
          };
        }
        return {
          content: `分析汽车在半径 ${20 + 5 * r} m 的水平弯道转弯时，有人另外画出一种名为“向心力”的新作用力，并与摩擦力同时列入受力图。判断这种画法是否正确。`,
          steps: [
            "向心力不是按性质命名的新力，而是指向圆心方向的合力或某个力的分量。",
            "水平弯道中通常由静摩擦力提供向心力。",
            "若同时把摩擦力和“向心力”作为两个独立力，会重复计算。"
          ],
          answer: "画法错误；向心力是指向圆心的合力效果，不能与提供它的实际作用力重复列出。"
        };
      }
    },
    {
      id: "projectile",
      title: "抛体运动",
      topic: "曲线运动",
      chapter: "抛体运动",
      examPoints: ["运动分解", "平抛运动", "斜抛运动"],
      misconceptionTags: ["水平方向没有运动", "最高点加速度为零"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const height = 20 + 5 * r;
          const speed = 8 + r;
          const time = Math.sqrt(2 * height / 10);
          const range = speed * time;
          return {
            content: `小球从高 ${height} m 处以 ${speed} m/s 水平抛出，忽略空气阻力，取 g=10 m/s²。求落地时间和水平位移。`,
            steps: [
              `竖直方向做自由落体：h=½gt²，所以 t=√(2h/g)=√(2×${height}/10)=${number(time)} s。`,
              "水平方向做匀速直线运动。",
              `x=v₀t=${speed}×${number(time)}=${number(range)} m。`
            ],
            answer: `时间 ${number(time)} s，水平位移 ${number(range)} m。`
          };
        }
        if (role === "near") {
          const speed = 20 + 2 * r;
          const angle = 30;
          const vx = speed * Math.sqrt(3) / 2;
          const vy = speed * 0.5;
          const time = 2 * vy / 10;
          const range = vx * time;
          return {
            content: `物体以 ${speed} m/s 初速度、与水平面成30°角斜抛，落回同一水平面。忽略空气阻力，取 g=10 m/s²、sin30°=0.5、cos30°=0.866。求飞行时间和水平射程。`,
            steps: [
              `初速度分量 vx=v₀cos30°=${number(vx)} m/s，vy=v₀sin30°=${number(vy)} m/s。`,
              `回到同高处的飞行时间 T=2vy/g=2×${number(vy)}/10=${number(time)} s。`,
              `水平射程 x=vxT=${number(vx)}×${number(time)}=${number(range)} m。`
            ],
            answer: `飞行时间 ${number(time)} s，射程 ${number(range)} m。`
          };
        }
        if (role === "far") {
          const height = 1.25 + 0.25 * r;
          const distance = 4 + r;
          const time = Math.sqrt(2 * height / 10);
          const speed = distance / time;
          return {
            content: `水从距地面 ${number(height, 2)} m 高的水平喷口射出，落地点距喷口正下方 ${distance} m。忽略空气阻力，取 g=10 m/s²。求喷出速度。`,
            steps: [
              `竖直方向 h=½gt²，t=√(2h/g)=√(2×${number(height, 2)}/10)=${number(time)} s。`,
              "水平方向速度不变，x=v₀t。",
              `v₀=x/t=${distance}/${number(time)}=${number(speed)} m/s。`
            ],
            answer: `${number(speed)} m/s。`
          };
        }
        return {
          content: `物体以 ${15 + 3 * r} m/s 的初速度斜抛，到达轨迹最高点时竖直速度为零。有人认为此时合速度和加速度都为零。忽略空气阻力，判断并说明。`,
          steps: [
            "最高点只有竖直速度分量为零，水平速度分量仍保持不变。",
            "物体仍受重力作用，加速度始终为g，方向竖直向下。",
            "因此最高点合速度一般不为零，加速度也不为零。"
          ],
          answer: "说法错误；最高点仍有水平速度，加速度为g且竖直向下。"
        };
      }
    },
    {
      id: "electric-field",
      title: "带电粒子电场运动",
      topic: "电场",
      chapter: "静电场",
      examPoints: ["电场力做功", "电势差", "带电粒子加速"],
      misconceptionTags: ["电势为零等于场强为零", "电场力方向忽略电荷正负"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const charge = (1 + r) * 1e-6;
          const voltage = 100 + 20 * r;
          const work = charge * voltage;
          return {
            content: `电荷量为 +${number(charge / 1e-6)} μC 的粒子从电势较高处移动到电势较低处，电势差为 ${voltage} V。求电场力做功。`,
            steps: [
              "正电荷从高电势到低电势，电场力做正功。",
              "电场力做功 W=qU。",
              `W=${number(charge, 8)}×${voltage}=${number(work, 8)} J。`
            ],
            answer: `${number(work, 8)} J，电场力做正功。`
          };
        }
        if (role === "near") {
          const mass = (2 + r) * 1e-6;
          const charge = 2e-6;
          const voltage = 50 + 10 * r;
          const speed = Math.sqrt(2 * charge * voltage / mass);
          return {
            content: `质量为 ${number(mass / 1e-6)}×10⁻⁶ kg、电荷量为+2.0 μC的粒子由静止经 ${voltage} V 电势差加速，忽略重力。求末速度。`,
            steps: [
              "电场力做正功转化为粒子动能。",
              "qU=½mv²。",
              `v=√(2qU/m)=√[2×2.0×10⁻⁶×${voltage}/(${number(mass / 1e-6)}×10⁻⁶)]=${number(speed)} m/s。`
            ],
            answer: `${number(speed)} m/s。`
          };
        }
        if (role === "far") {
          const field = 1000 + 200 * r;
          const charge = -2e-6;
          const force = Math.abs(charge) * field;
          return {
            content: `一电荷量为−2.0 μC的微粒处于水平向右、场强 ${field} N/C 的匀强电场中，忽略其他力。求电场力大小和方向。`,
            steps: [
              `电场力大小 F=|q|E=2.0×10⁻⁶×${field}=${number(force, 6)} N。`,
              "负电荷受力方向与电场方向相反。",
              "电场向右，因此电场力向左。"
            ],
            answer: `${number(force, 6)} N，方向水平向左。`
          };
        }
        return {
          content: `在研究相距 ${10 + 2 * r} cm 的两点时，把其中一点电势选为零。有人据此判断该点电场强度一定为零。判断并说明理由。`,
          steps: [
            "电势是标量，其零点可人为选择，只有电势差有直接物理意义。",
            "电场强度由电势随空间位置的变化率决定，而不是由某点电势数值单独决定。",
            "因此某点电势为零时，场强可以不为零。"
          ],
          answer: "判断错误；电势零点可任意选取，某点电势为零不代表该点场强为零。"
        };
      }
    },
    {
      id: "dc-circuit",
      title: "闭合电路",
      topic: "恒定电流",
      chapter: "闭合电路欧姆定律",
      examPoints: ["电动势", "内阻", "路端电压"],
      misconceptionTags: ["路端电压总等于电动势", "内外电路功率混淆"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const emf = 12 + r;
          const internal = 1 + 0.2 * r;
          const load = 5 + r;
          const current = emf / (internal + load);
          return {
            content: `电源电动势为 ${emf} V、内阻为 ${number(internal, 1)} Ω，外接 ${load} Ω 电阻。求电流和路端电压。`,
            steps: [
              "闭合电路总电阻为 R+r。",
              `I=E/(R+r)=${emf}/(${load}+${number(internal, 1)})=${number(current)} A。`,
              `路端电压 U=IR=${number(current)}×${load}=${number(current * load)} V，也可用 U=E-Ir 校验。`
            ],
            answer: `电流 ${number(current)} A，路端电压 ${number(current * load)} V。`
          };
        }
        if (role === "near") {
          const emf = 10 + r;
          const internal = 1;
          const current = 2 + 0.2 * r;
          const terminal = emf - current * internal;
          return {
            content: `电源电动势 ${emf} V、内阻1.0 Ω，放电电流为 ${number(current, 1)} A。求路端电压和电源内部热功率。`,
            steps: [
              `路端电压 U=E-Ir=${emf}-${number(current, 1)}×1.0=${number(terminal, 1)} V。`,
              "电源内部热功率 P内=I²r。",
              `P内=${number(current, 1)}²×1.0=${number(current ** 2)} W。`
            ],
            answer: `路端电压 ${number(terminal, 1)} V，内部热功率 ${number(current ** 2)} W。`
          };
        }
        if (role === "far") {
          const emf = 6 + r;
          const internal = 0.5 + 0.1 * r;
          const shortCurrent = emf / internal;
          return {
            content: `某电源电动势为 ${emf} V、内阻为 ${number(internal, 1)} Ω。仅从理想模型估算其短路电流，并说明实际中为什么禁止短路。`,
            steps: [
              "短路时外电阻近似为零，闭合电路电流 I短=E/r。",
              `I短=${emf}/${number(internal, 1)}=${number(shortCurrent)} A。`,
              "大电流使电源和导线迅速发热，可能损坏电源并引发安全事故。"
            ],
            answer: `理想估算短路电流 ${number(shortCurrent)} A；实际禁止短路。`
          };
        }
        return {
          content: `电动势为 ${6 + 2 * r} V、内阻不为零的电源接入用电器后，有人认为路端电压始终等于电源电动势。判断并说明在放电状态下二者的关系。`,
          steps: [
            "实际电源存在内阻，放电电流通过内阻会产生电压降Ir。",
            "路端电压满足 U=E-Ir。",
            "只在电流为零或内阻可忽略时，路端电压才近似等于电动势。"
          ],
          answer: "说法错误；放电时 U=E-Ir，通常小于电动势E。"
        };
      }
    },
    {
      id: "magnetic",
      title: "带电粒子磁场运动",
      topic: "磁场",
      chapter: "带电粒子在磁场中的运动",
      examPoints: ["洛伦兹力", "圆周半径", "回旋周期"],
      misconceptionTags: ["磁场力改变速率", "忽略电荷正负判断方向"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const mass = 2e-6;
          const charge = 1e-6;
          const speed = 100 + 20 * r;
          const field = 0.4 + 0.05 * r;
          const radius = mass * speed / (charge * field);
          return {
            content: `质量2.0×10⁻⁶ kg、电荷量+1.0 μC的粒子以 ${speed} m/s 垂直射入 ${number(field, 2)} T 匀强磁场，忽略重力。求圆周运动半径。`,
            steps: [
              "速度与磁场垂直，洛伦兹力提供向心力。",
              "qvB=mv²/R，得到 R=mv/(qB)。",
              `R=2.0×10⁻⁶×${speed}/(1.0×10⁻⁶×${number(field, 2)})=${number(radius)} m。`
            ],
            answer: `${number(radius)} m。`
          };
        }
        if (role === "near") {
          const mass = 3e-6;
          const charge = 2e-6;
          const field = 0.5 + 0.05 * r;
          const period = 2 * Math.PI * mass / (charge * field);
          return {
            content: `质量3.0×10⁻⁶ kg、电荷量绝对值2.0 μC的粒子垂直进入 ${number(field, 2)} T 匀强磁场。求回旋周期，取π=3.14。`,
            steps: [
              "带电粒子在匀强磁场中做匀速圆周运动，周期 T=2πm/(|q|B)。",
              `T=2×3.14×3.0×10⁻⁶/(2.0×10⁻⁶×${number(field, 2)})。`,
              `T=${number(period)} s，周期与速率无关。`
            ],
            answer: `${number(period)} s。`
          };
        }
        if (role === "far") {
          const electric = 1000 + 100 * r;
          const magnetic = 0.2 + 0.02 * r;
          const speed = electric / magnetic;
          return {
            content: `速度选择器中相互垂直的电场强度为 ${electric} N/C、磁感应强度为 ${number(magnetic, 2)} T。带电粒子不偏转通过，求粒子速度大小。`,
            steps: [
              "不偏转时电场力与磁场力大小相等、方向相反。",
              "|q|E=|q|vB，约去电荷量。",
              `v=E/B=${electric}/${number(magnetic, 2)}=${number(speed)} m/s。`
            ],
            answer: `${number(speed)} m/s。`
          };
        }
        return {
          content: `带电粒子以 ${100 + 20 * r} m/s 的速率垂直进入匀强磁场且仅受洛伦兹力。有人认为磁场力持续做功，所以粒子速率会越来越大。判断并说明理由。`,
          steps: [
            "洛伦兹力始终与粒子瞬时速度垂直。",
            "垂直于位移方向的力不做功。",
            "磁场力只改变速度方向，不改变动能和速率。"
          ],
          answer: "说法错误；洛伦兹力不做功，只改变速度方向，粒子速率不变。"
        };
      }
    },
    {
      id: "induction",
      title: "电磁感应",
      topic: "电磁感应",
      chapter: "电磁感应综合",
      examPoints: ["法拉第电磁感应定律", "动生电动势", "楞次定律"],
      misconceptionTags: ["磁通量不为零就一定有电流", "楞次定律方向判断错误"],
      build(round, role) {
        const r = round + 1;
        if (role === "core") {
          const field = 0.4 + 0.05 * r;
          const length = 0.5 + 0.05 * r;
          const speed = 4 + r;
          const emf = field * length * speed;
          return {
            content: `长 ${number(length, 2)} m 的导体棒以 ${speed} m/s 垂直切割 ${number(field, 2)} T 匀强磁场，棒、速度和磁场两两垂直。求动生电动势。`,
            steps: [
              "在给定两两垂直条件下使用 E=BLv。",
              `E=${number(field, 2)}×${number(length, 2)}×${speed}。`,
              `E=${number(emf)} V。`
            ],
            answer: `${number(emf)} V。`
          };
        }
        if (role === "near") {
          const turns = 100 + 20 * r;
          const deltaFlux = (2 + 0.5 * r) * 1e-3;
          const time = 0.1 + 0.02 * r;
          const emf = turns * deltaFlux / time;
          return {
            content: `匝数为 ${turns} 的线圈中，每匝磁通量在 ${number(time, 2)} s 内均匀变化 ${number(deltaFlux * 1000, 1)}×10⁻³ Wb。求感应电动势大小。`,
            steps: [
              "根据法拉第电磁感应定律 E=N|ΔΦ|/Δt。",
              `E=${turns}×${number(deltaFlux, 5)}/${number(time, 2)}。`,
              `E=${number(emf)} V。`
            ],
            answer: `${number(emf)} V。`
          };
        }
        if (role === "far") {
          const field = 0.5;
          const length = 0.4 + 0.04 * r;
          const speed = 5 + r;
          const resistance = 2 + 0.2 * r;
          const emf = field * length * speed;
          const current = emf / resistance;
          const power = current ** 2 * resistance;
          return {
            content: `导体棒长 ${number(length, 2)} m，以 ${speed} m/s 垂直切割0.50 T匀强磁场，闭合回路总电阻为 ${number(resistance, 1)} Ω。忽略其他损耗，求感应电动势、电流和电热功率。`,
            steps: [
              `E=BLv=0.50×${number(length, 2)}×${speed}=${number(emf)} V。`,
              `I=E/R=${number(emf)}/${number(resistance, 1)}=${number(current)} A。`,
              `P=I²R=${number(current)}²×${number(resistance, 1)}=${number(power)} W。`
            ],
            answer: `E=${number(emf)} V，I=${number(current)} A，P=${number(power)} W。`
          };
        }
        return {
          content: `面积为 ${number(0.01 + 0.002 * r, 3)} m² 的闭合线圈静止放在恒定匀强磁场中，线圈平面与磁场方向夹角不变。有人认为线圈中有磁通量，所以一定产生持续感应电流。判断并说明理由。`,
          steps: [
            "产生感应电动势的条件是穿过闭合回路的磁通量发生变化。",
            "本题磁场、面积和夹角都不变，磁通量虽可能不为零，但不随时间变化。",
            "因此感应电动势为零，不产生持续感应电流。"
          ],
          answer: "说法错误；磁通量不变时感应电动势为零，线圈中没有持续感应电流。"
        };
      }
    }
  ];

  function generateGrade(grade, models) {
    const questions = [];
    models.forEach((model, modelIndex) => {
      for (let round = 0; round < ROUNDS_PER_MODEL; round += 1) {
        const familyNumber = modelIndex * ROUNDS_PER_MODEL + round + 1;
        VARIANTS.forEach((variant) => {
          questions.push(buildQuestion(
            grade,
            familyNumber,
            model,
            variant,
            model.build(round, variant.key)
          ));
        });
      }
    });
    return questions;
  }

  const questions = [
    ...generateGrade("九年级", grade9Models),
    ...generateGrade("高三", high3Models)
  ];
  const normalizedContents = new Set();
  const ids = new Set();
  const invalid = [];
  questions.forEach((question) => {
    const normalized = question.content.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
    if (ids.has(question.id)) invalid.push(`${question.id}:重复编号`);
    if (normalizedContents.has(normalized)) invalid.push(`${question.id}:重复题干`);
    if (!question.solution.includes("【分步解析】")
      || !question.solution.includes("【最终结论】")
      || !question.solution.includes("【结果复核】")
      || !question.answer
      || !question.examPoints.length) {
      invalid.push(`${question.id}:题干或解析结构不完整`);
    }
    ids.add(question.id);
    normalizedContents.add(normalized);
  });
  if (questions.length !== 400 || invalid.length) {
    throw new Error(`专项迁移题库生成失败：${invalid[0] || `题量${questions.length}`}`);
  }

  const normalizedQuestions = questions.map((question) => ({
    ...question,
    knowledgePointId: question.knowledgePointId || `kp:${String(question.topic || question.id).normalize("NFKC").replace(/中的?/g, "").replace(/[^\p{L}\p{N}]+/gu, "-")}`,
    cognitiveDemand: question.cognitiveDemand || (question.variantRole === "counter" ? "反例辨析" : question.variantRole === "far" ? "远迁移" : "专项应用"),
    representationType: question.representationType || (/实验|探究/.test(String(question.questionType || "")) ? "实验" : "文字/公式"),
    independenceGroupId: question.independenceGroupId || question.modelFamilyId || question.modelDefinitionId,
    assessmentPurpose: question.assessmentPurpose || "targeted"
  }));

  const TARGET_GRADES = Object.freeze([
    Object.freeze({ grade: "八年级", gradeCode: "g8" }),
    Object.freeze({ grade: "九年级", gradeCode: "g9" }),
    Object.freeze({ grade: "高一", gradeCode: "h1" }),
    Object.freeze({ grade: "高二", gradeCode: "h2" }),
    Object.freeze({ grade: "高三", gradeCode: "h3" })
  ]);
  const REQUIRED_TRANSFER_ROLES = Object.freeze(["core", "near", "far", "counter"]);

  function coverageReport() {
    const byGrade = Object.fromEntries(TARGET_GRADES.map(({ grade, gradeCode }) => {
      const gradeQuestions = normalizedQuestions.filter((question) => question.grade === grade);
      const families = new Map();
      gradeQuestions.forEach((question) => {
        const familyId = String(question.modelFamilyId || "").trim();
        if (!familyId) return;
        const family = families.get(familyId) || {
          modelFamilyId: familyId,
          knowledgePointIds: new Set(),
          roles: new Set(),
          questionIds: []
        };
        if (question.knowledgePointId) family.knowledgePointIds.add(question.knowledgePointId);
        if (question.variantRole) family.roles.add(question.variantRole);
        family.questionIds.push(question.id);
        families.set(familyId, family);
      });
      const incompleteFamilies = [...families.values()].filter((family) => {
        return REQUIRED_TRANSFER_ROLES.some((role) => !family.roles.has(role));
      });
      const knowledgePointIds = [...new Set(gradeQuestions.map((question) => question.knowledgePointId).filter(Boolean))];
      const gaps = [];
      if (!gradeQuestions.length) {
        gaps.push({
          type: "no-reviewed-family",
          detail: "当前没有通过内容审核的 core / near / far / counter 真实题族；UI 不得声称结构完整。"
        });
      }
      incompleteFamilies.forEach((family) => gaps.push({
        type: "incomplete-transfer-family",
        modelFamilyId: family.modelFamilyId,
        missingRoles: REQUIRED_TRANSFER_ROLES.filter((role) => !family.roles.has(role))
      }));
      return [grade, {
        grade,
        gradeCode,
        publishedQuestionCount: gradeQuestions.length,
        publishedModelFamilyCount: families.size,
        knowledgePointCount: knowledgePointIds.length,
        knowledgePointIds,
        incompleteFamilyCount: incompleteFamilies.length,
        structureStatus: gradeQuestions.length && !incompleteFamilies.length
          ? "complete-reviewed-structure"
          : "missing-reviewed-content",
        gaps
      }];
    }));
    return {
      generatedAt: new Date().toISOString(),
      requiredTransferRoles: [...REQUIRED_TRANSFER_ROLES],
      byGrade,
      boundary: "覆盖报告只统计已经发布并通过现有内容校验的题目；八年级、高一、高二缺口保持为未发布，不用自动改数字题冒充独立掌握证据。"
    };
  }

  window.PHYSICS_TARGETED_PRACTICE_BANK = Object.freeze({
    version: VERSION,
    contentVersion: CONTENT_VERSION,
    questions: Object.freeze(normalizedQuestions.map((question) => Object.freeze(question))),
    targetGrades: TARGET_GRADES,
    requiredTransferRoles: REQUIRED_TRANSFER_ROLES,
    coverageReport,
    manifest: Object.freeze({
      generatedCount: questions.length,
      byGrade: Object.freeze({ "九年级": 200, "高三": 200 }),
      modelFamilyCount: grade9Models.length * ROUNDS_PER_MODEL + high3Models.length * ROUNDS_PER_MODEL,
      variantsPerFamily: VARIANTS.length,
      duplicateCount: questions.length - normalizedContents.size,
      invalidCount: invalid.length,
      provenance: "应用内原创·长沙模拟考结构适配专项；非长沙学校模拟卷原题"
    })
  });
})();
