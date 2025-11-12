import { getSupabaseAdmin } from "@/lib/supabase/server";

type LogStatus = "success" | "error";

type GenerationLogInput = {
  sessionId?: string;
  userId?: string;
  stage: string;
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  status?: LogStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export const logGeneration = async ({
  sessionId,
  userId,
  stage,
  provider,
  model,
  promptTokens,
  completionTokens,
  status = "success",
  errorMessage,
  metadata = {},
}: GenerationLogInput): Promise<void> => {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("generation_logs").insert({
      session_id: sessionId ?? null,
      user_id: userId ?? null,
      stage,
      provider,
      model,
      prompt_tokens: promptTokens ?? null,
      completion_tokens: completionTokens ?? null,
      status,
      error_message: errorMessage,
      metadata,
    });
  } catch (error) {
    console.error("Failed to write generation log", error);
  }
};
