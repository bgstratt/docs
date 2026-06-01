export type TextEdit = {
  pos: number;
  deleteLen: number;
  insertText: string;
};

/** Unicode scalar length — matches Rust `char` positions in the WASM text layer. */
export function textCodePointLength(value: string): number {
  return [...value].length;
}

/** Clamp edits to the current document length (code-point indices). */
export function clampTextEdits(edits: TextEdit[], docLength: number): TextEdit[] {
  return edits
    .map((edit) => {
      const pos = Math.min(Math.max(0, edit.pos), docLength);
      const maxDelete = Math.max(0, docLength - pos);
      const deleteLen = Math.min(Math.max(0, edit.deleteLen), maxDelete);
      return { pos, deleteLen, insertText: edit.insertText };
    })
    .filter((edit) => edit.deleteLen > 0 || edit.insertText.length > 0);
}

/** One contiguous edit between two strings (fine for normal typing/paste). */
export function diffTextEdits(before: string, after: string): TextEdit[] {
  if (before === after) {
    return [];
  }

  const beforeChars = [...before];
  const afterChars = [...after];

  let prefix = 0;
  const minLen = Math.min(beforeChars.length, afterChars.length);
  while (prefix < minLen && beforeChars[prefix] === afterChars[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeChars.length - prefix &&
    suffix < afterChars.length - prefix &&
    beforeChars[beforeChars.length - 1 - suffix] === afterChars[afterChars.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const deleteLen = beforeChars.length - prefix - suffix;
  const insertText = afterChars.slice(prefix, afterChars.length - suffix).join("");
  if (deleteLen === 0 && insertText.length === 0) {
    return [];
  }

  return [{ pos: prefix, deleteLen, insertText }];
}
