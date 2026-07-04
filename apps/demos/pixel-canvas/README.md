# Pixel canvas demo

## Purpose

An r/place-style shared pixel board that showcases NodalMerge's offline-first
convergence story in the most visual way possible.

- **Per-pixel CRDT keys** — every pixel is a last-writer-wins register
  (`px/x,y` → `paletteIndex:authorShort`), so concurrent painters never
  clobber each other's unrelated pixels, and contested pixels resolve
  identically on every peer (lamport, then author pubkey tie-break).
- **Offline toggle** — flip yourself offline, keep painting (strokes queue in
  the local WASM store with a visible counter), then reconnect and watch both
  sides merge. Remote pixels flash with a blue ring as they land.
- **Canvas rendering** — one `<canvas>` layer for pixels (incremental cell
  paints, full repaint on bulk merges) plus an overlay canvas for the
  convergence-flash animation. No per-pixel DOM.
- Pointer events → mouse, touch, and pen all paint (including drag strokes).
- Share links (`?room=<id>`).

## Files

- `src/lib/pixelCodec.ts` — key/value codec + palette (vitest-covered).
- `src/lib/pixelStore.ts` — createDoc-backed store, palette-index buffer,
  fine-grained local/remote change feed.
- `src/components/PixelBoard.tsx` — canvas renderer + flash overlay.
- `src/App.tsx` — session, palette, offline toggle, room switching.

## Run locally

1. Start the demo host on `http://127.0.0.1:5074`
   (`apps/hosts/nodalmerge-demo-host`).
2. `npm install` here (and once at the repo root for the `shared/` layer),
   then `npm run dev`.
3. Open two tabs; paint in both.

## Validation checklist

- Two tabs paint concurrently → both boards converge.
- Tab A: Go offline → paint N pixels (badge counts them) → Go online →
  tab B receives them with flash rings; and vice versa.
- Contested pixel (painted in both tabs while A offline) shows the same
  winner in both tabs after reconnect.
- `npm test` — codec suite green. Note: the shared board resets when the
  demo server restarts (in-memory storage).
