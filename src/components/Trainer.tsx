"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import Board from "./Board";
import CoachCard, { type CoachReport } from "./CoachCard";
import EvalBar from "./EvalBar";
import { ResumeSessionModal, SaveSessionModal } from "./SessionModals";
import { type MoveQuality, QUALITY_GLYPH, classifyMove } from "@/lib/classify";
import { type CoachPayload, formatMoveNotation } from "@/lib/coach";
import { type AnalysisLine, StockfishEngine } from "@/lib/engine";
import {
  type GameOutcomeLabel,
  type GameResultScore,
  type PlayerRatingState,
  createInitialPlayerRatingState,
  formatGlickoBadge,
  loadPlayerRatingState,
  resetPlayerRatingState,
  savePlayerRatingState,
  updatePlayerRating,
} from "@/lib/glicko2";
import {
  MIN_SLIDER_ELO,
  getEloTier,
  getLowEloSearchConfig,
  selectLowEloMove,
} from "@/lib/lowElo";
import { type MotifDetectionResult, detectMotifs } from "@/lib/motifs";
import type { MastersLookupResult } from "@/lib/openings";
import {
  type SessionPayload,
  importSessionFromHash,
  profileToRatingState,
} from "@/lib/session";
import { type Score, clampElo, formatScore, splitUciMove } from "@/lib/uci";

type Color = "w" | "b";
type ColorChoice = Color | "random";
type PromoPiece = "q" | "r" | "b" | "n";

interface PositionEval {
  score: Score;
  bestmove: string | null;
  pv: string[];
  depth: number;
}

const ANALYSIS_MOVETIME = 850;
const ANALYSIS_MULTIPV = 3;
const MIN_TRUSTED_DEPTH = 6;
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PROMO_NAME: Record<PromoPiece, string> = { q: "queen", r: "rook", b: "bishop", n: "knight" };
const PROMO_GLYPH: Record<Color, Record<PromoPiece, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

const colorName = (c: Color) => (c === "w" ? "white" : "black");

