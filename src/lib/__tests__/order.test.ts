import { describe, expect, it } from "vitest";
import { orderKeyAppend, orderKeyBetween } from "../order.ts";

describe("orderKeyBetween", () => {
  it("lands in the middle of an empty list", () => {
    expect(orderKeyBetween(null, null)).toBe("i");
  });

  it("appends after the last key", () => {
    const first = orderKeyBetween(null, null);
    const second = orderKeyBetween(first, null);
    expect(second > first).toBe(true);
  });

  it("always finds room between two adjacent keys", () => {
    let low = "a";
    let high = "b";
    for (let i = 0; i < 40; i++) {
      const mid = orderKeyBetween(low, high);
      expect(mid > low).toBe(true);
      expect(mid < high).toBe(true);
      high = mid;
    }
    expect(low < high).toBe(true);
  });

  it("goes below the first key", () => {
    const first = orderKeyBetween(null, null);
    expect(orderKeyBetween(null, first) < first).toBe(true);
  });

  it("refuses keys that are out of sequence", () => {
    expect(() => orderKeyBetween("b", "a")).toThrow(/out of sequence/);
  });

  it("refuses to go below zero", () => {
    expect(() => orderKeyBetween(null, "0")).toThrow(/no key sorts below/);
  });
});

describe("orderKeyAppend", () => {
  it("keeps a list of appends sorted in the order they were made", () => {
    const keys: string[] = [];
    for (let i = 0; i < 30; i++) keys.push(orderKeyAppend(keys));
    expect([...keys].sort()).toEqual(keys);
  });
});
