# Image manifest — docs-site

Screenshot placeholders in the core NodalMerge docs that would benefit from a demo-app
capture. Kept separate from `docs-site-studio/IMAGE_LIST.md` (Studio's manifest) since
these come from the `developer-experience/apps` playground apps, not the Studio VS Code
extension.

**How to capture:** start the demo host and apps (`dotnet run --project
apps/hosts/nodalmerge-demo-host` and `npm run dev:apps` from the repo root — see
`developer-experience/apps.mdx`), then work through each tutorial/guide, capturing the
shot at the described state. Save under `docs-site/images/` and replace the
corresponding `{/* IMAGE: ... */}` comment with an `<img>` or `<Frame>` tag.

| Page | Suggested filename | Capture description |
|---|---|---|
| `guides/replay-debugging.mdx` | `replay-debugging-cli-output.png` | Terminal output of `nodalmerge-server replay` showing resolved state and canonical hash for a captured pack, with a highlighted mismatch example if available. |
| `tutorials/trace-a-room-session.mdx` | `trace-room-session-setup.png` | Two `infinite-room-workspace` browser windows plus `protocol-inspector` and `replay-lab` windows, all set to the same room id, arranged for the tutorial setup step. |
| `tutorials/incident-debug-sprint.mdx` | `incident-debug-protocol-inspector-trace.png` | `protocol-inspector` with Peer lifecycle / Presence / Replay-query presets applied, showing an exported trace snippet for the reproduction window. |

3 placeholders total. Cross-check: run `grep -rn "IMAGE:" docs-site/ --include=*.mdx`
and confirm every hit has a row above (and vice versa) before considering this
manifest complete.
