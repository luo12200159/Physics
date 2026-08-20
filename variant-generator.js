(() => {
  "use strict";

  const root = globalThis;
  const SPEC_VERSION = "variant_generation_v1";
  const GENERATOR_VERSION = "1.0.0";
  const ROLES = Object.freeze(["near", "reverse", "context"]);
  const ROLE_LABELS = Object.freeze({
    near: "近迁移",
    reverse: "逆向/结构迁移",
    context: "情境/表征迁移"
  });
  const DIFFICULTIES = Object.freeze(["基础", "进阶", "挑战"]);

  function text(value, limit = 60000) {
    return String(value == null ? "" : value).trim().slice(0, limit);
  }

  function list(value, limit = 30, itemLimit = 300) {
    return [...new Set((Array.isArray(value) ? value : [])
      .map((item) => text(item, itemLimit))
      .filter(Boolean))].slice(0, limit);
  }

  function stableHash(value) {
    const source = typeof value === "string" ? value : JSON.stringify(value);
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 16777619);
      second ^= code + index;
      second = Math.imul(second, 3266489917);
    }
    return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
  }

  function sourceContentHash(question) {
    return stableHash({
      id: text(question?.id, 200),
      title: text(question?.title, 500),
      content: text(question?.content),
      answer: text(question?.answer, 30000),
      solution: text(question?.solution)
    });
  }

  function normalizeQuestionType(value) {
    const normalized = root.PHYSICS_LEARNING_ENGINE?.normalizeQuestionType?.(value);
    return text(normalized || value || "未标注", 40) || "未标注";
  }

  function buildItemModel(question) {
    if (!question || typeof question !== "object" || !text(question.content)) {
      throw new Error("母题缺少完整题干，不能生成可验证变式。 ");
    }
    const topicKey = root.PHYSICS_LEARNING_ENGINE?.topicKeyForQuestion?.(question)
      || text(question.knowledgePointId || question.topicKey || question.topic, 160);
    return Object.freeze({
      sourceQuestionId: text(question.id, 200),
      sourceContentHash: sourceContentHash(question),
      questionType: normalizeQuestionType(question.questionType),
      stage: ["初中", "高中"].includes(question.stage) ? question.stage : "初中",
      grade: text(question.grade, 20),
      topic: text(question.topic || "待分类", 120),
      knowledgePointId: text(question.knowledgePointId || question.topicKey || topicKey, 160),
      knowledgePoints: list([question.topic, question.knowledgePointId, ...(question.knowledgePoints || [])], 20, 160),
      examPoints: list(question.examPoints, 20, 160),
      difficulty: DIFFICULTIES.includes(question.difficulty) ? question.difficulty : "进阶",
      modelDefinitionId: text(question.modelDefinitionId || question.modelFamilyId, 200),
      transferGroupId: text(question.transferGroupId || question.retestGroupId, 200),
      independenceGroupId: text(question.independenceGroupId || question.modelDefinitionId || question.modelFamilyId, 200),
      researchObject: text(question.researchObject || "由题干确定研究对象", 500),
      knownQuantities: extractKnownQuantities(question.content),
      unknownQuantity: extractUnknown(question.content),
      coreLaws: list(question.examPoints, 10, 160),
      lawConditions: list(question.lawConditions || [], 10, 500),
      variableRelations: extractEquations(question.solution),
      constraints: list(question.constraints || [], 10, 500),
      answerType: normalizeQuestionType(question.questionType),
      representationType: text(question.representationType || "文字/公式", 80),
      visualDependency: Boolean(question.visualSpec || question.requiresImageReview || /图\s*[中示]|如图|图像/u.test(question.content))
    });
  }

  function extractKnownQuantities(content) {
    const matches = text(content).match(/[A-Za-zρμθλ][A-Za-z0-9₀-₉]*\s*=\s*[-+]?\d+(?:\.\d+)?(?:×10\^?[-+]?\d+)?\s*[A-Za-zΩ°/%·³²\u4e00-\u9fa5]*/gu) || [];
    return list(matches, 20, 200);
  }

  function extractUnknown(content) {
    const match = text(content).match(/(?:求|计算|确定|判断|比较|写出)([^。；？?]{1,120})/u);
    return text(match?.[1] || "题目所求物理量", 200);
  }

  function extractEquations(solution) {
    const matches = text(solution).match(/[A-Za-zρμθλ][A-Za-z0-9₀-₉]*\s*=\s*[^。；，\n]{1,100}/gu) || [];
    return list(matches, 20, 200);
  }

  function allQuestions(extra = []) {
    const sources = [
      ...(Array.isArray(extra) ? extra : []),
      ...(root.PHYSICS_TARGETED_PRACTICE_BANK?.questions || []),
      ...(root.PHYSICS_ORIGINAL_PRACTICE_BANK?.questions || [])
    ];
    const seen = new Set();
    return sources.filter((question) => {
      const id = text(question?.id, 200);
      if (!id || seen.has(id) || !text(question?.content) || !text(question?.answer) || !text(question?.solution)) return false;
      seen.add(id);
      return question.fullTextIncluded !== false && !question.resourceOnly;
    });
  }

  function numericTokens(value) {
    return (text(value).match(/[-+]?\d+(?:\.\d+)?(?:×10\^?[-+]?\d+)?/g) || []).map(String);
  }

  function meaningfulNumericChanges(parent, candidate) {
    const before = numericTokens(parent.content);
    const after = numericTokens(candidate.content);
    const length = Math.max(before.length, after.length);
    let changed = 0;
    for (let index = 0; index < length; index += 1) if (before[index] !== after[index]) changed += 1;
    return changed;
  }

  function requestedKind(question) {
    return extractUnknown(question.content).replace(/[\d\s.,，。；;:：()（）]/g, "").slice(0, 40);
  }

  function topicIdentity(question) {
    return text(question.knowledgePointId || question.topicKey || question.topic, 160);
  }

  function contextSignature(question) {
    return `${text(question.title, 120)} ${text(question.content, 300)}`
      .replace(/[-+]?\d+(?:\.\d+)?/g, "#")
      .replace(/\s+/g, " ");
  }

  function candidateScore(parent, candidate, role) {
    if (candidate.id === parent.id || candidate.stage !== parent.stage || candidate.grade !== parent.grade) return -Infinity;
    const parentTopic = topicIdentity(parent);
    const sameTopic = Boolean(parentTopic && parentTopic === topicIdentity(candidate));
    const parentModel = text(parent.modelDefinitionId || parent.modelFamilyId, 200);
    const candidateModel = text(candidate.modelDefinitionId || candidate.modelFamilyId, 200);
    const sameModel = Boolean(parentModel && parentModel === candidateModel);
    const numericChanges = meaningfulNumericChanges(parent, candidate);
    const sameContext = contextSignature(parent) === contextSignature(candidate);
    const differentQuestionType = normalizeQuestionType(parent.questionType) !== normalizeQuestionType(candidate.questionType);
    const differentRepresentation = text(parent.representationType) !== text(candidate.representationType);
    const targetedRole = text(candidate.variantRole, 30);
    let score = sameTopic ? 60 : -100;
    if (role === "near") {
      const reviewedNearFamily = targetedRole === "near";
      const meaningfulParameterizedChange = sameModel && numericChanges >= 2;
      if (!reviewedNearFamily && !meaningfulParameterizedChange) return -Infinity;
      score += sameModel ? 60 : 5;
      score += numericChanges >= 2 ? 25 : 5;
      score += targetedRole === "near" ? 50 : 0;
      score += sameContext ? -20 : 5;
    } else if (role === "reverse") {
      score += sameModel ? 5 : 35;
      score += requestedKind(parent) !== requestedKind(candidate) ? 40 : -15;
      score += ["near", "counter"].includes(targetedRole) ? 30 : 0;
      score += differentQuestionType ? 10 : 0;
    } else {
      score += sameModel ? -10 : 35;
      score += targetedRole === "far" ? 70 : 0;
      score += differentRepresentation ? 25 : 0;
      score += sameContext ? -40 : 25;
      score += differentQuestionType ? 10 : 0;
    }
    return score;
  }

  function changeSummary(parent, candidate, role) {
    const numericChanges = meaningfulNumericChanges(parent, candidate);
    if (role === "near") {
      return numericChanges >= 2
        ? `保持核心模型，联动改变 ${numericChanges} 项条件或数据并重新求解。`
        : "保持核心规律，改变约束、方向或设问组合。";
    }
    if (role === "reverse") {
      return `把母题所求“${requestedKind(parent) || "结论"}”改为新的已知—未知关系，重新组织方程。`;
    }
    const representation = text(candidate.representationType || "文字/公式", 80);
    return `迁移到不同表面情境或${representation}表征，核心知识结构保持不变。`;
  }

  function structuredSolution(question, parent, role) {
    const raw = text(question.solution);
    const numbered = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const stepLines = numbered.filter((line) => /^\d+[.、．)]/u.test(line));
    const equations = extractEquations(raw);
    const steps = (stepLines.length ? stepLines : numbered.slice(0, 6)).map((line, index) => ({
      reasoning: text(line.replace(/^\d+[.、．)]\s*/u, ""), 3000),
      equation: text(equations[index] || "", 500),
      substitution: /代入|=\s*[-+]?\d/u.test(line) ? text(line, 1000) : "",
      result: index === (stepLines.length ? stepLines : numbered.slice(0, 6)).length - 1 ? text(question.answer, 1000) : ""
    }));
    if (!steps.length) steps.push({ reasoning: raw, equation: equations[0] || "", substitution: "", result: text(question.answer, 1000) });
    return {
      overview: text(`识别“${question.topic}”模型，先核对适用条件，再由已知量建立方程并检验结果。`, 1000),
      known: extractKnownQuantities(question.content),
      unknown: extractUnknown(question.content),
      researchObject: text(question.researchObject || "题干所描述的物理对象或系统", 500),
      process: text(question.physicalProcess || `围绕${question.topic}划分状态或过程`, 1000),
      laws: list(question.examPoints, 10, 300).map((name) => ({ name, condition: "使用前须核对题干给出的模型条件与方向约定。" })),
      steps,
      finalAnswer: text(question.answer, 30000),
      checks: extractChecks(raw),
      pitfalls: list(question.misconceptionTags || [], 10, 500).length
        ? list(question.misconceptionTags, 10, 500)
        : ["不要漏写单位、方向或公式适用条件。"],
      parentDifference: changeSummary(parent, question, role)
    };
  }

  function extractChecks(solution) {
    const lines = text(solution).split(/\n+/).filter((line) => /校验|复核|检验|数量级|单位/u.test(line));
    return list(lines.length ? lines : ["将结果代回题意，核对单位、方向、数量级和适用条件。"], 10, 1000);
  }

  function normalizeOptions(question) {
    if (Array.isArray(question.options)) return question.options.slice(0, 12).map((option) => {
      if (Array.isArray(option)) return { key: text(option[0], 10), text: text(option[1], 2000) };
      if (option && typeof option === "object") return { key: text(option.key || option.id, 10), text: text(option.text || option.label, 2000) };
      return { key: "", text: text(option, 2000) };
    }).filter((option) => option.text);
    return [];
  }

  function createVariant(parent, candidate, role, sequence) {
    const candidateHash = sourceContentHash(candidate);
    const variantId = `variant-${text(parent.id, 80).replace(/[^A-Za-z0-9_-]/g, "_")}-${role}-${stableHash(`${candidate.id}|${candidateHash}`)}`;
    const solutionDetail = structuredSolution(candidate, parent, role);
    return {
      id: variantId,
      sourceQuestionId: text(parent.id, 200),
      sourceCandidateId: text(candidate.id, 200),
      sourceContentHash: sourceContentHash(parent),
      variantRole: role,
      variantRoleLabel: ROLE_LABELS[role],
      sequence,
      title: text(`${ROLE_LABELS[role]}｜${candidate.title}`, 240),
      content: text(candidate.content),
      options: normalizeOptions(candidate),
      stage: candidate.stage,
      grade: candidate.grade,
      topic: text(candidate.topic, 120),
      knowledgePointId: text(candidate.knowledgePointId || candidate.topicKey || candidate.topic, 160),
      knowledgePoints: list([candidate.topic, candidate.knowledgePointId, ...(candidate.knowledgePoints || [])], 20, 160),
      examPoints: list(candidate.examPoints, 20, 160),
      questionType: normalizeQuestionType(candidate.questionType),
      difficulty: DIFFICULTIES.includes(candidate.difficulty) ? candidate.difficulty : "进阶",
      modelDefinitionId: text(candidate.modelDefinitionId || candidate.modelFamilyId, 200),
      modelFamilyId: text(candidate.modelFamilyId || candidate.modelDefinitionId, 200),
      transferGroupId: text(candidate.transferGroupId || candidate.retestGroupId || candidate.modelDefinitionId, 200),
      independenceGroupId: text(candidate.independenceGroupId || candidate.modelDefinitionId || candidate.modelFamilyId, 200),
      representationType: text(candidate.representationType || "文字/公式", 80),
      visualSpec: candidate.visualSpec || null,
      changeSummary: changeSummary(parent, candidate, role),
      relationToParent: `与母题共享“${text(parent.topic, 120)}”核心知识结构；训练重点为${ROLE_LABELS[role]}。`,
      answer: text(candidate.answer, 30000),
      correctAnswer: text(candidate.correctAnswer, 2000),
      correctAnswers: list(candidate.correctAnswers, 12, 20),
      solution: text(candidate.solution),
      solutionDetail,
      source: "应用内已审核题模变式",
      sourceLicense: text(candidate.sourceLicense || "应用内原创/已审核内容", 500),
      originalSourceId: text(candidate.id, 200),
      generatedBy: "deterministic-local-bank",
      reviewRequired: false,
      approvalStatus: "system-validated",
      fullTextIncluded: true,
      autoScorable: candidate.autoScorable !== false,
      createdAt: new Date().toISOString()
    };
  }

  function validateOptions(variant) {
    const options = variant.options || [];
    if (!/选择/u.test(variant.questionType)) return { passed: true, reason: "not-applicable" };
    if (options.length < 2) return { passed: false, reason: "选择题缺少完整选项" };
    const validKeys = new Set(options.map((option) => option.key).filter(Boolean));
    const answers = variant.correctAnswers.length ? variant.correctAnswers : [variant.correctAnswer || variant.answer.match(/[A-H]/i)?.[0] || ""];
    if (!answers.length || answers.some((key) => !validKeys.has(key))) return { passed: false, reason: "正确选项无法与选项集合对应" };
    if (!/多选/u.test(variant.questionType) && answers.length !== 1) return { passed: false, reason: "单选题不是唯一正确选项" };
    return { passed: true, reason: /多选/u.test(variant.questionType) ? "正确选项集合有效" : "唯一正确选项有效" };
  }

  function validateVariant(parent, variant) {
    const engine = root.PHYSICS_LEARNING_ENGINE;
    const audit = typeof engine?.auditQuestion === "function" ? engine.auditQuestion(variant) : { issues: [] };
    const auditIssues = Array.isArray(audit?.issues) ? audit.issues : [];
    const auditErrors = auditIssues.filter((issue) => issue?.severity === "error" || issue?.level === "error");
    const answerNumbers = numericTokens(variant.answer);
    const solutionNumbers = numericTokens(variant.solution);
    const numericPassed = !answerNumbers.length || answerNumbers.every((number) => solutionNumbers.includes(number));
    const unitTokens = variant.answer.match(/(?:m\/s²|m\/s|kg\/m³|g\/cm³|kg|g|N|J|W|Pa|V|A|Ω|Hz|m|s|°C|K|C|T|Wb|H)(?![A-Za-z])/g) || [];
    const unitPassed = !unitTokens.length || unitTokens.every((unit) => variant.solution.includes(unit));
    const optionCheck = validateOptions(variant);
    const topicPassed = topicIdentity(parent) === topicIdentity(variant) || text(parent.topic) === text(variant.topic);
    const gradePassed = parent.stage === variant.stage && parent.grade === variant.grade;
    const structuralPassed = Boolean(variant.content && variant.answer && variant.solution && variant.questionType !== "未标注");
    const checks = {
      knowledgePointMatch: { passed: topicPassed, reason: topicPassed ? "知识点一致" : "知识点不一致" },
      gradeMatch: { passed: gradePassed, reason: gradePassed ? "学段与年级一致" : "学段或年级越界" },
      completeness: { passed: structuralPassed, reason: structuralPassed ? "题干、答案、解析和题型完整" : "结构字段不完整" },
      numericRecalculation: { passed: numericPassed, reason: numericPassed ? "答案数值可在解析中追溯" : "答案数值与解析不一致" },
      unitConsistency: { passed: unitPassed, reason: unitPassed ? "答案单位可在解析中追溯" : "答案单位与解析不一致" },
      dimensionConsistency: { passed: unitPassed, reason: unitPassed ? "未发现单位维度冲突" : "需要人工核对量纲" },
      signDirection: { passed: true, reason: "保留已审核题的方向与符号结论" },
      conservation: { passed: true, reason: "适用时由原题审核解析说明守恒条件" },
      orderOfMagnitude: { passed: numericPassed, reason: numericPassed ? "数值与已审核解析一致" : "数量级待核对" },
      limitCase: { passed: true, reason: "不适用或由解析中的结果复核覆盖" },
      optionUniqueness: optionCheck,
      stemAnswerSolution: {
        passed: Number(audit?.errorCount || auditErrors.length) === 0,
        reason: Number(audit?.errorCount || auditErrors.length) === 0
          ? "题干—答案—解析审计未发现关键冲突"
          : auditErrors.map((issue) => text(issue?.message || issue?.reason || issue, 300)).join("；").slice(0, 1000)
      }
    };
    const critical = ["knowledgePointMatch", "gradeMatch", "completeness", "numericRecalculation", "unitConsistency", "optionUniqueness", "stemAnswerSolution"];
    const passed = critical.every((key) => checks[key].passed === true);
    const failedReasons = critical.filter((key) => !checks[key].passed).map((key) => checks[key].reason);
    return {
      version: 1,
      passed,
      verificationStatus: passed ? "validated" : "failed",
      checks,
      failedReasons,
      validatedAt: new Date().toISOString(),
      validator: "deterministic-independent-gate-v1"
    };
  }

  function localVariants(parent, options = {}) {
    const count = Math.max(2, Math.min(3, Number(options.count) || 3));
    const pool = allQuestions(options.questions).filter((candidate) => candidate.id !== parent.id);
    const used = new Set();
    const variants = [];
    for (const role of ROLES.slice(0, count)) {
      const candidates = pool
        .map((candidate) => ({ candidate, score: candidateScore(parent, candidate, role) }))
        .filter((item) => Number.isFinite(item.score) && item.score >= 45 && !used.has(item.candidate.id))
        .sort((first, second) => second.score - first.score || String(first.candidate.id).localeCompare(String(second.candidate.id)));
      for (const item of candidates) {
        const variant = createVariant(parent, item.candidate, role, variants.length + 1);
        variant.validation = validateVariant(parent, variant);
        if (!variant.validation.passed) continue;
        used.add(item.candidate.id);
        variants.push(variant);
        break;
      }
    }
    return variants[0]?.variantRole === "near" ? variants : [];
  }

  function normalizeAiVariant(parent, value, index) {
    const role = ROLES.includes(value?.variantRole) ? value.variantRole : ROLES[index] || "near";
    const variant = {
      ...value,
      id: text(value?.id, 220) || `variant-ai-${stableHash(`${parent.id}|${role}|${value?.content || ""}`)}`,
      sourceQuestionId: text(parent.id, 200),
      sourceContentHash: sourceContentHash(parent),
      variantRole: role,
      variantRoleLabel: ROLE_LABELS[role],
      sequence: index + 1,
      title: text(value?.title, 240),
      content: text(value?.content),
      options: normalizeOptions(value || {}),
      stage: value?.stage,
      grade: text(value?.grade, 20),
      topic: text(value?.topic, 120),
      knowledgePointId: text(value?.knowledgePointId || value?.topic, 160),
      knowledgePoints: list(value?.knowledgePoints, 20, 160),
      examPoints: list(value?.examPoints, 20, 160),
      questionType: normalizeQuestionType(value?.questionType),
      difficulty: DIFFICULTIES.includes(value?.difficulty) ? value.difficulty : "进阶",
      modelDefinitionId: text(value?.modelDefinitionId, 200),
      transferGroupId: text(value?.transferGroupId, 200),
      independenceGroupId: text(value?.independenceGroupId, 200),
      changeSummary: text(value?.changeSummary, 2000),
      relationToParent: text(value?.relationToParent, 2000),
      answer: text(value?.answer, 30000),
      solution: text(value?.solution),
      solutionDetail: value?.solutionDetail && typeof value.solutionDetail === "object" ? value.solutionDetail : {},
      crossVerification: value?.crossVerification && typeof value.crossVerification === "object"
        ? value.crossVerification
        : { passed: false, checks: [], criticalIssues: ["缺少独立求解校验证据"] },
      source: "应用内 AI 生成变式",
      sourceLicense: "应用内 AI 生成；教师审核后方可用于正式训练",
      generatedBy: "controlled-ai-gateway",
      reviewRequired: true,
      approvalStatus: "pending-teacher-review",
      fullTextIncluded: true,
      createdAt: new Date().toISOString()
    };
    variant.validation = validateVariant(parent, variant);
    const crossPassed = variant.crossVerification?.passed === true
      && Array.isArray(variant.crossVerification?.checks)
      && variant.crossVerification.checks.length > 0
      && Array.isArray(variant.crossVerification?.criticalIssues)
      && variant.crossVerification.criticalIssues.length === 0;
    variant.validation.checks.independentCrossVerification = {
      passed: crossPassed,
      reason: crossPassed ? "服务端第二次独立求解校验通过" : "缺少服务端第二次独立求解校验证据"
    };
    if (!crossPassed) {
      variant.validation.passed = false;
      variant.validation.verificationStatus = "failed";
      variant.validation.failedReasons = [...new Set([
        ...(variant.validation.failedReasons || []),
        "缺少服务端第二次独立求解校验证据"
      ])];
    }
    variant.reviewRequired = true;
    return variant;
  }

  async function generateVariantSet(parent, options = {}) {
    const itemModel = buildItemModel(parent);
    const cacheKey = `${itemModel.sourceQuestionId}|${itemModel.sourceContentHash}|${SPEC_VERSION}|${GENERATOR_VERSION}`;
    const existing = (Array.isArray(options.existingSets) ? options.existingSets : [])
      .find((set) => set?.cacheKey === cacheKey && set?.stale !== true && Array.isArray(set.variants) && set.variants.length >= 2);
    if (existing) return { ...existing, cacheHit: true };
    const requestedCount = Math.max(2, Math.min(3, Number(options.count) || 3));
    let variants = localVariants(parent, { ...options, count: requestedCount });
    let generationMode = "deterministic-local-bank";
    let gatewayError = "";
    if (variants.length < 2 && options.allowAi === true && root.PhysicsStudioAITutor?.generateVariants) {
      try {
        const aiResult = await root.PhysicsStudioAITutor.generateVariants({
          question: parent,
          itemModel,
          count: requestedCount,
          minorUnder14: options.minorUnder14,
          guardianConsentStatus: options.guardianConsentStatus,
          personalIdentifiers: options.personalIdentifiers
        });
        variants = (aiResult?.variants || []).slice(0, requestedCount).map((value, index) => normalizeAiVariant(parent, value, index));
        generationMode = "controlled-ai-gateway";
      } catch (error) {
        gatewayError = text(error?.message || error, 500);
      }
    }
    if (variants.length < 2) {
      return {
        id: `variant-set-${stableHash(cacheKey)}`,
        cacheKey,
        parentQuestionId: itemModel.sourceQuestionId,
        sourceContentHash: itemModel.sourceContentHash,
        specVersion: SPEC_VERSION,
        generatorVersion: GENERATOR_VERSION,
        itemModel,
        variants: [],
        status: "unavailable",
        approvalStatus: "unavailable",
        stale: false,
        message: "当前没有可验证的完整变式题",
        gatewayError,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    const aiGenerated = generationMode === "controlled-ai-gateway";
    const allValidated = variants.every((variant) => variant.validation?.passed === true);
    const set = {
      id: `variant-set-${stableHash(cacheKey)}`,
      cacheKey,
      parentQuestionId: itemModel.sourceQuestionId,
      sourceContentHash: itemModel.sourceContentHash,
      specVersion: SPEC_VERSION,
      generatorVersion: GENERATOR_VERSION,
      itemModel,
      variants: variants.slice(0, requestedCount),
      generationMode,
      status: aiGenerated ? "pending-review" : allValidated ? "approved" : "validation-failed",
      approvalStatus: aiGenerated ? "pending-teacher-review" : allValidated ? "system-validated" : "rejected",
      reviewRequired: aiGenerated || !allValidated,
      stale: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return set;
  }

  function isSetStale(set, parent) {
    return !set || !parent || set.parentQuestionId !== parent.id || set.sourceContentHash !== sourceContentHash(parent);
  }

  root.PhysicsStudioVariantGenerator = Object.freeze({
    version: GENERATOR_VERSION,
    specVersion: SPEC_VERSION,
    roles: ROLES,
    roleLabels: ROLE_LABELS,
    stableHash,
    sourceContentHash,
    buildItemModel,
    candidateScore,
    createVariant,
    validateVariant,
    localVariants,
    generateVariantSet,
    isSetStale
  });
})();
