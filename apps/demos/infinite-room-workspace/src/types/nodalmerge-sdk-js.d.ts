declare module "nodalmerge-sdk-js" {
  export function createNodalMergeSdk(options: {
    wsUrl: string;
    roomId: string;
    transport?: { mode?: "ws-only" | "auto" };
  }): Promise<{
    room: {
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
    };
    on?: (eventName: string, handler: (payload: unknown) => void) => () => void;
  }>;
}

