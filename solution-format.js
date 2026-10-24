(() => {
  "use strict";

  const CONTENT_VERSION = "2026.10.11-numeric-integrity-r3";
  const LEGACY_VERSION = "2026.07.29-detailed-solutions-r2";
  // Fingerprints captured from the original committed bundled output. This
  // checksum is not a security hash: exact text equality is mandatory as well.
  const legacyHashes = Object.freeze({
    "cs-original-v1-g8-01": "solution-fnv1a32-4682a557",
    "cs-original-v1-g8-02": "solution-fnv1a32-8106c4da",
    "cs-original-v1-g9-08": "solution-fnv1a32-8c9af683",
    "hn-mock-2027-gk-a-q12": "solution-fnv1a32-edeade76"
  });
  const repairs = new Map();
  const profiles = {
    curriculum: {
      introduction: "题目条件、所求结论和研究对象",
      review: "核对题目设问、物理规律适用条件、单位、方向和数量级；选择题同时核对其余选项为何不成立。"
    },
    mock: {
      introduction: "题目条件、研究对象和所求结论",
      review: "核对设问、公式或规律的适用条件、单位、方向和数量级；选择题同时核对其余选项。"
    }
  };

  // Only an explicit Chinese step label is unambiguous. Bare numeric prefixes
  // (even "1. ") may be data, ratios or formulas and are retained verbatim.
  function stripStepLabel(line) {
    return line.trim().replace(/^第\s*\d+\s*步\s*[：:]\s*/, "");
  }

  function render(definition, profileName, stripLabel) {
    const existing = String(definition.solution || "").trim();
    if (/^【考察点】/.test(existing)) return existing;
    const profile = profiles[profileName] || profiles.curriculum;
    const points = definition.examPoints?.length ? definition.examPoints : [definition.topic];
    const fragments = existing.split(/\r?\n/)
      .flatMap((line) => line.split(/(?<=[。；])\s*/))
      .map(stripLabel).filter(Boolean);
    const reasoning = [
      `先明确${profile.introduction}，本题主要考察${points.join("、")}。`,
      ...fragments,
      `整理上述推理，按题目要求写出结论：${definition.answer}`
    ];
    return [
      `【考察点】${points.join("、")}`,
      "【分步解析】",
      ...reasoning.map((line, index) => `${index + 1}. ${line}`),
      `【最终结论】${definition.answer}`,
      `【结果复核】${profile.review}`
    ].join("\n");
  }

  function formatDetailedSolution(definition, profileName = "curriculum") {
    return render(definition, profileName, stripStepLabel);
  }

  function solutionHash(solution) {
    const text = String(solution || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
    return `solution-fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function contentMetadata(definition, profileName) {
    const solution = formatDetailedSolution(definition, profileName);
    const expectedLegacyHash = legacyHashes[definition.id];
    if (expectedLegacyHash) {
      // Historical reproduction ONLY for matching old persisted strings. Never
      // use this broad prefix removal for presentation or new content.
      const oldSolution = render(definition, profileName, (line) => line
        .replace(/^(?:第\s*)?\d+(?:\s*步)?[.、：:]\s*/, "").trim());
      if (solutionHash(oldSolution) === expectedLegacyHash) {
        repairs.set(definition.id, Object.freeze({ oldSolution, solution, expectedLegacyHash }));
      }
    }
    return { contentVersion: CONTENT_VERSION, contentHash: solutionHash(solution) };
  }

  // Returns a plan without mutating records or writing storage. The caller
  // commits questions transactionally; keeping the input permits rollback.
  function repairBundledSolutions(questions) {
    const repairedIds = [];
    const conflicts = [];
    const result = questions.map((question) => {
      const repair = repairs.get(question.id);
      if (!repair || question.solution === repair.solution) return question;
      const currentHash = solutionHash(question.solution);
      const matches = currentHash === repair.expectedLegacyHash
        && question.solution === repair.oldSolution
        && (!question.contentHash || question.contentHash === repair.expectedLegacyHash)
        && (!question.contentVersion || question.contentVersion === LEGACY_VERSION);
      if (!matches) {
        conflicts.push({ id: question.id, reason: "edited-or-unrecognized-content", currentHash,
          expectedLegacyHash: repair.expectedLegacyHash, suggestedSolution: repair.solution });
        return question;
      }
      repairedIds.push(question.id);
      return { ...question, solution: repair.solution, contentVersion: CONTENT_VERSION,
        contentHash: solutionHash(repair.solution) };
    });
    return { questions: result, repairedIds, conflicts };
  }

  window.PHYSICS_SOLUTION_FORMAT = Object.freeze({ CONTENT_VERSION, formatDetailedSolution,
    stripStepLabel, solutionHash, contentMetadata, repairBundledSolutions });
})();
