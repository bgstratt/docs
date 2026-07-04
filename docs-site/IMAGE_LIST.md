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

**Studio pages** — none of these exist yet; `nodalmerge-studio` has no screenshots
anywhere in the repo as of this writing. Capture by running the Studio host
(`scripts/dev.ps1` in `nodalmerge-studio`) and launching the VS Code extension (`F5`
from `clients/vscode-extension`), then working through the Studio quickstart flow.

| Page | Suggested filename | Capture description |
|---|---|---|
| `studio/overview.mdx` | `hero-goal-workspace.png` | Control Tower, Goal Workspace tab — hero shot showing the Decision Tree with an in-progress goal and completed branches converging. Primary above-the-fold product screenshot. |
| `studio/quickstart.mdx` | `quickstart-host-running.png` | Terminal output showing `scripts/dev.ps1` startup logs and both `/health` / `/studio/health` endpoints returning 200. |
| `studio/quickstart.mdx` | `quickstart-extension-launch.png` | VS Code Extension Development Host window with the NodalMerge Studio extension activated, command palette open showing the "NodalMerge:" commands. |
| `studio/quickstart.mdx` | `quickstart-control-tower-shell.png` | The Control Tower shell freshly opened, showing the tab bar (Goal Workspace / Activity Center / Model & Agent Studio / Decision Convergence / Pathways) with an empty Goal Workspace. |
| `studio/quickstart.mdx` | `quickstart-model-agent-studio-profiles.png` | Model & Agent Studio panel, Profiles tab, showing the "+ Add Profile" form filled in with an orchestrator profile. |
| `studio/quickstart.mdx` | `quickstart-first-goal-running.png` | Goal Workspace with a goal actively running: Decision Tree showing a plan node with child task nodes, Reasoning & Execution Timeline populated in the middle column. |
| `studio/quickstart.mdx` | `quickstart-decision-convergence-review.png` | Decision Convergence panel in proposal review mode: diff view, evidence section with build/test results, and the Accept/Reject/Apply action row. |
| `studio/concepts/trust-and-autonomy.mdx` | `trust-review-policy-selector.png` | Goal Workspace Review/Target row showing the Review policy dropdown expanded with all three options (Human Required / Agent Approval / Hybrid) visible. |
| `studio/concepts/trust-and-autonomy.mdx` | `trust-compare-results-view.png` | Compare Results view showing 3 forked proposal cards side by side with the Pick Winner button. |
| `studio/reference/ui-reference.mdx` | `ui-ref-command-palette.png` | VS Code command palette open, filtered to "NodalMerge:" showing all five commands. |
| `studio/reference/ui-reference.mdx` | `ui-ref-goal-workspace-topbar.png` | Goal Workspace topbar with Exploration Strategy dropdown expanded and the fork config panel visible for an Architecture Fork experiment. |
| `studio/reference/ui-reference.mdx` | `ui-ref-decision-lens.png` | Decision Lens right column, Context tab open, showing goal/plan/constraints/evidence for a selected node. |
| `studio/reference/ui-reference.mdx` | `ui-ref-activity-center.png` | Activity Center with Active Goals, Running Agents, and Pending Decisions sections populated. |
| `studio/reference/ui-reference.mdx` | `ui-ref-decision-convergence.png` | Decision Convergence in proposal review mode, split diff view with the Accept/Reject/Apply action row visible. |
| `studio/reference/ui-reference.mdx` | `ui-ref-pathways-dag.png` | Pathways panel showing the DAG canvas with the scrubber mid-timeline and playback bar controls visible. |

18 placeholders total (3 core + 15 Studio). Cross-check: run
`grep -rn "IMAGE:" docs-site/ --include=*.mdx | wc -l` and confirm it equals the row
count above before considering this manifest complete.
