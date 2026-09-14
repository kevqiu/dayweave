import { describe, expect, it } from "vitest";
import { previewNodes, statusOfDay, type PreviewNode } from "../preview.ts";

const HAKATA = { lat: 33.5904, lng: 130.4017 };
const OHORI = { lat: 33.5852, lng: 130.3800 };
const KAGOSHIMA = { lat: 31.5966, lng: 130.5571 };
const HAKONE = { lat: 35.2324, lng: 139.1069 };

const TODAY = "2025-10-02";

/** The strip the percentages are of, and the node drawn on it. */
const STRIP = { width: 345, height: 62 };
const NODE = 15;

const px = (node: PreviewNode) => ({
  x: (node.x / 100) * STRIP.width,
  y: (node.y / 100) * STRIP.height,
});

/** A trip across Japan, and a trip that never leaves one neighbourhood. */
const JAPAN = [
  { date: "2025-09-30", stops: [HAKATA, OHORI] },
  { date: "2025-10-01", stops: [OHORI] },
  { date: "2025-10-02", stops: [HAKATA] },
  { date: "2025-10-03", stops: [KAGOSHIMA] },
  { date: "2025-10-04", stops: [] },
  { date: "2025-10-05", stops: [HAKONE] },
  { date: "2025-10-06", stops: [HAKONE] },
];

const ONE_CITY = Array.from({ length: 8 }, (_, i) => ({
  date: `2025-10-0${i + 1}`,
  stops: [{ lat: 33.59 + i * 0.0008, lng: 130.4 + i * 0.0011 }],
}));

describe("previewNodes", () => {
  it("puts one node on each day that has stops", () => {
    const nodes = previewNodes(JAPAN, TODAY);
    expect(nodes.map((n) => n.date)).toEqual([
      "2025-09-30", "2025-10-01", "2025-10-02", "2025-10-03", "2025-10-05", "2025-10-06",
    ]);
  });

  it("says nothing about a trip with nothing located on it", () => {
    expect(previewNodes([{ date: "2025-10-01", stops: [] }], TODAY)).toEqual([]);
  });

  it("colours a day by where it sits against today", () => {
    expect(previewNodes(JAPAN, TODAY).map((n) => n.status)).toEqual([
      "done", "done", "now", "ahead", "ahead", "ahead",
    ]);
  });

  it("keeps every node inside the strip", () => {
    for (const trip of [JAPAN, ONE_CITY]) {
      for (const node of previewNodes(trip, TODAY)) {
        const at = px(node);
        expect(at.x).toBeGreaterThanOrEqual(NODE / 2);
        expect(at.y).toBeGreaterThanOrEqual(NODE / 2);
        expect(at.x).toBeLessThanOrEqual(STRIP.width - NODE / 2);
        expect(at.y).toBeLessThanOrEqual(STRIP.height - NODE / 2);
      }
    }
  });

  it("keeps every node out from under the DAY n OF m chip", () => {
    for (const trip of [JAPAN, ONE_CITY]) {
      for (const node of previewNodes(trip, TODAY)) {
        const at = px(node);
        const underChip = at.x > STRIP.width - 96 - NODE / 2 && at.y < 28 + NODE / 2;
        expect(underChip).toBe(false);
      }
    }
  });

  it("leaves a gap between two days, wherever they are", () => {
    for (const trip of [JAPAN, ONE_CITY]) {
      const nodes = previewNodes(trip, TODAY).map(px);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          // The gap is 17px; a node pressed into a corner can lose a little.
          expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(NODE - 2);
        }
      }
    }
  });

  it("shows every day of a week spent in one city", () => {
    // Eight days a hundred metres apart still read as eight days.
    expect(previewNodes(ONE_CITY, TODAY)).toHaveLength(8);
  });

  it("keeps a trip that never leaves one place in the middle of the strip", () => {
    for (const node of previewNodes(ONE_CITY, TODAY)) {
      expect(Math.abs(node.x - 50)).toBeLessThan(20);
    }
  });

  it("spreads a trip across a country to the ends of the strip", () => {
    const nodes = previewNodes(
      [
        { date: "2025-10-01", stops: [HAKATA] },
        { date: "2025-10-02", stops: [HAKONE] },
      ],
      TODAY,
    );
    // Hakone is east of Hakata and north of it, so it is right and high.
    expect(nodes[0]!.x).toBeLessThan(10);
    expect(nodes[1]!.x).toBeGreaterThan(90);
    expect(nodes[1]!.y).toBeLessThan(nodes[0]!.y);
  });

  it("centres a single day", () => {
    expect(previewNodes([{ date: TODAY, stops: [HAKATA] }], TODAY)).toEqual([
      { date: TODAY, x: 50, y: 50, status: "now" },
    ]);
  });

  it("puts a day where its stops are, not on one of them", () => {
    const nodes = previewNodes(
      [
        { date: "2025-10-01", stops: [{ lat: 33.5, lng: 130.0 }, { lat: 33.5, lng: 131.0 }] },
        { date: "2025-10-02", stops: [{ lat: 33.5, lng: 130.5 }] },
      ],
      TODAY,
    );
    // Both days average to the same longitude, so they only differ by the gap
    // that was eased between them.
    expect(Math.abs(nodes[0]!.x - nodes[1]!.x) * STRIP.width / 100).toBeLessThan(18);
  });

  it("is the same every time it is asked", () => {
    expect(previewNodes(JAPAN, TODAY)).toEqual(previewNodes(JAPAN, TODAY));
  });
});

describe("statusOfDay", () => {
  it("is the three of PLAN.md section 7", () => {
    expect(statusOfDay("2025-10-01", TODAY)).toBe("done");
    expect(statusOfDay(TODAY, TODAY)).toBe("now");
    expect(statusOfDay("2025-12-25", TODAY)).toBe("ahead");
  });
});
