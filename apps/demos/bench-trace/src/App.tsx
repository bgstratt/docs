import { useRef, useState } from "react";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";
import { SiteBrand } from "../../../../shared/ui/SiteBrand";
import {
  runBench,
  type BenchProgress,
  type BenchResult,
  type SliceMeta,
  type TraceEdit
} from "./lib/benchRunner";

type RunState = "idle" | "loading-trace" | "running" | "done" | "error";

/** One benchmark pass: production behavior signs every node; unsigned skips
 *  Ed25519 so the bar isolates engine cost from crypto cost. */
type SignMode = "signed" | "unsigned";
/** Dropdown selection: a single pass, or both back-to-back (they share one
 *  wasm heap, so they run sequentially — never concurrently). */
type RunMode = SignMode | "both";

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

const RUN_MODES: { value: RunMode; label: string }[] = [
  { value: "signed", label: "Signed ops (production default)" },
  { value: "unsigned", label: "Unsigned ops (engine only)" },
  { value: "both", label: "Both — signed then unsigned" }
];

const MODE_META: Record<SignMode, { barLabel: string; fillClass: string }> = {
  unsigned: { barLabel: "This browser — unsigned (WASM)", fillClass: "nm-benchbar-fill-browser-unsigned" },
  signed: { barLabel: "This browser — signed (WASM)", fillClass: "nm-benchbar-fill-browser" }
};

