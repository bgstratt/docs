import { useCallback, useState } from 'react';
import { RoomNode, NodeType, DEFAULT_STICKY_SIZE, DEFAULT_ELLIPSE_RADIUS } from './types';
import { getPeerColor } from '../utils/peerColors';
import { usePeerId } from '../hooks/usePeerId';

/**
 * Hook that manages the collection of room nodes.
 * Provides creation, update, and deletion methods.
 *
 * In a production collaborative app this would be backed by Yjs
 * or another CRDT. For the demo, we use React state.
 */
export function useNodes() {
  const peerId = usePeerId();
  const [nodes, setNodes] = useState<RoomNode[]>([]);

  /**
   * Create a new node at the given position.
   * Automatically assigns the creating peer's color via the peer-color utility.
   */
  const createNode = useCallback(
    (type: NodeType, x: number, y: number): RoomNode => {
      const peerColor = getPeerColor(peerId);

      const newNode: RoomNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        x,
        y,
        type,
        color: peerColor,
        createdBy: peerId,
        createdAt: Date.now(),
        ...(type === 'sticky' || type === 'rectangle'
          ? DEFAULT_STICKY_SIZE
          : type === 'ellipse'
          ? { width: DEFAULT_ELLIPSE_RADIUS * 2, height: DEFAULT_ELLIPSE_RADIUS * 2 }
          : {}),
      };

      setNodes((prev) => [...prev, newNode]);
      return newNode;
    },
    [peerId],
  );

  /**
   * Update an existing node's properties (position, content, etc.).
   * Does not change the node's color (that stays tied to the original creator).
   */
  const updateNode = useCallback((id: string, updates: Partial<RoomNode>) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === id ? { ...node, ...updates } : node)),
    );
  }, []);

  /**
   * Delete a node by id.
   */
  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== id));
  }, []);

  return { nodes, createNode, updateNode, deleteNode, peerId };
}
