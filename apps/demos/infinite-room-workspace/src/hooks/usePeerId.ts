import { useMemo } from 'react';

/**
 * Hook that returns the current peer's unique identifier.
 *
 * In a real collaborative app this would come from Yjs awareness,
 * a WebSocket connection, or a room provider. For now we generate
 * a stable random id on mount that persists for the session.
 */
export function usePeerId(): string {
  return useMemo(() => {
    // Check for an existing session peer id in sessionStorage
    const stored = sessionStorage.getItem('peerId');
    if (stored) return stored;

    // Generate a new pseudo-random peer id
    const newId = `peer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('peerId', newId);
    return newId;
  }, []);
}
