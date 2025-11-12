import type { Slots, SessionState, Outline, Plan, AgentType, NavigatorIntent } from "@/lib/schema";
import { QuizStateSchema } from "@/lib/schema";
import { z } from "zod";

export type NavigatorAgentResult = {
  assistantReply: string;
  slotUpdates: Partial<Slots>;
  intent: NavigatorIntent;
  nextAgent: AgentType;
  metadata?: Record<string, unknown>;
};

export type DiagnosticAgentResult = {
  messages: string[];
  quizState: z.infer<typeof QuizStateSchema>;
};

export type CurriculumAgentResult = {
  messages: string[];
  outline: Outline;
};

export type SchedulerAgentResult = {
  messages: string[];
  plan: Plan;
};

export type OrchestratorContext = {
  sessionId: string;
  userId?: string;
  state: SessionState;
  userMessage?: string;
};
