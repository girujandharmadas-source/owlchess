import { describe, expect, it } from "vitest";
import {
  type CoachPayload,
  buildCoachPrompt,
  buildGroundedCoachExplanation,
  formatMasterGameSummary,
} from "./coach";

const SAMPLE_PAYLOAD: CoachPayload = {
  moveNumber: 14,
  mover: "b",
  san: "Nd3+",
  uci: "c5d3",
  classification: "best",
  evalBefore: "+0.20",
  evalAfter: "-3.40",
  bestMoveSan: "Nd3+",
  engineContinuation: ["Bxd3", "exd3", "Qxd3", "Bxb2"],
  detectedMotifs: ["Zwischenzug", "Fork", "Check"],
  motifDescriptions: [
    "In-between forcing move (c5→d3) played before recapturing",
    "knight on d3 forks king on e1 and rook on b2",
  ],
  openingName: "Sicilian Defense: Najdorf Variation",
  openingEco: "B90",
  masterGame: {
    id: "kasparov-karpov-1985",
    white: "Anatoly Karpov",
    whiteRating: 2720,
    black: "Garry Kasparov",
    blackRating: 2700,
    year: 1985,
    winner: "black",
    event: "World Championship Moscow",
  },
};

describe("coach prompt and deterministic explanation", () => {
  it("formats master game references cleanly", () => {
    expect(formatMasterGameSummary(SAMPLE_PAYLOAD.masterGame)).toContain(
      "Anatoly Karpov (2720) vs. Garry Kasparov (2700), 1985, World Championship Moscow (0-1)",
    );
  });

  it("embeds all verified engine and motif facts in the LLM prompt", () => {
    const prompt = buildCoachPrompt(SAMPLE_PAYLOAD);
    expect(prompt).toContain("14... Nd3+");
    expect(prompt).toContain("Zwischenzug");
    expect(prompt).toContain("Bxd3 exd3 Qxd3 Bxb2");
    expect(prompt).toContain("Anatoly Karpov");
  });

  it("produces a 3-part grounded coaching card with zero hallucinations", () => {
    const text = buildGroundedCoachExplanation(SAMPLE_PAYLOAD);
    expect(text).toContain("**1. Move & Tactic:**");
    expect(text).toContain("**2. Why It Matters:**");
    expect(text).toContain("**3. Master Game Context:**");
    expect(text).toContain("14... Nd3+");
    expect(text).toContain("Zwischenzug, Fork, Check");
    expect(text).toContain("Sicilian Defense: Najdorf Variation");
  });
});
