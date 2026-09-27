import { describe, expect, it } from "vitest";
import { acceptFix } from "./fix";

const bio = ["photosynthesis", "cell membrane", "Calvin cycle", "carbon dioxide"];
const algebra = ["slope", "y-intercept"];

describe("acceptFix", () => {
  it("accepts a misheard key term", () => {
    expect(acceptFix("Water goes through the sell membrane first.", "Water goes through the cell membrane first.", bio)).toBe(true);
    expect(acceptFix("The why intercept is at negative three.", "The y-intercept is at negative three.", algebra)).toBe(true);
  });

  it("rejects rephrasing that doesn't repair a key term (seen in production)", () => {
    expect(acceptFix("Plants take in carbon dioxide from the air.", "Plants absorb carbon dioxide from the air.", bio)).toBe(false);
  });

  it("rejects identical text, big rewrites, and fixes when the teacher gave no key terms", () => {
    expect(acceptFix("The cell membrane.", "the cell membrane", bio)).toBe(false);
    expect(acceptFix("So basically the sell thing is like a gate for water and stuff okay", "The cell membrane controls what enters the cell.", bio)).toBe(false);
    expect(acceptFix("the sell membrane", "the cell membrane", [])).toBe(false);
  });
});
