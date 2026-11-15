import { type Score, whiteWinChance } from "./uci";

export type MoveQuality = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export const QUALITY_GLYPH: Record<MoveQuality, string> = {
  best: "",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/**
 * Classify a move from the evaluation before and after it (both White POV), using the
 * Lichess thresholds on win-probability loss for the player who moved:
 * >= 15% blunder, >= 10% mistake, >= 5% inaccuracy.
 */
export function classifyMove(
  before: Score,
  after: Score,
  mover: "w" | "b",
  playedBest = false,
): { quality: MoveQuality; winLoss: number } {
  const pov = (s: Score) => (mover === "w" ? whiteWinChance(s) : 1 - whiteWinChance(s));
  const winLoss = Math.max(0, pov(before) - pov(after));
  if (playedBest) return { quality: "best", winLoss };
  if (winLoss >= 0.15) return { quality: "blunder", winLoss };
  if (winLoss >= 0.1) return { quality: "mistake", winLoss };
  if (winLoss >= 0.05) return { quality: "inaccuracy", winLoss };
  return { quality: "good", winLoss };
}
