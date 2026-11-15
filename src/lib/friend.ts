import { Chess } from "chess.js";
import LZString from "lz-string";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  type GameOutcomeLabel,
  MAX_RD,
  MIN_RD,
  type PlayerRatingState,
  type RatingHistoryEntry,
} from "./glicko2";
import { MIN_SLIDER_ELO, getEloTier } from "./lowElo";
import { splitUciMove } from "./uci";

export const FRIEND_HASH_PREFIX = "#friend=";
export const MAX_FRIEND_RECENT_GAMES = 3;

export interface FriendRecentGame {
  date: string;
  opponentElo: number;
  result: GameOutcomeLabel;
  diff: number;
  moves: string[];
  pgn?: string;
}

export interface FriendPassportPayload {
  version: 1;
  type: "friend_passport";
  playerRating: {
    rating: number;
    rd: number;
    tier: string;
    gamesPlayed: number;
    record: {
      wins: number;
      losses: number;
      draws: number;
    };
  };
  recentGames: FriendRecentGame[];
}

export interface FriendProfileInput {
  rating: number;
  rd: number;
  gamesPlayed?: number;
  tier?: string;
  history?: RatingHistoryEntry[];
}

function isValidResult(val: unknown): val is GameOutcomeLabel {
  return val === "win" || val === "loss" || val === "draw";
}

function sanitizeLegalMoves(moves: unknown): string[] | null {
  if (!Array.isArray(moves)) return [];
  const g = new Chess();
  const clean: string[] = [];
  for (const m of moves) {
    if (typeof m !== "string" || m.length < 4 || m.length > 5) return null;
    try {
      g.move(splitUciMove(m));
      clean.push(m);
    } catch {
      return null;
    }
  }
  return clean;
}

/**
 * Builds a validated FriendPassportPayload from a player's rating state and game history,
 * capping recentGames to at most the last 3 games and stripping any non-public fields.
 */
export function createFriendPassportPayload(
  profile: FriendProfileInput | PlayerRatingState,
  historyArg?: RatingHistoryEntry[],
): FriendPassportPayload {
  const fullHistory = Array.isArray(historyArg)
    ? historyArg
    : Array.isArray(profile.history)
      ? profile.history
      : [];

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const entry of fullHistory) {
    if (entry.result === "win") wins += 1;
    else if (entry.result === "loss") losses += 1;
    else if (entry.result === "draw") draws += 1;
  }

  const rating = Number.isFinite(profile.rating) ? Math.round(profile.rating) : DEFAULT_RATING;
  const rd = Number.isFinite(profile.rd)
    ? Math.max(MIN_RD, Math.min(MAX_RD, Math.round(profile.rd)))
    : DEFAULT_RD;
  const tier =
    "tier" in profile && typeof profile.tier === "string" && profile.tier.trim()
      ? profile.tier
      : getEloTier(rating, false);
  const gamesPlayed =
    typeof profile.gamesPlayed === "number" && Number.isFinite(profile.gamesPlayed)
      ? Math.max(fullHistory.length, Math.round(profile.gamesPlayed))
      : fullHistory.length;

  const recentSlice = fullHistory.slice(-MAX_FRIEND_RECENT_GAMES);
  const recentGames: FriendRecentGame[] = recentSlice.map((g) => {
    const validMoves = sanitizeLegalMoves(g.moves) ?? [];
    return {
      date: typeof g.date === "string" ? g.date : new Date().toISOString(),
      opponentElo: Number.isFinite(g.opponentElo) ? Math.round(g.opponentElo) : 1500,
      result: isValidResult(g.result) ? g.result : "draw",
      diff: Number.isFinite(g.diff) ? Math.round(g.diff) : 0,
      moves: validMoves,
      ...(typeof g.pgn === "string" && g.pgn.trim() ? { pgn: g.pgn } : {}),
    };
  });

  return {
    version: 1,
    type: "friend_passport",
    playerRating: {
      rating,
      rd,
      tier,
      gamesPlayed,
      record: { wins, losses, draws },
    },
    recentGames,
  };
}

/**
 * Packs a player's public rating summary and up to their last 3 games into a compressed `#friend=...` hash.
 */
export function exportFriendPassport(
  profile: FriendProfileInput | PlayerRatingState,
  history?: RatingHistoryEntry[],
): string {
  const payload = createFriendPassportPayload(profile, history);
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  return `${FRIEND_HASH_PREFIX}${compressed}`;
}

