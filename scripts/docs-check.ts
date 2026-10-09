import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface Finding { line: number; rule: string; text: string }
export const archivedPaper = {
  path: "docs/paper/OptChat-Multi-Session-Paper.md",
  sha256: "a1c891f97c69628b9e9029c8acbb123d2a41d7508030f4a99c68c2158fac9f3e",
};

export async function documentationFiles(root = "."): Promise<string[]> {
  async function walk(directory: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walk(path));
      else if (entry.name.endsWith(".md") && path !== archivedPaper.path) files.push(path);
    }
    return files.sort();
  }
  return ["README.md", "AGENTS.md", "THIRD_PARTY_NOTICES.md", ...await walk("docs")];
}

export async function checkArchivedPaper(root = "."): Promise<boolean> {
  const file = Bun.file(join(root, archivedPaper.path));
  return await file.exists() && new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex") === archivedPaper.sha256;
}

// Selected structural checks only. This is not an ASD dictionary or a grammar parser.
export function checkMarkdown(markdown: string): Finding[] {
  const findings: Finding[] = [];
  let fence: string | undefined;
  let paragraph = "", paragraphLine = 0;
  const prose = (text: string) => text
    .replace(/`[^`]*`/g, "CODE")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "URL")
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/[*_]/g, "");
  function check(text: string, line: number) {
    const clean = prose(text);
    if (!clean.trim()) return;
    const report = (rule: string) => findings.push({ line, rule, text: clean.trim() });
    if (clean.includes(";")) report("semicolon");
    if (/[äöüÄÖÜß]|\b(?:nicht|Prüfung|Prüfungen|Veröffentlichung|wird|werden|hierzu|beziehungsweise|Benutzer|DEIN|ABSOLUTER|SCHLUESSEL)\b/.test(clean)) report("repository-language");
    if (/\b(?:seamless|robust|effortless|world-class|state-of-the-art|blazing-fast)\b/i.test(clean)) report("unsupported-adjective");
    if (/\b(?:spin up|reach out|dive into|kick off|circle back|touch base)\b/i.test(clean)) report("phrasal-verb");
    if (/\b(?:perform|conduct|carry out) (?:a|an|the) \w+(?:tion|sion|ment|ance|ence|ysis)\b/i.test(clean)) report("indirect-action");
    const sentences = clean.split(/[.!?](?:\s+|$)/).map(s => s.trim()).filter(Boolean);
    if (sentences.length > 6) report("paragraph-length");
    for (const sentence of sentences) {
      if (sentence.split(/\s+/).length > 25) findings.push({ line, rule: "sentence-length", text: sentence });
    }
  }
  function flush() {
    if (paragraph) check(paragraph, paragraphLine);
    paragraph = "";
  }
  for (const [index, raw] of markdown.split("\n").entries()) {
    const line = raw.trim();
    const marker = line.match(/^(`{3,}|~{3,})/);
    if (marker) {
      flush();
      if (!fence) fence = marker[1]![0];
      else if (marker[1]![0] === fence) fence = undefined;
      continue;
    }
    if (fence) continue;
    if (!line) { flush(); continue; }
    if (/^#{1,6} /.test(line)) { flush(); check(line.replace(/^#+ /, ""), index + 1); continue; }
    if (line.startsWith("|") && line.endsWith("|")) {
      flush();
      const cells = line.slice(1, -1).split(/(?<!\\)\|/).map(s => s.trim());
      if (!cells.every(s => /^:?-+:?$/.test(s))) for (const cell of cells) check(cell, index + 1);
      continue;
    }
    const item = line.match(/^(?:[-*+] |\d+[.)] )(.*)$/);
    if (item) { flush(); paragraphLine = index + 1; paragraph = item[1]!; continue; }
    if (!paragraph) paragraphLine = index + 1;
    paragraph += (paragraph ? " " : "") + line;
  }
  flush();
  if (fence) findings.push({ line: markdown.split("\n").length, rule: "unclosed-code-block", text: fence });
  return findings;
}

export async function checkDocumentation(): Promise<number> {
  const files = await documentationFiles();
  let count = 0;
  if (!await checkArchivedPaper()) {
    console.error(`${archivedPaper.path}: archived-paper-integrity: The original paper is missing or changed.`);
    count++;
  }
  for (const file of files) {
    for (const finding of checkMarkdown(await Bun.file(file).text())) {
      console.error(`${file}:${finding.line}: ${finding.rule}: ${finding.text}`);
      count++;
    }
  }
  if (!count) console.log(`Documentation checks passed for ${files.length} English Markdown files. Dictionary compliance requires manual review.`);
  return count;
}
if (import.meta.main) process.exitCode = (await checkDocumentation()) ? 1 : 0;
