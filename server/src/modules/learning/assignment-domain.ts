import { ApiError } from "../../common/errors.js";

export interface AssignmentQuestionItem {
  id: string;
  title: string;
  content: string;
  questionType: string;
  options: string[];
  knowledgePointId: string;
  difficulty: string;
  correctAnswer?: string;
}

export interface AssignmentAnswer {
  questionId: string;
  response: string;
  steps?: string;
  startedAt?: string;
  hintViewCount?: number;
}

export interface PerQuestionScore {
  questionId: string;
  score: number | null;
}

/** The answer key stays in the teacher-owned persisted snapshot, never in student responses. */
export function visibleQuestionItems(items: readonly AssignmentQuestionItem[]): Omit<AssignmentQuestionItem, "correctAnswer">[] {
  return items.map(({ correctAnswer: _answer, ...visible }) => visible);
}

export function validateSubmissionAnswers(
  answers: readonly AssignmentAnswer[],
  questionIds: readonly string[],
): { answeredQuestionIds: string[]; missingQuestionIds: string[] } {
  if (!questionIds.length || !answers.length) {
    throw new ApiError(400, "answer_required", "At least one real assignment answer is required");
  }
  const expected = new Set(questionIds);
  const answered = new Set<string>();
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== "string" || !expected.has(answer.questionId)) {
      throw new ApiError(400, "foreign_question", "An answer refers to a question outside this assignment");
    }
    if (answered.has(answer.questionId)) {
      throw new ApiError(400, "duplicate_answer", "A question was answered more than once in this submission");
    }
    if (typeof answer.response !== "string" || !answer.response.trim()) {
      throw new ApiError(400, "answer_required", "A submitted answer must contain a response");
    }
    answered.add(answer.questionId);
  }
  return {
    answeredQuestionIds: [...answered],
    missingQuestionIds: questionIds.filter((questionId) => !answered.has(questionId)),
  };
}

/**
 * Validates teacher-entered question scores against the question IDs retained
 * in this immutable submission. A null score deliberately means "not yet
 * scored" and therefore remains outside accuracy and average-score evidence.
 */
export function validatePerQuestionScores(
  scores: readonly PerQuestionScore[],
  questionIds: readonly string[],
): PerQuestionScore[] {
  const expected = new Set(questionIds);
  const seen = new Set<string>();
  return scores.map((entry) => {
    if (!entry || typeof entry.questionId !== "string" || !expected.has(entry.questionId)) {
      throw new ApiError(400, "foreign_question_score", "A score refers to a question outside this assignment");
    }
    if (seen.has(entry.questionId)) {
      throw new ApiError(400, "duplicate_question_score", "A question was scored more than once in this review");
    }
    seen.add(entry.questionId);
    if (entry.score !== null && (
      typeof entry.score !== "number"
      || !Number.isFinite(entry.score)
      || entry.score < 0
      || entry.score > 100
    )) {
      throw new ApiError(400, "invalid_question_score", "Each scored question must be between 0 and 100");
    }
    return { questionId: entry.questionId, score: entry.score };
  });
}

function choiceKey(value: string): string | null {
  const normalized = value.trim().normalize("NFKC").toUpperCase();
  return /^[A-Z]$/.test(normalized) ? normalized : null;
}

/** Only exact, single-choice keys are automatically scored; open and ambiguous answers await a teacher. */
export function gradeObjectiveAnswers(
  questions: readonly AssignmentQuestionItem[],
  answers: readonly AssignmentAnswer[],
): { scoredCount: number; correctCount: number; pendingCount: number; score: number | null } {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  let scoredCount = 0;
  let correctCount = 0;
  let pendingCount = 0;
  for (const question of questions) {
    const answer = byId.get(question.id);
    if (!answer) continue;
    const key = /^(单项选择题|单选题|choice)$/.test(question.questionType)
      ? choiceKey(question.correctAnswer || "")
      : null;
    if (!key) {
      pendingCount += 1;
      continue;
    }
    scoredCount += 1;
    if (choiceKey(answer.response) === key) correctCount += 1;
  }
  return {
    scoredCount,
    correctCount,
    pendingCount,
    score: pendingCount || !scoredCount ? null : Math.round((100 * correctCount) / scoredCount),
  };
}