/**
 * Builds a complete shareable Friend Passport URL (`https://owlchess.vercel.app/#friend=...`).
 */
export function buildFriendShareUrl(
  profile: FriendProfileInput | PlayerRatingState,
  history?: RatingHistoryEntry[],
  baseOrigin?: string,
): string {
  const hash = exportFriendPassport(profile, history);
  const origin =
    baseOrigin ??
    (typeof window !== "undefined" ? window.location.origin : "https://owlchess.vercel.app");
  return `${origin.replace(/\/$/, "")}/${hash}`;
}

function extractFriendToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hashIdx = trimmed.indexOf("#");
  const fragment = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : trimmed;

  if (fragment.startsWith("friend=")) {
    const token = fragment.slice("friend=".length).trim();
    return token.length > 0 ? token : null;
  }

  const queryMatch = /[?&]friend=([^&#\s]+)/.exec(trimmed);
  if (queryMatch?.[1]) {
    return queryMatch[1];
  }

  // Explicitly reject #save=... tokens so session links aren't confused with friend passports
  if (fragment.startsWith("save=")) {
    return null;
  }

  if (!/[\s/#?]/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Safely parses and validates a `#friend=...` hash or full URL into a FriendPassportPayload.
 * Returns null if the input is malformed, wrong type, or contains illegal chess moves.
 */
export function importFriendPassport(hashOrUrl: string): FriendPassportPayload | null {
  const token = extractFriendToken(hashOrUrl);
  if (!token) return null;

  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(token);
    if (!decompressed) return null;

    const parsed = JSON.parse(decompressed) as Partial<FriendPassportPayload>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      parsed.type !== "friend_passport"
    ) {
      return null;
    }

    const pr = parsed.playerRating;
    if (
      !pr ||
      typeof pr !== "object" ||
      typeof pr.rating !== "number" ||
      !Number.isFinite(pr.rating) ||
      typeof pr.rd !== "number" ||
      !Number.isFinite(pr.rd) ||
      typeof pr.tier !== "string" ||
      !pr.tier.trim() ||
      typeof pr.gamesPlayed !== "number" ||
      !Number.isFinite(pr.gamesPlayed) ||
      pr.gamesPlayed < 0 ||
      !pr.record ||
      typeof pr.record !== "object" ||
      typeof pr.record.wins !== "number" ||
      typeof pr.record.losses !== "number" ||
      typeof pr.record.draws !== "number" ||
      !Array.isArray(parsed.recentGames)
    ) {
      return null;
    }

    const validatedGames: FriendRecentGame[] = [];
    for (const item of parsed.recentGames.slice(-MAX_FRIEND_RECENT_GAMES)) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.date !== "string" ||
        typeof item.opponentElo !== "number" ||
        !Number.isFinite(item.opponentElo) ||
        !isValidResult(item.result) ||
        typeof item.diff !== "number" ||
        !Number.isFinite(item.diff) ||
        !Array.isArray(item.moves)
      ) {
        return null;
      }

      const legalMoves = sanitizeLegalMoves(item.moves);
      if (legalMoves === null) {
        return null;
      }

      validatedGames.push({
        date: item.date,
        opponentElo: Math.max(MIN_SLIDER_ELO, Math.min(3500, Math.round(item.opponentElo))),
        result: item.result,
        diff: Math.round(item.diff),
        moves: legalMoves,
        ...(typeof item.pgn === "string" && item.pgn.trim() ? { pgn: item.pgn } : {}),
      });
    }

    return {
      version: 1,
      type: "friend_passport",
      playerRating: {
        rating: Math.max(100, Math.min(3500, Math.round(pr.rating))),
        rd: Math.max(MIN_RD, Math.min(MAX_RD, Math.round(pr.rd))),
        tier: pr.tier.trim(),
        gamesPlayed: Math.round(pr.gamesPlayed),
        record: {
          wins: Math.max(0, Math.round(pr.record.wins)),
          losses: Math.max(0, Math.round(pr.record.losses)),
          draws: Math.max(0, Math.round(pr.record.draws)),
        },
      },
      recentGames: validatedGames,
    };
  } catch {
    return null;
  }
}

/**
 * Formats the Friend Passport QR code PNG filename with today's date (`owlchess-friend-YYYY-MM-DD.png`).
 */
export function formatFriendQrFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `owlchess-friend-${year}-${month}-${day}.png`;
}
