import { Engine, Store, ModelSummarizer, Retrieval, assembleContext, conservativeTokens, insist } from "../src/index.ts";
// Opt-in semantic benchmark; never read OpenCode credentials or call a provider by default.
const { OPTCHAT_EVAL_URL: url, OPTCHAT_EVAL_MODEL: model, OPTCHAT_EVAL_KEY: apiKey } = process.env;
insist(url && model, "EVAL_CONFIG", "Set OPTCHAT_EVAL_URL (OpenAI-compatible /chat/completions), OPTCHAT_EVAL_MODEL and optionally OPTCHAT_EVAL_KEY. This makes billable model calls.");
const trials = Number(process.env.OPTCHAT_EVAL_TRIALS ?? 3), contextTokens = Number(process.env.OPTCHAT_EVAL_CONTEXT ?? 32000);
insist(Number.isSafeInteger(trials) && trials >= 1 && trials <= 100 && Number.isSafeInteger(contextTokens) && contextTokens >= 8000, "EVAL_CONFIG", "Invalid trials or model context size");
const results: unknown[] = [];
const price = (value: string | undefined) => value === undefined ? null : Number(value);
const inputPrice = price(process.env.OPTCHAT_EVAL_INPUT_USD_PER_MILLION), outputPrice = price(process.env.OPTCHAT_EVAL_OUTPUT_USD_PER_MILLION);
insist([inputPrice, outputPrice].every(p => p === null || (Number.isFinite(p) && p >= 0)), "EVAL_CONFIG", "Model prices must be nonnegative numbers");
const cases = [
  { evidence: "Decision D-417: use Bun, not npm. Verified test result RUN-29: 23 passed, 0 failed. Proposed migration X-31 was NOT implemented. Open question: Windows support.", question: "State the runtime decision, verified result, proposal status and open question. Give exact IDs.", required: ["Bun", "D-417", "RUN-29", "X-31", "Windows"] },
  { evidence: "Tool read returned exact identifier PAYMENT_RETRY_WINDOW_MS=73019. A proposed value 60000 was rejected. The deployment attempt failed with error E_CONN_84; there is no successful deployment.", question: "What is the exact retry constant and deployment outcome? Retrieve original evidence before answering.", required: ["PAYMENT_RETRY_WINDOW_MS", "73019", "E_CONN_84"] },
];
for (let trial = 0; trial < trials; trial++) for (const mode of ["isolated", "merged", "optchat"] as const) for (const [caseIndex, fixture] of cases.entries()) {
  const started = performance.now(), usage: any[] = []; let modelCalls = 0, retrievalCalls = 0, publicationLagMs = 0, phase = "answer";
  const invoke = async (messages: unknown[], tools?: unknown[]) => {
    const body = { model, messages, ...(tools ? { tools } : {}), max_tokens: 1024, stream: false };
    insist(conservativeTokens(body) + 1024 + 1000 <= contextTokens, "EVAL_BUDGET", "Complete benchmark request exceeds the configured model context and reserves");
    modelCalls++;
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(120000), headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(body) });
    insist(res.ok, "EVAL_PROVIDER", `Provider returned ${res.status}`); const value = await res.json() as any; usage.push({ phase, ...value.usage }); return value.choices[0].message;
  };
  const store = new Store();
  try {
    const engine = new Engine(store, new ModelSummarizer(async prompt => (await invoke([{ role: "user", content: prompt }])).content, model));
    engine.register("A", "evaluation", "fixture"); engine.register("B", "evaluation", "fixture");
    let messages: any[] = [{ role: "system", content: "Answer from available evidence. Distinguish proposals, attempts and verified outcomes. If evidence is unavailable, say so." }];
    const live = { role: "user", content: fixture.question };
    let tools: any[] | undefined, snapshot: ReturnType<Engine["admit"]>["snapshot"] | undefined;
    if (mode === "merged") messages.push({ role: "user", content: fixture.evidence }, { role: "assistant", content: "Historical session A exchange completed." });
    if (mode === "optchat") {
      phase = "compaction";
      engine.admit("A", "evidence"); engine.append({ sessionId: "A", generation: 0, turnId: "evidence", eventKey: "1", kind: "tool_result", payload: fixture.evidence, timestamp: "2026-10-09T00:00:00Z", projectId: "fixture", callId: "fixture" }); engine.finish("A", "evidence", "completed");
      const sealed = performance.now(); await engine.drain(); publicationLagMs = performance.now() - sealed; phase = "answer";
      snapshot = engine.admit("B", "question").snapshot;
      const context = assembleContext(engine, { system: [{ type: "text", text: messages[0].content }], live: [live], tools: {}, snapshot, budget: { contextTokens, outputTokens: 1024, safetyTokens: 1000, memoryBytes: 16000 } });
      messages = [{ role: "system", content: context.system.map(p => (p as { text: string }).text).join("\n") }];
      tools = [
        { type: "function", function: { name: "optchat_search", description: "Search visible historical evidence.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
        { type: "function", function: { name: "optchat_source", description: "Read exact original evidence by authorized source ID.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
        { type: "function", function: { name: "optchat_zoom", description: "Expand historical node into child nodes or original source ID.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
      ];
    }
    messages.push(live); let answer = "";
    for (let step = 0; step < 12; step++) {
      const message = await invoke(messages, tools); messages.push(message);
      if (!message.tool_calls?.length) { answer = message.content ?? ""; break; }
      const retrieval = new Retrieval(engine);
      for (const call of message.tool_calls) {
        retrievalCalls++; const args = JSON.parse(call.function.arguments); let result: unknown;
        try {
          insist(snapshot, "NOT_VISIBLE", "No OptChat snapshot");
          if (call.function.name === "optchat_search") result = retrieval.search(snapshot, args.query);
          else if (call.function.name === "optchat_source") result = retrieval.source(snapshot, args.id);
          else if (call.function.name === "optchat_zoom") result = retrieval.zoom(snapshot, args.id);
          else result = { error: "unknown tool" };
        } catch (error) { result = { error: String(error) }; }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    const measuredUsage = usage.every(u => Number.isFinite(u.prompt_tokens) && Number.isFinite(u.completion_tokens));
    const estimatedUsd = inputPrice !== null && outputPrice !== null && measuredUsage ? usage.reduce((sum, u) => sum + (u.prompt_tokens * inputPrice + u.completion_tokens * outputPrice) / 1e6, 0) : null;
    results.push({ trial, mode, caseIndex, answer, lexicalChecks: fixture.required.map(text => ({ text, present: answer.includes(text) })), needsHumanOutcomeReview: true, modelCalls, retrievalCalls, usage, measuredUsage, estimatedUsd, publicationLagMs, elapsedMs: performance.now() - started });
  } finally { store.close(); }
}
const report = { model, trials, note: "Lexical checks are not semantic correctness. Review outcome fidelity, isolation and hallucinations manually. This small dataset does not establish general recall or cost advantages.", results };
await Bun.write("evaluation-results.json", JSON.stringify(report, null, 2)); console.log("Wrote evaluation-results.json (contains model outputs; review before sharing).");
