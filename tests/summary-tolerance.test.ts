import { expect, test } from "bun:test";
import { ModelSummarizer, summaryFits } from "../src/compactor/summarizer.ts";
import { Engine } from "../src/core/engine.ts";
import { Store } from "../src/storage/store.ts";

test("summary tolerance measures UTF-8 bytes and requires reduction above the target", async () => {
  for (const size of [512, 513, 537, 640, 641]) {
    expect(summaryFits("x".repeat(size), "y".repeat(1000))).toBe(size <= 640);
  }
  expect(summaryFits("😀".repeat(160), "y".repeat(641))).toBe(true);
  expect(summaryFits("😀".repeat(161), "y".repeat(1000))).toBe(false);
  expect(summaryFits("x".repeat(537), "y".repeat(537))).toBe(false);
  expect(summaryFits("x".repeat(537), "y".repeat(536))).toBe(false);
  let calls = 0;
  const model = new ModelSummarizer(async prompt => { calls++; expect(prompt).toContain("at most 512 UTF-8 bytes"); return "x".repeat(537); }, "fixture");
  expect((await model.summarize("y".repeat(1000))).text.length).toBe(537);
  expect(calls).toBe(1);
  await expect(new ModelSummarizer(async () => "x".repeat(537), "fixture", 12000, 1, false, 512).summarize("y".repeat(1000))).rejects.toThrow("SUMMARY_SIZE");
  expect((await new ModelSummarizer(async () => "x".repeat(700), "fixture", 12000, 1, false, 768).summarize("y".repeat(1000))).text.length).toBe(700);
  for (const value of [511, 640.5, NaN, Infinity]) expect(() => new ModelSummarizer(async () => "ok", "fixture", 12000, 1, false, value)).toThrow("CONFIG");
});

test("batch tolerance checks each input independently", async () => {
  const model = new ModelSummarizer(async () => JSON.stringify([{ id: 0, text: "x".repeat(640) }, { id: 1, text: "y".repeat(537) }]), "fixture", 12000, 1);
  expect((await model.summarizeBatch(["a".repeat(1000), "b".repeat(538)])).map(r => r.text.length)).toEqual([640, 537]);
  await expect(model.summarizeBatch(["a".repeat(1000), "b".repeat(537)])).rejects.toThrow("SUMMARY_BATCH_INVALID");
});

test("engine accepts durable tolerant summaries and preserves them under a lower future limit", async () => {
  const store = new Store(":memory:");
  try {
    const model = new ModelSummarizer(async () => "x".repeat(537), "fixture");
    const engine = new Engine(store, model);
    engine.register("a", "scope", "project"); engine.admit("a", "turn");
    for (let i = 0; i < 2; i++) engine.append({ sessionId: "a", generation: 0, eventKey: String(i), turnId: "turn", kind: "assistant", timestamp: "2026-10-10T00:00:00Z", projectId: "project", payload: "y".repeat(25000) });
    engine.finish("a", "turn", "completed"); await engine.drain();
    const before = store.db.query("SELECT value FROM nodes ORDER BY id").all();
    expect(before.length).toBeGreaterThan(4);
    expect(store.all("publications")).toHaveLength(1);
    const strict = new Engine(store, model, { summaryAcceptBytes: 512 });
    expect(strict.repairInvalidSummaries("scope")).toBe(0);
    strict.repairDanglingJobs("scope");
    expect(store.db.query("SELECT value FROM nodes ORDER BY id").all()).toEqual(before);
  } finally { store.close(); }
});

test("engine rejects custom summarizers outside its configured tolerance", async () => {
  for (const [size, tolerance] of [[641, 640], [537, 512]]) {
    const store = new Store(":memory:");
    try {
      const engine = new Engine(store, { summarize: async () => ({ text: "x".repeat(size!), model: "custom", promptVersion: "test", fallback: false }) }, { summaryAcceptBytes: tolerance });
      engine.register("a", "scope", "project"); engine.admit("a", "turn");
      engine.append({ sessionId: "a", generation: 0, eventKey: "one", turnId: "turn", kind: "assistant", timestamp: "2026-10-10T00:00:00Z", projectId: "project", payload: "y".repeat(1000) });
      await expect(engine.workOne()).rejects.toThrow("SUMMARY_SIZE");
      expect(store.db.query("SELECT id FROM nodes").all()).toHaveLength(0);
    } finally { store.close(); }
  }
});
