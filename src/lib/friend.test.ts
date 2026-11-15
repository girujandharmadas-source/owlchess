import { describe, expect, it } from "vitest";
import LZString from "lz-string";
import {
  buildFriendShareUrl,
  exportFriendPassport,
  formatFriendQrFilename,
  importFriendPassport,
} from "./friend";
import type { RatingHistoryEntry } from "./glicko2";

const FIVE_GAMES_HISTORY: RatingHistoryEntry[] = [
  {
    date: "2026-11-11T10:00:00.000Z",
    rating: 1520,
    diff: 20,
    opponentElo: 1200,
    result: "win",
    moves: ["e2e4", "e7e5"],
  },
  {
    date: "2026-11-12T10:00:00.000Z",
    rating: 1505,
    diff: -15,
    opponentElo: 1400,
    result: "loss",
    moves: ["d2d4", "d7d5"],
  },
  {
    date: "2026-11-13T10:00:00.000Z",
    rating: 1505,
    diff: 0,
    opponentElo: 1500,
    result: "draw",
    moves: ["c2c4", "c7c5"],
  },
  {
    date: "2026-11-14T10:00:00.000Z",
    rating: 1530,
    diff: 25,
    opponentElo: 1550,
    result: "win",
    moves: ["e2e4", "c7c5", "g1f3"],
  },
  {
    date: "2026-11-15T10:00:00.000Z",
    rating: 1548,
    diff: 18,
    opponentElo: 1600,
    result: "win",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5",
  },
];

describe("Friend Passport Serialization & Validation (src/lib/friend.ts)", () => {
  it("packs rating + at most the last 3 games into a #friend=... hash and round-trips cleanly", () => {
    const profile = {
      rating: 1548,
      rd: 64,
      vol: 0.0591,
      gamesPlayed: 5,
      history: FIVE_GAMES_HISTORY,
    };

    const hash = exportFriendPassport(profile, FIVE_GAMES_HISTORY);
    expect(hash.startsWith("#friend=")).toBe(true);

    const parsed = importFriendPassport(hash);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(1);
    expect(parsed?.type).toBe("friend_passport");
    expect(parsed?.playerRating).toEqual({
      rating: 1548,
      rd: 64,
      tier: "Advanced",
      gamesPlayed: 5,
      record: {
        wins: 3,
        losses: 1,
        draws: 1,
      },
    });

    // Strictly capped at the last 3 games
    expect(parsed?.recentGames).toHaveLength(3);
    expect(parsed?.recentGames.map((g) => g.opponentElo)).toEqual([1500, 1550, 1600]);
    expect(parsed?.recentGames[2].moves).toEqual(["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]);
    expect(parsed?.recentGames[2].pgn).toBe("1. e4 e5 2. Nf3 Nc6 3. Bb5");
  });

  it("enforces payload hygiene (no private volatility or active board state leaked)", () => {
    const profile = {
      rating: 1250,
      rd: 95,
      vol: 0.0612,
      gamesPlayed: 2,
      history: FIVE_GAMES_HISTORY.slice(0, 2),
    };
    const hash = exportFriendPassport(profile);
    const rawJson = LZString.decompressFromEncodedURIComponent(hash.replace("#friend=", ""));
    expect(rawJson).toBeTruthy();
    const rawObj = JSON.parse(rawJson!);

    expect(rawObj.playerRating.vol).toBeUndefined();
    expect(rawObj.currentGame).toBeUndefined();
    expect(rawObj.playerRating.tier).toBe("Intermediate");
  });

  it("parses full Friend Share URLs and rejects invalid or #save=... hashes", () => {
    const url = buildFriendShareUrl(
      { rating: 1820, rd: 52, gamesPlayed: 1, history: [FIVE_GAMES_HISTORY[4]] },
      undefined,
      "https://owlchess.vercel.app",
    );
    expect(url.startsWith("https://owlchess.vercel.app/#friend=")).toBe(true);

    const parsed = importFriendPassport(url);
    expect(parsed?.playerRating.rating).toBe(1820);
    expect(parsed?.recentGames).toHaveLength(1);

    expect(importFriendPassport("")).toBeNull();
    expect(importFriendPassport("#save=someSessionToken")).toBeNull();
    expect(importFriendPassport("#friend=corrupted-payload!!!")).toBeNull();
  });

  it("rejects tampered friend passports containing illegal chess moves", () => {
    const badPayload = {
      version: 1,
      type: "friend_passport",
      playerRating: {
        rating: 1500,
        rd: 100,
        tier: "Advanced",
        gamesPlayed: 1,
        record: { wins: 1, losses: 0, draws: 0 },
      },
      recentGames: [
        {
          date: "2026-11-15T10:00:00.000Z",
          opponentElo: 1500,
          result: "win",
          diff: 15,
          moves: ["e2e4", "e2e5"], // illegal move for black
        },
      ],
    };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(badPayload));
    expect(importFriendPassport(`#friend=${compressed}`)).toBeNull();
  });

  it("formats the Friend QR filename with YYYY-MM-DD", () => {
    const d = new Date(2026, 10, 15);
    expect(formatFriendQrFilename(d)).toBe("owlchess-friend-2026-11-15.png");
  });
});
