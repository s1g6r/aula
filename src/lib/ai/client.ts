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
  // Time until the first token arrived.
  ttftMs: number | null;
  // [characters received so far, ms since start] after each streamed chunk.
  // Lets us work out when each language's part of the reply was complete.
  marks: [number, number][];
  promptTokens?: number;
  completionTokens?: number;
};

// Streams the reply. `onText` is called with the full text so far after each
// chunk, which is how the pipeline sends a language to students as soon as
// its part of the JSON is finished instead of waiting for the whole reply.
export async function chatComplete(
  client: OpenAI,
  opts: {
    model: string;
    messages: ChatMessage[];
    maxTokens: number;
    jsonMode: boolean;
    signal?: AbortSignal;
    onText?: (textSoFar: string) => void;
  },
): Promise<ChatResult> {
  const started = performance.now();
  const stream = await client.chat.completions.create(
    {
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
      ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    },
    { signal: opts.signal },
  );

  let text = "";
  let ttftMs: number | null = null;
  const marks: [number, number][] = [];
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      const now = performance.now() - started;
      if (ttftMs === null) ttftMs = now;
      text += delta;
      marks.push([text.length, now]);
      opts.onText?.(text);
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens;
      completionTokens = chunk.usage.completion_tokens;
    }
  }

  return { text, ms: performance.now() - started, ttftMs, marks, promptTokens, completionTokens };
}
