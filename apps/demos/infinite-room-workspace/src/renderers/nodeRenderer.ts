/**
 * Canvas node renderer — draws nodes using their per-peer color.
 *
 * This module provides the rendering logic that replaces a uniform/hardcoded
 * color with the node's stored `color` field, falling back to a default
 * when the field is absent (legacy nodes).
 */

import { RoomNode, DEFAULT_ELLIPSE_RADIUS, DEFAULT_STICKY_SIZE } from '../store/types';
import { getDefaultNodeColor } from '../utils/peerColors';

/**
 * Properties passed to each node render function.
 */
export interface NodeRenderContext {
  ctx: CanvasRenderingContext2D;
  node: RoomNode;
  /** Whether the node is currently selected (draws highlight ring). */
  selected: boolean;
  /** Current viewport pan offset. */
  panX: number;
  /** Current viewport pan offset. */
  panY: number;
  /** Current zoom level. */
  zoom: number;
}

/**
 * Resolve the effective color for a node: its stored per-peer color,
 * or the default fallback if none is set (legacy nodes).
 */
function resolveNodeColor(node: RoomNode): string {
  return node.color || getDefaultNodeColor();
}

/**
 * Lighten a CSS hex color by a factor (0-1 range) for highlight effects.
 */
function lightenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/**
 * Draw a sticky-note style node (rounded rectangle with fold effect).
 */
function drawStickyNode({ ctx, node, selected, panX, panY, zoom }: NodeRenderContext): void {
  const color = resolveNodeColor(node);
  const w = node.width ?? DEFAULT_STICKY_SIZE.width;
  const h = node.height ?? DEFAULT_STICKY_SIZE.height;
  const sx = (node.x + panX) * zoom;
  const sy = (node.y + panY) * zoom;
  const sw = w * zoom;
  const sh = h * zoom;
  const radius = 8 * zoom;

  ctx.save();

  // Selection highlight ring
  if (selected) {
    ctx.strokeStyle = lightenColor(color, 0.4);
    ctx.lineWidth = 3 * zoom;
    ctx.beginPath();
    ctx.roundRect(sx - 4 * zoom, sy - 4 * zoom, sw + 8 * zoom, sh + 8 * zoom, radius + 4 * zoom);
    ctx.stroke();
  }

  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 6 * zoom;
  ctx.shadowOffsetX = 2 * zoom;
  ctx.shadowOffsetY = 2 * zoom;

  // Node body — use the per-peer color
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, radius);
  ctx.fill();

  // Reset shadow for the fold
  ctx.shadowColor = 'transparent';

  // Corner fold (darker shade)
  const foldSize = 20 * zoom;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.beginPath();
  ctx.moveTo(sx + sw - foldSize, sy);
  ctx.lineTo(sx + sw, sy + foldSize);
  ctx.lineTo(sx + sw, sy);
  ctx.closePath();
  ctx.fill();

  // Content text
  if (node.content) {
    ctx.fillStyle = '#1F2937'; // dark gray for readability
    const fontSize = 14 * zoom;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    const maxWidth = sw - 16 * zoom;
    wrapText(ctx, node.content, sx + 8 * zoom, sy + 8 * zoom, maxWidth, fontSize * 1.4);
  }

  ctx.restore();
}

/**
 * Draw a rectangular node.
 */
function drawRectangleNode({ ctx, node, selected, panX, panY, zoom }: NodeRenderContext): void {
  const color = resolveNodeColor(node);
  const w = node.width ?? DEFAULT_STICKY_SIZE.width;
  const h = node.height ?? DEFAULT_STICKY_SIZE.height;
  const sx = (node.x + panX) * zoom;
  const sy = (node.y + panY) * zoom;
  const sw = w * zoom;
  const sh = h * zoom;

  ctx.save();

  if (selected) {
    ctx.strokeStyle = lightenColor(color, 0.4);
    ctx.lineWidth = 3 * zoom;
    ctx.strokeRect(sx - 4 * zoom, sy - 4 * zoom, sw + 8 * zoom, sh + 8 * zoom);
  }

  // Node body — per-peer color
  ctx.fillStyle = color;
  ctx.fillRect(sx, sy, sw, sh);

  // Border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.5 * zoom;
  ctx.strokeRect(sx, sy, sw, sh);

  // Content
  if (node.content) {
    ctx.fillStyle = '#FFFFFF';
    const fontSize = 14 * zoom;
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.content, sx + sw / 2, sy + sh / 2);
  }

  ctx.restore();
}

/**
 * Draw an ellipse/circle node.
 */
function drawEllipseNode({ ctx, node, selected, panX, panY, zoom }: NodeRenderContext): void {
  const color = resolveNodeColor(node);
  const radiusX = ((node.width ?? DEFAULT_ELLIPSE_RADIUS * 2) / 2) * zoom;
  const radiusY = ((node.height ?? DEFAULT_ELLIPSE_RADIUS * 2) / 2) * zoom;
  const cx = (node.x + panX) * zoom + radiusX;
  const cy = (node.y + panY) * zoom + radiusY;

  ctx.save();

  if (selected) {
    ctx.strokeStyle = lightenColor(color, 0.4);
    ctx.lineWidth = 3 * zoom;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX + 4 * zoom, radiusY + 4 * zoom, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Node body — per-peer color
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.5 * zoom;
  ctx.stroke();

  // Content
  if (node.content) {
    ctx.fillStyle = '#1F2937';
    const fontSize = 14 * zoom;
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.content, cx, cy);
  }

  ctx.restore();
}

/**
 * Draw a text-only node (no background shape).
 */
function drawTextNode({ ctx, node, selected, panX, panY, zoom }: NodeRenderContext): void {
  const color = resolveNodeColor(node);
  const sx = (node.x + panX) * zoom;
  const sy = (node.y + panY) * zoom;

  ctx.save();

  if (selected) {
    // Dashed underline for text selection
    const w = node.width ?? 300;
    ctx.strokeStyle = lightenColor(color, 0.3);
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([4 * zoom, 4 * zoom]);
    ctx.beginPath();
    ctx.moveTo(sx, sy + 22 * zoom);
    ctx.lineTo(sx + w * zoom, sy + 22 * zoom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = color;
  const fontSize = 16 * zoom;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(node.content ?? '', sx, sy);

  ctx.restore();
}

/**
 * Helper: wrap and draw text within a max width.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

/**
 * Main render function: draws a single node on the canvas.
 * Routes to the appropriate shape renderer based on node type.
 * Uses the node's stored per-peer color — falling back to a default
 * when the color field is absent (handles legacy nodes gracefully).
 */
export function renderNode(context: NodeRenderContext): void {
  const { node } = context;

  switch (node.type) {
    case 'sticky':
      drawStickyNode(context);
      break;
    case 'rectangle':
      drawRectangleNode(context);
      break;
    case 'ellipse':
      drawEllipseNode(context);
      break;
    case 'text':
      drawTextNode(context);
      break;
    default:
      // Fallback: draw as a colored rectangle
      drawRectangleNode(context);
      break;
  }
}

/**
 * Renders all nodes in the list.
 */
export function renderAllNodes(
  ctx: CanvasRenderingContext2D,
  nodes: RoomNode[],
  selectedNodeIds: Set<string>,
  panX: number,
  panY: number,
  zoom: number,
): void {
  for (const node of nodes) {
    renderNode({
      ctx,
      node,
      selected: selectedNodeIds.has(node.id),
      panX,
      panY,
      zoom,
    });
  }
}
