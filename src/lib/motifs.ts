import { Chess } from "chessops/chess";
import { attacks, between, bishopAttacks, ray, rookAttacks } from "chessops/attacks";
import { parseFen } from "chessops/fen";
import { SquareSet } from "chessops/squareSet";
import type { Color, Piece, Role, Square, SquareName } from "chessops/types";
import { makeSquare, opposite, parseSquare, parseUci } from "chessops/util";

export type MotifTag =
  | "Fork"
  | "Pin"
  | "Skewer"
  | "Discovered Check"
  | "Discovered Attack"
  | "Zwischenzug"
  | "Hanging Piece"
  | "Captures Hanging Piece"
  | "Double Check"
  | "Check"
  | "Promotion"
  | "Castling"
  | "Center Control";

export interface MotifArrow {
  orig: SquareName;
  dest: SquareName;
  brush: "red" | "yellow" | "blue" | "paleGreen";
}

export interface MotifDetectionResult {
  tags: MotifTag[];
  /** Grounded one-line descriptions of each detected motif for the LLM prompt. */
  descriptions: string[];
  /** Visual arrows to overlay on chessground when inspecting the move. */
  arrows: MotifArrow[];
}

export interface DetectMotifsInput {
  /** FEN before the move is played. */
  fenBefore: string;
  /** Played move in UCI format, e.g. "f3d4" or "e7e8q". */
  uciMove: string;
  /** Optional FEN before the opponent's previous move (for Zwischenzug detection). */
  fenBeforePrevious?: string;
  /** Optional opponent's previous move in UCI (for Zwischenzug detection). */
  previousMoveUci?: string;
  /** Whether the move was rated best/good by Stockfish (helps validate Zwischenzug). */
  isSoundMove?: boolean;
}

const ROLE_VALUE: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 100,
};

const ROLE_NAME: Record<Role, string> = {
  pawn: "pawn",
  knight: "knight",
  bishop: "bishop",
  rook: "rook",
  queen: "queen",
  king: "king",
};

const CENTER_SQUARES = new SquareSet(0x18180000, 0x00001818); // d4, e4, d5, e5

function parsePos(fen: string): Chess | null {
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : null;
}

function sliderFullRay(role: Role, sq: Square): SquareSet {
  if (role === "rook") return rookAttacks(sq, SquareSet.empty());
  if (role === "bishop") return bishopAttacks(sq, SquareSet.empty());
  if (role === "queen") return rookAttacks(sq, SquareSet.empty()).union(bishopAttacks(sq, SquareSet.empty()));
  return SquareSet.empty();
}

function pieceLabel(piece: Piece, sq: Square): string {
  return `${ROLE_NAME[piece.role]} on ${makeSquare(sq)}`;
}

/**
 * Deterministically detects tactical and positional motifs for a move using `chessops`
 * bitboards, attack maps, and sliding rays.
 */
