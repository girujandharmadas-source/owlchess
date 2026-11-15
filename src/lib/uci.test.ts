import { describe, expect, it } from "vitest";
import {
  clampElo,
  formatScore,
  parseBestMove,
  parseInfo,
  parseSpinOption,
  splitUciMove,
  toWhitePov,
  whiteWinChance,
} from "./uci";

describe("parseInfo", () => {
  it("parses a cp info line with multipv and pv", () => {
    const l =
      "info depth 14 seldepth 20 multipv 2 score cp -35 nodes 12345 nps 500000 time 25 pv e7e5 g1f3 b8c6";
    expect(parseInfo(l)).toEqual({
      depth: 14,
      multipv: 2,
      score: { type: "cp", value: -35 },
      pv: ["e7e5", "g1f3", "b8c6"],
    });
  });

  it("parses mate scores and skips bound markers", () => {
    const l = "info depth 20 score mate -3 lowerbound nodes 1 pv h7h8q";
    expect(parseInfo(l)).toMatchObject({ multipv: 1, score: { type: "mate", value: -3 }, pv: ["h7h8q"] });
  });

  it("ignores info lines without score/pv", () => {
    expect(parseInfo("info string NNUE evaluation using nn-xxx.nnue")).toBeNull();
    expect(parseInfo("info depth 1 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseInfo("bestmove e2e4")).toBeNull();
  });
});

describe("parseBestMove", () => {
  it("extracts the move", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
    expect(parseBestMove("bestmove a7a8q")).toBe("a7a8q");
  });
  it("returns null for (none) and undefined for non-bestmove lines", () => {
    expect(parseBestMove("bestmove (none)")).toBeNull();
    expect(parseBestMove("info depth 3")).toBeUndefined();
  });
});

describe("parseSpinOption", () => {
  it("reads UCI_Elo bounds", () => {
    expect(parseSpinOption("option name UCI_Elo type spin default 1320 min 1320 max 3190")).toEqual({
      name: "UCI_Elo",
      default: 1320,
      min: 1320,
      max: 3190,
    });
  });
  it("handles option names with spaces", () => {
    expect(parseSpinOption("option name Skill Level type spin default 20 min 0 max 20")?.name).toBe("Skill Level");
  });
  it("ignores non-spin options", () => {
    expect(parseSpinOption("option name UCI_LimitStrength type check default false")).toBeNull();
  });
});

describe("score helpers", () => {
  it("flips to White POV when Black is to move", () => {
    expect(toWhitePov({ type: "cp", value: 50 }, "b")).toEqual({ type: "cp", value: -50 });
    expect(toWhitePov({ type: "mate", value: 2 }, "w")).toEqual({ type: "mate", value: 2 });
  });
  it("computes win chance", () => {
    expect(whiteWinChance({ type: "cp", value: 0 })).toBeCloseTo(0.5);
    expect(whiteWinChance({ type: "cp", value: 300 })).toBeGreaterThan(0.75);
    expect(whiteWinChance({ type: "cp", value: -300 })).toBeLessThan(0.25);
    expect(whiteWinChance({ type: "mate", value: 3 })).toBe(1);
    expect(whiteWinChance({ type: "mate", value: -1 })).toBe(0);
  });
  it("formats scores", () => {
    expect(formatScore({ type: "cp", value: 34 })).toBe("+0.34");
    expect(formatScore({ type: "cp", value: -120 })).toBe("-1.20");
    expect(formatScore({ type: "cp", value: 0 })).toBe("0.00");
    expect(formatScore({ type: "mate", value: -2 })).toBe("#-2");
  });
});

describe("move + elo helpers", () => {
  it("splits UCI moves", () => {
    expect(splitUciMove("e2e4")).toEqual({ from: "e2", to: "e4", promotion: undefined });
    expect(splitUciMove("b7b8n")).toEqual({ from: "b7", to: "b8", promotion: "n" });
  });
  it("clamps Elo to engine range", () => {
    const r = { min: 1320, max: 3190 };
    expect(clampElo(800, r)).toBe(1320);
    expect(clampElo(3650, r)).toBe(3190);
    expect(clampElo(1800.4, r)).toBe(1800);
    expect(clampElo(null, r)).toBeNull();
  });
});
