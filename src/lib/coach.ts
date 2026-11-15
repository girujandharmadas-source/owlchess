import type { MoveQuality } from "./classify";
import type { MotifTag } from "./motifs";
import type { MasterGameRef } from "./openings";

export interface CoachPayload {
  moveNumber: number;
  mover: "w" | "b";
  san: string;
  uci: string;
  classification: MoveQuality;
  evalBefore: string;
  evalAfter: string;
  bestMoveSan: string | null;
  engineContinuation: string[];
  detectedMotifs: MotifTag[];
  motifDescriptions: string[];
  openingName: string | null;
  openingEco: string | null;
  masterGame: MasterGameRef | null;
}

const QUALITY_HEADLINE: Record<MoveQuality, string> = {
  best: "Best Move",
  good: "Solid Move",
  inaccuracy: "Inaccuracy (?!)",
  mistake: "Mistake (?)",
  blunder: "Blunder (??)",
};

export function formatMoveNotation(moveNumber: number, mover: "w" | "b", san: string): string {
  return mover === "w" ? `${moveNumber}. ${san}` : `${moveNumber}... ${san}`;
}

export function formatMasterGameSummary(g: MasterGameRef | null): string | null {
  if (!g) return null;
  const wRating = g.whiteRating ? ` (${g.whiteRating})` : "";
  const bRating = g.blackRating ? ` (${g.blackRating})` : "";
  const result = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "½-½";
  const event = g.event ? `, ${g.event}` : "";
  return `${g.white}${wRating} vs. ${g.black}${bRating}, ${g.year}${event} (${result})`;
}

/**
 * Builds the grounded JSON prompt sent to the fast non-reasoning LLM (Gemini 3.5 Flash-Lite).
 * Because Stockfish and chessops have already computed the evaluation, PV line, and tactical
 * motifs deterministically, the LLM acts strictly as a translator.
 */
export function buildCoachPrompt(payload: CoachPayload): string {
  const notation = formatMoveNotation(payload.moveNumber, payload.mover, payload.san);
  const verifiedFacts = {
    move_played: notation,
    classification: QUALITY_HEADLINE[payload.classification],
    eval_before: payload.evalBefore,
    eval_after: payload.evalAfter,
    best_move_was: payload.bestMoveSan,
    detected_motifs: payload.detectedMotifs,
    motif_details: payload.motifDescriptions,
    engine_continuation: payload.engineContinuation.join(" "),
    opening: payload.openingName
      ? `${payload.openingEco ? `${payload.openingEco} ` : ""}${payload.openingName}`
      : null,
    master_game_reference: formatMasterGameSummary(payload.masterGame),
  };

  return [
    "You are a concise, grandmaster-level chess coach.",
    "Translate ONLY the verified engine and tactical facts below into a 3-part coaching breakdown.",
    "NEVER invent squares, pieces, or tactics that are not in the JSON payload.",
    "Keep the entire response under 95 words using these 3 bold section labels:",
    "**1. Move & Tactic:** (1 sentence naming the move quality and any detected tactical motifs)",
    "**2. Why It Matters:** (1-2 sentences explaining the evaluation shift and Stockfish's best continuation in plain English)",
    "**3. Master Game Context:** (1 sentence referencing the opening or historical master game if present, or general strategic plan if out of book)",
    "",
    "Verified Facts JSON:",
    JSON.stringify(verifiedFacts, null, 2),
  ].join("\n");
}

/**
 * Deterministic coaching synthesizer that produces the exact 3-part breakdown directly
 * from the verified Stockfish + chessops + Lichess facts when no external LLM API key is
 * configured or when offline.
 */
export function buildGroundedCoachExplanation(payload: CoachPayload): string {
  const notation = formatMoveNotation(payload.moveNumber, payload.mover, payload.san);
  const label = QUALITY_HEADLINE[payload.classification];
  const side = payload.mover === "w" ? "White" : "Black";

  // 1. Move & Tactic
  const motifList =
    payload.detectedMotifs.length > 0
      ? ` — featuring **${payload.detectedMotifs.join(", ")}**`
      : "";
  const part1 = `**1. Move & Tactic:** \`${notation}\` is rated **${label}** (eval ${payload.evalBefore} → ${payload.evalAfter})${motifList}.`;

  // 2. Why It Matters
  const details: string[] = [];
  if (payload.motifDescriptions.length > 0) {
    details.push(`${payload.motifDescriptions.join("; ")}.`);
  }
  if (
    (payload.classification === "inaccuracy" ||
      payload.classification === "mistake" ||
      payload.classification === "blunder") &&
    payload.bestMoveSan &&
    payload.bestMoveSan !== payload.san
  ) {
    details.push(
      `Stockfish preferred **${payload.bestMoveSan}** instead of ${payload.san} to maintain ${side}'s balance.`,
    );
  } else if (payload.classification === "best") {
    details.push(`${side} found Stockfish's top engine choice.`);
  }
  if (payload.engineContinuation.length > 0) {
    details.push(
      `Best continuation from here: \`${payload.engineContinuation.slice(0, 6).join(" ")}\`.`,
    );
  }
  const part2 = `**2. Why It Matters:** ${details.join(" ") || "Maintains solid piece coordination and central tension."}`;

  // 3. Master Game Context
  const masterSummary = formatMasterGameSummary(payload.masterGame);
  const openingLabel = payload.openingName
    ? `${payload.openingEco ? `[${payload.openingEco}] ` : ""}**${payload.openingName}**`
    : null;
  let part3Text: string;
  if (openingLabel && masterSummary) {
    part3Text = `Reached ${openingLabel}, famously played in *${masterSummary}*.`;
  } else if (openingLabel) {
    part3Text = `Standard book position in ${openingLabel}.`;
  } else if (masterSummary) {
    part3Text = `Matches the historical master game *${masterSummary}*.`;
  } else {
    part3Text = `Out of opening book — focus on piece activity, king safety, and forcing tactical lines.`;
  }
  const part3 = `**3. Master Game Context:** ${part3Text}`;

  return [part1, part2, part3].join("\n\n");
}
