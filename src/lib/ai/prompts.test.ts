import { describe, expect, it } from "vitest";
import { buildTranslationMessages, TRANSLATE_SYSTEM } from "./prompts";

describe("buildTranslationMessages", () => {
  const msgs = buildTranslationMessages({
    subject: "Biology",
    title: "Photosynthesis",
    keyTerms: ["photosynthesis", "ATP"],
    context: ["Plants need light."],
    langs: ["es", "fa-AF"],
    segments: [{ seq: 4, text: "The Calvin cycle uses ATP." }],
    alreadyGlossed: { es: ["photosynthesis"] },
  });
  const user = msgs[1].content;

  it("keeps the system prompt fixed so it can be cached", () => {
    expect(msgs[0]).toEqual({ role: "system", content: TRANSLATE_SYSTEM });
  });

  it("includes subject, title and key terms", () => {
    expect(user).toContain("Subject: Biology");
    expect(user).toContain("Lesson: Photosynthesis");
    expect(user).toContain("Key terms: photosynthesis, ATP");
  });

  it("names the language variant, not just the code", () => {
    expect(user).toContain("es: Latin American Spanish (already glossed: photosynthesis)");
    expect(user).toContain("fa-AF: Dari (Afghan Persian, not Iranian Farsi)");
  });

  it("passes context separately from the segments to translate", () => {
    expect(user).toContain('context only, do not translate):\n"Plants need light."');
    expect(user).toContain('[{"seq":4,"en":"The Calvin cycle uses ATP."}]');
  });

  it("never contains anything but lesson text (no names, no ids)", () => {
    expect(user).not.toMatch(/nickname|student|participant/i);
  });
});
