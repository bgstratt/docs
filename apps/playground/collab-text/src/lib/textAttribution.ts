import { isAttributedChar } from "./peerColors";

export type TextGlyph = {
  lamport: number;
  author: string;
  ch: string;
};

export type AttributionSpan = {
  start: number;
  end: number;
  peerId: string;
};

export function peerIdFromAuthor(authorHex: string): string {
  return authorHex.length >= 12 ? authorHex.slice(0, 12) : authorHex;
}

export function glyphsToText(glyphs: TextGlyph[]): string {
  return glyphs.map((glyph) => glyph.ch).join("");
}

export function buildAttributionSpans(glyphs: TextGlyph[]): AttributionSpan[] {
  const spans: AttributionSpan[] = [];
  let index = 0;
  for (const glyph of glyphs) {
    const charLen = glyph.ch.length;
    if (!isAttributedChar(glyph.ch)) {
      index += charLen;
      continue;
    }
    const peerId = peerIdFromAuthor(glyph.author);
    const last = spans[spans.length - 1];
    if (last && last.peerId === peerId && last.end === index) {
      last.end += charLen;
    } else {
      spans.push({ start: index, end: index + charLen, peerId });
    }
    index += charLen;
  }
  return spans;
}
