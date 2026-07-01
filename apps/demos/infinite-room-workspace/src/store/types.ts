/**
 * Core node/entity data model types for the infinite room workspace.
 */

export interface RoomNode {
  /** Unique node identifier (e.g., a UUID or CRDT-generated id). */
  id: string;
  /** X position in canvas/world coordinates. */
  x: number;
  /** Y position in canvas/world coordinates. */
  y: number;
  /** The type/shape of this node (e.g., 'sticky', 'shape', 'text'). */
  type: NodeType;
  /**
   * The CSS color assigned to this node based on the peer that created it.
   * Stored per-node so rendering can use per-peer colors.
   * May be undefined for legacy nodes created before this field existed.
   */
  color?: string;
  /** The peer/client ID that created this node. */
  createdBy: string;
  /** Timestamp of creation (ms since epoch). */
  createdAt: number;
  /** Optional text content. */
  content?: string;
  /** Optional width (for rectangular nodes). */
  width?: number;
  /** Optional height (for rectangular nodes). */
  height?: number;
}

export type NodeType = 'sticky' | 'rectangle' | 'ellipse' | 'text';

/**
 * Default size for newly created sticky notes.
 */
export const DEFAULT_STICKY_SIZE = { width: 200, height: 200 };

/**
 * Default radius for ellipse nodes.
 */
export const DEFAULT_ELLIPSE_RADIUS = 80;
