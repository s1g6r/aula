import { describe, expect, it } from "vitest";
import { findKeyTerms, parseKeyTerms, repairKeyTerms } from "./terms";

describe("findKeyTerms", () => {
  const bio = ["photosynthesis", "chloroplast", "Calvin cycle", "ATP", "cell membrane"];

  it("finds terms the teacher said, and only those", () => {
    expect(findKeyTerms("Then the Calvin cycle uses that ATP.", bio)).toEqual(["Calvin cycle", "ATP"]);
    expect(findKeyTerms("Today we talk about photosynthesis.", bio)).toEqual(["photosynthesis"]);
  });

  it("tolerates plurals and punctuation", () => {
    expect(findKeyTerms("Tiny structures called chloroplasts, and...", bio)).toEqual(["chloroplast"]);
    expect(findKeyTerms("the processes", ["process"])).toEqual(["process"]);
  });

  it("matches whole words only", () => {
    expect(findKeyTerms("That was a catapult.", ["ATP"])).toEqual([]);
    expect(findKeyTerms("slopes and slopey hills", ["slope"])).toEqual(["slope"]);
  });

  it("treats hyphens and spaces the same", () => {
    expect(findKeyTerms("The y intercept is negative three.", ["y-intercept"])).toEqual(["y-intercept"]);
  });

  it("misses a misheard term (the model's fix handles that case)", () => {
    expect(findKeyTerms("through the sell membrane first", bio)).toEqual([]);
  });
});

describe("parseKeyTerms", () => {
  it("splits pasted slide text into clean terms", () => {
    expect(parseKeyTerms("photosynthesis, chlorophyll\n- Calvin cycle\n• ATP; atp\n1. glucose")).toEqual([
      "photosynthesis",
      "chlorophyll",
      "Calvin cycle",
      "ATP",
      "glucose",
    ]);
  });
});

describe("repairKeyTerms", () => {
  const terms = ["cell membrane", "y-intercept", "Calvin cycle", "photosynthesis"];

  it("repairs a sound-alike word inside a multi-word key term", () => {
    expect(repairKeyTerms("Water gets into the plant cells through the sell membrane.", terms)).toBe("Water gets into the plant cells through the cell membrane.");
    expect(repairKeyTerms("The why intercept is at negative three.", terms)).toBe("The y-intercept is at negative three.");
    expect(repairKeyTerms("Then the Kelvin cycle uses ATP.", terms)).toBe("Then the Calvin cycle uses ATP.");
    expect(repairKeyTerms("Then the calvin cycles use ATP.", terms)).toBeNull(); // a plural is not a mistake
  });

  it("leaves correct sentences and unrelated words alone", () => {
    expect(repairKeyTerms("The cell membrane is a gatekeeper.", terms)).toBeNull();
    expect(repairKeyTerms("We sell lemonade at the membrane of nothing.", terms)).toBeNull();
    expect(repairKeyTerms("Photo synthesis is how plants eat.", terms)).toBeNull(); // single-word terms aren't touched
  });
});