// Native engine reference on this exact trace (core/tests/b4_editing_trace.rs,
// x86-64 release build; see nodalmerge/benchmarks/benchmarks.md). The native
// harness matches the JS-CRDT convention of unsigned nodes, so it compares
// most directly against the browser's *unsigned* pass; the signed pass adds
// an Ed25519 signature per node on top.
const NATIVE_REFERENCE = {
  opsPerSec: 294_654,
  totalMs: 882,
  label: "Native engine (x86-64) — unsigned",
  host: "AMD Ryzen 9 5900X desktop — recorded separately, not on this device"
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

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`);
const usPerOp = (opsPerSec: number) => (1_000_000 / Math.max(1, opsPerSec)).toFixed(1);

export default function App() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [sliceFile, setSliceFile] = useState(SLICES[0].file);
  const [runMode, setRunMode] = useState<RunMode>("signed");
  const [progress, setProgress] = useState<BenchProgress | null>(null);
  const [activePass, setActivePass] = useState<SignMode | null>(null);
  // Latest result per mode, for the currently selected trace slice. Results
  // from different slices are not comparable, so switching slices clears it.
  const [results, setResults] = useState<Partial<Record<SignMode, BenchResult>>>({});
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const busy = runState === "loading-trace" || runState === "running";

  function selectSlice(file: string) {
    setSliceFile(file);
    setResults({});
    setProgress(null);
    setActivePass(null);
    setRunState("idle");
    setError(null);
  }

  async function startRun() {
    if (busy) {
      return; // run guard: a run is already in progress
    }
    const runId = ++runIdRef.current;
    const passes: SignMode[] = runMode === "both" ? ["signed", "unsigned"] : [runMode];
    setRunState("loading-trace");
    setError(null);
    setProgress(null);
    // Clear only the modes about to be re-run; the other mode's bar (if any)
    // stays for comparison.
    setResults((prev) => {
      const next = { ...prev };
      for (const p of passes) delete next[p];
      return next;
    });
    try {
      const [meta, edits] = await Promise.all([loadMeta(), loadTrace(sliceFile)]);
      const expected = meta[sliceFile];
      if (!expected) {
        throw new Error(`no expected results for ${sliceFile}`);
      }
      setRunState("running");
      for (const pass of passes) {
        setActivePass(pass);
        setProgress(null);
        const outcome = await runBench(
          edits,
          expected,
          bridgeWasmUrl,
          (p) => setProgress(p),
          () => runIdRef.current !== runId,
          { unsigned: pass === "unsigned" }
        );
        if (runIdRef.current !== runId) {
          return;
        }
        if (!outcome) {
          setRunState("idle");
          setActivePass(null);
          return;
        }
        setResults((prev) => ({ ...prev, [pass]: outcome }));
      }
      setActivePass(null);
      setRunState("done");
    } catch (err) {
      if (runIdRef.current === runId) {
        setError(err instanceof Error ? err.message : String(err));
        setRunState("error");
        setActivePass(null);
      }
    }
  }

  const pct = progress ? Math.round((progress.opsApplied / progress.opCount) * 100) : 0;
  const activeSlice = SLICES.find((s) => s.file === sliceFile) ?? SLICES[0];

  // Bars render for whichever modes have a result, plus the native reference.
  const doneModes = (["unsigned", "signed"] as SignMode[]).filter((m) => results[m]);
  const anyResult = doneModes.length > 0;
  const opsApplied = anyResult ? results[doneModes[0]]!.opsApplied : 0;
  const nativeMs = (opsApplied / NATIVE_REFERENCE.opsPerSec) * 1000;
  const throughputRows = [
    { label: NATIVE_REFERENCE.label, opsPerSec: NATIVE_REFERENCE.opsPerSec, elapsedMs: nativeMs, fillClass: "nm-benchbar-fill-native" },
    ...doneModes.map((m) => ({
      label: MODE_META[m].barLabel,
      opsPerSec: results[m]!.opsPerSec,
      elapsedMs: results[m]!.elapsedMs,
      fillClass: MODE_META[m].fillClass
    }))
  ];
  const maxOps = Math.max(...throughputRows.map((r) => r.opsPerSec));
  const maxMs = Math.max(...throughputRows.map((r) => r.elapsedMs));

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <SiteBrand href="https://nodalmerge.com/demos" />
        <h1 className="nm-page-title">Engine benchmark — live in your browser</h1>
        <p className="nm-page-desc">
          Replay a real collaborative-editing trace (the automerge-perf B4 dataset: 259,778
          single-character edits) through the NodalMerge WASM engine, right here. Every edit becomes a
          CRDT operation in a hash-linked DAG — signed with Ed25519 in production mode, or unsigned to
          isolate the engine itself — and the final document is verified byte-for-byte by SHA-256
          against the expected text.
        </p>
      </header>

      <div className="nm-content">
      <section className="nm-controls">
        <label className="nm-label" htmlFor="slice">Trace</label>
        <select
          id="slice"
          className="nm-input"
          value={sliceFile}
          onChange={(event) => selectSlice(event.target.value)}
          disabled={busy}
        >
          {SLICES.map((slice) => (
            <option key={slice.file} value={slice.file}>
              {slice.label}
            </option>
          ))}
        </select>
        <label className="nm-label" htmlFor="mode">Ops</label>
        <select
          id="mode"
          className="nm-input"
          value={runMode}
          onChange={(event) => setRunMode(event.target.value as RunMode)}
          disabled={busy}
        >
          {RUN_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <button type="button" className="nm-btn nm-btn-primary" onClick={() => void startRun()} disabled={busy}>
          {runState === "loading-trace" ? "Loading trace…" : runState === "running" ? "Running…" : "Run benchmark"}
        </button>
        <p className="nm-controls-hint">
          {activeSlice.description} Runs entirely client-side in WASM — nothing is sent to a server.
          Passes share one WASM heap, so “Both” runs signed and unsigned back-to-back, never concurrently.
        </p>
      </section>

      <section className="nm-layout-2col">
        <article className="nm-card">
          <h2 className="nm-card-title">Run</h2>
          {progress ? (
            <>
              {activePass ? (
                <p className="nm-section-label">
                  {activePass === "signed" ? "Signed pass (Ed25519 per node)" : "Unsigned pass (engine only)"}
                </p>
              ) : null}
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
              {runState === "loading-trace" ? "Fetching trace…" : anyResult ? null : "No run yet. Pick a trace and hit Run."}
            </p>
          )}
          {error ? <p className="nm-p-warning">Run failed: {error}</p> : null}
          {anyResult ? (
            <div>
              {doneModes.map((m) => {
                const r = results[m]!;
                return (
                  <p key={m} className={`nm-notice ${r.converged ? "nm-notice-online" : "nm-notice-offline"}`}>
                    {r.converged
                      ? `✓ ${m === "signed" ? "Signed" : "Unsigned"} pass converged — ${r.opsApplied.toLocaleString()} ops in ${fmtMs(r.elapsedMs)} (${r.opsPerSec.toLocaleString()} ops/sec); SHA-256 matches the expected text exactly.`
                      : `✗ ${m === "signed" ? "Signed" : "Unsigned"} pass hash mismatch — the replayed document does not match the expected text.`}
                  </p>
                );
              })}

              <p className="nm-section-label">Same engine, {throughputRows.length} configurations</p>
              <p className="nm-card-desc nm-benchbar-caption">
                The native bar is a fixed reference from {NATIVE_REFERENCE.host}, not a live
                measurement of your device — the browser bars below it are running on whatever
                you're reading this on right now, so treat the native/browser gap as
                order-of-magnitude, not a controlled same-host comparison.
              </p>
              <p className="nm-card-desc nm-benchbar-caption">Throughput — longer is faster:</p>
              <div className="nm-benchbars">
                {throughputRows.map((row) => (
                  <div className="nm-benchbar-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className="nm-benchbar-track">
                      <div
                        className={`nm-benchbar-fill ${row.fillClass}`}
                        style={{ width: `${Math.max(1, Math.min(100, (row.opsPerSec / maxOps) * 100))}%` }}
                      />
                      <span className={`nm-benchbar-value ${row.opsPerSec === maxOps ? "nm-benchbar-value-onfill" : ""}`}>
                        {row.opsPerSec.toLocaleString()} ops/sec · {usPerOp(row.opsPerSec)} µs/op
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="nm-card-desc nm-benchbar-caption">
                Time to apply {opsApplied.toLocaleString()} ops — shorter is faster:
              </p>
              <div className="nm-benchbars">
                {throughputRows.map((row) => (
                  <div className="nm-benchbar-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className="nm-benchbar-track">
                      <div
                        className={`nm-benchbar-fill ${row.fillClass}`}
                        style={{ width: `${Math.max(1, Math.min(100, (row.elapsedMs / maxMs) * 100))}%` }}
                      />
                      <span className={`nm-benchbar-value ${row.elapsedMs === maxMs ? "nm-benchbar-value-onfill" : ""}`}>
                        {fmtMs(row.elapsedMs)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="nm-card-desc">
                All bars run identical engine code over identical per-edit DAG transactions — RGA
                insert, Blake3 hashing, DAG append, incremental caches — which is why every pass
                converges to the same SHA-256. The <em>unsigned</em> browser bar isolates the
                execution-environment gap versus native (WASM codegen, bounds-checked memory, the
                JS→WASM boundary per keystroke). The <em>signed</em> bar adds what production sync
                actually pays: an Ed25519 signature per node for authenticated, attributable edits —
                integrity work the JS CRDT libraries this trace is usually benchmarked with don't do
                at all.
              </p>
            </div>
          ) : null}
        </article>

        <article className="nm-card">
          <h2 className="nm-card-title">What this shows</h2>
          <ul className="nm-event-list">
            <li>Every keystroke in the trace becomes a CRDT text op applied to the engine's RGA sequence.</li>
            <li>The run is deterministic: any peer replaying these ops converges to the identical document — that's what the hash check proves.</li>
            <li>Signed mode is what production peers do: every node carries an Ed25519 signature. Unsigned mode strips only the signature, isolating engine cost from crypto cost.</li>
            <li>All work happens in your browser's WASM sandbox; reloading and re-running is free and creates zero server load.</li>
            <li>The trace is the automerge-perf B4 editing session — a real person writing a real LaTeX paper.</li>
          </ul>
        </article>
      </section>
      </div>
    </main>
  );
}
