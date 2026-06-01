# Collab text playground

Interactive demo for **RGA text operations** (`insertTextAt`, `deleteTextAt`, contiguous range paths) on a single shared key — separate from the infinite room workspace canvas demo.

## Run

1. Start `nodalmerge-demo-host` on `http://127.0.0.1:5074`.
2. From this folder:

```powershell
npm install
npm run install:local-sdk
npm run dev -- --host 127.0.0.1 --port 4177
```

3. Open `http://127.0.0.1:4177` — the page **auto-connects** to room **`collab-text`** (override with `VITE_DEFAULT_ROOM_ID`). Transport defaults to **`auto`** (WebSocket + WebRTC signal fallback via `VITE_TRANSPORT_MODE=auto`).

After changing `nodalmerge` bridge/SDK sources:

```powershell
# In nodalmerge repo
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
pwsh -File ./pack-local-artifacts.ps1 -Version 0.1.0-local -SkipNuGet -SkipCrates
```

Then in this app: `npm run install:local-sdk`

Verify the local bridge export (timeline needs this for true DAG nodes, not only glyph fallback):

```powershell
Select-String .\node_modules\nodalmerge-bridge\nodalmerge_bridge.d.ts -Pattern "read_replay_range_local_json"
```

If that command prints nothing, re-run `pack-local-artifacts.ps1` in nodalmerge and `install:local-sdk` here.

After install, verify the full stack and restart Vite (install alone does not refresh a running dev server):

```powershell
npm run verify:stack
Remove-Item -Recurse -Force .\node_modules\.vite -ErrorAction SilentlyContinue
npm run dev -- --host 127.0.0.1 --port 4177
```

If you use `npm run dev:apps` from the docs repo, stop the old **collab-text** PowerShell window and start it again so port 4177 picks up changes.

## What it shows

- Live typing → contiguous edits → `insertTextRange` / `deleteTextRange` when insert/delete length > 1
- Multi-peer letter colors via `sync.getTextSequence` (bridge `resolve_text_seq_json`)
- DAG timeline from WASM DAG when `read_replay_range_local_json` is installed; otherwise per-lamport events derived from `getTextSequence` (still drives scrub)
- Lamport scrub preview via `getTextAtLamport` / `getTextSequenceAtLamport` (canonical replay)

## Priority plan

See `PLAN.md` for core vs demo breakdown and follow-ups (true replay-at-lamport in core).
