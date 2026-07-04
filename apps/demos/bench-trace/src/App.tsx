import { useRef, useState } from "react";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";
import {
  runBench,
  type BenchProgress,
  type BenchResult,
  type SliceMeta,
  type TraceEdit
} from "./lib/benchRunner";

type RunState = "idle" | "loading-trace" | "running" | "done" | "error";

interface SliceOption {
  file: string;
  label: string;
  description: string;
}

const SLICES: SliceOption[] = [
  {
    file: "b4-trace-50k.json",
    label: "50,000 ops (quick)",
    description: "First 50k edits of the trace — loads fast, runs in a blink."
  },
  {
    file: "b4-trace-full.json",
    label: "Full trace — 259,778 ops",
    description: "The complete editing session: 260k single-character edits producing a 104,852-char LaTeX paper."
  }
];

// Native engine reference on this exact trace (core/tests/b4_editing_trace.rs,
// x86-64 release build; see nodalmerge/benchmarks/benchmarks.md). The native
// harness matches the JS-CRDT convention of unsigned nodes; the browser run
// additionally ed25519-signs every node.
const NATIVE_REFERENCE = {
  opsPerSec: 294_521,
  totalMs: 882,
  label: "Native engine (x86-64)"
};

const traceCache = new Map<string, TraceEdit[]>();
let metaCache: Record<string, SliceMeta> | null = null;

async function loadMeta(): Promise<Record<string, SliceMeta>> {
  if (!metaCache) {
    const res = await fetch(`${import.meta.env.BASE_URL}b4-trace-meta.json`);
    if (!res.ok) throw new Error(`meta fetch failed: ${res.status}`);
    metaCache = (await res.json()).slices as Record<string, SliceMeta>;
  }
  return metaCache;
}

async function loadTrace(file: string): Promise<TraceEdit[]> {
  const cached = traceCache.get(file);
  if (cached) {
    return cached;
  }
  const res = await fetch(`${import.meta.env.BASE_URL}${file}`);
  if (!res.ok) throw new Error(`trace fetch failed: ${res.status}`);
  const edits = (await res.json()).edits as TraceEdit[];
  traceCache.set(file, edits);
  return edits;
}

