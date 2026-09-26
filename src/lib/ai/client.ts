import OpenAI from "openai";
import type { ChatMessage } from "./prompts";

// Featherless speaks the OpenAI API, so we use the official client pointed at
// AI_BASE_URL. Swapping providers is a config change, not a code change.

export type AiConfig = {
  baseURL: string;
  apiKey: string;
  timeoutMs: number;
};

export function createAiClient(cfg: AiConfig): OpenAI {
  // Retries are ours to control (one retry on 429, see the pipeline), so the
  // SDK's own automatic retries are off.
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: cfg.timeoutMs, maxRetries: 0 });
}

export type ChatResult = {
  text: string;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
};

export async function chatComplete(
  client: OpenAI,
  opts: { model: string; messages: ChatMessage[]; maxTokens: number; jsonMode: boolean; signal?: AbortSignal },
): Promise<ChatResult> {
  const started = performance.now();
  const res = await client.chat.completions.create(
    {
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: 0.2,
      ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    },
    { signal: opts.signal },
  );
  return {
    text: res.choices[0]?.message?.content ?? "",
    ms: performance.now() - started,
    promptTokens: res.usage?.prompt_tokens,
    completionTokens: res.usage?.completion_tokens,
  };
}
