import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(projectRoot, "dist");
if (path.dirname(outputRoot) !== projectRoot || path.basename(outputRoot) !== "dist") {
  throw new Error("Unexpected extension build destination.");
}

const runtimeFiles = [
  "manifest.json",
  "src/shared/core.js",
  "src/providers/jev-client.js",
  "src/providers/llm-router.js",
  "src/providers/tavily-client.js",
  "src/background/cache-service.js",
  "src/background/service-worker.js",
  "src/content/x-dom-adapter.js",
  "src/content/weibo-dom-adapter.js",
  "src/content/overlay.js",
  "src/content/auto-scroller.js",
  "src/content/index.js",
  "options/index.html",
  "options/options.css",
  "options/options.js"
];

async function listFiles(directory, prefix = "") {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("The extension build folder cannot contain symbolic links.");
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    else files.push(relativePath);
  }
  return files;
}

const allowlist = new Set(runtimeFiles);
const unexpectedFiles = (await listFiles(outputRoot)).filter((relativePath) => !allowlist.has(relativePath));
if (unexpectedFiles.length) {
  throw new Error("The dist folder contains files outside the runtime allowlist. Move them out before building to prevent accidental packaging.");
}

await fs.mkdir(outputRoot, { recursive: true });
for (const relativePath of runtimeFiles) {
  if (relativePath === "src/background/service-worker.js") continue;
  const source = path.join(projectRoot, relativePath);
  const target = path.join(outputRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

await build({
  entryPoints: [path.join(projectRoot, "src/background/service-worker.mjs")],
  outfile: path.join(outputRoot, "src/background/service-worker.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["chrome102"],
  sourcemap: false
});

const manifest = JSON.parse(await fs.readFile(path.join(outputRoot, "manifest.json"), "utf8"));
const referencedFiles = [
  manifest.background.service_worker,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((script) => script.js)
];
for (const relativePath of referencedFiles) {
  await fs.access(path.join(outputRoot, relativePath));
}
console.log(`Built Chrome extension in ${path.relative(projectRoot, outputRoot)} (${runtimeFiles.length} files; no .env or test fixtures).`);
