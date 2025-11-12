import { env } from "./env";

type Provider = "openai" | "anthropic";

export type LLMOptions = {
  prompt: string;
  model?: string;
  providerHint?: Provider;
  maxTokens?: number;
  temperature?: number;
};

export type LLMResult = {
  content: string;
  provider: Provider;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

export const callLLM = async (options: LLMOptions): Promise<LLMResult> => {
  const provider = resolveProvider(options.providerHint);
  const model = options.model ?? env.FLOWLEARN_DEFAULT_MODEL;
  if (provider === "openai") {
    try {
      return await callOpenAI({ ...options, model });
    } catch (err) {
      if (env.ANTHROPIC_API_KEY) {
        return callAnthropic({ ...options, model: env.FLOWLEARN_FALLBACK_MODEL });
      }
      throw err;
    }
  } else {
    try {
      return await callAnthropic({ ...options, model });
    } catch (err) {
      if (env.OPENAI_API_KEY) {
        return callOpenAI({ ...options, model: env.FLOWLEARN_FALLBACK_MODEL });
      }
      throw err;
    }
  }
};

const resolveProvider = (hint?: Provider): Provider => {
  if (hint) return hint;
  if (env.OPENAI_API_KEY) return "openai";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  throw new Error("No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
};

const callOpenAI = async ({
  prompt,
  model,
  temperature = 0.3,
  maxTokens = 1200,
}: LLMOptions & { model: string }): Promise<LLMResult> => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText}`);
  }
  const data = await response.json();
  const choice = data.choices?.[0];
  let content = "";
  if (typeof choice?.message?.content === "string") {
    content = choice.message.content;
  } else if (Array.isArray(choice?.message?.content)) {
    content = choice.message.content.map((part: { text?: string }) => part.text ?? "").join("\n");
  }

  return {
    content: content.trim(),
    provider: "openai",
    model,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  };
};

const callAnthropic = async ({
  prompt,
  model,
  temperature = 0.3,
  maxTokens = 1200,
}: LLMOptions & { model: string }): Promise<LLMResult> => {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_output_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic request failed: ${errorText}`);
  }
  const data = await response.json();
  const content = Array.isArray(data.content)
    ? data.content
        .map((block: { text?: string }) => block.text ?? "")
        .join("\n")
        .trim()
    : "";

  return {
    content,
    provider: "anthropic",
    model,
    promptTokens: data.usage?.input_tokens,
    completionTokens: data.usage?.output_tokens,
  };
};
