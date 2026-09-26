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

// ---------------------------------------------------------------------------
// Streaming: find finished languages inside a reply that is still arriving.
//
// The model writes {"segments":[{"seq":4,"tr":{"es":{...},"ar":{...}}}]}.
// As soon as the closing brace of "es" arrives, Spanish-speaking students can
// see their line, even though Arabic is still being written. This scanner
// walks the partial text once, tracking where it is in the JSON, and reports
// every language object that is already closed (plus seq and fix values).

export type ScannedSegment = {
  seq?: number;
  fix?: string;
  // language code -> the raw JSON text of its finished object
  langs: Record<string, string>;
  // language code -> character offset just past its closing brace
  ends: Record<string, number>;
};

type Frame =
  | { kind: "obj"; key: string | null; expectingKey: boolean; start: number }
  | { kind: "arr"; index: number; start: number };

export function scanTranslationStream(text: string): ScannedSegment[] {
  const out: ScannedSegment[] = [];
  const stack: Frame[] = [];
  const seg = (k: number) => (out[k] ??= { langs: {}, ends: {} });

  // Is the top of the stack segments[k] (inside the root object)?
  const segmentIndex = (): number | null => {
    const [root, arr, obj] = stack;
    if (stack.length !== 3 || root.kind !== "obj" || root.key !== "segments" || arr.kind !== "arr" || obj.kind !== "obj") return null;
    return arr.index;
  };

  const onPrimitive = (value: unknown) => {
    const k = segmentIndex();
    const top = stack[stack.length - 1];
    if (k === null || top.kind !== "obj") return;
    if (top.key === "seq" && typeof value === "number") seg(k).seq = value;
    if (top.key === "fix" && typeof value === "string") seg(k).fix = value;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const top = stack[stack.length - 1];

    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (j >= text.length) break; // string still arriving
      const value = JSON.parse(text.slice(i, j + 1)) as string;
      if (top?.kind === "obj" && top.expectingKey) {
        top.key = value;
        top.expectingKey = false;
      } else {
        onPrimitive(value);
      }
      i = j + 1;
      continue;
    }
    if (c === "{") {
      stack.push({ kind: "obj", key: null, expectingKey: true, start: i });
    } else if (c === "[") {
      stack.push({ kind: "arr", index: 0, start: i });
    } else if (c === "}" || c === "]") {
      const closed = stack.pop();
      // A closed object that was the value of <lang> inside segments[k].tr
      const [root, arr, segObj, trMap] = stack;
      if (
        closed?.kind === "obj" &&
        stack.length === 4 &&
        root.kind === "obj" && root.key === "segments" &&
        arr.kind === "arr" &&
        segObj.kind === "obj" && segObj.key === "tr" &&
        trMap.kind === "obj" && trMap.key
      ) {
        seg(arr.index).langs[trMap.key] = text.slice(closed.start, i + 1);
        seg(arr.index).ends[trMap.key] = i + 1;
      }
    } else if (c === ",") {
      if (top?.kind === "obj") {
        top.expectingKey = true;
        top.key = null;
      } else if (top?.kind === "arr") {
        top.index++;
      }
    } else if (/[-0-9tfn]/.test(c)) {
      const m = text.slice(i).match(/^(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null)(?=[\s,}\]])/);
      if (!m) break; // literal still arriving
      onPrimitive(JSON.parse(m[1]));
      i += m[1].length;
      continue;
    }
    i++;
  }
  return out;
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
