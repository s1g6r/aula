import { describe, expect, it } from "vitest";
import { pickModelFor } from "./routing";

const models = { fast: { model: "qwen", cost: 1 }, quality: { model: "gemma", cost: 2 } };

describe("pickModelFor", () => {
  it("uses the fast model for widely spoken languages", () => {
    expect(pickModelFor(["es", "ar", "zh-Hans", "vi"], models)).toEqual(models.fast);
  });

  it.each(["so", "ht", "fa-AF", "hi"])("uses the stronger model when %s is in the call", (lang) => {
    expect(pickModelFor(["es", lang], models)).toEqual(models.quality);
  });
});
