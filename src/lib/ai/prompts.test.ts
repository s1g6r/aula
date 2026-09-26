import { describe, expect, it } from "vitest";
import { buildGlossaryMessages, buildQuestionMessages, buildTranslationMessages, GLOSSARY_SYSTEM, TRANSLATE_SYSTEM } from "./prompts";

describe("buildTranslationMessages", () => {
  const msgs = buildTranslationMessages({
    subject: "Biology",
    title: "Photosynthesis",
    keyTerms: ["photosynthesis", "ATP", "cell membrane"],
    context: ["Plants need light."],
    langs: ["es", "fa-AF"],
    segments: [{ seq: 4, text: "The Calvin cycle uses ATP.", terms: ["ATP"] }],
  });
  const user = msgs[1].content;

  it("keeps the system prompt fixed so it can be cached", () => {
    expect(msgs[0]).toEqual({ role: "system", content: TRANSLATE_SYSTEM });
  });

  it("includes subject, title and the lesson's key terms", () => {
    expect(user).toContain("Subject: Biology");
    expect(user).toContain("Lesson: Photosynthesis");
    expect(user).toContain("Lesson key terms: photosynthesis, ATP, cell membrane");
  });

  it("names the language variant, not just the code", () => {
    expect(user).toContain("es: Latin American Spanish");
    expect(user).toContain("fa-AF: Dari (Afghan Persian, not Iranian Farsi)");
  });

  it("passes context separately and lists each segment's terms", () => {
    expect(user).toContain('context only, do not translate):\n"Plants need light."');
    expect(user).toContain('[{"seq":4,"en":"The Calvin cycle uses ATP.","terms":["ATP"]}]');
  });

  it("never contains anything but lesson text (no names, no ids)", () => {
    expect(user).not.toMatch(/nickname|student|participant/i);
  });
});

describe("buildGlossaryMessages", () => {
  it("asks for one language and lists the terms in order", () => {
    const [sys, user] = buildGlossaryMessages({ subject: "Algebra 1", terms: ["slope", "y-intercept"], lang: "vi" });
    expect(sys.content).toBe(GLOSSARY_SYSTEM);
    expect(user.content).toContain("Student's language: Vietnamese (vi)");
    expect(user.content).toContain('Terms: ["slope","y-intercept"]');
  });
});

describe("buildQuestionMessages", () => {
  it("tells the model to translate only, never answer", () => {
    const [sys, user] = buildQuestionMessages({ text: "¿Qué es el ATP?", lang: "es", subject: "Biology" });
    expect(sys.content).toMatch(/Never answer the question/);
    expect(user.content).toContain("Student's language: Latin American Spanish");
    expect(user.content).toContain('Message: "¿Qué es el ATP?"');
  });
});
