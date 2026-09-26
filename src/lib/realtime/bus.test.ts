import { describe, expect, it } from "vitest";
import { Bus, type StoredEvent } from "./bus";

const collect = () => {
  const got: StoredEvent[] = [];
  return { got, send: (e: StoredEvent) => got.push(e) };
};

describe("Bus", () => {
  it("delivers events only to the right audience", () => {
    const bus = new Bus("ep");
    const teacher = collect();
    const es = collect();
    const ar = collect();
    bus.subscribe("L", { role: "teacher", send: teacher.send });
    bus.subscribe("L", { role: "student", lang: "es", participantId: "p1", send: es.send });
    bus.subscribe("L", { role: "student", lang: "ar", participantId: "p2", send: ar.send });

    bus.publish("L", "segment", { seq: 1 });
    bus.publish("L", "translation", { seq: 1, lang: "es" }, { lang: "es" });
    bus.publish("L", "room", {}, "teacher");

    expect(teacher.got.map((e) => e.type)).toEqual(["segment", "room"]);
    expect(es.got.map((e) => e.type)).toEqual(["segment", "translation"]);
    expect(ar.got.map((e) => e.type)).toEqual(["segment"]);
  });

  it("gives buffered events increasing ids and ephemeral ones none", () => {
    const bus = new Bus("ep");
    expect(bus.publish("L", "segment", {}).id).toBe("ep-1");
    expect(bus.publish("L", "interim", {}, "all", { ephemeral: true }).id).toBeNull();
    expect(bus.publish("L", "segment", {}).id).toBe("ep-2");
  });

  it("replays what a reconnecting student missed, in order, for their language", () => {
    const bus = new Bus("ep");
    bus.publish("L", "segment", { seq: 1 });
    bus.publish("L", "translation", { seq: 1 }, { lang: "es" });
    bus.publish("L", "translation", { seq: 1 }, { lang: "ar" });
    bus.publish("L", "interim", {}, "all", { ephemeral: true });
    bus.publish("L", "segment", { seq: 2 });
    const missed = bus.replaySince("L", "ep-1", { role: "student", lang: "es" });
    expect(missed?.map((e) => e.id)).toEqual(["ep-2", "ep-4"]);
  });

  it("asks for a snapshot after a server restart or a gap older than the buffer", () => {
    const small = new Bus("ep", 3);
    for (let i = 0; i < 10; i++) small.publish("L", "segment", { seq: i });
    const sub = { role: "student" as const, lang: "es" };
    expect(small.replaySince("L", "ep-2", sub)).toBeNull(); // too old
    expect(small.replaySince("L", "ep-7", sub)?.length).toBe(3); // still buffered
    expect(small.replaySince("L", "old-7", sub)).toBeNull(); // restarted
    expect(small.replaySince("L", "ep-99", sub)).toBeNull(); // from the future
    expect(small.replaySince("L", "ep-10", sub)).toEqual([]); // up to date
  });

  it("keeps a dropped student's language active for the grace period", () => {
    let t = 0;
    const bus = new Bus("ep", 500, 60_000, () => t);
    const a = bus.subscribe("L", { role: "student", lang: "vi", participantId: "p1", send: () => {} });
    bus.subscribe("L", { role: "student", lang: "es", participantId: "p2", send: () => {} });
    bus.subscribe("L", { role: "student", lang: "es", participantId: "p3", send: () => {} });
    expect(bus.activeLangs("L")).toEqual(["es", "vi"]);

    a.unsubscribe(); // Wi-Fi drops
    t = 30_000;
    expect(bus.presence("L").langs).toEqual({ vi: 1, es: 2 });
    t = 61_000;
    expect(bus.activeLangs("L")).toEqual(["es"]);
  });

  it("counts a student with two tabs once and ignores English for translation", () => {
    const bus = new Bus("ep");
    bus.subscribe("L", { role: "student", lang: "en", participantId: "p1", send: () => {} });
    bus.subscribe("L", { role: "student", lang: "ar", participantId: "p2", send: () => {} });
    bus.subscribe("L", { role: "student", lang: "ar", participantId: "p2", send: () => {} });
    expect(bus.presence("L").students).toBe(2);
    expect(bus.activeLangs("L")).toEqual(["ar"]);
  });
});
