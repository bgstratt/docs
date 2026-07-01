# NodalMerge marketing site

Astro static site for nodalmerge.com — the product landing page, plus a dedicated
`/studio` page for NodalMerge Studio. Links out to `docs.nodalmerge.com` (Mintlify) for
reference docs and to `apps/demos` / `apps/playground` (currently "coming soon" stub
pages here until those apps are publicly deployed).

## Run locally

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

Outputs a static `dist/` — no hosting provider is wired in yet (works on Vercel,
Netlify, Cloudflare Pages, or any static host).

## Structure

- `src/pages/` — routes (`index.astro`, `studio.astro`, `demos/`, `playground/`)
- `src/components/` — `Nav`, `Footer`, `AppCard`, `Logo`, `ThemeToggle`
- `src/data/apps.ts` — demo/playground metadata (name, tagline, status, source path)
- `src/data/nav.ts` — shared nav/footer links, including docs.nodalmerge.com URLs
- `src/styles/tokens.css` — design tokens ported from `docs-site/custom.css` so this
  site, the docs, and Studio share one palette/type scale and the same dark-default
  night/day toggle behavior.

## Updating demo/playground status

When a demo or playground app gets a real public deployment, update its entry in
`src/data/apps.ts` (`status: "live"`) — the stub page and card automatically switch
from the "coming soon" badge to a live link once you also point it at a real URL.
