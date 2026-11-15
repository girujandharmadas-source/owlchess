import { describe, expect, it } from "vitest";
import { classifyMove } from "./classify";

const cp = (value: number) => ({ type: "cp" as const, value });
const mate = (value: number) => ({ type: "mate" as const, value });

describe("classifyMove", () => {
  it("treats small eval changes as good", () => {
    expect(classifyMove(cp(30), cp(10), "w").quality).toBe("good");
  });

  it("flags a white blunder that hands black a winning position", () => {
    expect(classifyMove(cp(50), cp(-400), "w").quality).toBe("blunder");
  });

  it("is perspective-aware for black", () => {
    // Eval goes from -0.5 to +4.0 after Black's move: Black blundered.
    expect(classifyMove(cp(-50), cp(400), "b").quality).toBe("blunder");
    // Same swing is great for White, so a White move here is not penalized.
    expect(classifyMove(cp(-50), cp(400), "w").quality).toBe("good");
  });

  it("grades mistakes and inaccuracies by win-probability loss", () => {
    // From equal: -0.6 ≈ 5.5% win loss, -1.2 ≈ 11%, -2.5 ≈ 21%.
    expect(classifyMove(cp(0), cp(-60), "w").quality).toBe("inaccuracy");
    expect(classifyMove(cp(0), cp(-120), "w").quality).toBe("mistake");
    expect(classifyMove(cp(0), cp(-250), "w").quality).toBe("blunder");
  });

  it("handles missed / allowed mates", () => {
    expect(classifyMove(mate(2), cp(100), "w").quality).toBe("blunder");
    expect(classifyMove(cp(0), mate(-1), "w").quality).toBe("blunder");
  });

  it("reports best when the engine's top move was played", () => {
    expect(classifyMove(cp(20), cp(15), "w", true).quality).toBe("best");
  });
});
