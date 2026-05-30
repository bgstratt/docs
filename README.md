# NodalMerge docs platform

This repository hosts:

- Mintlify documentation under `docs-site/`
- interactive demos/playgrounds under `apps/`
- shared runtime/ui code under `shared/`
- planning artifacts under `plans/`

## Common commands

From repository root:

```powershell
npm run dev:docs
npm run check:docs-links
npm run dev:apps
```

## Documentation app

Docs now live in `docs-site/` with `docs-site/docs.json` as source of truth.

You can also run docs commands directly:

```powershell
cd .\docs-site
npx mint dev
npx mint broken-links
```
