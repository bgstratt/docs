# Collab text priorities

| Prio | Item | Layer | Status |
|------|------|-------|--------|
| 1 | `resolve_text_seq_json` → `sync.getTextSequence` → multi-peer glyph colors | Core + demo | Done |
| 2 | Contiguous `insertTextRange` / `deleteTextRange` + text `captureMutationBaseIds` | Core SDK + demo | Done |
| 3 | Authoritative `resolve_text_at_lamport` → `getTextAtLamport` / `getTextSequenceAtLamport` | **Core** + demo | Done |
| 4 | Docs cross-links | Docs | Done |

## Core vs demo

- **Core**: bridge WASM exports, SDK sync helpers, RGA replay in `nodalmerge-core` (`resolve_text_seq_upto_lamport`).
- **Demo**: editor UX, lamport slider, colored preview, default room `collab-text`.
