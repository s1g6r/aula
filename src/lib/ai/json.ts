import type { z } from "zod";

// Models sometimes wrap JSON in ```json fences or prepend <think> blocks.
// Pull out the outermost {...} object before parsing.
export function extractJson(raw: string): unknown {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(text.slice(start, end + 1));
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseModelJson<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  let value: unknown;
  try {
    value = extractJson(raw);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, error: `schema mismatch: ${result.error.issues[0]?.message ?? "unknown"}` };
  }
  return { ok: true, data: result.data };
}
