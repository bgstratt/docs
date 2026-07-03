// caretTransform — keep the local caret stable when a remote text update
// replaces the textarea value wholesale. Uses a common-prefix/common-suffix
// diff: edits entirely before the caret shift it by the length delta; edits
// after it leave it alone; if the caret sits inside the changed region it
// clamps to the end of the new region.

export function transformCaret(oldText: string, newText: string, caret: number): number {
  if (oldText === newText) {
    return Math.min(caret, newText.length);
  }
  const minLen = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < minLen && oldText[prefix] === newText[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const oldChangeEnd = oldText.length - suffix;
  const delta = newText.length - oldText.length;

  if (caret <= prefix) {
    return caret;
  }
  if (caret >= oldChangeEnd) {
    return Math.max(0, Math.min(newText.length, caret + delta));
  }
  // Caret was inside the replaced region — land at the end of the new region.
  return newText.length - suffix;
}
