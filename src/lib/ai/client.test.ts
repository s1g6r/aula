import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { chatComplete } from "./client";

// A fake OpenAI client that streams the given chunks and records whether we
// stopped reading early.
function fakeClient(chunks: string[]) {
  const state = { read: 0, aborted: false };
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => (state.aborted = true));
  const client = {
    chat: {
      completions: {
        create: async () => ({
          controller,
          async *[Symbol.asyncIterator]() {
            for (const c of chunks) {
              state.read++;
              yield { choices: [{ delta: { content: c } }] };
            }
          },
        }),
      },
    },
  } as unknown as OpenAI;
  return { client, state };
}

const opts = { model: "m", messages: [], maxTokens: 100, jsonMode: true };

describe("chatComplete", () => {
  it("stops reading once the JSON object is complete", async () => {
    const { client, state } = fakeClient(['{"es":', '"Hola"}', "   ", "more junk"]);
    const r = await chatComplete(client, opts);
    expect(r.text).toBe('{"es":"Hola"}');
    expect(state.read).toBe(2);
    expect(state.aborted).toBe(true);
  });

  it("stops reading when the model starts writing nothing but whitespace", async () => {
    const { client, state } = fakeClient(['{"es":"Hola",', " ".repeat(10), "\n\t".repeat(10), '"ar":"never"}']);
    const r = await chatComplete(client, opts);
    expect(r.text.startsWith('{"es":"Hola",')).toBe(true);
    expect(state.read).toBe(3);
  });
});
