# Image manifest — docs-site-studio

Every screenshot placeholder in the Studio docs, in one place, so screenshots can be
captured in a single pass against a running Control Tower and dropped in without
re-reading every page. None of these exist yet — nodalmerge-studio has no
screenshots anywhere in the repo as of this writing.

**How to capture:** run the Studio host (`scripts/dev.ps1`) and launch the VS Code
extension (`F5` from `clients/vscode-extension`), then work through the quickstart
flow, capturing each shot below at the described state. Save as the suggested
filename under `docs-site-studio/images/` and reference it from an `<img>` or
`<Frame>` tag replacing the corresponding `{/* IMAGE: ... */}` comment in the page.

| Page | Suggested filename | Capture description |
|---|---|---|
| `index.mdx` | `hero-goal-workspace.png` | Control Tower, Goal Workspace tab — hero shot showing the Decision Tree with an in-progress goal and completed branches converging. Primary above-the-fold product screenshot. |
| `quickstart.mdx` | `quickstart-host-running.png` | Terminal output showing `scripts/dev.ps1` startup logs and both `/health` / `/studio/health` endpoints returning 200. |
| `quickstart.mdx` | `quickstart-extension-launch.png` | VS Code Extension Development Host window with the NodalMerge Studio extension activated, command palette open showing the "NodalMerge:" commands. |
| `quickstart.mdx` | `quickstart-control-tower-shell.png` | The Control Tower shell freshly opened, showing the tab bar (Goal Workspace / Activity Center / Model & Agent Studio / Decision Convergence / Pathways) with an empty Goal Workspace. |
| `quickstart.mdx` | `quickstart-model-agent-studio-profiles.png` | Model & Agent Studio panel, Profiles tab, showing the "+ Add Profile" form filled in with an orchestrator profile. |
| `quickstart.mdx` | `quickstart-first-goal-running.png` | Goal Workspace with a goal actively running: Decision Tree showing a plan node with child task nodes, Reasoning & Execution Timeline populated in the middle column. |
| `quickstart.mdx` | `quickstart-decision-convergence-review.png` | Decision Convergence panel in proposal review mode: diff view, evidence section with build/test results, and the Accept/Reject/Apply action row. |
| `concepts/trust-and-autonomy.mdx` | `trust-review-policy-selector.png` | Goal Workspace Review/Target row showing the Review policy dropdown expanded with all three options (Human Required / Agent Approval / Hybrid) visible. |
| `concepts/trust-and-autonomy.mdx` | `trust-compare-results-view.png` | Compare Results view showing 3 forked proposal cards side by side with the Pick Winner button. |
| `reference/ui-reference.mdx` | `ui-ref-command-palette.png` | VS Code command palette open, filtered to "NodalMerge:" showing all five commands. |
| `reference/ui-reference.mdx` | `ui-ref-goal-workspace-topbar.png` | Goal Workspace topbar with Exploration Strategy dropdown expanded and the fork config panel visible for an Architecture Fork experiment. |
| `reference/ui-reference.mdx` | `ui-ref-decision-lens.png` | Decision Lens right column, Context tab open, showing goal/plan/constraints/evidence for a selected node. |
| `reference/ui-reference.mdx` | `ui-ref-activity-center.png` | Activity Center with Active Goals, Running Agents, and Pending Decisions sections populated. |
| `reference/ui-reference.mdx` | `ui-ref-decision-convergence.png` | Decision Convergence in proposal review mode, split diff view with the Accept/Reject/Apply action row visible. |
| `reference/ui-reference.mdx` | `ui-ref-pathways-dag.png` | Pathways panel showing the DAG canvas with the scrubber mid-timeline and playback bar controls visible. |

15 placeholders total. Cross-check: run
`grep -rn "IMAGE:" docs-site-studio/` and confirm every hit has a row above (and
vice versa) before considering this manifest complete.
