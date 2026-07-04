// PixelBoard — canvas renderer for the shared pixel grid. Two stacked
// canvases: the base layer paints palette cells from the store buffer; the
// overlay draws fading "convergence flash" rings where remote pixels landed.
// No per-pixel DOM. Pointer events so touch painting works.

import { useCallback, useEffect, useRef } from "react";
import { EMPTY_PIXEL, type PixelChange, type PixelStore } from "../lib/pixelStore";
import { GRID_SIZE, PALETTE } from "../lib/pixelCodec";

const FLASH_MS = 800;
const RENDER_SCALE = 8; // canvas backing pixels per grid cell

interface PixelBoardProps {
  store: PixelStore;
  onPaint: (x: number, y: number) => void;
  /** When set, render this snapshot instead of the live buffer and lock painting. */
  replayBuffer?: Uint8Array | null;
  /** Tooltip shown on the board while painting is locked by replay. */
  replayTooltip?: string;
}

interface Flash {
  x: number;
  y: number;
  at: number;
}

export function PixelBoard({ store, onPaint, replayBuffer = null, replayTooltip }: PixelBoardProps) {
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const flashesRef = useRef<Flash[]>([]);
  const rafRef = useRef<number | null>(null);
  const paintingRef = useRef(false);

  const repaintAll = useCallback(() => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    const source = replayBuffer ?? store.buffer;
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const v = source[y * GRID_SIZE + x];
        if (v === EMPTY_PIXEL) {
          continue;
        }
        ctx.fillStyle = PALETTE[v] ?? "#000000";
        ctx.fillRect(x * RENDER_SCALE, y * RENDER_SCALE, RENDER_SCALE, RENDER_SCALE);
      }
    }
  }, [store, replayBuffer]);

  const drawCell = useCallback((x: number, y: number, paletteIndex: number) => {
    const ctx = baseRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    // EMPTY_PIXEL = erased — paint the board background back in.
    ctx.fillStyle = paletteIndex === EMPTY_PIXEL ? "#0d1117" : PALETTE[paletteIndex] ?? "#000000";
    ctx.fillRect(x * RENDER_SCALE, y * RENDER_SCALE, RENDER_SCALE, RENDER_SCALE);
  }, []);

  const runOverlayLoop = useCallback(() => {
    if (rafRef.current !== null) {
      return;
    }
    const tick = () => {
      const canvas = overlayRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        rafRef.current = null;
        return;
      }
      const now = performance.now();
      flashesRef.current = flashesRef.current.filter((f) => now - f.at < FLASH_MS);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const flash of flashesRef.current) {
        const t = (now - flash.at) / FLASH_MS;
        const cx = flash.x * RENDER_SCALE + RENDER_SCALE / 2;
        const cy = flash.y * RENDER_SCALE + RENDER_SCALE / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, RENDER_SCALE * (0.7 + t * 2.2), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(96, 165, 250, ${(1 - t) * 0.9})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (flashesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    repaintAll();
    // This effect re-runs on every scrub tick (replayBuffer) and room switch,
    // and its cleanup cancels the rAF mid-fade — without this, in-flight
    // rings freeze on the overlay with nothing scheduled to clear them.
    if (flashesRef.current.length > 0) {
      runOverlayLoop();
    }
    const unsubscribe = store.subscribe((changes: PixelChange[], fullRefresh: boolean) => {
      if (replayBuffer) {
        // Frozen on a replay frame: live paints keep landing in the store and
        // are picked up by the next repaint, but don't disturb the snapshot.
        return;
      }
      if (fullRefresh) {
        repaintAll();
      } else {
        for (const change of changes) {
          drawCell(change.x, change.y, change.paletteIndex);
        }
      }
      const now = performance.now();
      let flashed = false;
      for (const change of changes) {
        if (change.source === "remote") {
          flashesRef.current.push({ x: change.x, y: change.y, at: now });
          flashed = true;
        }
      }
      if (flashed) {
        runOverlayLoop();
      }
    });
    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [store, replayBuffer, repaintAll, drawCell, runOverlayLoop]);

  function cellFromEvent(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = overlayRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_SIZE);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_SIZE);
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return null;
    }
    return { x, y };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (replayBuffer) {
      return;
    }
    paintingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = cellFromEvent(event);
    if (cell) {
      onPaint(cell.x, cell.y);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!paintingRef.current) {
      return;
    }
    const cell = cellFromEvent(event);
    if (cell) {
      onPaint(cell.x, cell.y);
    }
  }

  function handlePointerUp() {
    paintingRef.current = false;
  }

  const size = GRID_SIZE * RENDER_SCALE;
  return (
    <div className="nm-pixel-board">
      <canvas ref={baseRef} width={size} height={size} className="nm-pixel-layer" />
      <canvas
        ref={overlayRef}
        width={size}
        height={size}
        className="nm-pixel-layer nm-pixel-overlay"
        title={replayBuffer ? replayTooltip : undefined}
        style={replayBuffer ? { cursor: "not-allowed" } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
