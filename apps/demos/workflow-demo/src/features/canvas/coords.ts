// Client-to-workspace coordinate mapping. The canvas surface is a fixed
// 860×360 logical plane that may be CSS-scaled down on narrow screens;
// getBoundingClientRect reflects the transform, so the live scale factor is
// recoverable from the measured width.

import { WORKSPACE_WIDTH } from "../../state/workspaceTypes";

export function clientPointToWorkspace(
  clientX: number,
  clientY: number,
  surface: HTMLElement
): { x: number; y: number } {
  const rect = surface.getBoundingClientRect();
  const scale = rect.width / WORKSPACE_WIDTH || 1;
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale
  };
}
