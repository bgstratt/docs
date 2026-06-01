import { createNodalMergeSdk } from "nodalmerge-sdk-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wasmModule = readFileSync(
  fileURLToPath(new URL("../node_modules/nodalmerge-bridge/nodalmerge_bridge_bg.wasm", import.meta.url))
);

const wsUrl = process.env.NODALMERGE_WS_URL ?? "ws://127.0.0.1:5074/ws/runtime";
const roomId = process.env.NODALMERGE_ROOM_ID ?? `sync-test-${Date.now().toString(36)}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectPeer(label) {
  const sdk = await createNodalMergeSdk({
    wsUrl,
    roomId,
    wasmModule,
    transport: { mode: "ws-only" }
  });

  const packs = [];
  const unsubscribe = sdk.on("message", (msg) => {
    if (msg?.type === "pack") {
      packs.push({ from: msg.from ?? "unknown", at: Date.now() });
    }
  });

  await sdk.room.connect();
  await sleep(300);
  return { sdk, label, packs, unsubscribe, pubkey: sdk.topology.snapshot().pubkey };
}

const key = "workspace/nodes/main";

try {
  const peerA = await connectPeer("A");
  const peerB = await connectPeer("B");
  await sleep(400);

  const nodesA = [{ id: "n1", x: 10, y: 20, label: "Node 1", updatedAtIso: new Date().toISOString() }];
  peerA.sdk.sync.set(key, JSON.stringify(nodesA));
  peerA.sdk.sync.push();
  await sleep(800);

  const readA = peerA.sdk.sync.get(key);
  const readB = peerB.sdk.sync.get(key);
  console.log(`ROOM=${roomId}`);
  console.log(`PEER_A_PUBKEY=${peerA.pubkey.slice(0, 16)}...`);
  console.log(`PEER_B_PUBKEY=${peerB.pubkey.slice(0, 16)}...`);
  console.log(`PEER_A_PACKS_RECEIVED=${peerA.packs.length}`);
  console.log(`PEER_B_PACKS_RECEIVED=${peerB.packs.length}`);
  console.log(`PEER_A_READ=${readA?.slice(0, 80) ?? "null"}`);
  console.log(`PEER_B_READ=${readB?.slice(0, 80) ?? "null"}`);
  console.log(`SYNC_OK=${readB === readA ? "yes" : "no"}`);

  const moved = [{ id: "n1", x: 200, y: 220, label: "Node 1", updatedAtIso: new Date().toISOString() }];
  peerA.sdk.sync.set(key, JSON.stringify(moved));
  peerA.sdk.sync.push();
  await sleep(800);

  const added = [
    { id: "n2", x: 40, y: 40, label: "Node 2", updatedAtIso: new Date().toISOString() },
    ...moved
  ];
  peerA.sdk.sync.set(key, JSON.stringify(added));
  peerA.sdk.sync.push();
  await sleep(800);

  const readB2 = peerB.sdk.sync.get(key);
  const parsed = readB2 ? JSON.parse(readB2) : [];
  console.log(`PEER_B_NODE_COUNT=${parsed.length}`);
  console.log(`PEER_B_HAS_N2=${parsed.some((n) => n.id === "n2") ? "yes" : "no"}`);
  console.log(`PEER_B_N1_X=${parsed.find((n) => n.id === "n1")?.x ?? "missing"}`);

  peerA.unsubscribe();
  peerB.unsubscribe();
  await peerA.sdk.room.disconnect();
  await peerB.sdk.room.disconnect();
} catch (error) {
  console.error("SYNC_TEST_FAILED", error);
  process.exitCode = 1;
}
