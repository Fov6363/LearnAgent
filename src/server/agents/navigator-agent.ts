import { buildNavigatorPrompt } from "@/lib/prompts";
import { safeJsonStringify, parseWithSchema } from "@/lib/json";
import { callLLM } from "@/lib/llm";
import { NavigatorResponseSchema, SessionState } from "@/lib/schema";
import type { NavigatorAgentResult } from "./types";

export const runNavigatorAgent = async ({
  state,
  userMessage,
}: {
  state: SessionState;
  userMessage: string;
}): Promise<NavigatorAgentResult> => {
  const historySnippet = (state.history ?? [])
    .slice(-6)
    .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}`)
    .join("\n");

  const prompt = buildNavigatorPrompt({
    slotsJson: safeJsonStringify(state.slots ?? {}),
    historySnippet,
    latestUserMessage: userMessage,
  });

  const llmResult = await callLLM({ prompt });
  const parsed = parseWithSchema(NavigatorResponseSchema, llmResult.content);

  return {
    assistantReply: parsed.assistant_reply,
    slotUpdates: parsed.slot_updates ?? {},
    intent: parsed.intent,
    nextAgent: parsed.next_agent,
    metadata: parsed.metadata,
  };
};
