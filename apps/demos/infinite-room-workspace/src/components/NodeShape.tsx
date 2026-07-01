import React from 'react';
import { RoomNode } from '../store/types';
import { getDefaultNodeColor } from '../utils/peerColors';

/**
 * Props for the NodeShape component.
 */
interface NodeShapeProps {
  node: RoomNode;
  selected: boolean;
  onClick: (nodeId: string) => void;
}

/**
 * NodeShape is a React/DOM-based fallback component for rendering
 * individual room nodes with their per-peer color.
 *
 * This is an alternative to the full-canvas renderer and can be used
 * in views where DOM-based rendering is preferred (e.g., accessibility,
 * text editing, or simpler layouts).
 *
 * The node is drawn using its stored `color` field (per-peer color),
 * falling back to the default neutral gray when absent.
 */
const NodeShape: React.FC<NodeShapeProps> = ({ node, selected, onClick }) => {
  const color = node.color || getDefaultNodeColor();
  const w = node.width ?? 200;
  const h = node.height ?? 200;

  const shapeStyles: Record<string, React.CSSProperties> = {
    sticky: {
      borderRadius: 8,
      backgroundColor: color,
      boxShadow: '2px 2px 8px rgba(0,0,0,0.15)',
      padding: 16,
      fontSize: 14,
      color: '#1F2937',
      overflow: 'hidden',
    },
    rectangle: {
      borderRadius: 4,
      backgroundColor: color,
      border: '2px solid rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 600,
      color: '#FFFFFF',
    },
    ellipse: {
      borderRadius: '50%',
      backgroundColor: color,
      border: '2px solid rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 600,
      color: '#1F2937',
    },
    text: {
      fontSize: 16,
      color: color,
      fontWeight: 500,
      padding: 4,
    },
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: w,
    height: node.type === 'text' ? 'auto' : h,
    cursor: 'pointer',
    outline: selected ? `3px solid ${color}` : undefined,
    outlineOffset: selected ? 2 : 0,
    transition: 'outline 0.15s',
    ...(shapeStyles[node.type] || shapeStyles.rectangle),
  };

  return (
    <div style={style} onClick={() => onClick(node.id)}>
      {node.content && node.type !== 'text' && (
        <span
          style={{
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {node.content}
        </span>
      )}
      {node.type === 'text' && (node.content || '')}
    </div>
  );
};

export default NodeShape;