export function detectMotifs(input: DetectMotifsInput): MotifDetectionResult {
  const tags: MotifTag[] = [];
  const descriptions: string[] = [];
  const arrows: MotifArrow[] = [];

  const addTag = (tag: MotifTag, desc?: string) => {
    if (!tags.includes(tag)) tags.push(tag);
    if (desc && !descriptions.includes(desc)) descriptions.push(desc);
  };

  const posBefore = parsePos(input.fenBefore);
  const move = parseUci(input.uciMove);
  if (!posBefore || !move || !("from" in move)) {
    return { tags, descriptions, arrows };
  }

  const mover: Color = posBefore.turn;
  const enemy: Color = opposite(mover);
  const fromSq = move.from;
  const toSq = move.to;
  const movedPieceBefore = posBefore.board.get(fromSq);
  if (!movedPieceBefore) {
    return { tags, descriptions, arrows };
  }

  // Check if this is a castling move (king moves 2+ files or onto own rook).
  const isCastling =
    movedPieceBefore.role === "king" &&
    (Math.abs((fromSq & 7) - (toSq & 7)) > 1 || posBefore.board.getColor(toSq) === mover);

  const capturedPiece = isCastling ? undefined : posBefore.board.get(toSq);
  const wasTargetDefendedBefore =
    capturedPiece !== undefined &&
    posBefore.kingAttackers(toSq, enemy, posBefore.board.occupied.without(fromSq)).nonEmpty();

  const posAfter = posBefore.clone();
  posAfter.play(move);
  const boardAfter = posAfter.board;

  // Actual destination square of the moved piece (accounting for castling).
  const landedSq: Square = isCastling
    ? toSq > fromSq
      ? ((fromSq + 2) as Square)
      : ((fromSq - 2) as Square)
    : toSq;
  const movedPiece = boardAfter.get(landedSq) ?? movedPieceBefore;

  // 1. Check / Double Check
  const ctxAfter = posAfter.ctx();
  if (ctxAfter.checkers.moreThanOne()) {
    addTag("Double Check", `Double check delivered to the ${enemy} king`);
  } else if (ctxAfter.checkers.nonEmpty()) {
    addTag("Check", `Check delivered to the ${enemy} king`);
  }

  // 2. Promotion & Castling
  if (move.promotion) {
    addTag("Promotion", `Pawn promoted to ${ROLE_NAME[move.promotion]} on ${makeSquare(landedSq)}`);
  }
  if (isCastling) {
    addTag("Castling", `${mover === "white" ? "White" : "Black"} castled to safety`);
  }

  // 3. Captures Hanging Piece
  if (
    capturedPiece &&
    ROLE_VALUE[capturedPiece.role] >= 3 &&
    !wasTargetDefendedBefore
  ) {
    addTag(
      "Captures Hanging Piece",
      `Captured undefended ${ROLE_NAME[capturedPiece.role]} on ${makeSquare(toSq)}`,
    );
  }

  // 4. Fork detection: moved piece attacks >= 2 valuable/undefended enemy pieces.
  const directAttacks = attacks(movedPiece, landedSq, boardAfter.occupied).intersect(boardAfter[enemy]);
  const forkTargets: Square[] = [];
  for (const targetSq of directAttacks) {
    const targetPiece = boardAfter.get(targetSq);
    if (!targetPiece) continue;
    const isKing = targetPiece.role === "king";
    const isHigherValue = ROLE_VALUE[targetPiece.role] > ROLE_VALUE[movedPiece.role];
    const isUndefended =
      ROLE_VALUE[targetPiece.role] >= 3 &&
      posAfter.kingAttackers(targetSq, enemy, boardAfter.occupied).isEmpty();
    if (isKing || isHigherValue || isUndefended) {
      forkTargets.push(targetSq);
    }
  }
  if (forkTargets.length >= 2) {
    const targetLabels = forkTargets
      .map((sq) => {
        const p = boardAfter.get(sq)!;
        return pieceLabel(p, sq);
      })
      .join(" and ");
    addTag("Fork", `${pieceLabel(movedPiece, landedSq)} forks ${targetLabels}`);
    for (const sq of forkTargets) {
      arrows.push({ orig: makeSquare(landedSq), dest: makeSquare(sq), brush: "red" });
    }
  }

  // 5. Pin & Skewer detection along sliding rays of the mover's sliders.
  const moverSliders = boardAfter.sliders().intersect(boardAfter[mover]);
  for (const sniperSq of moverSliders) {
    const sniperPiece = boardAfter.get(sniperSq);
    if (!sniperPiece) continue;
    const fullRay = sliderFullRay(sniperPiece.role, sniperSq);

    // Check enemy pieces that could serve as a pin anchor (King, Queen, Rook) or skewer front piece.
    const enemyPieces = boardAfter[enemy].intersect(fullRay);
    for (const anchorSq of enemyPieces) {
      const anchorPiece = boardAfter.get(anchorSq);
      if (!anchorPiece || ROLE_VALUE[anchorPiece.role] < 5) continue;

      const blockersBetween = between(sniperSq, anchorSq).intersect(boardAfter.occupied);
      if (blockersBetween.size() === 1) {
        const midSq = blockersBetween.first()!;
        const midPiece = boardAfter.get(midSq);
        if (!midPiece || midPiece.color !== enemy) continue;

        // Only highlight pins that involve the moved piece or were newly uncovered.
        const isRelevant =
          sniperSq === landedSq || between(sniperSq, anchorSq).has(fromSq);
        if (!isRelevant) continue;

        // Pin: lower-value piece in front of higher-value anchor (King or Queen/Rook).
        if (ROLE_VALUE[anchorPiece.role] > ROLE_VALUE[midPiece.role]) {
          const pinKind = anchorPiece.role === "king" ? "Absolute pin" : "Relative pin";
          addTag(
            "Pin",
            `${pinKind}: ${pieceLabel(sniperPiece, sniperSq)} pins ${pieceLabel(midPiece, midSq)} to ${pieceLabel(anchorPiece, anchorSq)}`,
          );
          arrows.push({ orig: makeSquare(sniperSq), dest: makeSquare(anchorSq), brush: "yellow" });
        }
        // Skewer: higher-value piece in front (midSq), lower-value enemy piece behind (anchorSq).
      } else if (blockersBetween.isEmpty()) {
        // `anchorSq` is directly attacked by `sniperSq`. Look behind `anchorSq` along the same ray for a Skewer!
        if (ROLE_VALUE[anchorPiece.role] <= ROLE_VALUE[sniperPiece.role] && anchorPiece.role !== "king") {
          continue;
        }
        const lineRay = ray(sniperSq, anchorSq);
        // Squares strictly behind `anchorSq` away from `sniperSq`:
        for (const behindSq of lineRay.intersect(boardAfter[enemy])) {
          if (behindSq === anchorSq) continue;
          const betweenSniperAndBehind = between(sniperSq, behindSq);
          if (!betweenSniperAndBehind.has(anchorSq)) continue;
          // Ensure `anchorSq` is the ONLY piece between `sniperSq` and `behindSq`.
          if (betweenSniperAndBehind.intersect(boardAfter.occupied).size() !== 1) continue;
          const behindPiece = boardAfter.get(behindSq);
          if (!behindPiece) continue;
          if (
            ROLE_VALUE[anchorPiece.role] > ROLE_VALUE[behindPiece.role] &&
            ROLE_VALUE[behindPiece.role] >= 3 &&
            (sniperSq === landedSq || between(sniperSq, behindSq).has(fromSq))
          ) {
            addTag(
              "Skewer",
              `${pieceLabel(sniperPiece, sniperSq)} skewers ${pieceLabel(anchorPiece, anchorSq)} exposing ${pieceLabel(behindPiece, behindSq)}`,
            );
            arrows.push({ orig: makeSquare(sniperSq), dest: makeSquare(behindSq), brush: "yellow" });
          }
        }
      }
    }
  }

  // 6. Discovered Attack / Discovered Check: moving from `fromSq` unblocked a friendly slider `sniperSq`.
  for (const sniperSq of moverSliders) {
    if (sniperSq === landedSq) continue;
    const sniperPiece = boardAfter.get(sniperSq);
    if (!sniperPiece) continue;
    const nowAttacked = attacks(sniperPiece, sniperSq, boardAfter.occupied).intersect(boardAfter[enemy]);
    for (const targetSq of nowAttacked) {
      // Did the ray from `sniperSq` to `targetSq` pass through `fromSq`?
      if (!between(sniperSq, targetSq).has(fromSq)) continue;
      const targetPiece = boardAfter.get(targetSq);
      if (!targetPiece) continue;
      if (targetPiece.role === "king") {
        addTag(
          "Discovered Check",
          `Moving from ${makeSquare(fromSq)} uncovered a discovered check from ${pieceLabel(sniperPiece, sniperSq)}`,
        );
        arrows.push({ orig: makeSquare(sniperSq), dest: makeSquare(targetSq), brush: "red" });
      } else if (
        ROLE_VALUE[targetPiece.role] > ROLE_VALUE[sniperPiece.role] ||
        ROLE_VALUE[targetPiece.role] >= 5 ||
        posAfter.kingAttackers(targetSq, enemy, boardAfter.occupied).isEmpty()
      ) {
        addTag(
          "Discovered Attack",
          `Moving from ${makeSquare(fromSq)} uncovered an attack by ${pieceLabel(sniperPiece, sniperSq)} on ${pieceLabel(targetPiece, targetSq)}`,
        );
        arrows.push({ orig: makeSquare(sniperSq), dest: makeSquare(targetSq), brush: "blue" });
      }
    }
  }

  // 7. Zwischenzug (In-between move) detection
  if (input.fenBeforePrevious && input.previousMoveUci && input.isSoundMove !== false) {
    const posPrev = parsePos(input.fenBeforePrevious);
    const prevMove = parseUci(input.previousMoveUci);
    if (posPrev && prevMove && "from" in prevMove) {
      const prevCapture = posPrev.board.get(prevMove.to);
      const canRecapture =
        prevCapture !== undefined &&
        ROLE_VALUE[prevCapture.role] >= 1 &&
        posBefore.kingAttackers(prevMove.to, mover, posBefore.board.occupied).nonEmpty();

      // Or did the opponent's previous move newly attack one of mover's valuable pieces?
      const prevMovedPiece = posBefore.board.get(prevMove.to);
      const newlyThreatened = prevMovedPiece
        ? attacks(prevMovedPiece, prevMove.to, posBefore.board.occupied)
            .intersect(posBefore.board[mover])
            .diff(posBefore.board.pawn)
            .diff(posBefore.board.king)
        : SquareSet.empty();

      const playedRecapture = landedSq === prevMove.to;
      const retreatedThreatened = newlyThreatened.has(fromSq);
      const createdHighThreat =
        ctxAfter.checkers.nonEmpty() ||
        directAttacks.intersect(boardAfter.queen.union(boardAfter.rook)).nonEmpty();

      if (canRecapture && !playedRecapture && createdHighThreat) {
        addTag(
          "Zwischenzug",
          `In-between forcing move (${makeSquare(fromSq)}→${makeSquare(landedSq)}) played before recapturing on ${makeSquare(prevMove.to)}`,
        );
      } else if (newlyThreatened.nonEmpty() && !retreatedThreatened && !playedRecapture && createdHighThreat) {
        addTag(
          "Zwischenzug",
          `In-between counter-threat (${makeSquare(fromSq)}→${makeSquare(landedSq)}) played instead of retreating threatened piece`,
        );
      }
    }
  }

  // 8. Hanging Piece left en prise by the mover
  for (const sq of boardAfter[mover]) {
    const piece = boardAfter.get(sq);
    if (!piece || ROLE_VALUE[piece.role] < 3) continue;
    const enemyAttackers = posAfter.kingAttackers(sq, enemy, boardAfter.occupied);
    if (enemyAttackers.isEmpty()) continue;
    const friendlyDefenders = posAfter.kingAttackers(sq, mover, boardAfter.occupied);
    const minAttackerValue = Math.min(
      ...[...enemyAttackers].map((aSq) => ROLE_VALUE[boardAfter.get(aSq)?.role ?? "king"]),
    );
    // Piece is hanging if undefended, or attacked by a strictly cheaper piece (e.g. pawn attacks knight).
    if (friendlyDefenders.isEmpty() || minAttackerValue < ROLE_VALUE[piece.role]) {
      // Confirm at least one attacker has a legal capture on `sq`.
      let canLegallyCapture = false;
      for (const aSq of enemyAttackers) {
        if (posAfter.dests(aSq, ctxAfter).has(sq)) {
          canLegallyCapture = true;
          break;
        }
      }
      if (canLegallyCapture && sq === landedSq && input.isSoundMove !== true) {
        addTag("Hanging Piece", `${pieceLabel(piece, sq)} is left vulnerable to capture`);
      }
    }
  }

  // 9. Center Control in the opening (first 12 full moves)
  if (posBefore.fullmoves <= 12 && tags.length === 0) {
    const attacksCenter = attacks(movedPiece, landedSq, boardAfter.occupied).intersects(CENTER_SQUARES);
    if (CENTER_SQUARES.has(landedSq) || attacksCenter) {
      addTag("Center Control", `${pieceLabel(movedPiece, landedSq)} contests the central squares`);
    }
  }

  return { tags, descriptions, arrows };
}

/** Convert a square name like "e4" to a valid chessops Square (exposed for tests/UI). */
export { parseSquare };
