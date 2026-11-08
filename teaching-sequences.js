(() => {
  "use strict";

  const ids = Object.freeze(['diagnose', 'explain', 'predict', 'simulate', 'practice',
    'near-transfer', 'far-transfer', 'delayed-retest']);
  const makeStages = (activities) => Object.freeze(ids.map((id) => Object.freeze({
    id, ...activities[id]
  })));
  // These are original teaching notes, not copied textbook passages. A course
  // note supports study but never becomes scored evidence by being displayed.
  const courseUnits = Object.freeze({
    averageSpeed: Object.freeze({
      phenomenon: '同一路程的两段骑行用时不同；全程快慢不能只看某一段的速度。',
      prerequisite: '先核对每段路程与对应时间，统一 m、s；停顿若属于全程也计入总时间。',
      concept: '在初中路程语境下，全程平均速度＝总路程÷总时间；不能直接取两段速度的算术平均。',
      modelConditions: '计算区间必须与路程、时间对应；往返时总路程与净位移不同，不能混用。',
      representations: '用路程—时间表列出各段，再比较全程总路程/总时间；s-t 图像的割线斜率对应区间平均速度。',
      workedExample: '120 m 用 30 s，随后 180 m 用 40 s：全程 300 m、70 s，平均速度 300/70≈4.29 m/s。',
      independentPractice: '先独立算另一组分段数据，再解释为什么两段速度的直接平均通常不等于全程平均速度。',
      explanationCheck: '若两段速度相同但用时不同，能否用直接平均？若两段路程相同而速度不同呢？写出总路程和总时间。',
      teacherGuide: Object.freeze({ objective: '区分分段速度、总路程与总时间。',
        likelyError: '把 120/30 与 180/40 直接取算术平均。',
        followupQuestion: '让学生比较等时间与等路程两种分段，哪种条件下可直接平均？',
        scoringFocus: '检查对应区间、单位换算和全程时间；开放解释需人工复核。' })
    }),
    ohm: Object.freeze({
      phenomenon: '同一个定值电阻接在不同电压下，电流随电压改变；电阻不因此自动按比例改变。',
      prerequisite: '区分电流 A、电压 V 和电阻 Ω；先画出研究的是哪个用电器及其两端。',
      concept: '温度近似不变且为欧姆导体时 I=U/R；R 是该状态下导体的性质，不是 U 单独决定的量。',
      modelConditions: '理想导线、稳恒直流和温度近似不变；灯丝发热明显时不能把 R 当作全程常数。',
      representations: '记录同一定值电阻的 U-I 表：电压成倍变化，电流相应变化；I-U 图像斜率是 1/R。',
      workedExample: '两个 3 Ω 电阻串联接 6 V：总电阻 6 Ω，电流 1 A；电流不在第一个电阻处被消耗。',
      independentPractice: '先独立计算 3 V 加在 6 Ω 定值电阻上的电流，再比较串联 3 Ω 与 6 Ω 两电阻的分压。',
      explanationCheck: '为什么串联两只阻值不同的电阻电流相同，而两端电压不一定相同？写明温度条件。',
      teacherGuide: Object.freeze({ objective: '说清研究对象和欧姆定律的温度条件。',
        likelyError: '把 R=U/I 误读为“U 增大必使 R 增大”，或误认串联两端电压相等。',
        followupQuestion: '让学生预测 3 Ω 与 6 Ω 串联时两端电压，再检查电流是否相同。',
        scoringFocus: '区分规律适用条件、串联电流和分压；实验变量控制过程需人工复核。' })
    }),
    newton: Object.freeze({
      phenomenon: '同一小车受不同水平合力时，速度变化的快慢不同；撤去拉力后不必立即停止。',
      prerequisite: '先选研究对象和正方向，画出重力、支持力、拉力及摩擦力。',
      concept: '在惯性参考系中，恒质量物体的加速度由所受合外力决定，ΣF=ma；加速度方向与合外力一致。',
      modelConditions: '把小车近似为质点、质量不变；水平竖直分解需对应同一研究对象，已滑动时摩擦方向与相对运动相反。',
      representations: '受力图显示水平合力；同一质量下 a-F合 图像斜率为 1/m。图像只表示给定模型，不是实测证据。',
      workedExample: '质量 2 kg，小车受 10 N 水平拉力和反向 2 N 滑动摩擦力，合力 8 N，所以 a=8/2=4 m/s²，沿拉力方向。',
      independentPractice: '先独立求同条件换成斜面后的沿斜面加速度，说明为何不能直接沿用水平面的合力。',
      explanationCheck: '若光滑水平面上拉力突然消失，之后速度和加速度分别怎样？若仍有摩擦，结论如何变化？',
      teacherGuide: Object.freeze({ objective: '建立对象—受力—合力—加速度链条。',
        likelyError: '把速度方向等同于加速度方向，或认为保持运动一定需要持续拉力。',
        followupQuestion: '先让学生预测撤力后的运动，再分别讨论无摩擦与有摩擦两种情况。',
        scoringFocus: '分开评价对象选择、受力图、坐标、合力与数值单位；受力图需教师复核。' })
    })
  });
  const remediations = Object.freeze({
    'zero-velocity-zero-acceleration': Object.freeze({
      prediction: '竖直上抛小球到最高点时，速度瞬时为零；先预测此刻加速度。',
      counterevidence: '忽略阻力时仍受重力，合力 mg 不为零，向下加速度仍为 g。',
      explanation: '速度描述运动状态，加速度描述速度变化；同一瞬间速度为零不要求加速度为零。',
      independentRetest: '改用弹簧振子的端点或刹车至停瞬间，先判断受力与加速度，再解释条件差异。',
      requiresTeacherReview: true
    }),
    'force-maintains-motion': Object.freeze({
      prediction: '在近似无摩擦的水平面上推小车后松手，先预测小车会怎样运动。',
      counterevidence: '撤去推力且合力近零时，小车近似匀速直线运动，而非立即停止。',
      explanation: '合力改变速度，不是维持速度的必要条件；有摩擦时减速由摩擦合力解释。',
      independentRetest: '换成空气轨道或冰面情境，分别判断撤力后有、无阻力时的运动。',
      requiresTeacherReview: true
    }),
    'series-voltage-always-equal': Object.freeze({
      prediction: '将 3 Ω 与 6 Ω 电阻串联接入 9 V 理想电源，先预测两端电压是否相同。',
      counterevidence: '串联电流为 1 A；由 U=IR，两端分别为 3 V 和 6 V，而电流相同。',
      explanation: '串联电路相同的是各处电流；分压与各电阻阻值有关，不能把并联等压规律套用。',
      independentRetest: '换成 2 Ω 与 4 Ω 串联，独立算分压，并说明若并联会改变哪条规律。',
      requiresTeacherReview: true
    }),
    'resistance-created-by-voltage': Object.freeze({
      prediction: '同一金属定值电阻温度近似不变，电压加倍；预测电阻与电流如何变化。',
      counterevidence: '若原为 3 V/1 A，改为 6 V/2 A，两个状态的 U/I 都是 3 Ω。',
      explanation: '在指定状态和温度条件下，R=U/I 是电阻定义比值；不能说电压单独产生电阻。',
      independentRetest: '换成灯丝发热明显的情境，判断为何这时不应强行认为电阻恒定。',
      requiresTeacherReview: true
    }),
    'variable-control-ohm': Object.freeze({
      prediction: '探究电流与电阻的关系时，更换定值电阻后先预测应保持哪个量不变。',
      counterevidence: '若被测电阻两端电压也变了，电流变化同时受 U、R 影响，无法单独判断 I 与 R 的关系。',
      explanation: '控制变量应保持被测电阻两端电压近似恒定；电源总电压不变不等于被测电阻两端电压不变。',
      independentRetest: '设计两组 R、U、I 数据，指出哪组能用于比较 I 与 R，并说明选择理由。',
      requiresTeacherReview: true
    })
  });
  const sequences = Object.freeze({
    'hs-uniformly-accelerated-motion': Object.freeze({
      knowledgePointId: 'hs-uniformly-accelerated-motion', grade: '高一',
      title: '匀变速直线运动：符号、图像与恒加速度条件',
      curriculumSectionIds: Object.freeze(['pep-h-2019-required-1-c02-s02',
        'pep-h-2019-required-1-c02-s03']),
      simulation: Object.freeze({ model: 'uniform', params: Object.freeze({ x0: 0, v0: 6,
        a: -2, duration: 4, t: 2 }), expectedPosition: 8, expectedVelocity: 2,
        claim: '理想化恒加速度模型演示，不是真实测量' }),
      stages: makeStages({
        diagnose: { instruction: '独立判断负加速度是否意味着立即反向，并写出所选正方向。',
          evidenceRequirement: '记录原答案、理由、置信度与作答时间；默认不提供提示。',
          questionIds: ['draft:v401:motion:concept'], requiresTeacherReview: true },
        explain: { instruction: '由 v=v₀+at 推出 t=2 s 时 v=+2 m/s，解释速度和加速度符号的区别。',
          evidenceRequirement: '学生用自己的话说出公式适用条件；讲解不计独立正确。' },
        predict: { instruction: '先预测 t=2 s 的位置、速度及何时速度变为零。',
          evidenceRequirement: '在运行模型前保存预测值和依据。' },
        simulate: { instruction: '调节初速度和加速度，核对 v-t 斜率、面积与位移；只在恒加速度模型内解释。',
          evidenceRequirement: '记录参数、模型输出与预测差异；仿真观察不代替实际实验。' },
        practice: { instruction: '独立由直线 v-t 图像求斜率和有向面积。',
          evidenceRequirement: '记录加速度 2 m/s² 与位移 +24 m 两小问及单位。',
          questionIds: ['draft:v401:motion:graph'], requiresTeacherReview: true },
        'near-transfer': { instruction: '由等时间间隔速度数据估算恒定加速度并说明外推前提。',
          evidenceRequirement: '核对 2 m/s²、9 m/s 及恒加速度假设；未经审核不计正式掌握。',
          questionIds: ['draft:v401:motion:experiment'], requiresTeacherReview: true },
        'far-transfer': { instruction: '迁移到仓库机器人，并指出加速度变化时不能沿用哪一步。',
          evidenceRequirement: '核对末速度 3 m/s、位移 8 m 和适用条件；教师审核开放解释。',
          questionIds: ['draft:v401:motion:context'], requiresTeacherReview: true },
        'delayed-retest': { instruction: '至少隔一天选另一独立模型/情境，先独立作答再比较。',
          evidenceRequirement: '仅已审核、不同题目且跨日期的可比证据进入复测判断。',
          minimumDelayDays: 1, requiresTeacherReview: true }
      })
    }),
    'kp:平均速度': Object.freeze({
      knowledgePointId: 'kp:平均速度', grade: '八年级', title: '平均速度：总路程与总时间',
      courseUnit: courseUnits.averageSpeed,
      curriculumSectionIds: Object.freeze(['pep-g8-1-c01-s04']),
      simulation: Object.freeze({ model: 'uniform', params: Object.freeze({ x0: 0, v0: 2,
        a: 0, duration: 5, t: 5 }), expectedPosition: 10,
        claim: '理想化模型演示，不是真实测量' }),
      stages: makeStages({
        diagnose: { instruction: '辨析“全程平均速度等于两段速度的算术平均”是否总成立。',
          evidenceRequirement: '记录独立答案、理由与置信度；不以猜对作掌握证据。' },
        explain: { instruction: '明确全程平均速度＝总路程÷总时间；区分平均速度与平均速率的语境。',
          evidenceRequirement: '学生复述总路程和总时间的边界。' },
        predict: { instruction: '先预测 5 s 内匀速 2 m/s 的路程。',
          evidenceRequirement: '保存预测 10 m 及计算依据。' },
        simulate: { instruction: '调整速度和时长，观察理想化位移；非匀速两段仍须分段累加路程。',
          evidenceRequirement: '记录模型参数与单位，不当作实测数据。' },
        practice: { instruction: '求 120 m/30 s 与 180 m/40 s 两段的全程平均速度。',
          evidenceRequirement: '核对 300 m÷70 s≈4.286 m/s，保留原始步骤。',
          questionIds: ['cs-original-1500-g8-0002'] },
        'near-transfer': { instruction: '改变两段路程和时间，仍先合并路程与时间。',
          evidenceRequirement: '同模板数值变式只算练习，不算独立模型证据。',
          questionIds: ['cs-original-1500-g8-0017'] },
        'far-transfer': { instruction: '往返同一路段时区分全程路程与净位移。',
          evidenceRequirement: '需教师选择已审核的跨情境题，未选定前不标记迁移完成。',
          requiresTeacherReview: true },
        'delayed-retest': { instruction: '跨日期选不同模型组题，复核总路程、总时间和单位。',
          evidenceRequirement: '即时重复同模板不算延迟保持。', minimumDelayDays: 1,
          requiresTeacherReview: true }
      })
    }),
    'kp:欧姆定律': Object.freeze({
      knowledgePointId: 'kp:欧姆定律', grade: '九年级', title: '欧姆定律：条件、变量与单位',
      courseUnit: courseUnits.ohm,
      curriculumSectionIds: Object.freeze(['pep-g9-c05-s02']),
      simulation: Object.freeze({ model: 'circuit', params: Object.freeze({ voltage: 6,
        resistances: Object.freeze([3, 3]), mode: 'series' }), expectedCurrent: 1,
        conditions: Object.freeze(['导体温度近似不变', '理想直流电源及导线']),
        claim: '理想化串联电路模型演示，不是真实电学实验' }),
      stages: makeStages({
        diagnose: { instruction: '判断同一导体在温度近似不变时，电压与电流如何变化。',
          evidenceRequirement: '先记录学生所依据的条件与置信度。' },
        explain: { instruction: '对定值电阻说明 I=U/R 的量、单位和适用条件；不能说电流被电阻消耗。',
          evidenceRequirement: '学生说明研究对象及导体温度条件。' },
        predict: { instruction: '预测 6 V 电源与两个 3 Ω 电阻串联时的总电流。',
          evidenceRequirement: '先保存预测 1 A 和总电阻 6 Ω。' },
        simulate: { instruction: '改变电压、电阻和串并联方式，核查总电流；与真实测量区别说明。',
          evidenceRequirement: '记录输入和模型输出，不能把仿真当作实测。' },
        practice: { instruction: '定值电阻两端 3 V、阻值 6 Ω，求电流。',
          evidenceRequirement: '核对 I=3 V÷6 Ω=0.5 A。', questionIds: ['cs-original-1500-g9-0004'] },
        'near-transfer': { instruction: '同模型改变电压与阻值，并检查商和单位。',
          evidenceRequirement: '同模板数值变式只算练习。', questionIds: ['cs-original-1500-g9-0019'] },
        'far-transfer': { instruction: '从单电阻迁移到两个电阻串联，先求总阻值。',
          evidenceRequirement: '需教师选择已审核的不同模型题；未选定不计迁移。',
          requiresTeacherReview: true },
        'delayed-retest': { instruction: '跨日期复测不同电路条件与独立模型题。',
          evidenceRequirement: '记录新的原始 evidence ID；人工复核前不算正式正确。',
          minimumDelayDays: 1, requiresTeacherReview: true }
      })
    }),
    'kp:牛顿第二定律': Object.freeze({
      knowledgePointId: 'kp:牛顿第二定律', grade: '高一', title: '牛顿第二定律：受力、合力与加速度',
      curriculumSectionIds: Object.freeze(['pep-h-2019-required-1-c04-s03']),
      courseUnit: courseUnits.newton,
      simulation: Object.freeze({ model: 'newton', params: Object.freeze({ mass: 2,
        appliedForce: 10, opposingForce: 2, x0: 0, v0: 0, t: 1, duration: 3 }),
        expectedAcceleration: 4, claim: '受力与匀加速运动的理想模型，不是真实测量' }),
      stages: makeStages({
        diagnose: { instruction: '先画小车的受力图，判断撤去拉力后运动是否必立即停止。',
          evidenceRequirement: '记录原判断、理由和置信度；图示与解释待教师审核。', requiresTeacherReview: true },
        explain: { instruction: '以小车为研究对象，说明水平合力而非单个拉力决定加速度。',
          evidenceRequirement: '核对惯性参考系、质量不变和同一研究对象等条件。' },
        predict: { instruction: '质量 2 kg、拉力 10 N、摩擦力 2 N 时先预测加速度。',
          evidenceRequirement: '运行模型前记录合力 8 N、预测加速度 4 m/s² 与方向。' },
        simulate: { instruction: '改变拉力、摩擦力或质量，比较受力图、合力和 a-F 图像。',
          evidenceRequirement: '模型只作概念验证；未采集真实实验数据时不能称实测。' },
        practice: { instruction: '独立完成水平面受力、列式和加速度计算。',
          evidenceRequirement: '核对研究对象、ΣF=ma 和单位，不只记录末答案。',
          questionIds: ['cs-original-1500-h1-0005'] },
        'near-transfer': { instruction: '改变质量与摩擦力，仍先列同一对象的合力。',
          evidenceRequirement: '同模板变更数字只算练习，不算独立模型证据。',
          questionIds: ['cs-original-1500-h1-0020'] },
        'far-transfer': { instruction: '迁移到斜面，改用沿斜面与垂直斜面的受力分解。',
          evidenceRequirement: '跨模型题须教师确认适用条件，不能用同题即时重复冒充迁移。',
          questionIds: ['cs-original-1500-h1-0006'], requiresTeacherReview: true },
        'delayed-retest': { instruction: '至少隔一天选择新的受力情境，独立建模后再复测。',
          evidenceRequirement: '不同题目与模型、跨日期且已评分的证据才可比较。',
          minimumDelayDays: 1, requiresTeacherReview: true }
      })
    })
  });
  function forQuestion(question = {}) {
    const model = String(question.modelDefinitionId || '');
    const sectionIds = Array.isArray(question.curriculumSectionIds) ? question.curriculumSectionIds : [];
    if (model === 'g8-original-template-001' || sectionIds.includes('pep-g8-1-c01-s04'))
      return sequences['kp:平均速度'];
    if (model === 'g9-original-template-003' || question.knowledgePointId === 'kp:欧姆定律')
      return sequences['kp:欧姆定律'];
    if (/^h1-original-template-00[4-6]$/.test(model)
      || question.knowledgePointId === 'kp:牛顿第二定律')
      return sequences['kp:牛顿第二定律'];
    if (/^h1-original-template-00[0-3]$/.test(model)
      || question.knowledgePointId === 'kp:匀变速直线运动'
      || question.knowledgePointId === 'hs-uniformly-accelerated-motion')
      return sequences['hs-uniformly-accelerated-motion'];
    return null;
  }
  globalThis.PhysicsStudioTeachingSequences = Object.freeze({ version: 2,
    get: (knowledgePointId) => sequences[String(knowledgePointId || '')] || null,
    forQuestion,
    list: () => Object.values(sequences),
    remediationFor: (code) => remediations[String(code || '')] || null,
    remediations: () => remediations });
})();
