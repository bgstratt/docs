import { describe, expect, it } from "vitest";
import { parseNodeRecord } from "./workspaceNodeStorage";

const base = {
  id: "node-1",
  x: 40,
  y: 40,
  label: "Node 1",
  updatedAtIso: "2026-07-04T00:00:00.000Z"
};

describe("parseNodeRecord shape handling", () => {
  it("round-trips valid shapes", () => {
    for (const shape of ["rect", "circle", "diamond"]) {
      const record = parseNodeRecord(JSON.stringify({ ...base, shape }));
      expect(record?.shape).toBe(shape);
    }
  });

  it("accepts records without a shape field", () => {
    const record = parseNodeRecord(JSON.stringify(base));
    expect(record).not.toBeNull();
    expect(record?.shape).toBeUndefined();
  });

  it("drops unrecognized shape values", () => {
    const record = parseNodeRecord(JSON.stringify({ ...base, shape: "hexagon" }));
    expect(record).not.toBeNull();
    expect(record && "shape" in record).toBe(false);
  });

  it("still rejects structurally invalid records", () => {
    expect(parseNodeRecord(JSON.stringify({ ...base, x: "not-a-number" }))).toBeNull();
    expect(parseNodeRecord(null)).toBeNull();
  });
});
