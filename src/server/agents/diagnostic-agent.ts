import { buildQuizPrompt, buildQuizGradePrompt } from "@/lib/prompts";
import { safeJsonStringify, parseWithSchema } from "@/lib/json";
import { callLLM } from "@/lib/llm";
import {
  QuizPayloadSchema,
  QuizGradeSchema,
  QuizStateSchema,
  SessionState,
  Slots,
} from "@/lib/schema";
import type { DiagnosticAgentResult } from "./types";

export const runDiagnosticAgent = async ({
  state,
  slots,
}: {
  state: SessionState;
  slots: Partial<Slots>;
}): Promise<DiagnosticAgentResult> => {
  const quizState = state.quiz ?? { status: "idle" };

  if (quizState.status === "awaiting_answers" || quizState.status === "idle") {
    const prompt = buildQuizPrompt({
      goal: slots.goal ?? "",
      levelHint: slots.level ?? "beginner",
      experienceNotes: slots.notes ?? "",
    });
    const llmResult = await callLLM({ prompt });
    const questions = parseWithSchema(QuizPayloadSchema, llmResult.content);
    const nextState = QuizStateSchema.parse({
      status: "awaiting_answers",
      questions: questions.questions,
    });
    return {
      messages: ["已为你生成一份快速小测，完成后我会给出评估。"],
      quizState: nextState,
    };
  }

  if (quizState.status === "needs_grading" && quizState.questions && quizState.answers) {
    const prompt = buildQuizGradePrompt({
      questionsJson: safeJsonStringify(quizState.questions),
      userAnswersJson: safeJsonStringify(quizState.answers),
    });
    const llmResult = await callLLM({ prompt });
    const graded = parseWithSchema(QuizGradeSchema, llmResult.content);
    const nextState = QuizStateSchema.parse({
      status: "completed",
      questions: quizState.questions,
      answers: quizState.answers,
      score: graded.score,
      level: graded.level,
      recommended_start_stage: graded.recommended_start_stage,
      misconceptions: graded.misconceptions,
    });
    return {
      messages: [
        `小测完成，评分 ${graded.score}，建议从 ${graded.recommended_start_stage} 开始。`,
      ],
      quizState: nextState,
    };
  }

  return {
    messages: ["小测状态无变化。"],
    quizState,
  };
};
