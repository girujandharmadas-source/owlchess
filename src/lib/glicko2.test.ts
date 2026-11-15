import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
  MIN_RD,
  PLAYER_RATING_STORAGE_KEY,
  createInitialPlayerRatingState,
  formatGlickoBadge,
  loadPlayerRatingState,
  resetPlayerRatingState,
  savePlayerRatingState,
  updatePlayerRating,
} from "./glicko2";

describe("Glicko-2 Player Rating Engine (src/lib/glicko2.ts)", () => {
  it("initializes with official Glicko-2 defaults (1500 rating, 350 RD, 0.06 vol)", () => {
    const initial = createInitialPlayerRatingState();
    expect(initial).toEqual({
      rating: 1500,
      rd: 350,
      vol: 0.06,
      gamesPlayed: 0,
      history: [],
    });
    expect(formatGlickoBadge(initial)).toBe("1500 ± 350");
  });

  it("increases rating and reduces RD on a win against an equal 1500 Elo opponent", () => {
    const initial = createInitialPlayerRatingState();
    const afterWin = updatePlayerRating(initial, 1500, 1, "2026-11-15T12:00:00.000Z");

    // With initial RD=350 vs opponent 1500 (RD=50), a win boosts rating to ~1747 and narrows RD to ~254
    expect(afterWin.rating).toBeGreaterThan(1650);
    expect(afterWin.rating).toBeLessThan(1850);
    expect(afterWin.rd).toBeLessThan(DEFAULT_RD);
    expect(afterWin.rd).toBeGreaterThan(200);
    expect(afterWin.vol).toBeGreaterThan(0.05);
    expect(afterWin.vol).toBeLessThan(0.08);
    expect(afterWin.gamesPlayed).toBe(1);
    expect(afterWin.history).toHaveLength(1);
    expect(afterWin.history[0]).toEqual({
      date: "2026-11-15T12:00:00.000Z",
      rating: afterWin.rating,
      diff: afterWin.rating - DEFAULT_RATING,
      opponentElo: 1500,
      result: "win",
    });
    expect(afterWin.history[0].diff).toBeGreaterThan(0);
  });

  it("decreases rating symmetrically and reduces RD on a loss against an equal 1500 Elo opponent", () => {
    const initial = createInitialPlayerRatingState();
    const afterWin = updatePlayerRating(initial, 1500, 1);
    const afterLoss = updatePlayerRating(initial, 1500, 0);

    expect(afterLoss.rating).toBeLessThan(1350);
    expect(afterLoss.history[0].diff).toBeLessThan(0);
    expect(afterLoss.history[0].result).toBe("loss");
    // Symmetric magnitude around 1500
    expect(afterWin.rating - 1500).toBe(1500 - afterLoss.rating);
    expect(afterWin.rd).toBe(afterLoss.rd);
  });

  it("keeps rating unchanged on a draw against an equal 1500 Elo opponent while reducing RD", () => {
    const initial = createInitialPlayerRatingState();
    const afterDraw = updatePlayerRating(initial, 1500, 0.5);

    expect(afterDraw.rating).toBe(1500);
    expect(afterDraw.rd).toBeLessThan(DEFAULT_RD);
    expect(afterDraw.history[0].diff).toBe(0);
    expect(afterDraw.history[0].result).toBe("draw");
  });

  it("scales rating deltas appropriately based on opponent Elo strength", () => {
    const settledPlayer = {
      rating: 1500,
      rd: 80,
      vol: DEFAULT_VOL,
      gamesPlayed: 15,
      history: [],
    };

    const winVsStrong = updatePlayerRating(settledPlayer, 1900, 1);
    const winVsWeak = updatePlayerRating(settledPlayer, 1100, 1);
    expect(winVsStrong.history[0].diff).toBeGreaterThan(winVsWeak.history[0].diff);

    const drawVsStrong = updatePlayerRating(settledPlayer, 1900, 0.5);
    const drawVsWeak = updatePlayerRating(settledPlayer, 1100, 0.5);
    expect(drawVsStrong.history[0].diff).toBeGreaterThan(0);
    expect(drawVsWeak.history[0].diff).toBeLessThan(0);
  });

  it("progressively narrows RD over consecutive games and clamps at MIN_RD (30)", () => {
    let state = createInitialPlayerRatingState();
    for (let i = 0; i < 40; i++) {
      const prevRd = state.rd;
      state = updatePlayerRating(state, state.rating, i % 2 === 0 ? 1 : 0);
      expect(state.rd).toBeLessThanOrEqual(prevRd);
      expect(state.rd).toBeGreaterThanOrEqual(MIN_RD);
    }
    expect(state.gamesPlayed).toBe(40);
    expect(state.history).toHaveLength(40);
  });

  it("persists, loads, and resets state via localStorage key owlchess_player_rating", () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    // Empty storage returns initial state
    expect(loadPlayerRatingState(mockStorage)).toEqual(createInitialPlayerRatingState());

    // Save updated state and reload
    const updated = updatePlayerRating(
      createInitialPlayerRatingState(),
      1600,
      1,
      "2026-11-15T15:00:00.000Z",
    );
    savePlayerRatingState(updated, mockStorage);
    expect(store.has(PLAYER_RATING_STORAGE_KEY)).toBe(true);

    const loaded = loadPlayerRatingState(mockStorage);
    expect(loaded).toEqual(updated);

    // Reset rating restores defaults
    const reset = resetPlayerRatingState(mockStorage);
    expect(reset).toEqual(createInitialPlayerRatingState());
    expect(loadPlayerRatingState(mockStorage)).toEqual(createInitialPlayerRatingState());
  });
});
