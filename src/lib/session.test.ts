import { describe, expect, it } from "vitest";
import {
  type SessionPayload,
  buildSessionShareUrl,
  exportSessionToHash,
  formatQrDownloadFilename,
  importSessionFromHash,
  profileToRatingState,
} from "./session";

const SAMPLE_PAYLOAD: SessionPayload = {
  version: 1,
  currentGame: {
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    moves: ["e2e4", "e7e5", "g1f3"],
    opponentElo: 1450,
    orientation: "white",
  },
  playerProfile: {
    rating: 1584,
    rd: 142,
    vol: 0.059842,
    gamesPlayed: 4,
    history: [
      {
        date: "2026-11-15T14:00:00.000Z",
        rating: 1584,
        diff: 34,
        opponentElo: 1450,
        result: "win",
      },
    ],
  },
};

describe("Magic Link & QR Session Serialization (src/lib/session.ts)", () => {
  it("round-trips a SessionPayload through exportSessionToHash and importSessionFromHash", () => {
    const hash = exportSessionToHash(SAMPLE_PAYLOAD);
    expect(hash.startsWith("#save=")).toBe(true);

    const restored = importSessionFromHash(hash);
    expect(restored).toEqual(SAMPLE_PAYLOAD);
  });

  it("imports a session from a full Magic Link URL or raw compressed token", () => {
    const url = buildSessionShareUrl(SAMPLE_PAYLOAD, "https://owlchess.vercel.app");
    expect(url.startsWith("https://owlchess.vercel.app/#save=")).toBe(true);

    const fromFullUrl = importSessionFromHash(url);
    expect(fromFullUrl).toEqual(SAMPLE_PAYLOAD);

    const rawToken = exportSessionToHash(SAMPLE_PAYLOAD).replace("#save=", "");
    const fromRawToken = importSessionFromHash(rawToken);
    expect(fromRawToken).toEqual(SAMPLE_PAYLOAD);
  });

  it("rejects corrupted hashes, unsupported versions, and illegal chess move lists", () => {
    expect(importSessionFromHash("")).toBeNull();
    expect(importSessionFromHash("#save=not-valid-lz-string!!!")).toBeNull();

    const illegalMovesPayload: SessionPayload = {
      ...SAMPLE_PAYLOAD,
      currentGame: {
        ...SAMPLE_PAYLOAD.currentGame,
        moves: ["e2e4", "e2e5"], // illegal second move for black
      },
    };
    const badHash = exportSessionToHash(illegalMovesPayload);
    expect(importSessionFromHash(badHash)).toBeNull();
  });

  it("converts SessionPlayerProfile to PlayerRatingState cleanly", () => {
    const state = profileToRatingState(SAMPLE_PAYLOAD.playerProfile);
    expect(state.rating).toBe(1584);
    expect(state.rd).toBe(142);
    expect(state.gamesPlayed).toBe(4);
    expect(state.history).toHaveLength(1);
  });

  it("formats the QR download filename with YYYY-MM-DD", () => {
    const d = new Date(2026, 10, 15); // Nov 15, 2026
    expect(formatQrDownloadFilename(d)).toBe("owlchess-save-2026-11-15.png");
  });
});