function legalDests(game: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const m of game.moves({ verbose: true })) {
    const list = dests.get(m.from as Key) ?? [];
    list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const g = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(g.move(splitUciMove(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  try {
    return new Chess(fen).move(splitUciMove(uci)).san;
  } catch {
    return null;
  }
}

/** Evaluation of a terminal position (no engine needed). */
function terminalEval(game: Chess): PositionEval | null {
  if (game.isCheckmate()) {
    return {
      score: { type: "mate", value: game.turn() === "w" ? -1 : 1 },
      bestmove: null,
      pv: [],
      depth: 99,
    };
  }
  if (game.isDraw() || game.isStalemate()) {
    return { score: { type: "cp", value: 0 }, bestmove: null, pv: [], depth: 99 };
  }
  return null;
}

function gameOverText(game: Chess, player: Color): string | null {
  if (game.isCheckmate()) return game.turn() === player ? "Checkmate. Stockfish wins." : "Checkmate. You win! 🎉";
  if (game.isStalemate()) return "Draw by stalemate.";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material.";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
  if (game.isDrawByFiftyMoves()) return "Draw by the 50-move rule.";
  if (game.isDraw()) return "Draw.";
  return null;
}

const QUALITY_STYLE: Record<MoveQuality, string> = {
  best: "text-[#ff8ad8] font-semibold",
  good: "text-neutral-100",
  inaccuracy: "text-amber-300",
  mistake: "text-orange-400",
  blunder: "text-rose-400 font-semibold",
};

export interface RatingBannerState {
  diff: number;
  rating: number;
  rd: number;
  result: GameOutcomeLabel;
  opponentElo: number;
  reason: string;
}

export default function Trainer() {
  const analysisRef = useRef<StockfishEngine | null>(null);
  const opponentRef = useRef<StockfishEngine | null>(null);
  const moveStartTimestampRef = useRef<Record<number, number>>({});
  const requestedCoachPliesRef = useRef<Set<number>>(new Set());
  const ratedGameIdRef = useRef<number>(-1);

  // Single source of truth: UCI moves from the initial position.
  const [moves, setMoves] = useState<string[]>([]);
  const [resync, setResync] = useState(0);
  const [gameId, setGameId] = useState(0);
  const [resigned, setResigned] = useState(false);
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [colorChoice, setColorChoice] = useState<ColorChoice>("w");
  const [elo, setElo] = useState(1500);
  const [fullStrength, setFullStrength] = useState(false);
  const [matchMyRating, setMatchMyRating] = useState(false);
  const [eloRange, setEloRange] = useState({ min: 1320, max: 3190 });
  const [playerRating, setPlayerRating] = useState<PlayerRatingState>(() =>
    createInitialPlayerRatingState(),
  );
  const [ratingBanner, setRatingBanner] = useState<RatingBannerState | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showMotifArrows, setShowMotifArrows] = useState(true);
  const [showEval, setShowEval] = useState(true);
  const [liveLines, setLiveLines] = useState<{ fen: string; lines: AnalysisLine[] }>({ fen: "", lines: [] });
  const [evals, setEvals] = useState<Record<string, PositionEval>>({
    [START_FEN]: { score: { type: "cp", value: 20 }, bestmove: "e2e4", pv: ["e2e4", "e7e5"], depth: 10 },
  });
  const [mastersByFen, setMastersByFen] = useState<Record<string, MastersLookupResult>>({});
  const [coachStreams, setCoachStreams] = useState<
    Record<number, { text: string; streaming: boolean; engineSource: string; latencyMs: number | null }>
  >({});
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [activeModal, setActiveModal] = useState<"save" | "resume" | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const game = useMemo(() => {
    const g = new Chess();
    for (const m of moves) {
      try {
        g.move(splitUciMove(m));
      } catch {
        break;
      }
    }
    return g;
  }, [moves]);
  const fen = game.fen();
  const turn = game.turn();
  const history: Move[] = useMemo(() => game.history({ verbose: true }), [game]);
  const terminal = useMemo(() => terminalEval(game), [game]);
  const overText = resigned ? "You resigned. Stockfish wins." : gameOverText(game, playerColor);
  const thinking = engineReady && !overText && turn !== playerColor;
  const displayedElo = Math.max(MIN_SLIDER_ELO, Math.min(eloRange.max, Math.round(elo)));
  const effectiveOpponentElo = fullStrength ? eloRange.max : displayedElo;

  const recordFinishedGame = useCallback(
    (resultScore: GameResultScore, reason: string) => {
      if (ratedGameIdRef.current === gameId) return;
      ratedGameIdRef.current = gameId;

      setPlayerRating((prev) => {
        const next = updatePlayerRating(prev, effectiveOpponentElo, resultScore);
        savePlayerRatingState(next);
        const latest = next.history.at(-1);
        setRatingBanner({
          diff: latest?.diff ?? next.rating - prev.rating,
          rating: next.rating,
          rd: next.rd,
          result: latest?.result ?? (resultScore === 1 ? "win" : resultScore === 0 ? "loss" : "draw"),
          opponentElo: effectiveOpponentElo,
          reason,
        });
        if (matchMyRating) {
          setElo(Math.max(MIN_SLIDER_ELO, Math.min(eloRange.max, next.rating)));
        }
        return next;
      });
    },
    [effectiveOpponentElo, eloRange.max, gameId, matchMyRating],
  );

  const applySessionPayload = useCallback((payload: SessionPayload, sourceLabel: string) => {
    analysisRef.current?.newGame();
    opponentRef.current?.newGame();
    requestedCoachPliesRef.current.clear();
    moveStartTimestampRef.current = {};

    const restoredRating = profileToRatingState(payload.playerProfile);
    savePlayerRatingState(restoredRating);
    setPlayerRating(restoredRating);

    const restoredColor: Color = payload.currentGame.orientation === "black" ? "b" : "w";
    setPlayerColor(restoredColor);
    setColorChoice(restoredColor);
    setFlipped(false);
    setResigned(false);
    setRatingBanner(null);
    setPendingPromo(null);
    setCoachStreams({});
    setSelectedPly(null);
    setFullStrength(false);
    setElo(payload.currentGame.opponentElo);
    setMoves(payload.currentGame.moves);
    setGameId((n) => n + 1);
    setActiveModal(null);
    setSessionNotice(sourceLabel);
    setTimeout(() => setSessionNotice(null), 4000);
  }, []);

  // ---- Engines & localStorage / URL hash hydration lifecycle -------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const rawHash = typeof window !== "undefined" ? window.location.hash : "";
      const hashPayload = rawHash ? importSessionFromHash(rawHash) : null;
      if (hashPayload) {
        applySessionPayload(hashPayload, "Session restored from Magic Link!");
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      } else {
        setPlayerRating(loadPlayerRatingState());
      }
    });
    const analysis = new StockfishEngine();
    const opponent = new StockfishEngine();
    analysisRef.current = analysis;
    opponentRef.current = opponent;
    Promise.all([analysis.ready, opponent.ready]).then(
      () => {
        if (cancelled) return;
        setEloRange(opponent.eloRange);
        setEngineReady(true);
      },
      (e) => {
        if (!cancelled) setEngineError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
      analysis.terminate();
      opponent.terminate();
      analysisRef.current = null;
      opponentRef.current = null;
    };
  }, [applySessionPayload]);

  // ---- Parallel 1: Continuous Stockfish 19 MultiPV analysis -------------------------
  useEffect(() => {
    const engine = analysisRef.current;
    if (!engineReady || !engine) return;
    if (terminal) {
      engine.stop();
      return;
    }
    engine
      .search(fen, {
        movetime: ANALYSIS_MOVETIME,
        multipv: ANALYSIS_MULTIPV,
        onInfo: (lines) => setLiveLines({ fen, lines }),
      })
      .then((res) => {
        if (!res || res.depth < MIN_TRUSTED_DEPTH || !res.lines[0]) return;
        const entry: PositionEval = {
          score: res.lines[0].whiteScore,
          bestmove: res.bestmove,
          pv: res.lines[0].pv,
          depth: res.depth,
        };
        setEvals((e) => (e[fen] && e[fen].depth >= entry.depth ? e : { ...e, [fen]: entry }));
      });
  }, [fen, engineReady, gameId, terminal]);

  // ---- Parallel 2: Lichess Masters & Opening Book Lookup ----------------------------
  useEffect(() => {
    if (history.length === 0 || mastersByFen[fen]) return;
    let cancelled = false;
    fetch("/api/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<MastersLookupResult>) : null))
      .then((data) => {
        if (!cancelled && data) {
          setMastersByFen((prev) => ({ ...prev, [fen]: data }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fen, history.length, mastersByFen]);

  // ---- Parallel 3: Deterministic chessops Motif Detection (<5ms) --------------------
  const motifsByPly: MotifDetectionResult[] = useMemo(() => {
    return history.map((m, idx) => {
      const before = evals[m.before];
      const after = evals[m.after] ?? (m.after === fen ? terminal : null);
      const q =
        before && after
          ? classifyMove(before.score, after.score, m.color, before.bestmove === m.lan).quality
          : null;
      const isSoundMove = q === null ? undefined : q === "best" || q === "good";
      const prevMove = idx > 0 ? history[idx - 1] : undefined;
      return detectMotifs({
        fenBefore: m.before,
        uciMove: m.lan,
        fenBeforePrevious: prevMove?.before,
        previousMoveUci: prevMove?.lan,
        isSoundMove,
      });
    });
  }, [history, evals, fen, terminal]);

  const qualities: (MoveQuality | null)[] = useMemo(
    () =>
      history.map((m) => {
        const before = evals[m.before];
        const after = evals[m.after] ?? (m.after === fen ? terminal : null);
        if (!before || !after) return null;
        return classifyMove(before.score, after.score, m.color, before.bestmove === m.lan).quality;
      }),
    [history, evals, fen, terminal],
  );

  // ---- Streamed AI Coach Synthesis once Parallel 1-3 complete -----------------------
  useEffect(() => {
    if (history.length === 0) return;
    const ply = history.length - 1;
    if (requestedCoachPliesRef.current.has(ply)) return;

    const m = history[ply];
    const before = evals[m.before];
    const after = evals[m.after] ?? (m.after === fen ? terminal : null);
    if (!before || !after) return;

    requestedCoachPliesRef.current.add(ply);
    const quality = classifyMove(before.score, after.score, m.color, before.bestmove === m.lan).quality;
    const motifRes = motifsByPly[ply] ?? { tags: [], descriptions: [], arrows: [] };
    const masters = mastersByFen[m.after] ?? null;
    const moveNumber = Math.floor(ply / 2) + 1;
    const evalBeforeStr = formatScore(before.score);
    const evalAfterStr = formatScore(after.score);
    const bestMoveSan = uciToSan(m.before, before.bestmove);
    const continuation = pvToSan(m.after, after.pv, 6);

    const payload: CoachPayload = {
      moveNumber,
      mover: m.color,
      san: m.san,
      uci: m.lan,
      classification: quality,
      evalBefore: evalBeforeStr,
      evalAfter: evalAfterStr,
      bestMoveSan,
      engineContinuation: continuation,
      detectedMotifs: motifRes.tags,
      motifDescriptions: motifRes.descriptions,
      openingName: masters?.openingName ?? null,
      openingEco: masters?.eco ?? null,
      masterGame: masters?.topGames[0] ?? null,
    };

    const tStart = moveStartTimestampRef.current[ply] ?? performance.now();
    (async () => {
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload, apiKey: geminiApiKey || undefined }),
        });
        const engineSource = res.headers.get("X-Coach-Engine") ?? "deterministic-coach";
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const textNow = accumulated;
          setCoachStreams((prev) => ({
            ...prev,
            [ply]: { text: textNow, streaming: true, engineSource, latencyMs: null },
          }));
        }
        const totalMs = Math.round(performance.now() - tStart);
        setCoachStreams((prev) => ({
          ...prev,
          [ply]: {
            text: accumulated,
            streaming: false,
            engineSource,
            latencyMs: totalMs,
          },
        }));
      } catch {
        setCoachStreams((prev) => ({
          ...prev,
          [ply]: {
            text: prev[ply]?.text ?? "",
            streaming: false,
            engineSource: "deterministic-coach",
            latencyMs: null,
          },
        }));
      }
    })();
  }, [history, evals, fen, terminal, motifsByPly, mastersByFen, geminiApiKey]);

  // ---- Opponent move ----------------------------------------------------------------
  useEffect(() => {
    const engine = opponentRef.current;
    if (!engine || !thinking) return;
    let cancelled = false;
    const ply = moves.length;
    (async () => {
      const lowEloCfg = fullStrength ? null : getLowEloSearchConfig(elo);
      let chosenMove: string | null = null;
      if (lowEloCfg) {
        // 600–1319 Elo: disable UCI_LimitStrength and run MultiPV=4 depth-limited candidate blending
        await engine.setStrength(null);
        const res = await engine.search(fen, {
          movetime: lowEloCfg.movetime,
          depth: lowEloCfg.depth,
          multipv: lowEloCfg.multipv,
        });
        if (cancelled) return;
        chosenMove = (res ? selectLowEloMove(res.lines, elo) : null) ?? res?.bestmove ?? null;
      } else {
        // 1320+ Elo: native Stockfish UCI_LimitStrength + UCI_Elo (or unthrottled MAX)
        await engine.setStrength(fullStrength ? null : clampElo(elo, engine.eloRange));
        const movetime = fullStrength ? 1000 : 450 + Math.random() * 450;
        const res = await engine.search(fen, { movetime });
        if (cancelled) return;
        chosenMove = res?.bestmove ?? null;
      }
      if (!chosenMove) return;
      moveStartTimestampRef.current[ply] = performance.now();
      setSelectedPly(null);
      try {
        const nextGame = new Chess(fen);
        nextGame.move(splitUciMove(chosenMove));
        if (nextGame.isGameOver()) {
          const resultScore: GameResultScore = nextGame.isCheckmate() ? 0 : 0.5;
          const reason = gameOverText(nextGame, playerColor) ?? "Game over.";
          recordFinishedGame(resultScore, reason);
        }
      } catch {
        // ignore invalid move check
      }
      setMoves((ms) => (ms.length === ply ? [...ms, chosenMove] : ms));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      engine.stop();
    };
  }, [fen, thinking, gameId]); // eslint-disable-line react-hooks/exhaustive-deps -- Elo changes apply from the next move

  // ---- Player input -----------------------------------------------------------------
  const applyMove = useCallback(
    (from: Square, to: Square, promotion?: PromoPiece) => {
      try {
        const nextGame = new Chess(fen);
        const m = nextGame.move({ from, to, promotion });
        moveStartTimestampRef.current[moves.length] = performance.now();
        setSelectedPly(null);
        setMoves((ms) => [...ms, m.lan]);
        if (nextGame.isGameOver()) {
          const resultScore: GameResultScore = nextGame.isCheckmate() ? 1 : 0.5;
          const reason = gameOverText(nextGame, playerColor) ?? "Game over.";
          recordFinishedGame(resultScore, reason);
        }
      } catch {
        setResync((n) => n + 1); // illegal: snap the board back
      }
    },
    [fen, moves.length, playerColor, recordFinishedGame],
  );

  const onBoardMove = useCallback(
    (from: Key, to: Key) => {
      const isPromo = game.moves({ verbose: true }).some((m) => m.from === from && m.to === to && m.promotion);
      if (isPromo) setPendingPromo({ from: from as Square, to: to as Square });
      else applyMove(from as Square, to as Square);
    },
    [game, applyMove],
  );

  const newGame = useCallback(() => {
    analysisRef.current?.newGame();
    opponentRef.current?.newGame();
    requestedCoachPliesRef.current.clear();
    moveStartTimestampRef.current = {};
    const color: Color = colorChoice === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorChoice;
    setPlayerColor(color);
    setFlipped(false);
    setResigned(false);
    setRatingBanner(null);
    setPendingPromo(null);
    setCoachStreams({});
    setSelectedPly(null);
    setEvals({
      [START_FEN]: { score: { type: "cp", value: 20 }, bestmove: "e2e4", pv: ["e2e4", "e7e5"], depth: 10 },
    });
    setLiveLines({ fen: "", lines: [] });
    setMoves([]);
    setGameId((n) => n + 1);
  }, [colorChoice]);

  const resign = useCallback(() => {
    if (overText || history.length === 0) return;
    opponentRef.current?.stop();
    setPendingPromo(null);
    setResigned(true);
    recordFinishedGame(0, "You resigned. Stockfish wins.");
  }, [history.length, overText, recordFinishedGame]);

  const handleResetRating = useCallback(() => {
    const reset = resetPlayerRatingState();
    setPlayerRating(reset);
    setRatingBanner(null);
    if (matchMyRating) {
      setElo(reset.rating);
    }
  }, [matchMyRating]);

  const handleToggleMatchMyRating = useCallback(
    (checked: boolean) => {
      setMatchMyRating(checked);
      if (checked) {
        setFullStrength(false);
        setElo(Math.max(MIN_SLIDER_ELO, Math.min(eloRange.max, Math.round(playerRating.rating))));
      }
    },
    [eloRange.max, playerRating.rating],
  );

  /** Take back to the player's previous turn (removes the engine reply too). */
  const undo = useCallback(() => {
    opponentRef.current?.stop();
    setPendingPromo(null);
    setSelectedPly(null);
    setMoves((ms) => {
      if (ms.length === 0) return ms;
      let n = ms.length - 1;
      while (n > 0 && (n % 2 === 0 ? "w" : "b") !== playerColor) n--;
      for (let i = n; i < ms.length; i++) {
        requestedCoachPliesRef.current.delete(i);
      }
      return ms.slice(0, n);
    });
    setResync((n) => n + 1);
  }, [playerColor]);

  // ---- Derived view state -----------------------------------------------------------
  const orientation: Color = flipped ? (playerColor === "w" ? "b" : "w") : playerColor;
  const canMove = engineReady && !overText && turn === playerColor && !pendingPromo;
  const lastMove = history.at(-1);

  const boardConfig: Config = useMemo(
    () => ({
      fen,
      orientation: colorName(orientation),
      turnColor: colorName(turn),
      check: game.inCheck(),
      lastMove: lastMove ? [lastMove.from as Key, lastMove.to as Key] : undefined,
      movable: {
        free: false,
        color: colorName(playerColor),
        dests: canMove ? legalDests(game) : new Map(),
        showDests: true,
      },
    }),
    // `resync` forces chessground to snap back after an illegal drop.
    [fen, orientation, turn, game, lastMove, playerColor, canMove, resync], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const currentLines = useMemo(() => (liveLines.fen === fen ? liveLines.lines : []), [liveLines, fen]);
  const currentScore: Score | null = terminal?.score ?? currentLines[0]?.whiteScore ?? evals[fen]?.score ?? null;

  const activePly = selectedPly !== null && selectedPly < history.length ? selectedPly : history.length - 1;
  const activeReport: CoachReport | null = useMemo(() => {
    if (activePly < 0 || activePly >= history.length) return null;
    const m = history[activePly];
    const before = evals[m.before];
    const after = evals[m.after] ?? (m.after === fen ? terminal : null);
    const motifRes = motifsByPly[activePly] ?? { tags: [], descriptions: [], arrows: [] };
    const masters = mastersByFen[m.after] ?? null;
    const stream = coachStreams[activePly];
    const moveNumber = Math.floor(activePly / 2) + 1;
    return {
      ply: activePly,
      moveNotation: formatMoveNotation(moveNumber, m.color, m.san),
      quality: qualities[activePly] ?? null,
      evalBefore: before ? formatScore(before.score) : "…",
      evalAfter: after ? formatScore(after.score) : "…",
      bestMoveSan: before ? uciToSan(m.before, before.bestmove) : null,
      continuation: after ? pvToSan(m.after, after.pv, 6) : [],
      motifs: motifRes.tags,
      motifDescriptions: motifRes.descriptions,
      masters,
      text: stream?.text ?? "",
      streaming: stream ? stream.streaming : true,
      engineSource: stream?.engineSource ?? "analyzing",
      latencyMs: stream?.latencyMs ?? null,
    };
  }, [activePly, history, evals, fen, terminal, motifsByPly, mastersByFen, coachStreams, qualities]);

  const shapes: DrawShape[] = useMemo(() => {
    const out: DrawShape[] = [];
    if (showHints && turn === playerColor && currentLines[0]) {
      const { from, to } = splitUciMove(currentLines[0].pv[0]);
      out.push({ orig: from as Key, dest: to as Key, brush: "paleGreen" });
    }
    if (showMotifArrows && activePly >= 0 && motifsByPly[activePly]) {
      for (const a of motifsByPly[activePly].arrows) {
        out.push({ orig: a.orig as Key, dest: a.dest as Key, brush: a.brush });
      }
    }
    return out;
  }, [showHints, showMotifArrows, turn, playerColor, currentLines, activePly, motifsByPly]);

  const eloTier = getEloTier(displayedElo, fullStrength);
  const playerTier = getEloTier(playerRating.rating, false);
  const eloProgressPct = fullStrength
    ? 100
    : Math.max(
        6,
        Math.min(
          100,
          Math.round(((displayedElo - MIN_SLIDER_ELO) / (eloRange.max - MIN_SLIDER_ELO)) * 100),
        ),
      );

  const wdlSummary = useMemo(() => {
    let w = 0;
    let d = 0;
    let l = 0;
    for (const h of playerRating.history) {
      if (h.result === "win") w++;
      else if (h.result === "draw") d++;
      else l++;
    }
    return { w, d, l };
  }, [playerRating.history]);

  const currentSessionPayload: SessionPayload = useMemo(
    () => ({
      version: 1,
      currentGame: {
        fen,
        moves,
        opponentElo: effectiveOpponentElo,
        orientation: playerColor === "b" ? "black" : "white",
      },
      playerProfile: {
        rating: playerRating.rating,
        rd: playerRating.rd,
        vol: playerRating.vol,
        gamesPlayed: playerRating.gamesPlayed,
        history: playerRating.history,
      },
    }),
    [effectiveOpponentElo, fen, moves, playerColor, playerRating],
  );

  const status = engineError
    ? `Engine failed to load: ${engineError}`
    : !engineReady
      ? "Loading Stockfish 19…"
      : (overText ??
        (thinking
          ? `OWLChess (${fullStrength ? "full strength" : `${displayedElo} · ${eloTier}`}) is thinking…`
          : "Your move."));

  const movePairs: { no: number; w: number; b?: number }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    movePairs.push({ no: i / 2 + 1, w: i, b: i + 1 < history.length ? i + 1 : undefined });
  }

  const renderMove = (i: number) => {
    const q = qualities[i];
    const mTags = motifsByPly[i]?.tags ?? [];
    const isSelected = activePly === i;
    return (
      <button
        type="button"
        onClick={() => setSelectedPly(i)}
        className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1 text-left transition ${
          isSelected
            ? "bg-[#df3ca9]/30 ring-1 ring-[#ee66b7]"
            : "bg-[#352f49]/80 hover:bg-[#423b5b]"
        } ${q ? QUALITY_STYLE[q] : "text-neutral-200"}`}
        title={
          [q, ...mTags].filter(Boolean).join(" · ") || "Click to inspect move breakdown"
        }
      >
        <span>
          {history[i].san}
          {q ? QUALITY_GLYPH[q] : ""}
        </span>
        {mTags.length > 0 && (
          <span className="rounded bg-[#df3ca9]/30 px-1 text-[10px] text-[#ff9ce0]">
            {mTags[0] === "Center Control" ? "∙" : "⚡"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-5 lg:flex-row lg:items-start lg:gap-10">
      {/* Left column: Opponent header bar + Board + Player footer bar (matches screenshot 4) */}
      <div className="flex w-full flex-col gap-2.5 lg:w-auto lg:flex-1">
        {/* Top bar above board: Bot name + Skill Tier badge on left, dark rating badge on right */}
        <div className="flex max-w-[min(82vh,700px)] items-center justify-between px-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xl font-bold tracking-tight text-white">OWLChess · Stockfish 19</span>
            <span className="rounded-full border border-[#ee66b7]/40 bg-[#df3ca9]/20 px-2.5 py-0.5 text-xs font-semibold text-[#ff9ce0]">
              {eloTier}
            </span>
            {thinking && (
              <span className="inline-block h-2.5 w-2.5 animate-ping rounded-full bg-[#ee66b7]" />
            )}
          </div>
          <div className="rounded-md bg-[#171321] px-3.5 py-1 font-mono text-lg font-bold tracking-tight text-white shadow-inner ring-1 ring-white/10">
            {fullStrength ? "MAX" : displayedElo}
          </div>
        </div>

        {/* Board + EvalBar */}
        <div className="flex w-full gap-2.5">
          {showEval && <EvalBar score={currentScore} flipped={orientation === "b"} />}
          <div className="relative w-full max-w-[min(82vh,665px)]">
            <Board config={boardConfig} shapes={shapes} onMove={onBoardMove} />
            {pendingPromo && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-xs">
                <div className="flex gap-2.5 rounded-2xl border border-white/15 bg-[#231e33] p-3.5 shadow-2xl">
                  {(["q", "r", "b", "n"] as PromoPiece[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        const { from, to } = pendingPromo;
                        setPendingPromo(null);
                        applyMove(from, to, p);
                      }}
                      className="h-16 w-16 rounded-xl bg-[#f3ddc2] text-5xl leading-none text-[#231b16] shadow transition hover:scale-105 hover:bg-white"
                      aria-label={`Promote to ${PROMO_NAME[p]}`}
                    >
                      {PROMO_GLYPH[playerColor][p]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Animated Glicko-2 Rating Change Banner when a game concludes */}
        {ratingBanner && (
          <div
            role="status"
            aria-live="polite"
            className="flex max-w-[min(82vh,700px)] flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#221d31]/95 px-4 py-3 shadow-2xl transition-all duration-300"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-xl border px-3 py-1 font-mono text-sm font-extrabold tracking-tight shadow-sm ${
                  ratingBanner.diff > 0
                    ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                    : ratingBanner.diff < 0
                      ? "border-rose-400/50 bg-rose-500/20 text-rose-300"
                      : "border-amber-400/50 bg-amber-500/20 text-amber-200"
                }`}
              >
                {ratingBanner.diff >= 0 ? `+${ratingBanner.diff}` : ratingBanner.diff} Rating
              </span>
              <div className="text-xs">
                <p className="font-bold text-white">{ratingBanner.reason}</p>
                <p className="text-neutral-300">
                  Updated Glicko-2:{" "}
                  <span className="font-mono font-semibold text-[#ff9ce0]">
                    {ratingBanner.rating} ± {ratingBanner.rd}
                  </span>{" "}
                  <span className="text-neutral-400">(vs {ratingBanner.opponentElo} Elo)</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={newGame}
              className="owlchess-btn-primary rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-wide"
            >
              Play again
            </button>
          </div>
        )}

        {/* Bottom bar below board: Player label + live Glicko-2 rating badge on left, eval pill on right */}
        <div className="flex max-w-[min(82vh,700px)] flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white">
              You{" "}
              <span className="text-sm font-medium text-neutral-400">
                ({playerColor === "w" ? "White" : "Black"})
              </span>
            </span>

            {/* Live Player Glicko-2 Rating Badge (e.g. "1524 ± 65") */}
            <span
              className="rounded-md bg-[#171321] px-2.5 py-1 font-mono text-sm font-bold tracking-tight text-[#ff9ce0] shadow-inner ring-1 ring-[#ee66b7]/30"
              title={`Your Glicko-2 Rating: ${formatGlickoBadge(playerRating)} (Volatility σ=${playerRating.vol})`}
            >
              {formatGlickoBadge(playerRating)}
            </span>

            <span className="rounded-full border border-white/15 bg-[#352f49]/80 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-200">
              {playerTier}
            </span>

            {playerRating.gamesPlayed > 0 && (
              <span className="font-mono text-[11px] text-neutral-400">
                {wdlSummary.w}W-{wdlSummary.d}D-{wdlSummary.l}L
              </span>
            )}

            <button
              type="button"
              onClick={handleResetRating}
              className="rounded-md border border-white/10 bg-[#2a243b] px-2 py-0.5 text-[11px] font-medium text-neutral-300 transition hover:border-white/30 hover:bg-[#38304e] hover:text-white"
              title="Reset your Glicko-2 rating back to 1500 ± 350"
            >
              Reset Rating
            </button>
          </div>

          <div className="rounded-md bg-[#f5f5f8] px-3.5 py-1 font-mono text-lg font-bold tracking-tight text-[#181424] shadow">
            {currentScore ? formatScore(currentScore) : "0.00"}
          </div>
        </div>
      </div>

      {/* Right column: Coaching speech bubble, Elo progress bar, icon toolbar, lines & moves */}
      <aside className="flex w-full flex-col gap-5 lg:w-[430px] lg:pt-2">
        {/* AI Coach Breakdown Card (Owl Mascot + White Speech Bubble) */}
        <CoachCard
          report={activeReport}
          statusText={status}
          showMotifArrows={showMotifArrows}
          onToggleMotifArrows={setShowMotifArrows}
          apiKey={geminiApiKey}
          onChangeApiKey={setGeminiApiKey}
        />

        {/* Strength / Elo estimation bar (styled after screenshot 4's hexagon pawn + pink progress bar + FINISH pill) */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-[#221d31]/85 p-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            {/* Hexagonal icy-blue pawn badge from screenshot 4 */}
            <div className="relative flex h-12 w-11 shrink-0 items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 44 50" className="h-12 w-11 drop-shadow">
                <polygon
                  points="22,2 42,13 42,37 22,48 2,37 2,13"
                  fill="#d8ecff"
                  stroke="#181424"
                  strokeWidth="2.5"
                />
                <circle cx="22" cy="16" r="4.5" fill="#181424" />
                <path d="M16 31 C16 23, 28 23, 28 31 Z" fill="#181424" />
                <rect x="14" y="31" width="16" height="3.2" rx="1.5" fill="#181424" />
              </svg>
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold tracking-tight text-white">
                  Opponent Elo · <span className="text-[#ff9ce0]">{eloTier}</span>
                </span>
                <span className="font-mono text-xs font-bold text-[#ff8ad8]">
                  {fullStrength ? "MAX (3190+)" : `${displayedElo} Elo`}
                </span>
              </div>

              {/* Pink-filled dark progress track with interactive range input */}
              <div className="relative flex h-3.5 w-full items-center rounded-full border border-white/15 bg-[#161220] p-0.5 shadow-inner">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-[#df3ca9] to-[#ff73d2] transition-all duration-150"
                  style={{ width: `${eloProgressPct}%` }}
                />
                <input
                  type="range"
                  min={MIN_SLIDER_ELO}
                  max={eloRange.max}
                  step={25}
                  value={displayedElo}
                  disabled={fullStrength}
                  onChange={(e) => {
                    setMatchMyRating(false);
                    setElo(Number(e.target.value));
                  }}
                  aria-label="Stockfish Elo"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Outlined pill button matching "FINISH" in screenshot 4 */}
            <button
              type="button"
              onClick={() => {
                setMatchMyRating(false);
                setFullStrength((v) => !v);
              }}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                fullStrength
                  ? "border-[#ee66b7] bg-[#df3ca9] text-white shadow-[0_0_12px_rgba(223,60,169,0.5)]"
                  : "border-white/35 bg-transparent text-white hover:border-white/70 hover:bg-white/5"
              }`}
              title="Toggle full unthrottled Stockfish 19 strength"
            >
              {fullStrength ? "MAX ON" : "MAX"}
            </button>
          </div>

          {/* Match Opponent to My Rating toggle row */}
          <div className="flex items-center justify-between rounded-xl bg-[#181424]/70 px-3 py-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2 font-medium text-neutral-200">
              <input
                type="checkbox"
                checked={matchMyRating}
                onChange={(e) => handleToggleMatchMyRating(e.target.checked)}
                className="accent-[#df3ca9]"
              />
              <span>Match Opponent to My Rating</span>
            </label>
            <span className="font-mono text-[11px] text-[#ff9ce0]">
              {formatGlickoBadge(playerRating)}
            </span>
          </div>

          {/* Action Toolbar Row: Play-as pills + Signature OWLChess CTA + Icon controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="mr-1 font-semibold text-neutral-400">Side:</span>
              {(["w", "b", "random"] as ColorChoice[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setColorChoice(c)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    colorChoice === c
                      ? "bg-[#df3ca9] text-white shadow-xs"
                      : "bg-[#352f49] text-neutral-300 hover:bg-[#433b5c]"
                  }`}
                >
                  {c === "w" ? "White" : c === "b" ? "Black" : "Random"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={newGame}
                className="owlchess-btn-primary rounded-xl px-3.5 py-1.5 text-xs font-bold tracking-wide"
              >
                New game
              </button>
              <button
                onClick={undo}
                disabled={history.length === 0 || Boolean(overText)}
                className="rounded-lg bg-[#352f49] px-2.5 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-[#433b5c] disabled:opacity-35"
                title="Take back move"
              >
                Undo
              </button>
              <button
                onClick={resign}
                disabled={history.length === 0 || Boolean(overText)}
                className="rounded-lg bg-[#352f49] px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-35"
                title="Resign current game"
              >
                Resign
              </button>
              <button
                onClick={() => setFlipped((f) => !f)}
                className="rounded-lg bg-[#352f49] px-2.5 py-1.5 text-xs font-semibold text-neutral-100 transition hover:bg-[#433b5c]"
                title="Flip board orientation"
              >
                Flip
              </button>
            </div>
          </div>

          {/* Session Save & Resume Toolbar Row (Magic Link + QR Code) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <span className="text-[11px] font-medium text-neutral-400">
              {sessionNotice ? (
                <span className="font-semibold text-emerald-300">✓ {sessionNotice}</span>
              ) : (
                "Sync session across devices (Magic Link / QR)"
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveModal("save")}
                className="rounded-lg border border-[#ee66b7]/40 bg-[#df3ca9]/20 px-3 py-1 text-xs font-bold text-[#ff9ce0] transition hover:bg-[#df3ca9]/35"
                title="Generate Magic Link & downloadable QR Code for current game and Glicko-2 rating"
              >
                Save Game
              </button>
              <button
                type="button"
                onClick={() => setActiveModal("resume")}
                className="rounded-lg border border-white/15 bg-[#352f49] px-3 py-1 text-xs font-bold text-neutral-100 transition hover:bg-[#433b5c]"
                title="Upload a saved QR Code image or paste a Magic Link to resume"
              >
                Resume Game
              </button>
            </div>
          </div>
        </section>

        {/* Engine Lines (MultiPV 3) */}
        <section className="space-y-2.5 rounded-2xl border border-white/10 bg-[#221d31]/85 p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Engine Lines (MultiPV 3)
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-300">
                <input
                  type="checkbox"
                  checked={showEval}
                  onChange={(e) => setShowEval(e.target.checked)}
                  className="accent-[#df3ca9]"
                />
                Eval bar
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-300">
                <input
                  type="checkbox"
                  checked={showHints}
                  onChange={(e) => setShowHints(e.target.checked)}
                  className="accent-[#df3ca9]"
                />
                💡 Hint arrow
              </label>
            </div>
          </div>
          {currentLines.length === 0 ? (
            <p className="text-xs text-neutral-400">{overText ? "Game over." : "Analyzing position…"}</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-xs">
              {currentLines.map((l) => (
                <li
                  key={l.multipv}
                  className="flex items-center gap-2 rounded-lg bg-[#181424]/70 px-2.5 py-1"
                >
                  <span className="w-12 shrink-0 font-bold text-[#ff8ad8]">{formatScore(l.whiteScore)}</span>
                  <span className="truncate text-neutral-200">{pvToSan(fen, l.pv, 8).join(" ")}</span>
                </li>
              ))}
              <li className="text-right text-[11px] text-neutral-400">depth {currentLines[0]?.depth}</li>
            </ul>
          )}
        </section>

        {/* Move History (styled with dark-violet pill tags like screenshot 3's opening pills) */}
        <section className="rounded-2xl border border-white/10 bg-[#221d31]/85 p-4 shadow-xl">
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-neutral-300">
            Moves <span className="font-normal lowercase text-neutral-400">(click any move for coach breakdown)</span>
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-neutral-400">No moves played yet.</p>
          ) : (
            <ol className="grid max-h-48 grid-cols-[2.2rem_1fr_1fr] items-center gap-x-2 gap-y-1.5 overflow-y-auto pr-1 font-mono text-xs">
              {movePairs.map((p) => (
                <li key={p.no} className="contents">
                  <span className="text-neutral-400">{p.no}.</span>
                  {renderMove(p.w)}
                  {p.b !== undefined ? renderMove(p.b) : <span />}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-neutral-400">
            <span className="text-amber-300">?!</span> inaccuracy · <span className="text-orange-400">?</span> mistake ·{" "}
            <span className="text-rose-400">??</span> blunder · <span className="text-[#ff8ad8]">pink</span> = best ·{" "}
            <span className="text-[#ff9ce0]">⚡</span> tactical motif
          </p>
        </section>
      </aside>

      {activeModal === "save" && (
        <SaveSessionModal
          payload={currentSessionPayload}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === "resume" && (
        <ResumeSessionModal
          onRestore={(payload) =>
            applySessionPayload(payload, "Session restored from QR / Magic Link!")
          }
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
