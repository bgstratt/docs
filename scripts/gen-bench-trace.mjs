// gen-bench-trace.mjs — stage the B4 editing trace (automerge-perf, 259,778
// edits -> 104,852-char LaTeX doc) from the sibling nodalmerge repo into the
// bench-trace demo's public assets, plus precomputed expected results so the
// in-browser run can verify convergence by hash.
//
// Usage (from docs repo root):
//   node scripts/gen-bench-trace.mjs [path-to-b4-editing-trace.json]
//
// Outputs (committed):
//   apps/demos/bench-trace/public/b4-trace-50k.json   (first 50,000 edits)
//   apps/demos/bench-trace/public/b4-trace-full.json  (all edits)
//   apps/demos/bench-trace/public/b4-trace-meta.json  ({ slices: { key: { opCount, finalLength, finalSha256 } } })

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(docsRoot, "..", "nodalmerge", "benchmarks", "data", "b4-editing-trace.json");
const outDir = join(docsRoot, "apps", "demos", "bench-trace", "public");

console.log(`reading ${sourcePath} ...`);
const trace = JSON.parse(readFileSync(sourcePath, "utf8"));
if (!Array.isArray(trace.edits) || typeof trace.finalText !== "string") {
  throw new Error("unexpected trace shape: want { finalText, edits: [pos, delCount, insert?][] }");
}

/** Replay edits over a plain JS rope-ish array to derive the expected text. */
function replay(edits) {
  const chars = [];
  for (const [pos, delCount, insert] of edits) {
    if (delCount > 0) {
      chars.splice(pos, delCount);
    }
    if (typeof insert === "string" && insert.length > 0) {
      chars.splice(pos, 0, ...insert);
    }
  }
  return chars.join("");
}

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

mkdirSync(outDir, { recursive: true });

const SLICE_SIZE = 50_000;
const sliceEdits = trace.edits.slice(0, SLICE_SIZE);
const sliceText = replay(sliceEdits);
const fullText = replay(trace.edits);
if (fullText !== trace.finalText) {
  throw new Error("full replay does not match trace.finalText — replay logic or trace is wrong");
}

writeFileSync(join(outDir, "b4-trace-50k.json"), JSON.stringify({ edits: sliceEdits }));
writeFileSync(join(outDir, "b4-trace-full.json"), JSON.stringify({ edits: trace.edits }));
writeFileSync(
  join(outDir, "b4-trace-meta.json"),
  JSON.stringify(
    {
      source: "automerge-perf b4 editing trace (via nodalmerge/benchmarks/data/b4-editing-trace.json)",
      slices: {
        "b4-trace-50k.json": {
          opCount: sliceEdits.length,
          finalLength: sliceText.length,
          finalSha256: sha256(sliceText)
        },
        "b4-trace-full.json": {
          opCount: trace.edits.length,
          finalLength: fullText.length,
          finalSha256: sha256(fullText)
        }
      }
    },
    null,
    2
  )
);

console.log(`wrote ${outDir}\\b4-trace-50k.json (${sliceEdits.length} edits, final ${sliceText.length} chars)`);
console.log(`wrote ${outDir}\\b4-trace-full.json (${trace.edits.length} edits, final ${fullText.length} chars)`);
console.log("wrote b4-trace-meta.json");
