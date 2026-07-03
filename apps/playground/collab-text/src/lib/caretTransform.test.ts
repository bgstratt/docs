import { describe, expect, it } from "vitest";
import { transformCaret } from "./caretTransform";

describe("transformCaret", () => {
  it("keeps caret when texts are equal", () => {
    expect(transformCaret("hello", "hello", 3)).toBe(3);
  });

  it("keeps caret before an edit further right", () => {
    // insert "XY" at 5; caret at 2 unaffected
    expect(transformCaret("hello world", "helloXY world", 2)).toBe(2);
  });

  it("shifts caret after an insertion to its left", () => {
    // insert "AB" at 0; caret at 3 -> 5
    expect(transformCaret("hello", "ABhello", 3)).toBe(5);
  });

  it("shifts caret after a deletion to its left", () => {
    // delete "he" at 0; caret at 4 -> 2
    expect(transformCaret("hello", "llo", 4)).toBe(2);
  });

  it("clamps caret inside a replaced region to end of new region", () => {
    // "abcdef" -> "abXYef": change region [2,4) replaced; caret 3 inside -> end of new region (4)
    expect(transformCaret("abcdef", "abXYef", 3)).toBe(4);
  });

  it("never exceeds new text length", () => {
    expect(transformCaret("hello", "he", 5)).toBe(2);
  });

  it("keeps caret before a remote insertion exactly at the caret", () => {
    // Boundary tie-break: a remote append at the caret position does not push
    // the local caret past it (stable relative position).
    expect(transformCaret("abc", "abcd", 3)).toBe(3);
  });
});
