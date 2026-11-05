(() => {
  "use strict";

  const ids = Object.freeze(['diagnose', 'explain', 'predict', 'simulate', 'practice',
    'near-transfer', 'far-transfer', 'delayed-retest']);
  const makeStages = (activities) => Object.freeze(ids.map((id) => Object.freeze({
    id, ...activities[id]
  })));
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
    })
  });
  function forQuestion(question = {}) {
    const model = String(question.modelDefinitionId || '');
    const sectionIds = Array.isArray(question.curriculumSectionIds) ? question.curriculumSectionIds : [];
    if (model === 'g8-original-template-001' || sectionIds.includes('pep-g8-1-c01-s04'))
      return sequences['kp:平均速度'];
    if (model === 'g9-original-template-003' || question.knowledgePointId === 'kp:欧姆定律')
      return sequences['kp:欧姆定律'];
    if (/^h1-original-template-00[0-3]$/.test(model)
      || question.knowledgePointId === 'kp:匀变速直线运动'
      || question.knowledgePointId === 'hs-uniformly-accelerated-motion')
      return sequences['hs-uniformly-accelerated-motion'];
    return null;
  }
  globalThis.PhysicsStudioTeachingSequences = Object.freeze({ version: 1,
    get: (knowledgePointId) => sequences[String(knowledgePointId || '')] || null,
    forQuestion,
    list: () => Object.values(sequences) });
})();
