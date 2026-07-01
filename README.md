# NodalMerge docs platform

This repository hosts:

- the nodalmerge.com marketing site under `site/`
- Mintlify documentation under `docs-site/` (docs.nodalmerge.com)
- interactive demos/playgrounds under `apps/`
- shared runtime/ui code under `shared/`
- planning artifacts under `plans/`

## Common commands

From repository root:

```powershell
npm run dev:site
npm run dev:docs
npm run check:docs-links
npm run dev:apps
```

## Marketing site

The nodalmerge.com landing site lives in `site/` (Astro, static build). It links out to
docs.nodalmerge.com and docs.nodalmerge.com/studio, and has a dedicated `/studio` page.
See `site/README.md`.

```powershell
cd .\site
npm install
npm run dev
```

## Documentation app

Docs now live in `docs-site/` with `docs-site/docs.json` as source of truth.

You can also run docs commands directly:

```powershell
cd .\docs-site
npx mint dev
npx mint broken-links
```
