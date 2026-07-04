import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../shared/runtime/runtimeClient";
import { connectWithRoomFallback } from "../../../../shared/runtime/roomFallback";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import { SdkRuntimeClient, type SharedWriteResult } from "./lib/sdkRuntimeClient";
import {
  ALL_REPLAY_OP_KEY_PREFIX,
  buildAppendReplayOpWriteEntries,
  getReplayOpKeyPrefix,
  getReplayOpRecordKey,
  LEGACY_REPLAY_OPS_KEY,
  readAllReplayOpsFromShared,
  readReplayOpsFromShared
} from "./lib/workspaceReplayStorage";
import {
  buildAddNodeWriteEntries,
  buildSeedBranchNodesWriteEntries,
  buildClearNodesWriteEntries,
  buildMoveNodeWriteEntries,
  getLegacyWorkspaceKeysToRetire,
  getNodeMemberKey,
  getNodeMemberKeyPrefix,
  getNodeRecordKey,
  parseNodeRecord,
  nodeIdsFromReplayOps,
  readWorkspaceNodesFromReplayOpIds,
  readWorkspaceNodesFromShared
} from "./lib/workspaceNodeStorage";
import { createInitialReplayState, replayReducer } from "./lib/branchReplay";
import { computeBranchOffsets, computeMaxBranchColumn } from "./lib/replayLayout";
import { decideWriteRouting } from "./lib/writeRouting";
import { applyWorkspaceOpPayload } from "./lib/workspaceProjection";
import {
  WORKSPACE_BRANCHES_KEY,
  buildForkReplayOp,
  getWorkspaceBaselineKey,
  getWorkspaceLiveKey,
  isForkBranchPayload,
  replayBaselineForBranch,
  snapshotBaselineKeysForBranch,
  snapshotLiveKeysForBranch
} from "./lib/workspaceBaselines";

import type {
  DragPresence,
  NodeShape,
  PersistenceEvent,
  RemoteReplayCursor,
  RuntimeBackend,
  SharedBranchRecord,
  SharedReplayOp,
  WorkspaceAnnotation,
  WorkspaceAsset,
  WorkspaceDataKind,
  WorkspaceEdge,
  WorkspaceNode,
  WorkspaceSnapshot,
  WorkspaceTool,
  WriteBranchResolution
} from "./state/workspaceTypes";
import {
  BRANCH_WRITE_PROTECT_MS,
  shortPeerId,
  WORKSPACE_HEIGHT,
  WORKSPACE_WIDTH
} from "./state/workspaceTypes";
import {
  cloneWorkspaceSnapshot,
  emptyWorkspaceSnapshot,
  hasWorkspaceSnapshotContent
} from "./state/snapshot";
import { ReplayControls } from "./features/replay/ReplayControls";
import { PresencePanel } from "./panels/PresencePanel";
import { WorkspaceCanvas } from "./features/canvas/WorkspaceCanvas";
import { clientPointToWorkspace } from "./features/canvas/coords";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const wsClient = new RuntimeClient(config, { pubkeyPrefix: "workspace", maxEvents: 40 });
const sdkClient = new SdkRuntimeClient(config);

function defaultOperatorName(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `operator-${suffix}`;
}

function toolButtonStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    padding: 0,
    borderRadius: 6,
    border: active ? "1px solid #2563eb" : "1px solid #94a3b8",
    background: active ? "#dbeafe" : "#ffffff",
    color: active ? "#1d4ed8" : "#334155"
  };
}

async function waitForConnectionSettle(
  client: { getDiagnostics: () => RuntimeDiagnostics },
  timeoutMs = 1500,
  intervalMs = 150
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = client.getDiagnostics().connectionState;
    if (state === "open" || state === "error" || state === "closed") {
      return;
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }
}

/** Matches the design system's 800px single-column breakpoint. */
function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState(() => window.matchMedia("(min-width: 801px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 801px)");
    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isWide;
}

