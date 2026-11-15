"use client";

import { useState } from "react";
import type { MoveQuality } from "@/lib/classify";
import type { MotifTag } from "@/lib/motifs";
import type { MastersLookupResult } from "@/lib/openings";

export interface CoachReport {
  ply: number;
  moveNotation: string;
  quality: MoveQuality | null;
  evalBefore: string;
  evalAfter: string;
  bestMoveSan: string | null;
  continuation: string[];
  motifs: MotifTag[];
  motifDescriptions: string[];
  masters: MastersLookupResult | null;
  text: string;
  streaming: boolean;
  engineSource: string;
  latencyMs: number | null;
}

const QUALITY_BADGE: Record<MoveQuality, { label: string; cls: string }> = {
  best: { label: "★ Best Move", cls: "bg-[#df3ca9] text-white border-[#a8227b]" },
  good: { label: "✓ Solid Move", cls: "bg-[#2a233d] text-[#f3ddc2] border-[#4b3f6b]" },
  inaccuracy: { label: "?! Inaccuracy", cls: "bg-amber-500/20 text-amber-800 border-amber-500/40" },
  mistake: { label: "? Mistake", cls: "bg-orange-500/20 text-orange-800 border-orange-500/40" },
  blunder: { label: "?? Blunder", cls: "bg-rose-600 text-white border-rose-700" },
};

const MOTIF_BADGE_STYLE: Record<string, string> = {
  Zwischenzug: "bg-[#df3ca9]/20 text-[#ff8ad8] border-[#df3ca9]/50",
  Fork: "bg-rose-500/20 text-rose-200 border-rose-400/50",
  Pin: "bg-amber-500/20 text-amber-200 border-amber-400/50",
  Skewer: "bg-amber-500/20 text-amber-200 border-amber-400/50",
  "Discovered Check": "bg-red-500/20 text-red-200 border-red-400/50",
  "Discovered Attack": "bg-indigo-500/20 text-indigo-200 border-indigo-400/50",
  "Hanging Piece": "bg-rose-500/20 text-rose-300 border-rose-500/40",
  "Captures Hanging Piece": "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
};

