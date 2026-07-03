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