export default function App() {
  const isWideViewport = useIsWideViewport();
  const [backend, setBackend] = useState<RuntimeBackend>("sdk");
  const [roomIdInput, setRoomIdInput] = useState(config.defaultRoomId);
  const [activeRoomId, setActiveRoomId] = useState<string>(config.defaultRoomId);
  const [isTryingAnotherRoom, setIsTryingAnotherRoom] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(sdkClient.getDiagnostics());
  const [lastAction, setLastAction] = useState<string>("Ready.");
  const [presenceName, setPresenceName] = useState(defaultOperatorName);
  const [peerTarget, setPeerTarget] = useState("");
  const [signalPayload, setSignalPayload] = useState('{"intent":"ping"}');
  const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
  const [presenceByPeer, setPresenceByPeer] = useState<Record<string, string>>({});
  const [remoteDragByPeer, setRemoteDragByPeer] = useState<Record<string, DragPresence>>({});
  const [remoteReplayCursorByPeer, setRemoteReplayCursorByPeer] = useState<Record<string, RemoteReplayCursor>>({});
  const [lastSignalStatus, setLastSignalStatus] = useState("No peer signal sent yet.");
  const [incomingSignals, setIncomingSignals] = useState<string[]>([]);
  const [activeNotice, setActiveNotice] = useState<string>("Connect with npm sdk + wasm to enable collaboration actions.");
  const [persistenceFeed, setPersistenceFeed] = useState<PersistenceEvent[]>([]);
  const [workspaceNodes, setWorkspaceNodes] = useState<WorkspaceNode[]>([]);
  const [workspaceEdges, setWorkspaceEdges] = useState<WorkspaceEdge[]>([]);
  const [workspaceAssets, setWorkspaceAssets] = useState<WorkspaceAsset[]>([]);
  const [workspaceAnnotations, setWorkspaceAnnotations] = useState<WorkspaceAnnotation[]>([]);
  const [branchBaselineById, setBranchBaselineById] = useState<Record<string, WorkspaceSnapshot>>({
    main: emptyWorkspaceSnapshot()
  });
  const branchBaselineByIdRef = useRef(branchBaselineById);
  const frozenBaselineBranchIdsRef = useRef(new Set<string>());
  const [workspaceTool, setWorkspaceTool] = useState<WorkspaceTool>("select");
  const [annotationDraft, setAnnotationDraft] = useState("Decision note");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabelDraft, setEditingLabelDraft] = useState("");
  const [mergeSourceBranchId, setMergeSourceBranchId] = useState("main");
  const [mergeSourceNodeId, setMergeSourceNodeId] = useState<string>("");
  const [replayState, dispatchReplay] = useReducer(
    replayReducer,
    createInitialReplayState(config.defaultRoomId, "main", "main")
  );
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const workspaceSurfaceRef = useRef<HTMLDivElement | null>(null);
  const workspaceNodesRef = useRef<WorkspaceNode[]>([]);
  const workspaceEdgesRef = useRef<WorkspaceEdge[]>([]);
  const workspaceAssetsRef = useRef<WorkspaceAsset[]>([]);
  const workspaceAnnotationsRef = useRef<WorkspaceAnnotation[]>([]);
  const draggingNodeRef = useRef<{ nodeId: string } | null>(null);
  const edgeSourceNodeIdRef = useRef<string | null>(null);
  const dragPresenceLastSentRef = useRef(0);
  const branchCounterRef = useRef(1);
  const suppressWorkspaceRefreshUntilRef = useRef(0);
  const suppressLiveWorkspaceLoadUntilRef = useRef(0);
  const legacyRetireRoomRef = useRef<string | null>(null);
  const forceWorkspaceClearRef = useRef(false);
  const localWriteProtectUntilByKeyRef = useRef<Record<string, number>>({});
  const isDraggingRef = useRef(false);
  const remoteDragByPeerRef = useRef<Record<string, DragPresence>>({});
  const activeBranchIdRef = useRef("main");
  const replayModeRef = useRef<"live" | "playback">(replayState.cursor.mode);
  const replayBranchesRef = useRef(replayState.branches);
  const replayBranchNodeIdsRef = useRef(replayState.branchNodeIds);
  const replayCursorRef = useRef(replayState.cursor);
  const lastPublishedReplayCursorRef = useRef<string | null>(null);
  const replayCursorPresenceLastSentRef = useRef(0);
  const replayCursorPublishTimerRef = useRef<number | null>(null);
  const sharedReplayOpsRef = useRef<SharedReplayOp[]>([]);
  const sharedBranchesRef = useRef<SharedBranchRecord[]>([]);
  const appliedSharedReplayOpIdsRef = useRef<Set<string>>(new Set());
  const lastSharedRawByKeyRef = useRef<Record<string, string | null>>({
    "workspace/nodes/main": null,
    "workspace/edges/main": null,
    "workspace/assets/main": null,
    "workspace/annotations/main": null,
    "workspace/replay-ops": null,
    [WORKSPACE_BRANCHES_KEY]: null
  });

  useEffect(() => {
    branchBaselineByIdRef.current = branchBaselineById;
  }, [branchBaselineById]);

  useEffect(() => {
    remoteDragByPeerRef.current = remoteDragByPeer;
  }, [remoteDragByPeer]);

  function resetWorkspaceForRoomChange(): void {
    forceWorkspaceClearRef.current = true;
    legacyRetireRoomRef.current = null;
    setWorkspaceNodes([]);
    setWorkspaceEdges([]);
    setWorkspaceAssets([]);
    setWorkspaceAnnotations([]);
    setRemoteDragByPeer({});
    setRemoteReplayCursorByPeer({});
    setPresenceByPeer({});
    workspaceNodesRef.current = [];
    workspaceEdgesRef.current = [];
    workspaceAssetsRef.current = [];
    workspaceAnnotationsRef.current = [];
    lastSharedRawByKeyRef.current = {
      "workspace/nodes/main": null,
      "workspace/edges/main": null,
      "workspace/assets/main": null,
      "workspace/annotations/main": null,
      "workspace/replay-ops": null,
      [WORKSPACE_BRANCHES_KEY]: null,
      [ALL_REPLAY_OP_KEY_PREFIX]: null
    };
    localWriteProtectUntilByKeyRef.current = {};
    suppressWorkspaceRefreshUntilRef.current = 0;
    suppressLiveWorkspaceLoadUntilRef.current = 0;
    lastPublishedReplayCursorRef.current = null;
    replayCursorPresenceLastSentRef.current = 0;
    if (replayCursorPublishTimerRef.current !== null) {
      window.clearTimeout(replayCursorPublishTimerRef.current);
      replayCursorPublishTimerRef.current = null;
    }
  }

  useEffect(() => {
    workspaceNodesRef.current = workspaceNodes;
  }, [workspaceNodes]);

  useEffect(() => {
    workspaceEdgesRef.current = workspaceEdges;
  }, [workspaceEdges]);

  useEffect(() => {
    workspaceAssetsRef.current = workspaceAssets;
  }, [workspaceAssets]);

  useEffect(() => {
    workspaceAnnotationsRef.current = workspaceAnnotations;
  }, [workspaceAnnotations]);

  useEffect(() => {
    activeBranchIdRef.current = replayState.activeBranchId;
    replayModeRef.current = replayState.cursor.mode;
    replayBranchesRef.current = replayState.branches;
    replayBranchNodeIdsRef.current = replayState.branchNodeIds;
    replayCursorRef.current = replayState.cursor;
  }, [replayState.activeBranchId, replayState.cursor.mode, replayState.branches, replayState.branchNodeIds, replayState.cursor]);

  useEffect(() => {
    const activeClient = backend === "sdk" ? sdkClient : wsClient;
    const inactiveClient = backend === "sdk" ? wsClient : sdkClient;
    const unsubscribe = activeClient.subscribe(setDiagnostics);
    inactiveClient.disconnect();
    resetWorkspaceForRoomChange();
    activeClient.connect(activeRoomId);
    setActiveNotice(`Connecting to ${activeRoomId} via ${backend === "sdk" ? "npm sdk + wasm" : "direct websocket"}...`);
    dispatchReplay({ type: "reset", roomId: activeRoomId, branchId: "main", branchLabel: "main" });
    activeBranchIdRef.current = "main";
    frozenBaselineBranchIdsRef.current = new Set<string>();
    sharedReplayOpsRef.current = [];
    sharedBranchesRef.current = [];
    appliedSharedReplayOpIdsRef.current = new Set<string>();
    lastSharedRawByKeyRef.current["workspace/replay-ops"] = null;
    lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY] = null;
    setBranchBaselineById({
      main: { doc: "", nodes: [], edges: [], assets: [], annotations: [] }
    });

    return () => {
      unsubscribe();
      activeClient.disconnect();
    };
  }, [backend, activeRoomId]);

  useEffect(() => {
    if (backend !== "sdk") {
      return;
    }

    const unsubscribeRuntime = sdkClient.subscribeRuntimeMessages((payload) => {
      const type = typeof payload.type === "string" ? payload.type : "";

      if (type === "welcome") {
        const peers = Array.isArray(payload.peers)
          ? payload.peers.filter((entry): entry is string => typeof entry === "string")
          : [];
        setOnlinePeers(peers);
        if (peers.length > 0 && !peerTarget) {
          setPeerTarget(peers[0]);
        }
        setActiveNotice(`Connected to ${activeRoomId}. Welcome received with ${peers.length} peer(s).`);
        refreshSharedWorkspace();
        return;
      }

      if (type === "peer-joined") {
        const peerId = typeof payload.peerId === "string" ? payload.peerId : null;
        if (!peerId) {
          return;
        }
        setOnlinePeers((previous) => (previous.includes(peerId) ? previous : [...previous, peerId]));
        if (!peerTarget) {
          setPeerTarget(peerId);
        }
        setLastSignalStatus(`Peer ${shortPeerId(peerId)} joined.`);
        setActiveNotice(`Peer ${shortPeerId(peerId)} joined ${activeRoomId}.`);
        return;
      }

      if (type === "peer-left") {
        const peerId = typeof payload.peerId === "string" ? payload.peerId : null;
        if (!peerId) {
          return;
        }
        setOnlinePeers((previous) => previous.filter((entry) => entry !== peerId));
        setPresenceByPeer((previous) => {
          const next = { ...previous };
          delete next[peerId];
          return next;
        });
        setRemoteReplayCursorByPeer((previous) => {
          if (!(peerId in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[peerId];
          return next;
        });
        setLastSignalStatus(`Peer ${shortPeerId(peerId)} left.`);
        setActiveNotice(`Peer ${shortPeerId(peerId)} left ${activeRoomId}.`);
        return;
      }

      if (type === "presence") {
        const peerId =
          typeof payload.peerId === "string"
            ? payload.peerId
            : typeof payload.fromPeer === "string"
              ? payload.fromPeer
              : typeof payload.from === "string"
                ? payload.from
                : null;
        const data =
          payload.data && typeof payload.data === "object"
            ? payload.data
            : payload.payload && typeof payload.payload === "object"
              ? payload.payload
              : payload;
        const name =
          data && typeof data === "object" && "name" in data && typeof (data as { name?: unknown }).name === "string"
            ? ((data as { name: string }).name ?? "")
            : null;
        if (!peerId || !name) {
          return;
        }
        setPresenceByPeer((previous) => ({ ...previous, [peerId]: name }));
        applyRemoteReplayCursorFromPresence(peerId, data, name);
        const drag =
          data && typeof data === "object" && "drag" in data && typeof (data as { drag?: unknown }).drag === "object"
            ? ((data as { drag: unknown }).drag as {
                active?: unknown;
                nodeId?: unknown;
                x?: unknown;
                y?: unknown;
                branchId?: unknown;
                mode?: unknown;
                atIso?: unknown;
              })
            : null;
        const resolvedDragMode = drag?.mode === "playback" ? "playback" : "live";
        const resolvedDragBranchId =
          typeof drag?.branchId === "string" && drag.branchId.length > 0 ? drag.branchId : activeBranchIdRef.current;
        const sameLiveContext =
          drag &&
          resolvedDragMode === "live" &&
          replayModeRef.current === "live" &&
          resolvedDragBranchId === activeBranchIdRef.current;
        if (
          sameLiveContext &&
          drag.active === true &&
          typeof drag.nodeId === "string" &&
          typeof drag.x === "number" &&
          typeof drag.y === "number"
        ) {
          const dragPresence: DragPresence = {
            nodeId: drag.nodeId,
            x: drag.x,
            y: drag.y,
            branchId: resolvedDragBranchId,
            mode: resolvedDragMode,
            atIso: typeof drag.atIso === "string" ? drag.atIso : new Date().toISOString()
          };
          setRemoteDragByPeer((previous) => ({
            ...previous,
            [peerId]: dragPresence
          }));
        } else {
          setRemoteDragByPeer((previous) => {
            if (!(peerId in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[peerId];
            return next;
          });
          scheduleRemoteDragEndRefresh(peerId);
        }
        setActiveNotice(`Presence updated from ${name}.`);
        return;
      }
      if (type === "presence-update" || type === "presence-updated") {
        const peerId =
          typeof payload.peerId === "string"
            ? payload.peerId
            : typeof payload.fromPeer === "string"
              ? payload.fromPeer
              : typeof payload.from === "string"
                ? payload.from
                : null;
        const data =
          payload.data && typeof payload.data === "object"
            ? payload.data
            : payload.payload && typeof payload.payload === "object"
              ? payload.payload
              : payload;
        if (!peerId || !data || typeof data !== "object") {
          return;
        }
        const name = "name" in data && typeof (data as { name?: unknown }).name === "string" ? (data as { name: string }).name : "";
        if (name) {
          setPresenceByPeer((previous) => ({ ...previous, [peerId]: name }));
        }
        applyRemoteReplayCursorFromPresence(peerId, data, name || peerId.slice(0, 8));
        const dragData =
          "drag" in data && typeof (data as { drag?: unknown }).drag === "object" ? (data as { drag: unknown }).drag : null;
        if (!dragData || typeof dragData !== "object") {
          return;
        }
        const drag = dragData as {
          active?: unknown;
          nodeId?: unknown;
          x?: unknown;
          y?: unknown;
          branchId?: unknown;
          mode?: unknown;
          atIso?: unknown;
        };
        const resolvedDragMode = drag.mode === "playback" ? "playback" : "live";
        const resolvedDragBranchId =
          typeof drag.branchId === "string" && drag.branchId.length > 0 ? drag.branchId : activeBranchIdRef.current;
        const sameLiveContext =
          resolvedDragMode === "live" &&
          replayModeRef.current === "live" &&
          resolvedDragBranchId === activeBranchIdRef.current;
        if (
          sameLiveContext &&
          drag.active === true &&
          typeof drag.nodeId === "string" &&
          typeof drag.x === "number" &&
          typeof drag.y === "number"
        ) {
          const dragPresence: DragPresence = {
            nodeId: drag.nodeId,
            x: drag.x,
            y: drag.y,
            branchId: resolvedDragBranchId,
            mode: resolvedDragMode,
            atIso: typeof drag.atIso === "string" ? drag.atIso : new Date().toISOString()
          };
          setRemoteDragByPeer((previous) => ({
            ...previous,
            [peerId]: dragPresence
          }));
        } else {
          setRemoteDragByPeer((previous) => {
            if (!(peerId in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[peerId];
            return next;
          });
          scheduleRemoteDragEndRefresh(peerId);
        }
        return;
      }

      if (type === "workspace.signal") {
        const from = typeof payload.from === "string" ? payload.from : "unknown";
        const at = new Date().toLocaleTimeString();
        setIncomingSignals((previous) => [`${at} from ${from}`, ...previous].slice(0, 8));
        setLastSignalStatus(`Received workspace.signal from ${from}.`);
        setActiveNotice(`Incoming peer signal from ${from}.`);
      }

      if (type === "pack-applied") {
        const fromPeer = typeof payload.from === "string" ? payload.from : null;
        const isServerPack = fromPeer === "server";
        const isRemotePeerPack = Boolean(fromPeer) && !isServerPack && !isLocalPeer(fromPeer);
        if (!isRemotePeerPack && !isServerPack) {
          return;
        }
        refreshSharedWorkspace({ force: true, isRemotePack: true });
        return;
      }
      if (type === "runtime-reconnected") {
        refreshSharedWorkspace({ force: true });
        setActiveNotice(`Reconnected to ${activeRoomId}.`);
        return;
      }
      if (type === "peer-joined" || type === "peer-left") {
        refreshSharedWorkspace({ force: true });
        return;
      }
      if (type === "commit" || type === "delta" || type === "shared-value-updated") {
        refreshSharedWorkspace({ force: true });
      }
    });

    return () => {
      unsubscribeRuntime();
      setOnlinePeers([]);
      setPresenceByPeer({});
      setRemoteDragByPeer({});
      setIncomingSignals([]);
    };
  }, [backend, peerTarget, activeRoomId, replayState.activeBranchId, replayState.cursor.mode]);

  useEffect(() => {
    if (diagnostics.connectionState === "error") {
      setActiveNotice(`Connection error: ${diagnostics.lastError ?? "unknown runtime error"}`);
      return;
    }
    if (diagnostics.connectionState === "closed") {
      setActiveNotice("Disconnected. Reconnect to continue collaboration.");
      return;
    }
    if (diagnostics.connectionState === "connecting") {
      setActiveNotice(`Connecting to ${activeRoomId}... (sdk will auto-reconnect if the host drops)`);
    }
  }, [diagnostics.connectionState, diagnostics.lastError, activeRoomId]);

  useEffect(() => {
    if (backend === "sdk" && diagnostics.connectionState === "open") {
      window.setTimeout(() => {
        retireLegacyWorkspaceKeys(activeBranchIdRef.current || "main");
      }, 500);
      refreshSharedWorkspace();
    }
  }, [backend, diagnostics.connectionState, activeRoomId]);

  const canConnect = useMemo(() => roomIdInput.trim().length > 0, [roomIdInput]);
  const isSdkConnected = backend === "sdk" && diagnostics.connectionState === "open";
  const canUseSdkActions = isSdkConnected;
  const replayNodeIds = replayState.branchNodeIds[replayState.cursor.branchId] ?? [];
  const replayNodeCount = replayNodeIds.length;
  const currentReplayNode =
    replayState.cursor.nodeId && replayState.nodesById[replayState.cursor.nodeId]
      ? replayState.nodesById[replayState.cursor.nodeId]
      : null;
  const replayCanStep = replayNodeCount > 0;
  const isCursorAtHead = replayNodeCount > 0 && replayState.cursor.nodeIndex >= replayNodeCount - 1;
  const availableBranchIds = Object.keys(replayState.branches);
  const mergeSourceBranchNodeIds = replayState.branchNodeIds[mergeSourceBranchId] ?? [];
  const sourceBranchInfo = replayState.branches[mergeSourceBranchId];
  const activeBranchInfo = replayState.branches[replayState.activeBranchId];
  const remoteDragByNodeId = useMemo(() => {
    const next: Record<string, { x: number; y: number; peerId: string; atIso: string }> = {};
    for (const [peerId, drag] of Object.entries(remoteDragByPeer)) {
      const existing = next[drag.nodeId];
      if (!existing || drag.atIso.localeCompare(existing.atIso) >= 0) {
        next[drag.nodeId] = {
          x: drag.x,
          y: drag.y,
          peerId,
          atIso: drag.atIso
        };
      }
    }
    return next;
  }, [remoteDragByPeer]);
  const canvasReplayBadge = useMemo(() => {
    const cursorNode = replayState.cursor.nodeId ? replayState.nodesById[replayState.cursor.nodeId] : null;
    const modeLabel = replayState.cursor.mode === "live" ? "live" : "playback";
    const cursorLabel = cursorNode ? `${replayState.cursor.nodeIndex}:${cursorNode.nodeId}` : `${replayState.cursor.nodeIndex}:(none)`;
    return `branch ${replayState.activeBranchId} | ${modeLabel} | cursor ${cursorLabel}`;
  }, [replayState.activeBranchId, replayState.cursor.mode, replayState.cursor.nodeIndex, replayState.cursor.nodeId, replayState.nodesById]);
  const sortedBranchIds = useMemo(() => {
    return [...availableBranchIds].sort((leftId, rightId) => {
      const left = replayState.branches[leftId];
      const right = replayState.branches[rightId];
      if (left?.isMain && !right?.isMain) {
        return -1;
      }
      if (!left?.isMain && right?.isMain) {
        return 1;
      }
      return leftId.localeCompare(rightId);
    });
  }, [availableBranchIds, replayState.branches]);
  const branchOffsetById = useMemo(() => {
    return computeBranchOffsets(sortedBranchIds, replayState.branches, replayState.branchNodeIds);
  }, [sortedBranchIds, replayState.branches, replayState.branchNodeIds]);
  const maxBranchColumn = useMemo(() => {
    return computeMaxBranchColumn(sortedBranchIds, branchOffsetById, replayState.branchNodeIds);
  }, [sortedBranchIds, branchOffsetById, replayState.branchNodeIds]);
  const laneLayout = useMemo(() => {
    // Fixed 64px slots up to 10 columns; past that, compress the spacing so
    // the lane SVG stops growing rightward instead of stretching the page.
    const baseSlotWidth = 64;
    const maxTimelineSpan = baseSlotWidth * 10;
    const columns = maxBranchColumn + 1;
    const slotWidth = columns > 10 ? Math.max(20, Math.floor(maxTimelineSpan / columns)) : baseSlotWidth;
    const laneHeight = 54;
    const leftGutter = 190;
    const topGutter = 16;
    const laneY: Record<string, number> = {};
    const nodeXByBranch: Record<string, Record<string, number>> = {};
    sortedBranchIds.forEach((branchId, laneIndex) => {
      laneY[branchId] = topGutter + laneIndex * laneHeight + 18;
      const nodes = replayState.branchNodeIds[branchId] ?? [];
      const offset = branchOffsetById[branchId] ?? 0;
      nodeXByBranch[branchId] = {};
      nodes.forEach((nodeId, nodeIndex) => {
        const globalColumn = offset + nodeIndex;
        nodeXByBranch[branchId][nodeId] = leftGutter + globalColumn * slotWidth + slotWidth / 2;
      });
    });
    return {
      slotWidth,
      laneHeight,
      leftGutter,
      topGutter,
      width: Math.max(leftGutter + (maxBranchColumn + 1) * slotWidth + 40, leftGutter + 220),
      height: topGutter + sortedBranchIds.length * laneHeight + 10,
      laneY,
      nodeXByBranch
    };
  }, [sortedBranchIds, replayState.branchNodeIds, branchOffsetById, maxBranchColumn]);
  const mergeConnectors = useMemo(() => {
    return replayState.merges
      .map((merge) => {
        const sourceY = laneLayout.laneY[merge.sourceBranchId];
        const targetY = laneLayout.laneY[merge.targetBranchId];
        const sourceX = laneLayout.nodeXByBranch[merge.sourceBranchId]?.[merge.sourceNodeId];
        const targetX = laneLayout.nodeXByBranch[merge.targetBranchId]?.[merge.targetNextHeadNodeId];
        if (typeof sourceX !== "number" || typeof sourceY !== "number" || typeof targetX !== "number" || typeof targetY !== "number") {
          return null;
        }
        const midX = sourceX + (targetX - sourceX) * 0.5;
        return {
          id: merge.mergeNodeId,
          path: `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`,
          sourceX,
          sourceY,
          targetX,
          targetY
        };
      })
      .filter((entry): entry is { id: string; path: string; sourceX: number; sourceY: number; targetX: number; targetY: number } => Boolean(entry));
  }, [replayState.merges, laneLayout]);
  const mergeEligibilityMessage = useMemo(() => {
    if (!mergeSourceNodeId) {
      return "Select a source branch node to prepare a merge.";
    }
    if (!sourceBranchInfo || !activeBranchInfo) {
      return "Merge unavailable: missing branch metadata.";
    }
    if (mergeSourceBranchId === replayState.activeBranchId) {
      return "Merging within the same branch creates synthetic combine nodes; use with care.";
    }
    return `Merge ${mergeSourceBranchId}:${mergeSourceNodeId} into ${replayState.activeBranchId} head ${activeBranchInfo.headNodeId ?? "n/a"}.`;
  }, [mergeSourceNodeId, sourceBranchInfo, activeBranchInfo, mergeSourceBranchId, replayState.activeBranchId]);

  function parseWorkspaceNodes(raw: string | null): WorkspaceNode[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is WorkspaceNode =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as WorkspaceNode).id === "string" &&
            typeof (entry as WorkspaceNode).x === "number" &&
            typeof (entry as WorkspaceNode).y === "number" &&
            typeof (entry as WorkspaceNode).label === "string" &&
            typeof (entry as WorkspaceNode).updatedAtIso === "string"
        )
        .map((entry) => ({
          ...entry,
          x: Math.max(16, Math.min(WORKSPACE_WIDTH - 120, entry.x)),
          y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 52, entry.y))
        }));
    } catch {
      return [];
    }
  }

  function markLocalCanvasWrite(): void {
    const until = Date.now() + 3000;
    suppressWorkspaceRefreshUntilRef.current = until;
    suppressLiveWorkspaceLoadUntilRef.current = until;
  }

  function sharedWriteApplied(result: SharedWriteResult): boolean {
    return result.applied;
  }

  function pushSyncWarningIfNeeded(result: SharedWriteResult, actionLabel: string): void {
    if (result.applied && !result.pushed) {
      setActiveNotice(`${actionLabel} updated locally; server pack was skipped — check diagnostics or reconnect.`);
    }
  }

  function pushPersistenceEvent(key: string, action: string, detail: string) {
    const item: PersistenceEvent = {
      atIso: new Date().toISOString(),
      key,
      action,
      detail
    };
    setPersistenceFeed((previous) => [item, ...previous].slice(0, 18));
  }

  function createWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      doc: "",
      nodes: workspaceNodesRef.current.map((entry) => ({ ...entry })),
      edges: workspaceEdgesRef.current.map((entry) => ({ ...entry })),
      assets: workspaceAssetsRef.current.map((entry) => ({ ...entry })),
      annotations: workspaceAnnotationsRef.current.map((entry) => ({ ...entry }))
    };
  }

  function parseSharedReplayOps(raw: string | null): SharedReplayOp[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is SharedReplayOp =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as SharedReplayOp).id === "string" &&
            typeof (entry as SharedReplayOp).branchId === "string" &&
            typeof (entry as SharedReplayOp).opSummary === "string" &&
            typeof (entry as SharedReplayOp).payloadRef === "string" &&
            typeof (entry as SharedReplayOp).atIso === "string" &&
            typeof (entry as SharedReplayOp).payload === "object" &&
            Boolean((entry as SharedReplayOp).payload)
        )
        .sort((left, right) => left.atIso.localeCompare(right.atIso));
    } catch {
      return [];
    }
  }

  function parseSharedBranches(raw: string | null): SharedBranchRecord[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is SharedBranchRecord =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as SharedBranchRecord).branchId === "string" &&
            typeof (entry as SharedBranchRecord).roomId === "string" &&
            typeof (entry as SharedBranchRecord).label === "string" &&
            typeof (entry as SharedBranchRecord).createdAtIso === "string"
        )
        .sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
    } catch {
      return [];
    }
  }

  function syncBranchesFromSharedRecords(records: SharedBranchRecord[]) {
    const baselineSeed: Record<string, WorkspaceSnapshot> = {};
    for (const record of records) {
      dispatchReplay({
        type: "register-branch",
        branchId: record.branchId,
        roomId: record.roomId,
        label: record.label,
        basedOnBranchId: record.basedOnBranchId,
        basedOnNodeId: record.basedOnNodeId
      });
      if (record.branchId === "main") {
        continue;
      }
      if (frozenBaselineBranchIdsRef.current.has(record.branchId)) {
        continue;
      }
      if (hasWorkspaceSnapshotContent(branchBaselineByIdRef.current[record.branchId] ?? emptyWorkspaceSnapshot())) {
        continue;
      }
      const hydrated = readWorkspaceBaselineForBranch(record.branchId);
      if (!hasWorkspaceSnapshotContent(hydrated)) {
        continue;
      }
      baselineSeed[record.branchId] = hydrated;
      frozenBaselineBranchIdsRef.current.add(record.branchId);
    }
    if (Object.keys(baselineSeed).length > 0) {
      setBranchBaselineById((previous) => ({
        ...previous,
        ...baselineSeed
      }));
    }
  }

  function getWorkspaceSharedKey(branchId: string, kind: WorkspaceDataKind): string {
    return getWorkspaceLiveKey(branchId, kind);
  }

  function readSharedBaselineValue(
    branchId: string,
    kind: WorkspaceDataKind,
    options?: { preferCanonical?: boolean }
  ): string | null {
    return sdkClient.getSharedValue(getWorkspaceBaselineKey(branchId, kind), { canonical: options?.preferCanonical });
  }

  function getLegacyWorkspaceSharedKey(kind: WorkspaceDataKind): string | null {
    if (kind === "doc") {
      return "workspace/doc/main";
    }
    return `workspace/${kind}`;
  }

  function readSharedWorkspaceValue(
    branchId: string,
    kind: WorkspaceDataKind,
    options?: { preferCanonical?: boolean }
  ): string | null {
    const readKey = (key: string) => sdkClient.getSharedValue(key, { canonical: options?.preferCanonical });
    const primary = readKey(getWorkspaceSharedKey(branchId, kind));
    if (primary !== null) {
      return primary;
    }
    if (branchId !== "main") {
      return null;
    }
    const legacyKey = getLegacyWorkspaceSharedKey(kind);
    return legacyKey ? readKey(legacyKey) : null;
  }

  function isLocalPeer(peerId: string | null): boolean {
    if (!peerId) {
      return false;
    }
    const localPubkey = sdkClient.getLocalPubkey();
    return Boolean(localPubkey && peerId === localPubkey);
  }

  function applyRemoteReplayCursorFromPresence(peerId: string, data: unknown, peerName: string): void {
    if (isLocalPeer(peerId) || !data || typeof data !== "object") {
      return;
    }
    const replayCursor =
      "replayCursor" in data && typeof (data as { replayCursor?: unknown }).replayCursor === "object"
        ? (data as { replayCursor: unknown }).replayCursor
        : null;
    if (!replayCursor || typeof replayCursor !== "object") {
      return;
    }
    const cursor = replayCursor as {
      branchId?: unknown;
      nodeIndex?: unknown;
      replayNodeId?: unknown;
      mode?: unknown;
      atIso?: unknown;
    };
    if (typeof cursor.branchId !== "string" || cursor.branchId.length === 0) {
      return;
    }
    if (typeof cursor.nodeIndex !== "number" || !Number.isFinite(cursor.nodeIndex)) {
      return;
    }
    const branchId = cursor.branchId;
    const nodeIndex = Math.max(0, Math.floor(cursor.nodeIndex));
    const replayNodeId =
      typeof cursor.replayNodeId === "string" && cursor.replayNodeId.length > 0 ? cursor.replayNodeId : null;
    setRemoteReplayCursorByPeer((previous) => ({
      ...previous,
      [peerId]: {
        branchId,
        nodeIndex,
        replayNodeId,
        mode: cursor.mode === "playback" ? "playback" : "live",
        name: peerName,
        atIso: typeof cursor.atIso === "string" ? cursor.atIso : new Date().toISOString()
      }
    }));
  }

  function buildPresencePayload(options?: {
    drag?: Record<string, unknown> | null;
    includeReplayCursor?: boolean;
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: presenceName.trim() || "operator",
      room: activeRoomId,
      updatedAtIso: new Date().toISOString()
    };
    if (options?.includeReplayCursor) {
      const cursor = replayCursorRef.current;
      const branchNodeIds = replayBranchNodeIdsRef.current[cursor.branchId] ?? [];
      const cursorNodeIndex = Math.min(Math.max(0, cursor.nodeIndex), Math.max(0, branchNodeIds.length - 1));
      payload.replayCursor = {
        branchId: cursor.branchId,
        nodeIndex: cursorNodeIndex,
        replayNodeId: cursor.nodeId,
        mode: cursor.mode,
        atIso: new Date().toISOString()
      };
    }
    if (options?.drag) {
      payload.drag = options.drag;
    }
    return payload;
  }

  function replayCursorPresenceFingerprint(): string {
    const cursor = replayCursorRef.current;
    const branchNodeIds = replayBranchNodeIdsRef.current[cursor.branchId] ?? [];
    const cursorNodeIndex = Math.min(Math.max(0, cursor.nodeIndex), Math.max(0, branchNodeIds.length - 1));
    return `${cursor.branchId}:${cursorNodeIndex}:${cursor.mode}:${cursor.nodeId ?? ""}`;
  }

  function publishReplayCursorPresence(options?: { force?: boolean }): void {
    if (!canUseSdkActions) {
      return;
    }
    const fingerprint = replayCursorPresenceFingerprint();
    if (!options?.force && fingerprint === lastPublishedReplayCursorRef.current) {
      return;
    }
    lastPublishedReplayCursorRef.current = fingerprint;
    replayCursorPresenceLastSentRef.current = Date.now();
    sdkClient.setPresence(buildPresencePayload({ includeReplayCursor: true }));
  }

  function scheduleReplayCursorPresencePublish(options?: { force?: boolean }): void {
    if (!canUseSdkActions) {
      return;
    }
    if (options?.force) {
      if (replayCursorPublishTimerRef.current !== null) {
        window.clearTimeout(replayCursorPublishTimerRef.current);
        replayCursorPublishTimerRef.current = null;
      }
      publishReplayCursorPresence({ force: true });
      return;
    }
    if (replayCursorPublishTimerRef.current !== null) {
      window.clearTimeout(replayCursorPublishTimerRef.current);
    }
    replayCursorPublishTimerRef.current = window.setTimeout(() => {
      replayCursorPublishTimerRef.current = null;
      publishReplayCursorPresence();
    }, 450);
  }

  function laneXForRemoteReplayCursor(remoteCursor: RemoteReplayCursor): number | undefined {
    const branchId = remoteCursor.branchId;
    const branchNodeIds = replayState.branchNodeIds[branchId] ?? [];
    const candidates: string[] = [];
    if (remoteCursor.replayNodeId) {
      candidates.push(remoteCursor.replayNodeId);
    }
    const byIndex = branchNodeIds[remoteCursor.nodeIndex];
    if (byIndex) {
      candidates.push(byIndex);
    }
    for (const nodeId of candidates) {
      const x = laneLayout.nodeXByBranch[branchId]?.[nodeId];
      if (typeof x === "number") {
        return x;
      }
    }
    return undefined;
  }

  function shouldApplySharedKeyWrite(
    key: string,
    incomingRaw: string | null,
    options?: { isRemotePack?: boolean }
  ): boolean {
    if (incomingRaw === null) {
      return false;
    }
    if (isDraggingRef.current) {
      return false;
    }
    const expected = lastSharedRawByKeyRef.current[key] ?? null;
    const protectUntil = localWriteProtectUntilByKeyRef.current[key] ?? 0;
    if (Date.now() < protectUntil && expected !== null && incomingRaw !== expected) {
      return options?.isRemotePack === true;
    }
    return true;
  }

  function scheduleRemoteDragEndRefresh(peerId: string | null): void {
    if (!peerId || isLocalPeer(peerId)) {
      return;
    }
    if (!(peerId in remoteDragByPeerRef.current)) {
      return;
    }
    queueMicrotask(() =>
      refreshSharedWorkspace({ force: true, isRemotePack: true })
    );
  }

  function readSharedKey(key: string, options?: { preferCanonical?: boolean }): string | null {
    return sdkClient.getSharedValue(key, options?.preferCanonical ? { canonical: true } : undefined);
  }

  function listSharedKeys(prefix: string): string[] {
    const direct = sdkClient.listSharedKeysByPrefix(prefix);
    if (direct.length > 0) {
      return direct;
    }
    return sdkClient.getAllSharedKeys().filter((key) => key.startsWith(prefix));
  }

  function readReplayOpsForBranch(branchId: string, options?: { preferCanonical?: boolean }): SharedReplayOp[] {
    return readReplayOpsFromShared(branchId, (key) => readSharedKey(key, options), listSharedKeys);
  }

  function mergeWorkspaceNodesById(...lists: WorkspaceNode[][]): WorkspaceNode[] {
    const byId = new Map<string, WorkspaceNode>();
    for (const list of lists) {
      for (const node of list) {
        byId.set(node.id, node);
      }
    }
    return Array.from(byId.values()).sort((left, right) => right.updatedAtIso.localeCompare(left.updatedAtIso));
  }

  function readBranchBaselineNodes(branchId: string): WorkspaceNode[] {
    if (branchId === "main") {
      return [];
    }
    const cached = branchBaselineByIdRef.current[branchId];
    if (cached && cached.nodes.length > 0) {
      return cached.nodes.map((entry) => ({ ...entry }));
    }
    return readWorkspaceBaselineForBranch(branchId).nodes;
  }

  function resolveNodeRecordForBranch(branchId: string, nodeId: string): WorkspaceNode | null {
    const direct = parseNodeRecord(readSharedKey(getNodeRecordKey(branchId, nodeId)));
    if (direct) {
      return direct;
    }
    const fromBaseline = readBranchBaselineNodes(branchId).find((entry) => entry.id === nodeId);
    if (fromBaseline) {
      return fromBaseline;
    }
    const branch = replayBranchesRef.current[branchId];
    const parentBranchId = branch?.basedOnBranchId;
    if (parentBranchId) {
      const fromParent = parseNodeRecord(readSharedKey(getNodeRecordKey(parentBranchId, nodeId)));
      if (fromParent) {
        return fromParent;
      }
      if (parentBranchId !== "main") {
        const fromParentBaseline = readBranchBaselineNodes(parentBranchId).find((entry) => entry.id === nodeId);
        if (fromParentBaseline) {
          return fromParentBaseline;
        }
      }
    }
    return null;
  }

  function readWorkspaceNodesForBranch(branchId: string, options?: { preferCanonical?: boolean }): WorkspaceNode[] {
    const readShared = (key: string) => readSharedKey(key, options);
    const fromLive = readWorkspaceNodesFromShared(branchId, readShared, listSharedKeys);
    let branchLiveNodes = fromLive;
    if (branchLiveNodes.length === 0) {
      const replayOps =
        sharedReplayOpsRef.current.length > 0
          ? sharedReplayOpsRef.current.filter((entry) => entry.branchId === branchId)
          : readReplayOpsForBranch(branchId, options);
      const replayIds = nodeIdsFromReplayOps(replayOps);
      if (replayIds.length > 0) {
        branchLiveNodes = readWorkspaceNodesFromReplayOpIds(branchId, replayIds, readShared);
      }
    }
    if (branchId === "main") {
      return branchLiveNodes;
    }
    return mergeWorkspaceNodesById(readBranchBaselineNodes(branchId), branchLiveNodes);
  }

  function retireLegacyWorkspaceKeys(branchId: string): void {
    if (backend !== "sdk") {
      return;
    }
    if (legacyRetireRoomRef.current === activeRoomId) {
      return;
    }
    legacyRetireRoomRef.current = activeRoomId;
    for (const key of getLegacyWorkspaceKeysToRetire(branchId)) {
      if (readSharedKey(key) === null) {
        continue;
      }
      sdkClient.deleteSharedValue(key);
    }
  }

  function readWorkspaceBaselineForBranch(branchId: string): WorkspaceSnapshot {
    const docRaw = readSharedBaselineValue(branchId, "doc");
    const nodesRaw = readSharedBaselineValue(branchId, "nodes");
    const edgesRaw = readSharedBaselineValue(branchId, "edges");
    const assetsRaw = readSharedBaselineValue(branchId, "assets");
    const annotationsRaw = readSharedBaselineValue(branchId, "annotations");
    return {
      doc: docRaw ?? "",
      nodes: parseWorkspaceNodes(nodesRaw),
      edges: parseWorkspaceEdges(edgesRaw),
      assets: parseWorkspaceAssets(assetsRaw),
      annotations: parseWorkspaceAnnotations(annotationsRaw)
    };
  }

  function readWorkspaceSnapshotForBranch(branchId: string): WorkspaceSnapshot {
    const docRaw = readSharedWorkspaceValue(branchId, "doc");
    const edgesRaw = readSharedWorkspaceValue(branchId, "edges");
    const assetsRaw = readSharedWorkspaceValue(branchId, "assets");
    const annotationsRaw = readSharedWorkspaceValue(branchId, "annotations");
    return {
      doc: docRaw ?? "",
      nodes: readWorkspaceNodesForBranch(branchId),
      edges: parseWorkspaceEdges(edgesRaw),
      assets: parseWorkspaceAssets(assetsRaw),
      annotations: parseWorkspaceAnnotations(annotationsRaw)
    };
  }

  function markSharedKeysWriteProtected(keys: string[], protectMs = BRANCH_WRITE_PROTECT_MS): void {
    const until = Date.now() + protectMs;
    for (const key of keys) {
      localWriteProtectUntilByKeyRef.current[key] = until;
    }
  }

  function applyLiveSnapshotWriteTracking(branchId: string, snapshot: WorkspaceSnapshot): void {
    const entries = snapshotLiveKeysForBranch(branchId, snapshot);
    for (const entry of entries) {
      lastSharedRawByKeyRef.current[entry.key] = entry.value;
    }
    markSharedKeysWriteProtected(entries.map((entry) => entry.key));
  }

  function applyBaselineSnapshotWriteTracking(branchId: string, snapshot: WorkspaceSnapshot): void {
    const entries = snapshotBaselineKeysForBranch(branchId, snapshot);
    for (const entry of entries) {
      lastSharedRawByKeyRef.current[entry.key] = entry.value;
    }
    markSharedKeysWriteProtected(entries.map((entry) => entry.key), BRANCH_WRITE_PROTECT_MS * 4);
  }

  function persistWorkspaceSnapshotForBranch(branchId: string, snapshot: WorkspaceSnapshot, reason: string): boolean {
    if (backend !== "sdk") {
      setLastAction("Workspace branch persistence requires runtime mode = npm sdk + wasm.");
      return false;
    }
    const entries = snapshotLiveKeysForBranch(branchId, snapshot);
    const writeResult = sdkClient.setSharedValues(entries);
    if (!sharedWriteApplied(writeResult)) {
      setLastAction(`Branch live snapshot persistence failed for ${branchId}.`);
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, `Branch live snapshot for ${branchId}`);
    applyLiveSnapshotWriteTracking(branchId, snapshot);
    pushPersistenceEvent(`workspace/live/${branchId}`, "write", reason);
    return true;
  }

  function persistBranchCreation(record: SharedBranchRecord, baseline: WorkspaceSnapshot, reason: string): boolean {
    if (backend !== "sdk") {
      setLastAction("Branch persistence requires runtime mode = npm sdk + wasm.");
      return false;
    }
    const existing = parseSharedBranches(sdkClient.getSharedValue(WORKSPACE_BRANCHES_KEY));
    const has = existing.some((entry) => entry.branchId === record.branchId);
    const nextBranches = has
      ? existing
      : [...existing, record].sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
    const branchesRaw = JSON.stringify(nextBranches);
    const existingOps = readReplayOpsForBranch(record.branchId);
    const forkOp = buildForkReplayOp(record);
    const hasForkOp = existingOps.some((entry) => entry.id === forkOp.id);
    const nextOps = hasForkOp
      ? existingOps
      : [...existingOps, forkOp].sort((left, right) => left.atIso.localeCompare(right.atIso));
    const forkReplayEntries = hasForkOp ? [] : buildAppendReplayOpWriteEntries(record.branchId, forkOp);
    const branchId = record.branchId;
    const seededNodes = baseline.nodes.map((entry) => ({ ...entry }));
    const entries = [
      { key: WORKSPACE_BRANCHES_KEY, value: branchesRaw },
      ...snapshotBaselineKeysForBranch(branchId, baseline),
      { key: getWorkspaceSharedKey(branchId, "doc"), value: baseline.doc },
      { key: getWorkspaceSharedKey(branchId, "edges"), value: JSON.stringify(baseline.edges) },
      { key: getWorkspaceSharedKey(branchId, "assets"), value: JSON.stringify(baseline.assets) },
      {
        key: getWorkspaceSharedKey(branchId, "annotations"),
        value: JSON.stringify(baseline.annotations)
      },
      ...buildSeedBranchNodesWriteEntries(branchId, seededNodes),
      ...forkReplayEntries
    ];
    const writeResult = sdkClient.setSharedValues(entries);
    if (!sharedWriteApplied(writeResult)) {
      setLastAction(`Branch persistence failed for ${record.branchId}.`);
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, `Branch ${record.branchId}`);
    lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY] = branchesRaw;
    if (!hasForkOp) {
      trackReplayOpWriteProtection(record.branchId, forkOp);
    }
    localWriteProtectUntilByKeyRef.current[WORKSPACE_BRANCHES_KEY] = Date.now() + BRANCH_WRITE_PROTECT_MS;
    applyBaselineSnapshotWriteTracking(record.branchId, baseline);
    applyLiveSnapshotWriteTracking(record.branchId, baseline);
    sharedBranchesRef.current = nextBranches;
    sharedReplayOpsRef.current = nextOps;
    frozenBaselineBranchIdsRef.current.add(record.branchId);
    setBranchBaselineById((previous) => ({
      ...previous,
      [record.branchId]: cloneWorkspaceSnapshot(baseline)
    }));
    syncReplayFromSharedOps(nextOps);
    syncLocalReplayFingerprint();
    pushPersistenceEvent(WORKSPACE_BRANCHES_KEY, "write", reason);
    pushPersistenceEvent(`workspace/baseline/${record.branchId}`, "write", reason);
    pushPersistenceEvent(`workspace/live/${record.branchId}`, "write", reason);
    return true;
  }

  function hydrateBranchBaselinesFromStorage(branchIds: string[]) {
    if (backend !== "sdk") {
      return;
    }
    const uniqueBranchIds = Array.from(new Set(branchIds.filter((entry) => typeof entry === "string" && entry.length > 0)));
    if (uniqueBranchIds.length === 0) {
      return;
    }
    setBranchBaselineById((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const branchId of uniqueBranchIds) {
        if (branchId === "main") {
          continue;
        }
        if (frozenBaselineBranchIdsRef.current.has(branchId)) {
          continue;
        }
        const current = previous[branchId] ?? emptyWorkspaceSnapshot();
        if (hasWorkspaceSnapshotContent(current)) {
          continue;
        }
        const hydrated = readWorkspaceBaselineForBranch(branchId);
        if (!hasWorkspaceSnapshotContent(hydrated)) {
          continue;
        }
        next[branchId] = cloneWorkspaceSnapshot(hydrated);
        frozenBaselineBranchIdsRef.current.add(branchId);
        changed = true;
      }
      return changed ? next : previous;
    });
  }

  function applyForkBranchReplayOp(op: SharedReplayOp): void {
    if (!isForkBranchPayload(op.payload)) {
      return;
    }
    const record = op.payload.branch;
    dispatchReplay({
      type: "register-branch",
      branchId: record.branchId,
      roomId: record.roomId,
      label: record.label,
      basedOnBranchId: record.basedOnBranchId,
      basedOnNodeId: record.basedOnNodeId
    });
    if (record.branchId === "main") {
      return;
    }
    const baseline = readWorkspaceBaselineForBranch(record.branchId);
    if (!hasWorkspaceSnapshotContent(baseline)) {
      return;
    }
    frozenBaselineBranchIdsRef.current.add(record.branchId);
    setBranchBaselineById((previous) => ({
      ...previous,
      [record.branchId]: cloneWorkspaceSnapshot(baseline)
    }));
  }

  function syncReplayFromSharedOps(sharedOps: SharedReplayOp[]) {
    const sortedOps = [...sharedOps].sort((left, right) => left.atIso.localeCompare(right.atIso));
    for (const op of sortedOps) {
      if (appliedSharedReplayOpIdsRef.current.has(op.id)) {
        continue;
      }
      if (isForkBranchPayload(op.payload)) {
        applyForkBranchReplayOp(op);
        appliedSharedReplayOpIdsRef.current.add(op.id);
        continue;
      }
      dispatchReplay({
        type: "append-branch-node",
        branchId: op.branchId,
        roomId: replayBranchesRef.current[op.branchId]?.roomId ?? activeRoomId,
        opSummary: op.opSummary,
        payloadJson: JSON.stringify(op.payload),
        payloadRef: op.payloadRef,
        replayOpId: op.id,
        atIso: op.atIso
      });
      appliedSharedReplayOpIdsRef.current.add(op.id);
    }
  }

  function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot, source: "runtime" | "replay") {
    setWorkspaceNodes(snapshot.nodes.map((entry) => ({ ...entry })));
    setWorkspaceEdges(snapshot.edges.map((entry) => ({ ...entry })));
    setWorkspaceAssets(snapshot.assets.map((entry) => ({ ...entry })));
    setWorkspaceAnnotations(snapshot.annotations.map((entry) => ({ ...entry })));
  }

  function loadLiveWorkspaceForBranch(branchId: string): void {
    if (backend !== "sdk" || isDraggingRef.current) {
      return;
    }
    if (Date.now() < suppressLiveWorkspaceLoadUntilRef.current) {
      return;
    }
    const live = readWorkspaceSnapshotForBranch(branchId);
    if (hasWorkspaceSnapshotContent(live)) {
      const preserveLocalNodes =
        !forceWorkspaceClearRef.current &&
        live.nodes.length === 0 &&
        workspaceNodesRef.current.length > 0;
      const snapshot = preserveLocalNodes
        ? { ...live, nodes: workspaceNodesRef.current.map((entry) => ({ ...entry })) }
        : live;
      applyWorkspaceSnapshot(snapshot, "runtime");
      return;
    }
    const branchReplayIds = replayBranchNodeIdsRef.current[branchId] ?? [];
    const headIndex = branchReplayIds.length === 0 ? -1 : branchReplayIds.length - 1;
    const projected = projectReplayWorkspaceSnapshotFor(branchId, headIndex);
    applyWorkspaceSnapshot(projected, "runtime");
  }

  function projectReplayWorkspaceSnapshotFor(branchId: string, nodeIndex: number): WorkspaceSnapshot {
    const nodes = replayState.branchNodeIds[branchId] ?? [];
    const baseline = replayBaselineForBranch(branchId, branchBaselineById) as WorkspaceSnapshot;
    const projected: WorkspaceSnapshot = cloneWorkspaceSnapshot(baseline);
    if (nodes.length === 0 || nodeIndex < 0) {
      return projected;
    }
    const maxIndex = Math.min(nodeIndex, nodes.length - 1);
    for (let index = 0; index <= maxIndex; index += 1) {
      const nodeId = nodes[index];
      const replayNode = replayState.nodesById[nodeId];
      if (!replayNode) {
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(replayNode.payloadJson);
      } catch {
        continue;
      }
      applyWorkspaceOpPayload(projected, payload, (opNodeId) => resolveNodeRecordForBranch(branchId, opNodeId));
    }
    return projected;
  }

  function projectReplayWorkspaceSnapshot(): WorkspaceSnapshot {
    return projectReplayWorkspaceSnapshotFor(replayState.cursor.branchId, replayState.cursor.nodeIndex);
  }

  function parseWorkspaceEdges(raw: string | null): WorkspaceEdge[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (entry): entry is WorkspaceEdge =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as WorkspaceEdge).id === "string" &&
          typeof (entry as WorkspaceEdge).fromNodeId === "string" &&
          typeof (entry as WorkspaceEdge).toNodeId === "string" &&
          typeof (entry as WorkspaceEdge).updatedAtIso === "string"
      );
    } catch {
      return [];
    }
  }

  function parseWorkspaceAssets(raw: string | null): WorkspaceAsset[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is WorkspaceAsset =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as WorkspaceAsset).id === "string" &&
            typeof (entry as WorkspaceAsset).name === "string" &&
            typeof (entry as WorkspaceAsset).x === "number" &&
            typeof (entry as WorkspaceAsset).y === "number" &&
            typeof (entry as WorkspaceAsset).updatedAtIso === "string"
        )
        .map((entry) => ({
          ...entry,
          x: Math.max(16, Math.min(WORKSPACE_WIDTH - 160, entry.x)),
          y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 80, entry.y))
        }));
    } catch {
      return [];
    }
  }

  function parseWorkspaceAnnotations(raw: string | null): WorkspaceAnnotation[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is WorkspaceAnnotation =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as WorkspaceAnnotation).id === "string" &&
            typeof (entry as WorkspaceAnnotation).text === "string" &&
            typeof (entry as WorkspaceAnnotation).x === "number" &&
            typeof (entry as WorkspaceAnnotation).y === "number" &&
            typeof (entry as WorkspaceAnnotation).updatedAtIso === "string"
        )
        .map((entry) => ({
          ...entry,
          x: Math.max(16, Math.min(WORKSPACE_WIDTH - 180, entry.x)),
          y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 90, entry.y))
        }));
    } catch {
      return [];
    }
  }

  function refreshSharedWorkspace(options?: {
    force?: boolean;
    preferCanonical?: boolean;
    isRemotePack?: boolean;
  }): void {
    if (backend !== "sdk") {
      return;
    }
    const force = options?.force ?? false;
    const preferCanonical = options?.preferCanonical ?? false;
    const isRemotePack = options?.isRemotePack ?? false;
    if (isDraggingRef.current) {
      return;
    }
    if (!isRemotePack && Date.now() < suppressWorkspaceRefreshUntilRef.current) {
      return;
    }
    const shouldApplyWorkspaceView = replayModeRef.current === "live";
    const branchId = activeBranchIdRef.current || replayState.activeBranchId;
    const preferCanonicalMetadata = preferCanonical ? { canonical: true as const } : undefined;

    const nodesFingerprintKey = getNodeMemberKeyPrefix(branchId);
    const edgesKey = getWorkspaceSharedKey(branchId, "edges");
    const assetsKey = getWorkspaceSharedKey(branchId, "assets");
    const annotationsKey = getWorkspaceSharedKey(branchId, "annotations");

    const sharedNodes = readWorkspaceNodesForBranch(branchId);
    const sharedNodesRaw = JSON.stringify(sharedNodes);
    const canApplyNodes = shouldApplySharedKeyWrite(nodesFingerprintKey, sharedNodesRaw, { isRemotePack });
    if (canApplyNodes && sharedNodesRaw !== (lastSharedRawByKeyRef.current[nodesFingerprintKey] ?? null)) {
      if ((lastSharedRawByKeyRef.current[nodesFingerprintKey] ?? null) !== null) {
        pushPersistenceEvent(nodesFingerprintKey, "sync", "Workspace nodes updated from runtime sync.");
      }
      lastSharedRawByKeyRef.current[nodesFingerprintKey] = sharedNodesRaw;
    }
    if (canApplyNodes && shouldApplyWorkspaceView) {
      const forceClear = forceWorkspaceClearRef.current;
      const wouldWipeLocalCanvas =
        !forceClear && sharedNodes.length === 0 && workspaceNodesRef.current.length > 0;
      if (forceClear || !wouldWipeLocalCanvas) {
        if (forceClear) {
          forceWorkspaceClearRef.current = false;
        }
        setWorkspaceNodes(sharedNodes);
      }
    }

    const sharedEdgesRaw = readSharedWorkspaceValue(branchId, "edges");
    const canApplyEdges = shouldApplySharedKeyWrite(edgesKey, sharedEdgesRaw, { isRemotePack });
    if (canApplyEdges && sharedEdgesRaw !== (lastSharedRawByKeyRef.current[edgesKey] ?? null)) {
      if ((lastSharedRawByKeyRef.current[edgesKey] ?? null) !== null) {
        pushPersistenceEvent(edgesKey, "sync", "Workspace edges updated from runtime sync.");
      }
      lastSharedRawByKeyRef.current[edgesKey] = sharedEdgesRaw;
    }
    if (canApplyEdges && sharedEdgesRaw !== null && shouldApplyWorkspaceView) {
      setWorkspaceEdges(parseWorkspaceEdges(sharedEdgesRaw));
    }

    const sharedAssetsRaw = readSharedWorkspaceValue(branchId, "assets");
    const canApplyAssets = shouldApplySharedKeyWrite(assetsKey, sharedAssetsRaw, { isRemotePack });
    if (canApplyAssets && sharedAssetsRaw !== (lastSharedRawByKeyRef.current[assetsKey] ?? null)) {
      if ((lastSharedRawByKeyRef.current[assetsKey] ?? null) !== null) {
        pushPersistenceEvent(assetsKey, "sync", "Workspace assets updated from runtime sync.");
      }
      lastSharedRawByKeyRef.current[assetsKey] = sharedAssetsRaw;
    }
    if (canApplyAssets && sharedAssetsRaw !== null && shouldApplyWorkspaceView) {
      setWorkspaceAssets(parseWorkspaceAssets(sharedAssetsRaw));
    }

    const sharedAnnotationsRaw = readSharedWorkspaceValue(branchId, "annotations");
    const canApplyAnnotations = shouldApplySharedKeyWrite(annotationsKey, sharedAnnotationsRaw, { isRemotePack });
    if (
      canApplyAnnotations &&
      sharedAnnotationsRaw !== (lastSharedRawByKeyRef.current[annotationsKey] ?? null)
    ) {
      if ((lastSharedRawByKeyRef.current[annotationsKey] ?? null) !== null) {
        pushPersistenceEvent(annotationsKey, "sync", "Workspace notes updated from runtime sync.");
      }
      lastSharedRawByKeyRef.current[annotationsKey] = sharedAnnotationsRaw;
    }
    if (canApplyAnnotations && sharedAnnotationsRaw !== null && shouldApplyWorkspaceView) {
      setWorkspaceAnnotations(parseWorkspaceAnnotations(sharedAnnotationsRaw));
    }
    const replayFingerprintKey = ALL_REPLAY_OP_KEY_PREFIX;
    const sharedOps = readAllReplayOpsFromShared(
      (key) => readSharedKey(key, preferCanonical ? { preferCanonical: true } : undefined),
      listSharedKeys
    );
    const sharedReplayOpsRaw = JSON.stringify(sharedOps);
    if (sharedReplayOpsRaw !== (lastSharedRawByKeyRef.current[replayFingerprintKey] ?? null)) {
      lastSharedRawByKeyRef.current[replayFingerprintKey] = sharedReplayOpsRaw;
      sharedReplayOpsRef.current = sharedOps;
      syncReplayFromSharedOps(sharedOps);
    }
    const sharedBranchesRaw = sdkClient.getSharedValue(WORKSPACE_BRANCHES_KEY, preferCanonicalMetadata);
    const canApplyBranches = shouldApplySharedKeyWrite(WORKSPACE_BRANCHES_KEY, sharedBranchesRaw, { isRemotePack });
    if (
      canApplyBranches &&
      sharedBranchesRaw !== null &&
      sharedBranchesRaw !== lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY]
    ) {
      if ((lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY] ?? null) !== null) {
        pushPersistenceEvent(WORKSPACE_BRANCHES_KEY, "sync", "Shared branch topology updated from runtime sync.");
      }
      lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY] = sharedBranchesRaw;
      const sharedBranches = parseSharedBranches(sharedBranchesRaw);
      sharedBranchesRef.current = sharedBranches;
      syncBranchesFromSharedRecords(sharedBranches);
    }
    hydrateBranchBaselinesFromStorage([
      ...Object.keys(replayBranchesRef.current),
      ...sharedBranchesRef.current.map((entry) => entry.branchId),
      replayState.cursor.branchId,
      replayState.activeBranchId
    ]);
  }

  function ensureWritableBranchForEdit(
    actionLabel: string,
    options?: { applySeedSnapshot?: boolean }
  ): WriteBranchResolution | null {
    const applySeedSnapshot = options?.applySeedSnapshot ?? true;
    const selectedBranchId = activeBranchIdRef.current || replayState.activeBranchId || replayState.cursor.branchId;
    const selectedBranchNodeIds = replayState.branchNodeIds[selectedBranchId] ?? [];
    const selectedBranchHeadIndex = selectedBranchNodeIds.length - 1;
    const selectedBranchCursorIndex =
      replayState.cursor.branchId === selectedBranchId
        ? replayState.cursor.nodeIndex
        : Math.max(0, selectedBranchHeadIndex);
    const routing = decideWriteRouting(replayState.cursor.mode, selectedBranchCursorIndex, selectedBranchHeadIndex);
    if (routing === "direct-write") {
      if (activeBranchIdRef.current !== selectedBranchId) {
        dispatchReplay({ type: "set-active-branch", branchId: selectedBranchId });
        activeBranchIdRef.current = selectedBranchId;
      }
      return { branchId: selectedBranchId, seededSnapshot: null };
    }
    if (routing === "switch-to-live-head-write") {
      dispatchReplay({ type: "set-active-branch", branchId: selectedBranchId });
      dispatchReplay({ type: "set-mode", mode: "live" });
      activeBranchIdRef.current = selectedBranchId;
      setActiveNotice(`Playback cursor is at ${selectedBranchId} head; switched to live for ${actionLabel}.`);
      return { branchId: selectedBranchId, seededSnapshot: null };
    }

    const newBranchId = `branch-${branchCounterRef.current++}`;
    const newRoomId = `${activeRoomId}-${newBranchId}`;
    const sourceNodeIndex = Math.min(selectedBranchCursorIndex, Math.max(0, selectedBranchNodeIds.length - 1));
    const sourceNodeId = selectedBranchNodeIds[sourceNodeIndex] ?? null;
    const baseline = projectReplayWorkspaceSnapshotFor(selectedBranchId, sourceNodeIndex);
    const didPersistBranch = persistBranchCreation(
      {
        branchId: newBranchId,
        roomId: newRoomId,
        label: newBranchId,
        basedOnBranchId: selectedBranchId,
        basedOnNodeId: sourceNodeId,
        createdAtIso: new Date().toISOString()
      },
      baseline,
      `Created ${newBranchId} from ${selectedBranchId}:${sourceNodeId ?? "root"}.`
    );
    if (!didPersistBranch) {
      setLastAction("Branch creation failed; shared topology record was not persisted.");
      return null;
    }
    dispatchReplay({
      type: "create-branch-from-cursor",
      newBranchId,
      newRoomId,
      newLabel: newBranchId,
      reason: "playback-edit"
    });
    dispatchReplay({ type: "set-active-branch", branchId: newBranchId });
    dispatchReplay({ type: "set-mode", mode: "live" });
    if (applySeedSnapshot) {
      applyWorkspaceSnapshot(baseline, "runtime");
      suppressWorkspaceRefreshUntilRef.current = Date.now() + 1200;
    }
    activeBranchIdRef.current = newBranchId;
    setActiveNotice(`Playback ${actionLabel} created ${newBranchId} from ${selectedBranchId}:${sourceNodeId ?? "root"}.`);
    return {
      branchId: newBranchId,
      seededSnapshot: cloneWorkspaceSnapshot(baseline)
    };
  }

  function persistClearWorkspaceNodes(
    nodeIds: string[],
    replayOp: SharedReplayOp,
    nextOps: SharedReplayOp[],
    actionLabel: string,
    branchId = activeBranchIdRef.current
  ): boolean {
    if (backend !== "sdk") {
      setLastAction("Workspace edits require runtime mode = npm sdk + wasm.");
      return false;
    }
    const { writeEntries: replayWriteEntries } = appendReplayOpToShared(replayOp, branchId);
    const entries = buildClearNodesWriteEntries(branchId, nodeIds, replayWriteEntries);
    const writeResult = sdkClient.setSharedValues(entries);
    if (!sharedWriteApplied(writeResult)) {
      setLastAction("Workspace persistence failed; reconnect in npm sdk + wasm mode.");
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, actionLabel);
    for (const nodeId of nodeIds) {
      const nodeKey = getNodeRecordKey(branchId, nodeId);
      const memberKey = getNodeMemberKey(branchId, nodeId);
      localWriteProtectUntilByKeyRef.current[nodeKey] = Date.now() + 4000;
      localWriteProtectUntilByKeyRef.current[memberKey] = Date.now() + 4000;
      lastSharedRawByKeyRef.current[nodeKey] = "";
      lastSharedRawByKeyRef.current[memberKey] = "";
    }
    trackReplayOpWriteProtection(branchId, replayOp);
    workspaceNodesRef.current = [];
    setWorkspaceNodes([]);
    sharedReplayOpsRef.current = nextOps;
    syncReplayFromSharedOps(nextOps);
    syncLocalReplayFingerprint();
    setLastAction(actionLabel);
    pushPersistenceEvent(getNodeMemberKeyPrefix(branchId), "write", actionLabel);
    return true;
  }

  function persistAddedNodeWithReplayOps(
    node: WorkspaceNode,
    nextCanvasNodes: WorkspaceNode[],
    replayOp: SharedReplayOp,
    nextOps: SharedReplayOp[],
    actionLabel: string,
    branchId = activeBranchIdRef.current
  ): boolean {
    if (backend !== "sdk") {
      setLastAction("Workspace edits require runtime mode = npm sdk + wasm.");
      return false;
    }
    const { writeEntries: replayWriteEntries } = appendReplayOpToShared(replayOp, branchId);
    const entries = buildAddNodeWriteEntries(branchId, node, replayWriteEntries);
    const writeResult = sdkClient.setSharedValues(entries);
    if (!sharedWriteApplied(writeResult)) {
      setLastAction("Workspace persistence failed; reconnect in npm sdk + wasm mode.");
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, actionLabel);
    const nodesFingerprintKey = getNodeMemberKeyPrefix(branchId);
    const nodesFingerprintRaw = JSON.stringify(nextCanvasNodes);
    localWriteProtectUntilByKeyRef.current[nodesFingerprintKey] = Date.now() + 4000;
    lastSharedRawByKeyRef.current[nodesFingerprintKey] = nodesFingerprintRaw;
    const memberKey = getNodeMemberKey(branchId, node.id);
    const nodeKey = getNodeRecordKey(branchId, node.id);
    localWriteProtectUntilByKeyRef.current[memberKey] = Date.now() + 4000;
    localWriteProtectUntilByKeyRef.current[nodeKey] = Date.now() + 4000;
    lastSharedRawByKeyRef.current[memberKey] = "1";
    lastSharedRawByKeyRef.current[nodeKey] = JSON.stringify(node);
    trackReplayOpWriteProtection(branchId, replayOp);
    workspaceNodesRef.current = nextCanvasNodes;
    setWorkspaceNodes(nextCanvasNodes);
    sharedReplayOpsRef.current = nextOps;
    syncReplayFromSharedOps(nextOps);
    syncLocalReplayFingerprint();
    setLastAction(actionLabel);
    pushPersistenceEvent(nodeKey, "write", actionLabel);
    pushPersistenceEvent(getReplayOpRecordKey(branchId, replayOp.id), "write", actionLabel);
    return true;
  }

  function persistMovedNodeWithReplayOps(
    node: WorkspaceNode,
    replayOp: SharedReplayOp,
    nextOps: SharedReplayOp[],
    branchId = activeBranchIdRef.current
  ): boolean {
    if (backend !== "sdk") {
      return false;
    }
    const { writeEntries: replayWriteEntries } = appendReplayOpToShared(replayOp, branchId);
    const entries = buildMoveNodeWriteEntries(branchId, node, replayWriteEntries);
    const writeResult = sdkClient.setSharedValues(entries);
    if (!sharedWriteApplied(writeResult)) {
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, "Move node");
    const nodeKey = getNodeRecordKey(branchId, node.id);
    localWriteProtectUntilByKeyRef.current[nodeKey] = Date.now() + 4000;
    lastSharedRawByKeyRef.current[nodeKey] = JSON.stringify(node);
    trackReplayOpWriteProtection(branchId, replayOp);
    sharedReplayOpsRef.current = nextOps;
    syncReplayFromSharedOps(nextOps);
    syncLocalReplayFingerprint();
    pushPersistenceEvent(nodeKey, "write", "move-node");
    return true;
  }

  function persistWorkspaceEdges(next: WorkspaceEdge[], actionLabel: string, branchId = activeBranchIdRef.current): boolean {
    if (backend !== "sdk") {
      setLastAction("Workspace edge edits require runtime mode = npm sdk + wasm.");
      return false;
    }
    const key = getWorkspaceSharedKey(branchId, "edges");
    const writeResult = sdkClient.setSharedValue(key, JSON.stringify(next));
    if (!sharedWriteApplied(writeResult)) {
      setLastAction("Workspace edge persistence failed; reconnect in npm sdk + wasm mode.");
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, actionLabel);
    lastSharedRawByKeyRef.current[key] = JSON.stringify(next);
    setWorkspaceEdges(next);
    setLastAction(actionLabel);
    pushPersistenceEvent(key, "write", actionLabel);
    return true;
  }

  function persistWorkspaceAssets(next: WorkspaceAsset[], actionLabel: string, branchId = activeBranchIdRef.current): boolean {
    if (backend !== "sdk") {
      setLastAction("Workspace asset edits require runtime mode = npm sdk + wasm.");
      return false;
    }
    const key = getWorkspaceSharedKey(branchId, "assets");
    const writeResult = sdkClient.setSharedValue(key, JSON.stringify(next));
    if (!sharedWriteApplied(writeResult)) {
      setLastAction("Workspace asset persistence failed; reconnect in npm sdk + wasm mode.");
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, actionLabel);
    lastSharedRawByKeyRef.current[key] = JSON.stringify(next);
    setWorkspaceAssets(next);
    setLastAction(actionLabel);
    pushPersistenceEvent(key, "write", actionLabel);
    return true;
  }

  function persistWorkspaceAnnotations(next: WorkspaceAnnotation[], actionLabel: string, branchId = activeBranchIdRef.current): boolean {
    if (backend !== "sdk") {
      setLastAction("Workspace annotation edits require runtime mode = npm sdk + wasm.");
      return false;
    }
    const key = getWorkspaceSharedKey(branchId, "annotations");
    const writeResult = sdkClient.setSharedValue(key, JSON.stringify(next));
    if (!sharedWriteApplied(writeResult)) {
      setLastAction("Workspace annotation persistence failed; reconnect in npm sdk + wasm mode.");
      return false;
    }
    markLocalCanvasWrite();
    pushSyncWarningIfNeeded(writeResult, actionLabel);
    lastSharedRawByKeyRef.current[key] = JSON.stringify(next);
    setWorkspaceAnnotations(next);
    setLastAction(actionLabel);
    pushPersistenceEvent(key, "write", actionLabel);
    return true;
  }

  function publishDragPresence(nodeId: string, x: number, y: number, final: boolean) {
    if (!canUseSdkActions) {
      return;
    }
    const mode = replayState.cursor.mode;
    const branchId = activeBranchIdRef.current;
    if (mode !== "live") {
      if (final) {
        sdkClient.setPresence(
          buildPresencePayload({
            drag: {
              active: false,
              nodeId,
              x,
              y,
              branchId,
              mode,
              atIso: new Date().toISOString()
            }
          })
        );
      }
      return;
    }
    const now = Date.now();
    if (!final && now - dragPresenceLastSentRef.current < 80) {
      return;
    }
    dragPresenceLastSentRef.current = now;
    sdkClient.setPresence(
      buildPresencePayload({
        drag: {
          active: !final,
          nodeId,
          x,
          y,
          branchId,
          mode,
          atIso: new Date().toISOString()
        }
      })
    );
  }

  useEffect(() => {
    if (!isSdkConnected) {
      return;
    }
    scheduleReplayCursorPresencePublish();
    return () => {
      if (replayCursorPublishTimerRef.current !== null) {
        window.clearTimeout(replayCursorPublishTimerRef.current);
        replayCursorPublishTimerRef.current = null;
      }
    };
  }, [
    isSdkConnected,
    activeRoomId,
    replayState.cursor.branchId,
    replayState.cursor.nodeIndex,
    replayState.cursor.mode,
    replayState.cursor.nodeId
  ]);

  useEffect(() => {
    setRemoteDragByPeer({});
  }, [replayState.cursor.mode, replayState.activeBranchId]);

  useEffect(() => {
    if (!isReplayPlaying) {
      return;
    }
    if (replayNodeCount <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      dispatchReplay({
        type: "set-cursor-index",
        branchId: replayState.cursor.branchId,
        nodeIndex: replayState.cursor.nodeIndex + 1
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, [isReplayPlaying, replayState.cursor.branchId, replayState.cursor.nodeIndex, replayNodeCount]);

  useEffect(() => {
    if (!isReplayPlaying) {
      return;
    }
    if (replayNodeCount === 0) {
      setIsReplayPlaying(false);
      return;
    }
    const atLast = replayState.cursor.nodeIndex >= replayNodeCount - 1;
    if (atLast) {
      setIsReplayPlaying(false);
    }
  }, [isReplayPlaying, replayNodeCount, replayState.cursor.nodeIndex]);

  useEffect(() => {
    if (replayState.cursor.mode === "playback" && isCursorAtHead) {
      dispatchReplay({ type: "set-mode", mode: "live" });
      setActiveNotice(`Replay reached head on ${replayState.cursor.branchId}; resumed live mode.`);
    }
  }, [replayState.cursor.mode, isCursorAtHead, replayState.cursor.branchId]);

  useEffect(() => {
    if (replayState.cursor.mode !== "live") {
      hydrateBranchBaselinesFromStorage([replayState.cursor.branchId, replayState.activeBranchId]);
      const snapshot = projectReplayWorkspaceSnapshot();
      applyWorkspaceSnapshot(snapshot, "replay");
    }
  }, [replayState.cursor.mode, replayState.cursor.branchId, replayState.cursor.nodeIndex, replayState.cursor.nodeId]);

  useEffect(() => {
    if (backend !== "sdk" || replayState.cursor.mode !== "live") {
      return;
    }
    loadLiveWorkspaceForBranch(replayState.activeBranchId);
  }, [backend, replayState.activeBranchId, replayState.cursor.mode]);

  function connectRoom() {
    const nextRoomId = roomIdInput.trim();
    if (!nextRoomId) {
      return;
    }
    setActiveRoomId(nextRoomId);
    setLastAction(`Switching room to ${nextRoomId}...`);
  }

  async function tryAnotherRoom() {
    const baseRoomId = roomIdInput.trim() || config.defaultRoomId;
    const activeClient = backend === "sdk" ? sdkClient : wsClient;
    setIsTryingAnotherRoom(true);
    const result = await connectWithRoomFallback(
      baseRoomId,
      async (candidate) => {
        // Room changes are effect-driven (see the useEffect keyed on
        // activeRoomId) rather than an awaitable connect call, so trigger
        // the switch and poll diagnostics until it settles.
        setRoomIdInput(candidate);
        setActiveRoomId(candidate);
        await waitForConnectionSettle(activeClient);
      },
      () => activeClient.getDiagnostics().connectionState === "open",
      (candidate) => {
        setActiveNotice(`Room busy — trying ${candidate}...`);
      }
    );
    setIsTryingAnotherRoom(false);
    if (!result.connected) {
      setLastAction(`Tried ${result.attempts} room(s) starting from ${baseRoomId} — still unavailable.`);
    }
  }

  function addWorkspaceNode(shape: NodeShape) {
    const writeTarget = ensureWritableBranchForEdit("workspace.add-node", { applySeedSnapshot: true });
    if (!writeTarget) {
      return;
    }
    const branchForAppend = writeTarget.branchId;
    const branchRoomId = replayBranchesRef.current[branchForAppend]?.roomId ?? activeRoomId;
    const branchSeedSnapshot = writeTarget.seededSnapshot;
    if (replayState.cursor.mode === "playback" && !branchSeedSnapshot) {
      setActiveNotice(`Playback cursor is at ${branchForAppend} head; appending on existing branch.`);
    }
    const baseNodes = branchSeedSnapshot ? branchSeedSnapshot.nodes : workspaceNodesRef.current;
    const next: WorkspaceNode = {
      id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      // 112px columns keep 104px-wide nodes from overlapping at spawn.
      x: 40 + (baseNodes.length % 7) * 112,
      y: 40 + Math.floor(baseNodes.length / 7) * 70,
      label: `Node ${baseNodes.length + 1}`,
      shape,
      updatedAtIso: new Date().toISOString()
    };
    const replayOp = createReplayOp(
      `add-node ${next.label}`,
      // Embed the full node so playback frames render it as it was created,
      // instead of falling back to the LWW-latest record.
      { type: "workspace.add-node", nodeId: next.id, node: next },
      "workspace.add-node",
      next.updatedAtIso,
      branchForAppend
    );
    const nextCanvasNodes = [next, ...baseNodes];
    const nextOps = [...readReplayOpsForBranch(branchForAppend), replayOp].sort((left, right) =>
      left.atIso.localeCompare(right.atIso)
    );
    const didPersist = persistAddedNodeWithReplayOps(
      next,
      nextCanvasNodes,
      replayOp,
      nextOps,
      `Added ${next.label}.`,
      branchForAppend
    );
    if (!didPersist) {
      return;
    }
    activeBranchIdRef.current = branchForAppend;
    setActiveNotice(`Workspace node ${next.label} added.`);
  }

  function startEditingNode(nodeId: string) {
    if (!canUseSdkActions) {
      setLastAction("Connect in npm sdk + wasm mode before renaming workspace nodes.");
      return;
    }
    const current = workspaceNodesRef.current.find((entry) => entry.id === nodeId);
    if (!current) {
      return;
    }
    setEditingNodeId(nodeId);
    setEditingLabelDraft(current.label);
  }

  function cancelEditingNode() {
    setEditingNodeId(null);
    setEditingLabelDraft("");
  }

  function commitNodeRename(nodeId: string, rawLabel: string) {
    setEditingNodeId(null);
    setEditingLabelDraft("");
    const label = rawLabel.trim();
    const current = workspaceNodesRef.current.find((entry) => entry.id === nodeId);
    if (!current || label.length === 0 || label === current.label) {
      return;
    }
    const writeTarget = ensureWritableBranchForEdit("workspace.rename-node", { applySeedSnapshot: false });
    if (!writeTarget) {
      return;
    }
    const branchId = writeTarget.branchId;
    const updatedAtIso = new Date().toISOString();
    const seedNodes = writeTarget.seededSnapshot?.nodes ?? null;
    const baseNodes = seedNodes ?? workspaceNodesRef.current;
    const snapshot = baseNodes.map((entry) => (entry.id === nodeId ? { ...entry, label, updatedAtIso } : entry));
    const renamed = snapshot.find((entry) => entry.id === nodeId);
    workspaceNodesRef.current = snapshot;
    setWorkspaceNodes(snapshot);
    if (!renamed) {
      return;
    }
    const renameOp = createReplayOp(
      `rename-node ${label}`,
      { type: "workspace.rename-node", rename: { nodeId, label, updatedAtIso } },
      "workspace.rename-node",
      updatedAtIso,
      branchId
    );
    const nextOps = [...readReplayOpsForBranch(branchId), renameOp].sort((left, right) =>
      left.atIso.localeCompare(right.atIso)
    );
    // Same persistence shape as a move: rewrite the node record + append the op.
    const didPersist = persistMovedNodeWithReplayOps(renamed, renameOp, nextOps, branchId);
    if (!didPersist) {
      setLastAction("Workspace rename failed to apply locally; reconnect in npm sdk + wasm mode.");
      return;
    }
    setActiveNotice(`Renamed node to ${label}.`);
  }

  function createReplayOp(
    opSummary: string,
    payload: Record<string, unknown>,
    payloadRef: string,
    atIso: string,
    branchId?: string
  ): SharedReplayOp {
    const targetBranchId = branchId ?? activeBranchIdRef.current;
    const opId = `${targetBranchId}:${new Date(atIso).getTime()}:${Math.random().toString(36).slice(2, 8)}`;
    return {
      id: opId,
      branchId: targetBranchId,
      opSummary,
      payload,
      payloadRef,
      atIso
    };
  }

  function appendReplayOpToShared(
    op: SharedReplayOp,
    branchId = activeBranchIdRef.current
  ): { nextOps: SharedReplayOp[]; writeEntries: Array<{ key: string; value: string }> } {
    const existingOps = readReplayOpsForBranch(branchId);
    const nextOps = [...existingOps.filter((entry) => entry.id !== op.id), op].sort((left, right) =>
      left.atIso.localeCompare(right.atIso)
    );
    const writeEntries = buildAppendReplayOpWriteEntries(branchId, op);
    return { nextOps, writeEntries };
  }

  function trackReplayOpWriteProtection(branchId: string, op: SharedReplayOp): void {
    const opKey = getReplayOpRecordKey(branchId, op.id);
    localWriteProtectUntilByKeyRef.current[opKey] = Date.now() + 4000;
    lastSharedRawByKeyRef.current[opKey] = JSON.stringify(op);
  }

  function buildNextReplayOps(
    opSummary: string,
    payload: Record<string, unknown>,
    payloadRef: string,
    atIso: string,
    branchId?: string
  ): SharedReplayOp[] {
    const op = createReplayOp(opSummary, payload, payloadRef, atIso, branchId);
    const existing = readReplayOpsForBranch(op.branchId);
    return [...existing, op].sort((left, right) => left.atIso.localeCompare(right.atIso));
  }

  function appendReplayWorkspaceEvent(
    opSummary: string,
    payload: Record<string, unknown>,
    payloadRef: string,
    atIso: string,
    branchId?: string
  ) {
    const targetBranchId = branchId ?? activeBranchIdRef.current;
    const op = createReplayOp(opSummary, payload, payloadRef, atIso, targetBranchId);
    const { nextOps, writeEntries } = appendReplayOpToShared(op, targetBranchId);
    const writeResult = sdkClient.setSharedValues(writeEntries);
    if (!sharedWriteApplied(writeResult)) {
      return;
    }
    pushSyncWarningIfNeeded(writeResult, "Replay ops");
    trackReplayOpWriteProtection(targetBranchId, op);
    sharedReplayOpsRef.current = nextOps;
    syncReplayFromSharedOps(nextOps);
    syncLocalReplayFingerprint();
  }

  function syncLocalReplayFingerprint(): void {
    const allOps = readAllReplayOpsFromShared((key) => readSharedKey(key), listSharedKeys);
    sharedReplayOpsRef.current = allOps;
    lastSharedRawByKeyRef.current[ALL_REPLAY_OP_KEY_PREFIX] = JSON.stringify(allOps);
  }

  function selectReplayBranchNode(branchId: string, nodeIndex: number) {
    dispatchReplay({
      type: "set-active-branch",
      branchId
    });
    dispatchReplay({
      type: "set-cursor-index",
      branchId,
      nodeIndex
    });
    activeBranchIdRef.current = branchId;
    scheduleReplayCursorPresencePublish({ force: true });
  }

  function persistSharedBranchRecord(record: SharedBranchRecord): boolean {
    const remoteRaw = sdkClient.getSharedValue(WORKSPACE_BRANCHES_KEY);
    const existing = parseSharedBranches(remoteRaw);
    const has = existing.some((entry) => entry.branchId === record.branchId);
    if (has) {
      sharedBranchesRef.current = existing;
      lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY] = JSON.stringify(existing);
      syncBranchesFromSharedRecords(existing);
      return true;
    }
    const next = [...existing, record].sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
    const branchesRaw = JSON.stringify(next);
    const writeResult = sdkClient.setSharedValue(WORKSPACE_BRANCHES_KEY, branchesRaw);
    if (!sharedWriteApplied(writeResult)) {
      return false;
    }
    pushSyncWarningIfNeeded(writeResult, "Branch topology");
    lastSharedRawByKeyRef.current[WORKSPACE_BRANCHES_KEY] = branchesRaw;
    localWriteProtectUntilByKeyRef.current[WORKSPACE_BRANCHES_KEY] = Date.now() + BRANCH_WRITE_PROTECT_MS;
    sharedBranchesRef.current = next;
    syncBranchesFromSharedRecords(next);
    return true;
  }

  function clearWorkspaceAssets() {
    const writeTarget = ensureWritableBranchForEdit("workspace.clear-assets", { applySeedSnapshot: true });
    if (!writeTarget) {
      return;
    }
    const didPersist = persistWorkspaceAssets([], "Cleared workspace assets.", writeTarget.branchId);
    if (!didPersist) {
      return;
    }
    appendReplayWorkspaceEvent(
      "clear-assets",
      { type: "workspace.clear-assets" },
      "workspace.clear-assets",
      new Date().toISOString(),
      writeTarget.branchId
    );
    setActiveNotice("Workspace assets cleared.");
  }

  function clearWorkspaceAnnotations() {
    const writeTarget = ensureWritableBranchForEdit("workspace.clear-annotations", { applySeedSnapshot: true });
    if (!writeTarget) {
      return;
    }
    const didPersist = persistWorkspaceAnnotations([], "Cleared workspace annotations.", writeTarget.branchId);
    if (!didPersist) {
      return;
    }
    appendReplayWorkspaceEvent(
      "clear-annotations",
      { type: "workspace.clear-annotations" },
      "workspace.clear-annotations",
      new Date().toISOString(),
      writeTarget.branchId
    );
    setActiveNotice("Workspace annotations cleared.");
  }

  // One-click board reset: nodes (which also clears edges), assets, notes.
  function clearWorkspaceAll() {
    if (workspaceNodesRef.current.length > 0 || workspaceEdges.length > 0) {
      clearWorkspaceNodes();
    }
    if (workspaceAssets.length > 0) {
      clearWorkspaceAssets();
    }
    if (workspaceAnnotations.length > 0) {
      clearWorkspaceAnnotations();
    }
  }

  function clearWorkspaceNodes() {
    const writeTarget = ensureWritableBranchForEdit("workspace.clear-nodes", { applySeedSnapshot: true });
    if (!writeTarget) {
      return;
    }
    const branchId = writeTarget.branchId;
    const nodeIds = workspaceNodesRef.current.map((entry) => entry.id);
    const atIso = new Date().toISOString();
    const clearNodesOp = createReplayOp(
      "clear-nodes",
      { type: "workspace.clear-nodes" },
      "workspace.clear-nodes",
      atIso,
      branchId
    );
    const clearNodesOps = [...readReplayOpsForBranch(branchId), clearNodesOp].sort((left, right) =>
      left.atIso.localeCompare(right.atIso)
    );
    const didPersist = persistClearWorkspaceNodes(nodeIds, clearNodesOp, clearNodesOps, "Cleared workspace nodes.", branchId);
    if (!didPersist) {
      return;
    }
    persistWorkspaceEdges([], "Cleared workspace nodes and edges.", branchId);
    appendReplayWorkspaceEvent("clear-edges", { type: "workspace.clear-edges" }, "workspace.clear-edges", new Date().toISOString(), branchId);
    persistWorkspaceAssets([], "Cleared workspace nodes, edges, and assets.", branchId);
    appendReplayWorkspaceEvent("clear-assets", { type: "workspace.clear-assets" }, "workspace.clear-assets", new Date().toISOString(), branchId);
    persistWorkspaceAnnotations([], "Cleared workspace objects.", branchId);
    appendReplayWorkspaceEvent(
      "clear-annotations",
      { type: "workspace.clear-annotations" },
      "workspace.clear-annotations",
      new Date().toISOString(),
      branchId
    );
    setActiveNotice("Workspace cleared.");
  }

  function handleWorkspaceNodeMouseDown(event: React.PointerEvent<HTMLDivElement>, nodeId: string) {
    if (!canUseSdkActions) {
      setLastAction("Connect in npm sdk + wasm mode before moving workspace nodes.");
      return;
    }
    if (editingNodeId === nodeId) {
      // Typing in the inline rename input must not start a drag.
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    if (event.shiftKey) {
      const source = edgeSourceNodeIdRef.current;
      if (source && source !== nodeId) {
        const writeTarget = ensureWritableBranchForEdit("workspace.add-edge", { applySeedSnapshot: true });
        if (!writeTarget) {
          return;
        }
        const branchId = writeTarget.branchId;
        const baseEdges = writeTarget.seededSnapshot ? writeTarget.seededSnapshot.edges : workspaceEdges;
        const edgeId = `edge:${source}:${nodeId}`;
        const exists = baseEdges.some((edge) => edge.id === edgeId);
        if (!exists) {
          const didPersist = persistWorkspaceEdges(
            [
              {
                id: edgeId,
                fromNodeId: source,
                toNodeId: nodeId,
                updatedAtIso: new Date().toISOString()
              },
              ...baseEdges
            ],
            `Connected ${source} -> ${nodeId}.`,
            branchId
          );
          if (didPersist) {
            appendReplayWorkspaceEvent(
              `add-edge ${source}->${nodeId}`,
              {
                type: "workspace.add-edge",
                edge: {
                  id: edgeId,
                  fromNodeId: source,
                  toNodeId: nodeId,
                  updatedAtIso: new Date().toISOString()
                }
              },
              "workspace.add-edge",
              new Date().toISOString(),
              branchId
            );
            setActiveNotice(`Edge created: ${source} -> ${nodeId}.`);
          }
        } else {
          setLastAction(`Edge ${source} -> ${nodeId} already exists.`);
        }
        edgeSourceNodeIdRef.current = null;
        return;
      }
      edgeSourceNodeIdRef.current = nodeId;
      setLastAction(`Edge source selected: ${nodeId}. Shift-click another node to connect.`);
      return;
    }
    draggingNodeRef.current = { nodeId };
    isDraggingRef.current = true;
  }

  function handleWorkspaceSurfaceMouseDown(event: React.PointerEvent<HTMLDivElement>) {
    if (workspaceTool !== "annotate") {
      return;
    }
    if (!canUseSdkActions) {
      setLastAction("Connect in npm sdk + wasm mode before adding annotations.");
      return;
    }
    const surface = workspaceSurfaceRef.current;
    if (!surface) {
      return;
    }
    const point = clientPointToWorkspace(event.clientX, event.clientY, surface);
    const x = Math.max(16, Math.min(WORKSPACE_WIDTH - 180, point.x));
    const y = Math.max(16, Math.min(WORKSPACE_HEIGHT - 90, point.y));
    const text = annotationDraft.trim() || "Untitled note";
    const next: WorkspaceAnnotation = {
      id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      x,
      y,
      updatedAtIso: new Date().toISOString()
    };
    const writeTarget = ensureWritableBranchForEdit("workspace.add-annotation", { applySeedSnapshot: true });
    if (!writeTarget) {
      return;
    }
    const branchId = writeTarget.branchId;
    const baseAnnotations = writeTarget.seededSnapshot ? writeTarget.seededSnapshot.annotations : workspaceAnnotations;
    const didPersist = persistWorkspaceAnnotations([next, ...baseAnnotations], `Added annotation: ${text}`, branchId);
    if (!didPersist) {
      return;
    }
    appendReplayWorkspaceEvent(
      `add-annotation ${text}`,
      { type: "workspace.add-annotation", annotation: next },
      "workspace.add-annotation",
      next.updatedAtIso,
      branchId
    );
    setActiveNotice(`Annotation added: ${text}.`);
  }

  function publishPresence() {
    if (backend !== "sdk") {
      setLastAction("Presence update requires runtime mode = npm sdk + wasm.");
      return;
    }

    const nextName = presenceName.trim();
    if (!nextName) {
      setLastAction("Presence name cannot be empty.");
      return;
    }

    const didSet = sdkClient.setPresence(buildPresencePayload({ includeReplayCursor: true }));
    if (!didSet) {
      setLastAction("Presence update failed; reconnect in npm sdk + wasm mode.");
      return;
    }

    setLastAction(`Presence published as ${nextName}.`);
  }

  function sendPeerSignal() {
    if (backend !== "sdk") {
      setLastSignalStatus("Peer signal requires runtime mode = npm sdk + wasm.");
      return;
    }

    const target = peerTarget.trim();
    if (!target) {
      setLastSignalStatus("Select or enter a target peer id.");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(signalPayload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setLastSignalStatus("Signal payload must be a JSON object.");
        return;
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      setLastSignalStatus("Signal payload is invalid JSON.");
      return;
    }

    const didSend = sdkClient.sendPeerSignal(target, "workspace.signal", payload);
    if (!didSend) {
      setLastSignalStatus("Signal send failed; reconnect in npm sdk + wasm mode.");
      return;
    }

    setLastSignalStatus(`Signal sent to ${target} at ${new Date().toLocaleTimeString()}.`);
  }

  useEffect(() => {
    function onPointerMove(event: MouseEvent) {
      const drag = draggingNodeRef.current;
      const surface = workspaceSurfaceRef.current;
      if (!drag || !surface) {
        return;
      }
      const point = clientPointToWorkspace(event.clientX, event.clientY, surface);
      const x = Math.max(16, Math.min(WORKSPACE_WIDTH - 120, point.x));
      const y = Math.max(16, Math.min(WORKSPACE_HEIGHT - 52, point.y));
      publishDragPresence(drag.nodeId, x, y, false);
      setWorkspaceNodes((previous) => {
        const next = previous.map((node) =>
          node.id === drag.nodeId
            ? {
                ...node,
                x,
                y,
                updatedAtIso: new Date().toISOString()
              }
            : node
        );
        workspaceNodesRef.current = next;
        return next;
      });
    }

    function onPointerUp() {
      const drag = draggingNodeRef.current;
      if (!drag) {
        return;
      }
      const writeTarget = ensureWritableBranchForEdit("workspace.move-node", { applySeedSnapshot: false });
      if (!writeTarget) {
        draggingNodeRef.current = null;
        isDraggingRef.current = false;
        return;
      }
      const branchId = writeTarget.branchId;
      const seedNodes = writeTarget.seededSnapshot?.nodes ?? null;
      const liveNodes = workspaceNodesRef.current;
      const snapshot = seedNodes
        ? seedNodes.map((entry) => (entry.id === drag.nodeId ? { ...entry, ...((liveNodes.find((item) => item.id === drag.nodeId) ?? entry)) } : entry))
        : liveNodes;
      const moved = snapshot.find((node) => node.id === drag.nodeId);
      draggingNodeRef.current = null;
      isDraggingRef.current = false;
      workspaceNodesRef.current = snapshot;
      setWorkspaceNodes(snapshot);
      if (!moved) {
        return;
      }
      const moveOp = createReplayOp(
        `move-node ${moved.id}`,
        {
          type: "workspace.move-node",
          move: {
            nodeId: moved.id,
            x: moved.x,
            y: moved.y,
            updatedAtIso: moved.updatedAtIso
          }
        },
        "workspace.move-node",
        moved.updatedAtIso,
        branchId
      );
      const nextOps = [...readReplayOpsForBranch(branchId), moveOp].sort((left, right) =>
        left.atIso.localeCompare(right.atIso)
      );
      const didPersist = persistMovedNodeWithReplayOps(moved, moveOp, nextOps, branchId);
      if (!didPersist) {
        setLastAction("Workspace move failed to apply locally; reconnect in npm sdk + wasm mode.");
        return;
      }
      setLastAction(`Moved workspace node at ${new Date().toLocaleTimeString()}.`);
      window.setTimeout(() => publishDragPresence(moved.id, moved.x, moved.y, true), 0);
      setActiveNotice("Workspace move persisted.");
    }

    // Pointer events instead of mouse events so touch/pen drags work too
    // (the canvas surface sets touch-action: none to suppress scrolling).
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [backend, canUseSdkActions, replayState, branchBaselineById, activeRoomId]);

  function clearWorkspaceEdges() {
    const writeTarget = ensureWritableBranchForEdit("workspace.clear-edges", { applySeedSnapshot: true });
    if (!writeTarget) {
      return;
    }
    const didPersist = persistWorkspaceEdges([], "Cleared workspace edges.", writeTarget.branchId);
    if (!didPersist) {
      return;
    }
    appendReplayWorkspaceEvent(
      "clear-edges",
      { type: "workspace.clear-edges" },
      "workspace.clear-edges",
      new Date().toISOString(),
      writeTarget.branchId
    );
    edgeSourceNodeIdRef.current = null;
    setActiveNotice("Workspace edges cleared.");
  }

  function createBranchFromCursor() {
    if (!replayState.cursor.nodeId) {
      setLastAction("Cannot branch: no cursor node selected.");
      return;
    }
    const newBranchId = `branch-${branchCounterRef.current++}`;
    const newRoomId = `${activeRoomId}-${newBranchId}`;
    const sourceBranchId = replayState.cursor.branchId;
    const sourceBranchNodeIds = replayState.branchNodeIds[sourceBranchId] ?? [];
    const sourceNodeIndex = Math.min(replayState.cursor.nodeIndex, Math.max(0, sourceBranchNodeIds.length - 1));
    const sourceNodeId =
      sourceBranchNodeIds[sourceNodeIndex] ?? null;
    const baseline = projectReplayWorkspaceSnapshotFor(sourceBranchId, sourceNodeIndex);
    const didPersistBranch = persistBranchCreation(
      {
        branchId: newBranchId,
        roomId: newRoomId,
        label: newBranchId,
        basedOnBranchId: sourceBranchId,
        basedOnNodeId: sourceNodeId,
        createdAtIso: new Date().toISOString()
      },
      baseline,
      `Created ${newBranchId} from ${sourceBranchId}:${sourceNodeId ?? "root"}.`
    );
    if (!didPersistBranch) {
      setLastAction("Branch creation failed; shared topology record was not persisted.");
      return;
    }
    dispatchReplay({
      type: "create-branch-from-cursor",
      newBranchId,
      newRoomId,
      newLabel: newBranchId,
      reason: "manual"
    });
    dispatchReplay({ type: "set-active-branch", branchId: newBranchId });
    dispatchReplay({ type: "set-mode", mode: "live" });
    applyWorkspaceSnapshot(baseline, "runtime");
    suppressWorkspaceRefreshUntilRef.current = Date.now() + 1200;
    activeBranchIdRef.current = newBranchId;
    scheduleReplayCursorPresencePublish({ force: true });
    setLastAction(`Created ${newBranchId} from cursor node ${replayState.cursor.nodeId}.`);
    setActiveNotice(`Branch ${newBranchId} created from replay cursor.`);
  }

  function mergeSelectedSourceIntoActiveHead() {
    if (!mergeSourceNodeId) {
      setLastAction("Select a source node before merge.");
      return;
    }
    if (mergeSourceBranchId === replayState.activeBranchId && mergeSourceNodeId === replayState.cursor.nodeId) {
      setLastAction("Cannot merge active cursor node into itself.");
      return;
    }
    const targetBranchId = activeBranchIdRef.current;
    dispatchReplay({
      type: "merge-into-head",
      sourceBranchId: mergeSourceBranchId,
      sourceNodeId: mergeSourceNodeId,
      targetBranchId
    });
    setLastAction(`Merged ${mergeSourceBranchId}:${mergeSourceNodeId} into ${targetBranchId} head.`);
    setActiveNotice(`Merge applied to ${targetBranchId} head.`);
  }

  const hasWorkspaceObjects =
    workspaceNodes.length > 0 ||
    workspaceEdges.length > 0 ||
    workspaceAssets.length > 0 ||
    workspaceAnnotations.length > 0;

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Workflow demo</h1>
        <p className="nm-page-desc">
          Branch, replay, and merge a shared workflow: scrub the timeline, diverge from any node, and converge back to the live head — with peers visible in real time.
        </p>
      </header>

      {/* +100px over the shared 1180px shell so the workspace panel breathes. */}
      <div className="nm-content" style={{ maxWidth: 1280 }}>
      <section className="nm-controls">
        <label className="nm-label" htmlFor="roomId">Room</label>
        <input
          id="roomId"
          className="nm-input nm-input-xl"
          value={roomIdInput}
          onChange={(event) => setRoomIdInput(event.target.value)}
          placeholder="Enter room id"
        />
        <button type="button" onClick={connectRoom} disabled={!canConnect}>
          Connect
        </button>
        <button
          type="button"
          onClick={() => {
            if (backend === "sdk") {
              sdkClient.disconnect();
              return;
            }
            wsClient.disconnect();
          }}
        >
          Disconnect
        </button>
        <button type="button" onClick={() => void tryAnotherRoom()} disabled={isTryingAnotherRoom}>
          {isTryingAnotherRoom ? "Trying rooms..." : "Try another room"}
        </button>
        <p className="nm-controls-hint">
          Room busy or unreachable? Type a different room name above, or click "Try another
          room" to attempt a couple of nearby room ids automatically.
        </p>
      </section>

      <section style={{ marginBottom: 16 }}>
        <strong>Active room:</strong> <code>{activeRoomId}</code>{" "}
        <span style={{ marginLeft: 8 }}>
          (<code>{config.wsBaseUrl}</code>)
        </span>
        <span style={{ marginLeft: 8 }}>
          mode: <code>{backend}</code>
        </span>
        <span
          style={{
            marginLeft: 8,
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #0f766e",
            background: "#ecfeff",
            color: "#155e75",
            fontSize: 12
          }}
        >
          transport configured=<code>{config.transportMode}</code>, runtime=<code>{diagnostics.transportMode}</code>
        </span>
      </section>

      <section className="nm-layout-2col">
        <article style={{ border: "1px solid #9aa4b2", borderRadius: 8, minHeight: 340, minWidth: 0, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <h2 style={{ marginTop: 0 }}>Workspace objects (persistent)</h2>
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Peers: {onlinePeers.length}</span>
          </div>
          <p style={{ marginTop: 0 }}>
            Add and drag nodes, connect edges with shift-click, place annotations in annotate mode.
          </p>
          {!canUseSdkActions ? (
            <p className="nm-notice nm-notice-offline">
              <strong>Editing disabled.</strong>{" "}
              {backend !== "sdk"
                ? <>Switch <em>Runtime mode</em> to <code>npm sdk + wasm</code> and click Connect to enable nodes, branches, and replay writes. Direct-websocket mode is diagnostics-only.</>
                : <>Waiting for an open connection to the demo host — click Connect, or check that the host is running.</>}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              title="Select / drag / shift-click to connect edges"
              aria-label="Select tool"
              aria-pressed={workspaceTool === "select"}
              onClick={() => setWorkspaceTool("select")}
              style={toolButtonStyle(workspaceTool === "select")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 1l9 7.4-4.7.7 2.5 4.6-1.9 1-2.4-4.7L4 13V1z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              title="Annotate: click canvas to place a note"
              aria-label="Annotate tool"
              aria-pressed={workspaceTool === "annotate"}
              onClick={() => setWorkspaceTool("annotate")}
              style={toolButtonStyle(workspaceTool === "annotate")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M2 3.5A2.5 2.5 0 0 1 4.5 1h7A2.5 2.5 0 0 1 14 3.5v5A2.5 2.5 0 0 1 11.5 11H7.2L3.5 14v-3A2.5 2.5 0 0 1 2 8.5v-5z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <span style={{ width: 1, alignSelf: "stretch", background: "#94a3b8", margin: "2px 4px" }} />
            <button
              type="button"
              title="Add rectangle node"
              aria-label="Add rectangle node"
              onClick={() => addWorkspaceNode("rect")}
              disabled={!canUseSdkActions}
              style={{ ...toolButtonStyle(false), color: "#16a34a" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="4" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            <button
              type="button"
              title="Add circle node"
              aria-label="Add circle node"
              onClick={() => addWorkspaceNode("circle")}
              disabled={!canUseSdkActions}
              style={{ ...toolButtonStyle(false), color: "#16a34a" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            <button
              type="button"
              title="Add diamond node"
              aria-label="Add diamond node"
              onClick={() => addWorkspaceNode("diamond")}
              disabled={!canUseSdkActions}
              style={{ ...toolButtonStyle(false), color: "#16a34a" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              title="Clear all (nodes, edges, assets, notes)"
              aria-label="Clear all workspace objects"
              onClick={clearWorkspaceAll}
              disabled={!canUseSdkActions || !hasWorkspaceObjects}
              style={{ ...toolButtonStyle(false), color: "#b91c1c" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M6 1.5h4l.8 1.7H14v1.9H2V3.2h3.2L6 1.5zM3.3 6.4h9.4l-.7 7.4a1.6 1.6 0 0 1-1.6 1.4H5.6A1.6 1.6 0 0 1 4 13.8L3.3 6.4z"
                  fill="currentColor"
                />
              </svg>
            </button>
            {workspaceTool === "annotate" ? (
              <input
                aria-label="Annotation text"
                value={annotationDraft}
                onChange={(event) => setAnnotationDraft(event.target.value)}
                maxLength={64}
                style={{ minWidth: 160, padding: 6 }}
              />
            ) : null}
            <span style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>nodes: <code>{workspaceNodes.length}</code></span>
              <span>edges: <code>{workspaceEdges.length}</code></span>
              <span>assets: <code>{workspaceAssets.length}</code></span>
              <span>notes: <code>{workspaceAnnotations.length}</code></span>
            </span>
          </div>
          <WorkspaceCanvas
            surfaceRef={workspaceSurfaceRef}
            editingNodeId={editingNodeId}
            editingLabelDraft={editingLabelDraft}
            onEditLabelDraftChange={setEditingLabelDraft}
            onStartEditNode={startEditingNode}
            onCommitRename={commitNodeRename}
            onCancelRename={cancelEditingNode}
            workspaceNodes={workspaceNodes}
            workspaceEdges={workspaceEdges}
            workspaceAssets={workspaceAssets}
            workspaceAnnotations={workspaceAnnotations}
            remoteDragByNodeId={remoteDragByNodeId}
            remoteDragByPeer={remoteDragByPeer}
            presenceByPeer={presenceByPeer}
            canUseSdkActions={canUseSdkActions}
            workspaceTool={workspaceTool}
            replayMode={replayState.cursor.mode}
            canvasReplayBadge={canvasReplayBadge}
            edgeSourceNodeId={edgeSourceNodeIdRef.current}
            onSurfacePointerDown={handleWorkspaceSurfaceMouseDown}
            onNodePointerDown={handleWorkspaceNodeMouseDown}
          />
          <ReplayControls
            replayState={replayState}
            availableBranchIds={availableBranchIds}
            replayNodeCount={replayNodeCount}
            replayCanStep={replayCanStep}
            isReplayPlaying={isReplayPlaying}
            onSetActiveBranch={(branchId) => {
              activeBranchIdRef.current = branchId;
              dispatchReplay({
                type: "set-active-branch",
                branchId
              });
              if (replayModeRef.current === "live") {
                queueMicrotask(() => loadLiveWorkspaceForBranch(branchId));
              }
            }}
            onSetMode={(mode) => {
              dispatchReplay({ type: "set-mode", mode });
              scheduleReplayCursorPresencePublish({ force: true });
            }}
            onTogglePlay={() => {
              if (isReplayPlaying) {
                setIsReplayPlaying(false);
                return;
              }
              if (replayNodeCount > 1 && replayState.cursor.nodeIndex >= replayNodeCount - 1) {
                selectReplayBranchNode(replayState.cursor.branchId, 0);
              }
              setIsReplayPlaying(true);
            }}
            onSelectNode={selectReplayBranchNode}
            onCreateBranchFromCursor={createBranchFromCursor}
            mergeSourceBranchId={mergeSourceBranchId}
            onMergeSourceBranchChange={(branchId) => {
              setMergeSourceBranchId(branchId);
              setMergeSourceNodeId("");
            }}
            mergeSourceNodeId={mergeSourceNodeId}
            onMergeSourceNodeChange={setMergeSourceNodeId}
            mergeSourceBranchNodeIds={mergeSourceBranchNodeIds}
            onMergeIntoActiveHead={mergeSelectedSourceIntoActiveHead}
            mergeEligibilityMessage={mergeEligibilityMessage}
            laneLayout={laneLayout}
            sortedBranchIds={sortedBranchIds}
            branchOffsetById={branchOffsetById}
            mergeConnectors={mergeConnectors}
            remoteReplayCursorByPeer={remoteReplayCursorByPeer}
            laneXForRemoteReplayCursor={laneXForRemoteReplayCursor}
          />
        </article>

        <PresencePanel
          defaultOpen={isWideViewport}
          backend={backend}
          onBackendChange={setBackend}
          activeNotice={activeNotice}
          lastAction={lastAction}
          currentReplayNode={currentReplayNode}
          presenceName={presenceName}
          onPresenceNameChange={setPresenceName}
          onPublishPresence={publishPresence}
          onlinePeers={onlinePeers}
          presenceByPeer={presenceByPeer}
          peerTarget={peerTarget}
          onPeerTargetChange={setPeerTarget}
          signalPayload={signalPayload}
          onSignalPayloadChange={setSignalPayload}
          onSendPeerSignal={sendPeerSignal}
          lastSignalStatus={lastSignalStatus}
          incomingSignals={incomingSignals}
          persistenceFeed={persistenceFeed}
          canUseSdkActions={canUseSdkActions}
          diagnostics={diagnostics}
        />
      </section>
      </div>
    </main>
  );
}

