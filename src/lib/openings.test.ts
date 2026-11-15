import { describe, expect, it } from "vitest";
import { lookupCuratedBook, normalizeFenKey, parseLichessMastersPayload } from "./openings";

describe("openings & master games lookup", () => {
  it("normalizes FEN keys to board + turn + castling", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    expect(normalizeFenKey(fen)).toBe("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq");
  });

  it("matches Ruy Lopez and returns famous master games from curated book", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    const res = lookupCuratedBook(fen);
    expect(res).not.toBeNull();
    expect(res?.eco).toBe("C60");
    expect(res?.openingName).toContain("Ruy Lopez");
    expect(res?.topGames[0].white).toContain("Karpov");
  });

  it("parses Lichess Masters API payloads and merges fallback when needed", () => {
    const parsed = parseLichessMastersPayload({
      opening: { eco: "B90", name: "Sicilian Defense: Najdorf Variation" },
      white: 1200,
      draws: 1500,
      black: 1100,
      topGames: [
        {
          id: "abc12345",
          winner: "white",
          white: { name: "Kasparov, G.", rating: 2851 },
          black: { name: "Topalov, V.", rating: 2700 },
          year: 1999,
        },
      ],
    });
    expect(parsed.eco).toBe("B90");
    expect(parsed.openingName).toBe("Sicilian Defense: Najdorf Variation");
    expect(parsed.totalMasterGames).toBe(3800);
    expect(parsed.topGames[0]).toMatchObject({
      white: "Kasparov, G.",
      black: "Topalov, V.",
      year: 1999,
      winner: "white",
    });
  });
});
