import type { ReactNode } from "react";
import { colorForPeer, isAttributedChar } from "./peerColors";
import type { AttributionSpan } from "./textAttribution";

export function renderAttributedText(text: string, spans: AttributionSpan[]): ReactNode[] {
  const chars = [...text];
  if (chars.length === 0) {
    return [<span key="empty" style={{ color: "#94a3b8" }}>(empty)</span>];
  }

  const nodes: ReactNode[] = [];
  let index = 0;
  while (index < chars.length) {
    const span = spans.find((entry) => index >= entry.start && index < entry.end);
    const ch = chars[index];
    if (!span || !isAttributedChar(ch)) {
      nodes.push(
        <span key={`${index}-${ch}`} style={{ color: "#0f172a" }}>
          {ch}
        </span>
      );
      index += 1;
      continue;
    }
    let end = index + 1;
    while (
      end < chars.length &&
      spans.some((entry) => end >= entry.start && end < entry.end && entry.peerId === span.peerId) &&
      isAttributedChar(chars[end])
    ) {
      end += 1;
    }
    nodes.push(
      <span key={`${index}-${span.peerId}`} style={{ color: colorForPeer(span.peerId) }} title={span.peerId}>
        {chars.slice(index, end).join("")}
      </span>
    );
    index = end;
  }
  return nodes;
}
