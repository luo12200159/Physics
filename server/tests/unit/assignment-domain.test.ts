import { describe, expect, it } from "vitest";

import {
  gradeObjectiveAnswers,
  validateSubmissionAnswers,
  visibleQuestionItems,
  type AssignmentAnswer,
} from "../../src/modules/learning/assignment-domain.js";

const questions = [
  { id: "q-a", title: "运动选择题", content: "以下哪项正确？", questionType: "单项选择题", options: ["A. 匀速", "B. 变速"], correctAnswer: "B", knowledgePointId: "kp:motion", difficulty: "基础" },
  { id: "q-b", title: "实验解释", content: "解释实验现象。", questionType: "实验题", options: [], correctAnswer: "人工复核", knowledgePointId: "kp:experiment", difficulty: "进阶" },
];

describe("assignment evidence boundary", () => {
  it("never exposes answer keys in student assignment snapshots", () => {
    expect(visibleQuestionItems(questions)).toEqual([
      expect.objectContaining({ id: "q-a", title: "运动选择题" }),
      expect.objectContaining({ id: "q-b", title: "实验解释" }),
    ]);
    expect(JSON.stringify(visibleQuestionItems(questions))).not.toContain("correctAnswer");
    expect(JSON.stringify(visibleQuestionItems(questions))).not.toContain("人工复核");
  });

  it("rejects empty, completion-marker, duplicate and foreign-question submissions", () => {
    expect(() => validateSubmissionAnswers([], ["q-a", "q-b"])).toThrow();
    expect(() => validateSubmissionAnswers([{ status: "completed" }] as unknown as AssignmentAnswer[], ["q-a", "q-b"])).toThrow();
    expect(() => validateSubmissionAnswers([
      { questionId: "q-a", response: "B" },
      { questionId: "q-a", response: "A" },
    ], ["q-a", "q-b"])).toThrow();
    expect(() => validateSubmissionAnswers([
      { questionId: "q-other", response: "B" },
    ], ["q-a", "q-b"])).toThrow();
  });

  it("accepts a real partial draft submission but identifies unanswered questions", () => {
    expect(validateSubmissionAnswers([
      { questionId: "q-a", response: "B", steps: "比较选项" },
    ], ["q-a", "q-b"])).toEqual({ answeredQuestionIds: ["q-a"], missingQuestionIds: ["q-b"] });
  });

  it("auto-scores only reliable choice answers and leaves open answers pending", () => {
    expect(gradeObjectiveAnswers(questions, [
      { questionId: "q-a", response: "b" },
      { questionId: "q-b", response: "我观察到速度增加" },
    ])).toEqual({ scoredCount: 1, correctCount: 1, pendingCount: 1, score: null });
  });
});
