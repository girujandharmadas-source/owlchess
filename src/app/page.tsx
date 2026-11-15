import { HowToPlayHeaderButton } from "@/components/HowToPlayModal";
import Trainer from "@/components/Trainer";

export default function Home() {
  return (
    <main className="owlchess-stars flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          {/* Mini pink owl brand badge */}
          <span
            className="flex h-8 w-9 items-center justify-center rounded-lg bg-[#231e33] ring-1 ring-white/15"
            aria-hidden="true"
          >
            <svg viewBox="0 0 64 44" className="h-5 w-6">
              <path d="M6 14 C14 6, 26 8, 30 17 C27 29, 12 31, 7 21 Z" fill="#e040ae" />
              <path d="M58 14 C50 6, 38 8, 34 17 C37 29, 52 31, 57 21 Z" fill="#e040ae" />
              <circle cx="19" cy="20" r="6.5" fill="#181424" />
              <circle cx="19" cy="20" r="4.2" fill="#f7f7fa" />
              <circle cx="19" cy="20" r="2.2" fill="#181424" />
              <circle cx="45" cy="20" r="6.5" fill="#181424" />
              <circle cx="45" cy="20" r="4.2" fill="#f7f7fa" />
              <circle cx="45" cy="20" r="2.2" fill="#181424" />
              <path d="M30 26 L34 26 L32 33 Z" fill="#e040ae" />
            </svg>
          </span>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white">
              OWLChess <span className="font-normal text-neutral-400">· A chess bot built for your training</span>
            </h1>
            <p className="text-[11px] text-neutral-400">
              Stockfish 19 (600–3190+ Elo) · Deterministic Tactical Motifs · Lichess Masters · Sub-5s AI Coach
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <HowToPlayHeaderButton />
          <span className="rounded-full border border-[#ee66b7]/40 bg-[#df3ca9]/15 px-3 py-1 text-xs font-semibold text-[#ff9ce0]">
            Hybrid Engine + Code + LLM
          </span>
        </div>
      </header>
      <Trainer />
    </main>
  );
}
