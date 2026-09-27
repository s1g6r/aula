import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/lib/languages";
import { STUDENT_STRINGS_EN, studentStrings } from "./student";

describe("student interface translations", () => {
  it.each(LANGUAGES.map((l) => l.code))("%s has every string, with placeholders intact", (code) => {
    const t = studentStrings(code);
    for (const [key, en] of Object.entries(STUDENT_STRINGS_EN)) {
      const value = t[key as keyof typeof t];
      expect(value, key).toBeTruthy();
      expect(value.match(/\{\w+\}/g) ?? [], key).toEqual(en.match(/\{\w+\}/g) ?? []);
    }
    // Buttons really are translated, not English left behind.
    expect(t.lost).not.toBe(STUDENT_STRINGS_EN.lost);
  });

  it("falls back to English for unknown languages", () => {
    expect(studentStrings("xx").lost).toBe("I'm lost");
  });
});
