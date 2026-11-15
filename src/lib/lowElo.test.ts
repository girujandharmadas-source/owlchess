import { describe, expect, it } from "vitest";
import {
  computeCandidateProbabilities,
  getEloTier,
  getLowEloSearchConfig,
  selectLowEloMove,
} from "./lowElo";

const cp = (value: number) => ({ type: "cp" as const, value });
const mate = (value: number) => ({ type: "mate" as const, value });

describe("getEloTier", () => {
  it("maps slider values to the 5 skill tiers", () => {
    expect(getEloTier(600)).toBe("Beginner");
    expect(getEloTier(799)).toBe("Beginner");
    expect(getEloTier(800)).toBe("Novice");
    expect(getEloTier(1050)).toBe("Novice");
    expect(getEloTier(1100)).toBe("Intermediate");
    expect(getEloTier(1319)).toBe("Intermediate");
    expect(getEloTier(1320)).toBe("Advanced");
    expect(getEloTier(1950)).toBe("Advanced");
    expect(getEloTier(2000)).toBe("Master / Grandmaster");
    expect(getEloTier(1400, true)).toBe("Master / Grandmaster");
  });
});

describe("getLowEloSearchConfig", () => {
  it("returns depth-limited MultiPV=4 configs below 1320 and null at 1320+", () => {
    expect(getLowEloSearchConfig(650)).toEqual({ multipv: 4, depth: 1, movetime: 120 });
    expect(getLowEloSearchConfig(750)).toEqual({ multipv: 4, depth: 2, movetime: 120 });
    expect(getLowEloSearchConfig(900)).toEqual({ multipv: 4, depth: 2, movetime: 180 });
    expect(getLowEloSearchConfig(1050)).toEqual({ multipv: 4, depth: 3, movetime: 180 });
    expect(getLowEloSearchConfig(1150)).toEqual({ multipv: 4, depth: 3, movetime: 240 });
    expect(getLowEloSearchConfig(1280)).toEqual({ multipv: 4, depth: 5, movetime: 240 });
    expect(getLowEloSearchConfig(1320)).toBeNull();
    expect(getLowEloSearchConfig(2200)).toBeNull();
  });
});

describe("computeCandidateProbabilities & selectLowEloMove", () => {
  const sampleLines = [
    { score: cp(45), pv: ["e2e4"] },
    { score: cp(25), pv: ["d2d4"] },
    { score: cp(-10), pv: ["g1f3"] },
    { score: cp(-65), pv: ["b1c3"] },
  ];

  it("frequently selects 2nd, 3rd, or 4th moves at Beginner Elo (600–799)", () => {
    const dist = computeCandidateProbabilities(sampleLines, 700);
    expect(dist).toHaveLength(4);
    const nonBestProb = dist.slice(1).reduce((s, d) => s + d.weight, 0);
    // Beginner should pick a non-top-1 candidate more than 55% of the time on close candidates
    expect(nonBestProb).toBeGreaterThan(0.55);
    expect(selectLowEloMove(sampleLines, 700, () => 0.95)).toBe("b1c3");
  });

  it("strongly prefers candidate 1 and 2 at Novice Elo (800–1099) while allowing candidate 3", () => {
    const dist = computeCandidateProbabilities(sampleLines, 950);
    const top2Prob = dist[0].weight + dist[1].weight;
    expect(top2Prob).toBeGreaterThan(0.8);
    expect(dist[2].weight).toBeGreaterThan(0.05);
  });

  it("concentrates weight on candidate 1 and 2 with tight cp margins at Intermediate Elo (1100–1319)", () => {
    const dist = computeCandidateProbabilities(sampleLines, 1200);
    const top2Prob = dist[0].weight + dist[1].weight;
    expect(top2Prob).toBeGreaterThan(0.95);
  });

  it("safety check filters out Queen blunders (>600 cp drop) and instant checkmates above 600 Elo", () => {
    const dangerousLines = [
      { score: cp(50), pv: ["g1f3"] },
      { score: cp(-850), pv: ["d1h5"] }, // blunders Queen (-900 cp swing)
      { score: mate(-1), pv: ["f2f3"] }, // walks into mate in 1
    ];
    const dist750 = computeCandidateProbabilities(dangerousLines, 750);
    expect(dist750).toHaveLength(1);
    expect(dist750[0].move).toBe("g1f3");

    // Even at 600 Elo, instant self-mate in 1 is filtered out
    const dist600 = computeCandidateProbabilities(dangerousLines, 600);
    expect(dist600.some((d) => d.move === "f2f3")).toBe(false);
  });
});