/** Signature pink/magenta owl eyes avatar inspired by the screenshot */
function OwlAvatar() {
  return (
    <div
      className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-[#201b2e] shadow-inner ring-1 ring-white/10"
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 44" className="h-8 w-10">
        {/* Left & Right Magenta Brow/Eye Rings */}
        <path
          d="M6 14 C14 6, 26 8, 30 17 C27 29, 12 31, 7 21 Z"
          fill="#e040ae"
        />
        <path
          d="M58 14 C50 6, 38 8, 34 17 C37 29, 52 31, 57 21 Z"
          fill="#e040ae"
        />
        {/* Left Eye */}
        <circle cx="19" cy="20" r="7.5" fill="#181424" />
        <circle cx="19" cy="20" r="5" fill="#f7f7fa" />
        <circle cx="19" cy="20" r="2.7" fill="#181424" />
        <circle cx="20.5" cy="18.5" r="1" fill="#ffffff" />
        {/* Right Eye */}
        <circle cx="45" cy="20" r="7.5" fill="#181424" />
        <circle cx="45" cy="20" r="5" fill="#f7f7fa" />
        <circle cx="45" cy="20" r="2.7" fill="#181424" />
        <circle cx="46.5" cy="18.5" r="1" fill="#ffffff" />
        {/* Beak */}
        <path d="M30 26 L34 26 L32 33 Z" fill="#e040ae" />
      </svg>
    </div>
  );
}

/** Render simple inline bold/italic/code markdown safely without external deps. */
function renderFormattedLine(line: string) {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-[#181424]">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-[#262038] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#ff8ad8]">
          {tok.slice(1, -1)}
        </code>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*")) {
      return (
        <em key={i} className="italic text-[#352d4d]">
          {tok.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{tok}</span>;
  });
}

export default function CoachCard({
  report,
  statusText,
  showMotifArrows,
  onToggleMotifArrows,
  apiKey,
  onChangeApiKey,
}: {
  report: CoachReport | null;
  statusText?: string;
  showMotifArrows: boolean;
  onToggleMotifArrows: (v: boolean) => void;
  apiKey: string;
  onChangeApiKey: (k: string) => void;
}) {
  const [showKeyInput, setShowKeyInput] = useState(false);

  return (
    <section className="space-y-3.5">
      {/* Section Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-white">AI Coach challenge</h2>
          {report?.latencyMs != null && (
            <span
              className="rounded-full bg-[#df3ca9]/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#ff8ad8] ring-1 ring-[#df3ca9]/40"
              title="Total pipeline time (Stockfish + Motifs + Lichess Masters + Coach stream)"
            >
              {(report.latencyMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5 text-neutral-300">
            <input
              type="checkbox"
              checked={showMotifArrows}
              onChange={(e) => onToggleMotifArrows(e.target.checked)}
              className="accent-[#df3ca9]"
            />
            Tactic arrows
          </label>
          <button
            type="button"
            onClick={() => setShowKeyInput((v) => !v)}
            className="rounded-full border border-white/25 bg-[#241e34] px-2.5 py-0.5 text-[11px] font-semibold text-neutral-200 transition hover:border-white/50 hover:bg-[#2f2844]"
            title="Configure optional Gemini API key for live Gemini 3.5 Flash-Lite streaming"
          >
            {apiKey ? "Gemini Key ✓" : "API Key"}
          </button>
        </div>
      </div>

      {showKeyInput && (
        <div className="space-y-1.5 rounded-xl border border-white/10 bg-[#191524] p-3 text-xs shadow-inner">
          <label className="block text-neutral-300">
            Gemini API Key (streams via <code className="font-mono text-[#ff8ad8]">gemini-3.5-flash-lite</code>; leave blank for built-in grounded coach):
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onChangeApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full rounded-lg border border-white/15 bg-[#241e34] px-2.5 py-1.5 font-mono text-xs text-white focus:border-[#df3ca9] focus:outline-none"
          />
        </div>
      )}

      {/* Owl Mascot + Crisp White Speech Bubble (exact layout from screenshot 4) */}
      <div className="flex items-start gap-3">
        <OwlAvatar />
        <div className="owlchess-speech-bubble min-w-0 flex-1 rounded-xl bg-[#f7f7fa] px-4 py-3 text-[#181424] shadow-[0_8px_24px_rgba(8,6,15,0.45)]">
          {!report ? (
            <p className="text-sm font-semibold text-[#181424]" aria-live="polite">
              {statusText || "Waiting for your move..."}
            </p>
          ) : (
            <div className="space-y-2">
              {/* Move Header + Classification Badge + Eval Shift */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-black/10 pb-2">
                <span className="rounded-md bg-[#181424] px-2 py-0.5 font-mono text-xs font-bold text-white">
                  {report.moveNotation}
                </span>
                {report.quality && (
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${QUALITY_BADGE[report.quality].cls}`}
                  >
                    {QUALITY_BADGE[report.quality].label}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs font-semibold text-[#483f61]">
                  {report.evalBefore} → <strong className="text-[#181424]">{report.evalAfter}</strong>
                </span>
              </div>

              {/* Streamed 3-Part Coach Explanation inside the speech bubble */}
              <div className="space-y-1.5 text-xs leading-relaxed text-[#251f36]">
                {report.text ? (
                  report.text
                    .split(/\n\n+/)
                    .map((para, idx) => <p key={idx}>{renderFormattedLine(para)}</p>)
                ) : (
                  <p className="animate-pulse font-medium text-[#5c5278]">Synthesizing coaching explanation…</p>
                )}
                {report.streaming && (
                  <span className="inline-block h-3 w-1.5 animate-pulse bg-[#df3ca9] align-middle" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detected Tactical Motif Pills */}
      {report && report.motifs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-14" aria-label="Detected tactical motifs">
          {report.motifs.map((m) => (
            <span
              key={m}
              className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ${
                MOTIF_BADGE_STYLE[m] ?? "border-white/15 bg-[#352f49] text-neutral-100"
              }`}
            >
              ⚡ {m}
            </span>
          ))}
        </div>
      )}

      {/* Opening & Historical Master Games Box */}
      {report && (report.masters?.openingName || (report.masters?.topGames.length ?? 0) > 0) && (
        <div className="rounded-xl border border-white/10 bg-[#231e33]/90 p-3 text-xs shadow-md">
          {report.masters?.openingName && (
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md bg-[#352f49] px-2 py-0.5 font-semibold text-[#f3ddc2]">
                📖 {report.masters.eco ? `${report.masters.eco} · ` : ""}
                {report.masters.openingName}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {report.masters.source === "lichess" ? "Lichess Masters" : "Master Book"}
              </span>
            </div>
          )}
          {report.masters && report.masters.topGames.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] text-neutral-300">
              {report.masters.topGames.slice(0, 3).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 truncate">
                  <span className="truncate">
                    <strong className="text-white">{g.white}</strong>
                    {g.whiteRating ? ` (${g.whiteRating})` : ""} vs.{" "}
                    <strong className="text-white">{g.black}</strong>
                    {g.blackRating ? ` (${g.blackRating})` : ""}
                  </span>
                  <span className="shrink-0 rounded bg-[#181424] px-1.5 py-0.5 font-mono text-[10px] text-[#ff8ad8]">
                    {g.year || ""} · {g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "½-½"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
