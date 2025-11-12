import { buildOutlinePrompt } from "@/lib/prompts";
import { safeJsonStringify, parseWithSchema } from "@/lib/json";
import { callLLM } from "@/lib/llm";
import { OutlineSchema, Slots } from "@/lib/schema";
import type { CurriculumAgentResult } from "./types";

export const runCurriculumAgent = async ({
  slots,
}: {
  slots: Partial<Slots>;
}): Promise<CurriculumAgentResult> => {
  const prompt = buildOutlinePrompt({
    slotsJson: safeJsonStringify(slots),
  });
  const llmResult = await callLLM({ prompt });
  const outline = parseWithSchema(OutlineSchema, llmResult.content);

  return {
    messages: ["已根据你的输入生成三阶段学习大纲，请确认是否满意。"],
    outline,
  };
};
