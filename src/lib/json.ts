import type { ZodSchema } from "zod";

export const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
};

export const extractJsonObject = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
};

export const parseWithSchema = <T>(schema: ZodSchema<T>, text: string): T => {
  const jsonFragment = extractJsonObject(text);
  if (!jsonFragment) {
    throw new Error("LLM output did not contain a JSON object.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonFragment);
  } catch (err) {
    throw new Error(`Failed to parse LLM JSON: ${(err as Error).message}`);
  }
  return schema.parse(parsed);
};
