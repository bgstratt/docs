// benchRunner — replays a B4 editing-trace slice through the NodalMerge WASM
// engine, fully client-side: the doc never connects to a host (autoConnect
// false), so runs create zero server load. Edits apply in chunks inside
// requestAnimationFrame ticks to keep the UI live; progress reports ops/sec.

import { createDoc } from "nodalmerge-sdk-js/doc";
import type { Doc } from "nodalmerge-sdk-js/doc";

export type TraceEdit = [pos: number, delCount: number, insert?: string];

export interface SliceMeta {
  opCount: number;
  finalLength: number;
  finalSha256: string;
}

export interface BenchProgress {
  opsApplied: number;
  opCount: number;
  elapsedMs: number;
  opsPerSec: number;
  docLength: number;
}

export interface BenchResult {
  opsApplied: number;
  elapsedMs: number;
  opsPerSec: number;
  finalLength: number;
  finalSha256: string;
  converged: boolean;
}

export const OPS_PER_CHUNK = 2_000;
const TEXT_KEY = "bench/doc";

export function summarize(opsApplied: number, elapsedMs: number): { opsPerSec: number } {
  return { opsPerSec: elapsedMs > 0 ? Math.round((opsApplied / elapsedMs) * 1000) : 0 };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

export interface RunOptions {
  /** Skip Ed25519 signing of each node — isolates engine cost from crypto
   *  cost. Only sane here because the doc never connects to a server. */
  unsigned?: boolean;
}

/**
 * Run the trace. A fresh local-only doc is created per run so results are
 * clean and memory from prior runs is released with the old wasm store.
 */
export async function runBench(
  edits: TraceEdit[],
  expected: SliceMeta,
  wasmModule: string,
  onProgress: (progress: BenchProgress) => void,
  shouldAbort?: () => boolean,
  options: RunOptions = {}
): Promise<BenchResult | null> {
  const doc: Doc = await createDoc({
    // Never dialed: autoConnect is off and connect() is never called.
    serverUrl: "ws://127.0.0.1:1",
    room: `bench-${Date.now()}`,
    wasmModule,
    autoConnect: false,
    transport: "ws-only",
    unsignedNodes: options.unsigned === true
  });

  try {
    const text = doc.text(TEXT_KEY);
    const started = performance.now();
    let applied = 0;

    while (applied < edits.length) {
      if (shouldAbort?.()) {
        return null;
      }
      const end = Math.min(applied + OPS_PER_CHUNK, edits.length);
      for (let i = applied; i < end; i++) {
        const [pos, delCount, insert] = edits[i];
        if (delCount > 0) {
          text.delete(pos, delCount);
        }
        if (typeof insert === "string" && insert.length > 0) {
          text.insert(pos, insert);
        }
      }
      applied = end;
      const elapsedMs = performance.now() - started;
      onProgress({
        opsApplied: applied,
        opCount: edits.length,
        elapsedMs,
        ...summarize(applied, elapsedMs),
        docLength: text.toString().length
      });
      await nextFrame();
    }

    const elapsedMs = performance.now() - started;
    const finalText = text.toString();
    const finalSha256 = await sha256Hex(finalText);
    return {
      opsApplied: applied,
      elapsedMs,
      ...summarize(applied, elapsedMs),
      finalLength: finalText.length,
      finalSha256,
      converged: finalText.length === expected.finalLength && finalSha256 === expected.finalSha256
    };
  } finally {
    doc.close();
  }
}
