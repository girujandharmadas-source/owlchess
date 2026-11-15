"use client";

import { useCallback, useEffect, useState } from "react";

export const TUTORIAL_STORAGE_KEY = "owlchess_seen_tutorial";
export const OPEN_GUIDE_EVENT = "owlchess:open-guide";

export function HowToPlayHeaderButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT));
        }
      }}
      className="flex items-center gap-1.5 rounded-full border border-[#ee66b7]/50 bg-[#df3ca9]/25 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:border-[#ee66b7] hover:bg-[#df3ca9]/40"
      title="Open the interactive How to Play & Feature Guide"
    >
      <span>❓ How to Play</span>
    </button>
  );
}

export interface GuideCallout {
  badge: string;
  title: string;
  description: string;
}

export interface GuideSlide {
  id: string;
  stepNumber: number;
  tabLabel: string;
  title: string;
  subtitle: string;
  callouts: GuideCallout[];
}

export const HOW_TO_PLAY_SLIDES: GuideSlide[] = [
  {
    id: "elo-slider",
    stepNumber: 1,
    tabLabel: "1. Opponent Elo",
    title: "Opponent Elo Slider (600–3190+)",
    subtitle:
      "Dial Stockfish 19 from realistic human-like Beginner play (600 Elo) up to unthrottled Grandmaster strength.",
    callouts: [
      {
        badge: "↖ 600–1319 Elo",
        title: "Candidate-Move Depth Blending",
        description:
          "Below Stockfish's native 1320 floor, OWLChess runs MultiPV=4 at shallow depths (1–5) with an Elo-weighted temperature curve to simulate natural beginner oversights while filtering out game-breaking >600 cp Queen blunders.",
      },
      {
        badge: "↗ 1320–3190+ & MAX",
        title: "Native Stockfish 19 Calibration",
        description:
          "Above 1320 Elo, the engine switches to native UCI_LimitStrength + UCI_Elo calibration, or click MAX for full unthrottled Stockfish 19 power.",
      },
      {
        badge: "↘ Skill Tiers",
        title: "Live Skill Tier Badges",
        description:
          "Automatically labels opponent strength across 5 tiers: Beginner (600–799), Novice (800–1099), Intermediate (1100–1319), Advanced (1320–1999), and Master / Grandmaster (2000+).",
      },
    ],
  },
  {
    id: "ai-coach",
    stepNumber: 2,
    tabLabel: "2. AI Coach",
    title: "AI Coach & Real-Time Breakdown",
    subtitle:
      "Every move is verified by Stockfish 19 + chessops bitboards first, then translated into a 3-part plain-English coaching breakdown in under 5 seconds.",
    callouts: [
      {
        badge: "① Move Grade",
        title: "Win-Probability Move Classification",
        description:
          "Grades every move using Lichess win-probability thresholds: ★ Best, ✓ Solid, ?! Inaccuracy, ? Mistake, or ?? Blunder.",
      },
      {
        badge: "② Motif Tags",
        title: "Deterministic Tactical Motif Detector (<5ms)",
        description:
          "Bitboard ray & attack analysis flags Pins, Forks, Skewers, Discovered Checks, Zwischenzugs (in-between moves), and Hanging Pieces with zero LLM hallucination.",
      },
      {
        badge: "③ Master Games",
        title: "Lichess Masters Opening & GM Citations",
        description:
          "Matches your exact FEN against the Lichess Masters database to display the ECO opening name and historical Grandmaster games.",
      },
    ],
  },
  {
    id: "eval-arrows",
    stepNumber: 3,
    tabLabel: "3. Eval & Arrows",
    title: "Eval Bar & On-Board Tactical Arrows",
    subtitle:
      "Visualize position advantage and geometric board threats in real time as you play or review earlier moves.",
    callouts: [
      {
        badge: "⬅ Eval Bar",
        title: "Real-Time Win Probability Bar",
        description:
          "The vertical black/white evaluation bar converts Stockfish MultiPV=3 centipawn and forced-mate scores into live win-probability percentages.",
      },
      {
        badge: "↗ Threat Arrows",
        title: "Color-Coded Tactical & Hint Arrows",
        description:
          "Draws crimson/amber arrows directly on the board to trace forks, pins, and skewers, plus an optional pale-green 💡 Hint arrow showing Stockfish's best move.",
      },
      {
        badge: "↘ Move Inspector",
        title: "Interactive Move History",
        description:
          "Click any move pill in the Moves list (marked with ⚡ for tactical motifs) to inspect its exact evaluation shift, arrows, and coach explanation.",
      },
    ],
  },
  {
    id: "glicko2-rating",
    stepNumber: 4,
    tabLabel: "4. Glicko-2 Rating",
    title: "Glicko-2 Player Rating Tracker",
    subtitle:
      "Track your true skill progression locally in your browser using the official Mark Glickman Glicko-2 rating system.",
    callouts: [
      {
        badge: "↖ 1500 ± 350",
        title: "Rating (r), Deviation (RD) & Volatility (σ)",
        description:
          "Starts at 1500 ± 350. As you complete games (Checkmate, Resign, Stalemate, or Draw), your Rating Deviation (RD) narrows to reflect higher rating certainty.",
      },
      {
        badge: "↗ +18 / -14",
        title: "Animated Post-Game Rating Deltas",
        description:
          "Displays an instant green (+18 Rating) or red (-14 Rating) banner when a game finishes, weighted by the opponent Elo you faced.",
      },
      {
        badge: "↘ Auto-Match",
        title: "Match Opponent to My Rating Toggle",
        description:
          "Enable 'Match Opponent to My Rating' to automatically lock the Stockfish Elo slider to your live Glicko-2 score after every game.",
      },
    ],
  },
  {
    id: "qr-friend-passport",
    stepNumber: 5,
    tabLabel: "5. QR & Friends",
    title: "Magic Links, QR Codes & Friend Passports",
    subtitle:
      "Switch devices with zero database accounts, download date-stamped QR saves, or share a read-only Spectator Passport with friends.",
    callouts: [
      {
        badge: "↖ Save & QR",
        title: "Magic Link & Date-Stamped QR PNG",
        description:
          "Click 'Save Game' to compress your board, move list, and Glicko-2 history into a #save=... URL or download owlchess-save-YYYY-MM-DD.png.",
      },
      {
        badge: "↗ Resume Dropzone",
        title: "Instant QR Image Decoder",
        description:
          "Scan the QR code with your phone camera, or drag-and-drop a saved QR PNG into 'Resume Game' to decode and restore your session immediately.",
      },
      {
        badge: "↘ Friend Passport",
        title: "Read-Only Spectator Mode (#friend=...)",
        description:
          "Click 'Share with Friend' to generate a Friend Passport showing your rating and last 3 games. Friends can step through your games (<<, <, >, >>) without overwriting their own rating or active game.",
      },
    ],
  },
];

