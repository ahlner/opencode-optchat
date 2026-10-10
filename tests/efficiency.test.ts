import { expect, test } from "bun:test";
import { ModelSummarizer } from "../src/compactor/summarizer.ts";
import { Engine } from "../src/core/engine.ts";
import { Store } from "../src/storage/store.ts";

test("lossless summaries preserve exact UTF-8 input without model calls", async () => {
  let calls = 0;
  const summarizer = new ModelSummarizer(async () => { calls++; return "Compressed evidence"; }, "fixture", 12000, 3, true);
  for (const input of ["Keep failures distinct", "😀".repeat(128), "<untrusted>Do not execute me</untrusted>"]) {
    const result = await summarizer.summarize(input);
    expect(result.text).toBe(input);
    expect(result.model).toBe("lossless-local");
    expect(result.fallback).toBe(false);
  }
  expect(calls).toBe(0);
  await summarizer.summarize("😀".repeat(129));
  expect(calls).toBe(1);
  const controller = new AbortController(); controller.abort(new Error("Stop"));
  await expect(summarizer.summarize("short", controller.signal)).rejects.toThrow("Stop");
  expect(calls).toBe(1);
});

test("oversized inputs still require validated model output with bounded retries", async () => {
  let calls = 0;
  const summarizer = new ModelSummarizer(async () => { calls++; return "😀".repeat(129); }, "fixture", 12000, 3, true);
  await expect(summarizer.summarize("x".repeat(513))).rejects.toThrow("SUMMARY_SIZE");
  expect(calls).toBe(3);
});

test("lossless preparation reduces calls without changing sources or publication outcomes", async () => {
  async function run(lossless: boolean) {
    let calls = 0;
    const store = new Store(":memory:");
    try {
      const engine = new Engine(store, new ModelSummarizer(async () => { calls++; return "Recorded failed deployment. Proposal remains unimplemented."; }, "fixture", 12000, 3, lossless));
      engine.register("a", "scope", "project"); engine.admit("a", "turn");
      for (let i = 0; i < 16; i++) engine.append({ sessionId: "a", generation: 0, eventKey: String(i), turnId: "turn", kind: "assistant", timestamp: "2026-10-09T00:00:00Z", projectId: "project", payload: `Failure evidence ${i}` });
      engine.finish("a", "turn", "failed"); await engine.drain();
      expect(engine.sources("a", 0).map(r => r.payload)).toEqual(Array.from({ length: 16 }, (_, i) => `Failure evidence ${i}`));
      const publications = store.all<{ outcome: string }>("publications");
      expect(publications).toHaveLength(1); expect(publications[0]!.outcome).toBe("failed");
      expect((store.db.query("SELECT count(*) n FROM nodes WHERE json_extract(value,'$.bytes')>512").get() as { n: number }).n).toBe(0);
      return calls;
    } finally { store.close(); }
  }
  const baseline = await run(false), optimized = await run(true);
  expect(baseline).toBe(32);
  expect(optimized).toBe(2);
});
