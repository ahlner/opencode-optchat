import { expect, test } from "bun:test";
import { archivedPaper, checkArchivedPaper, checkMarkdown, documentationFiles } from "../scripts/docs-check.ts";

test("documentation check accepts short English prose and preserves uncertainty", () => {
  expect(checkMarkdown("# Limits\n\nThe request may have failed.\nCheck its recorded outcome.\n")).toEqual([]);
  expect(checkMarkdown("| Case | Result |\n| --- | --- |\n| A | The request may fail. |\n")).toEqual([]);
});
test("documentation check detects selected prose violations", () => {
  expect(checkMarkdown("Stop the request; retain originals.").map(f => f.rule)).toContain("semicolon");
  expect(checkMarkdown("The interface is seamless.").map(f => f.rule)).toContain("unsupported-adjective");
  expect(checkMarkdown("Spin up the service.").map(f => f.rule)).toContain("phrasal-verb");
  expect(checkMarkdown("Perform an analysis.").map(f => f.rule)).toContain("indirect-action");
  // Deliberate German text checks rejection. This is not repository documentation.
  expect(checkMarkdown("Die Prüfung wird nicht gestartet.").map(f => f.rule)).toContain("repository-language");
  expect(checkMarkdown(Array(26).fill("word").join(" ") + ".").map(f => f.rule)).toContain("sentence-length");
  expect(checkMarkdown(Array(7).fill("The test passed.").join(" ")).map(f => f.rule)).toContain("paragraph-length");
});
test("documentation check excludes code syntax, paths, and link targets", () => {
  expect(checkMarkdown("```ts\nconst value = 'ä';\n```\n\nUse `path/ä.ts` for the fixture.\n")).toEqual([]);
  expect(checkMarkdown("See [the source](https://example.org/ä;path).\n")).toEqual([]);
  expect(checkMarkdown("~~~json\n{\"text\":\"Prüfung\"}\n~~~\n")).toEqual([]);
  expect(checkMarkdown("```ts\nconst value = 1;\n").map(f => f.rule)).toContain("unclosed-code-block");
});
test("documentation check separates lists and code fence types", () => {
  expect(checkMarkdown(Array(8).fill("- Check the outcome.").join("\n"))).toEqual([]);
  expect(checkMarkdown("```text\n~~~\nDo not parse this; it is fixture text.\n```\n")).toEqual([]);
});

test("documentation discovery checks nested prose and preserves the archived paper", async () => {
  const files = await documentationFiles();
  expect(files).toContain("docs/paper/README.md");
  expect(files).not.toContain(archivedPaper.path);
  expect(await checkArchivedPaper()).toBe(true);
});
