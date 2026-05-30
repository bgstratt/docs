declare module "nodalmerge-sdk-js" {
  export function createNodalMergeSdk(options: {
    wsUrl: string;
    roomId: string;
    wasmModule?: string;
    transport?: { mode?: "ws-only" | "auto" };
  }): Promise<{
    room: {
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
    };
    sync?: {
      set?: (key: string, value: string) => void;
      get?: (key: string) => string | null;
      push?: () => void;
    };
    on?: (eventName: string, handler: (payload: unknown) => void) => () => void;
  }>;
}
