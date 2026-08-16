(() => {
  "use strict";

  const MAX_QUERY_LENGTH = 500;

  function localQuestions(query) {
    const text = String(query || "").trim().toLocaleLowerCase("zh-CN");
    if (!text) return [];
    const questions = window.PhysicsStudioApp?.getQuestions?.() || [];
    return questions.filter((question) => [question.title, question.content, question.topic, question.knowledgePoint]
      .some((value) => String(value || "").toLocaleLowerCase("zh-CN").includes(text))).slice(0, 10);
  }

  function learningContext() {
    const engine = window.PHYSICS_LEARNING_ENGINE;
    const state = engine?.loadState?.();
    if (!state || !state.activeProfileId) return null;
    try {
      const questions = window.PhysicsStudioApp?.getQuestions?.() || [];
      const analysis = engine.buildStudentLearningDiagnosis
        ? engine.buildStudentLearningDiagnosis(state, questions, state.activeProfileId)
        : engine.studentAnalysis?.(state, questions, state.activeProfileId);
      return {
        profileId: state.activeProfileId,
        sampleStatus: analysis?.sampleStatus || "insufficient",
        evidence: Array.isArray(analysis?.priorities)
          ? analysis.priorities.slice(0, 3)
          : Array.isArray(analysis?.weakest) ? analysis.weakest.slice(0, 3) : [],
        boundary: analysis?.boundary || "当前没有足够的本机作答证据。"
      };
    } catch {
      return null;
    }
  }

  function openEdgeSearch(query) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    return {
      source: "edge",
      networkSearched: Boolean(opened),
      answerAvailable: false,
      answer: opened
        ? "已在 Microsoft Edge 中打开检索结果；网页内容未被应用抓取，因此不会伪装成软件已生成答案。"
        : "无法打开 Microsoft Edge，请检查弹窗权限或系统默认浏览器。",
      url
    };
  }

  async function answer(input = {}) {
    const query = String(input.query || input.question?.content || "").trim().slice(0, MAX_QUERY_LENGTH);
    if (!query) throw new Error("请输入物理问题。");
    const local = localQuestions(query);
    const tutor = window.PhysicsStudioAITutor;
    if (tutor?.status?.().ready && input.question) {
      const solution = await tutor.solveQuestion({
        question: input.question,
        studentWork: input.studentWork || "",
        hintLevelUsed: input.hintLevelUsed || 0,
        personalIdentifiers: input.personalIdentifiers || [],
        learningContext: learningContext()
      });
      return { source: "controlled-ai", networkSearched: true, answerAvailable: true, solution, localMatches: local };
    }
    if (local.length) {
      return {
        source: "local-library",
        networkSearched: false,
        answerAvailable: true,
        answer: "已从本地题库找到相关资料。",
        localMatches: local.map((question) => ({
          id: question.id,
          title: question.title,
          solution: question.solution || question.analysis || question.answer || ""
        })),
        learningContext: learningContext()
      };
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return {
        source: "local-only",
        networkSearched: false,
        answerAvailable: false,
        answer: "当前处于离线状态，未进行网络检索；请先连接网络或补充本地题库。"
      };
    }
    return openEdgeSearch(query);
  }

  window.PhysicsStudioQuestionAnswerService = Object.freeze({
    version: "3.0.0",
    answer,
    searchOnline: openEdgeSearch,
    localQuestions
  });
})();
