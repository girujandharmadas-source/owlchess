import { type Score, formatScore, whiteWinChance } from "@/lib/uci";

/** Vertical evaluation bar. White's share grows from the bottom (or top when flipped). */
export default function EvalBar({ score, flipped }: { score: Score | null; flipped: boolean }) {
  const white = score ? whiteWinChance(score) : 0.5;
  const label = score ? formatScore(score) : "…";
  const whiteAhead = white >= 0.5;
  return (
    <div
      className="relative w-7 shrink-0 overflow-hidden rounded border-2 border-[#49392f] bg-[#191524] shadow-lg"
      aria-label={`Evaluation ${label}`}
      title={`Evaluation ${label}`}
    >
      <div
        className="absolute left-0 right-0 bg-[#f3ddc2] transition-all duration-500 ease-out"
        style={{ height: `${white * 100}%`, [flipped ? "top" : "bottom"]: 0 }}
      />
      <span
        className={`absolute left-0 right-0 text-center font-mono text-[10px] font-bold tracking-tighter ${
          whiteAhead ? "text-[#231b16]" : "text-[#f3ddc2]"
        }`}
        style={{ [whiteAhead !== flipped ? "bottom" : "top"]: 5 }}
      >
        {label.replace("+", "")}
      </span>
    </div>
  );
}
