(() => {
  "use strict";
  const taxonomy = window.PHYSICS_CURRICULUM_TAXONOMY;
  if (!taxonomy?.books) throw new Error("教材目录未加载，不能生成节映射。");
  const sections = taxonomy.books.flatMap((book) => book.chapters.flatMap((chapter) => chapter.sections.map((section) => ({
    book, chapter, section
  }))));
  const byId = new Map(sections.map((entry) => [entry.section.id, entry]));
  // Reviewed against the section catalog, not inferred from the broad topic label.
  // Existing template IDs and question IDs remain unchanged.
  const modelSections = Object.freeze({
    "g8-original-template-000": "pep-g8-1-c01-s03",
    "g8-original-template-001": "pep-g8-1-c01-s04",
    "g8-original-template-002": "pep-g8-1-c06-s02",
    "g8-original-template-003": "pep-g8-1-c02-s01",
    "g8-original-template-004": "pep-g8-1-c04-s02",
    "g8-original-template-005": "pep-g8-1-c05-s03",
    "g8-original-template-006": "pep-g8-2-c01-s03",
    "g8-original-template-008": "pep-g8-2-c03-s01",
    "g8-original-template-009": "pep-g8-2-c03-s02",
    "g8-original-template-010": "pep-g8-2-c04-s01",
    "g8-original-template-011": "pep-g8-2-c06-s01",
    "g8-original-template-012": "pep-g8-2-c05-s01",
    "g8-original-template-013": "pep-g8-2-c05-s03",
    "g8-original-template-014": "pep-g8-1-c03-s01",
    "g9-original-template-000": "pep-g9-c01-s03",
    "g9-original-template-002": "pep-g9-c02-s02",
    "g9-original-template-003": "pep-g9-c05-s02",
    "g9-original-template-004": "pep-g9-c05-s04",
    "g9-original-template-005": "pep-g9-c05-s04",
    "g9-original-template-006": "pep-g9-c06-s02",
    "g9-original-template-007": "pep-g9-c06-s01",
    "g9-original-template-008": "pep-g9-c06-s04",
    "g9-original-template-009": "pep-g9-c06-s02",
    "g9-original-template-010": "pep-g9-c04-s04",
    "g9-original-template-013": "pep-g9-c08-s05",
    "g9-original-template-014": "pep-g9-c07-s01",
    "h1-original-template-000": "pep-h-2019-required-1-c02-s02",
    "h1-original-template-001": "pep-h-2019-required-1-c02-s03",
    "h1-original-template-002": "pep-h-2019-required-1-c02-s02",
    "h1-original-template-003": "pep-h-2019-required-1-c02-s04",
    "h1-original-template-004": "pep-h-2019-required-1-c04-s03",
    "h1-original-template-005": "pep-h-2019-required-1-c04-s06",
    "h1-original-template-006": "pep-h-2019-required-1-c04-s06",
    "h1-original-template-014": "pep-h-2019-required-1-c03-s01",
    "h2-original-template-000": "pep-h-required-3-c01-s02",
    "h2-original-template-001": "pep-h-required-3-c01-s03",
    "h2-original-template-002": "pep-h-required-3-c02-s02",
    "h2-original-template-003": "pep-h-required-3-c02-s04",
    "h2-original-template-004": "pep-h-required-3-c04-s02"
  });

  function unresolved(reason, knowledgePointId) {
    return { curriculumVersion: "", curriculumSectionIds: [],
      curriculumReviewStatus: "unresolved", mappingReason: reason,
      ...(knowledgePointId ? { knowledgePointId } : {}) };
  }

  function bookModule(title) {
    return String(title || "").match(/(?:选择性必修|必修)第[一二三]册/u)?.[0] || "";
  }

  function resolve(question = {}) {
    const grade = String(question.grade || "").trim();
    const knowledgePointId = String(question.knowledgePointId || "").trim()
      || taxonomy.resolveKnowledgePoint(question).id;
    const explicitIds = Array.isArray(question.curriculumSectionIds)
      ? question.curriculumSectionIds.filter(Boolean)
      : question.curriculumSectionId ? [question.curriculumSectionId] : [];
    if (explicitIds.length) {
      const matches = explicitIds.map((id) => byId.get(String(id)));
      if (matches.some((entry) => !entry || !entry.book.grades.includes(grade))) {
        return unresolved("显式教材节 ID 不存在或与年级不符，待教师核验", knowledgePointId);
      }
      const versions = new Set(matches.map((entry) => entry.book.curriculumVersion));
      if (versions.size !== 1) return unresolved("教材节跨版本，待教师核验", knowledgePointId);
      return { curriculumVersion: matches[0].book.curriculumVersion,
        curriculumSectionIds: [...new Set(explicitIds)],
        curriculumReviewStatus: "catalog-exact", mappingReason: "显式教材节 ID 与年级、目录核对通过",
        knowledgePointId };
    }

    const modelSectionId = modelSections[String(question.modelDefinitionId || "")];
    if (modelSectionId) {
      const entry = byId.get(modelSectionId);
      if (!entry || !entry.book.grades.includes(grade)) {
        return unresolved("模板教材节映射与年级不符，待教师核验", knowledgePointId);
      }
      const claimedModule = bookModule(question.curriculumBook);
      const mappedModule = bookModule(entry.book.title);
      if (claimedModule && mappedModule && claimedModule !== mappedModule) {
        return unresolved("题目声明教材册与已核对模型所属教材册冲突，待教师核验", knowledgePointId);
      }
      return { curriculumVersion: entry.book.curriculumVersion,
        curriculumSectionIds: [modelSectionId], curriculumReviewStatus: "catalog-exact",
        mappingReason: "已核对的稳定模型模板与教材节映射", knowledgePointId };
    }

    const bookTitle = String(question.curriculumBook || "").trim();
    const chapterTitle = String(question.curriculumChapter || "").trim();
    const sectionTitle = String(question.curriculumSection || "").trim();
    if (!bookTitle || !chapterTitle || !sectionTitle) {
      return unresolved("未同时声明册、章、节，不能由宽泛知识点推断具体教材节", knowledgePointId);
    }
    const exact = sections.filter((entry) => entry.book.grades.includes(grade)
      && entry.book.title === bookTitle
      && entry.chapter.title === chapterTitle
      && entry.section.title === sectionTitle);
    if (exact.length !== 1) return unresolved("册、章、节未唯一匹配已核对目录", knowledgePointId);
    return { curriculumVersion: exact[0].book.curriculumVersion,
      curriculumSectionIds: [exact[0].section.id],
      curriculumReviewStatus: "catalog-exact", mappingReason: "册、章、节文字与目录完全一致",
      knowledgePointId };
  }

  window.PHYSICS_CURRICULUM_MAPPING = Object.freeze({ version: 1, resolve,
    sectionExists: (id) => byId.has(id) });
})();
