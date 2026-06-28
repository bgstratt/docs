/**
 * Zustand store for managing canvas nodes.
 * Integrates with the peer color utility to assign a consistent color
 * to every node based on the creating peer's ID.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  CanvasNode,
  CreateNodePayload,
  WorkspaceState,
  WorkspaceActions,
} from './types';
import { getPeerColor, DEFAULT_PEER_COLOR } from '../utils/peerColors';

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

/**
 * Create a new CanvasNode from the payload, resolving the peer color.
 */
function createNode(
  payload: CreateNodePayload,
  peerId: string | null,
): CanvasNode {
  const now = new Date().toISOString();
  const color = peerId ? getPeerColor(peerId) : DEFAULT_PEER_COLOR;

  return {
    id: uuidv4(),
    x: payload.x,
    y: payload.y,
    width: payload.width,
    height: payload.height,
    type: payload.type,
    content: payload.content,
    color,
    createdBy: peerId ?? 'unknown',
    createdAt: now,
  };
}

/**
 * Initialize the workspace store.
 */
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // --- State ---
  nodes: {},
  localPeerId: null,
  isConnected: false,

  // --- Actions ---
  addNode: (payload: CreateNodePayload) => {
    const { localPeerId } = get();
    const node = createNode(payload, localPeerId);

    set((state) => ({
      nodes: {
        ...state.nodes,
        [node.id]: node,
      },
    }));
  },

  removeNode: (nodeId: string) => {
    set((state) => {
      const { [nodeId]: _removed, ...remaining } = state.nodes;
      return { nodes: remaining };
    });
  },

  updateNode: (nodeId: string, updates: Partial<CanvasNode>) => {
    set((state) => {
      const existing = state.nodes[nodeId];
      if (!existing) return state;

      return {
        nodes: {
          ...state.nodes,
          [nodeId]: { ...existing, ...updates },
        },
      };
    });
  },

  setLocalPeerId: (peerId: string) => {
    set({ localPeerId: peerId });
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  setNodes: (nodes: Record<string, CanvasNode>) => {
    set({ nodes });
  },
}));

/**
 * Helper to ensure a node has a color, providing a default for legacy nodes
 * that may not have had the color field stored.
 */
export function ensureNodeColor(node: CanvasNode): CanvasNode {
  if (!node.color) {
    return {
      ...node,
      color: node.createdBy
        ? getPeerColor(node.createdBy)
        : DEFAULT_PEER_COLOR,
    };
  }
  return node;
}

/**
 * Returns all nodes with guaranteed color fields (backfilling defaults for
 * any legacy nodes that lack a color).
 */
export function getNodesWithColors(
  nodes: Record<string, CanvasNode>,
): Record<string, CanvasNode> {
  const result: Record<string, CanvasNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    result[id] = ensureNodeColor(node);
  }
  return result;
}
