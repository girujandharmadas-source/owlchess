/**
 * Official Mark Glickman Glicko-2 Rating System Implementation
 * Reference: http://www.glicko.net/glicko/glicko2.pdf
 *
 * Parameters:
 * - Initial Default Player Rating: 1500
 * - Initial Rating Deviation (RD): 350
 * - Initial Volatility (sigma): 0.06
 * - System constant (tau): 0.5
 */

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOL = 0.06;
export const DEFAULT_TAU = 0.5;
export const GLICKO2_SCALE = 173.7178;
export const ENGINE_OPPONENT_RD = 50;
export const MIN_RD = 30;
export const MAX_RD = 350;
export const PLAYER_RATING_STORAGE_KEY = "owlchess_glicko2";
export const LEGACY_RATING_STORAGE_KEY = "owlchess_player_rating";

export type GameResultScore = 1 | 0.5 | 0;
export type GameOutcomeLabel = "win" | "loss" | "draw";

export interface RatingHistoryEntry {
  date: string;
  rating: number;
  diff: number;
  opponentElo: number;
  result: GameOutcomeLabel;
  moves?: string[];
  pgn?: string;
}

export interface GameHistoryMeta {
  moves?: string[];
  pgn?: string;
}

export interface PlayerRatingState {
  rating: number;
  rd: number;
  vol: number;
  gamesPlayed: number;
  history: RatingHistoryEntry[];
}

export interface RatingUpdateOutcome extends PlayerRatingState {
  delta: number;
}

export function createInitialPlayerRatingState(): PlayerRatingState {
  return {
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    vol: DEFAULT_VOL,
    gamesPlayed: 0,
    history: [],
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Solves Step 5 of the Glicko-2 algorithm using the Illinois iterative root-finding method
 * to compute the updated volatility sigma'.
 */
function computeNewVolatility(
  phi: number,
  sigma: number,
  v: number,
  delta: number,
  tau = DEFAULT_TAU,
): number {
  const a = Math.log(sigma * sigma);
  const deltaSq = delta * delta;
  const phiSq = phi * phi;
  const tauSq = tau * tau;
  const epsilon = 0.000001;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const denom = phiSq + v + ex;
    const term1 = (ex * (deltaSq - phiSq - v - ex)) / (2 * denom * denom);
    const term2 = (x - a) / tauSq;
    return term1 - term2;
  };

  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 100) {
      k += 1;
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);

  let iterations = 0;
  while (Math.abs(B - A) > epsilon && iterations < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    iterations += 1;
  }

  return Math.exp(A / 2);
}

/**
 * Updates a player's Glicko-2 rating state after a completed game against an engine opponent.
 *
 * @param playerState Current player rating state (rating, rd, vol, gamesPlayed, history)
 * @param opponentElo Engine opponent Elo rating (e.g. 600 to 3190)
 * @param result      1 for player win, 0.5 for draw, 0 for player loss
 * @param nowIso      Optional ISO timestamp for deterministic testing
 */
