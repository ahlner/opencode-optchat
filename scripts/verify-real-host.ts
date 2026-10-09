import { Database } from "bun:sqlite";
import { join } from "node:path";
import { strict as assert } from "node:assert";

// Offline verification. Does not call a model, OpenCode, or any network service.
export async function verifyRealHost(root: string, model: unknown, sessions: string[], fixture: any, decisionId: string, proposalId: string) {
  const [a, b] = sessions;
  const rawB = await Bun.file(join(root, "b-public.json")).json();
  const assistants = rawB.filter((m: any) => m.type === "assistant"), final = assistants.at(-1);
  const text = final.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
  const answer = JSON.parse((text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text).trim());
  // The runtime's name is case-insensitive, unlike exact constants, error codes and source IDs.
  assert.equal(String(answer.runtime).toLowerCase(), "bun"); assert.deepEqual(answer.retry, fixture.retry); assert.deepEqual(answer.deployment, fixture.deployment); assert.deepEqual(answer.verification, fixture.verification); assert.deepEqual(answer.proposal, { id: proposalId, implemented: false });
  const calls = assistants.flatMap((m: any) => m.content.filter((p: any) => p.type === "tool"));
  assert(calls.some((p: any) => p.name === "optchat_search" && p.state.status === "completed")); assert(calls.some((p: any) => p.name === "optchat_source" && p.state.status === "completed")); assert(!calls.some((p: any) => p.name === "fixture_probe"));
  const captures = (await Bun.file(join(root, "capture.ndjson")).text()).trim().split("\n").map(line => JSON.parse(line));
  const outgoingB = captures.filter(c => c.type === "primary" && c.sessionId === b);
  assert(outgoingB.length); assert(outgoingB.some(c => /bun/i.test(JSON.stringify(c.system)))); assert(outgoingB.every(c => !JSON.stringify(c.userMessages).includes(decisionId)), "A's prompt must not become B's conversational user history");
  assert(Array.isArray(answer.sourceIds) && answer.sourceIds.length);
  const db = new Database(join(root, "memory.sqlite"), { readonly: true });
  try {
    const source = (id: string) => { const r = db.query("SELECT value FROM sources WHERE id=?").get(id) as { value: string } | null; return r && JSON.parse(r.value); };
    const retrieved = new Set<string>(calls.filter((p: any) => p.name === "optchat_source" && p.state.status === "completed").map((p: any) => p.state.input.id));
    for (const id of answer.sourceIds) assert(source(id)?.sessionId === a && retrieved.has(id), "Cited originals must come from A and must have been read");
    assert([...retrieved].some(id => source(id)?.kind === "tool_result"), "B must read the original tool result, not only a summary or A's answer");
    assert((db.query("SELECT value FROM entities WHERE bucket='sessions'").all() as { value: string }[]).every(r => sessions.includes(JSON.parse(r.value).id)), "Unrelated managed-service sessions must not enter this scope");
  } finally { db.close(); }
  const report = { root, model, sessions, passed: true, answer, summaryCallsObserved: captures.filter(c => c.type === "summary").length, bPrimaryCalls: outgoingB.length, bTools: calls.map((p: any) => p.name), runtimeCaseNormalized: answer.runtime !== "Bun", note: "One real-model trial, not a repeated semantic benchmark. Runtime name case is ignored; numbers, identifiers, outcomes and read-original citations are checked exactly. Test sessions retained for inspection." };
  await Bun.write(join(root, "report.json"), JSON.stringify(report, null, 2)); return report;
}

if (import.meta.main) {
  const root = process.argv[2]; assert(root, "Supply a real-test diagnostic directory. This is offline and makes no model calls.");
  if (await Bun.file(join(root, "expected.json")).exists()) {
    const expected = await Bun.file(join(root, "expected.json")).json();
    console.log(JSON.stringify(await verifyRealHost(root, expected.model, expected.sessions, expected.fixture, expected.decisionId, expected.proposalId), null, 2));
  } else {
  const rawA = await Bun.file(join(root, "a-public.json")).json();
  const user = rawA.find((m: any) => m.type === "user").text;
  const probe = rawA.flatMap((m: any) => m.content ?? []).find((p: any) => p.type === "tool" && p.name === "fixture_probe" && p.state.status === "completed");
  const fixture = JSON.parse(probe.state.content.find((p: any) => p.type === "text").text);
  const failure = await Bun.file(join(root, "failure.json")).json();
  console.log(JSON.stringify(await verifyRealHost(root, failure.model, failure.sessions, fixture, user.match(/decision (D_\w+)/)[1], user.match(/proposal (P_\w+)/)[1]), null, 2));
  }
}
