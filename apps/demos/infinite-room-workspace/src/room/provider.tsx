import React, { createContext, useContext, useMemo } from 'react';

/**
 * Room context — provides collaborative room awareness to the component tree.
 * In a production app this would be backed by Yjs / Liveblocks / etc.
 */

interface RoomContextValue {
  /** The local peer's unique identifier. */
  peerId: string;
  /** List of connected peer IDs (including self). */
  connectedPeers: string[];
}

const RoomContext = createContext<RoomContextValue | null>(null);

/**
 * Generate a stable session peer ID.
 */
function generatePeerId(): string {
  const stored = sessionStorage.getItem('peerId');
  if (stored) return stored;
  const newId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  sessionStorage.setItem('peerId', newId);
  return newId;
}

/**
 * Provider that wraps the app with room awareness.
 */
export const RoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const peerId = useMemo(() => generatePeerId(), []);

  const value: RoomContextValue = useMemo(
    () => ({
      peerId,
      connectedPeers: [peerId], // In a real app this would update dynamically
    }),
    [peerId],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

/**
 * Hook to access room context.
 */
export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return ctx;
}
