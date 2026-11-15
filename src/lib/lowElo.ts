import type { InfoLine, Score } from "./uci";

export const MIN_SLIDER_ELO = 600;
export const NATIVE_ELO_FLOOR = 1320;
export const MAX_SLIDER_ELO = 3190;

export type EloTier =
  | "Beginner"
  | "Novice"
  | "Intermediate"
  | "Advanced"
  | "Master / Grandmaster";

export interface LowEloSearchConfig {
  multipv: number;
  depth: number;
  movetime: number;
}

export interface CandidateMoveProbability {
  move: string;
  weight: number;
  cpLoss: number;
  rank: number;
}

/**
 * Returns the human-readable skill tier badge for the opponent header and Elo slider.
 * - 600–799: "Beginner"
 * - 800–1099: "Novice"
 * - 1100–1319: "Intermediate"
 * - 1320–1999: "Advanced"
 * - 2000+ (or fullStrength): "Master / Grandmaster"
 */
export function getEloTier(elo: number, fullStrength = false): EloTier {
  if (fullStrength || elo >= 2000) return "Master / Grandmaster";
  if (elo >= NATIVE_ELO_FLOOR) return "Advanced";
  if (elo >= 1100) return "Intermediate";
  if (elo >= 800) return "Novice";
  return "Beginner";
}

/**
 * Returns the constrained MultiPV + depth/movetime search configuration for ratings
 * below Stockfish's 1320 native `UCI_Elo` floor, or `null` when native `UCI_Elo` applies.
 */
export function getLowEloSearchConfig(elo: number): LowEloSearchConfig | null {
  if (elo >= NATIVE_ELO_FLOOR) return null;
  if (elo < 800) {
    // 600–799 Elo (Beginner): Depth 1–2, fast search
    return {
      multipv: 4,
      depth: elo < 700 ? 1 : 2,
      movetime: 120,
    };
  }
  if (elo < 1100) {
    // 800–1099 Elo (Novice): Depth 2–3
    return {
      multipv: 4,
      depth: elo < 950 ? 2 : 3,
      movetime: 180,
    };
  }
  // 1100–1319 Elo (Intermediate): Depth 3–5
  return {
    multipv: 4,
    depth: elo < 1180 ? 3 : elo < 1250 ? 4 : 5,
    movetime: 240,
  };
}

/** Convert a mover-perspective UCI score into centipawns for candidate comparison. */
export function scoreToMoverCp(score: Score): number {
  if (score.type === "cp") return score.value;
  // Mate in N: positive means mover delivers mate, negative means mover gets mated.
  if (score.value > 0) return 10000 - score.value * 100;
  if (score.value < 0) return -10000 - score.value * 100;
  return 0;
}

/**
 * Computes the normalized selection probabilities across Stockfish's MultiPV candidate lines
 * for opponents rated 600–1319 Elo, including safety filtering against game-breaking blunders.
 */
export function computeCandidateProbabilities(
  lines: Pick<InfoLine, "score" | "pv">[],
  elo: number,
): CandidateMoveProbability[] {
  const valid = lines.filter((l) => l && l.pv && l.pv.length > 0);
  if (valid.length === 0) return [];

  const best = valid[0];
  const bestCp = scoreToMoverCp(best.score);

  // If there is an obvious mate-in-1 on the board and Elo >= 800, always play it.
  if (best.score.type === "mate" && best.score.value === 1 && elo >= 800) {
    return [{ move: best.pv[0], weight: 1, cpLoss: 0, rank: 1 }];
  }

  // Tier-specific priors, temperature (in cp), and maximum allowed centipawn drop.
  let priors: number[];
  let temperature: number;
  let maxCpLoss: number;

  if (elo < 800) {
    // 600–799 (Beginner): flat priors across top 4 moves so 2nd/3rd/4th are frequently chosen.
    priors = [0.32, 0.30, 0.22, 0.16];
    temperature = 240;
    // Safety rule: prevent >600cp Queen blunders unless on the absolute lowest setting (600 Elo).
    maxCpLoss = elo <= 600 ? 950 : 600;
  } else if (elo < 1100) {
    // 800–1099 (Novice): strong preference for candidate 1 & 2, occasional candidate 3.
    priors = [0.54, 0.31, 0.12, 0.03];
    temperature = 120;
    maxCpLoss = 350;
  } else {
    // 1100–1319 (Intermediate): plays candidate 1 or 2 within small centipawn loss margins.
    priors = [0.74, 0.23, 0.03, 0.0];
    temperature = 65;
    maxCpLoss = 140;
  }

  const rawCandidates: { move: string; rawWeight: number; cpLoss: number; rank: number }[] = [];

  for (let i = 0; i < Math.min(valid.length, 4); i++) {
    const cand = valid[i];
    const candCp = scoreToMoverCp(cand.score);
    const cpLoss = Math.max(0, bestCp - candCp);

    if (i > 0) {
      // Safety check 1: Never pick a move that walks into forced checkmate if a non-mated move exists,
      // unless at the absolute 600 Elo floor (and even at 600 Elo, never walk into mate-in-1).
      const walksIntoMate = cand.score.type === "mate" && cand.score.value < 0;
      const walksIntoMateIn1 = cand.score.type === "mate" && cand.score.value === -1;
      if (walksIntoMateIn1) continue;
      if (walksIntoMate && elo > 600) continue;

      // Safety check 2: Filter out severe centipawn drops (>600 cp Queen blunders, or tier cap).
      if (cpLoss > maxCpLoss) continue;
    }

    const prior = priors[i] ?? 0.02;
    if (prior <= 0) continue;
    const rawWeight = prior * Math.exp(-cpLoss / temperature);
    rawCandidates.push({
      move: cand.pv[0],
      rawWeight,
      cpLoss,
      rank: i + 1,
    });
  }

  if (rawCandidates.length === 0) {
    return [{ move: best.pv[0], weight: 1, cpLoss: 0, rank: 1 }];
  }

  const totalWeight = rawCandidates.reduce((acc, c) => acc + c.rawWeight, 0);
  return rawCandidates.map((c) => ({
    move: c.move,
    weight: totalWeight > 0 ? c.rawWeight / totalWeight : 1 / rawCandidates.length,
    cpLoss: c.cpLoss,
    rank: c.rank,
  }));
}

/**
 * Selects a move from Stockfish's MultiPV candidate lines using the Elo-weighted
 * temperature probability curve.
 */
export function selectLowEloMove(
  lines: Pick<InfoLine, "score" | "pv">[],
  elo: number,
  rng: () => number = Math.random,
): string | null {
  const dist = computeCandidateProbabilities(lines, elo);
  if (dist.length === 0) return null;
  const r = Math.max(0, Math.min(0.999999, rng()));
  let cumulative = 0;
  for (const item of dist) {
    cumulative += item.weight;
    if (r <= cumulative) return item.move;
  }
  return dist[dist.length - 1].move;
}
