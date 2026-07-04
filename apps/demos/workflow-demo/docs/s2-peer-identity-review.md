# S2: Peer Identity & Node Ownership Review

## Goal
Understand how nodes are associated with the peers that created them, so the coloring logic (s3) can differentiate nodes by peer origin.

## Files Reviewed

| File | Role |
|------|------|
| `src/hooks/usePeerId.ts` | Generates/retrieves a stable session peer ID |
| `src/room/provider.tsx` | RoomProvider context with peerId + connectedPeers |
| `src/store/types.ts` | `RoomNode` data model with `createdBy` and `color` fields |
| `src/store/useNodes.ts` | Node CRUD hook — assigns peer color at creation |
| `src/utils/peerColors.ts` | Deterministic peer-ID → color mapping utility |
| `src/renderers/nodeRenderer.ts` | Canvas renderer using per-peer colors |
| `src/components/Canvas.tsx` | Main canvas component — wires creation + rendering |
| `src/components/NodeShape.tsx` | DOM-based alternative node renderer |

---

## 1. Peer Identity

### `usePeerId.ts`
- Returns a **stable session-scoped peer ID** stored in `sessionStorage`
- Format: `peer-{Date.now()}-{random 7-char base36}`
- Generated once on mount via `useMemo(() => ..., [])`
- **Not collaborative** — in production this would come from Yjs awareness or a WebSocket connection

### `room/provider.tsx`
- Mirrors the same sessionStorage-based peer ID generation in `generatePeerId()`
- Exposes `RoomContext` with `{ peerId, connectedPeers }`
- `connectedPeers` is hardcoded to `[peerId]` — single-user demo
- `useRoom()` hook provides access; throws if used outside `RoomProvider`

**Key finding:** Two parallel peer ID mechanisms exist (`usePeerId` hook and `RoomProvider`). They are consistent (both use `sessionStorage` key `'peerId'`) but not unified. `useNodes()` uses `usePeerId()`, while `Canvas.tsx` gets `peerId` from `useNodes()`.

---

## 2. Node Ownership (Data Model)

### `store/types.ts` — `RoomNode` interface
```typescript
interface RoomNode {
  id: string;
  x: number;
  y: number;
  type: NodeType;          // 'sticky' | 'rectangle' | 'ellipse' | 'text'
  color?: string;           // Per-peer CSS color — optional for legacy nodes
  createdBy: string;        // The peer/client ID that created this node
  createdAt: number;
  content?: string;
  width?: number;
  height?: number;
}
```

**Key fields for peer association:**
- **`createdBy: string`** — stores which peer created the node
- **`color?: string`** — stores the resolved color at creation time (optional, undefined for legacy nodes without this field)

The `color` field is **optional** by design — nodes created before the per-peer color feature was added won't have it, and the renderer handles this via `resolveNodeColor()` fallback.

---

## 3. Node Creation Path (Peer → Color)

### `store/useNodes.ts` — `createNode()`
```
User clicks canvas
  → Canvas.handleMouseUp()
    → createNode(activeTool, worldPos.x, worldPos.y)
      → peerColor = getPeerColor(peerId)   // deterministic mapping
      → newNode = { ..., color: peerColor, createdBy: peerId }
      → setNodes(prev => [...prev, newNode])
```

- `peerId` comes from `usePeerId()` (sessionStorage)
- `getPeerColor(peerId)` uses djb2 hash → palette index
- Both `color` and `createdBy` are stored on the node at creation time
- `updateNode()` explicitly **does not** change `color` or `createdBy` — ownership is immutable

---

## 4. Color Mapping Utility

### `utils/peerColors.ts`
- **12-color palette** (`PEER_COLOR_PALETTE`): blue, rose, green, amber, violet, pink, cyan, orange, indigo, teal, crimson, saddle brown
- **`hashPeerId(peerId)`**: djb2 hash variant, returns `Math.abs(hash)`, deterministic across sessions
- **`getPeerColor(peerId)`**: `hash % palette.length` → palette color. Returns `DEFAULT_NODE_COLOR` (`#6B7280`, neutral gray) if peerId is empty/falsy
- **`getDefaultNodeColor()`**: returns `#6B7280` for legacy/unknown-peer nodes

