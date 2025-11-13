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

export type OrchestratorStreamEvent =
  | { type: "agent_message"; agent: AgentType; content: string }
  | { type: "state"; state: SessionState };

export const orchestrate = async (
  { sessionId, message, state, adjustInstruction }: OrchestratorInput,
  emit?: (event: OrchestratorStreamEvent) => void,
): Promise<OrchestratorOutput> => {
  let currentState = SessionStateSchema.parse(state ?? {});
  const responses: AgentMessage[] = [];
  const effectiveSessionId = sessionId ?? randomUUID();
  const history = [...(currentState.history ?? [])];
  currentState.history = history;

  const emitState = () => {
    emit?.({ type: "state", state: structuredClone(currentState) });
  };

  const pushAgentMessage = (agent: AgentType, content: string) => {
    responses.push({ agent, content });
    history.push({ role: "agent", agent, content });
    currentState.history = history;
    emit?.({ type: "agent_message", agent, content });
  };

  if (message && message.trim()) {
    history.push({ role: "user", content: message });
    currentState.history = history;
    emitState();

    const navigatorResult = await runNavigatorAgent({
      state: currentState,
      userMessage: message,
    });

    currentState = {
      ...currentState,
      slots: { ...currentState.slots, ...navigatorResult.slotUpdates },
      next_agent: navigatorResult.nextAgent,
    };

    pushAgentMessage("navigator", navigatorResult.assistantReply);

    if (navigatorResult.intent === "change_goal") {
      currentState = {
        slots: navigatorResult.slotUpdates,
        quiz: { status: "idle" },
        history,
      } as SessionState;
      emitState();
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
      diag.messages.forEach((content) => pushAgentMessage("diagnostic", content));
      emitState();
      break;
    }
    case "curriculum": {
      const curriculum = await runCurriculumAgent({
        slots: currentState.slots as Slots,
      });
      currentState = { ...currentState, outline: curriculum.outline, next_agent: "none" };
      curriculum.messages.forEach((content) => pushAgentMessage("curriculum", content));
      emitState();
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
      scheduler.messages.forEach((content) => pushAgentMessage("scheduler", content));
      emitState();
      break;
    }
    case "adjust": {
      if (!adjustInstruction) {
        pushAgentMessage("adjust", "请提供调整需求。");
        break;
      }
      const scheduler = await runSchedulerAgent({
        state: currentState,
        slots: currentState.slots as Slots,
        outline: currentState.outline,
        adjustInstruction,
      });
      currentState = { ...currentState, plan: scheduler.plan, next_agent: "none" };
      scheduler.messages.forEach((content) => pushAgentMessage("adjust", content));
      emitState();
      break;
    }
    default:
      break;
  }

  emitState();

  return {
    sessionId: effectiveSessionId,
    state: currentState,
    messages: responses,
  };
};
