import type { ReplayMode } from "./branchReplay";

export type WriteRoutingDecision = "direct-write" | "switch-to-live-head-write" | "fork-branch-write";

export function decideWriteRouting(mode: ReplayMode, cursorNodeIndex: number, headNodeIndex: number): WriteRoutingDecision {
  if (mode !== "playback") {
    return "direct-write";
  }
  if (headNodeIndex >= 0 && cursorNodeIndex >= headNodeIndex) {
    return "switch-to-live-head-write";
  }
  return "fork-branch-write";
}
