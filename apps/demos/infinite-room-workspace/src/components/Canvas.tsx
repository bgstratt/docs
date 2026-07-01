import React, { useRef, useEffect, useCallback, useState } from 'react';
import { renderAllNodes } from '../renderers/nodeRenderer';
import { useNodes } from '../store/useNodes';
import { RoomNode, NodeType } from '../store/types';
import { getPeerColor, getDefaultNodeColor } from '../utils/peerColors';

/**
 * InfiniteCanvas provides a pannable, zoomable workspace that renders
 * all room nodes using their per-peer color.
 *
 * Key behavior:
 * - Left-click on empty space: create a new sticky note (uses peer's color)
 * - Click on a node: select it
 * - Drag on empty space: pan the viewport
 * - Scroll: zoom in/out
 * - Selected node shows a highlight ring that composes with per-peer colors
 */
const InfiniteCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { nodes, createNode, updateNode, deleteNode, peerId } = useNodes();

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // Interaction state
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Node type selector
  const [activeTool, setActiveTool] = useState<NodeType>('sticky');

  // ----- Rendering -----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid (subtle, for spatial orientation)
    drawGrid(ctx, pan.x, pan.y, zoom, rect.width, rect.height);

    // Render all nodes using per-peer colors
    renderAllNodes(ctx, nodes, selectedNodeIds, pan.x, pan.y, zoom);
  }, [nodes, selectedNodeIds, pan, zoom]);

  // Redraw on state change
  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      draw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // ----- Input Handling -----

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      return {
        x: (screenX - rect.left) / zoom - pan.x,
        y: (screenY - rect.top) / zoom - pan.y,
      };
    },
    [pan, zoom],
  );

  const hitTestNode = useCallback(
    (worldX: number, worldY: number): RoomNode | null => {
      // Iterate in reverse so top-most (last drawn) nodes are hit first
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const w = node.width ?? 200;
        const h = node.height ?? 200;
        if (
          worldX >= node.x &&
          worldX <= node.x + w &&
          worldY >= node.y &&
          worldY <= node.y + h
        ) {
          return node;
        }
      }
      return null;
    },
    [nodes],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const hitNode = hitTestNode(worldPos.x, worldPos.y);

      if (hitNode) {
        // Select the node
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (e.shiftKey) {
            // Multi-select toggle
            if (next.has(hitNode.id)) {
              next.delete(hitNode.id);
            } else {
              next.add(hitNode.id);
            }
          } else {
            next.clear();
            next.add(hitNode.id);
          }
          return next;
        });

        // Start potential drag of selected node(s)
        isPanning.current = false;
      } else {
        // Click on empty space — prepare to create a node OR pan
        if (!e.shiftKey) {
          setSelectedNodeIds(new Set());
        }
        isPanning.current = true;
        panStart.current = worldPos;
      }

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [screenToWorld, hitTestNode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isPanning.current) {
        // Drag selected nodes
        if (selectedNodeIds.size > 0 && e.buttons === 1) {
          const dx = (e.clientX - lastMousePos.current.x) / zoom;
          const dy = (e.clientY - lastMousePos.current.y) / zoom;
          for (const id of selectedNodeIds) {
            updateNode(id, {
              x: (nodes.find((n) => n.id === id)?.x ?? 0) + dx,
              y: (nodes.find((n) => n.id === id)?.y ?? 0) + dy,
            });
          }
        }
      } else if (e.buttons === 1) {
        // Pan the viewport
        setPan((prev) => ({
          x: prev.x + (e.clientX - lastMousePos.current.x) / zoom,
          y: prev.y + (e.clientY - lastMousePos.current.y) / zoom,
        }));
      }

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [zoom, selectedNodeIds, nodes, updateNode],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning.current) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        const dx = Math.abs(worldPos.x - panStart.current.x);
        const dy = Math.abs(worldPos.y - panStart.current.y);

        // If we barely moved, treat as a click → create node
        if (dx < 5 && dy < 5) {
          createNode(activeTool, worldPos.x, worldPos.y);
        }
      }
      isPanning.current = false;
    },
    [screenToWorld, createNode, activeTool],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.min(5, Math.max(0.1, prev * delta)));
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        for (const id of selectedNodeIds) {
          deleteNode(id);
        }
        setSelectedNodeIds(new Set());
      }
    },
    [selectedNodeIds, deleteNode],
  );

  // ----- Grid drawing -----
  const drawGrid = (
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    z: number,
    cw: number,
    ch: number,
  ) => {
    const gridSize = 50 * z;
    if (gridSize < 10) return; // Don't draw grid when too zoomed out

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 0.5;

    const startX = ((px * z) % gridSize) - gridSize;
    const startY = ((py * z) % gridSize) - gridSize;

    for (let x = startX; x < cw + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    for (let y = startY; y < ch + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }
  };

  // ----- Toolbar -----
  const tools: { type: NodeType; label: string; emoji: string }[] = [
    { type: 'sticky', label: 'Sticky', emoji: '📝' },
    { type: 'rectangle', label: 'Rect', emoji: '⬜' },
    { type: 'ellipse', label: 'Ellipse', emoji: '🔵' },
    { type: 'text', label: 'Text', emoji: '🔤' },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#F9FAFB',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 6,
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
        }}
      >
        {tools.map((tool) => (
          <button
            key={tool.type}
            onClick={() => setActiveTool(tool.type)}
            title={tool.label}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: activeTool === tool.type ? 700 : 400,
              backgroundColor:
                activeTool === tool.type
                  ? getPeerColor(peerId)
                  : 'transparent',
              color: activeTool === tool.type ? '#FFFFFF' : '#374151',
              fontSize: 14,
              transition: 'all 0.15s',
            }}
          >
            {tool.emoji} {tool.label}
          </button>
        ))}
      </div>

      {/* Peer indicator */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          backgroundColor: 'white',
          borderRadius: 12,
          padding: '8px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: '#374151',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: getPeerColor(peerId),
          }}
        />
        Your color
      </div>

      {/* Zoom indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 10,
          backgroundColor: 'white',
          borderRadius: 8,
          padding: '6px 12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          fontSize: 12,
          color: '#6B7280',
        }}
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isPanning.current ? 'grabbing' : 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
    </div>
  );
};

export default InfiniteCanvas;
