// Pure helpers for talking UCI to Stockfish. No DOM / Worker dependencies so they are unit-testable.

export type Score = { type: "cp"; value: number } | { type: "mate"; value: number };

export interface InfoLine {
  depth: number;
  multipv: number;
  /** Score from the side-to-move's perspective (raw UCI). */
  score: Score;
  /** Principal variation in UCI long algebraic notation, e.g. ["e2e4", "e7e5"]. */
  pv: string[];
}

export interface SpinOption {
  name: string;
  default: number;
  min: number;
  max: number;
}

/** Parse an `info ... score ... pv ...` line. Returns null for info lines without a score+pv. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith("info ")) return null;
  const t = line.split(/\s+/);
  let depth = -1;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case "depth":
        depth = Number(t[++i]);
        break;
      case "multipv":
        multipv = Number(t[++i]);
        break;
      case "score": {
        const kind = t[++i];
        const value = Number(t[++i]);
        if (kind === "cp" || kind === "mate") score = { type: kind, value };
        // skip optional "lowerbound" / "upperbound"
        if (t[i + 1] === "lowerbound" || t[i + 1] === "upperbound") i++;
        break;
      }
      case "pv":
        pv = t.slice(i + 1).filter(Boolean);
        i = t.length;
        break;
    }
  }
  if (depth < 0 || !score || pv.length === 0) return null;
  return { depth, multipv, score, pv };
}

/** Parse `bestmove e2e4 ponder e7e5`. Returns the move or null ("(none)" when no legal moves). */
export function parseBestMove(line: string): string | null | undefined {
  const m = /^bestmove\s+(\S+)/.exec(line);
  if (!m) return undefined; // not a bestmove line
  return m[1] === "(none)" ? null : m[1];
}

/** Parse `option name UCI_Elo type spin default 1320 min 1320 max 3190`. */
export function parseSpinOption(line: string): SpinOption | null {
  const m = /^option name (.+?) type spin default (-?\d+) min (-?\d+) max (-?\d+)/.exec(line);
  if (!m) return null;
  return { name: m[1], default: Number(m[2]), min: Number(m[3]), max: Number(m[4]) };
}

/** Convert a side-to-move score to White's perspective. */
export function toWhitePov(score: Score, sideToMove: "w" | "b"): Score {
  return sideToMove === "w" ? score : { type: score.type, value: -score.value };
}

/**
 * Lichess-style win probability for White in [0, 1].
 * https://github.com/lichess-org/lila (ui/ceval winningChances)
 */
export function whiteWinChance(whiteScore: Score): number {
  if (whiteScore.type === "mate") {
    if (whiteScore.value === 0) return 0.5;
    return whiteScore.value > 0 ? 1 : 0;
  }
  const cp = Math.max(-1000, Math.min(1000, whiteScore.value));
  const chances = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1; // [-1, 1]
  return (chances + 1) / 2;
}

/** Human-readable score, White POV: "+0.34", "-1.20", "#3", "#-2". */
export function formatScore(whiteScore: Score): string {
  if (whiteScore.type === "mate") return `#${whiteScore.value}`;
  const pawns = whiteScore.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** Split a UCI move "e7e8q" into chessground/chess.js parts. */
export function splitUciMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

/** Clamp a requested Elo into the engine's supported UCI_Elo range. Null = unlimited strength. */
export function clampElo(requested: number | null, range: { min: number; max: number }): number | null {
  if (requested === null) return null;
  return Math.max(range.min, Math.min(range.max, Math.round(requested)));
}
