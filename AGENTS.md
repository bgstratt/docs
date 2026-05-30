# Docs-site platform instructions

## About this project

- This repository is the canonical home for the NodalMerge developer platform.
- `docs-site` is built with [Mintlify](https://mintlify.com).
- Docs pages are MDX files with YAML frontmatter.
- Site navigation and theme configuration live in `docs-site/docs.json`.
- This repo also contains app surfaces for demos, playgrounds, tutorials, onboarding, and shared utilities.
- Keep Mintlify docs behavior stable while building app experiences in sibling folders.
- Use `npm run dev:docs` to preview locally.
- Use `npm run check:docs-links` to validate links before shipping.

## Terminology

- Use **NodalMerge** (not legacy product names) in user-facing docs unless documenting migration/compatibility behavior.
- Use **room** for sync boundary terminology.
- Use **transaction DAG** or **history DAG** when describing replay/merge internals.
- Distinguish **speculative** state from **authoritative** state where relevant.
- Use **capabilities** for path-scoped permissions (for example `read:world/**`).
- Prefer **peer** for participating clients in protocol/operator docs.

## Style preferences

- Use active voice and second person ("you")
- Keep sentences concise and concrete
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- Start pages with outcome-oriented context: what the page helps you do and when to use it
- Prefer runnable snippets over pseudocode for quickstart, SDK, and operators content
- Keep examples aligned with current package/binary names from the `nodalmerge` repo
- Explain trade-offs explicitly when documenting architecture decisions
- Avoid marketing language; prioritize clarity, constraints, and operational reality

## Content boundaries

- Document and build:
  - Architecture and mental models needed to build on NodalMerge
  - SDK usage, common patterns, and failure/recovery behavior
  - Operator concerns: deployment, persistence, metrics, lifecycle, replay
  - Protocol behavior that integrators and host implementers rely on
  - Benchmarks with methodology and interpretation, not just raw numbers
- Do not document or ship as stable:
  - Internal-only experiments that are not intended for external users
  - Undocumented/private APIs as stable contracts
  - Future roadmap items as if already shipped
- When details are uncertain, state assumptions and call out verification steps.

## Page quality bar

- Each non-trivial page should answer:
  - What problem this solves
  - When to use it (and when not to)
  - Minimal working flow
  - Operational or integration pitfalls
  - Links to adjacent pages for next steps
- For empty or thin sections, prioritize shipping complete first-pass drafts before heavy polish.

## Repo organization guidance

- Keep Mintlify docs content under `docs-site/` referenced by `docs-site/docs.json`.
- Keep docs app concerns isolated from app runtimes.
- Use this structure for platform assets:
  - `apps/demos/`
  - `apps/playground/`
  - `tutorials/`
  - `onboarding/`
  - `shared/`
  - `plans/`
- Cross-link from docs pages to demos/playgrounds rather than embedding assumptions that break static docs builds.
- Prefer shared runtime/auth/diagnostics helpers in `shared/` when two or more app surfaces need the same behavior.
