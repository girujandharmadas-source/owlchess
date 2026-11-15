"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import type { Config } from "chessground/config";
import type { Key } from "chessground/types";
import jsQR from "jsqr";
import { QRCodeCanvas } from "qrcode.react";
import Board from "./Board";
import {
  type FriendPassportPayload,
  buildFriendShareUrl,
  createFriendPassportPayload,
  formatFriendQrFilename,
  importFriendPassport,
} from "@/lib/friend";
import type { PlayerRatingState } from "@/lib/glicko2";
import { splitUciMove } from "@/lib/uci";

interface ShareFriendModalProps {
  playerRating: PlayerRatingState;
  activeMoves?: string[];
  activeOpponentElo?: number;
  onClose: () => void;
}

export function ShareFriendModal({
  playerRating,
  activeMoves,
  activeOpponentElo,
  onClose,
}: ShareFriendModalProps) {
  const qrWrapperRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  // If the user hasn't finished a game yet but has moves on the board, include it as a preview game
  const effectiveHistory = useMemo(() => {
    if (playerRating.history.length > 0) return playerRating.history;
    if (activeMoves && activeMoves.length > 0) {
      return [
        {
          date: new Date().toISOString(),
          rating: playerRating.rating,
          diff: 0,
          opponentElo: activeOpponentElo ?? 1500,
          result: "draw" as const,
          moves: activeMoves,
        },
      ];
    }
    return [];
  }, [activeMoves, activeOpponentElo, playerRating.history, playerRating.rating]);

  const passport = useMemo(
    () => createFriendPassportPayload(playerRating, effectiveHistory),
    [effectiveHistory, playerRating],
  );
  const shareUrl = useMemo(
    () => buildFriendShareUrl(playerRating, effectiveHistory),
    [effectiveHistory, playerRating],
  );
  const filename = formatFriendQrFilename();

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const input = document.createElement("textarea");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }, [shareUrl]);

  const handleDownloadQr = useCallback(() => {
    const canvas = qrWrapperRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [filename]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-friend-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/15 bg-[#221d31] p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="share-friend-modal-title"
              className="text-lg font-extrabold tracking-tight text-white"
            >
              Share with a Friend
            </h2>
            <p className="mt-0.5 text-xs text-neutral-300">
              Share with a friend to show your rating &amp; last 3 games in read-only spectator mode.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-white/20"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Scannable Friend Passport QR Code */}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#181424] p-4">
          <div ref={qrWrapperRef} className="rounded-xl bg-white p-2.5 shadow-lg">
            <QRCodeCanvas
              value={shareUrl}
              size={220}
              level="M"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#181424"
            />
          </div>

          <p className="text-center text-xs font-semibold text-[#ff9ce0]">
            Share with a friend to show your rating &amp; last 3 games.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-neutral-200">
            <span className="rounded-full bg-[#352f49] px-2.5 py-0.5 font-mono">
              {passport.playerRating.rating} ± {passport.playerRating.rd} ({passport.playerRating.tier})
            </span>
            <span className="rounded-full bg-[#352f49] px-2.5 py-0.5 font-mono">
              {passport.playerRating.record.wins}W-{passport.playerRating.record.draws}D-
              {passport.playerRating.record.losses}L
            </span>
            <span className="rounded-full bg-[#352f49] px-2.5 py-0.5 font-mono">
              {passport.recentGames.length} {passport.recentGames.length === 1 ? "game" : "games"} packed
            </span>
          </div>
        </div>

        {/* Friend Link Input */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Friend Passport Link
          </label>
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-white/15 bg-[#161220] px-3 py-2 font-mono text-xs text-neutral-200 focus:border-[#ee66b7] focus:outline-none"
          />
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleDownloadQr}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-[#352f49] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#433b5c]"
          >
            <span>⬇ Download Friend QR</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="owlchess-btn-primary flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wide"
          >
            <span>{copied ? "✓ Friend Link Copied!" : "🔗 Copy Friend Link"}</span>
          </button>
        </div>

        <p className="text-center font-mono text-[11px] text-neutral-400">
          Downloads as <span className="text-neutral-200">{filename}</span>
        </p>
      </div>
    </div>
  );
}

interface ViewFriendModalProps {
  initialPassport?: FriendPassportPayload | null;
  onClose: () => void;
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function ViewFriendModal({ initialPassport = null, onClose }: ViewFriendModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [passport, setPassport] = useState<FriendPassportPayload | null>(initialPassport);
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);
  const [replayPly, setReplayPly] = useState<number>(0);
  const [linkInput, setLinkInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadPassport = useCallback((loaded: FriendPassportPayload) => {
    setPassport(loaded);
    const firstGameIdx = 0;
    setSelectedGameIdx(firstGameIdx);
    const firstMoves = loaded.recentGames[firstGameIdx]?.moves ?? [];
    setReplayPly(firstMoves.length);
    setErrorMsg(null);
  }, []);

  const handleSelectGame = useCallback(
    (idx: number) => {
      setSelectedGameIdx(idx);
      const targetMoves = passport?.recentGames[idx]?.moves ?? [];
      setReplayPly(targetMoves.length);
    },
    [passport],
  );

  const decodeFriendQrImage = useCallback(
    (file: File) => {
      setErrorMsg(null);
      setDecoding(true);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : null;
        if (!dataUrl) {
          setDecoding(false);
          setErrorMsg("Could not read image file.");
          return;
        }
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setDecoding(false);
            setErrorMsg("Canvas context unavailable.");
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          setDecoding(false);
          if (!code?.data) {
            setErrorMsg("No scannable QR code found in that image. Try a clearer screenshot or paste the Friend Link below.");
            return;
          }
          const parsed = importFriendPassport(code.data);
          if (!parsed) {
            setErrorMsg("QR code was scanned, but it is not a valid OWLChess Friend Passport.");
            return;
          }
          loadPassport(parsed);
        };
        img.onerror = () => {
          setDecoding(false);
          setErrorMsg("Unsupported image format. Please upload a PNG or JPG QR image.");
        };
        img.src = dataUrl;
      };
      reader.onerror = () => {
        setDecoding(false);
        setErrorMsg("Failed to read file.");
      };
      reader.readAsDataURL(file);
    },
    [loadPassport],
  );

  const handleManualLoad = useCallback(() => {
    setErrorMsg(null);
    const parsed = importFriendPassport(linkInput);
    if (!parsed) {
      setErrorMsg("Invalid Friend Passport link or hash. Make sure the link contains #friend=...");
      return;
    }
    loadPassport(parsed);
  }, [linkInput, loadPassport]);

  const activeGame = passport?.recentGames[selectedGameIdx] ?? null;

  // Compute full move history and position at `replayPly` for the selected game
  const replayData = useMemo(() => {
    if (!activeGame) {
      return {
        fen: START_FEN,
        fullHistory: [] as Move[],
        currentLastMove: undefined as [Key, Key] | undefined,
        inCheck: false,
        turnColor: "white" as "white" | "black",
      };
    }

    const fullChess = new Chess();
    for (const uci of activeGame.moves) {
      try {
        fullChess.move(splitUciMove(uci));
      } catch {
        break;
      }
    }
    const fullHistory = fullChess.history({ verbose: true });

    const clampedPly = Math.max(0, Math.min(fullHistory.length, replayPly));
    const stepChess = new Chess();
    for (let i = 0; i < clampedPly; i++) {
      stepChess.move(fullHistory[i]);
    }
    const lastMoveObj = clampedPly > 0 ? fullHistory[clampedPly - 1] : undefined;

    return {
      fen: stepChess.fen(),
      fullHistory,
      currentLastMove: lastMoveObj
        ? ([lastMoveObj.from as Key, lastMoveObj.to as Key] as [Key, Key])
        : undefined,
      inCheck: stepChess.inCheck(),
      turnColor: (stepChess.turn() === "w" ? "white" : "black") as "white" | "black",
    };
  }, [activeGame, replayPly]);

  const replayBoardConfig: Config = useMemo(
    () => ({
      fen: replayData.fen,
      orientation: "white",
      turnColor: replayData.turnColor,
      check: replayData.inCheck,
      lastMove: replayData.currentLastMove,
      viewOnly: true,
      movable: {
        free: false,
        dests: new Map(),
        showDests: false,
      },
    }),
    [replayData],
  );

  const movePairs = useMemo(() => {
    const pairs: { no: number; w: number; b?: number }[] = [];
    for (let i = 0; i < replayData.fullHistory.length; i += 2) {
      pairs.push({
        no: i / 2 + 1,
        w: i + 1,
        b: i + 2 <= replayData.fullHistory.length ? i + 2 : undefined,
      });
    }
    return pairs;
  }, [replayData.fullHistory.length]);

  const noopMove = useCallback(() => undefined, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-friend-modal-title"
    >
      <div className="my-auto w-full max-w-3xl space-y-4 rounded-2xl border border-white/15 bg-[#221d31] p-5 text-white shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="view-friend-modal-title"
                className="text-lg font-extrabold tracking-tight text-white"
              >
                View Friend&apos;s Games
              </h2>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                Read-Only Spectator Mode
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-300">
              Your own active board and Glicko-2 rating remain 100% untouched while viewing a friend&apos;s passport.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-white/20"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {!passport ? (
          <div className="space-y-4">
            {/* Upload Friend QR Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) decodeFriendQrImage(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-7 text-center transition ${
                dragActive
                  ? "border-[#ee66b7] bg-[#df3ca9]/15"
                  : "border-white/20 bg-[#181424]/80 hover:border-[#ee66b7]/60 hover:bg-[#181424]"
              }`}
            >
              <span className="text-2xl">🦉</span>
              <p className="text-xs font-bold text-white">
                {decoding
                  ? "Scanning Friend QR Code…"
                  : "Upload Friend QR Image (Drag & Drop or Click to Browse)"}
              </p>
              <p className="text-[11px] text-neutral-400">
                Drop a <span className="font-mono text-neutral-300">owlchess-friend-YYYY-MM-DD.png</span> or QR screenshot
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) decodeFriendQrImage(file);
                }}
                className="hidden"
              />
            </div>

            {/* Paste Friend Link Input */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Or Paste Friend Passport Link (#friend=...)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://owlchess.vercel.app/#friend=..."
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#161220] px-3 py-2 font-mono text-xs text-white placeholder-neutral-500 focus:border-[#ee66b7] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleManualLoad}
                  disabled={!linkInput.trim()}
                  className="owlchess-btn-primary shrink-0 rounded-xl px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-40"
                >
                  View Friend
                </button>
              </div>
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200"
              >
                {errorMsg}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Friend Header Card */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#181424] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-xl bg-[#221d31] px-3 py-1.5 font-mono text-base font-extrabold text-[#ff9ce0] ring-1 ring-[#ee66b7]/40">
                  {passport.playerRating.rating} ± {passport.playerRating.rd}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Friend&apos;s Rating</span>
                    <span className="rounded-full border border-[#ee66b7]/40 bg-[#df3ca9]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#ff9ce0]">
                      {passport.playerRating.tier}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-neutral-300">
                    {passport.playerRating.gamesPlayed} games ·{" "}
                    <span className="text-emerald-300">{passport.playerRating.record.wins}W</span> ·{" "}
                    <span className="text-amber-200">{passport.playerRating.record.draws}D</span> ·{" "}
                    <span className="text-rose-300">{passport.playerRating.record.losses}L</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPassport(null)}
                className="rounded-lg border border-white/15 bg-[#352f49] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-[#433b5c]"
              >
                Load Another Friend
              </button>
            </div>

            {/* Past 3 Games Selector */}
            {passport.recentGames.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#181424]/70 p-6 text-center text-xs text-neutral-300">
                This friend hasn&apos;t recorded any completed games in their passport yet.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Recent Games:
                  </span>
                  {passport.recentGames.map((g, idx) => {
                    const outcomeWord =
                      g.result === "win" ? "Won" : g.result === "loss" ? "Lost" : "Draw";
                    const diffStr = g.diff >= 0 ? `+${g.diff}` : `${g.diff}`;
                    const isSelected = idx === selectedGameIdx;
                    return (
                      <button
                        key={`${g.date}-${idx}`}
                        type="button"
                        onClick={() => handleSelectGame(idx)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          isSelected
                            ? "border-[#ee66b7] bg-[#df3ca9]/30 text-white shadow-sm"
                            : "border-white/10 bg-[#352f49]/80 text-neutral-200 hover:bg-[#433b5c]"
                        }`}
                      >
                        Game {idx + 1}: {outcomeWord} vs {g.opponentElo} ({diffStr})
                      </button>
                    );
                  })}
                </div>

                {/* Mini Replay Board + Move Controls + Move Notation List */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-full max-w-[360px]">
                      <Board config={replayBoardConfig} shapes={[]} onMove={noopMove} />
                    </div>

                    {/* Step Controls: <<, <, >, >> */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReplayPly(0)}
                        disabled={replayPly <= 0}
                        className="rounded-lg bg-[#352f49] px-3 py-1 font-mono text-xs font-bold text-white transition hover:bg-[#433b5c] disabled:opacity-35"
                        title="First move"
                      >
                        &lt;&lt;
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplayPly((p) => Math.max(0, p - 1))}
                        disabled={replayPly <= 0}
                        className="rounded-lg bg-[#352f49] px-3 py-1 font-mono text-xs font-bold text-white transition hover:bg-[#433b5c] disabled:opacity-35"
                        title="Previous move"
                      >
                        &lt;
                      </button>
                      <span className="min-w-[84px] text-center font-mono text-xs text-neutral-300">
                        Ply {replayPly} / {replayData.fullHistory.length}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setReplayPly((p) => Math.min(replayData.fullHistory.length, p + 1))
                        }
                        disabled={replayPly >= replayData.fullHistory.length}
                        className="rounded-lg bg-[#352f49] px-3 py-1 font-mono text-xs font-bold text-white transition hover:bg-[#433b5c] disabled:opacity-35"
                        title="Next move"
                      >
                        &gt;
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplayPly(replayData.fullHistory.length)}
                        disabled={replayPly >= replayData.fullHistory.length}
                        className="rounded-lg bg-[#352f49] px-3 py-1 font-mono text-xs font-bold text-white transition hover:bg-[#433b5c] disabled:opacity-35"
                        title="Final position"
                      >
                        &gt;&gt;
                      </button>
                    </div>
                  </div>

                  {/* Move Notation List */}
                  <div className="flex flex-col rounded-2xl border border-white/10 bg-[#181424] p-3">
                    <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5 text-xs">
                      <span className="font-bold uppercase tracking-wider text-neutral-300">
                        Moves
                      </span>
                      <span className="font-mono text-[11px] text-neutral-400">
                        {activeGame?.date.slice(0, 10)}
                      </span>
                    </div>
                    {replayData.fullHistory.length === 0 ? (
                      <p className="text-xs text-neutral-400">
                        No move list recorded for this game.
                      </p>
                    ) : (
                      <ol className="grid max-h-[280px] grid-cols-[2rem_1fr_1fr] items-center gap-x-1.5 gap-y-1 overflow-y-auto pr-1 font-mono text-xs">
                        {movePairs.map((pair) => (
                          <li key={pair.no} className="contents">
                            <span className="text-neutral-500">{pair.no}.</span>
                            <button
                              type="button"
                              onClick={() => setReplayPly(pair.w)}
                              className={`rounded px-2 py-0.5 text-left transition ${
                                replayPly === pair.w
                                  ? "bg-[#df3ca9]/40 font-bold text-white ring-1 ring-[#ee66b7]"
                                  : "text-neutral-200 hover:bg-white/10"
                              }`}
                            >
                              {replayData.fullHistory[pair.w - 1]?.san}
                            </button>
                            {pair.b !== undefined ? (
                              <button
                                type="button"
                                onClick={() => setReplayPly(pair.b!)}
                                className={`rounded px-2 py-0.5 text-left transition ${
                                  replayPly === pair.b
                                    ? "bg-[#df3ca9]/40 font-bold text-white ring-1 ring-[#ee66b7]"
                                    : "text-neutral-200 hover:bg-white/10"
                                }`}
                              >
                                {replayData.fullHistory[pair.b - 1]?.san}
                              </button>
                            ) : (
                              <span />
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
