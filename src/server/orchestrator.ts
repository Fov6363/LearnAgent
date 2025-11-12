import { randomUUID } from "crypto";

import { SessionStateSchema, SessionState, Slots, AgentType } from "@/lib/schema";
import { runNavigatorAgent } from "./agents/navigator-agent";
import { runDiagnosticAgent } from "./agents/diagnostic-agent";
import { runCurriculumAgent } from "./agents/curriculum-agent";
import { runSchedulerAgent } from "./agents/scheduler-agent";

type AgentMessage = { agent: AgentType; content: string };

type OrchestratorInput = {
  sessionId?: string;
  message?: string;
  state?: unknown;
  adjustInstruction?: string;
};

type OrchestratorOutput = {
  sessionId: string;
  state: SessionState;
  messages: AgentMessage[];
};

export const orchestrate = async ({
  sessionId,
  message,
  state,
  adjustInstruction,
}: OrchestratorInput): Promise<OrchestratorOutput> => {
  let currentState = SessionStateSchema.parse(state ?? {});
  const responses: AgentMessage[] = [];
  const effectiveSessionId = sessionId ?? randomUUID();

  if (message && message.trim()) {
    const navigatorResult = await runNavigatorAgent({
      state: currentState,
      userMessage: message,
    });

    currentState = {
      ...currentState,
      slots: { ...currentState.slots, ...navigatorResult.slotUpdates },
      next_agent: navigatorResult.nextAgent,
    };

    responses.push({ agent: "navigator", content: navigatorResult.assistantReply });

    if (navigatorResult.intent === "change_goal") {
      currentState = {
        slots: navigatorResult.slotUpdates,
        quiz: { status: "idle" },
      } as SessionState;
    }
  }

  const nextAgent = currentState.next_agent ?? "none";
  switch (nextAgent) {
    case "diagnostic": {
      const diag = await runDiagnosticAgent({
        state: currentState,
        slots: currentState.slots as Slots,
      });
      currentState = { ...currentState, quiz: diag.quizState, next_agent: "none" };
      diag.messages.forEach((content) => responses.push({ agent: "diagnostic", content }));
      break;
    }
    case "curriculum": {
      const curriculum = await runCurriculumAgent({
        state: currentState,
        slots: currentState.slots as Slots,
      });
      currentState = { ...currentState, outline: curriculum.outline, next_agent: "none" };
      curriculum.messages.forEach((content) => responses.push({ agent: "curriculum", content }));
      break;
    }
    case "scheduler": {
      const scheduler = await runSchedulerAgent({
        state: currentState,
        slots: currentState.slots as Slots,
        outline: currentState.outline,
        adjustInstruction,
      });
      currentState = { ...currentState, plan: scheduler.plan, next_agent: "none" };
      scheduler.messages.forEach((content) => responses.push({ agent: "scheduler", content }));
      break;
    }
    case "adjust": {
      if (!adjustInstruction) {
        responses.push({ agent: "adjust", content: "请提供调整需求。" });
        break;
      }
      const scheduler = await runSchedulerAgent({
        state: currentState,
        slots: currentState.slots as Slots,
        outline: currentState.outline,
        adjustInstruction,
      });
      currentState = { ...currentState, plan: scheduler.plan, next_agent: "none" };
      scheduler.messages.forEach((content) => responses.push({ agent: "adjust", content }));
      break;
    }
    default:
      break;
  }

  currentState.history = [
    ...(currentState.history ?? []),
    ...(message ? [{ role: "user", content: message }] : []),
    ...responses.map((r) => ({ role: "agent", agent: r.agent, content: r.content })),
  ];

  return {
    sessionId: effectiveSessionId,
    state: currentState,
    messages: responses,
  };
};
