import { afterEach, describe, expect, it, vi } from "vitest";
import { serviceOffMessage, speechServiceName } from "./use-speech-recognition";

const UA = {
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0",
};
const as = (userAgent: string, maxTouchPoints = 0) => vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
afterEach(() => vi.unstubAllGlobals());

describe("speech service names", () => {
  it.each([
    [UA.chromeMac, "Google speech service"],
    [UA.safariMac, "Apple speech service"],
    [UA.safariIphone, "Apple speech service"],
    [UA.edge, "Microsoft speech service"],
  ])("names the right company", (ua, name) => {
    as(ua);
    expect(speechServiceName()).toBe(name);
  });
});

describe("speech recognition switched off (service-not-allowed)", () => {
  it("points iPhone users to Dictation and Speech Recognition in Settings", () => {
    as(UA.safariIphone, 5);
    expect(serviceOffMessage()).toMatch(/Dictation \(General > Keyboard\)/);
  });

  it("treats an iPad (which says it's a Mac) as a mobile device", () => {
    as(UA.safariMac, 5);
    expect(serviceOffMessage()).toMatch(/on this device/);
  });

  it("gives Mac Safari the System Settings path", () => {
    as(UA.safariMac);
    expect(serviceOffMessage()).toMatch(/System Settings/);
  });

  it("doesn't send Chrome users to Apple settings", () => {
    as(UA.chromeMac);
    expect(serviceOffMessage()).not.toMatch(/Dictation/);
  });
});