**Hash collision note:** With 12 palette slots, collisions are possible (different peer IDs could map to the same color). For a demo this is acceptable. Production could use a larger palette or HSL-based mapping.

---

## 5. Rendering Path (Color → Visual)

### `renderers/nodeRenderer.ts`
```
renderAllNodes(ctx, nodes, selectedNodeIds, panX, panY, zoom)
  → for each node: renderNode(context)
    → resolveNodeColor(node)
      → node.color || getDefaultNodeColor()
    → draw{Sticky,Rectangle,Ellipse,Text}Node(context)
      → ctx.fillStyle = color
```

- `resolveNodeColor()` is the single point where node color is resolved
- Falls back to `getDefaultNodeColor()` (`#6B7280`) when `node.color` is undefined
- Selection highlight uses `lightenColor(color, factor)` which lightens the per-peer color — ensures highlight composes well
- Each node shape type (sticky, rectangle, ellipse, text) uses the resolved color as its fill

### `components/Canvas.tsx`
- Toolbar: active tool button background = `getPeerColor(peerId)` (shows user their own color)
- Peer indicator dot: background = `getPeerColor(peerId)`
- Node creation: delegates to `useNodes().createNode()` which handles color assignment

### `components/NodeShape.tsx`
- DOM-based alternative to canvas rendering
- Same pattern: `const color = node.color || getDefaultNodeColor()`
- Used for accessibility or simpler layouts

---

## 6. Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SESSION START                                                    │
│   sessionStorage.getItem('peerId')                               │
│   → if missing: generate 'peer-{ts}-{random}'                    │
│   → store in sessionStorage                                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ NODE CREATION (useNodes.createNode)                              │
│   peerId = usePeerId()                                           │
│   peerColor = getPeerColor(peerId)                               │
│     → hashPeerId(peerId) → djb2 → abs → % 12 → palette[index]  │
│   newNode = {                                                    │
│     id, x, y, type,                                              │
│     color: peerColor,      ← STORED                              │
│     createdBy: peerId,     ← STORED                              │
│     createdAt, ...                                               │
│   }                                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ RENDERING (nodeRenderer.renderNode)                              │
│   color = resolveNodeColor(node)                                 │
│     → node.color ?? getDefaultNodeColor()                       │
│   draw{Shape}(ctx, color, ...)                                   │
│     → ctx.fillStyle = color                                      │
│     → selection → lightenColor(color, factor)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Conflict / Issue Assessment

- **Merge conflict markers:** None found in any file. The `merge-conflict-report.md` on main references a conflict between proposals MP-49951bd43de4db385e3ea01b7c581a0 and MP-9024bfafbdba4abfa1f71aa2caa34741 on `peerColors.ts`, but the current file content is clean and complete.
- **Imports:** All imports resolve correctly. `useNodes.ts` imports from `../utils/peerColors` and `../hooks/usePeerId`. `nodeRenderer.ts` imports from `../store/types` and `../utils/peerColors`.
- **Type consistency:** `RoomNode.color` is `string | undefined`. All consumers handle the undefined case correctly.
- **Dual peer ID sources:** `usePeerId.ts` and `room/provider.tsx` both generate peer IDs. They use the same `sessionStorage` key so they stay consistent, but the codebase could be simplified by using only one source.
- **No broken references:** All function calls and type references are intact.

---

## 8. Recommendations for S3 (Fix Task)

1. The core peer→color→render pipeline is **already fully implemented and functional**. No structural changes are needed.
2. The merge conflict on `peerColors.ts` has been resolved — the file is clean.
3. If s1 found issues in the rendering/coloring code, the fix will likely be in `nodeRenderer.ts` or `Canvas.tsx`.
4. The `color` field being optional on `RoomNode` is correct — legacy nodes without it get the fallback gray.
5. Consider unifying `usePeerId` and `RoomProvider.generatePeerId` to avoid duplication.
