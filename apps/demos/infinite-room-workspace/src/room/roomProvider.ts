/**
 * Room provider for collaborative workspace connections.
 * Manages Yjs document sync and peer awareness.
 * Integrates with the node store to sync the local peer ID and node state.
 */

import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { CanvasNode } from '../store/types';
import { useWorkspaceStore } from '../store/nodeStore';
import { getPeerColor } from '../utils/peerColors';

/** Configuration for the room connection. */
export interface RoomConfig {
  /** Room name to join (shared across peers). */
  roomName: string;
  /** Signaling server URLs for WebRTC. */
  signalingServers?: string[];
  /** Optional password for the room. */
  password?: string;
}

/**
 * RoomProvider manages the collaborative Yjs document and syncs
 * canvas nodes across peers.
 */
export class RoomProvider {
  private doc: Y.Doc;
  private provider: WebrtcProvider | null = null;
  private nodesMap: Y.Map<unknown>;
  private config: RoomConfig;

  constructor(config: RoomConfig) {
    this.config = config;
    this.doc = new Y.Doc();
    this.nodesMap = this.doc.getMap('nodes');
  }

  /**
   * Connect to the collaborative room and begin syncing.
   */
  connect(): void {
    this.provider = new WebrtcProvider(this.config.roomName, this.doc, {
      signaling: this.config.signalingServers,
      password: this.config.password,
    });

    const store = useWorkspaceStore.getState();

    // Set the local peer ID from the provider's awareness
    this.provider.awareness.on('change', () => {
      const clientId = this.doc.clientID.toString();
      store.setLocalPeerId(clientId);
    });

    // Set initial peer ID if already available
    if (this.doc.clientID !== 0) {
      store.setLocalPeerId(this.doc.clientID.toString());
    }

    store.setConnected(true);

    // Listen for changes to the shared nodes map
    this.nodesMap.observe(() => {
      this.syncNodesFromYjs();
    });

    // Initial sync
    this.syncNodesFromYjs();

    // Listen for local store changes and push to Yjs
    this.subscribeToLocalChanges();
  }

  /**
   * Disconnect from the room and clean up.
   */
  disconnect(): void {
    this.provider?.destroy();
    this.provider = null;
    this.doc.destroy();

    const store = useWorkspaceStore.getState();
    store.setConnected(false);
    store.setLocalPeerId('');
  }

  /**
   * Add a node to the synced Yjs document.
   * Called whenever a new node is created locally.
   */
  addNodeToYjs(node: CanvasNode): void {
    this.nodesMap.set(node.id, node as unknown as Record<string, unknown>);
  }

  /**
   * Remove a node from the synced Yjs document.
   */
  removeNodeFromYjs(nodeId: string): void {
    this.nodesMap.delete(nodeId);
  }

  /**
   * Update a node in the synced Yjs document.
   */
  updateNodeInYjs(node: CanvasNode): void {
    this.nodesMap.set(node.id, node as unknown as Record<string, unknown>);
  }

  /**
   * Get the local peer's unique client ID.
   */
  getLocalPeerId(): string {
    return this.doc.clientID.toString();
  }

  /**
   * Get the local peer's assigned color.
   */
  getLocalPeerColor(): string {
    return getPeerColor(this.getLocalPeerId());
  }

  /**
   * Sync nodes from the Yjs document into the local Zustand store.
   */
  private syncNodesFromYjs(): void {
    const nodes: Record<string, CanvasNode> = {};
    this.nodesMap.forEach((value, key) => {
      nodes[key] = value as unknown as CanvasNode;
    });

    const store = useWorkspaceStore.getState();
    store.setNodes(nodes);
  }

  /**
   * Subscribe to local node changes and propagate them to Yjs.
   * Uses a simple approach: on each state change, diff and sync.
   */
  private subscribeToLocalChanges(): void {
    let previousNodes: Record<string, CanvasNode> = {};

    useWorkspaceStore.subscribe((state) => {
      const currentNodes = state.nodes;
      const prevKeys = Object.keys(previousNodes);
      const currKeys = Object.keys(currentNodes);

      // Detect new or changed nodes
      for (const key of currKeys) {
        if (
          !previousNodes[key] ||
          JSON.stringify(previousNodes[key]) !== JSON.stringify(currentNodes[key])
        ) {
          this.nodesMap.set(key, currentNodes[key] as unknown as Record<string, unknown>);
        }
      }

      // Detect removed nodes
      for (const key of prevKeys) {
        if (!currentNodes[key]) {
          this.nodesMap.delete(key);
        }
      }

      previousNodes = { ...currentNodes };
    });
  }
}

/**
 * Singleton room provider instance.
 */
let roomProviderInstance: RoomProvider | null = null;

/**
 * Get or create the room provider instance.
 */
export function getRoomProvider(config?: RoomConfig): RoomProvider {
  if (!roomProviderInstance && config) {
    roomProviderInstance = new RoomProvider(config);
  }
  if (!roomProviderInstance) {
    throw new Error('RoomProvider not initialized. Call with a config first.');
  }
  return roomProviderInstance;
}

/**
 * Destroy the room provider singleton.
 */
export function destroyRoomProvider(): void {
  if (roomProviderInstance) {
    roomProviderInstance.disconnect();
    roomProviderInstance = null;
  }
}
