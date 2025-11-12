import { z } from "zod";

export const SlotSchema = z.object({
  goal: z.string().min(3).max(280).optional(),
  duration_days: z.number().int().positive().optional(),
  time_commitment_minutes: z.number().int().positive().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  preferred_resources: z.array(z.string()).optional(),
  quiz_score: z.number().int().min(0).max(100).optional(),
  recommended_start_stage: z.string().optional(),
  quiz_status: z.enum(["pending", "in_progress", "completed", "skipped"]).optional(),
  intent: z.string().optional(),
  notes: z.string().optional(),
});
export type Slots = z.infer<typeof SlotSchema>;

export const AgentTypeSchema = z.enum(["none", "navigator", "diagnostic", "curriculum", "scheduler", "adjust"]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const NavigatorIntentSchema = z.enum([
  "collect_info",
  "request_quiz",
  "skip_quiz",
  "start_outline",
  "generate_plan",
  "adjust_plan",
  "change_goal",
  "reset_session",
]);
export type NavigatorIntent = z.infer<typeof NavigatorIntentSchema>;

export const ResourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  type: z.string().default("article"),
});

export const StageSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  focus_topics: z.array(z.string()).min(1),
  entry_requirement: z.string().optional(),
});

export const OutlineSchema = z.object({
  summary: z.string(),
  stages: z.array(StageSchema).min(3),
});
export type Outline = z.infer<typeof OutlineSchema>;

export const NodeSchema = z.object({
  id: z.string(),
  stage_id: z.string(),
  title: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
  est_minutes: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  resources: z.array(ResourceSchema).default([]),
});

export const DailyTaskSchema = z.object({
  day_index: z.number().int().positive(),
  focus: z.string(),
  node_ids: z.array(z.string()),
  checklist: z.array(z.string()).min(1),
});

export const PlanSchema = z.object({
  stages: z.array(StageSchema).min(3),
  nodes: z.array(NodeSchema).min(1),
  daily_schedule: z.array(DailyTaskSchema).min(1),
});
export type Plan = z.infer<typeof PlanSchema>;

export const NavigatorResponseSchema = z.object({
  assistant_reply: z.string(),
  slot_updates: SlotSchema.partial().default({}),
  intent: NavigatorIntentSchema,
  next_agent: AgentTypeSchema,
  metadata: z.record(z.any()).optional(),
});

export const QuizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["concept", "code", "choice"]),
  prompt: z.string(),
  expected_answer: z.string(),
  explanation: z.string(),
});

export const QuizPayloadSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(2),
});

export const QuizGradeSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  recommended_start_stage: z.string(),
  per_question: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().min(0).max(1),
        feedback: z.string(),
      }),
    )
    .min(1),
  misconceptions: z.array(z.string()).default([]),
});

export const AdjustResponseSchema = z.object({
  updated_plan: PlanSchema,
  notes: z.array(z.string()).default([]),
});

export const QuizStateSchema = z.object({
  status: z.enum(["idle", "awaiting_answers", "needs_grading", "completed", "skipped"]).default("idle"),
  questions: z.array(QuizQuestionSchema).optional(),
  answers: z.record(z.string()).optional(),
  score: z.number().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  recommended_start_stage: z.string().optional(),
  misconceptions: z.array(z.string()).optional(),
});

export const SessionStateSchema = z.object({
  slots: SlotSchema.partial().default({}),
  quiz: QuizStateSchema.optional(),
  outline: OutlineSchema.optional(),
  plan: PlanSchema.optional(),
  next_agent: AgentTypeSchema.optional(),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant", "agent"]).default("assistant"),
      agent: AgentTypeSchema.optional(),
      content: z.string(),
      timestamp: z.number().optional(),
    }),
  ).optional(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const OrchestratorResponseSchema = z.object({
  sessionId: z.string(),
  state: SessionStateSchema,
  messages: z.array(
    z.object({
      agent: AgentTypeSchema,
      content: z.string(),
    }),
  ),
  pending_actions: z.array(z.string()).default([]),
});
