# Image manifest — docs-site

Every screenshot placeholder across the NodalMerge docs site (core + Studio tab), in
one place, so screenshots can be captured in focused passes and dropped in without
re-reading every page.

**Core NodalMerge pages** — capture against the `developer-experience/apps`
playground apps: start the demo host and apps (`dotnet run --project
apps/hosts/nodalmerge-demo-host` and `npm run dev:apps` from the `nodalmerge` repo
root — see `developer-experience/apps.mdx`), then work through each tutorial/guide.

| Page | Suggested filename | Capture description |
|---|---|---|
| `guides/replay-debugging.mdx` | `replay-debugging-cli-output.png` | Terminal output of `nodalmerge-server replay` showing resolved state and canonical hash for a captured pack, with a highlighted mismatch example if available. |
| `tutorials/trace-a-room-session.mdx` | `trace-room-session-setup.png` | Two `workflow-demo` browser windows plus `protocol-inspector` and `replay-lab` windows, all set to the same room id, arranged for the tutorial setup step. |
| `tutorials/incident-debug-sprint.mdx` | `incident-debug-protocol-inspector-trace.png` | `protocol-inspector` with Peer lifecycle / Presence / Replay-query presets applied, showing an exported trace snippet for the reproduction window. |

**Studio pages** — first capture pass landed 2026-07-06 (see `images/` — captured by
running the Studio host and the VS Code extension, then working through the
quickstart flow). One planned pair turned out to be the same shot from two scroll
positions of the same Review session (`quickstart-decision-convergence-review.png` /
`ui-ref-decision-convergence.png`); consolidated onto `ui-ref-decision-convergence.png`,
embedded on both pages, and deleted the duplicate file. `quickstart-control-tower-shell.png`
ended up capturing the side-panel quick-launch panel *and* the full Control Tower tab
bar in one shot, so it's now embedded on both `quickstart.mdx` (step 2) and
`reference/ui-reference.mdx` ("Side panel — quick launch").

Capturing these screenshots also surfaced live product drift the prose hadn't caught
up to: the extension now has 7 commands, not 5 (`Open Insights` and
`Start Local Runtime` are new); the Control Tower has 7 tabs, not 5 (`Insights` and
`Projection Snapshots` are new, and "Decision Convergence" is labeled **Review** in
the tab bar); the Goal Workspace topbar's strategy dropdown is labeled
**Investigation Strategy**, not **Exploration Strategy**; and Model & Agent Studio
has gained an **Agent Topology** tab (renamed from "Exploration Strategies") and a
new **Participants** tab. The embedded images and immediately-surrounding prose have
been corrected; a full pass to rename/document these throughout (especially adding
real `## Insights`, `## Projection Snapshots`, `## Agent Topology`, and
`## Participants` sections) is still open.

| Page | Filename | Status | Capture description |
|---|---|---|---|
| `studio/overview.mdx` | `hero-goal-workspace.png` | ✅ captured, embedded | Control Tower, Goal Workspace tab — hero shot. |
| `studio/quickstart.mdx` | `quickstart-host-running.png` | Not yet captured | Terminal output showing `scripts/dev.ps1` startup logs and both `/health` / `/studio/health` endpoints returning 200. |
| `studio/quickstart.mdx` + `reference/ui-reference.mdx` | `quickstart-extension-launch.png` | ✅ captured, embedded | Command palette filtered to "noda", showing the full NodalMerge command set. |
| `studio/quickstart.mdx` + `reference/ui-reference.mdx` (side panel section) | `quickstart-control-tower-shell.png` | ✅ captured, embedded (does double duty) | Side panel quick-launch buttons plus the Control Tower shell's full 7-tab bar. |
| `studio/quickstart.mdx` | `quickstart-model-agent-studio-profiles.png` | ✅ captured, embedded | Model & Agent Studio panel, Profiles tab, Add Profile form filled in. |
| `studio/quickstart.mdx` | `quickstart-first-goal-running.png` | Not yet captured | Goal Workspace with a goal actively running: Decision Tree showing a plan node with child task nodes, Reasoning & Execution Timeline populated. |
| `studio/concepts/trust-and-autonomy.mdx` | `trust-review-policy-selector.png` | Not yet captured | Goal Workspace Review/Target row showing the Review policy dropdown expanded with all three options (Human Required / Agent Approval / Hybrid) visible. |
| `studio/concepts/trust-and-autonomy.mdx` | `trust-compare-results-view.png` | Not yet captured | Compare Results view showing 3 forked proposal cards side by side with the Pick Winner button. |
| `studio/reference/ui-reference.mdx` | `ui-ref-command-palette.png` | Not yet captured | VS Code command palette open, filtered to "NodalMerge:" showing all seven commands. |
| `studio/reference/ui-reference.mdx` | `ui-ref-goal-workspace-topbar.png` | ✅ captured, embedded | Goal Workspace topbar with strategy dropdown expanded, showing all four experiment strategies. |
| `studio/reference/ui-reference.mdx` | `ui-ref-decision-lens.png` | Not yet captured | Decision Lens right column, Context tab open, showing goal/plan/constraints/evidence for a selected node. |
| `studio/reference/ui-reference.mdx` | `ui-ref-activity-center.png` | ✅ captured, embedded | Activity Center with Active Goals, Running Agents, and Pending Decisions sections populated. |
| `studio/quickstart.mdx` + `reference/ui-reference.mdx` | `ui-ref-decision-convergence.png` | ✅ captured, embedded (shared asset, was a duplicate pair) | Review (Decision Convergence) in proposal review mode: rationale, split diff view, evidence, Accept/Reject/Apply row. |
| `studio/reference/ui-reference.mdx` | `ui-ref-pathways-dag.png` | ✅ captured, embedded | Pathways timeline view with the scrubber mid-timeline and playback bar controls visible. |

9 of 15 originally-planned Studio shots captured and embedded (one pair consolidated
into a shared asset, so 8 distinct files); 6 still outstanding (host-running,
first-goal-running, both trust-and-autonomy shots, command-palette, decision-lens).
