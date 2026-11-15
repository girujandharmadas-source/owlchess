import { Chess } from "chess.js";
import LZString from "lz-string";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
  type GameOutcomeLabel,
  MAX_RD,
  MIN_RD,
  type PlayerRatingState,
  type RatingHistoryEntry,
} from "./glicko2";
import { MIN_SLIDER_ELO } from "./lowElo";
import { splitUciMove } from "./uci";

export const SESSION_HASH_PREFIX = "#save=";

export interface SessionGameSnapshot {
  fen: string;
  moves: string[];
  opponentElo: number;
  orientation: "white" | "black";
}

export interface SessionPlayerProfile {
  rating: number;
  rd: number;
  vol: number;
  gamesPlayed: number;
  history: Array<{
    date: string;
    rating?: number;
    diff: number;
    opponentElo: number;
    result: GameOutcomeLabel;
    moves?: string[];
    pgn?: string;
  }>;
}

export interface SessionPayload {
  version: 1;
  currentGame: SessionGameSnapshot;
  playerProfile: SessionPlayerProfile;
}

/**
 * Compresses a SessionPayload into a URL-safe hash string (`#save=<compressed>`).
 */
export function exportSessionToHash(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return `${SESSION_HASH_PREFIX}${compressed}`;
}

/**
 * Builds a complete shareable Magic Link URL containing the `#save=...` hash.
 */
export function buildSessionShareUrl(payload: SessionPayload, baseOrigin?: string): string {
  const hash = exportSessionToHash(payload);
  const origin =
    baseOrigin ?? (typeof window !== "undefined" ? window.location.origin : "https://owlchess.vercel.app");
  return `${origin.replace(/\/$/, "")}/${hash}`;
}

/**
 * Extracts the raw compressed token from a full URL, `#save=...` hash, `save=...`, or raw string.
 */
function extractCompressedToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Handle full URLs containing #save=...
  const hashIdx = trimmed.indexOf("#");
  const fragment = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : trimmed;

  if (fragment.startsWith("save=")) {
    const token = fragment.slice("save=".length).trim();
    return token.length > 0 ? token : null;
  }

  // Also check if someone passed ?save=...
  const saveParamMatch = /[?&]save=([^&#\s]+)/.exec(trimmed);
  if (saveParamMatch?.[1]) {
    return saveParamMatch[1];
  }

  // Treat a raw single-token string without spaces/slashes as a raw lz-string token
  if (!/[\s/#?]/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function isValidResult(val: unknown): val is GameOutcomeLabel {
  return val === "win" || val === "loss" || val === "draw";
}

/**
 * Decompresses and strictly validates a session hash or Magic Link URL.
 * Returns null if the input is malformed, corrupted, or fails chess/rating validation.
 */
export function importSessionFromHash(hashOrUrl: string): SessionPayload | null {
  const token = extractCompressedToken(hashOrUrl);
  if (!token) return null;

  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(token);
    if (!decompressed) return null;

    const parsed = JSON.parse(decompressed) as Partial<SessionPayload>;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return null;
    }

    const cg = parsed.currentGame;
    const pp = parsed.playerProfile;
    if (!cg || typeof cg !== "object" || !pp || typeof pp !== "object") {
      return null;
    }

    if (
      typeof cg.fen !== "string" ||
      !Array.isArray(cg.moves) ||
      !cg.moves.every((m) => typeof m === "string" && m.length >= 4 && m.length <= 5) ||
      typeof cg.opponentElo !== "number" ||
      !Number.isFinite(cg.opponentElo) ||
      (cg.orientation !== "white" && cg.orientation !== "black")
    ) {
      return null;
    }

    // Verify that the moves or FEN form a legal chess state
    const replayed = new Chess();
    for (const uci of cg.moves) {
      try {
        replayed.move(splitUciMove(uci));
      } catch {
        return null;
      }
    }

    if (
      typeof pp.rating !== "number" ||
      !Number.isFinite(pp.rating) ||
      typeof pp.rd !== "number" ||
      !Number.isFinite(pp.rd) ||
      typeof pp.vol !== "number" ||
      !Number.isFinite(pp.vol) ||
      pp.vol <= 0 ||
      typeof pp.gamesPlayed !== "number" ||
      !Number.isFinite(pp.gamesPlayed) ||
      pp.gamesPlayed < 0 ||
      !Array.isArray(pp.history)
    ) {
      return null;
    }

    const validatedHistory: RatingHistoryEntry[] = [];
    const runningRating = Math.round(pp.rating);
    for (const item of pp.history) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.date !== "string" ||
        typeof item.diff !== "number" ||
        !Number.isFinite(item.diff) ||
        typeof item.opponentElo !== "number" ||
        !Number.isFinite(item.opponentElo) ||
        !isValidResult(item.result)
      ) {
        return null;
      }
      validatedHistory.push({
        date: item.date,
        rating:
          typeof item.rating === "number" && Number.isFinite(item.rating)
            ? Math.round(item.rating)
            : runningRating,
        diff: Math.round(item.diff),
        opponentElo: Math.round(item.opponentElo),
        result: item.result,
        ...(Array.isArray(item.moves) && item.moves.every((m) => typeof m === "string")
          ? { moves: [...item.moves] }
          : {}),
        ...(typeof item.pgn === "string" ? { pgn: item.pgn } : {}),
      });
    }

    return {
      version: 1,
      currentGame: {
        fen: replayed.fen(),
        moves: [...cg.moves],
        opponentElo: Math.max(MIN_SLIDER_ELO, Math.min(3500, Math.round(cg.opponentElo))),
        orientation: cg.orientation,
      },
      playerProfile: {
        rating: Math.max(100, Math.min(3500, Math.round(pp.rating))),
        rd: Math.max(MIN_RD, Math.min(MAX_RD, Math.round(pp.rd))),
        vol: Number(pp.vol.toFixed(6)),
        gamesPlayed: Math.round(pp.gamesPlayed),
        history: validatedHistory,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Converts a SessionPlayerProfile into a full PlayerRatingState for localStorage persistence.
 */
export function profileToRatingState(profile: SessionPlayerProfile): PlayerRatingState {
  return {
    rating: profile.rating ?? DEFAULT_RATING,
    rd: profile.rd ?? DEFAULT_RD,
    vol: profile.vol ?? DEFAULT_VOL,
    gamesPlayed: profile.gamesPlayed ?? 0,
    history: profile.history.map((h) => ({
      date: h.date,
      rating: typeof h.rating === "number" ? h.rating : profile.rating,
      diff: h.diff,
      opponentElo: h.opponentElo,
      result: h.result,
      ...(h.moves ? { moves: [...h.moves] } : {}),
      ...(h.pgn ? { pgn: h.pgn } : {}),
    })),
  };
}

/**
 * Formats the QR code PNG filename with today's date (`owlchess-save-YYYY-MM-DD.png`).
 */
export function formatQrDownloadFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `owlchess-save-${year}-${month}-${day}.png`;
}
