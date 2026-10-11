(() => {
  "use strict";

  // Teaching pilots only. These records are not part of the published question
  // bank or mastery evidence until a teacher imports and reviews them.
  const shared = {
    stage: "高中",
    grade: "高一",
    topic: "匀变速直线运动",
    knowledgePointId: "hs-uniformly-accelerated-motion",
    difficulty: "基础",
    modelDefinitionId: "model:uniform-acceleration",
    independenceGroupId: "model:uniform-acceleration",
    source: "应用内原创教学草稿",
    sourceLicense: "应用内原创",
    contentReviewStatus: "待教师审核",
    evidenceTier: "manual-review",
    assessmentPurpose: "teacher-content-draft",
    diagnosticEligible: false,
    autoScorable: false,
    fullTextIncluded: true,
    offlineModel: "uniform"
  };
  const questions = [
    {
      ...shared,
      id: "draft:v401:motion:concept",
      title: "负加速度不等于立即反向",
      questionType: "单项选择题",
      representationType: "概念辨析",
      content: "一辆小车沿选定的正方向以 6 m/s 行驶，此后在 4 s 内保持加速度 -2 m/s²。经过 2 s 时，下列说法正确的是哪一项？A. 速度为 2 m/s，仍沿正方向运动；B. 速度为 2 m/s，已经沿反方向运动；C. 加速度的大小逐渐减小；D. 因加速度为负，位移必为负。",
      answer: "A。2 s 时速度为 +2 m/s，仍沿正方向运动。",
      solution: "条件：沿同一直线且加速度在这段时间内恒定，选初速度方向为正。先用 v=v₀+at=6+(-2)×2=+2 m/s；正号表明仍沿正方向。加速度始终为 -2 m/s²，大小不变。位移 Δx=v₀t+at²/2=6×2-2×2²/2=+8 m，因此 B、C、D 均不成立。约 3 s 时速度才降为零，负加速度不等于立即反向。",
      visualSpec: { model: "uniform", params: { x0: 0, v0: 6, a: -2, duration: 4, t: 2 } },
      expectedModelOutput: { position: 8, velocity: 2 }
    },
    {
      ...shared,
      id: "draft:v401:motion:graph",
      title: "由速度—时间图像求加速度和位移",
      questionType: "填空题",
      representationType: "运动图像",
      content: "某小车的 v-t 图像是一段直线，经过 (0 s, 2 m/s) 和 (4 s, 10 m/s) 两点，所取方向为正方向。请填出 0～4 s 的加速度及位移。",
      answer: "加速度 2 m/s²；位移 24 m，沿正方向。",
      solution: "条件：v-t 图像在 0～4 s 内为直线，因此加速度恒定。斜率 a=Δv/Δt=(10-2) m/s ÷4 s=2 m/s²。图像与时间轴之间的有向面积为位移，Δx=(2+10) m/s ×4 s ÷2=24 m；也可由 2×4+2×4²/2=24 m 交叉核对。单位分别为 m/s² 和 m。",
      visualSpec: { model: "uniform", params: { x0: 0, v0: 2, a: 2, duration: 4, t: 4 } },
      expectedModelOutput: { position: 24, velocity: 10 }
    },
    {
      ...shared,
      id: "draft:v401:motion:experiment",
      title: "用等时间间隔测得的速度判断运动",
      questionType: "实验探究题",
      representationType: "实验数据",
      content: "同一小车沿直线运动，理想化测量记录为：t=0、1、2、3 s 时，v 分别为 1、3、5、7 m/s。若可近似认为 0～4 s 加速度恒定，估算加速度及 t=4 s 的速度；说明这一预测的前提。",
      answer: "估算加速度 2 m/s²；t=4 s 的预测速度为 9 m/s。",
      solution: "条件：相邻读数间隔均为 1 s，速度每次增加 2 m/s；只有在 3～4 s 仍可近似看作恒定加速度时才能外推。各段 a=Δv/Δt=2 m/s ÷1 s=2 m/s²，因此 v(4 s)=v(3 s)+a×1 s=7+2=9 m/s。数据是理想化读数，不能由本表虚构测量不确定度；真实实验应检查误差和时间间隔。",
      visualSpec: { model: "uniform", params: { x0: 0, v0: 1, a: 2, duration: 4, t: 4 } },
      expectedModelOutput: { position: 20, velocity: 9 }
    },
    {
      ...shared,
      id: "draft:v401:motion:context",
      title: "把匀变速模型迁移到仓库机器人",
      questionType: "简答题",
      representationType: "跨情境解释",
      content: "仓库机器人沿直轨道以 1 m/s 起步，控制器使其在接下来的 4 s 内保持 0.5 m/s² 的正向加速度。求末速度和位移，并说明如果加速度随时间变化，原解法的哪一步需要修改。",
      answer: "末速度 3 m/s；位移 8 m。若加速度变化，不能直接把固定 a 代入匀变速公式。",
      solution: "条件：同一直线、正方向与运动方向一致，并且 0～4 s 内加速度恒为 0.5 m/s²。末速度 v=v₀+at=1+0.5×4=3 m/s；位移 Δx=v₀t+at²/2=1×4+0.5×4²/2=8 m。单位分别是 m/s 和 m。若加速度随时间变化，v=v₀+at 和 Δx=v₀t+at²/2 的恒定 a 前提失效，应根据变化的加速度分段或利用图像/积分求解。",
      visualSpec: { model: "uniform", params: { x0: 0, v0: 1, a: 0.5, duration: 4, t: 4 } },
      expectedModelOutput: { position: 8, velocity: 3 }
    }
  ];
  globalThis.PhysicsStudioMotionDrafts = Object.freeze({ version: "v4.0.1-pilot", questions: Object.freeze(questions) });
})();