export function clampSlideIndex(index: number, total = HOW_TO_PLAY_SLIDES.length): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

export function nextSlideIndex(current: number, total = HOW_TO_PLAY_SLIDES.length): number {
  return clampSlideIndex(current + 1, total);
}

export function prevSlideIndex(current: number, total = HOW_TO_PLAY_SLIDES.length): number {
  return clampSlideIndex(current - 1, total);
}

export function hasSeenTutorial(storage?: Pick<Storage, "getItem">): boolean {
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return false;
  try {
    return store.getItem(TUTORIAL_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage?: Pick<Storage, "setItem">): void {
  const store =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!store) return;
  try {
    store.setItem(TUTORIAL_STORAGE_KEY, "true");
  } catch {
    // Ignore storage errors
  }
}

/** Visual Mockup Diagram for each of the 5 slides */
function SlideVisualDiagram({ slideId }: { slideId: string }) {
  if (slideId === "elo-slider") {
    return (
      <div className="relative space-y-3 rounded-2xl border border-white/15 bg-[#181424] p-4 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-300">
            ↘ Beginner (600–799)
          </span>
          <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-0.5 font-semibold text-sky-300">
            Novice (800–1099)
          </span>
          <span className="rounded-full border border-[#ee66b7]/40 bg-[#df3ca9]/20 px-2.5 py-0.5 font-semibold text-[#ff9ce0]">
            Intermediate (1100–1319)
          </span>
          <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 font-semibold text-amber-200">
            Advanced / Master (1320–3190+)
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#221d31] p-3">
          <div className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg bg-[#d8ecff] font-extrabold text-[#181424]">
            ♟
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">
                Opponent Elo · <span className="text-[#ff9ce0]">Intermediate</span>
              </span>
              <span className="font-mono font-bold text-[#ff8ad8]">1200 Elo</span>
            </div>
            <div className="h-3 w-full rounded-full border border-white/15 bg-[#161220] p-0.5">
              <div className="h-2 w-[38%] rounded-full bg-gradient-to-r from-[#df3ca9] to-[#ff73d2]" />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-neutral-400">
              <span>↖ 600 (Depth 1–2 Blended)</span>
              <span>1320 (UCI Floor)</span>
              <span>3190+ (MAX) ↗</span>
            </div>
          </div>
          <span className="rounded-full border border-white/35 px-3 py-1 text-[11px] font-bold text-white">
            MAX
          </span>
        </div>
      </div>
    );
  }

  if (slideId === "ai-coach") {
    return (
      <div className="space-y-3 rounded-2xl border border-white/15 bg-[#181424] p-4 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-[#221d31] ring-1 ring-[#ee66b7]/40">
            <span className="text-xl">🦉</span>
          </div>
          <div className="relative flex-1 rounded-xl bg-[#f5f5f8] px-3.5 py-2 text-xs font-bold text-[#181424] shadow">
            <span>7. Nxf7!! — ★ Best Move (+0.30 → +3.40)</span>
            <span className="ml-2 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
              ① Best
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          <span className="rounded-md bg-[#df3ca9]/30 px-2 py-0.5 text-[11px] font-semibold text-[#ff9ce0]">
            ② ⚡ Fork
          </span>
          <span className="rounded-md bg-[#df3ca9]/30 px-2 py-0.5 text-[11px] font-semibold text-[#ff9ce0]">
            ⚡ Zwischenzug
          </span>
          <span className="rounded-md border border-white/15 bg-[#221d31] px-2 py-0.5 text-[11px] text-neutral-200">
            ③ ECO C57 · Two Knights Defense (Morphy, 1858)
          </span>
        </div>
      </div>
    );
  }

  if (slideId === "eval-arrows") {
    return (
      <div className="flex items-center justify-center gap-4 rounded-2xl border border-white/15 bg-[#181424] p-4 shadow-inner">
        {/* Mock Eval Bar */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative flex h-28 w-6 flex-col overflow-hidden rounded-md border border-white/20 bg-[#262134]">
            <div className="h-[32%] w-full bg-[#262134]" />
            <div className="h-[68%] w-full bg-[#f5f5f8]" />
            <span className="absolute bottom-1 inset-x-0 text-center font-mono text-[9px] font-extrabold text-[#181424]">
              +1.8
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#ff9ce0]">⬅ Eval Bar</span>
        </div>

        {/* Mini Board with SVG Tactical Arrows */}
        <div className="relative h-28 w-28 overflow-hidden rounded-xl border-2 border-[#4d3d36] shadow-lg">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            <rect width="100" height="100" fill="#f3ddc2" />
            <rect x="50" y="0" width="50" height="50" fill="#896c5c" />
            <rect x="0" y="50" width="50" height="50" fill="#896c5c" />
            {/* Knight on e5 forking Queen & Rook */}
            <circle cx="50" cy="50" r="13" fill="#df3ca9" fillOpacity="0.45" />
            <text x="50" y="56" textAnchor="middle" fontSize="22" fill="#181424">
              ♘
            </text>
            <text x="20" y="25" textAnchor="middle" fontSize="20" fill="#181424">
              ♜
            </text>
            <text x="80" y="25" textAnchor="middle" fontSize="20" fill="#181424">
              ♛
            </text>
            {/* Tactical Fork Arrows */}
            <line x1="46" y1="44" x2="24" y2="24" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
            <line x1="54" y1="44" x2="76" y2="24" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
            {/* Hint Arrow */}
            <line x1="20" y1="82" x2="45" y2="56" stroke="#4ade80" strokeWidth="3.5" strokeDasharray="4 2" />
          </svg>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-rose-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="font-semibold">↗ Red/Amber: Fork &amp; Pin Rays</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="font-semibold">↘ Green: 💡 Best-Move Hint</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#ff9ce0]">
            <span className="rounded bg-[#df3ca9]/30 px-1.5 py-0.5 font-mono text-[10px]">
              Nxf7 ⚡
            </span>
            <span>Click any move to replay</span>
          </div>
        </div>
      </div>
    );
  }

  if (slideId === "glicko2-rating") {
    return (
      <div className="space-y-2.5 rounded-2xl border border-white/15 bg-[#181424] p-4 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#221d31] px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">You (White)</span>
            <span className="rounded-md bg-[#171321] px-2.5 py-0.5 font-mono text-xs font-bold text-[#ff9ce0] ring-1 ring-[#ee66b7]/40">
              ↖ 1542 ± 64
            </span>
            <span className="rounded-full bg-[#352f49] px-2 py-0.5 text-[10px] font-semibold text-neutral-200">
              Advanced
            </span>
            <span className="font-mono text-[11px] text-neutral-400">4W-1D-1L</span>
          </div>
          <span className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-0.5 font-mono text-xs font-extrabold text-emerald-300">
            ↗ +18 Rating
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[#221d31]/70 px-3.5 py-2 text-xs">
          <span className="font-medium text-neutral-200">
            ☑ ↘ Match Opponent to My Rating (Auto-syncs slider to 1542 Elo)
          </span>
          <span className="rounded bg-[#352f49] px-2 py-0.5 text-[10px] text-neutral-300">
            Reset Rating
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/15 bg-[#181424] p-4 shadow-inner sm:grid-cols-2">
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#221d31] p-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white p-1 text-[#181424]">
          <svg viewBox="0 0 36 36" className="h-12 w-12">
            <rect x="2" y="2" width="10" height="10" fill="#181424" />
            <rect x="24" y="2" width="10" height="10" fill="#181424" />
            <rect x="2" y="24" width="10" height="10" fill="#181424" />
            <rect x="15" y="15" width="6" height="6" fill="#df3ca9" />
            <rect x="24" y="24" width="8" height="8" fill="#181424" />
          </svg>
        </div>
        <div className="min-w-0 space-y-1 text-xs">
          <p className="font-bold text-white">↖ Save &amp; Resume QR</p>
          <p className="truncate font-mono text-[10px] text-[#ff9ce0]">
            owlchess-save-YYYY-MM-DD.png
          </p>
          <p className="text-[11px] text-neutral-300">Scan or drop PNG to switch devices</p>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#221d31] p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-white">↘ Friend Passport</span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            Read-Only
          </span>
        </div>
        <p className="text-[11px] text-neutral-300">
          Shares your Glicko-2 badge + last 3 games with mini replay controls (&lt;&lt; &lt; &gt; &gt;&gt;).
        </p>
        <span className="font-mono text-[10px] text-[#ff9ce0]">/#friend=...</span>
      </div>
    </div>
  );
}

interface HowToPlayModalProps {
  onClose: () => void;
  initialSlide?: number;
}

export default function HowToPlayModal({ onClose, initialSlide = 0 }: HowToPlayModalProps) {
  const [slideIdx, setSlideIdx] = useState(() => clampSlideIndex(initialSlide));

  const slide = HOW_TO_PLAY_SLIDES[slideIdx];
  const isFirst = slideIdx === 0;
  const isLast = slideIdx === HOW_TO_PLAY_SLIDES.length - 1;

  const handleClose = useCallback(() => {
    markTutorialSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "ArrowRight") {
        setSlideIdx((curr) => nextSlideIndex(curr));
      } else if (e.key === "ArrowLeft") {
        setSlideIdx((curr) => prevSlideIndex(curr));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-to-play-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-2xl space-y-5 rounded-2xl border border-white/15 bg-[#221d31]/95 p-5 text-white shadow-2xl transition-all duration-200 sm:p-6"
      >
        {/* Header + Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#ee66b7]/40 bg-[#df3ca9]/20 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#ff9ce0]">
                Step {slide.stepNumber} of {HOW_TO_PLAY_SLIDES.length}
              </span>
              <span className="text-xs font-semibold text-neutral-400">
                OWLChess Interactive Guide
              </span>
            </div>
            <h2
              id="how-to-play-title"
              className="mt-1 text-xl font-extrabold tracking-tight text-white"
            >
              {slide.title}
            </h2>
            <p className="mt-0.5 text-xs text-neutral-300">{slide.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-white/20"
            aria-label="Close guide"
          >
            ✕
          </button>
        </div>

        {/* Slide Tab Pills */}
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 pb-3" role="tablist">
          {HOW_TO_PLAY_SLIDES.map((s, idx) => {
            const active = idx === slideIdx;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSlideIdx(idx)}
                className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                  active
                    ? "bg-[#df3ca9] text-white shadow-sm"
                    : "bg-[#181424] text-neutral-300 hover:bg-[#352f49] hover:text-white"
                }`}
              >
                {s.tabLabel}
              </button>
            );
          })}
        </div>

        {/* Visual Mockup Diagram */}
        <SlideVisualDiagram slideId={slide.id} />

        {/* Annotated Callout Cards */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {slide.callouts.map((c) => (
            <div
              key={c.title}
              className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#181424]/90 p-3"
            >
              <div className="space-y-1.5">
                <span className="inline-block rounded-md bg-[#df3ca9]/25 px-2 py-0.5 font-mono text-[11px] font-bold text-[#ff9ce0]">
                  {c.badge}
                </span>
                <h3 className="text-xs font-bold text-white">{c.title}</h3>
                <p className="text-[11px] leading-relaxed text-neutral-300">{c.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: Progress Dots + Prev / Next / Got It Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          {/* Progress Dots */}
          <div className="flex items-center gap-2" aria-label="Slide progress">
            {HOW_TO_PLAY_SLIDES.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSlideIdx(idx)}
                aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                className={`h-2.5 rounded-full transition-all ${
                  idx === slideIdx
                    ? "w-6 bg-[#ee66b7]"
                    : "w-2.5 bg-white/25 hover:bg-white/45"
                }`}
              />
            ))}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSlideIdx((curr) => prevSlideIndex(curr))}
              disabled={isFirst}
              className="rounded-xl bg-[#352f49] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#433b5c] disabled:opacity-35"
            >
              ← Prev
            </button>

            {!isLast ? (
              <button
                type="button"
                onClick={() => setSlideIdx((curr) => nextSlideIndex(curr))}
                className="owlchess-btn-primary rounded-xl px-4 py-2 text-xs font-bold tracking-wide"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="owlchess-btn-primary rounded-xl px-4 py-2 text-xs font-bold tracking-wide"
              >
                Got It · Start Playing
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
