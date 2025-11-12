import { buildPathPrompt, buildAdjustPrompt } from "@/lib/prompts";
import { safeJsonStringify, parseWithSchema } from "@/lib/json";
import { callLLM } from "@/lib/llm";
import { PlanSchema, OutlineSchema, SessionState, Slots } from "@/lib/schema";
import type { SchedulerAgentResult } from "./types";

export const runSchedulerAgent = async ({
  state,
  slots,
  outline,
  adjustInstruction,
}: {
  state: SessionState;
  slots: Partial<Slots>;
  outline?: unknown;
  adjustInstruction?: string;
}): Promise<SchedulerAgentResult> => {
  if (!state.outline && !outline) {
    throw new Error("Scheduler agent requires an outline");
  }

  const outlinePayload = OutlineSchema.parse(outline ?? state.outline);

  if (adjustInstruction && state.plan) {
    const prompt = buildAdjustPrompt({
      currentPlanJson: safeJsonStringify(state.plan),
      instruction: adjustInstruction,
    });
    const llmResult = await callLLM({ prompt });
    const adjusted = parseWithSchema(PlanSchema, llmResult.content);
    return {
      messages: ["已根据你的反馈调整学习计划。"],
      plan: adjusted,
    };
  }

  const prompt = buildPathPrompt({
    outlineJson: safeJsonStringify(outlinePayload),
    slotsJson: safeJsonStringify(slots),
  });
  const llmResult = await callLLM({ prompt });
  const plan = parseWithSchema(PlanSchema, llmResult.content);

  return {
    messages: ["详细学习计划已生成，包含每日任务与资源。"],
    plan,
  };
};
