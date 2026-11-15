import { describe, expect, it } from "vitest";
import { detectMotifs } from "./motifs";

describe("detectMotifs", () => {
  it("detects a knight fork on king and rook", () => {
    // White Knight on d5 plays Nc7+, forking Black King on e8 and Rook on a8.
    const fen = "r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1";
    const res = detectMotifs({ fenBefore: fen, uciMove: "d5c7" });
    expect(res.tags).toContain("Fork");
    expect(res.tags).toContain("Check");
    expect(res.arrows.length).toBeGreaterThanOrEqual(2);
  });

  it("detects an absolute pin by a bishop", () => {
    // White plays Bb5, pinning Black Knight on c6 to Black King on e8 (with d7 pawn on d5).
    const fen = "r1bqkbnr/ppp2ppp/2n5/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4";
    const res = detectMotifs({ fenBefore: fen, uciMove: "f1b5" });
    expect(res.tags).toContain("Pin");
    expect(res.descriptions.some((d) => d.includes("Absolute pin"))).toBe(true);
  });

  it("detects a skewer along a file/diagonal", () => {
    // White Bishop moves to f3, skewering Black King on d5 and Black Rook on a8.
    const fen = "r7/8/8/3k4/8/8/4B3/6K1 w - - 0 1";
    const res = detectMotifs({ fenBefore: fen, uciMove: "e2f3" });
    expect(res.tags).toContain("Skewer");
    expect(res.tags).toContain("Check");
  });

  it("detects a discovered check", () => {
    // White Rook on e1, White Knight on e4, Black King on e8. Moving Ne4->d6 uncovers check from Re1.
    const fen = "4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1";
    const res = detectMotifs({ fenBefore: fen, uciMove: "e4d6" });
    expect(res.tags).toContain("Discovered Check");
  });

  it("detects a zwischenzug (in-between check before recapturing)", () => {
    // Before previous move: Black captures White's knight on d4 with exd4; White has Nxd4 available,
    // but instead plays Bb5+ (in-between check, with c6 empty).
    const fenBeforePrev = "rnbqkbnr/ppp2ppp/8/3pp3/3NP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 4";
    const prevMove = "e5d4";
    const fenBefore = "rnbqkbnr/ppp2ppp/8/3p4/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 5";
    const res = detectMotifs({
      fenBefore,
      uciMove: "f1b5",
      fenBeforePrevious: fenBeforePrev,
      previousMoveUci: prevMove,
      isSoundMove: true,
    });
    expect(res.tags).toContain("Zwischenzug");
    expect(res.tags).toContain("Check");
  });

  it("detects leaving a piece hanging", () => {
    // White plays Ng5 where Black's Queen on d8 attacks g5 and g5 is undefended.
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2";
    const res = detectMotifs({ fenBefore: fen, uciMove: "f3g5", isSoundMove: false });
    expect(res.tags).toContain("Hanging Piece");
  });

  it("detects center control on opening moves", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const res = detectMotifs({ fenBefore: fen, uciMove: "e2e4" });
    expect(res.tags).toContain("Center Control");
  });
});
