/**
 * React hooks for node operations and room interaction.
 * These hooks integrate the node store, room provider, and peer color utility.
 */

import { useCallback } from 'react';
import { useWorkspaceStore } from '../store/nodeStore';
import { getRoomProvider } from '../room/roomProvider';
import { CreateNodePayload, CanvasNode, NodeType } from '../store/types';
import { getPeerColor, DEFAULT_PEER_COLOR } from '../utils/peerColors';

/**
 * Hook that provides a function to create a new node.
 * The node is assigned the local peer's color automatically via the store.
 */
export function useCreateNode() {
  const addNode = useWorkspaceStore((s) => s.addNode);
  const localPeerId = useWorkspaceStore((s) => s.localPeerId);

  const createNode = useCallback(
    (payload: CreateNodePayload) => {
      addNode(payload);
    },
    [addNode],
  );

  return createNode;
}

/**
 * Hook that provides node removal functionality.
 */
export function useRemoveNode() {
  const removeNode = useWorkspaceStore((s) => s.removeNode);

  const remove = useCallback(
    (nodeId: string) => {
      removeNode(nodeId);
    },
    [removeNode],
  );

  return remove;
}

/**
 * Hook that provides node update functionality.
 */
export function useUpdateNode() {
  const updateNode = useWorkspaceStore((s) => s.updateNode);

  const update = useCallback(
    (nodeId: string, updates: Partial<CanvasNode>) => {
      updateNode(nodeId, updates);
    },
    [updateNode],
  );

  return update;
}

/**
 * Hook to get all nodes, with guaranteed color fields.
 * Legacy nodes without a color field get a fallback based on their createdBy peer ID.
 */
export function useNodes(): Record<string, CanvasNode> {
  const nodes = useWorkspaceStore((s) => s.nodes);

  // Backfill colors for any nodes that lack them
  const nodesWithColors: Record<string, CanvasNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!node.color) {
      nodesWithColors[id] = {
        ...node,
        color: node.createdBy
          ? getPeerColor(node.createdBy)
          : DEFAULT_PEER_COLOR,
      };
    } else {
      nodesWithColors[id] = node;
    }
  }

  return nodesWithColors;
}

/**
 * Hook to get the local peer's color.
 * Returns the default color if no peer ID is set yet.
 */
export function useLocalPeerColor(): string {
  const localPeerId = useWorkspaceStore((s) => s.localPeerId);
  return localPeerId ? getPeerColor(localPeerId) : DEFAULT_PEER_COLOR;
}

/**
 * Hook to get the local peer's ID.
 */
export function useLocalPeerId(): string | null {
  return useWorkspaceStore((s) => s.localPeerId);
}

/**
 * Hook that returns connection status.
 */
export function useConnectionStatus(): boolean {
  return useWorkspaceStore((s) => s.isConnected);
}

/**
 * Hook to join a room (call once on mount or via user action).
 */
export function useJoinRoom() {
  const setLocalPeerId = useWorkspaceStore((s) => s.setLocalPeerId);
  const setConnected = useWorkspaceStore((s) => s.setConnected);

  const joinRoom = useCallback(
    async (roomName: string, signalingServers?: string[]) => {
      try {
        const provider = getRoomProvider({
          roomName,
          signalingServers,
        });
        provider.connect();

        const peerId = provider.getLocalPeerId();
        setLocalPeerId(peerId);
        setConnected(true);
      } catch (error) {
        console.error('Failed to join room:', error);
        setConnected(false);
      }
    },
    [setLocalPeerId, setConnected],
  );

  return joinRoom;
}

/**
 * Hook to leave the current room.
 */
export function useLeaveRoom() {
  const setConnected = useWorkspaceStore((s) => s.setConnected);

  const leaveRoom = useCallback(() => {
    try {
      const provider = getRoomProvider();
      provider.disconnect();
    } catch {
      // Provider may not be initialized
    }
    setConnected(false);
  }, [setConnected]);

  return leaveRoom;
}