export default function App() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [sliceFile, setSliceFile] = useState(SLICES[0].file);
  const [progress, setProgress] = useState<BenchProgress | null>(null);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const busy = runState === "loading-trace" || runState === "running";

  async function startRun() {
    if (busy) {
      return; // run guard: a run is already in progress
    }
    const runId = ++runIdRef.current;
    setRunState("loading-trace");
    setResult(null);
    setError(null);
    setProgress(null);
    try {
      const [meta, edits] = await Promise.all([loadMeta(), loadTrace(sliceFile)]);
      const expected = meta[sliceFile];
      if (!expected) {
        throw new Error(`no expected results for ${sliceFile}`);
      }
      setRunState("running");
      const outcome = await runBench(
        edits,
        expected,
        bridgeWasmUrl,
        (p) => setProgress(p),
        () => runIdRef.current !== runId
      );
      if (runIdRef.current !== runId) {
        return;
      }
      if (outcome) {
        setResult(outcome);
        setRunState("done");
      } else {
        setRunState("idle");
      }
    } catch (err) {
      if (runIdRef.current === runId) {
        setError(err instanceof Error ? err.message : String(err));
        setRunState("error");
      }
    }
  }

  const pct = progress ? Math.round((progress.opsApplied / progress.opCount) * 100) : 0;
  const activeSlice = SLICES.find((s) => s.file === sliceFile) ?? SLICES[0];

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Engine benchmark — live in your browser</h1>
        <p className="nm-page-desc">
          Replay a real collaborative-editing trace (the automerge-perf B4 dataset: 259,778
          single-character edits) through the NodalMerge WASM engine, right here. Every edit becomes a
          signed CRDT operation in a hash-linked DAG — and the final document is verified byte-for-byte
          by SHA-256 against the expected text.
        </p>
      </header>

      <div className="nm-content">
      <section className="nm-controls">
        <label className="nm-label" htmlFor="slice">Trace</label>
        <select
          id="slice"
          className="nm-input"
          value={sliceFile}
          onChange={(event) => setSliceFile(event.target.value)}
          disabled={busy}
        >
          {SLICES.map((slice) => (
            <option key={slice.file} value={slice.file}>
              {slice.label}
            </option>
          ))}
        </select>
        <button type="button" className="nm-btn nm-btn-primary" onClick={() => void startRun()} disabled={busy}>
          {runState === "loading-trace" ? "Loading trace…" : runState === "running" ? "Running…" : "Run benchmark"}
        </button>
        <p className="nm-controls-hint">
          {activeSlice.description} Runs entirely client-side in WASM — nothing is sent to a server.
          Numbers vary by device and browser; the engine's native throughput on this trace is higher still.
        </p>
      </section>

      <section className="nm-layout-2col">
        <article className="nm-card">
          <h2 className="nm-card-title">Run</h2>
          {progress ? (
            <>
              <progress value={progress.opsApplied} max={progress.opCount} style={{ width: "100%" }} />
              <div className="nm-meta-bar">
                <span>ops: <code>{progress.opsApplied.toLocaleString()}</code> / {progress.opCount.toLocaleString()} ({pct}%)</span>
                <span>elapsed: <code>{(progress.elapsedMs / 1000).toFixed(2)}s</code></span>
                <span>throughput: <code>{progress.opsPerSec.toLocaleString()} ops/sec</code></span>
                <span>doc length: <code>{progress.docLength.toLocaleString()}</code></span>
              </div>
            </>
          ) : (
            <p className="nm-p-muted">
              {runState === "loading-trace" ? "Fetching trace…" : "No run yet. Pick a trace and hit Run."}
            </p>
          )}
          {error ? <p className="nm-p-warning">Run failed: {error}</p> : null}
          {result ? (
            <div>
              <p className={`nm-notice ${result.converged ? "nm-notice-online" : "nm-notice-offline"}`}>
                {result.converged
                  ? "✓ Converged — SHA-256 of the replayed document matches the expected text exactly."
                  : "✗ Hash mismatch — the replayed document does not match the expected text."}
              </p>
              <ul className="nm-event-list">
                <li>ops applied: <code>{result.opsApplied.toLocaleString()}</code></li>
                <li>total time: <code>{(result.elapsedMs / 1000).toFixed(2)}s</code></li>
                <li>throughput: <code>{result.opsPerSec.toLocaleString()} ops/sec</code> (in this browser, via WASM)</li>
                <li>final length: <code>{result.finalLength.toLocaleString()}</code> chars</li>
                <li>SHA-256: <code>{result.finalSha256.slice(0, 16)}…</code></li>
              </ul>

              <p className="nm-section-label">Same engine, two environments</p>
              <p className="nm-card-desc nm-benchbar-caption">Throughput — longer is faster:</p>
              <div className="nm-benchbars">
                <div className="nm-benchbar-row">
                  <span>{NATIVE_REFERENCE.label}</span>
                  <div className="nm-benchbar-track">
                    <div className="nm-benchbar-fill nm-benchbar-fill-native" style={{ width: "100%" }} />
                    <span className="nm-benchbar-value nm-benchbar-value-onfill">
                      {NATIVE_REFERENCE.opsPerSec.toLocaleString()} ops/sec · {(1_000_000 / NATIVE_REFERENCE.opsPerSec).toFixed(1)} µs/op
                    </span>
                  </div>
                </div>
                <div className="nm-benchbar-row">
                  <span>This browser (WASM)</span>
                  <div className="nm-benchbar-track">
                    <div
                      className="nm-benchbar-fill nm-benchbar-fill-browser"
                      style={{ width: `${Math.max(1, Math.min(100, (result.opsPerSec / NATIVE_REFERENCE.opsPerSec) * 100))}%` }}
                    />
                    <span className="nm-benchbar-value">
                      {result.opsPerSec.toLocaleString()} ops/sec · {(1_000_000 / Math.max(1, result.opsPerSec)).toFixed(1)} µs/op
                    </span>
                  </div>
                </div>
              </div>
              <p className="nm-card-desc nm-benchbar-caption">
                Time to apply {result.opsApplied.toLocaleString()} ops — shorter is faster:
              </p>
              <div className="nm-benchbars">
                {(() => {
                  const nativeMs = (result.opsApplied / NATIVE_REFERENCE.opsPerSec) * 1000;
                  const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`);
                  return (
                    <>
                      <div className="nm-benchbar-row">
                        <span>{NATIVE_REFERENCE.label}</span>
                        <div className="nm-benchbar-track">
                          <div
                            className="nm-benchbar-fill nm-benchbar-fill-native"
                            style={{ width: `${Math.max(1, Math.min(100, (nativeMs / result.elapsedMs) * 100))}%` }}
                          />
                          <span className="nm-benchbar-value">{fmt(nativeMs)}</span>
                        </div>
                      </div>
                      <div className="nm-benchbar-row">
                        <span>This browser (WASM)</span>
                        <div className="nm-benchbar-track">
                          <div className="nm-benchbar-fill nm-benchbar-fill-browser" style={{ width: "100%" }} />
                          <span className="nm-benchbar-value nm-benchbar-value-onfill">{fmt(result.elapsedMs)}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
              <p className="nm-card-desc">
                Identical engine code and identical per-edit DAG transactions — the gap is the
                execution environment, measured at ~{Math.max(1, Math.round(NATIVE_REFERENCE.opsPerSec / Math.max(1, result.opsPerSec)))}×
                here. Each browser op pays: a JS→WASM boundary crossing (string + call marshalling
                per keystroke), WASM codegen versus native x86-64 (no wide SIMD, bounds-checked
                memory), and an Ed25519 signature per node — the browser signs every op for
                authenticated sync, while the native benchmark row matches the unsigned convention
                of the JS CRDT libraries it's compared against. The engine work itself — RGA
                insert, Blake3 hashing, DAG append, incremental caches — is the same on both bars,
                which is why the hash check above converges identically.
              </p>
            </div>
          ) : null}
        </article>

        <article className="nm-card">
          <h2 className="nm-card-title">What this shows</h2>
          <ul className="nm-event-list">
            <li>Every keystroke in the trace becomes a CRDT text op applied to the engine's RGA sequence.</li>
            <li>The run is deterministic: any peer replaying these ops converges to the identical document — that's what the hash check proves.</li>
            <li>All work happens in your browser's WASM sandbox; reloading and re-running is free and creates zero server load.</li>
            <li>The trace is the automerge-perf B4 editing session — a real person writing a real LaTeX paper.</li>
          </ul>
        </article>
      </section>
      </div>
    </main>
  );
}
