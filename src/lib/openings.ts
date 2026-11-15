export interface MasterGameRef {
  id: string;
  white: string;
  whiteRating?: number;
  black: string;
  blackRating?: number;
  year: number;
  winner: "white" | "black" | "draw";
  event?: string;
}

export interface MastersLookupResult {
  eco: string | null;
  openingName: string | null;
  totalMasterGames: number;
  topGames: MasterGameRef[];
  source: "lichess" | "book";
}

interface BookEntry {
  eco: string;
  name: string;
  games: MasterGameRef[];
}

/** Normalize a FEN to its first 4 fields (board, turn, castling, ep) for book lookup. */
export function normalizeFenKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 3).join(" ");
}

/**
 * Curated fallback book of major chess openings & famous historical master games
 * keyed by normalized FEN (`<placement> <turn> <castling>`).
 * Ensures instant opening + historical master game matching even offline or when
 * explorer.lichess.ovh rate-limits anonymous requests.
 */
const CURATED_BOOK: Record<string, BookEntry> = {
  // 1. e4
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq": {
    eco: "B00",
    name: "King's Pawn Game",
    games: [
      {
        id: "kasparov-topalov-1999",
        white: "Garry Kasparov",
        whiteRating: 2812,
        black: "Veselin Topalov",
        blackRating: 2700,
        year: 1999,
        winner: "white",
        event: "Hoogovens Wijk aan Zee",
      },
    ],
  },
  // 1. e4 e5
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": {
    eco: "C20",
    name: "Open Game (1.e4 e5)",
    games: [
      {
        id: "morphy-opera-1858",
        white: "Paul Morphy",
        black: "Duke Karl / Count Isouard",
        year: 1858,
        winner: "white",
        event: "Paris Opera House",
      },
    ],
  },
  // 1. e4 e5 2. Nf3
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq": {
    eco: "C40",
    name: "King's Knight Opening",
    games: [
      {
        id: "morphy-opera-1858",
        white: "Paul Morphy",
        black: "Duke Karl / Count Isouard",
        year: 1858,
        winner: "white",
        event: "Paris Opera House",
      },
    ],
  },
  // 1. e4 e5 2. Nf3 Nc6
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": {
    eco: "C44",
    name: "King's Knight Opening: Normal Variation",
    games: [
      {
        id: "carlsen-karjakin-2016",
        white: "Magnus Carlsen",
        whiteRating: 2853,
        black: "Sergey Karjakin",
        blackRating: 2772,
        year: 2016,
        winner: "white",
        event: "World Championship Tiebreak",
      },
    ],
  },
  // Ruy Lopez: 1. e4 e5 2. Nf3 Nc6 3. Bb5
  "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq": {
    eco: "C60",
    name: "Ruy Lopez (Spanish Game)",
    games: [
      {
        id: "kasparov-karpov-1985-g16",
        white: "Anatoly Karpov",
        whiteRating: 2720,
        black: "Garry Kasparov",
        blackRating: 2700,
        year: 1985,
        winner: "black",
        event: "World Championship Moscow",
      },
      {
        id: "fischer-spassky-1972-g10",
        white: "Bobby Fischer",
        whiteRating: 2785,
        black: "Boris Spassky",
        blackRating: 2660,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // Ruy Lopez Morphy Defense: 3... a6
  "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq": {
    eco: "C70",
    name: "Ruy Lopez: Morphy Defense",
    games: [
      {
        id: "fischer-spassky-1972-g10",
        white: "Bobby Fischer",
        whiteRating: 2785,
        black: "Boris Spassky",
        blackRating: 2660,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // Italian Game: 1. e4 e5 2. Nf3 Nc6 3. Bc4
  "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq": {
    eco: "C50",
    name: "Italian Game",
    games: [
      {
        id: "greco-nn-1620",
        white: "Gioachino Greco",
        black: "NN",
        year: 1620,
        winner: "white",
        event: "Rome Manuscripts",
      },
      {
        id: "caruana-nakamura-2020",
        white: "Fabiano Caruana",
        whiteRating: 2842,
        black: "Hikaru Nakamura",
        blackRating: 2736,
        year: 2020,
        winner: "white",
        event: "Magnus Carlsen Invitational",
      },
    ],
  },
  // Giuoco Piano: 3... Bc5
  "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq": {
    eco: "C53",
    name: "Italian Game: Giuoco Piano",
    games: [
      {
        id: "steinitz-von-bardeleben-1895",
        white: "Wilhelm Steinitz",
        black: "Curt von Bardeleben",
        year: 1895,
        winner: "white",
        event: "Hastings International",
      },
    ],
  },
  // Two Knights Defense: 3... Nf6
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq": {
    eco: "C55",
    name: "Italian Game: Two Knights Defense",
    games: [
      {
        id: "morphy-de-riviere-1863",
        white: "Paul Morphy",
        black: "Jules Arnous de Riviere",
        year: 1863,
        winner: "white",
        event: "Paris Casual Game",
      },
    ],
  },
  // Scotch Game: 1. e4 e5 2. Nf3 Nc6 3. d4
  "r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq": {
    eco: "C45",
    name: "Scotch Game",
    games: [
      {
        id: "kasparov-karpov-1990-g16",
        white: "Garry Kasparov",
        whiteRating: 2800,
        black: "Anatoly Karpov",
        blackRating: 2730,
        year: 1990,
        winner: "white",
        event: "World Championship Lyon",
      },
    ],
  },
  // Petrov's Defense: 1. e4 e5 2. Nf3 Nf6
  "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": {
    eco: "C42",
    name: "Petrov's Defense (Russian Game)",
    games: [
      {
        id: "caruana-carlsen-2018-g6",
        white: "Magnus Carlsen",
        whiteRating: 2835,
        black: "Fabiano Caruana",
        blackRating: 2832,
        year: 2018,
        winner: "draw",
        event: "World Championship London",
      },
    ],
  },
  // Philidor Defense: 1. e4 e5 2. Nf3 d6
  "rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": {
    eco: "C41",
    name: "Philidor Defense",
    games: [
      {
        id: "morphy-opera-1858",
        white: "Paul Morphy",
        black: "Duke Karl / Count Isouard",
        year: 1858,
        winner: "white",
        event: "Paris Opera House",
      },
    ],
  },
  // Sicilian Defense: 1. e4 c5
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": {
    eco: "B20",
    name: "Sicilian Defense",
    games: [
      {
        id: "kasparov-karpov-1985-g16",
        white: "Anatoly Karpov",
        whiteRating: 2720,
        black: "Garry Kasparov",
        blackRating: 2700,
        year: 1985,
        winner: "black",
        event: "World Championship Moscow",
      },
    ],
  },
  // Sicilian 2. Nf3
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq": {
    eco: "B27",
    name: "Sicilian Defense: Open",
    games: [
      {
        id: "fischer-tal-1960",
        white: "Bobby Fischer",
        black: "Mikhail Tal",
        year: 1960,
        winner: "draw",
        event: "Leipzig Olympiad",
      },
    ],
  },
  // Sicilian 2. Nf3 d6
  "rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": {
    eco: "B50",
    name: "Sicilian Defense: Modern Variations",
    games: [
      {
        id: "fischer-spassky-1972-g11",
        white: "Boris Spassky",
        whiteRating: 2660,
        black: "Bobby Fischer",
        blackRating: 2785,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // Sicilian 2. Nf3 Nc6
  "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": {
    eco: "B30",
    name: "Sicilian Defense: Old Sicilian",
    games: [
      {
        id: "carlsen-caruana-2018-g1",
        white: "Fabiano Caruana",
        whiteRating: 2832,
        black: "Magnus Carlsen",
        blackRating: 2835,
        year: 2018,
        winner: "draw",
        event: "World Championship London",
      },
    ],
  },
  // French Defense: 1. e4 e6
  "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": {
    eco: "C00",
    name: "French Defense",
    games: [
      {
        id: "botvinnik-tal-1960-g6",
        white: "Mikhail Tal",
        black: "Mikhail Botvinnik",
        year: 1960,
        winner: "white",
        event: "World Championship Moscow",
      },
    ],
  },
  // Caro-Kann Defense: 1. e4 c6
  "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": {
    eco: "B10",
    name: "Caro-Kann Defense",
    games: [
      {
        id: "deep-blue-kasparov-1997-g6",
        white: "Deep Blue (IBM)",
        black: "Garry Kasparov",
        blackRating: 2785,
        year: 1997,
        winner: "white",
        event: "New York Rematch Game 6",
      },
    ],
  },
  // Queen's Pawn Game: 1. d4
  "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq": {
    eco: "A40",
    name: "Queen's Pawn Game",
    games: [
      {
        id: "fischer-spassky-1972-g6",
        white: "Bobby Fischer",
        whiteRating: 2785,
        black: "Boris Spassky",
        blackRating: 2660,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // 1. d4 d5
  "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq": {
    eco: "D00",
    name: "Closed Game (1.d4 d5)",
    games: [
      {
        id: "fischer-spassky-1972-g6",
        white: "Bobby Fischer",
        whiteRating: 2785,
        black: "Boris Spassky",
        blackRating: 2660,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // Queen's Gambit: 1. d4 d5 2. c4
  "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq": {
    eco: "D06",
    name: "Queen's Gambit",
    games: [
      {
        id: "fischer-spassky-1972-g6",
        white: "Bobby Fischer",
        whiteRating: 2785,
        black: "Boris Spassky",
        blackRating: 2660,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // Queen's Gambit Declined: 1. d4 d5 2. c4 e6
  "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq": {
    eco: "D30",
    name: "Queen's Gambit Declined",
    games: [
      {
        id: "fischer-spassky-1972-g6",
        white: "Bobby Fischer",
        whiteRating: 2785,
        black: "Boris Spassky",
        blackRating: 2660,
        year: 1972,
        winner: "white",
        event: "World Championship Reykjavik",
      },
    ],
  },
  // Indian Defense: 1. d4 Nf6
  "rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq": {
    eco: "A45",
    name: "Indian Defense",
    games: [
      {
        id: "byrne-fischer-1956",
        white: "Donald Byrne",
        black: "Bobby Fischer",
        year: 1956,
        winner: "black",
        event: "Rosenwald Memorial (Game of the Century)",
      },
    ],
  },
};

export function lookupCuratedBook(fen: string): MastersLookupResult | null {
  const key = normalizeFenKey(fen);
  const hit = CURATED_BOOK[key];
  if (!hit) return null;
  return {
    eco: hit.eco,
    openingName: hit.name,
    totalMasterGames: hit.games.length,
    topGames: hit.games,
    source: "book",
  };
}

interface LichessMastersResponse {
  opening?: { eco?: string; name?: string } | null;
  white?: number;
  draws?: number;
  black?: number;
  topGames?: Array<{
    id: string;
    winner?: "white" | "black" | null;
    white: { name: string; rating?: number };
    black: { name: string; rating?: number };
    year?: number;
  }>;
}

/** Parse a raw JSON payload from `https://explorer.lichess.ovh/masters`. */
export function parseLichessMastersPayload(
  data: LichessMastersResponse,
  fallbackFen?: string,
): MastersLookupResult {
  const fallback = fallbackFen ? lookupCuratedBook(fallbackFen) : null;
  const total = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0);
  const topGames: MasterGameRef[] = (data.topGames ?? []).slice(0, 3).map((g) => ({
    id: g.id,
    white: g.white.name,
    whiteRating: g.white.rating,
    black: g.black.name,
    blackRating: g.black.rating,
    year: g.year ?? 0,
    winner: g.winner === "white" ? "white" : g.winner === "black" ? "black" : "draw",
  }));

  const eco = data.opening?.eco ?? fallback?.eco ?? null;
  const openingName = data.opening?.name ?? fallback?.openingName ?? null;

  return {
    eco,
    openingName,
    totalMasterGames: total || (fallback?.totalMasterGames ?? 0),
    topGames: topGames.length > 0 ? topGames : (fallback?.topGames ?? []),
    source: topGames.length > 0 || data.opening ? "lichess" : "book",
  };
}
