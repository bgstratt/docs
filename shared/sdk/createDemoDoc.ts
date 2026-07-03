// createDemoDoc — one-call wiring of the createDoc high-level SDK
// (nodalmerge-sdk-js/doc) to this repo's demo runtime conventions:
// VITE_* runtime config, the shared demo host, and per-app room defaults.
//
// Apps must pass the wasm asset URL themselves (Vite requires a static
// import in app code):
//
//   import wasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";
//   const handle = await createDemoDoc({ wasmUrl, env: import.meta.env });

import { createDoc } from "nodalmerge-sdk-js/doc";
import type { CreateDocOptions, Doc } from "nodalmerge-sdk-js/doc";
import { loadRuntimeConfig } from "../runtime/config";
import type { RuntimeConfig } from "../runtime/contracts";

export interface DemoDocOptions {
  /** Vite `?url` import of nodalmerge_bridge_bg.wasm. */
  wasmUrl: string;
  /** Pass `import.meta.env`; read for VITE_HOST_BASE_URL etc. */
  env: Record<string, string | undefined>;
  /** Room override; defaults to VITE_DEFAULT_ROOM_ID / "demo-room". */
  room?: string;
  /** Extra createDoc options (subscribe globs, persistence, hooks, ...). */
  docOptions?: Partial<CreateDocOptions>;
}

export interface DemoDocHandle {
  doc: Doc;
  config: RuntimeConfig;
  roomId: string;
}

export async function createDemoDoc(options: DemoDocOptions): Promise<DemoDocHandle> {
  const config = loadRuntimeConfig(options.env);
  const roomId = options.room ?? config.defaultRoomId;

  const doc = await createDoc({
    serverUrl: config.wsBaseUrl,
    room: roomId,
    wasmModule: options.wasmUrl,
    // The demo host relays WS only; WebRTC mesh negotiation is opt-in via
    // config so apps that want it can pass transportMode=auto.
    transport: config.transportMode === "auto" ? "auto" : "ws-only",
    ...options.docOptions
  });

  return { doc, config, roomId };
}