export function updateRating(
  playerState: PlayerRatingState,
  opponentElo: number,
  result: GameResultScore,
  nowIso: string = new Date().toISOString(),
  meta?: GameHistoryMeta,
): RatingUpdateOutcome {
  const prevRating = Number.isFinite(playerState.rating) ? playerState.rating : DEFAULT_RATING;
  const prevRd = Number.isFinite(playerState.rd)
    ? Math.max(MIN_RD, Math.min(MAX_RD, playerState.rd))
    : DEFAULT_RD;
  const prevVol =
    Number.isFinite(playerState.vol) && playerState.vol > 0 ? playerState.vol : DEFAULT_VOL;

  // Step 2: Convert ratings and RDs onto the Glicko-2 internal scale
  const mu = (prevRating - DEFAULT_RATING) / GLICKO2_SCALE;
  const phi = prevRd / GLICKO2_SCALE;
  const muJ = (opponentElo - DEFAULT_RATING) / GLICKO2_SCALE;
  const phiJ = ENGINE_OPPONENT_RD / GLICKO2_SCALE;

  // Step 3: Compute g(phi_j), E(mu, mu_j, phi_j), and estimated variance v
  const gPhiJ = g(phiJ);
  const E = expectedScore(mu, muJ, phiJ);
  const v = 1 / (gPhiJ * gPhiJ * E * (1 - E));

  // Step 4: Compute estimated improvement delta
  const scoreDiff = result - E;
  const delta = v * gPhiJ * scoreDiff;

  // Step 5: Compute new volatility sigma'
  const sigmaPrime = computeNewVolatility(phi, prevVol, v, delta, DEFAULT_TAU);

  // Step 6: Update pre-rating period deviation phi*
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);

  // Step 7: Update phi' and mu'
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * gPhiJ * scoreDiff;

  // Step 8: Convert back to original Glicko scale
  const newRating = Math.max(100, Math.round(GLICKO2_SCALE * muPrime + DEFAULT_RATING));
  const rawNewRd = GLICKO2_SCALE * phiPrime;
  const newRd = Math.max(MIN_RD, Math.min(MAX_RD, Math.round(rawNewRd)));
  const newVol = Number(sigmaPrime.toFixed(6));

  const diff = newRating - Math.round(prevRating);
  const resultLabel: GameOutcomeLabel = result === 1 ? "win" : result === 0 ? "loss" : "draw";

  const entry: RatingHistoryEntry = {
    date: nowIso,
    rating: newRating,
    diff,
    opponentElo: Math.round(opponentElo),
    result: resultLabel,
    ...(meta?.moves ? { moves: [...meta.moves] } : {}),
    ...(meta?.pgn ? { pgn: meta.pgn } : {}),
  };

  return {
    rating: newRating,
    rd: newRd,
    vol: newVol,
    delta: diff,
    gamesPlayed: (playerState.gamesPlayed ?? 0) + 1,
    history: [...(playerState.history ?? []), entry],
  };
}

/**
 * Alias for updateRating returning the updated PlayerRatingState.
 */
export function updatePlayerRating(
  playerState: PlayerRatingState,
  opponentElo: number,
  gameResult: GameResultScore,
  nowIso: string = new Date().toISOString(),
  meta?: GameHistoryMeta,
): PlayerRatingState {
  const { rating, rd, vol, gamesPlayed, history } = updateRating(
    playerState,
    opponentElo,
    gameResult,
    nowIso,
    meta,
  );
  return { rating, rd, vol, gamesPlayed, history };
}

/**
 * Formats a player's Glicko-2 rating and RD for display (e.g. "1540 ± 62").
 */
export function formatGlickoBadge(state: Pick<PlayerRatingState, "rating" | "rd">): string {
  return `${Math.round(state.rating)} ± ${Math.round(state.rd)}`;
}

/**
 * Loads the persisted PlayerRatingState from localStorage (`owlchess_glicko2`), falling back to defaults.
 */
export function loadPlayerRatingState(storage?: Pick<Storage, "getItem">): PlayerRatingState {
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return createInitialPlayerRatingState();

  try {
    const raw =
      store.getItem(PLAYER_RATING_STORAGE_KEY) ?? store.getItem(LEGACY_RATING_STORAGE_KEY);
    if (!raw) return createInitialPlayerRatingState();
    const parsed = JSON.parse(raw) as Partial<PlayerRatingState>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.rating !== "number" ||
      typeof parsed.rd !== "number"
    ) {
      return createInitialPlayerRatingState();
    }
    return {
      rating: Math.round(parsed.rating),
      rd: Math.max(MIN_RD, Math.min(MAX_RD, Math.round(parsed.rd))),
      vol: typeof parsed.vol === "number" && parsed.vol > 0 ? parsed.vol : DEFAULT_VOL,
      gamesPlayed: typeof parsed.gamesPlayed === "number" ? parsed.gamesPlayed : 0,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return createInitialPlayerRatingState();
  }
}

/**
 * Persists the PlayerRatingState to localStorage under `owlchess_glicko2` (and `owlchess_player_rating`).
 */
export function savePlayerRatingState(
  state: PlayerRatingState,
  storage?: Pick<Storage, "setItem">,
): void {
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return;
  try {
    const serialized = JSON.stringify(state);
    store.setItem(PLAYER_RATING_STORAGE_KEY, serialized);
    store.setItem(LEGACY_RATING_STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

/**
 * Resets the player's Glicko-2 rating in localStorage back to initial defaults (1500 ± 350).
 */
export function resetPlayerRatingState(
  storage?: Pick<Storage, "setItem" | "removeItem">,
): PlayerRatingState {
  const initial = createInitialPlayerRatingState();
  savePlayerRatingState(initial, storage);
  return initial;
}
