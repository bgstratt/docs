import { createNodalMergeSdk } from "nodalmerge-sdk-js";

const wsUrl = process.env.NODALMERGE_WS_URL ?? "ws://127.0.0.1:5074/ws/runtime";
const roomId = process.env.NODALMERGE_ROOM_ID ?? "demo-room";

const sdk = await createNodalMergeSdk({
  wsUrl,
  roomId,
  transport: { mode: "ws-only" }
});

let sawRuntimeMessage = false;
const unsubscribeRuntimeMessage = typeof sdk.on === "function"
  ? sdk.on("runtime-message", () => {
      sawRuntimeMessage = true;
    })
  : () => {};

try {
  await sdk.room.connect();
  console.log("SDK_CONNECTED");
  console.log(`SDK_ROOM=${roomId}`);
  console.log(`SDK_WS_URL=${wsUrl}`);

  // Give runtime-message hooks a short chance to fire in smoke mode.
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log(`SDK_RUNTIME_MESSAGE_OBSERVED=${sawRuntimeMessage ? "yes" : "no"}`);
} finally {
  unsubscribeRuntimeMessage();
  await sdk.room.disconnect();
  console.log("SDK_DISCONNECTED");
}

