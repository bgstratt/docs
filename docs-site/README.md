# Docs-site app boundary

This folder is the Mintlify docs application boundary for the expanded platform repository model.

Docs content and `docs.json` are now owned under `docs-site/`.

Use these commands from repository root:

- `npm run dev:docs`
- `npm run check:docs-links`

Or directly from this folder:

- `npx mint dev`
- `npx mint broken-links`

Keep:

- `docs.json` ownership explicit
- MDX navigation and static asset paths stable
- demo/playground runtime code isolated from static docs build behavior
