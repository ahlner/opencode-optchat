import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { strict as assert } from "node:assert";

// Local metadata inspection only. No registry, credentials, or model calls.
interface Entry {
  name: string; version: string; path: string; declaredLicense: string;
  notices: { file: string; sha256: string }[];
}
const entries: Entry[] = [];
const sha256 = (data: string) => new Bun.CryptoHasher("sha256").update(data).digest("hex");
const allowed = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "BlueOak-1.0.0", "(AFL-2.1 OR BSD-3-Clause)"]);
async function scan(directory: string): Promise<void> {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name.startsWith(".")) continue;
    const path = join(directory, item.name);
    if (item.name.startsWith("@")) { await scan(path); continue; }
    if (!item.isDirectory() && !item.isSymbolicLink()) continue;
    const metadataFile = Bun.file(join(path, "package.json"));
    if (!(await metadataFile.exists())) continue;
    const metadata = await metadataFile.json();
    assert.equal(typeof metadata.license, "string", `Missing license declaration: ${path}`);
    assert(allowed.has(metadata.license), `Review new license before release: ${path}: ${metadata.license}`);
    const notices: Entry["notices"] = [];
    for (const file of (await readdir(path)).filter(name => /^(licen[cs]e|copying|notice)([._-]|$)/i.test(name)).sort()) {
      notices.push({ file, sha256: sha256(await Bun.file(join(path, file)).text()) });
    }
    entries.push({ name: metadata.name, version: metadata.version, path, declaredLicense: metadata.license, notices });
    const nested = join(path, "node_modules");
    try { await readdir(nested); } catch (error: any) { if (error.code === "ENOENT") continue; throw error; }
    await scan(nested);
  }
}
await scan("node_modules");
entries.sort((a, b) => a.path.localeCompare(b.path));
const counts: Record<string, number> = {};
for (const entry of entries) counts[entry.declaredLicense] = (counts[entry.declaredLicense] ?? 0) + 1;
const inventory = JSON.stringify({
  reviewDate: "2026-10-09", lockfileSha256: sha256(await Bun.file("bun.lock").text()),
  scope: "Installed package metadata and root notice files. The review excludes uninstalled platform-specific artifacts. This inventory is not a legal certification.",
  packageInstances: entries.length, licenseCounts: counts, packages: entries,
}, null, 2) + "\n";
const output = "docs/dependency-licenses.json";
if (Bun.argv.includes("--write")) await Bun.write(output, inventory);
else assert.equal(await Bun.file(output).text(), inventory, "Dependency inventory changed. Review changes, then run audit:licenses --write.");
for (const file of ["dist/index.js.map", "dist/adapters/opencode/plugin.js.map", "dist/adapters/opencode/tui.js.map"]) {
  assert(await Bun.file(file).exists(), "Run bun run compile before auditing bundle contents");
  const map = await Bun.file(file).json();
  assert(map.sources.length > 0);
  for (const source of map.sources) assert(/^(\.\.\/)+src\//.test(source) && !source.includes("node_modules"), `Review bundled third-party source: ${file}: ${source}`);
}
console.log(JSON.stringify({ installedPackageInstances: entries.length, licenseCounts: counts, thirdPartyBundleSources: 0, inventory: output }, null, 2));
